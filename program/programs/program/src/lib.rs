//! LOCK N ROLL v1 — Streamflow Vesting OTC marketplace.
//!
//! 7 instructions:
//!   create_listing, submit_bid, buy_now, accept_bid,
//!   withdraw_bid, cancel_listing, claim_expired
//!
//! Streamflow recipient 권리만 거래. 락업된 토큰 자체는 Streamflow가 보관.
//! v1 범위: classic SPL Token mint만 (Token-2022 거부).
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    hash::hash,
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

declare_id!("58cA8UATTBpWDcv4HgddYVy1TLhKXs2EWYSqEbzR5pnp");

/// Streamflow program ID — devnet/mainnet 분기.
#[cfg(feature = "mainnet")]
pub const STREAMFLOW_PROGRAM_ID: Pubkey =
    anchor_lang::solana_program::pubkey!("strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m");
#[cfg(not(feature = "mainnet"))]
pub const STREAMFLOW_PROGRAM_ID: Pubkey =
    anchor_lang::solana_program::pubkey!("HqDGZjaVRXJ9MGRQEw7qDc2rAr6iH1n1kAQdCZaCMfMZ");

/// Streamflow Contract instruction discriminator (sha256("global:transfer_recipient")[..8])
/// — spike B0에서 검증된 형식. + args = 10 zero bytes (Streamflow ix padding).
const TRANSFER_RECIPIENT_ARGS_PADDING: usize = 10;

const FEE_DENOMINATOR: u64 = 10_000;

#[program]
pub mod lock_n_roll {
    use super::*;

    pub fn init_config(
        ctx: Context<InitConfig>,
        usdc_mint: Pubkey,
        fee_recipient: Pubkey,
        fee_bps: u16,
        expected_streamflow_version: u8,
    ) -> Result<()> {
        require!((fee_bps as u64) <= FEE_DENOMINATOR, OtcError::InvalidFeeBps);
        let cfg = &mut ctx.accounts.config;
        cfg.authority = ctx.accounts.authority.key();
        cfg.usdc_mint = usdc_mint;
        cfg.fee_recipient = fee_recipient;
        cfg.fee_bps = fee_bps;
        cfg.expected_streamflow_version = expected_streamflow_version;
        cfg.bump = ctx.bumps.config;
        Ok(())
    }

