# LOCK N ROLL 팀 구현 스펙

> 버전: v1.5 / 2026-05-09
> 대상: Blockchain, Backend, Frontend 구현 담당자
> 상태: v1 구현을 위한 팀 공통 기준 문서
> 변경 로그: v1.5는 B0 스파이크 통과를 반영해 Plan B 및 B0 조건부 항목을 제거. 직전 v1.4까지의 검토 픽스(C1-C5, H1-H8)는 본문에 이미 반영됨

> 영문 원본은 `design-document.md`. 두 파일이 충돌하면 영문 버전이 정본.

---

## 0. 목적

이 문서는 LOCK N ROLL v1의 단일 구현 참조 문서입니다. Blockchain, Backend, Frontend 3개 트랙이 병렬 작업하기 위한 공통 기준이며, 제품 논리(Why·What)와 외부용 자료는 별도 문서에 둡니다.

`docs/design-document.md`(영문) / `docs/design-document.ko.md`(국문)이 정본입니다. `docs/architecture.md`는 deprecated이며 구현 결정에 사용하지 마세요.

### 0.1 v1.4 → v1.5 변경 사항

B0 스파이크 통과(`listing_pda`가 signer seeds로 Streamflow recipient transfer 가능 확인)에 따른 정리:

| 영역 | 변경 |
|---|---|
| §1 Canonical 결정 | "Streamflow 통합 리스크"(B0 spike 행) 제거 — 위험 해소 |
| §6.1 환경 상수 | `EXPECTED_STREAMFLOW_VERSION`을 "B0 결과 대기"에서 "Devnet 측정값으로 PR" 톤으로 변경 |
| §7.2 Critical Gates | 게이트 #1(B0 spike) 제거 후 후속 게이트 번호 정리 |
| §7.3 권장 병렬 계획 | Day 1 Blockchain 항목에서 "B0 spike" 제거 |
| §9 Open Risks | "PDA로부터의 Streamflow CPI" 행 제거 (해소됨) |
| §9 Open Risks | "B0 spike 실패 시 Plan B" 행 제거 (분기 폐기) |
| Compute budget | 측정 책임을 D5 Anchor 테스트로 단일화 |

직전 v1.3 → v1.4 검토 픽스(C1-C5, H1-H8)는 본 문서 본문에 모두 반영되어 changelog 표는 제거됨. 필요 시 git history(`6a77811`) 참조.

---

## 1. Canonical 결정 사항

| 영역 | 결정 |
|---|---|
| 제품 범위 | v1은 Streamflow Vesting 계약만 지원. Token Lock 및 다른 vesting 프로토콜은 범위 외 |
| 토큰 프로그램 범위 | v1은 classic SPL Token mint만 지원. Token-2022(`spl-token-2022`)는 범위 외이며 create_listing에서 거부 |
| 거래 가능 stream 자격 | (a) Streamflow Tradable Contracts 요구사항 충족 + (b) LOCK N ROLL 정책 가드 통과 시에만 listable. 분리 정의는 §2.3 |
| 락업 자산 보관 | LOCK N ROLL은 락업 토큰을 escrow하지 않음. Streamflow가 보관, LOCK N ROLL은 Streamflow recipient 권리만 이전 |
| Vested 토큰 방어 | `listing_pda`가 recipient인 동안 `listing_token_ata`에 토큰이 들어올 가능성은 settle/cancel/expire에서 sweep으로 방어. `automatic_withdrawal == false`로 정상 flow는 무입금이 기본이지만 sweep을 방어적 invariant로 유지 |
| 결제 보관 | Buy Now는 USDC를 taker → maker 직송. Bid 모드는 USDC를 per-bid PDA-owned ATA에 escrow하고 accept 또는 환불 시 해제 |
| 온체인 인스트럭션 | 정확히 7개: `create_listing`, `submit_bid`, `buy_now`, `accept_bid`, `withdraw_bid`, `cancel_listing`, `claim_expired` |
| Listing 상태 | `LISTED`, `SETTLED`, `CANCELLED`, `EXPIRED`. Bid 존재 여부는 `bid_count`로 표현 (별도 listing 상태 없음) |
| Bid 상태 | `OPEN`, `ACCEPTED`, `WITHDRAWN` |
| Bid 카디널리티 | bidder 1명당 listing 1개에 대해 OPEN 또는 historical 1개의 bid: PDA seed = `["bid", listing, bidder]` |
| 환불 정책 | listing이 `SETTLED`/`CANCELLED`/`EXPIRED`인 상태의 OPEN bid는 `withdraw_bid`로 수동 환불 가능 |
| 가격 단위 | `price_per_token_micro_usdc`는 1 whole token당 micro-USDC. 온체인 결제는 모두 raw integer USDC unit |
| 오라클 범위 | v1에서 Pyth는 클라이언트/API의 표시 및 가드용. 온체인 가격 검증은 Phase 2 |

---

## 2. 공통 도메인 모델

### 2.1 핵심 용어

| 용어 | Canonical 이름 | 의미 |
|---|---|---|
| Maker | `maker_wallet` | 리스팅 전의 현 Streamflow recipient |
| Taker | `taker_wallet` | Streamflow recipient 권리를 받는 매수자 |
| Streamflow metadata | `streamflow_metadata` | Streamflow 계약 메타데이터 계정. recipient, mint, schedule, permissions 저장 |
| Listing | `listing_pda` | 하나의 Streamflow metadata 계정을 가리키는 LOCK N ROLL 주문 계정 |
| Bid | `bid_pda` | Bid 계정 + PDA-owned USDC vault |
| Listing token ATA | `listing_token_ata` | `(token_mint, listing_pda)`의 ATA. listing PDA가 Streamflow recipient가 될 때 필요. settle/cancel/expire 시 방어적 sweep의 source |
| Destination token ATA | `new_recipient_tokens` | Streamflow transfer CPI에 전달되는 `(token_mint, new_recipient)`의 ATA |
| Canonical USDC mint | `USDC_MINT` | 모든 결제 및 bid vault에서 사용하는 환경별 USDC mint |

