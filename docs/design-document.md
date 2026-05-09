# LOCK N ROLL Team Implementation Spec

> Version: v1.4 / 2026-05-09
> Audience: Blockchain, Backend, Frontend implementers
> Status: Shared source of truth for v1 implementation
> Change log: v1.4 incorporates 4-agent cross-review fixes (C1-C5, H1-H8) with tone adjustments per spec author.

---

## 0. Purpose

This document is the single implementation reference for LOCK N ROLL v1. It is written for a 3-person team working in parallel across Blockchain, Backend, and Frontend. Product rationale and external-facing material belong in separate documents.

`docs/design-document.md` is authoritative. `docs/architecture.md` is deprecated and must not be used for implementation decisions.

### 0.1 v1.3 → v1.4 Changes

| ID | Area | Change |
|---|---|---|
| C1 | Settlement instructions | Defensive `listing_token_ata` balance sweep added to `buy_now`, `accept_bid`, `cancel_listing`, `claim_expired`. |
| C2 | DB schema | `discount_rate` GENERATED column gets explicit numeric casts to make precision intent clear and avoid ORM/migration ambiguity. |
| C3 | WS payloads | `event_type: "withdraw"` typo corrected to `"withdrawn"`. |
| C4 | Env constants | `EXPECTED_STREAMFLOW_VERSION` slot added and must be filled from B0 spike output before `create_listing` decode logic merges. |
| C5 | Eligibility guards | §2.3 split into "Streamflow Tradable Contracts requirements" (2 fields) and "LOCK N ROLL marketplace policy" (4 fields) groups. |
| H1 | Nonce | Listing PDA nonce strategy specified: `u64` from `crypto.getRandomValues()`; on `NonceCollision` retry. |
| H2 | Indexer | `processed_events.event_index` defined as 0-based ordinal of `emit!` events in `tx.meta.innerInstructions`/log order. |
| H3 | Indexer | `best_bid_price_micro_usdc` recompute SQL spelled out. |
| H4 | SDK | All 7 SDK methods get explicit param types in §5.1. |
| H5 | DB constraint | `expires_at > created_at + 1h` half of CHECK dropped to avoid Solana-clock vs Postgres-clock false rejects. |
| H6 | Shared types | `StreamCandidate` moved from §5.2 to §6.2 shared types. |
| H7 | Plan B | Tone tightened: B0 failure means stop/re-scope; alternatives are maker co-sign settlement or SPL escrow with reduced UX guarantees, not promised v1 functionality. |
| H8 | CPI authority | §3.2 documents that the wrapper uses `AccountInfo<'info>` for `authority` and the actual signing path is raw `solana_program::invoke_signed`, intentionally bypassing Anchor's `Signer` typing. |
| Extra | Token program scope | v1 supports classic SPL Token only. Token-2022 mints are out of scope and rejected at create_listing. |
| Extra | Compute budget | Settlement transactions must measure CU during B0 / Anchor tests and prepend `set_compute_unit_limit(measured * 1.2)`. |

---

## 1. Canonical Decisions

| Area | Decision |
|---|---|
| Product scope | v1 supports Streamflow Vesting contracts only. Token Lock and other vesting providers are out of scope. |
| Token program scope | v1 supports classic SPL Token mints only. Token-2022 (`spl-token-2022`) mints are out of scope and must be rejected at create_listing. |
| Tradable stream eligibility | A stream is listable only when (a) Streamflow Tradable Contracts requirements are met and (b) LOCK N ROLL marketplace policy guards pass. See §2.3 for the split. |
| Locked asset custody | LOCK N ROLL never escrows the locked token. Streamflow keeps custody; LOCK N ROLL transfers the Streamflow recipient right. |
| Vested-token defense | While `listing_pda` is recipient, anything that ends up sitting in `listing_token_ata` must be swept on settlement, cancel, or expiry. With `automatic_withdrawal == false` the normal Streamflow flow does not auto-deposit, but the sweep is kept as a defensive invariant. |
| Payment custody | Buy Now pays USDC directly from taker to maker. Bid mode escrows USDC in a per-bid PDA-owned ATA until accepted or refunded. |
| On-chain instructions | Exactly 7: `create_listing`, `submit_bid`, `buy_now`, `accept_bid`, `withdraw_bid`, `cancel_listing`, `claim_expired`. |
| Listing statuses | `LISTED`, `SETTLED`, `CANCELLED`, `EXPIRED`. Bid presence is represented by `bid_count`, not a separate listing status. |
| Bid statuses | `OPEN`, `ACCEPTED`, `WITHDRAWN`. |
| Bid cardinality | One bidder can have one open-or-historical bid per listing: PDA seed is `["bid", listing, bidder]`. |
| Refund policy | Any `OPEN` bid whose listing is `SETTLED`, `CANCELLED`, or `EXPIRED` remains manually refundable via `withdraw_bid`. |
| Pricing unit | `price_per_token_micro_usdc` is micro-USDC per one whole token. All on-chain settlement uses raw integer USDC units. |
| Oracle scope | Pyth is used client/API side for display and guardrails in v1. On-chain price validation is Phase 2. |
| Streamflow integration risk | Day 1 starts with a CPI spike proving recipient transfer from a program-owned listing PDA via signer seeds. If this fails, the team must stop and re-scope before building the main flow. See §9 for the conservative re-scope statement. |

---

## 2. Shared Domain Model

### 2.1 Core Terms

| Term | Canonical name | Meaning |
|---|---|---|
| Maker | `maker_wallet` | Current Streamflow recipient before listing. |
| Taker | `taker_wallet` | Buyer who receives the Streamflow recipient right. |
| Streamflow metadata | `streamflow_metadata` | Streamflow contract metadata account; this stores recipient, mint, schedule, and permissions. |
| Listing | `listing_pda` | LOCK N ROLL order account pointing at one Streamflow metadata account. |
| Bid | `bid_pda` | Bid account plus a PDA-owned USDC vault. |
| Listing token ATA | `listing_token_ata` | ATA for `(token_mint, listing_pda)`. Required when the listing PDA becomes Streamflow recipient. Used as defensive sweep source on settlement/cancel/expire. |
| Destination token ATA | `new_recipient_tokens` | ATA for `(token_mint, new_recipient)` passed into Streamflow transfer CPI. |
| Canonical USDC mint | `USDC_MINT` | Environment-specific USDC mint used for all payments and bid vaults. |

