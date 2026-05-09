import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { LockNRoll } from "../target/types/lock_n_roll";
import {
  createMint, createAccount, mintTo, getAccount
} from "@solana/spl-token";
import { assert } from "chai";

describe("lock-n-roll OTC", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.LockNRoll as Program<LockNRoll>;
  const maker = provider.wallet;

  let tokenMint: anchor.web3.PublicKey;
  let makerTokenAccount: anchor.web3.PublicKey;
  const ORDER_ID = new anchor.BN(1);
  const MAKER_AMOUNT = new anchor.BN(1_000_000);  // 1 토큰
  const TAKER_AMOUNT = new anchor.BN(10_000_000); // 10 USDC

  before(async () => {
    // 테스트용 토큰 민트 생성
    tokenMint = await createMint(
      provider.connection, provider.wallet.payer,
      maker.publicKey, null, 6
    );
    // 매도자 토큰 계정 생성 + 토큰 발행
    makerTokenAccount = await createAccount(
      provider.connection, provider.wallet.payer, tokenMint, maker.publicKey
    );
    await mintTo(
      provider.connection, provider.wallet.payer,
      tokenMint, makerTokenAccount, maker.publicKey, 10_000_000
    );
    console.log("✅ 테스트 토큰 준비 완료");
  });

  it("CreateOrder: 에스크로에 토큰 예치", async () => {
    const [escrowOrder] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("order"), maker.publicKey.toBuffer(),
       ORDER_ID.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [escrowVault] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), escrowOrder.toBuffer()],
      program.programId
    );

    await program.methods
      .createOrder(MAKER_AMOUNT, TAKER_AMOUNT, ORDER_ID)
      .accounts({
        maker: maker.publicKey,
        makerTokenMint: tokenMint,
        escrowOrder,
        makerTokenAccount,
        escrowVault,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    // 에스크로에 토큰이 들어갔는지 확인
    const vault = await getAccount(provider.connection, escrowVault);
    assert.equal(vault.amount.toString(), MAKER_AMOUNT.toString());
    console.log("✅ 에스크로 예치 성공:", vault.amount.toString());
  });
});