### 2.2 Streamflow Contract 디코드

`streamflow_sdk::state::Contract`(crate 버전은 §6.1에 핀)를 온체인 metadata layout으로 사용합니다. 이 계정은 Anchor discriminator가 없습니다. SDK가 지원하는 unchecked Borsh 경로로 디코드하며, 버전 가드와 함께 사용하면 Streamflow의 forward-compatible trailing 필드도 안전하게 허용합니다:

```rust
use anchor_lang::prelude::*;
use anchor_lang::solana_program::borsh::try_from_slice_unchecked;
use streamflow_sdk::state::Contract;

let data = streamflow_metadata.try_borrow_data()?;
let contract: Contract = try_from_slice_unchecked(&data)
    .map_err(|_| error!(ErrorCode::InvalidStreamMetadata))?;
```

이 계정에 Anchor account deserialization을 사용하지 않습니다.

### 2.3 Stream Eligibility 가드

`create_listing`은 모든 가드가 통과할 때만 stream을 받아들입니다. 가드는 의도가 다른 두 그룹으로 분리되어 있어, dev와 QA가 Streamflow 프로토콜 요구사항과 LOCK N ROLL 정책을 혼동하지 않게 합니다.

#### 2.3.1 Streamflow Tradable Contracts 요구사항

이 두 가지는 Streamflow의 Tradable Contracts 기능 자체가 강제하는 조건입니다.

| 가드 | 필요 값 |
|---|---|
| Recipient transfer | `contract.ix.transferable_by_recipient == true` |
| Sender cancellation | `contract.ix.cancelable_by_sender == false` |

#### 2.3.2 LOCK N ROLL 마켓플레이스 정책

이 가드들은 Streamflow는 허용하지만 LOCK N ROLL이 결제 추론을 단순·안전하게 유지하기 위해 v1에서 거부하는 추가 정책입니다.

| 가드 | 필요 값 | 근거 |
|---|---|---|
| Sender transfer | `contract.ix.transferable_by_sender == false` | listing 중 sender가 transfer authority를 회수하는 것 방지 |
| Recipient cancellation | `contract.ix.cancelable_by_recipient == false` | 거래 상대방이 stream을 임의로 취소하는 것 방지 |
| Top-up | `contract.ix.can_topup == false` | 가격 산정 기준이 되는 deposit 양 스냅샷을 고정 |
| Auto withdrawal | `contract.ix.automatic_withdrawal == false` | listing 중 vested 토큰이 `listing_token_ata`에 누적될 가능성을 줄임 |

#### 2.3.3 구조적 가드 (모든 CPI-touching 인스트럭션마다 재검증)

Streamflow 상태를 읽거나 쓰는 모든 인스트럭션은 매번 재검증해야 합니다:

| 가드 | 필요 값 |
|---|---|
| Metadata owner | `streamflow_metadata.owner == STREAMFLOW_PROGRAM_ID` |
| Version | `contract.version == EXPECTED_STREAMFLOW_VERSION` |
| Mint | `contract.mint == listing.token_mint` |
| Closed | `contract.closed == false` |
| Current recipient | `contract.recipient == maker_wallet` (`create_listing`만) 또는 `contract.recipient == listing_pda` (`buy_now`, `accept_bid`, `cancel_listing`, `claim_expired`) |

`create_listing`은 추가로 `token_mint`가 classic SPL Token program 소유인지 검증합니다 (Token-2022 mint는 `TokenProgramNotSupported`로 거부).

### 2.4 금액·반올림

모든 토큰·결제 금액은 온체인에서 integer raw unit입니다.

| 필드 | 타입 | 단위 |
|---|---|---|
| `vesting_amount_raw` | `u64` | 핀된 Streamflow `Contract`의 잔여 raw 토큰: net stream amount − already claimed |
| `token_decimals` | `u8` | SPL mint 계정의 decimals |
| `price_per_token_micro_usdc` | `u64` | 1 whole token당 micro-USDC |
| `total_usdc_raw` | `u64` | 이전 또는 escrow되는 raw USDC unit |

결제 합계:

```text
denom = 10 ^ token_decimals
numerator = price_per_token_micro_usdc * vesting_amount_raw
total_usdc_raw = ceil(numerator / denom)
```

구현은 checked integer math와 ceil 분할 공식 `(numerator + denom - 1) / denom`을 사용해야 합니다.

할인율 표시:

```text
discount_rate = 1 - (price_per_token / market_price)
```

이 값은 v1에서 표시·API 데이터 전용입니다.

---

## 3. 온체인 컨트랙트 스펙

### 3.1 프로그램 계정

| 계정 | Seed / 유도 | 저장 또는 검증 필드 |
|---|---|---|
| `Listing` | `["listing", maker, streamflow_metadata, nonce]` | `maker`, `streamflow_metadata`, `token_mint`, `token_decimals`, `vesting_amount_raw`, `unlock_at`, `asking_price_micro_usdc: Option<u64>`, `expires_at`, `status`, `bid_count`, `nonce`, `bump` |
| `Bid` | `["bid", listing, bidder]` | `listing`, `bidder`, `price_per_token_micro_usdc`, `total_usdc_raw`, `status`, `bump` |
| `BidUsdcVault` | `(USDC_MINT, bid_pda)`의 ATA | 토큰 계정 authority는 `bid_pda`. mint는 canonical USDC |
| `ListingTokenAta` | `(token_mint, listing_pda)`의 ATA | `listing_pda`로 Streamflow recipient를 이전하기 전에 존재해야 함. settle/cancel/expire 시 방어적 sweep의 source |
| 사용자 token ATA | `(token_mint, taker/bidder/maker)`의 ATA | settle/cancel CPI 전에 존재해야 함 |