### 2.2 Streamflow Contract Decode

Use `streamflow_sdk::state::Contract` (crate version pinned in §6.1) as the on-chain metadata layout. This account has no Anchor discriminator. Decode with the SDK-supported unchecked Borsh path, which tolerates Streamflow's forward-compatible trailing fields when combined with the version guard:

```rust
use anchor_lang::prelude::*;
use anchor_lang::solana_program::borsh::try_from_slice_unchecked;
use streamflow_sdk::state::Contract;

let data = streamflow_metadata.try_borrow_data()?;
let contract: Contract = try_from_slice_unchecked(&data)
    .map_err(|_| error!(ErrorCode::InvalidStreamMetadata))?;
```

Do not use Anchor account deserialization for this account.

### 2.3 Stream Eligibility Guards

`create_listing` must reject the stream unless every guard below passes. The list is split into two intent groups so devs and QA do not confuse Streamflow protocol requirements with LOCK N ROLL marketplace policy.

#### 2.3.1 Streamflow Tradable Contracts requirements

These two are mandated by Streamflow's Tradable Contracts feature itself.

| Guard | Required value |
|---|---|
| Recipient transfer | `contract.ix.transferable_by_recipient == true` |
| Sender cancellation | `contract.ix.cancelable_by_sender == false` |

#### 2.3.2 LOCK N ROLL marketplace policy

These are LOCK N ROLL's own policy guards on top of Streamflow. Streamflow itself permits some of these to be true; the marketplace rejects them in v1 to keep settlement reasoning simple and safe.

| Guard | Required value | Rationale |
|---|---|---|
| Sender transfer | `contract.ix.transferable_by_sender == false` | Prevent sender from yanking transfer authority while listed. |
| Recipient cancellation | `contract.ix.cancelable_by_recipient == false` | Prevent counterparty from cancelling the stream from under a buyer. |
| Top-up | `contract.ix.can_topup == false` | Lock the deposited amount snapshot used for pricing. |
| Auto withdrawal | `contract.ix.automatic_withdrawal == false` | Reduce the chance of vested tokens accumulating in `listing_token_ata` mid-listing. |

#### 2.3.3 Structural guards (apply on every CPI-touching instruction)

Every instruction that reads or writes Streamflow state must re-check:

| Guard | Required value |
|---|---|
| Metadata owner | `streamflow_metadata.owner == STREAMFLOW_PROGRAM_ID` |
| Version | `contract.version == EXPECTED_STREAMFLOW_VERSION` |
| Mint | `contract.mint == listing.token_mint` |
| Closed | `contract.closed == false` |
| Current recipient | `contract.recipient == maker_wallet` (`create_listing` only) or `contract.recipient == listing_pda` (`buy_now`, `accept_bid`, `cancel_listing`, `claim_expired`) |

`create_listing` additionally validates that `token_mint` is owned by the classic SPL Token program (Token-2022 mints rejected with `TokenProgramNotSupported`).

### 2.4 Amounts and Rounding

All token and payment amounts are integer raw units on-chain.

| Field | Type | Unit |
|---|---|---|
| `vesting_amount_raw` | `u64` | Remaining raw token units from the pinned Streamflow `Contract`: net stream amount minus already claimed amount. |
| `token_decimals` | `u8` | Mint decimals from SPL mint account. |
| `price_per_token_micro_usdc` | `u64` | Micro-USDC per one whole token. |
| `total_usdc_raw` | `u64` | Raw USDC units transferred or escrowed. |

Settlement total:

```text
denom = 10 ^ token_decimals
numerator = price_per_token_micro_usdc * vesting_amount_raw
total_usdc_raw = ceil(numerator / denom)
```

Implementation must use checked integer math and the ceil division formula `(numerator + denom - 1) / denom`.

Discount display:

```text
discount_rate = 1 - (price_per_token / market_price)
```

This value is display/API data only in v1.

---

## 3. On-Chain Contract Spec

### 3.1 Program Accounts

| Account | Seed / Derivation | Stored or checked fields |
|---|---|---|
| `Listing` | `["listing", maker, streamflow_metadata, nonce]` | `maker`, `streamflow_metadata`, `token_mint`, `token_decimals`, `vesting_amount_raw`, `unlock_at`, `asking_price_micro_usdc: Option<u64>`, `expires_at`, `status`, `bid_count`, `nonce`, `bump`. |
| `Bid` | `["bid", listing, bidder]` | `listing`, `bidder`, `price_per_token_micro_usdc`, `total_usdc_raw`, `status`, `bump`. |
| `BidUsdcVault` | ATA for `(USDC_MINT, bid_pda)` | Token account authority is `bid_pda`; mint must be canonical USDC. |
| `ListingTokenAta` | ATA for `(token_mint, listing_pda)` | Must exist before transferring Streamflow recipient to `listing_pda`. Defensive sweep source on settlement/cancel/expire. |
| User token ATA | ATA for `(token_mint, taker/bidder/maker)` | Must exist before settlement/cancel transfer CPI. |

ATA ownership note: ATAs are owned by the SPL Token Program. Their authority is the wallet or PDA passed as ATA owner.

### 3.2 Streamflow Transfer CPI Accounts

`StreamflowAdapter.transfer_recipient` wraps Streamflow SDK's transfer instruction account shape. The wrapper intentionally types `authority` as `AccountInfo<'info>` because both wallet signers and PDA signers must flow through the same call site. The actual signing path uses `solana_program::program::invoke_signed`, bypassing Anchor's `Signer<'info>` typing — this is necessary because the same instruction is invoked with `signer_seeds = None` (maker wallet path in `create_listing`) and `signer_seeds = Some(...)` (PDA path in all other instructions).