    /// 거버넌스가 일부 필드를 갱신.
    /// ⚠️ `new_usdc_mint`는 매우 신중. 변경 시 기존 OPEN bid의 vault USDC와 mint 불일치 가능.
    /// 운영 시 모든 OPEN bid가 환불 완료된 상태에서만 변경 권장.
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_authority: Option<Pubkey>,
        new_fee_recipient: Option<Pubkey>,
        new_fee_bps: Option<u16>,
        new_expected_streamflow_version: Option<u8>,
        new_usdc_mint: Option<Pubkey>,
    ) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        if let Some(a) = new_authority {
            cfg.authority = a;
        }
        if let Some(r) = new_fee_recipient {
            cfg.fee_recipient = r;
        }
        if let Some(b) = new_fee_bps {
            require!((b as u64) <= FEE_DENOMINATOR, OtcError::InvalidFeeBps);
            cfg.fee_bps = b;
        }
        if let Some(v) = new_expected_streamflow_version {
            cfg.expected_streamflow_version = v;
        }
        if let Some(m) = new_usdc_mint {
            cfg.usdc_mint = m;
            let clk = Clock::get()?;
            emit!(ConfigUsdcMintChanged {
                old_mint: cfg.usdc_mint,
                new_mint: m,
                slot: clk.slot,
                block_timestamp: clk.unix_timestamp,
            });
        }
        Ok(())
    }

    /// Maker가 자기 Streamflow vesting을 listing으로 등록.
    /// Streamflow recipient: maker → listing_pda 로 이전 (maker 서명).
    pub fn create_listing(
        ctx: Context<CreateListing>,
        nonce: u64,
        asking_price_micro_usdc: Option<u64>,
        expires_at: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;

        // Streamflow contract 디코드 + eligibility 가드
        let contract = decode_streamflow_contract(&ctx.accounts.streamflow_metadata)?;
        validate_streamflow_metadata_owner(&ctx.accounts.streamflow_metadata)?;
        validate_structural_guards(
            &contract,
            ctx.accounts.config.expected_streamflow_version,
            ctx.accounts.token_mint.key(),
            ctx.accounts.maker.key(),
        )?;
        validate_tradable_contracts_requirements(&contract.ix)?;
        validate_marketplace_policy(&contract.ix)?;

        // classic SPL Token mint만 허용
        require!(
            *ctx.accounts.token_mint.to_account_info().owner == token::ID,
            OtcError::TokenProgramNotSupported
        );

        // 만료 시각 범위: now + 1h <= expires_at <= unlock_at
        let unlock_at = contract.end_time as i64;
        require!(
            expires_at >= now + 3600 && expires_at <= unlock_at,
            OtcError::ExpiresAtOutOfRange
        );
        if let Some(p) = asking_price_micro_usdc {
            require!(p > 0, OtcError::InvalidAmount);
        }

        // Listing PDA 초기화 (mut borrow을 블록으로 격리)
        let vesting_amount_raw = contract
            .ix
            .net_amount_deposited
            .saturating_sub(contract.amount_withdrawn);
        {
            let listing = &mut ctx.accounts.listing;
            listing.maker = ctx.accounts.maker.key();
            listing.streamflow_metadata = ctx.accounts.streamflow_metadata.key();
            listing.token_mint = ctx.accounts.token_mint.key();
            listing.token_decimals = ctx.accounts.token_mint.decimals;
            listing.vesting_amount_raw = vesting_amount_raw;
            listing.unlock_at = unlock_at;
            listing.asking_price_micro_usdc = asking_price_micro_usdc;
            listing.expires_at = expires_at;
            listing.status = ListingStatus::Listed;
            listing.bid_count = 0;
            listing.nonce = nonce;
            listing.bump = ctx.bumps.listing;
        }

        // Streamflow recipient: maker → listing_pda (maker 서명)
        invoke_streamflow_transfer(
            &ctx.accounts.maker.to_account_info(),
            &ctx.accounts.listing.to_account_info(),
            &ctx.accounts.listing_token_ata.to_account_info(),
            &ctx.accounts.streamflow_metadata,
            &ctx.accounts.token_mint.to_account_info(),
            &ctx.accounts.rent.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.associated_token_program.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &ctx.accounts.streamflow_program,
            None,
        )?;

        let listing = &ctx.accounts.listing;
        let clk = Clock::get()?;
        emit!(ListingCreated {
            listing: listing.key(),
            maker: listing.maker,
            streamflow_metadata: listing.streamflow_metadata,
            token_mint: listing.token_mint,
            token_decimals: listing.token_decimals,
            vesting_amount_raw: listing.vesting_amount_raw,
            asking_price_micro_usdc,
            expires_at,
            slot: clk.slot,
            block_timestamp: clk.unix_timestamp,
        });
        Ok(())
    }

    /// Bidder가 USDC를 vault에 잠그고 가격 제안.
    /// 사전조건: listing이 LISTED 상태 + 만료 전.
    /// total_usdc_raw는 클라이언트가 사전 계산한 값 — program 산출값과 일치해야 통과.
    pub fn submit_bid(
        ctx: Context<SubmitBid>,
        price_per_token_micro_usdc: u64,
        total_usdc_raw: u64,
    ) -> Result<()> {
        let listing = &ctx.accounts.listing;
        require!(listing.status == ListingStatus::Listed, OtcError::InvalidStatus);
        let now = Clock::get()?.unix_timestamp;
        require!(now < listing.expires_at, OtcError::Expired);
        require!(
            ctx.accounts.bidder.key() != listing.maker,
            OtcError::BidderIsMaker
        );
        require!(price_per_token_micro_usdc > 0, OtcError::InvalidAmount);

        let expected_total = compute_total_usdc(
            price_per_token_micro_usdc,
            listing.vesting_amount_raw,
            listing.token_decimals,
        )?;
        require!(
            total_usdc_raw == expected_total,
            OtcError::BidTotalMismatch
        );

        let bid = &mut ctx.accounts.bid;
        bid.listing = listing.key();
        bid.bidder = ctx.accounts.bidder.key();
        bid.price_per_token_micro_usdc = price_per_token_micro_usdc;
        bid.total_usdc_raw = total_usdc_raw;
        bid.status = BidStatus::Open;
        bid.bump = ctx.bumps.bid;

        // bidder USDC → vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.bidder_usdc_account.to_account_info(),
                    to: ctx.accounts.bid_vault.to_account_info(),
                    authority: ctx.accounts.bidder.to_account_info(),
                },
            ),
            total_usdc_raw,
        )?;

        // listing.bid_count++
        let listing_mut = &mut ctx.accounts.listing;
        listing_mut.bid_count = listing_mut.bid_count.saturating_add(1);

        let clk = Clock::get()?;
        emit!(BidSubmitted {
            bid: bid.key(),
            listing: listing_mut.key(),
            bidder: bid.bidder,
            price_per_token_micro_usdc,
            total_usdc_raw,
            slot: clk.slot,
            block_timestamp: clk.unix_timestamp,
        });
        Ok(())
    }

    /// Taker가 asking 가격으로 즉시 매수.
    /// USDC: taker → maker 직송. Streamflow recipient: listing_pda → taker (PDA signed).
    /// listing_token_ata 잔량은 taker로 sweep + ATA close.
    /// 사전조건: listing이 LISTED + 만료 전 + asking 가격 설정됨 + taker != maker.
    pub fn buy_now(ctx: Context<BuyNow>) -> Result<()> {
        let listing = &ctx.accounts.listing;
        require!(listing.status == ListingStatus::Listed, OtcError::InvalidStatus);
        let now = Clock::get()?.unix_timestamp;
        require!(now < listing.expires_at, OtcError::Expired);
        require!(
            ctx.accounts.taker.key() != listing.maker,
            OtcError::BidderIsMaker
        );

        let asking = listing.asking_price_micro_usdc.ok_or(OtcError::AskingNotSet)?;
        let total = compute_total_usdc(asking, listing.vesting_amount_raw, listing.token_decimals)?;

        // Streamflow contract 구조적 가드
        let contract = decode_streamflow_contract(&ctx.accounts.streamflow_metadata)?;
        validate_streamflow_metadata_owner(&ctx.accounts.streamflow_metadata)?;
        validate_structural_guards(
            &contract,
            ctx.accounts.config.expected_streamflow_version,
            listing.token_mint,
            listing.key(),
        )?;

        // taker USDC → maker (asking 가격 그대로)
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.taker_usdc_account.to_account_info(),
                    to: ctx.accounts.maker_usdc_account.to_account_info(),
                    authority: ctx.accounts.taker.to_account_info(),
                },
            ),
            total,
        )?;

        // 프로토콜 수수료
        let fee = compute_fee_ceil(total, ctx.accounts.config.fee_bps)?;
        if fee > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.taker_usdc_account.to_account_info(),
                        to: ctx.accounts.fee_recipient_usdc_account.to_account_info(),
                        authority: ctx.accounts.taker.to_account_info(),
                    },
                ),
                fee,
            )?;
        }

        // Streamflow recipient: listing_pda → taker (PDA 서명)
        let signer_seeds = listing_signer_seeds(
            listing.maker,
            listing.streamflow_metadata,
            listing.nonce,
            listing.bump,
        );
        invoke_streamflow_transfer(
            &ctx.accounts.listing.to_account_info(),
            &ctx.accounts.taker.to_account_info(),
            &ctx.accounts.taker_token_ata.to_account_info(),
            &ctx.accounts.streamflow_metadata,
            &ctx.accounts.token_mint.to_account_info(),
            &ctx.accounts.rent.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.associated_token_program.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &ctx.accounts.streamflow_program,
            Some(signer_seeds.as_slice()),
        )?;

        // listing_token_ata 잔량 sweep → taker_token_ata + ATA close (rent → maker)
        let swept = sweep_listing_token_ata(
            &ctx.accounts.listing_token_ata,
            &ctx.accounts.taker_token_ata.to_account_info(),
            &ctx.accounts.listing.to_account_info(),
            &ctx.accounts.maker,
            &ctx.accounts.token_program.to_account_info(),
            signer_seeds.as_slice(),
        )?;

        let listing_mut = &mut ctx.accounts.listing;
        listing_mut.status = ListingStatus::Settled;

        let clk = Clock::get()?;
        emit!(OrderTaken {
            listing: listing_mut.key(),
            streamflow_metadata: listing_mut.streamflow_metadata,
            maker: listing_mut.maker,
            taker: ctx.accounts.taker.key(),
            token_mint: listing_mut.token_mint,
            vesting_amount_raw: listing_mut.vesting_amount_raw,
            price_per_token_micro_usdc: asking,
            total_usdc_raw: total,
            fee,
            mode: SettlementMode::Asking,
            accepted_bid: None,
            swept_token_amount: swept,
            slot: clk.slot,
            block_timestamp: clk.unix_timestamp,
        });
        Ok(())
    }

    /// Maker가 OPEN bid를 수락. vault USDC → maker, recipient → bidder, sweep → bidder.
    pub fn accept_bid(ctx: Context<AcceptBid>) -> Result<()> {
        let listing = &ctx.accounts.listing;
        let bid = &ctx.accounts.bid;
        require!(listing.status == ListingStatus::Listed, OtcError::InvalidStatus);
        require!(bid.status == BidStatus::Open, OtcError::InvalidBidStatus);
        require!(bid.listing == listing.key(), OtcError::BidPdaMismatch);

        let contract = decode_streamflow_contract(&ctx.accounts.streamflow_metadata)?;
        validate_streamflow_metadata_owner(&ctx.accounts.streamflow_metadata)?;
        validate_structural_guards(
            &contract,
            ctx.accounts.config.expected_streamflow_version,
            listing.token_mint,
            listing.key(),
        )?;

        let total = bid.total_usdc_raw;
        let bid_key = bid.key();
        let bid_bump = bid.bump;
        let bidder_key = bid.bidder;
        let bid_seeds = bid_signer_seeds(listing.key(), bidder_key, bid_bump);

        // vault 잔량 검증 (spec §3.4 accept_bid)
        require!(
            ctx.accounts.bid_vault.amount == total,
            OtcError::UsdcAmountMismatch
        );

        // 매도자 부담 모델: vault에서 fee 분리, maker는 (total - fee)만 수령.
        let fee = compute_fee_ceil(total, ctx.accounts.config.fee_bps)?;
        let to_maker = total
            .checked_sub(fee)
            .ok_or(OtcError::NumericOverflow)?;

        // vault → maker (total - fee)
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.bid_vault.to_account_info(),
                    to: ctx.accounts.maker_usdc_account.to_account_info(),
                    authority: ctx.accounts.bid.to_account_info(),
                },
                &[seed_refs(&bid_seeds).as_slice()],
            ),
            to_maker,
        )?;

        // vault → fee_recipient (fee)
        if fee > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.bid_vault.to_account_info(),
                        to: ctx.accounts.fee_recipient_usdc_account.to_account_info(),
                        authority: ctx.accounts.bid.to_account_info(),
                    },
                    &[seed_refs(&bid_seeds).as_slice()],
                ),
                fee,
            )?;
        }

        // vault close (rent → bidder, vault 자체 rent는 bidder가 submit_bid에서 냈음)
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.bid_vault.to_account_info(),
                destination: ctx.accounts.bidder.to_account_info(),
                authority: ctx.accounts.bid.to_account_info(),
            },
            &[seed_refs(&bid_seeds).as_slice()],
        ))?;

        // Streamflow recipient: listing_pda → bidder (PDA 서명)
        let listing_seeds = listing_signer_seeds(
            listing.maker,
            listing.streamflow_metadata,
            listing.nonce,
            listing.bump,
        );
        invoke_streamflow_transfer(
            &ctx.accounts.listing.to_account_info(),
            &ctx.accounts.bidder.to_account_info(),
            &ctx.accounts.bidder_token_ata.to_account_info(),
            &ctx.accounts.streamflow_metadata,
            &ctx.accounts.token_mint.to_account_info(),
            &ctx.accounts.rent.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.associated_token_program.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &ctx.accounts.streamflow_program,
            Some(listing_seeds.as_slice()),
        )?;

        // listing_token_ata 잔량 sweep → bidder_token_ata + ATA close (rent → maker)
        let maker_info = ctx.accounts.maker.to_account_info();
        let swept = sweep_listing_token_ata(
            &ctx.accounts.listing_token_ata,
            &ctx.accounts.bidder_token_ata.to_account_info(),
            &ctx.accounts.listing.to_account_info(),
            &maker_info,
            &ctx.accounts.token_program.to_account_info(),
            listing_seeds.as_slice(),
        )?;

        let bid_mut = &mut ctx.accounts.bid;
        bid_mut.status = BidStatus::Accepted;
        let listing_mut = &mut ctx.accounts.listing;
        listing_mut.status = ListingStatus::Settled;

        let clk = Clock::get()?;
        emit!(OrderTaken {
            listing: listing_mut.key(),
            streamflow_metadata: listing_mut.streamflow_metadata,
            maker: listing_mut.maker,
            taker: bidder_key,
            token_mint: listing_mut.token_mint,
            vesting_amount_raw: listing_mut.vesting_amount_raw,
            price_per_token_micro_usdc: bid_mut.price_per_token_micro_usdc,
            total_usdc_raw: total,
            fee,
            mode: SettlementMode::Bid,
            accepted_bid: Some(bid_key),
            swept_token_amount: swept,
            slot: clk.slot,
            block_timestamp: clk.unix_timestamp,
        });
        Ok(())
    }

    /// Bidder가 자기 OPEN bid를 환불받는다. 어떤 listing 상태에서도 동작.
    pub fn withdraw_bid(ctx: Context<WithdrawBid>) -> Result<()> {
        let bid = &ctx.accounts.bid;
        require!(bid.status == BidStatus::Open, OtcError::InvalidBidStatus);

        let total = bid.total_usdc_raw;
        let listing_key = bid.listing;
        let bidder_key = bid.bidder;
        let bid_bump = bid.bump;
        let bid_seeds = bid_signer_seeds(listing_key, bidder_key, bid_bump);

        // vault 잔량 검증
        require!(
            ctx.accounts.bid_vault.amount == total,
            OtcError::UsdcAmountMismatch
        );

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.bid_vault.to_account_info(),
                    to: ctx.accounts.bidder_usdc_account.to_account_info(),
                    authority: ctx.accounts.bid.to_account_info(),
                },
                &[seed_refs(&bid_seeds).as_slice()],
            ),
            total,
        )?;

        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.bid_vault.to_account_info(),
                destination: ctx.accounts.bidder.to_account_info(),
                authority: ctx.accounts.bid.to_account_info(),
            },
            &[seed_refs(&bid_seeds).as_slice()],
        ))?;

        // listing이 LISTED면 bid_count--
        if let Some(listing) = ctx.accounts.listing.as_mut() {
            if listing.status == ListingStatus::Listed {
                listing.bid_count = listing.bid_count.saturating_sub(1);
            }
        }

        let bid_mut = &mut ctx.accounts.bid;
        bid_mut.status = BidStatus::Withdrawn;
        let bid_pda = bid_mut.key();

        let clk = Clock::get()?;
        emit!(BidWithdrawn {
            bid: bid_pda,
            listing: listing_key,
            bidder: bidder_key,
            total_usdc_raw: total,
            slot: clk.slot,
            block_timestamp: clk.unix_timestamp,
        });
        Ok(())
    }

    /// Maker가 listing 취소. recipient → maker 환원, sweep → maker.
    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        let listing = &ctx.accounts.listing;
        require!(listing.status == ListingStatus::Listed, OtcError::InvalidStatus);

        let contract = decode_streamflow_contract(&ctx.accounts.streamflow_metadata)?;
        validate_streamflow_metadata_owner(&ctx.accounts.streamflow_metadata)?;
        validate_structural_guards(
            &contract,
            ctx.accounts.config.expected_streamflow_version,
            listing.token_mint,
            listing.key(),
        )?;

        let signer_seeds = listing_signer_seeds(
            listing.maker,
            listing.streamflow_metadata,
            listing.nonce,
            listing.bump,
        );

        invoke_streamflow_transfer(
            &ctx.accounts.listing.to_account_info(),
            &ctx.accounts.maker.to_account_info(),
            &ctx.accounts.maker_token_ata.to_account_info(),
            &ctx.accounts.streamflow_metadata,
            &ctx.accounts.token_mint.to_account_info(),
            &ctx.accounts.rent.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.associated_token_program.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &ctx.accounts.streamflow_program,
            Some(signer_seeds.as_slice()),
        )?;

        // cancel_listing: maker가 Signer. ATA close rent도 maker에게.
        let maker_info = ctx.accounts.maker.to_account_info();
        let swept = sweep_listing_token_ata(
            &ctx.accounts.listing_token_ata,
            &ctx.accounts.maker_token_ata.to_account_info(),
            &ctx.accounts.listing.to_account_info(),
            &maker_info,
            &ctx.accounts.token_program.to_account_info(),
            signer_seeds.as_slice(),
        )?;

        let listing_mut = &mut ctx.accounts.listing;
        listing_mut.status = ListingStatus::Cancelled;

        let clk = Clock::get()?;
        emit!(ListingCancelled {
            listing: listing_mut.key(),
            maker: listing_mut.maker,
            streamflow_metadata: listing_mut.streamflow_metadata,
            swept_token_amount: swept,
            slot: clk.slot,
            block_timestamp: clk.unix_timestamp,
        });
        Ok(())
    }

    /// 만료된 listing을 누구나 호출 가능. recipient → maker 환원.
    pub fn claim_expired(ctx: Context<ClaimExpired>) -> Result<()> {
        let listing = &ctx.accounts.listing;
        require!(listing.status == ListingStatus::Listed, OtcError::InvalidStatus);
        let now = Clock::get()?.unix_timestamp;
        require!(now >= listing.expires_at, OtcError::NotExpiredYet);

        let contract = decode_streamflow_contract(&ctx.accounts.streamflow_metadata)?;
        validate_streamflow_metadata_owner(&ctx.accounts.streamflow_metadata)?;
        validate_structural_guards(
            &contract,
            ctx.accounts.config.expected_streamflow_version,
            listing.token_mint,
            listing.key(),
        )?;

        let signer_seeds = listing_signer_seeds(
            listing.maker,
            listing.streamflow_metadata,
            listing.nonce,
            listing.bump,
        );

        invoke_streamflow_transfer(
            &ctx.accounts.listing.to_account_info(),
            &ctx.accounts.maker.to_account_info(),
            &ctx.accounts.maker_token_ata.to_account_info(),
            &ctx.accounts.streamflow_metadata,
            &ctx.accounts.token_mint.to_account_info(),
            &ctx.accounts.rent.to_account_info(),
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.associated_token_program.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &ctx.accounts.streamflow_program,
            Some(signer_seeds.as_slice()),
        )?;

        // claim_expired: maker가 Signer 아님. AccountInfo 그대로 rent 환수처.
        let swept = sweep_listing_token_ata(
            &ctx.accounts.listing_token_ata,
            &ctx.accounts.maker_token_ata.to_account_info(),
            &ctx.accounts.listing.to_account_info(),
            &ctx.accounts.maker,
            &ctx.accounts.token_program.to_account_info(),
            signer_seeds.as_slice(),
        )?;

        let listing_mut = &mut ctx.accounts.listing;
        listing_mut.status = ListingStatus::Expired;

        let clk = Clock::get()?;
        emit!(ListingExpired {
            listing: listing_mut.key(),
            maker: listing_mut.maker,
            streamflow_metadata: listing_mut.streamflow_metadata,
            swept_token_amount: swept,
            slot: clk.slot,
            block_timestamp: clk.unix_timestamp,
        });
        Ok(())
    }
}

