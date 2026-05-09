/**
 * LOCK N ROLL PDA seed derivation helpers.
 * 모든 시드 패턴을 한 곳에 두어 클라이언트가 직접 Buffer concat을 다루지 않게 한다.
 */
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

const u64LE = (n: bigint | BN | number): Buffer => {
  const bn = BN.isBN(n) ? n : new BN(n.toString());
  return bn.toArrayLike(Buffer, "le", 8);
};

export const configPda = (programId: PublicKey): [PublicKey, number] =>
  PublicKey.findProgramAddressSync([Buffer.from("config")], programId);

export const listingPda = (
  programId: PublicKey,
  maker: PublicKey,
  streamflowMetadata: PublicKey,
  nonce: bigint
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("listing"),
      maker.toBuffer(),
      streamflowMetadata.toBuffer(),
      u64LE(nonce),
    ],
    programId
  );

export const bidPda = (
  programId: PublicKey,
  listing: PublicKey,
  bidder: PublicKey
): [PublicKey, number] =>
  PublicKey.findProgramAddressSync(
    [Buffer.from("bid"), listing.toBuffer(), bidder.toBuffer()],
    programId
  );

/**
 * H1 nonce 전략: 64-bit random nonce. NonceCollision 시 SDK가 최대 3회 retry.
 */
export const nextListingNonce = (): bigint => {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return new DataView(buf.buffer).getBigUint64(0);
};