ATA 소유권 메모: ATA는 SPL Token Program이 소유합니다. authority는 ATA owner로 전달되는 wallet 또는 PDA입니다.

### 3.2 Streamflow Transfer CPI 계정

`StreamflowAdapter.transfer_recipient`는 Streamflow SDK의 transfer 인스트럭션 account 형태를 wrapping합니다. wrapper는 의도적으로 `authority`를 `AccountInfo<'info>`로 타이핑합니다 — 같은 호출 사이트가 wallet signer와 PDA signer를 모두 지원해야 하기 때문입니다. 실제 서명은 `solana_program::program::invoke_signed`로 처리하며, Anchor의 `Signer<'info>` 타이핑을 의도적으로 우회합니다. 이는 동일 인스트럭션이 `signer_seeds = None`(create_listing의 maker wallet 경로)과 `signer_seeds = Some(...)`(나머지 인스트럭션의 PDA 경로) 모두로 호출되기 때문입니다.

```rust
pub struct TransferRecipientAccounts<'info> {
    pub authority: AccountInfo<'info>, // wallet 또는 listing_pda; invoke_signed로 서명
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

Streamflow SDK 0.13.0의 실제 `Transfer` 구조체는 `authority`를 `Signer<'info>`로 타이핑합니다. 우리는 같은 호출 사이트에 PDA를 받아야 하므로 그 wrapper를 직접 사용할 수 없습니다. Streamflow program이 authority를 `contract.recipient`와 비교하는 검증은 Anchor wrapper 타입과 무관하게 동작하므로, 올바른 signer seeds와 함께 `AccountInfo`를 전달하면 기능적으로 동등합니다.

Authority 규칙:

| 인스트럭션 | Streamflow transfer authority | Signer 모드 |
|---|---|---|
| `create_listing` | `maker` | 일반 wallet signer (`signer_seeds = None`) |
| `buy_now` | `listing_pda` | PDA signer seeds |
| `accept_bid` | `listing_pda` | PDA signer seeds |
| `cancel_listing` | `listing_pda` | PDA signer seeds |
| `claim_expired` | `listing_pda` | PDA signer seeds |

Destination ATA 규칙:

| 인스트럭션 | `new_recipient` | `new_recipient_tokens` |
|---|---|---|
| `create_listing` | `listing_pda` | `listing_token_ata`. 같은 트랜잭션에서 program 호출 전에 생성 가능 |
| `buy_now` | `taker` | Taker token ATA. Streamflow CPI 전에 존재해야 함 |
| `accept_bid` | `bid.bidder` | Bidder token ATA. Streamflow CPI 전에 존재해야 함 |
| `cancel_listing` | `maker` | Maker token ATA. Streamflow CPI 전에 존재해야 함 |
| `claim_expired` | `listing.maker` | Maker token ATA. Streamflow CPI 전에 존재해야 함 |

transfer authority가 `listing_pda`일 때 Streamflow CPI가 destination ATA를 자동 생성한다고 가정하지 마세요. 누락 시 클라이언트가 먼저 생성해야 합니다.

### 3.3 인스트럭션

| 인스트럭션 | 호출자 | 주요 효과 |
|---|---|---|
| `create_listing` | Maker | 자격 통과한 Streamflow 계약(classic SPL Token mint 포함)을 검증, `Listing` 초기화, `listing_token_ata` 생성/사용, Streamflow recipient를 maker → `listing_pda`로 이전, `ListingCreated` emit |
| `submit_bid` | Bidder | 예상 `total_usdc_raw` 계산, 제출값 검증, `Bid`와 `BidUsdcVault` 초기화, USDC를 vault로 이전, `bid_count++`, `BidSubmitted` emit |
| `buy_now` | Taker | asking 가격과 stream recipient 검증, Streamflow recipient를 taker로 이전, **현재 `listing_token_ata` 잔고를 taker token ATA로 sweep (방어적, §1 참고)**, USDC를 taker → maker로 이전, listing을 `SETTLED`, `OrderTaken` emit. 기존 OPEN bid는 환불 가능 상태 유지 |
| `accept_bid` | Maker | bid와 vault 검증, Streamflow recipient를 bidder로 이전, **현재 `listing_token_ata` 잔고를 bidder token ATA로 sweep**, vault USDC를 maker로 release, vault close, bid를 `ACCEPTED`, listing을 `SETTLED`, `OrderTaken` emit. 다른 OPEN bid는 환불 가능 상태 유지 |
| `withdraw_bid` | Bidder | OPEN bid의 vault USDC를 bidder로 반환하고 vault close. accept 전 또는 listing terminal 상태 후에도 동작. `BidWithdrawn` emit |
| `cancel_listing` | Maker | Streamflow recipient를 maker로 환원, **현재 `listing_token_ata` 잔고를 maker token ATA로 sweep**, listing을 `CANCELLED`, `ListingCancelled` emit. OPEN bid는 환불 가능 상태 유지 |
| `claim_expired` | Anyone | `expires_at` 이후, Streamflow recipient를 maker로 환원, **현재 `listing_token_ata` 잔고를 maker token ATA로 sweep**, listing을 `EXPIRED`, `ListingExpired` emit. OPEN bid는 환불 가능 상태 유지 |

Sweep 의미: 구현은 (Streamflow CPI 후 시점의) `listing_token_ata.amount`를 PDA signer seeds를 사용해 `token::transfer`로 destination ATA에 전송한 후, 선택적으로 `token::close_account`로 rent를 회수합니다. 잔고가 0이면 no-op이며, 이는 v1 자격 규칙 하의 정상 케이스입니다.

### 3.4 인스트럭션 검증 항목