// ── Streamflow CPI ───────────────────────────────────────────────

/// Streamflow `transfer_recipient` CPI. authority가 wallet이면 signer_seeds=None,
/// PDA면 Some(seeds). spike B0에서 검증된 instruction layout 사용.
#[allow(clippy::too_many_arguments)]
fn invoke_streamflow_transfer<'info>(
    authority: &AccountInfo<'info>,
    new_recipient: &AccountInfo<'info>,
    new_recipient_tokens: &AccountInfo<'info>,
    metadata: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    rent: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    associated_token_program: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    streamflow_program: &AccountInfo<'info>,
    signer_seeds: Option<&[Vec<u8>]>,
) -> Result<()> {
    require!(
        streamflow_program.key() == STREAMFLOW_PROGRAM_ID,
        OtcError::InvalidStreamflowProgram
    );

    let mut data = hash(b"global:transfer_recipient").to_bytes()[..8].to_vec();
    data.extend_from_slice(&[0u8; TRANSFER_RECIPIENT_ARGS_PADDING]);

    let ix = Instruction {
        program_id: STREAMFLOW_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(authority.key(), true),
            AccountMeta::new(new_recipient.key(), false),
            AccountMeta::new(new_recipient_tokens.key(), false),
            AccountMeta::new(metadata.key(), false),
            AccountMeta::new_readonly(mint.key(), false),
            AccountMeta::new_readonly(rent.key(), false),
            AccountMeta::new_readonly(token_program.key(), false),
            AccountMeta::new_readonly(associated_token_program.key(), false),
            AccountMeta::new_readonly(system_program.key(), false),
        ],
        data,
    };

    let infos = [
        authority.clone(),
        new_recipient.clone(),
        new_recipient_tokens.clone(),
        metadata.clone(),
        mint.clone(),
        rent.clone(),
        token_program.clone(),
        associated_token_program.clone(),
        system_program.clone(),
        streamflow_program.clone(),
    ];

    match signer_seeds {
        Some(seeds) => {
            let seed_refs: Vec<&[u8]> = seeds.iter().map(|v| v.as_slice()).collect();
            invoke_signed(&ix, &infos, &[seed_refs.as_slice()])?
        }
        None => invoke_signed(&ix, &infos, &[])?,
    }
    Ok(())
}