```rust
pub struct TransferRecipientAccounts<'info> {
    pub authority: AccountInfo<'info>, // wallet OR listing_pda; signing via invoke_signed
    pub new_recipient: AccountInfo<'info>,
    pub new_recipient_tokens: AccountInfo<'info>,
    pub metadata: AccountInfo<'info>,
    pub mint: Account<'info, Mint>,
    pub rent: Sysvar<'info, Rent>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub trait StreamflowAdapter {
    fn transfer_recipient<'info>(
        &self,
        accounts: TransferRecipientAccounts<'info>,
        signer_seeds: Option<&[&[&[u8]]]>,
    ) -> Result<()>;
}
```

Streamflow SDK 0.13.0's actual `Transfer` struct types `authority` as `Signer<'info>`; we cannot use that wrapper directly because we need the same call site to accept a PDA. The Streamflow program checks the authority against `contract.recipient` regardless of the Anchor wrapper type, so passing `AccountInfo` with valid signer seeds is functionally equivalent.

Authority rules:

| Instruction | Streamflow transfer authority | Signer mode |
|---|---|---|
| `create_listing` | `maker` | Normal wallet signer (`signer_seeds = None`). |
| `buy_now` | `listing_pda` | PDA signer seeds. |
| `accept_bid` | `listing_pda` | PDA signer seeds. |
| `cancel_listing` | `listing_pda` | PDA signer seeds. |
| `claim_expired` | `listing_pda` | PDA signer seeds. |

Destination ATA rules:

| Instruction | `new_recipient` | `new_recipient_tokens` |
|---|---|---|
| `create_listing` | `listing_pda` | `listing_token_ata`. May be created in the same transaction before calling the program. |
| `buy_now` | `taker` | Taker token ATA. Must exist before the Streamflow CPI. |
| `accept_bid` | `bid.bidder` | Bidder token ATA. Must exist before the Streamflow CPI. |
| `cancel_listing` | `maker` | Maker token ATA. Must exist before the Streamflow CPI. |
| `claim_expired` | `listing.maker` | Maker token ATA. Must exist before the Streamflow CPI. |

Do not rely on Streamflow CPI auto-creating destination ATAs when the transfer authority is `listing_pda`; the client should create the ATA first when missing.

### 3.3 Instructions

| Instruction | Caller | Main effects |
|---|---|---|
| `create_listing` | Maker | Validates eligible Streamflow contract (incl. classic SPL Token mint), initializes `Listing`, creates/uses `listing_token_ata`, transfers Streamflow recipient from maker to `listing_pda`, emits `ListingCreated`. |
| `submit_bid` | Bidder | Computes expected `total_usdc_raw`, verifies supplied total, initializes `Bid` and `BidUsdcVault`, transfers USDC into vault, increments `bid_count`, emits `BidSubmitted`. |
| `buy_now` | Taker | Verifies asking price and stream recipient, transfers Streamflow recipient to taker, **sweeps any tokens currently in `listing_token_ata` to taker's token ATA (defensive, see §1)**, transfers USDC from taker to maker, sets listing `SETTLED`, emits `OrderTaken`. Existing open bids remain refundable. |
| `accept_bid` | Maker | Verifies bid and vault, transfers Streamflow recipient to bidder, **sweeps any tokens currently in `listing_token_ata` to bidder's token ATA**, releases vault USDC to maker, closes vault, marks bid `ACCEPTED`, sets listing `SETTLED`, emits `OrderTaken`. Other open bids remain refundable. |
| `withdraw_bid` | Bidder | Allows any `OPEN` bid to return its vault USDC to bidder and close the vault. Works before acceptance and after listing terminal states. Emits `BidWithdrawn`. |
| `cancel_listing` | Maker | Transfers Streamflow recipient back to maker, **sweeps any tokens currently in `listing_token_ata` to maker's token ATA**, sets listing `CANCELLED`, emits `ListingCancelled`. Open bids remain refundable. |
| `claim_expired` | Anyone | After `expires_at`, transfers Streamflow recipient back to maker, **sweeps any tokens currently in `listing_token_ata` to maker's token ATA**, sets listing `EXPIRED`, emits `ListingExpired`. Open bids remain refundable. |

Sweep semantics: implementations should `token::transfer` `listing_token_ata.amount` (post-Streamflow-CPI snapshot) to the destination ATA using PDA signer seeds, then optionally `token::close_account` on `listing_token_ata` to reclaim rent. The sweep is a no-op when balance is zero, which is the expected case under the v1 eligibility rules.

### 3.4 Instruction Checks

| Instruction | Required checks |
|---|---|
| `create_listing` | Maker signer; nonce-derived listing uninitialized; `now + 1h <= expires_at <= unlock_at`; classic SPL Token mint (Token-2022 rejected); all Stream eligibility guards (§2.3); `asking_price_micro_usdc` absent or `> 0`; `listing_token_ata` is canonical ATA for `(token_mint, listing_pda)`. |
| `submit_bid` | Bidder signer; bidder is not maker; listing `LISTED`; bid PDA uninitialized for `(listing, bidder)`; price `> 0`; computed total equals supplied total; bidder USDC source mint is `USDC_MINT`; vault mint is `USDC_MINT`; vault authority is bid PDA. |
| `buy_now` | Taker signer; listing `LISTED`; asking price exists; structural Streamflow guards (§2.3.3) with current recipient = `listing_pda`; taker USDC source mint is `USDC_MINT`; maker USDC destination mint is `USDC_MINT`; taker token ATA matches `(token_mint, taker)`; total uses checked ceil formula; sweep destination is taker token ATA. |
| `accept_bid` | Maker signer; listing `LISTED`; bid `OPEN`; bid belongs to listing; structural Streamflow guards (§2.3.3); vault is ATA for `(USDC_MINT, bid_pda)`; vault amount equals `bid.total_usdc_raw`; bidder token ATA matches `(token_mint, bid.bidder)`; sweep destination is bidder token ATA. |
| `withdraw_bid` | Bidder signer; bid `OPEN`; vault is ATA for `(USDC_MINT, bid_pda)`; vault amount equals `bid.total_usdc_raw`; bidder USDC destination mint is `USDC_MINT`. |
| `cancel_listing` | Maker signer; listing `LISTED`; structural Streamflow guards (§2.3.3) with current recipient = `listing_pda`; maker token ATA matches `(token_mint, maker)`; sweep destination is maker token ATA. |
| `claim_expired` | Listing `LISTED`; current time `>= expires_at`; structural Streamflow guards (§2.3.3) with current recipient = `listing_pda`; maker token ATA matches `(token_mint, maker)`; sweep destination is maker token ATA. |

### 3.5 State Transitions

```text
Listing:
  LISTED --buy_now-------> SETTLED
  LISTED --accept_bid----> SETTLED
  LISTED --cancel_listing-> CANCELLED
  LISTED --claim_expired-> EXPIRED