| 인스트럭션 | 필요 검증 |
|---|---|
| `create_listing` | Maker signer; nonce 기반 listing 미초기화; `now + 1h <= expires_at <= unlock_at`; classic SPL Token mint (Token-2022 거부); 모든 Stream eligibility 가드(§2.3); `asking_price_micro_usdc` absent 또는 `> 0`; `listing_token_ata`가 `(token_mint, listing_pda)`의 canonical ATA |
| `submit_bid` | Bidder signer; bidder ≠ maker; listing `LISTED`; `(listing, bidder)`의 bid PDA 미초기화; price `> 0`; 계산된 total과 제출 total 일치; bidder USDC source mint = `USDC_MINT`; vault mint = `USDC_MINT`; vault authority = bid PDA |
| `buy_now` | Taker signer; listing `LISTED`; asking 가격 존재; current recipient = `listing_pda`인 §2.3.3 구조적 가드; taker USDC source mint = `USDC_MINT`; maker USDC dest mint = `USDC_MINT`; taker token ATA = `(token_mint, taker)` 일치; total은 checked ceil 공식; sweep 목적지 = taker token ATA |
| `accept_bid` | Maker signer; listing `LISTED`; bid `OPEN`; bid가 listing에 속함; §2.3.3 구조적 가드; vault = `(USDC_MINT, bid_pda)`의 ATA; vault 금액 = `bid.total_usdc_raw`; bidder token ATA = `(token_mint, bid.bidder)` 일치; sweep 목적지 = bidder token ATA |
| `withdraw_bid` | Bidder signer; bid `OPEN`; vault = `(USDC_MINT, bid_pda)`의 ATA; vault 금액 = `bid.total_usdc_raw`; bidder USDC dest mint = `USDC_MINT` |
| `cancel_listing` | Maker signer; listing `LISTED`; current recipient = `listing_pda`인 §2.3.3 구조적 가드; maker token ATA = `(token_mint, maker)` 일치; sweep 목적지 = maker token ATA |
| `claim_expired` | listing `LISTED`; current time `>= expires_at`; current recipient = `listing_pda`인 §2.3.3 구조적 가드; maker token ATA = `(token_mint, maker)` 일치; sweep 목적지 = maker token ATA |

### 3.5 상태 전이

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
  모든 OPEN bid는 withdraw_bid로 환불 가능.
  parent listing이 SETTLED/CANCELLED/EXPIRED인 경우 Frontend는 refund available로 표시해야 함.