// ── Streamflow Contract decode (partial) ─────────────────────────

/// Streamflow Contract 헤더 + ix.permissions 만 partial decode. trailing 필드는 무시.
/// streamflow-sdk 0.13.0 layout을 직접 mirroring. anchor try_from_slice_unchecked 사용.
#[derive(AnchorDeserialize, Debug)]
pub struct StreamflowContractHeader {
    pub magic: u64,
    pub version: u8,
    pub created_at: u64,
    pub amount_withdrawn: u64,
    pub canceled_at: u64,
    pub end_time: u64,
    pub last_withdrawn_at: u64,
    pub sender: Pubkey,
    pub sender_tokens: Pubkey,
    pub recipient: Pubkey,
    pub recipient_tokens: Pubkey,
    pub mint: Pubkey,
    pub escrow_tokens: Pubkey,
    pub streamflow_treasury: Pubkey,
    pub streamflow_treasury_tokens: Pubkey,
    pub streamflow_fee_total: u64,
    pub streamflow_fee_withdrawn: u64,
    pub streamflow_fee_percent: f32,
    pub partner: Pubkey,
    pub partner_tokens: Pubkey,
    pub partner_fee_total: u64,
    pub partner_fee_withdrawn: u64,
    pub partner_fee_percent: f32,
    pub ix: StreamflowCreateParams,
    // 이후 필드 (ix_padding: Vec<u8>, closed: bool, ...) 는 무시
}

