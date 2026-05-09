use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    hash::hash,
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token};

declare_id!("5uhAfkGs2J3TpoFsPCsyaB1krn29nWCQHvSWArhFdDkz");

/// Streamflow devnet program. Localnet에서는 이 program을 clone해서 띄움.
pub const STREAMFLOW_PROGRAM_ID: Pubkey =
    anchor_lang::solana_program::pubkey!("HqDGZjaVRXJ9MGRQEw7qDc2rAr6iH1n1kAQdCZaCMfMZ");

#[program]
pub mod spike {
    use super::*;

    /// B0: spike PDA가 Streamflow Transfer instruction의 authority로 통과하는지 증명.
    /// 사전 조건: Streamflow contract가 이미 존재하고, contract.recipient == listing_pda.
    /// 성공 시: contract.recipient == new_recipient.
    /// `ix_data`는 클라이언트가 build해서 전달 (discriminator + args 전체 raw bytes).
    pub fn prove_transfer(ctx: Context<ProveTransfer>, ix_data: Vec<u8>) -> Result<()> {
        let data = ix_data;
        // 정적 fallback (인자 비어있으면 sha256("global:transfer_recipient")[..8] + 10B)
        let data = if data.is_empty() {
            let disc = &hash(b"global:transfer_recipient").to_bytes()[..8];
            let mut v = disc.to_vec();
            v.extend_from_slice(&[0u8; 10]);
            v
        } else {
            data
        };

        let ix = Instruction {
            program_id: STREAMFLOW_PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(ctx.accounts.listing_pda.key(), true),
                AccountMeta::new(ctx.accounts.new_recipient.key(), false),
                AccountMeta::new(ctx.accounts.new_recipient_tokens.key(), false),
                AccountMeta::new(ctx.accounts.metadata.key(), false),
                AccountMeta::new_readonly(ctx.accounts.mint.key(), false),
                AccountMeta::new_readonly(
                    anchor_lang::solana_program::sysvar::rent::ID,
                    false,
                ),
                AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
                AccountMeta::new_readonly(ctx.accounts.associated_token_program.key(), false),
                AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
            ],
            data,
        };

        let maker_key = ctx.accounts.maker.key();
        let bump = ctx.bumps.listing_pda;
        let bump_arr = [bump];
        let seeds: &[&[u8]] = &[b"spike", maker_key.as_ref(), &bump_arr];
        let signer = &[seeds];

        invoke_signed(
            &ix,
            &[
                ctx.accounts.listing_pda.to_account_info(),
                ctx.accounts.new_recipient.to_account_info(),
                ctx.accounts.new_recipient_tokens.to_account_info(),
                ctx.accounts.metadata.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.rent.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.associated_token_program.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.streamflow_program.to_account_info(),
            ],
            signer,
        )?;

        msg!("B0 OK: Streamflow Transfer CPI succeeded with PDA signer");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct ProveTransfer<'info> {
    /// CHECK: PDA seed 입력으로만 사용. 별도 검증 없음.
    pub maker: AccountInfo<'info>,

    /// CHECK: spike PDA. 현재 Streamflow contract의 recipient여야 함.
    #[account(
        mut,
        seeds = [b"spike", maker.key.as_ref()],
        bump
    )]
    pub listing_pda: AccountInfo<'info>,

    /// CHECK: 새 recipient. 어떤 wallet/PDA든 가능.
    #[account(mut)]
    pub new_recipient: AccountInfo<'info>,

    /// CHECK: (mint, new_recipient)의 ATA. Streamflow CPI 전에 클라이언트가 생성.
    #[account(mut)]
    pub new_recipient_tokens: AccountInfo<'info>,

    /// CHECK: Streamflow contract metadata. Anchor discriminator 없음.
    #[account(mut)]
    pub metadata: AccountInfo<'info>,

    pub mint: Box<Account<'info, Mint>>,

    pub rent: Sysvar<'info, Rent>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,

    /// CHECK: Streamflow program. address 가드.
    #[account(address = STREAMFLOW_PROGRAM_ID)]
    pub streamflow_program: AccountInfo<'info>,
}
