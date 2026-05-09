/**
 * SDK 공통 타입 (spec §6.2 기반).
 */
import { PublicKey, TransactionSignature } from "@solana/web3.js";
import BN from "bn.js";

export type ListingStatus = "Listed" | "Settled" | "Cancelled" | "Expired";
export type BidStatus = "Open" | "Accepted" | "Withdrawn";
export type SettlementMode = "Asking" | "Bid";

export type CreateListingParams = {
  streamflowMetadata: PublicKey;
  tokenMint: PublicKey;
  askingPriceMicroUsdc?: bigint;
  expiresAt: Date;
  nonce?: bigint; // 미지정 시 nextListingNonce()
};

export type SubmitBidParams = {
  listing: PublicKey;
  pricePerTokenMicroUsdc: bigint;
  totalUsdcRaw?: BN; // 미지정 시 SDK에서 자동 계산
};

export type BuyNowParams = { listing: PublicKey };
export type AcceptBidParams = { listing: PublicKey; bidder: PublicKey };
export type WithdrawBidParams = { listing: PublicKey; bidder?: PublicKey };
export type CancelListingParams = { listing: PublicKey };
export type ClaimExpiredParams = { listing: PublicKey };

export type InitConfigParams = {
  usdcMint: PublicKey;
  feeRecipient: PublicKey;
  feeBps: number;
  expectedStreamflowVersion: number;
};

export type TxResult = {
  signature: TransactionSignature;
  slot?: number;
};