Bid:
  OPEN --accept_bid----> ACCEPTED
  OPEN --withdraw_bid--> WITHDRAWN

Refund:
  Any OPEN bid is withdrawable.
  If the parent listing is SETTLED/CANCELLED/EXPIRED, the frontend must display it as refund available.
```

### 3.6 Events

| Event | Required fields |
|---|---|
| `ListingCreated` | `listing_pda`, `maker`, `streamflow_metadata`, `token_mint`, `token_decimals`, `vesting_amount_raw`, `asking_price_micro_usdc`, `expires_at`, `slot`. |
| `BidSubmitted` | `bid_pda`, `listing_pda`, `bidder`, `price_per_token_micro_usdc`, `total_usdc_raw`, `slot`. |
| `BidWithdrawn` | `bid_pda`, `listing_pda`, `bidder`, `total_usdc_raw`, `slot`. |
| `OrderTaken` | `listing_pda`, `streamflow_metadata`, `maker`, `taker`, `token_mint`, `vesting_amount_raw`, `price_per_token_micro_usdc`, `total_usdc_raw`, `mode` (string enum, values `asking` or `bid`), `accepted_bid_pda?`, `swept_token_amount`, `slot`. |
| `ListingCancelled` | `listing_pda`, `maker`, `streamflow_metadata`, `swept_token_amount`, `slot`. |
| `ListingExpired` | `listing_pda`, `maker`, `streamflow_metadata`, `swept_token_amount`, `slot`. |

`swept_token_amount` is the raw token amount that was actually swept from `listing_token_ata` during the instruction. Expected to be 0 in normal flow under v1 eligibility rules, and recorded for forensic visibility when non-zero.

### 3.7 Error Codes

| Code | Name | Meaning |
|---|---|---|
| 6000 | `InvalidStatus` | Instruction is not valid for current listing or bid status. |
| 6001 | `Expired` | Listing expired before attempted action. |
| 6002 | `NumericOverflow` | Checked math failed. |
| 6003 | `Unauthorized` | Signer is not allowed for the action. |
| 6100 | `InvalidStreamMetadata` | Streamflow metadata cannot be decoded. |
| 6101 | `RecipientMismatch` | Live Streamflow recipient is not expected. |
| 6102 | `StreamflowVersionMismatch` | Streamflow metadata version does not match pinned version. |
| 6103 | `StreamNotTransferable` | Stream violates the Streamflow Tradable Contracts requirements (§2.3.1). |
| 6104 | `StreamPolicyViolation` | Stream violates LOCK N ROLL marketplace policy (§2.3.2). |
| 6105 | `RecipientAtaMissingOrInvalid` | Destination ATA is absent or not the canonical ATA. |
| 6106 | `TokenProgramNotSupported` | Mint is not owned by classic SPL Token program (Token-2022 rejected). |
| 6107 | `BidderIsMaker` | Bidder cannot be the listing maker. |
| 6200 | `AskingNotSet` | Buy Now attempted on bid-only listing. |
| 6201 | `ExpiresAtOutOfRange` | Expiry not in `[now + 1h, unlock_at]`. |
| 6202 | `NonceCollision` | Listing PDA already exists for supplied nonce. |
| 6300 | `BidPdaMismatch` | Bid PDA does not match `(listing, bidder)`. |
| 6301 | `InvalidBidStatus` | Bid is not `OPEN`. |
| 6302 | `UsdcMintMismatch` | USDC account uses a non-canonical mint. |
| 6303 | `UsdcAmountMismatch` | Vault/source amount does not equal expected total. |
| 6304 | `BidTotalMismatch` | Supplied bid total does not match computed total. |

---

## 4. Backend and Indexer Spec

### 4.1 Responsibilities

| Component | Responsibility |
|---|---|
| Indexer | Parse LOCK N ROLL events, lazily upsert users, mirror on-chain state, enforce idempotency, invalidate cache, broadcast WebSocket messages. |
| REST API | Read-only queries for market, listing detail, streams, bids, history, health. |
| WebSocket server | Push normalized event payloads. |
| PostgreSQL | Durable mirror of on-chain state and processed event ledger. |
| Redis | Short-lived read cache for market/listing/stream queries. |
| Reconciliation cron | Compare active orders against live Streamflow metadata and report drift. |

### 4.2 PostgreSQL Schema

```sql
CREATE TABLE users (
  wallet_address TEXT PRIMARY KEY,
  display_name TEXT,
  trade_count INT NOT NULL DEFAULT 0,
  reputation_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ
);

