/**
 * 가격 계산 — 컨트랙트의 compute_total_usdc / compute_fee_ceil 와 동일 공식.
 * 클라이언트에서 사전 계산하여 BidTotalMismatch 회피용.
 */
import BN from "bn.js";

const FEE_DENOMINATOR = new BN(10_000);

export const computeTotalUsdcRaw = (
  pricePerTokenMicroUsdc: bigint | BN,
  vestingAmountRaw: bigint | BN,
  tokenDecimals: number
): BN => {
  const price = BN.isBN(pricePerTokenMicroUsdc)
    ? pricePerTokenMicroUsdc
    : new BN(pricePerTokenMicroUsdc.toString());
  const amount = BN.isBN(vestingAmountRaw)
    ? vestingAmountRaw
    : new BN(vestingAmountRaw.toString());
  const denom = new BN(10).pow(new BN(tokenDecimals));
  // ceil(price * amount / denom)
  return price.mul(amount).add(denom.subn(1)).div(denom);
};

export const computeFeeCeil = (totalUsdcRaw: BN, feeBps: number): BN => {
  if (feeBps === 0) return new BN(0);
  return totalUsdcRaw.muln(feeBps).add(FEE_DENOMINATOR.subn(1)).div(FEE_DENOMINATOR);
};

export const computeDiscountRate = (
  ourPricePerTokenMicroUsdc: BN,
  marketPriceMicroUsdc: BN
): number => {
  if (marketPriceMicroUsdc.isZero()) return 0;
  return 1 - ourPricePerTokenMicroUsdc.toNumber() / marketPriceMicroUsdc.toNumber();
};
