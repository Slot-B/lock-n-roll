use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("9PR9oNvarS2iektAP84Zdcs4akh3a2NML8XVw75ih4gu");

#[program]
pub mod lock_n_roll {
    use super::*;

    pub fn create_order(
        ctx: Context<CreateOrder>,
        maker_amount: u64,
        taker_amount: u64,
        order_id: u64,
    ) -> Result<()> {
        let order = &mut ctx.accounts.escrow_order;
        order.maker = ctx.accounts.maker.key();
        order.maker_token_mint = ctx.accounts.maker_token_mint.key();
        order.maker_amount = maker_amount;
        order.taker_amount = taker_amount;
        order.escrow_vault = ctx.accounts.escrow_vault.key();
        order.order_id = order_id;
        order.is_active = true;
        order.bump = ctx.bumps.escrow_order;

        // 매도자 토큰 → 에스크로 금고로 이동
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.maker_token_account.to_account_info(),
                to: ctx.accounts.escrow_vault.to_account_info(),
                authority: ctx.accounts.maker.to_account_info(),
            },
        );
        token::transfer(transfer_ctx, maker_amount)?;

        msg!("주문 생성됨: order_id={}", order_id);
        Ok(())
    }

    pub fn take_order(ctx: Context<TakeOrder>) -> Result<()> {
        let order = &ctx.accounts.escrow_order;
        require!(order.is_active, OtcError::OrderNotActive);

        // 매수자 USDC → 매도자로
        let usdc_transfer = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.taker_usdc_account.to_account_info(),
                to: ctx.accounts.maker_usdc_account.to_account_info(),
                authority: ctx.accounts.taker.to_account_info(),
            },
        );
        token::transfer(usdc_transfer, order.taker_amount)?;

        // 에스크로 토큰 → 매수자로
        let order_key = ctx.accounts.escrow_order.key();
        let bump = ctx.accounts.escrow_order.bump;
        let seeds = &[b"order" as &[u8], order_key.as_ref(), &[bump]];
        let signer = &[&seeds[..]];

        let token_transfer = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_vault.to_account_info(),
                to: ctx.accounts.taker_token_account.to_account_info(),
                authority: ctx.accounts.escrow_order.to_account_info(),
            },
            signer,
        );
        token::transfer(token_transfer, order.maker_amount)?;

        msg!("거래 완료!");
        Ok(())
    }

    pub fn cancel_order(ctx: Context<CancelOrder>) -> Result<()> {
        let order = &ctx.accounts.escrow_order;
        require!(order.is_active, OtcError::OrderNotActive);

        // 에스크로 토큰 → 매도자에게 반환
        let order_key = ctx.accounts.escrow_order.key();
        let bump = ctx.accounts.escrow_order.bump;
        let seeds = &[b"order" as &[u8], order_key.as_ref(), &[bump]];
        let signer = &[&seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.escrow_vault.to_account_info(),
                to: ctx.accounts.maker_token_account.to_account_info(),
                authority: ctx.accounts.escrow_order.to_account_info(),
            },
            signer,
        );
        token::transfer(transfer_ctx, order.maker_amount)?;

        msg!("주문 취소됨");
        Ok(())
    }
}

// ── 주문 상태 저장 계정 ──────────────────────────────────────────
#[account]
pub struct EscrowOrder {
    pub maker: Pubkey,
    pub maker_token_mint: Pubkey,
    pub maker_amount: u64,
    pub taker_amount: u64,
    pub escrow_vault: Pubkey,
    pub order_id: u64,
    pub is_active: bool,
    pub bump: u8,
}

impl EscrowOrder {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 32 + 8 + 1 + 1;
}

// ── 에러 정의 ────────────────────────────────────────────────────
#[error_code]
pub enum OtcError {
    #[msg("비활성화된 주문입니다")]
    OrderNotActive,
}

// ── CreateOrder 계정 ─────────────────────────────────────────────
#[derive(Accounts)]
#[instruction(maker_amount: u64, taker_amount: u64, order_id: u64)]
pub struct CreateOrder<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    /// CHECK: 토큰 민트
    pub maker_token_mint: AccountInfo<'info>,

    #[account(
        init, payer = maker, space = EscrowOrder::LEN,
        seeds = [b"order", maker.key().as_ref(), order_id.to_le_bytes().as_ref()],
        bump
    )]
    pub escrow_order: Account<'info, EscrowOrder>,

    #[account(mut)]
    pub maker_token_account: Account<'info, TokenAccount>,

    #[account(
        init, payer = maker,
        token::mint = maker_token_mint,
        token::authority = escrow_order,
        seeds = [b"vault", escrow_order.key().as_ref()],
        bump
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

// ── TakeOrder 계정 ───────────────────────────────────────────────
#[derive(Accounts)]
pub struct TakeOrder<'info> {
    #[account(mut)]
    pub taker: Signer<'info>,

    #[account(mut, constraint = escrow_order.is_active)]
    pub escrow_order: Account<'info, EscrowOrder>,

    #[account(mut)]
    pub escrow_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub taker_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub taker_usdc_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub maker_usdc_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ── CancelOrder 계정 ─────────────────────────────────────────────
#[derive(Accounts)]
pub struct CancelOrder<'info> {
    #[account(mut, constraint = escrow_order.maker == maker.key())]
    pub maker: Signer<'info>,

    #[account(mut)]
    pub escrow_order: Account<'info, EscrowOrder>,

    #[account(mut)]
    pub escrow_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub maker_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}