CREATE TABLE orders (
  listing_pda TEXT PRIMARY KEY,
  maker_wallet TEXT NOT NULL REFERENCES users(wallet_address),
  streamflow_metadata TEXT NOT NULL,
  token_mint TEXT NOT NULL,
  token_decimals SMALLINT NOT NULL,
  vesting_amount_raw NUMERIC(40,0) NOT NULL,
  unlock_at TIMESTAMPTZ NOT NULL,
  asking_price_micro_usdc NUMERIC(20,0),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('LISTED','SETTLED','CANCELLED','EXPIRED')),
  bid_count INT NOT NULL DEFAULT 0,
  best_bid_price_micro_usdc NUMERIC(20,0),
  created_slot BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- H5: removed `expires_at > created_at + 1h` half. created_at is indexer-ingest time
  -- and can drift from Solana clock; the on-chain program already enforces the Solana-time
  -- minimum at create_listing.
  CHECK (expires_at <= unlock_at)
);

CREATE UNIQUE INDEX idx_orders_streamflow_active
  ON orders(streamflow_metadata)
  WHERE status = 'LISTED';

CREATE INDEX idx_orders_status_token
  ON orders(status, token_mint);

CREATE TABLE bids (
  bid_pda TEXT PRIMARY KEY,
  listing_pda TEXT NOT NULL REFERENCES orders(listing_pda),
  bidder_wallet TEXT NOT NULL REFERENCES users(wallet_address),
  price_per_token_micro_usdc NUMERIC(20,0) NOT NULL,
  total_usdc_raw NUMERIC(20,0) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN','ACCEPTED','WITHDRAWN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_pda, bidder_wallet)
);

CREATE INDEX idx_bids_listing_status
  ON bids(listing_pda, status);

CREATE INDEX idx_bids_bidder_status
  ON bids(bidder_wallet, status);

CREATE TABLE trade_history (
  trade_id BIGSERIAL PRIMARY KEY,
  tx_signature TEXT NOT NULL UNIQUE,
  listing_pda TEXT NOT NULL,
  accepted_bid_pda TEXT,
  streamflow_metadata TEXT NOT NULL,
  maker_wallet TEXT NOT NULL,
  taker_wallet TEXT NOT NULL,
  token_mint TEXT NOT NULL,
  vesting_amount_raw NUMERIC(40,0) NOT NULL,
  price_per_token_micro_usdc NUMERIC(20,0) NOT NULL,
  total_usdc_raw NUMERIC(20,0) NOT NULL,
  market_price_micro_usdc NUMERIC(20,0),
  -- C2: explicit numeric casts to make precision intent clear and survive any
  -- ORM/migration round-trip that otherwise might re-derive integer-typed division.
  discount_rate NUMERIC(8,6) GENERATED ALWAYS AS (
    1 - (
      price_per_token_micro_usdc::numeric(40,10)
      / NULLIF(market_price_micro_usdc, 0)::numeric(40,10)
    )
  ) STORED,
  mode TEXT NOT NULL CHECK (mode IN ('asking','bid')),
  settled_at TIMESTAMPTZ NOT NULL,
  block_slot BIGINT
);

CREATE TABLE processed_events (
  tx_signature TEXT NOT NULL,
  event_index INT NOT NULL,    -- H2: 0-based ordinal of `emit!` events
                               -- as parsed from tx.meta.innerInstructions / log
                               -- messages, in sequential order.
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tx_signature, event_index)
);