```

### 3.6 이벤트

| 이벤트 | 필수 필드 |
|---|---|
| `ListingCreated` | `listing_pda`, `maker`, `streamflow_metadata`, `token_mint`, `token_decimals`, `vesting_amount_raw`, `asking_price_micro_usdc`, `expires_at`, `slot` |
| `BidSubmitted` | `bid_pda`, `listing_pda`, `bidder`, `price_per_token_micro_usdc`, `total_usdc_raw`, `slot` |
| `BidWithdrawn` | `bid_pda`, `listing_pda`, `bidder`, `total_usdc_raw`, `slot` |
| `OrderTaken` | `listing_pda`, `streamflow_metadata`, `maker`, `taker`, `token_mint`, `vesting_amount_raw`, `price_per_token_micro_usdc`, `total_usdc_raw`, `mode`(string enum: `asking` 또는 `bid`), `accepted_bid_pda?`, `swept_token_amount`, `slot` |
| `ListingCancelled` | `listing_pda`, `maker`, `streamflow_metadata`, `swept_token_amount`, `slot` |
| `ListingExpired` | `listing_pda`, `maker`, `streamflow_metadata`, `swept_token_amount`, `slot` |

`swept_token_amount`는 인스트럭션 중 `listing_token_ata`에서 실제로 sweep된 raw 토큰 양입니다. v1 자격 규칙 하에서는 정상 flow가 0이며, non-zero인 경우 forensic 가시성을 위해 기록됩니다.

### 3.7 에러 코드

| 코드 | 이름 | 의미 |
|---|---|---|
| 6000 | `InvalidStatus` | 현재 listing/bid 상태에서 허용되지 않는 인스트럭션 |
| 6001 | `Expired` | 시도 전 listing이 만료됨 |
| 6002 | `NumericOverflow` | checked math 실패 |
| 6003 | `Unauthorized` | 해당 액션의 signer로 허용되지 않음 |
| 6100 | `InvalidStreamMetadata` | Streamflow metadata 디코드 실패 |
| 6101 | `RecipientMismatch` | 라이브 Streamflow recipient가 예상과 다름 |
| 6102 | `StreamflowVersionMismatch` | Streamflow metadata 버전이 핀 버전과 다름 |
| 6103 | `StreamNotTransferable` | Streamflow Tradable Contracts 요구사항(§2.3.1) 위반 |
| 6104 | `StreamPolicyViolation` | LOCK N ROLL 마켓플레이스 정책(§2.3.2) 위반 |
| 6105 | `RecipientAtaMissingOrInvalid` | destination ATA가 없거나 canonical ATA가 아님 |
| 6106 | `TokenProgramNotSupported` | mint가 classic SPL Token program 소유가 아님 (Token-2022 거부) |
| 6107 | `BidderIsMaker` | bidder는 listing maker가 될 수 없음 |
| 6200 | `AskingNotSet` | bid-only listing에서 Buy Now 시도 |
| 6201 | `ExpiresAtOutOfRange` | 만료 시각이 `[now + 1h, unlock_at]` 범위 밖 |
| 6202 | `NonceCollision` | 제출된 nonce에 대해 listing PDA가 이미 존재 |
| 6300 | `BidPdaMismatch` | bid PDA가 `(listing, bidder)`와 불일치 |
| 6301 | `InvalidBidStatus` | bid가 `OPEN`이 아님 |
| 6302 | `UsdcMintMismatch` | USDC 계정이 canonical mint가 아님 |
| 6303 | `UsdcAmountMismatch` | vault/source 금액이 예상 total과 불일치 |
| 6304 | `BidTotalMismatch` | 제출된 bid total이 계산된 total과 불일치 |

---

## 4. 백엔드·인덱서 스펙

### 4.1 책임 분담

| 컴포넌트 | 책임 |
|---|---|
| Indexer | LOCK N ROLL 이벤트 파싱, lazy user upsert, 온체인 상태 미러, idempotency, 캐시 invalidation, WebSocket broadcast |
| REST API | market, listing detail, streams, bids, history, health에 대한 read-only 쿼리 |
| WebSocket 서버 | 정규화된 이벤트 payload push |
| PostgreSQL | 온체인 상태 + processed event ledger의 영속 미러 |
| Redis | market/listing/stream 쿼리용 단명 read 캐시 |
| Reconciliation cron | active orders와 라이브 Streamflow metadata 비교, drift 보고 |

### 4.2 PostgreSQL 스키마

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
  -- H5: `expires_at > created_at + 1h` 제거. created_at은 indexer ingest time이라
  -- Solana clock과 drift가 발생할 수 있음. 온체인 program이 이미 Solana time 기준
  -- 최소값을 create_listing에서 강제하므로 DB는 unlock_at 상한만 검증.
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
  -- C2: 정밀도 의도를 명시적 numeric 캐스팅으로 분명히 하고, 어떤 ORM/마이그레이션
  -- 라운드트립도 정수형 나눗셈으로 재유도하지 않도록 방어.
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
  event_index INT NOT NULL,    -- H2: tx.meta.innerInstructions / log message 순서로
                               -- 파싱한 emit! 이벤트의 0-base ordinal.
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

### 4.3 Indexer 규칙

파싱된 모든 이벤트마다:

1. DB 트랜잭션 시작
2. 위의 H2 정의에 따라 `processed_events(tx_signature, event_index, event_type)` insert
3. insert 충돌 시 모든 후속 변경 skip 후 success 반환
4. 이벤트가 참조하는 모든 wallet을 `users`에 lazy upsert
5. 상태 변경 적용
6. Redis 키 invalidate
7. commit
8. commit 후 WebSocket payload broadcast

이벤트 적용:

| 이벤트 | DB 변경 |
|---|---|
| `ListingCreated` | maker upsert, order를 `LISTED`로 insert |
| `BidSubmitted` | bidder upsert, bid를 `OPEN`으로 insert, order `bid_count++`, `best_bid_price_micro_usdc` 재계산 (아래 H3 SQL) |
| `BidWithdrawn` | bid를 `WITHDRAWN`으로 update; order가 여전히 `LISTED`일 때만 `bid_count--`; `best_bid_price_micro_usdc` 재계산 (H3 SQL) |
| `OrderTaken` | trade_history insert, order를 `SETTLED`로, mode가 `bid`인 경우 accepted bid를 `ACCEPTED`로; 다른 OPEN bid는 환불을 위해 그대로 유지. forensic 가시성을 위해 `swept_token_amount` 보존 |
| `ListingCancelled` | order를 `CANCELLED`로; OPEN bid 그대로 유지. `swept_token_amount` 보존 |
| `ListingExpired` | order를 `EXPIRED`로; OPEN bid 그대로 유지. `swept_token_amount` 보존 |

H3 — best bid 재계산 (`BidSubmitted`와 `BidWithdrawn`에서 실행):

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

메모: maker 입장에서 더 높은 bid가 더 좋으므로 `MAX`. OPEN bid가 없으면 결과는 `NULL`이며 이것이 `best_bid_price_micro_usdc`의 올바른 의미.

### 4.4 REST API

모든 에러는 다음 envelope을 사용:

```json
{ "error": { "code": "STRING_CODE", "message": "Human readable", "details": {} } }
```

| Method | Path | 목적 |
|---|---|---|
| `GET` | `/orders` | 마켓 리스트. 필터: `status`, `token`, `buy_now_only`, `min_discount`, `sort`, `cursor` |
| `GET` | `/orders/:listing_pda` | bids와 Streamflow metadata 캐시 포함 listing 상세 |
| `GET` | `/streams/:wallet` | Maker stream picker 데이터. 가능한 경우 v1 자격 stream만 반환하고, 부적격 stream은 거부 사유 포함. 응답 shape는 §6.2의 `StreamCandidate` |
| `GET` | `/bids` | Bid 리스트. 필터: `wallet`, `listing`, `status`, `refund_available=true` |
| `GET` | `/history` | 체결된 거래. 필터: `wallet`, `token`, `mode`, `from`, `to`, `cursor` |
| `GET` | `/tokens/:mint/stats` | 토큰별 listing/체결 통계 |
| `GET` | `/health` | API/indexer 헬스: `ok`, `slot`, `lag_ms`, `reconcile_lag_min` |

`refund_available=true`는 bid status가 `OPEN`이고 parent order status가 `SETTLED`/`CANCELLED`/`EXPIRED`인 경우.

### 4.5 WebSocket 채널

| 채널 | Payload |
|---|---|
| `market.tick` | `{ active_count, settled_count, ts }` |
| `order.created` | `ListingCreated` 정규화 payload |
| `order.bid_changed` | `{ event_type: "submitted" | "withdrawn", bid_pda, listing_pda, bidder, price_per_token_micro_usdc, total_usdc_raw }` |
| `order.settled` | `OrderTaken` 정규화 payload |
| `order.cancelled` | `{ event_type: "cancelled" | "expired", listing_pda, swept_token_amount }` |
| `user.{wallet}` | 해당 wallet과 관련된 모든 이벤트 (환불 가능 변경 포함) |

### 4.6 Reconciliation cron

`orders.status = 'LISTED'`에 대해 매시간 실행:

| 검사 | 조치 |
|---|---|
| Streamflow metadata 누락 또는 owner 불일치 | `reconciliation_issues` row insert + alert |
| 라이브 recipient ≠ `listing_pda` | issue row insert + alert; order 상태를 자동 변경하지 않음 |
| 버전 불일치 | issue row insert + 해당 listing을 API 응답에서 warning metadata와 함께 일시 보류 |
| Mint 불일치 | issue row insert + alert |
| `vesting_amount_raw` drift > 5% | 캐시 업데이트, 구/신값과 함께 issue row insert |
| `LISTED` order의 `listing_token_ata` non-zero 잔고 | issue row insert (forensic, 방어적 sweep으로 0이 정상이어야 함) |

---

## 5. 프론트엔드 통합 스펙

### 5.1 SDK 메서드

Frontend는 Anchor 호출을 typed LOCK N ROLL SDK로 wrapping합니다. H4 — 명시적 param 타입:

```ts
type CreateListingParams = {
  streamflowMetadata: PublicKey;
  askingPriceMicroUsdc?: bigint;     // bid-only listing이면 생략
  expiresAt: Date;                   // now+1h <= expiresAt <= unlockAt
  nonce: bigint;                     // 64-bit random; §5.2 H1 전략 참고
};