#[derive(AnchorDeserialize, Debug)]
pub struct StreamflowCreateParams {
    pub start_time: u64,
    pub net_amount_deposited: u64,
    pub period: u64,
    pub amount_per_period: u64,
    pub cliff: u64,
    pub cliff_amount: u64,
    pub cancelable_by_sender: bool,
    pub cancelable_by_recipient: bool,
    pub automatic_withdrawal: bool,
    pub transferable_by_sender: bool,
    pub transferable_by_recipient: bool,
    pub can_topup: bool,
    pub stream_name: [u8; 64],
    pub withdraw_frequency: u64,
}

fn decode_streamflow_contract(metadata: &AccountInfo) -> Result<StreamflowContractHeader> {
    let data = metadata
        .try_borrow_data()
        .map_err(|_| error!(OtcError::InvalidStreamMetadata))?;
    // 최소 사이즈 가드 — 535 bytes 가 우리 layout 끝 (Phase 1 검증)
    require!(data.len() >= 535, OtcError::InvalidStreamMetadata);
    StreamflowContractHeader::deserialize(&mut &data[..])
        .map_err(|_| error!(OtcError::InvalidStreamMetadata))
}

fn validate_streamflow_metadata_owner(metadata: &AccountInfo) -> Result<()> {
    require!(
        *metadata.owner == STREAMFLOW_PROGRAM_ID,
        OtcError::InvalidStreamMetadata
    );
    Ok(())
}

/// 모든 CPI-touching 인스트럭션이 매번 재검증해야 하는 가드 (spec §2.3.3).
fn validate_structural_guards(
    c: &StreamflowContractHeader,
    expected_version: u8,
    expected_mint: Pubkey,
    expected_recipient: Pubkey,
) -> Result<()> {
    require!(
        c.version == expected_version,
        OtcError::StreamflowVersionMismatch
    );
    require!(c.mint == expected_mint, OtcError::InvalidStreamMetadata);
    require_keys_eq!(c.recipient, expected_recipient, OtcError::RecipientMismatch);
    Ok(())
}

fn validate_tradable_contracts_requirements(ix: &StreamflowCreateParams) -> Result<()> {
    require!(
        ix.transferable_by_recipient,
        OtcError::StreamNotTransferable
    );
    require!(!ix.cancelable_by_sender, OtcError::StreamNotTransferable);
    Ok(())
}

fn validate_marketplace_policy(ix: &StreamflowCreateParams) -> Result<()> {
    require!(
        !ix.transferable_by_sender,
        OtcError::StreamPolicyViolation
    );
    require!(
        !ix.cancelable_by_recipient,
        OtcError::StreamPolicyViolation
    );
    require!(!ix.can_topup, OtcError::StreamPolicyViolation);
    require!(
        !ix.automatic_withdrawal,
        OtcError::StreamPolicyViolation
    );
    Ok(())
}

// ── Pricing ──────────────────────────────────────────────────────

fn compute_total_usdc(
    price_per_token_micro_usdc: u64,
    vesting_amount_raw: u64,
    token_decimals: u8,
) -> Result<u64> {
    let denom = 10u128.checked_pow(token_decimals as u32).ok_or(OtcError::NumericOverflow)?;
    let numerator = (price_per_token_micro_usdc as u128)
        .checked_mul(vesting_amount_raw as u128)
        .ok_or(OtcError::NumericOverflow)?;
    let total = numerator
        .checked_add(denom - 1)
        .ok_or(OtcError::NumericOverflow)?
        .checked_div(denom)
        .ok_or(OtcError::NumericOverflow)?;
    require!(total <= u64::MAX as u128, OtcError::NumericOverflow);
    Ok(total as u64)
}