CREATE TABLE reconciliation_issues (
  id BIGSERIAL PRIMARY KEY,
  listing_pda TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  details JSONB NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
```

### 4.3 Indexer Rules

For every parsed event:

1. Start a DB transaction.
2. Insert into `processed_events(tx_signature, event_index, event_type)` using the H2 definition above.
3. If the insert conflicts, skip all downstream changes and return success.
4. Lazy upsert every wallet referenced by the event into `users`.
5. Apply the state change.
6. Invalidate Redis keys.
7. Commit.
8. Broadcast WebSocket payload after commit.

Event application:

| Event | DB changes |
|---|---|
| `ListingCreated` | Upsert maker, insert order as `LISTED`. |
| `BidSubmitted` | Upsert bidder, insert bid as `OPEN`, increment order `bid_count`, recompute `best_bid_price_micro_usdc` (see H3 SQL below). |
| `BidWithdrawn` | Update bid to `WITHDRAWN`; decrement order `bid_count` only when order is still `LISTED`; recompute `best_bid_price_micro_usdc` (H3 SQL). |
| `OrderTaken` | Insert trade history, set order `SETTLED`, mark accepted bid `ACCEPTED` when mode is `bid`; leave all other `OPEN` bids unchanged for manual refund. Persist `swept_token_amount` for forensic visibility. |
| `ListingCancelled` | Set order `CANCELLED`; leave `OPEN` bids unchanged. Persist `swept_token_amount`. |
| `ListingExpired` | Set order `EXPIRED`; leave `OPEN` bids unchanged. Persist `swept_token_amount`. |

H3 — best bid recompute (run on `BidSubmitted` and `BidWithdrawn`):

```sql
UPDATE orders SET
  best_bid_price_micro_usdc = sub.best_price,
  updated_at = NOW()
FROM (
  SELECT MAX(price_per_token_micro_usdc) AS best_price
  FROM bids
  WHERE listing_pda = $1 AND status = 'OPEN'
) AS sub
WHERE listing_pda = $1;
```

Note: `MAX` because higher bids are better for the maker; result is `NULL` when no open bids remain, which is the correct semantics for `best_bid_price_micro_usdc`.

### 4.4 REST API

All errors use:

```json
{ "error": { "code": "STRING_CODE", "message": "Human readable", "details": {} } }
```

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/orders` | Market list. Filters: `status`, `token`, `buy_now_only`, `min_discount`, `sort`, `cursor`. |
| `GET` | `/orders/:listing_pda` | Listing detail with bids and Streamflow metadata cache. |
| `GET` | `/streams/:wallet` | Maker stream picker data. Backend returns only v1-eligible streams when possible and includes rejection reasons for ineligible streams. Response uses the `StreamCandidate` shape from §6.2. |
| `GET` | `/bids` | Bid list. Filters: `wallet`, `listing`, `status`, `refund_available=true`. |
| `GET` | `/history` | Settled trades. Filters: `wallet`, `token`, `mode`, `from`, `to`, `cursor`. |
| `GET` | `/tokens/:mint/stats` | Token-level listing and settlement stats. |
| `GET` | `/health` | API/indexer health: `ok`, `slot`, `lag_ms`, `reconcile_lag_min`. |

`refund_available=true` means bid status is `OPEN` and parent order status is `SETTLED`, `CANCELLED`, or `EXPIRED`.

### 4.5 WebSocket Channels

| Channel | Payload |
|---|---|
| `market.tick` | `{ active_count, settled_count, ts }` |
| `order.created` | `ListingCreated` normalized payload |
| `order.bid_changed` | `{ event_type: "submitted" | "withdrawn", bid_pda, listing_pda, bidder, price_per_token_micro_usdc, total_usdc_raw }` |
| `order.settled` | `OrderTaken` normalized payload |
| `order.cancelled` | `{ event_type: "cancelled" | "expired", listing_pda, swept_token_amount }` |
| `user.{wallet}` | Any event involving that wallet, including refund availability changes. |

### 4.6 Reconciliation Cron

Run hourly for `orders.status = 'LISTED'`:

| Check | Action |
|---|---|
| Streamflow metadata missing or wrong owner | Insert `reconciliation_issues` row and alert. |
| Live recipient is not `listing_pda` | Insert issue row and alert; do not mutate order status automatically. |
| Version mismatch | Insert issue row and pause affected listing in API responses with warning metadata. |
| Mint mismatch | Insert issue row and alert. |
| `vesting_amount_raw` drift > 5% | Update cache, insert issue row with old/new values. |
| `listing_token_ata` non-zero balance on a `LISTED` order | Insert issue row (forensic, since defensive sweep should keep this 0). |

---

## 5. Frontend Integration Spec

### 5.1 SDK Methods

The frontend wraps Anchor calls in a typed LOCK N ROLL SDK. H4 — explicit param types:

```ts
type CreateListingParams = {
  streamflowMetadata: PublicKey;
  askingPriceMicroUsdc?: bigint;     // omit for bid-only listing
  expiresAt: Date;                   // must satisfy now+1h <= expiresAt <= unlockAt
  nonce: bigint;                     // 64-bit random; see §5.2 H1 strategy
};

type SubmitBidParams = {
  listingPda: PublicKey;
  pricePerTokenMicroUsdc: bigint;
  totalUsdcRaw: bigint;              // client must compute matching total per §2.4
};

type BuyNowParams       = { listingPda: PublicKey };
type AcceptBidParams    = { listingPda: PublicKey; bidder: PublicKey };
type WithdrawBidParams  = { listingPda: PublicKey };
type CancelListingParams = { listingPda: PublicKey };
type ClaimExpiredParams = { listingPda: PublicKey };
```

| SDK method | Program instruction |
|---|---|
| `createListing(params: CreateListingParams)` | `create_listing` |
| `submitBid(params: SubmitBidParams)` | `submit_bid` |
| `buyNow(params: BuyNowParams)` | `buy_now` |
| `acceptBid(params: AcceptBidParams)` | `accept_bid` |
| `withdrawBid(params: WithdrawBidParams)` | `withdraw_bid` |
| `cancelListing(params: CancelListingParams)` | `cancel_listing` |
| `claimExpired(params: ClaimExpiredParams)` | `claim_expired` |

The app must not expose raw account assembly across screens. Use one account-builder module shared by all transaction flows.

### 5.2 Stream Picker (H1 nonce strategy)

Frontend uses a local wrapper named `listRecipientStreams(wallet, network)` around `@streamflow/stream`. The wrapper must normalize SDK responses into `StreamCandidate` from §6.2.

Listing nonce strategy (H1):

```ts
// 64-bit random nonce; on-chain rejects collisions with NonceCollision.
function nextListingNonce(): bigint {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return new DataView(buf.buffer).getBigUint64(0);
}
// On NonceCollision, the SDK retries with a fresh nonce up to 3 times before surfacing.
```

Frontend and backend must use the same eligibility rules from §2.3 and surface rejections via `StreamCandidate.rejectionReasons`.

### 5.3 Transaction Account Assembly

| Flow | Frontend account duties |
|---|---|
| `createListing` | Derive listing PDA; create `listing_token_ata` if missing; pass maker, metadata, mint, Streamflow program, rent, token, associated token, and system program accounts. Pre-pend compute budget instruction (see §9). |
| `submitBid` | Derive bid PDA and USDC vault; compute `total_usdc_raw`; pass bidder USDC source and vault accounts. |
| `buyNow` | Ensure taker token ATA exists; pass taker USDC source and maker USDC destination; pass Streamflow transfer CPI accounts; pre-pend compute budget. |
| `acceptBid` | Ensure bidder token ATA exists; pass bid vault and maker USDC destination; pass Streamflow transfer CPI accounts; pre-pend compute budget. |
| `withdrawBid` | Pass bid vault and bidder USDC destination. |
| `cancelListing` / `claimExpired` | Ensure maker token ATA exists; pass Streamflow transfer CPI accounts; pre-pend compute budget. |

### 5.4 UI State Rules

| UI condition | Required behavior |
|---|---|
| Wallet disconnected | Disable transaction actions and open wallet modal on click. |
| Stream ineligible | Show specific rejection reasons from `StreamCandidate.rejectionReasons`; do not allow listing. Distinguish "Streamflow Tradable Contracts requirement" vs "LOCK N ROLL policy" in copy. |
| Listing has asking price | Show Buy Now and Place Bid. |
| Listing has no asking price | Show Place Bid only. |
| Bid is `OPEN` and listing is `LISTED` | Show pending bid with Withdraw action. |
| Bid is `OPEN` and listing is terminal | Show Refund Available with Withdraw action. |
| `OrderTaken` arrives mid-Buy-Now | Optimistically disable Buy Now button on receiving the WS event, even before the user's own transaction confirms or fails (prevents race-loss UX surprise). |
| Transaction in progress | Use shared tx status states: `building`, `awaiting_signature`, `sent`, `confirming`, `confirmed`, `failed`. |
| Network switch | Swap RPC endpoint, LOCK N ROLL program ID, Streamflow program ID, USDC mint, and cache namespace together. |

### 5.5 Query and Cache Invalidation

| Event | Frontend invalidation |
|---|---|
| `order.created` | `/orders`, stream picker for maker. |
| `order.bid_changed` | listing detail, maker dashboard, bidder dashboard. |
| `order.settled` | `/orders`, listing detail, all bids for listing, dashboards for maker/taker/bidders. |
| `order.cancelled` | `/orders`, listing detail, all bids for listing, maker/bidder dashboards. |

---

## 6. Cross-Team Interface Contracts

### 6.1 Environment Constants

| Constant | Local | Devnet | Mainnet |
|---|---|---|---|
| `LOCK_N_ROLL_PROGRAM_ID` | `localnet` | `<DEV_LNR>` | `<PROD_LNR>` |
| `STREAMFLOW_PROGRAM_ID` | `streamflow-mock` | `HqDGZjaVRXJ9MGRQEw7qDc2rAr6iH1n1kAQdCZaCMfMZ` | `strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m` |
| `USDC_MINT` | local test mint | devnet test USDC mint | canonical mainnet USDC mint |
| `EXPECTED_STREAMFLOW_VERSION` | (matches Devnet stream value) | **TBD — capture from B0 spike output before any `create_listing` decode logic merges** | (matches Devnet unless an upgrade is observed; bump via PR after audit) |
| Anchor crate version | 0.30.x (pinned) | 0.30.x | 0.30.x |
| streamflow-sdk crate version | 0.13.0 (pinned) | 0.13.0 | 0.13.0 |
| `@streamflow/stream` package version | latest matching SDK 0.13.0 | latest matching SDK 0.13.0 | latest matching SDK 0.13.0 |

The team must fill real `USDC_MINT` and `EXPECTED_STREAMFLOW_VERSION` values before Devnet QA.

### 6.2 Shared Types

```ts
type ListingStatus = "LISTED" | "SETTLED" | "CANCELLED" | "EXPIRED";
type BidStatus = "OPEN" | "ACCEPTED" | "WITHDRAWN";
type SettlementMode = "asking" | "bid";

type ApiAmount = string; // integer raw units encoded as decimal string

// H6: Promoted from §5.2 to the shared contract surface.
type StreamCandidate = {
  streamflowMetadata: string;
  mint: string;
  tokenDecimals: number;
  vestingAmountRaw: ApiAmount;
  unlockAt: string; // ISO 8601
  eligible: boolean;
  rejectionReasons: Array<
    | "TRADABLE_CONTRACTS_REQUIREMENT" // §2.3.1 violation
    | "LOCK_N_ROLL_POLICY"             // §2.3.2 violation
    | "STRUCTURAL"                     // §2.3.3 violation (closed, mint, owner)
    | "TOKEN_2022_NOT_SUPPORTED"
  >;
  rejectionDetails?: string[];         // human-readable specifics
};
```

### 6.3 Team Ownership

| Owner | Owns | Must coordinate with |
|---|---|---|
| Blockchain | Anchor program, Streamflow adapter, account constraints, event fields, Anchor tests, Devnet deploy. | Backend for event payloads; Frontend for account builder and IDL. |
| Backend | DB schema, indexer, REST API, WebSocket, reconciliation cron, idempotency. | Blockchain for event shape; Frontend for query payloads and invalidation. |
| Frontend | Wallet integration, Streamflow picker, account builder, transaction UX, query/WS integration. | Blockchain for IDL/accounts; Backend for API and WS contracts. |

---

## 7. Team Workplan and Dependencies

### 7.1 Work Totals

| Track | Task count | Estimated hours |
|---|---:|---:|
| Blockchain | 14 | 50h (incl. sweep logic + Token-2022 guard) |
| Backend | 11 | 28h |
| Frontend | 14 | 34h |
| Total | 39 | 112h |

### 7.2 Critical Gates

1. **B0 Streamflow CPI spike**: prove `listing_pda` can transfer recipient via signer seeds. Record the Devnet `contract.version` value and use it to fill `EXPECTED_STREAMFLOW_VERSION` (C4).
2. **IDL freeze**: after instruction accounts and events are stable, Backend and Frontend consume one IDL.
3. **Indexer event replay test**: processed event idempotency must pass before UI relies on live data.
4. **Devnet end-to-end settlement**: one Buy Now and one Accept Bid path must pass with real Streamflow metadata, including a non-zero sweep test (manually deposit a few tokens into `listing_token_ata` and confirm sweep on settlement).

### 7.3 Suggested Parallel Plan

| Phase | Blockchain | Backend | Frontend |
|---|---|---|---|
| Day 1 | B0 spike, program scaffold, PDA structs | DB migration draft | Wallet setup, network constants, stream picker wrapper |
| Day 2 | Streamflow adapter, decode helpers, create listing (incl. Token-2022 reject) | REST skeleton, error envelope | Create listing form and account builder draft |
| Day 3 | submit/withdraw bid, Buy Now (with sweep) | Indexer parser skeleton | Market/listing queries and transaction state |
| Day 4 | Accept Bid (with sweep), cancel/expire (with sweep) | Processed event ledger, event handlers | Bid and settlement flows |
| Day 5 | Security constraints, Anchor tests, CU measurement | WebSocket and cache invalidation | Dashboard, refund states |
| Day 6 | Devnet deploy and scripted QA | Reconciliation cron | Full Devnet E2E |

---

## 8. Test and QA Checklist

### 8.1 Automated Tests

| Layer | Minimum cases |
|---|---|
| Anchor unit | Create listing happy; submit bid happy; withdraw bid (open + after terminal); Buy Now happy; Accept Bid happy; cancel; expire (incl. before-expires_at reject); invalid signer; invalid status; bad USDC mint; bad total calculation (`BidTotalMismatch`); bad recipient; bad Streamflow version; tradable-requirement violation (6103); policy violation (6104); Token-2022 mint reject (6106); bidder == maker reject (6107); sweep produces correct movement when `listing_token_ata` is artificially non-empty. |
| Streamflow Devnet script | create listing, Buy Now, Accept Bid, cancel, expire, version guard, transferability guard, auto-withdrawal reject, sweep on settlement. |
| Backend integration | API schemas, error envelope, idempotent event replay, user lazy upsert, refund query, reconciliation issue creation, best-bid recompute on submit and withdraw. |
| Frontend E2E | Stream picker rejection messages distinguish requirement vs policy, create listing, Buy Now, submit bid, Accept Bid, cancel with refund banner, terminal refund withdrawal, network switch. |

### 8.2 Manual Devnet QA

1. Create an eligible Streamflow Vesting contract for maker (Tradable Contracts mode, classic SPL Token mint).
2. Verify stream picker marks it eligible.
3. Create a listing with asking price.
4. Confirm Streamflow recipient becomes `listing_pda` and `listing_token_ata` exists with 0 balance.
5. Buy Now from taker wallet.
6. Confirm Streamflow recipient becomes taker, USDC reaches maker, and sweep emits `swept_token_amount = 0` on a vanilla path.
7. Create a bid-only listing.
8. Submit a bid and confirm USDC vault balance.
9. Accept the bid and confirm recipient transfer, USDC release, vault close, and sweep event.
10. Create another listing, submit a bid, cancel listing, then withdraw bid refund.
11. **Sweep regression**: artificially transfer some test tokens into a `LISTED` listing's `listing_token_ata`, then settle/cancel/expire and confirm the tokens land at the expected destination ATA with `swept_token_amount` matching.
12. **Expired path**: create a listing with `expires_at = now + 1h`, wait for expiry, run `claim_expired` from any wallet, and confirm recipient returns to maker.
13. Replay the same webhook payload and confirm DB state does not change twice.
14. Force reconciliation and confirm drift is reported without silently mutating order status.

---

## 9. Open Risks and Assumptions

| Item | Decision / mitigation |
|---|---|
| Streamflow CPI from PDA | Must be proven by B0 before main implementation continues. |
| Streamflow SDK version drift | Pin `streamflow-sdk = "=0.13.0"` and `@streamflow/stream` matching version; keep `EXPECTED_STREAMFLOW_VERSION` explicit and bump only via reviewed PR. |
| Destination ATA creation | Frontend creates missing ATAs before program calls; on-chain validates canonical ATA addresses. |
| `listing_token_ata` orphan tokens | Defensive sweep on settlement/cancel/expire (§3.3). With `automatic_withdrawal == false` the normal Streamflow flow does not auto-deposit, so sweep is expected to be a no-op in production; the path is preserved for unexpected deposits and forensic visibility. |
| On-chain market price validation | Not in v1. UI/API can warn on unusual prices, but program does not reject based on market price. |
| Losing bids after settlement | Manual refund via `withdraw_bid`; frontend must surface Refund Available. |
| Mainnet USDC mint | Must be configured per environment before deploy. |
| Compute budget | Settlement instructions include Streamflow CPI plus token transfer plus optional sweep. Anchor tests must record measured CU per instruction; SDK pre-pends `ComputeBudgetInstruction::set_compute_unit_limit(measured * 1.2)` for `create_listing`, `buy_now`, `accept_bid`, `cancel_listing`, `claim_expired`. |
| Address Lookup Tables | Settlement account fanout (listing PDA, bid PDA, vault, two USDC ATAs, Streamflow accounts, programs) is borderline for v0 transactions. If simulation exceeds limits during D5 measurement, introduce an ALT in the SDK before D6 Devnet deploy. |
| Token-2022 mints | Out of scope for v1. `create_listing` must check `token_mint.owner == spl_token::ID` and reject with `TokenProgramNotSupported` (6106). |
| Anchor `Optional<Account>` patterns | Avoided: settlement is split into `buy_now` and `accept_bid`. No optional accounts in the IDL. |
| **Plan B if B0 spike fails** | If `listing_pda` cannot be the Streamflow transfer authority via `invoke_signed`, the v1 design as specified is not implementable. The team must stop and re-scope; do not silently substitute an alternative. Possible re-scope directions are (a) maker co-sign settlement, where maker's wallet co-signs every Buy Now / Accept Bid transaction and Streamflow CPI is invoked with maker authority, or (b) a traditional SPL escrow model where vested tokens are deposited into a LOCK N ROLL escrow PDA after unlock. Both alternatives lose the "instant Buy Now without maker presence" UX guarantee that v1's atomic settlement provides; neither is promised v1 functionality and both require new PRD review before implementation begins. |

---

## 10. References

- Streamflow Transfer Contract docs: https://docs.streamflow.finance/en/articles/9670549-transfer-contract
- Streamflow Tradable Contracts docs: https://docs.streamflow.finance/en/articles/11375049-tradable-contracts
- Streamflow JS SDK docs: https://js-sdk-docs.streamflow.finance/modules/_streamflow_stream.html
- Streamflow Rust SDK `Transfer` accounts: https://docs.rs/streamflow-sdk/0.13.0/streamflow_sdk/struct.Transfer.html
- Streamflow Rust SDK `Contract` layout: https://docs.rs/streamflow-sdk/0.13.0/streamflow_sdk/state/struct.Contract.html
- Streamflow Rust SDK `CreateParams` (the `ix` sub-struct): https://docs.rs/streamflow-sdk/0.13.0/streamflow_sdk/state/struct.CreateParams.html
- Solana CPI with PDA Signer: https://solana.com/docs/core/cpi/cpi-with-pda