type SubmitBidParams = {
  listingPda: PublicKey;
  pricePerTokenMicroUsdc: bigint;
  totalUsdcRaw: bigint;              // 클라이언트는 §2.4에 따라 일치하는 total을 계산해야 함
};

type BuyNowParams       = { listingPda: PublicKey };
type AcceptBidParams    = { listingPda: PublicKey; bidder: PublicKey };
type WithdrawBidParams  = { listingPda: PublicKey };
type CancelListingParams = { listingPda: PublicKey };
type ClaimExpiredParams = { listingPda: PublicKey };
```

| SDK 메서드 | Program 인스트럭션 |
|---|---|
| `createListing(params: CreateListingParams)` | `create_listing` |
| `submitBid(params: SubmitBidParams)` | `submit_bid` |
| `buyNow(params: BuyNowParams)` | `buy_now` |
| `acceptBid(params: AcceptBidParams)` | `accept_bid` |
| `withdrawBid(params: WithdrawBidParams)` | `withdraw_bid` |
| `cancelListing(params: CancelListingParams)` | `cancel_listing` |
| `claimExpired(params: ClaimExpiredParams)` | `claim_expired` |

화면 곳곳에서 raw account 조립을 노출하지 마세요. 모든 트랜잭션 흐름은 하나의 account-builder 모듈을 공유합니다.

### 5.2 Stream Picker (H1 nonce 전략)

Frontend는 `@streamflow/stream` 위에 `listRecipientStreams(wallet, network)` 로컬 wrapper를 둡니다. wrapper는 SDK 응답을 §6.2의 `StreamCandidate`로 정규화해야 합니다.

Listing nonce 전략 (H1):

```ts
// 64-bit random nonce; 온체인이 NonceCollision으로 충돌 거부.
function nextListingNonce(): bigint {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return new DataView(buf.buffer).getBigUint64(0);
}
// NonceCollision 시 SDK는 새 nonce로 최대 3회 retry 후 surface.
```

Frontend와 Backend는 §2.3의 동일한 자격 규칙을 사용해야 하며, 거부 사유는 `StreamCandidate.rejectionReasons`로 surface합니다.

### 5.3 트랜잭션 account 조립

| 흐름 | Frontend의 account 책임 |
|---|---|
| `createListing` | listing PDA 유도; `listing_token_ata` 누락 시 생성; maker, metadata, mint, Streamflow program, rent, token, associated token, system program 계정 전달. compute budget 인스트럭션 prepend (§9 참고) |
| `submitBid` | bid PDA와 USDC vault 유도; `total_usdc_raw` 계산; bidder USDC source와 vault 계정 전달 |
| `buyNow` | taker token ATA 존재 보장; taker USDC source와 maker USDC dest 전달; Streamflow transfer CPI 계정 전달; compute budget prepend |
| `acceptBid` | bidder token ATA 존재 보장; bid vault와 maker USDC dest 전달; Streamflow transfer CPI 계정 전달; compute budget prepend |
| `withdrawBid` | bid vault와 bidder USDC dest 전달 |
| `cancelListing` / `claimExpired` | maker token ATA 존재 보장; Streamflow transfer CPI 계정 전달; compute budget prepend |

### 5.4 UI 상태 규칙

| UI 조건 | 필요 동작 |
|---|---|
| Wallet 미연결 | 트랜잭션 액션 비활성화, 클릭 시 wallet modal |
| Stream 부적격 | `StreamCandidate.rejectionReasons`의 구체적 사유 노출; listing 불허. 카피에서 "Streamflow Tradable Contracts 요구사항"과 "LOCK N ROLL 정책"을 구분 |
| Listing에 asking 가격 있음 | Buy Now와 Place Bid 둘 다 표시 |
| Listing에 asking 가격 없음 | Place Bid만 표시 |
| Bid가 `OPEN`이고 listing이 `LISTED` | Withdraw 액션과 함께 pending bid 표시 |
| Bid가 `OPEN`이고 listing이 terminal | Withdraw 액션과 함께 Refund Available 표시 |
| Buy Now 진행 중 `OrderTaken` 도착 | 사용자 자신의 트랜잭션이 confirm/fail되기 전에라도 WS 이벤트 수신 시 Buy Now 버튼을 낙관적으로 비활성화 (race-loss UX 사고 방지) |
| 트랜잭션 진행 중 | 공통 tx 상태 사용: `building`, `awaiting_signature`, `sent`, `confirming`, `confirmed`, `failed` |
| 네트워크 전환 | RPC endpoint, LOCK N ROLL program ID, Streamflow program ID, USDC mint, 캐시 namespace를 동시 swap |

### 5.5 쿼리·캐시 invalidation

| 이벤트 | Frontend invalidation |
|---|---|
| `order.created` | `/orders`, maker의 stream picker |
| `order.bid_changed` | listing 상세, maker dashboard, bidder dashboard |
| `order.settled` | `/orders`, listing 상세, listing의 모든 bid, maker/taker/bidder dashboard |
| `order.cancelled` | `/orders`, listing 상세, listing의 모든 bid, maker/bidder dashboard |

---

## 6. 팀 간 인터페이스 계약

### 6.1 환경 상수

| 상수 | Local | Devnet | Mainnet |
|---|---|---|---|
| `LOCK_N_ROLL_PROGRAM_ID` | `localnet` | `<DEV_LNR>` | `<PROD_LNR>` |
| `STREAMFLOW_PROGRAM_ID` | `streamflow-mock` | `HqDGZjaVRXJ9MGRQEw7qDc2rAr6iH1n1kAQdCZaCMfMZ` | `strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m` |
| `USDC_MINT` | local test mint | devnet test USDC mint | canonical mainnet USDC mint |
| `EXPECTED_STREAMFLOW_VERSION` | `4` | `4` | `4` (업그레이드 관측되지 않는 한 Devnet과 일치; audit 후 PR로 변경) |
| Anchor crate 버전 | 0.30.x (핀) | 0.30.x | 0.30.x |
| streamflow-sdk crate 버전 | 0.13.0 (핀) | 0.13.0 | 0.13.0 |
| `@streamflow/stream` 패키지 버전 | 8.4.0 (핀) | 8.4.0 | 8.4.0 |

Devnet QA 전 실제 `USDC_MINT` 값을 채워야 합니다. `EXPECTED_STREAMFLOW_VERSION = 4`는 B0 스파이크에서 확인된 값으로 핀됨. JS와 Rust SDK는 독립적으로 버저닝되며, v1은 `@streamflow/stream@8.4.0` + `streamflow-sdk = "=0.13.0"` 조합을 사용합니다.

### 6.2 공통 타입

```ts
type ListingStatus = "LISTED" | "SETTLED" | "CANCELLED" | "EXPIRED";
type BidStatus = "OPEN" | "ACCEPTED" | "WITHDRAWN";
type SettlementMode = "asking" | "bid";