fn compute_fee_ceil(amount: u64, fee_bps: u16) -> Result<u64> {
    if fee_bps == 0 {
        return Ok(0);
    }
    let f = (amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(OtcError::NumericOverflow)?
        .checked_add(FEE_DENOMINATOR as u128 - 1)
        .ok_or(OtcError::NumericOverflow)?
        .checked_div(FEE_DENOMINATOR as u128)
        .ok_or(OtcError::NumericOverflow)?;
    require!(f <= u64::MAX as u128, OtcError::NumericOverflow);
    Ok(f as u64)
}

// ── PDA seeds ────────────────────────────────────────────────────

fn listing_signer_seeds(
    maker: Pubkey,
    metadata: Pubkey,
    nonce: u64,
    bump: u8,
) -> Vec<Vec<u8>> {
    vec![
        b"listing".to_vec(),
        maker.to_bytes().to_vec(),
        metadata.to_bytes().to_vec(),
        nonce.to_le_bytes().to_vec(),
        vec![bump],
    ]
}

fn bid_signer_seeds(listing: Pubkey, bidder: Pubkey, bump: u8) -> Vec<Vec<u8>> {
    vec![
        b"bid".to_vec(),
        listing.to_bytes().to_vec(),
        bidder.to_bytes().to_vec(),
        vec![bump],
    ]
}

fn seed_refs(seeds: &[Vec<u8>]) -> Vec<&[u8]> {
    seeds.iter().map(|v| v.as_slice()).collect()
}

// ── sweep ────────────────────────────────────────────────────────

/// listing_token_ata 잔량을 destination ATA로 PDA-signed transfer 후, ATA 자체를 close.
/// rent는 `rent_destination`(보통 maker)에게 환수.
/// 잔량 0이어도 close는 항상 수행 — 정상 flow의 rent 환수.
fn sweep_listing_token_ata<'info>(
    listing_token_ata: &Account<'info, TokenAccount>,
    destination: &AccountInfo<'info>,
    listing_authority: &AccountInfo<'info>,
    rent_destination: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    signer_seeds: &[Vec<u8>],
) -> Result<u64> {
    let seed_refs: Vec<&[u8]> = signer_seeds.iter().map(|v| v.as_slice()).collect();
    let amount = listing_token_ata.amount;

    if amount > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                token_program.clone(),
                Transfer {
                    from: listing_token_ata.to_account_info(),
                    to: destination.clone(),
                    authority: listing_authority.clone(),
                },
                &[seed_refs.as_slice()],
            ),
            amount,
        )?;
    }

    token::close_account(CpiContext::new_with_signer(
        token_program.clone(),
        CloseAccount {
            account: listing_token_ata.to_account_info(),
            destination: rent_destination.clone(),
            authority: listing_authority.clone(),
        },
        &[seed_refs.as_slice()],
    ))?;
    Ok(amount)
}

// ── State ────────────────────────────────────────────────────────

#[account]
pub struct Config {
    pub authority: Pubkey,
    pub usdc_mint: Pubkey,
    pub fee_recipient: Pubkey,
    pub fee_bps: u16,
    pub expected_streamflow_version: u8,
    pub bump: u8,
}

impl Config {
    pub const LEN: usize = 8 + 32 * 3 + 2 + 1 + 1;
}

#[account]
pub struct Listing {
    pub maker: Pubkey,
    pub streamflow_metadata: Pubkey,
    pub token_mint: Pubkey,
    pub token_decimals: u8,
    pub vesting_amount_raw: u64,
    pub unlock_at: i64,
    pub asking_price_micro_usdc: Option<u64>,
    pub expires_at: i64,
    pub status: ListingStatus,
    pub bid_count: u32,
    pub nonce: u64,
    pub bump: u8,
}

impl Listing {
    // disc(8) + Pubkey*3(96) + u8(1) + u64*4(32, 합쳐) + i64*2(16) + Option<u64>(9) + status(1) + u32(4) + bump(1)
    pub const LEN: usize = 8 + 96 + 1 + 8 + 8 + 9 + 8 + 1 + 4 + 8 + 1;
}

#[account]
pub struct Bid {
    pub listing: Pubkey,
    pub bidder: Pubkey,
    pub price_per_token_micro_usdc: u64,
    pub total_usdc_raw: u64,
    pub status: BidStatus,
    pub bump: u8,
}