type ApiAmount = string; // raw integer unit을 decimal string으로 인코딩

// H6: §5.2에서 공통 인터페이스 surface로 승격
type StreamCandidate = {
  streamflowMetadata: string;
  mint: string;
  tokenDecimals: number;
  vestingAmountRaw: ApiAmount;
  unlockAt: string; // ISO 8601
  eligible: boolean;
  rejectionReasons: Array<
    | "TRADABLE_CONTRACTS_REQUIREMENT" // §2.3.1 위반
    | "LOCK_N_ROLL_POLICY"             // §2.3.2 위반
    | "STRUCTURAL"                     // §2.3.3 위반 (closed, mint, owner)
    | "TOKEN_2022_NOT_SUPPORTED"
  >;
  rejectionDetails?: string[];         // human-readable 구체 사유
};
```

### 6.3 팀 책임

| Owner | 소유 영역 | 협업 필요 대상 |
|---|---|---|
| Blockchain | Anchor program, Streamflow adapter, account 제약, 이벤트 필드, Anchor 테스트, Devnet 배포 | 이벤트 payload(Backend), account builder/IDL(Frontend) |
| Backend | DB 스키마, indexer, REST API, WebSocket, reconciliation cron, idempotency | 이벤트 형태(Blockchain), 쿼리 payload/invalidation(Frontend) |
| Frontend | wallet 통합, Streamflow picker, account builder, 트랜잭션 UX, 쿼리/WS 통합 | IDL/accounts(Blockchain), API/WS 계약(Backend) |

---

## 7. 팀 작업 계획·의존성

### 7.1 작업 총량

| 트랙 | 작업 수 | 예상 시간 |
|---|---:|---:|
| Blockchain | 14 | 50h (sweep 로직 + Token-2022 가드 포함) |
| Backend | 11 | 28h |
| Frontend | 14 | 34h |
| 합계 | 39 | 112h |

### 7.2 Critical Gates

1. **IDL freeze**: 인스트럭션 account와 이벤트가 안정화된 후, Backend와 Frontend가 동일 IDL 사용
2. **Indexer event replay 테스트**: UI가 라이브 데이터에 의존하기 전에 processed event idempotency 통과
3. **Devnet end-to-end 결제**: 실제 Streamflow metadata로 Buy Now 1회 + Accept Bid 1회 성공. non-zero sweep 테스트 포함 (`listing_token_ata`에 토큰을 임의로 입금 후 settle 시 sweep 확인)

### 7.3 권장 병렬 계획

| 단계 | Blockchain | Backend | Frontend |
|---|---|---|---|
| Day 1 | program scaffold, PDA struct, Streamflow 어댑터 인터페이스 | DB 마이그레이션 초안 | wallet setup, network 상수, stream picker wrapper |
| Day 2 | Streamflow adapter, decode helpers, create_listing (Token-2022 거부 포함) | REST 골격, error envelope | create listing 폼, account builder 초안 |
| Day 3 | submit_bid/withdraw_bid, Buy Now (sweep 포함) | indexer parser 골격 | market/listing 쿼리, 트랜잭션 상태 |
| Day 4 | Accept Bid (sweep 포함), cancel/expire (sweep 포함) | processed event ledger, 이벤트 핸들러 | bid 및 결제 흐름 |
| Day 5 | 보안 제약, Anchor 테스트, CU 측정 | WebSocket과 캐시 invalidation | dashboard, refund 상태 |
| Day 6 | Devnet 배포 + 스크립트 QA | reconciliation cron | 전체 Devnet E2E |

---

## 8. 테스트·QA 체크리스트

### 8.1 자동화 테스트

| 레이어 | 최소 케이스 |
|---|---|
| Anchor unit | create_listing happy; submit_bid happy; withdraw_bid (open + 종결 후); Buy Now happy; Accept Bid happy; cancel; expire (expires_at 전 거부 포함); 잘못된 signer; 잘못된 status; 잘못된 USDC mint; 잘못된 total 계산(`BidTotalMismatch`); 잘못된 recipient; 잘못된 Streamflow 버전; tradable 요구사항 위반(6103); 정책 위반(6104); Token-2022 mint 거부(6106); bidder == maker 거부(6107); `listing_token_ata`를 인위적으로 채웠을 때 sweep이 올바르게 이전되는지 확인 |
| Streamflow Devnet 스크립트 | create listing, Buy Now, Accept Bid, cancel, expire, 버전 가드, transferability 가드, auto-withdrawal 거부, 결제 시 sweep |
| Backend integration | API 스키마, error envelope, 멱등 event replay, user lazy upsert, refund 쿼리, reconciliation issue 생성, submit/withdraw 시 best-bid 재계산 |
| Frontend E2E | stream picker 거부 메시지가 요구사항/정책을 구분, create listing, Buy Now, submit bid, Accept Bid, cancel + refund banner, terminal refund 인출, 네트워크 전환 |

### 8.2 수동 Devnet QA

1. maker용 자격 통과한 Streamflow Vesting 계약 생성 (Tradable Contracts 모드, classic SPL Token mint)
2. stream picker가 eligible로 표시하는지 확인
3. asking 가격으로 listing 생성
4. Streamflow recipient가 `listing_pda`가 되고 `listing_token_ata`가 0 잔고로 존재하는지 확인
5. taker wallet으로 Buy Now
6. Streamflow recipient가 taker로, USDC가 maker로 도착, 정상 경로에서 sweep이 `swept_token_amount = 0`을 emit하는지 확인
7. bid-only listing 생성
8. bid 제출 후 USDC vault 잔고 확인
9. bid 수락 후 recipient 이전, USDC release, vault close, sweep 이벤트 확인
10. 다른 listing 생성, bid 제출, listing 취소, bid refund 인출
11. **Sweep regression**: `LISTED` listing의 `listing_token_ata`에 테스트 토큰을 임의로 transfer한 후 settle/cancel/expire 실행. 토큰이 예상 destination ATA로 도착하고 `swept_token_amount`가 일치하는지 확인
12. **만료 경로**: `expires_at = now + 1h`로 listing 생성, 만료 대기 후 누구나 wallet으로 `claim_expired` 실행. recipient가 maker로 환원되는지 확인
13. 동일 webhook payload를 재전송하여 DB 상태가 두 번 변경되지 않는지 확인
14. reconciliation 강제 실행 후 drift가 보고되되 order 상태를 자동 변경하지 않는지 확인

---

## 9. Open Risks & 가정

| 항목 | 결정 / 완화 |
|---|---|
| Streamflow SDK 버전 drift | `streamflow-sdk = "=0.13.0"`과 매칭되는 `@streamflow/stream` 핀; `EXPECTED_STREAMFLOW_VERSION`을 명시적으로 유지하고 리뷰된 PR로만 bump |
| Destination ATA 생성 | Frontend가 program 호출 전에 누락 ATA 생성; 온체인은 canonical ATA 주소 검증 |
| `listing_token_ata` orphan 토큰 | settle/cancel/expire에서 방어적 sweep (§3.3). `automatic_withdrawal == false`로 정상 Streamflow flow는 자동 입금하지 않으므로 sweep은 production에서 no-op이 기본; 예상 외 입금과 forensic 가시성을 위해 경로 보존 |
| 온체인 시장가 검증 | v1에서 미적용. UI/API에서 비정상 가격 경고 가능하지만 program은 시장가 기반 거부하지 않음 |
| 결제 후 패배한 bid | `withdraw_bid`로 수동 환불; Frontend가 Refund Available을 surface해야 함 |
| Mainnet USDC mint | 배포 전 환경별 설정 필수 |
| Compute budget | 결제 인스트럭션은 Streamflow CPI + token transfer + (선택) sweep을 포함. Anchor 테스트에서 인스트럭션별 CU를 측정하고 SDK가 `create_listing`, `buy_now`, `accept_bid`, `cancel_listing`, `claim_expired`에 대해 `ComputeBudgetInstruction::set_compute_unit_limit(measured * 1.2)`를 prepend |
| Address Lookup Tables | 결제 account fanout(listing PDA, bid PDA, vault, USDC ATA 2개, Streamflow 계정, program)이 v0 트랜잭션 한계에 근접. D5 측정에서 시뮬레이션이 한계 초과 시 D6 Devnet 배포 전 SDK에 ALT 도입 |
| Token-2022 mint | v1 범위 외. `create_listing`은 `token_mint.owner == spl_token::ID` 검증 후 `TokenProgramNotSupported`(6106)로 거부 |
| Anchor `Optional<Account>` 패턴 | 회피: 결제는 `buy_now`와 `accept_bid`로 분리. IDL에 optional account 없음 |

---

## 10. 참고 자료

- Streamflow Transfer Contract docs: https://docs.streamflow.finance/en/articles/9670549-transfer-contract
- Streamflow Tradable Contracts docs: https://docs.streamflow.finance/en/articles/11375049-tradable-contracts
- Streamflow JS SDK docs: https://js-sdk-docs.streamflow.finance/modules/_streamflow_stream.html
- Streamflow Rust SDK `Transfer` accounts: https://docs.rs/streamflow-sdk/0.13.0/streamflow_sdk/struct.Transfer.html
- Streamflow Rust SDK `Contract` layout: https://docs.rs/streamflow-sdk/0.13.0/streamflow_sdk/state/struct.Contract.html
- Streamflow Rust SDK `CreateParams` (`ix` 서브 구조체): https://docs.rs/streamflow-sdk/0.13.0/streamflow_sdk/state/struct.CreateParams.html
- Solana CPI with PDA Signer: https://solana.com/docs/core/cpi/cpi-with-pda