impl Bid {
    // disc(8) + Pubkey*2(64) + u64*2(16) + status(1) + bump(1)
    pub const LEN: usize = 8 + 64 + 16 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum ListingStatus {
    Listed,
    Settled,
    Cancelled,
    Expired,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum BidStatus {
    Open,
    Accepted,
    Withdrawn,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum SettlementMode {
    Asking,
    Bid,
}

// ── Errors ───────────────────────────────────────────────────────

#[error_code]
pub enum OtcError {
    #[msg("현재 listing/bid 상태에서 허용되지 않는 인스트럭션")]
    InvalidStatus = 6000,
    #[msg("listing이 만료됨")]
    Expired = 6001,
    #[msg("아직 만료 시각이 되지 않음")]
    NotExpiredYet = 6002,
    #[msg("checked math 실패")]
    NumericOverflow = 6003,
    #[msg("권한 없음")]
    Unauthorized = 6004,
    #[msg("Streamflow metadata 디코드 실패")]
    InvalidStreamMetadata = 6100,
    #[msg("라이브 Streamflow recipient가 예상과 다름")]
    RecipientMismatch = 6101,
    #[msg("Streamflow metadata 버전 불일치")]
    StreamflowVersionMismatch = 6102,
    #[msg("Streamflow Tradable Contracts 요구사항 위반")]
    StreamNotTransferable = 6103,
    #[msg("LOCK N ROLL 마켓플레이스 정책 위반")]
    StreamPolicyViolation = 6104,
    #[msg("destination ATA가 없거나 canonical ATA가 아님")]
    RecipientAtaMissingOrInvalid = 6105,
    #[msg("Token-2022 mint 거부 (v1은 classic SPL Token만)")]
    TokenProgramNotSupported = 6106,
    #[msg("bidder는 listing maker가 될 수 없음")]
    BidderIsMaker = 6107,
    #[msg("bid-only listing에서 Buy Now 시도")]
    AskingNotSet = 6200,
    #[msg("만료 시각이 [now+1h, unlock_at] 범위 밖")]
    ExpiresAtOutOfRange = 6201,
    #[msg("nonce가 이미 사용됨")]
    NonceCollision = 6202,
    #[msg("bid PDA가 (listing, bidder)와 불일치")]
    BidPdaMismatch = 6300,
    #[msg("bid가 OPEN이 아님")]
    InvalidBidStatus = 6301,
    #[msg("USDC 계정이 canonical mint가 아님")]
    UsdcMintMismatch = 6302,
    #[msg("vault/source 금액이 예상 total과 불일치")]
    UsdcAmountMismatch = 6303,
    #[msg("제출된 bid total이 계산된 total과 불일치")]
    BidTotalMismatch = 6304,
    #[msg("금액은 0보다 커야 합니다")]
    InvalidAmount = 6400,
    #[msg("수수료율이 유효하지 않습니다")]
    InvalidFeeBps = 6401,
    #[msg("Streamflow program ID 불일치")]
    InvalidStreamflowProgram = 6402,
}

// ── Events ───────────────────────────────────────────────────────

#[event]
pub struct ListingCreated {
    pub listing: Pubkey,
    pub maker: Pubkey,
    pub streamflow_metadata: Pubkey,
    pub token_mint: Pubkey,
    pub token_decimals: u8,
    pub vesting_amount_raw: u64,
    pub asking_price_micro_usdc: Option<u64>,
    pub expires_at: i64,
    pub slot: u64,
    pub block_timestamp: i64,
}

#[event]
pub struct BidSubmitted {
    pub bid: Pubkey,
    pub listing: Pubkey,
    pub bidder: Pubkey,
    pub price_per_token_micro_usdc: u64,
    pub total_usdc_raw: u64,
    pub slot: u64,
    pub block_timestamp: i64,
}

#[event]
pub struct BidWithdrawn {
    pub bid: Pubkey,
    pub listing: Pubkey,
    pub bidder: Pubkey,
    pub total_usdc_raw: u64,
    pub slot: u64,
    pub block_timestamp: i64,
}

#[event]
pub struct OrderTaken {
    pub listing: Pubkey,
    pub streamflow_metadata: Pubkey,
    pub maker: Pubkey,
    pub taker: Pubkey,
    pub token_mint: Pubkey,
    pub vesting_amount_raw: u64,
    pub price_per_token_micro_usdc: u64,
    pub total_usdc_raw: u64,
    pub fee: u64,
    pub mode: SettlementMode,
    pub accepted_bid: Option<Pubkey>,
    pub swept_token_amount: u64,
    pub slot: u64,
    pub block_timestamp: i64,
}

#[event]
pub struct ListingCancelled {
    pub listing: Pubkey,
    pub maker: Pubkey,
    pub streamflow_metadata: Pubkey,
    pub swept_token_amount: u64,
    pub slot: u64,
    pub block_timestamp: i64,
}

#[event]
pub struct ListingExpired {
    pub listing: Pubkey,
    pub maker: Pubkey,
    pub streamflow_metadata: Pubkey,
    pub swept_token_amount: u64,
    pub slot: u64,
    pub block_timestamp: i64,
}

#[event]
pub struct ConfigUsdcMintChanged {
    pub old_mint: Pubkey,
    pub new_mint: Pubkey,
    pub slot: u64,
    pub block_timestamp: i64,
}

// ── Account contexts ─────────────────────────────────────────────

// ── Internal unit tests (cargo test, no validator) ──────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn total_usdc_simple_no_remainder() {
        // 1 token (decimals=6) at 1_000_000 micro-USDC = 1 USDC
        let total = compute_total_usdc(1_000_000, 1_000_000, 6).unwrap();
        assert_eq!(total, 1_000_000); // 1 USDC raw (decimals=6)
    }

    #[test]
    fn total_usdc_ceil() {
        // price=1, amount=3, denom=10 → ceil(3/10) = 1
        let total = compute_total_usdc(1, 3, 1).unwrap();
        assert_eq!(total, 1);
    }

    #[test]
    fn total_usdc_zero_amount_yields_zero() {
        let total = compute_total_usdc(123_456, 0, 6).unwrap();
        assert_eq!(total, 0);
    }

    #[test]
    fn total_usdc_overflow_guarded() {
        // u64::MAX * u64::MAX overflows u128 — checked
        let r = compute_total_usdc(u64::MAX, u64::MAX, 0);
        assert!(r.is_err());
    }

    #[test]
    fn fee_zero_bps() {
        assert_eq!(compute_fee_ceil(123_456, 0).unwrap(), 0);
    }

    #[test]
    fn fee_50_bps() {
        // 8_000_000_000 * 50 / 10000 = 40_000_000
        assert_eq!(compute_fee_ceil(8_000_000_000, 50).unwrap(), 40_000_000);
    }

    #[test]
    fn fee_ceil_remainder() {
        // amount=1, bps=1 → 1*1 + 9999 = 10000 / 10000 = 1
        assert_eq!(compute_fee_ceil(1, 1).unwrap(), 1);
    }

    #[test]
    fn fee_max_bps() {
        // 100% fee
        assert_eq!(compute_fee_ceil(1_000, 10_000).unwrap(), 1_000);
    }

    #[test]
    fn listing_status_distinct() {
        assert_ne!(ListingStatus::Listed, ListingStatus::Settled);
        assert_ne!(ListingStatus::Cancelled, ListingStatus::Expired);
    }

    #[test]
    fn bid_status_distinct() {
        assert_ne!(BidStatus::Open, BidStatus::Accepted);
        assert_ne!(BidStatus::Accepted, BidStatus::Withdrawn);
    }
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = Config::LEN,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(address = config.authority)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateListing<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    pub token_mint: Box<Account<'info, Mint>>,

    /// CHECK: Streamflow Contract account. owner와 layout은 함수 안에서 검증.
    #[account(mut)]
    pub streamflow_metadata: AccountInfo<'info>,

    #[account(
        init,
        payer = maker,
        space = Listing::LEN,
        seeds = [b"listing", maker.key().as_ref(), streamflow_metadata.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub listing: Box<Account<'info, Listing>>,

    /// (token_mint, listing)의 ATA. CPI 전에 init.
    #[account(
        init,
        payer = maker,
        associated_token::mint = token_mint,
        associated_token::authority = listing,
    )]
    pub listing_token_ata: Box<Account<'info, TokenAccount>>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: Streamflow program. address 가드.
    #[account(address = STREAMFLOW_PROGRAM_ID)]
    pub streamflow_program: AccountInfo<'info>,

    pub rent: Sysvar<'info, Rent>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SubmitBid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,

    #[account(mut)]
    pub listing: Box<Account<'info, Listing>>,

    #[account(
        init,
        payer = bidder,
        space = Bid::LEN,
        seeds = [b"bid", listing.key().as_ref(), bidder.key().as_ref()],
        bump
    )]
    pub bid: Box<Account<'info, Bid>>,

    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = bidder,
        associated_token::mint = usdc_mint,
        associated_token::authority = bid,
    )]
    pub bid_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = bidder_usdc_account.mint == config.usdc_mint @ OtcError::UsdcMintMismatch,
        constraint = bidder_usdc_account.owner == bidder.key() @ OtcError::Unauthorized,
    )]
    pub bidder_usdc_account: Box<Account<'info, TokenAccount>>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct BuyNow<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,

    /// CHECK: rent payment 대상 (불필요 시 readonly)
    #[account(mut, address = listing.maker)]
    pub maker: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"listing", listing.maker.as_ref(), listing.streamflow_metadata.as_ref(), &listing.nonce.to_le_bytes()],
        bump = listing.bump,
    )]
    pub listing: Box<Account<'info, Listing>>,

    #[account(address = listing.token_mint)]
    pub token_mint: Box<Account<'info, Mint>>,

    /// CHECK: Streamflow contract metadata
    #[account(mut, address = listing.streamflow_metadata)]
    pub streamflow_metadata: AccountInfo<'info>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = listing,
    )]
    pub listing_token_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = taker,
    )]
    pub taker_token_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = taker_usdc_account.mint == config.usdc_mint @ OtcError::UsdcMintMismatch,
        constraint = taker_usdc_account.owner == taker.key() @ OtcError::Unauthorized,
    )]
    pub taker_usdc_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = maker_usdc_account.mint == config.usdc_mint @ OtcError::UsdcMintMismatch,
        constraint = maker_usdc_account.owner == listing.maker @ OtcError::Unauthorized,
    )]
    pub maker_usdc_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = fee_recipient_usdc_account.mint == config.usdc_mint @ OtcError::UsdcMintMismatch,
        constraint = fee_recipient_usdc_account.owner == config.fee_recipient @ OtcError::Unauthorized,
    )]
    pub fee_recipient_usdc_account: Box<Account<'info, TokenAccount>>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: Streamflow program
    #[account(address = STREAMFLOW_PROGRAM_ID)]
    pub streamflow_program: AccountInfo<'info>,

    pub rent: Sysvar<'info, Rent>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptBid<'info> {
    #[account(mut, address = listing.maker)]
    pub maker: Signer<'info>,

    /// CHECK: bidder. rent 환수 대상.
    #[account(mut, address = bid.bidder)]
    pub bidder: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"listing", listing.maker.as_ref(), listing.streamflow_metadata.as_ref(), &listing.nonce.to_le_bytes()],
        bump = listing.bump,
    )]
    pub listing: Box<Account<'info, Listing>>,

    #[account(
        mut,
        seeds = [b"bid", listing.key().as_ref(), bid.bidder.as_ref()],
        bump = bid.bump,
    )]
    pub bid: Box<Account<'info, Bid>>,

    #[account(address = listing.token_mint)]
    pub token_mint: Box<Account<'info, Mint>>,

    /// CHECK: Streamflow metadata
    #[account(mut, address = listing.streamflow_metadata)]
    pub streamflow_metadata: AccountInfo<'info>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = listing,
    )]
    pub listing_token_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = bidder,
    )]
    pub bidder_token_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = config.usdc_mint,
        associated_token::authority = bid,
    )]
    pub bid_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = maker_usdc_account.mint == config.usdc_mint @ OtcError::UsdcMintMismatch,
        constraint = maker_usdc_account.owner == listing.maker @ OtcError::Unauthorized,
    )]
    pub maker_usdc_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = fee_recipient_usdc_account.mint == config.usdc_mint @ OtcError::UsdcMintMismatch,
        constraint = fee_recipient_usdc_account.owner == config.fee_recipient @ OtcError::Unauthorized,
    )]
    pub fee_recipient_usdc_account: Box<Account<'info, TokenAccount>>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: Streamflow program
    #[account(address = STREAMFLOW_PROGRAM_ID)]
    pub streamflow_program: AccountInfo<'info>,

    pub rent: Sysvar<'info, Rent>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawBid<'info> {
    #[account(mut, address = bid.bidder)]
    pub bidder: Signer<'info>,

    #[account(
        mut,
        seeds = [b"bid", bid.listing.as_ref(), bidder.key().as_ref()],
        bump = bid.bump,
    )]
    pub bid: Box<Account<'info, Bid>>,

    /// listing이 살아있을 수도, 없을 수도. 옵셔널.
    #[account(mut, address = bid.listing)]
    pub listing: Option<Box<Account<'info, Listing>>>,

    #[account(
        mut,
        associated_token::mint = config.usdc_mint,
        associated_token::authority = bid,
    )]
    pub bid_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = bidder_usdc_account.mint == config.usdc_mint @ OtcError::UsdcMintMismatch,
        constraint = bidder_usdc_account.owner == bidder.key() @ OtcError::Unauthorized,
    )]
    pub bidder_usdc_account: Box<Account<'info, TokenAccount>>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelListing<'info> {
    #[account(mut, address = listing.maker)]
    pub maker: Signer<'info>,

    #[account(
        mut,
        seeds = [b"listing", listing.maker.as_ref(), listing.streamflow_metadata.as_ref(), &listing.nonce.to_le_bytes()],
        bump = listing.bump,
    )]
    pub listing: Box<Account<'info, Listing>>,

    #[account(address = listing.token_mint)]
    pub token_mint: Box<Account<'info, Mint>>,

    /// CHECK: Streamflow metadata
    #[account(mut, address = listing.streamflow_metadata)]
    pub streamflow_metadata: AccountInfo<'info>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = listing,
    )]
    pub listing_token_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = maker,
    )]
    pub maker_token_ata: Box<Account<'info, TokenAccount>>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: Streamflow program
    #[account(address = STREAMFLOW_PROGRAM_ID)]
    pub streamflow_program: AccountInfo<'info>,

    pub rent: Sysvar<'info, Rent>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimExpired<'info> {
    /// 누구든 호출 가능 (claim_expired는 permissionless).
    #[account(mut)]
    pub caller: Signer<'info>,

    /// CHECK: rent destination, listing.maker와 일치
    #[account(mut, address = listing.maker)]
    pub maker: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"listing", listing.maker.as_ref(), listing.streamflow_metadata.as_ref(), &listing.nonce.to_le_bytes()],
        bump = listing.bump,
    )]
    pub listing: Box<Account<'info, Listing>>,

    #[account(address = listing.token_mint)]
    pub token_mint: Box<Account<'info, Mint>>,

    /// CHECK: Streamflow metadata
    #[account(mut, address = listing.streamflow_metadata)]
    pub streamflow_metadata: AccountInfo<'info>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = listing,
    )]
    pub listing_token_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = maker,
    )]
    pub maker_token_ata: Box<Account<'info, TokenAccount>>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: Streamflow program
    #[account(address = STREAMFLOW_PROGRAM_ID)]
    pub streamflow_program: AccountInfo<'info>,

    pub rent: Sysvar<'info, Rent>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
