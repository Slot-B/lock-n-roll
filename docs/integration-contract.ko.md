# LOCK N ROLL 팀 간 연동 계약 (v1)

> Version: v1.0 / 2026-05-09
> Audience: Blockchain / Backend / Frontend 3팀 병렬 개발
> 상위 문서: `docs/design-document.ko.md` (v1.4) — 본 문서는 그 §3-6의 **팀 경계**만 추출/구체화한 것

---

## 0. 본 문서의 범위

`design-document.ko.md`는 "무엇을 만드는가"의 **단일 진실**이다. 본 문서는 거기서 **3팀이 직접 맞물리는 인터페이스만** 떼어내 구체화한다.

| 본 문서가 다루는 것 | 본 문서가 다루지 않는 것 |
|---|---|
| IDL/이벤트/REST/WS 정확한 shape | 비즈니스 정책 (eligibility, sweep 등) |
| 핸드오프 절차와 동결 시점 | 팀 내부 구현 세부 (Postgres 인덱스, React 상태 라이브러리 등) |
| Mock/Stub 전략 | UI 디자인, 운영 메트릭 |

충돌 시 `design-document.ko.md`가 우선한다.

---

## 1. 책임 경계

```
┌────────────────────────────────────────────────────────────────┐
│                          Solana Devnet                         │
│  ┌─────────────────────┐         ┌─────────────────────┐       │
│  │  LOCK N ROLL 프로그램│         │  Streamflow 프로그램 │       │
│  └──────────┬──────────┘         └─────────────────────┘       │
└─────────────┼──────────────────────────────────────────────────┘
              │ emit!  (이벤트 로그)
              ▼
┌─────────────────────────┐    REST/WS    ┌─────────────────────┐
│   Backend (Indexer +    │ ◄──────────── │  Frontend (Next.js  │
│   REST + WS + Postgres) │ ────────────► │  + Wallet Adapter)  │
└─────────────────────────┘               └──────────┬──────────┘
                                                     │ Anchor IDL
                                                     ▼
                                          [트랜잭션 직접 서명/전송]
                                                     │
                                                     ▼
                                            Solana Devnet으로 복귀
```

| 트랙 | 단독 소유 | 노출하는 인터페이스 | 의존하는 인터페이스 |
|---|---|---|---|
| **Blockchain** | Anchor 프로그램, Streamflow 어댑터, PDA seed, 이벤트 emit | **IDL 파일**, 이벤트 스키마 (§3), 에러 코드 (§3.7 of design-doc) | Streamflow SDK 0.13.0 |
| **Backend** | Postgres, 인덱서, REST, WebSocket, Redis, reconciliation cron | **REST API** (§4), **WS 채널** (§5), 에러 envelope | Blockchain의 IDL + 이벤트 |
| **Frontend** | wallet 통합, 트랜잭션 빌더, UI/UX, 캐시 무효화 | (브라우저 외부엔 노출 없음) | Blockchain의 IDL + Backend의 REST/WS |

핵심 원칙: **Frontend는 Backend와만 데이터 통신하고, Blockchain과는 트랜잭션 서명/전송만 한다.** Frontend가 RPC로 직접 listing을 조회하지 않는다 (인덱서가 단일 진실).

---

## 2. 공유 산출물 (3팀 공통 의존)

### 2.1 모노레포 디렉토리 합의

```
lock-n-roll/
├── program/                      # Blockchain 소유
│   ├── programs/lock_n_roll/     # Anchor 프로그램
│   └── target/idl/lock_n_roll.json   # ← 핸드오프 산출물
├── backend/                      # Backend 소유
├── frontend/                     # Frontend 소유
├── shared/                       # 3팀 공통 (TS 타입, env 상수)
│   ├── types.ts                  # §6.2 of design-doc + 본 문서 §5 응답 타입
│   ├── env.ts                    # §6.1 환경 상수
│   └── idl/                      # program이 빌드한 IDL을 복사 배치
│       └── lock_n_roll.json
└── docs/
    ├── design-document.ko.md     # 단일 진실
    └── integration-contract.ko.md # ← 본 문서
```

`shared/`는 **빌드 산출물이 아니라 git에 들어가는 패키지**로 둔다 (단일 진실 보장). Backend는 `shared/types.ts`를 그대로 import, Frontend도 동일하게 import.

### 2.2 IDL 핸드오프 절차

| 단계 | 책임 | 행동 |
|---|---|---|
| 1 | Blockchain | `anchor build` → `program/target/idl/lock_n_roll.json` 생성 |
| 2 | Blockchain | 그 파일을 `shared/idl/lock_n_roll.json`로 복사하고 PR (스크립트화 권장) |
| 3 | CI | `shared/idl/lock_n_roll.json`이 `program/target/idl/...`와 일치하는지 검증 |
| 4 | Backend/Frontend | `shared/idl/lock_n_roll.json`만 import. 직접 빌드 산출물은 참조 금지 |

**IDL Freeze 정책**: design-doc §7.2 게이트 #2. "instruction 계정과 이벤트가 안정화"된 후 Backend/Frontend가 동일 IDL을 소비. 변경 시 Blockchain은 PR 설명에 다음을 명시:

```
IDL CHANGE
- Added: <instruction or event>
- Modified: <field path> (old → new)
- Removed: <name>
- Migration: required | none
```

### 2.3 환경 상수 (`shared/env.ts`)

design-doc §6.1을 코드로 옮긴 단일 모듈. **Frontend와 Backend 모두 이 모듈에서 읽는다.**

```ts
// shared/env.ts
export type Network = "localnet" | "devnet" | "mainnet";

export const ENV: Record<Network, {
  LOCK_N_ROLL_PROGRAM_ID: string;
  STREAMFLOW_PROGRAM_ID: string;
  USDC_MINT: string;
  EXPECTED_STREAMFLOW_VERSION: number;  // B0 측정값으로 PR
  RPC_URL: string;
}> = {
  localnet: { /* ... */ },
  devnet: {
    LOCK_N_ROLL_PROGRAM_ID: "9PR9oNvarS2iektAP84Zdcs4akh3a2NML8XVw75ih4gu",
    STREAMFLOW_PROGRAM_ID: "HqDGZjaVRXJ9MGRQEw7qDc2rAr6iH1n1kAQdCZaCMfMZ",
    USDC_MINT: "<TBD>",
    EXPECTED_STREAMFLOW_VERSION: 0,    // ← B0 측정값으로 PR (현재 placeholder)
    RPC_URL: "https://api.devnet.solana.com",
  },
  mainnet: { /* ... */ },
};
```

### 2.4 공통 타입 (`shared/types.ts`)

design-doc §6.2를 그대로 옮기되, **본 문서 §5의 REST 응답 타입까지 포함**한다.

---

## 3. Contract ↔ Backend 계약 (이벤트 채널)

### 3.1 통신 방식

Backend 인덱서는 두 가지 방식 중 하나로 이벤트를 수신한다. **v1은 (A) 권장**:

| 방식 | 설명 |
|---|---|
| **(A) Helius Webhook (권장)** | LOCK N ROLL program ID 구독. tx 단위로 push. 멱등성 키는 `(tx_signature, event_index)` |
| (B) `getSignaturesForAddress` 폴링 + `getTransaction` | 백업/로컬 개발. 동일 이벤트 파싱 로직 사용. |

**Backend는 (A)/(B)를 추상화한 `ParsedEvent` 큐 인터페이스를 내부적으로 둔다.** 인덱서 본체는 그 큐만 소비.

### 3.2 이벤트 파싱 규약

Anchor `emit!`은 program log에 base64로 인코딩된 `[8-byte discriminator || borsh payload]`를 남긴다. 추출 절차:

```
For each tx:
  events = []
  for log in tx.meta.logMessages:
    if log starts with "Program data: ":
      raw = base64decode(log[14:])
      discriminator = raw[0..8]
      payload = raw[8..]
      event_name = IDL.events.find(e => sha256("event:" + e.name)[0..8] == discriminator)
      events.push({ name: event_name, payload: borsh.deserialize(payload, IDL_schema) })
  for i, e in enumerate(events):
    emit_to_indexer({ tx_signature, event_index: i, ...e })  # H2: 0-based ordinal
```

**`event_index` 정의 (H2 재확인)**: 같은 트랜잭션 안 `emit!` 호출의 0-based 순서. inner instruction과 무관하게 program log 등장 순서로 결정. 이 정의는 Blockchain과 Backend가 함께 동결한다 — 변경 시 양 팀 PR 동시 머지.

### 3.3 이벤트 스키마 (필수 필드 — IDL 진실 우선)

design-doc §3.6 그대로. Backend는 다음 5개 이벤트만 처리:

| 이벤트 | 핵심 필드 (요약) |
|---|---|
| `ListingCreated` | `listing_pda, maker, streamflow_metadata, token_mint, token_decimals, vesting_amount_raw, asking_price_micro_usdc, expires_at, slot` |
| `BidSubmitted` | `bid_pda, listing_pda, bidder, price_per_token_micro_usdc, total_usdc_raw, slot` |
| `BidWithdrawn` | `bid_pda, listing_pda, bidder, total_usdc_raw, slot` |
| `OrderTaken` | `listing_pda, ..., mode("asking"/"bid"), accepted_bid_pda?, swept_token_amount, slot` |
| `ListingCancelled` / `ListingExpired` | `listing_pda, maker, streamflow_metadata, swept_token_amount, slot` |

**Blockchain은 이 6개 이외의 이벤트를 emit하지 않는다.** 추가하려면 본 문서 PR 필수.

### 3.4 멱등성 계약

Backend는 같은 webhook을 N번 받아도 DB 결과가 동일해야 함 (design-doc §4.3, §7.2 게이트 #3). 멱등성 키:

```sql
PRIMARY KEY (tx_signature, event_index)  -- processed_events 테이블
```

Blockchain 측 보증사항: **같은 `(tx_signature, event_index)` 페어에 대해 이벤트 payload는 영원히 동일하다.** (Solana finalized 트랜잭션 보장)

### 3.5 에러 코드 매핑

design-doc §3.7의 17개 코드는 트랜잭션 실패 시 `tx.meta.err`에 등장. Backend는 **에러 코드를 사용자 메시지로 변환할 책임이 없다** (그건 Frontend 책임). Backend는 에러 자체를 처리하지 않음 (실패 트랜잭션은 이벤트가 없으므로 인덱싱 대상 아님).

---

## 4. Contract ↔ Frontend 계약 (트랜잭션 빌드)

### 4.1 IDL 소비

Frontend는 `shared/idl/lock_n_roll.json`을 import 해서 `Program<LockNRoll>` 인스턴스를 만든다. Anchor가 자동 생성하는 타입을 신뢰하되, **계정 어셈블리는 한 모듈로 일원화** (design-doc §5.1 마지막 문장).

### 4.2 PDA seed 공식 (변경 시 양팀 동시 머지)

```ts
// shared/pda.ts (Frontend가 사용, Blockchain의 #[account(seeds=...)]와 1:1 일치)
export const listingPda = (
  maker: PublicKey, streamflowMetadata: PublicKey, nonce: bigint
): [PublicKey, number] => PublicKey.findProgramAddressSync(
  [Buffer.from("listing"), maker.toBuffer(), streamflowMetadata.toBuffer(),
   numberToU64LE(nonce)],
  PROGRAM_ID,
);

export const bidPda = (
  listing: PublicKey, bidder: PublicKey
): [PublicKey, number] => PublicKey.findProgramAddressSync(
  [Buffer.from("bid"), listing.toBuffer(), bidder.toBuffer()],
  PROGRAM_ID,
);
```

이 모듈도 `shared/`에 두고 **Blockchain 팀이 PR 리뷰권을 가진다** (seed 변경 = 프로그램 변경).

### 4.3 인스트럭션별 계정 순서

| Instruction | 필수 계정 (mut/signer 표기) | Frontend 사전 처리 |
|---|---|---|
| `create_listing` | `maker (mut, signer)`, `listing_pda (mut)`, `listing_token_ata (mut)`, `streamflow_metadata`, `token_mint`, `streamflow_program`, ATA/Token/System/Rent/Compute | `listing_token_ata` 미존재 시 **같은 tx에서** `createATA` 선행 instruction 추가 |
| `submit_bid` | `bidder (mut, signer)`, `bid_pda (mut)`, `bid_usdc_vault (mut)`, `bidder_usdc_source (mut)`, `usdc_mint`, `listing`, ATA/Token/System | vault ATA를 idempotent createATA로 동봉 |
| `buy_now` | `taker (mut, signer)`, `listing (mut)`, `listing_pda`, `listing_token_ata (mut)`, `taker_token_ata (mut)`, `taker_usdc_source (mut)`, `maker_usdc_dest (mut)`, Streamflow CPI 계정 set, programs | `taker_token_ata` 미존재 시 createATA 선행 / CU 한도 prepend |
| `accept_bid` | `maker (mut, signer)`, `listing (mut)`, `bid (mut)`, `bid_usdc_vault (mut)`, `maker_usdc_dest (mut)`, `bidder_token_ata (mut)`, `listing_token_ata (mut)`, Streamflow CPI 계정 set | `bidder_token_ata` 미존재 시 maker가 대신 createATA |
| `withdraw_bid` | `bidder (mut, signer)`, `bid (mut)`, `bid_usdc_vault (mut)`, `bidder_usdc_dest (mut)`, programs | — |
| `cancel_listing` | `maker (mut, signer)`, `listing (mut)`, `maker_token_ata (mut)`, `listing_token_ata (mut)`, Streamflow CPI 계정 set | `maker_token_ata` createATA |
| `claim_expired` | `payer (mut, signer)`, `listing (mut)`, `listing.maker`, `maker_token_ata (mut)`, `listing_token_ata (mut)`, Streamflow CPI 계정 set | 누구나 호출 가능. payer는 본인 |

**정확한 계정 순서는 IDL이 진실.** 본 표는 어셈블리 누락 방지용 체크리스트. Anchor IDL에 reorder가 들어가면 Frontend SDK는 즉시 깨진다 → IDL Freeze 후엔 reorder 금지.

### 4.4 컴퓨트 예산 (CU) 약속

design-doc §9 + Extra:

- Blockchain은 D5에 5개 settlement instruction의 측정 CU를 **이 문서 §4.4 표에 기입한다**.
- Frontend SDK는 그 값에 1.2 곱해 `ComputeBudgetProgram.setComputeUnitLimit(measured * 1.2)`를 prepend.

| Instruction | 측정 CU (D5 채움) | SDK 적용값 |
|---|---|---|
| `create_listing` | TBD | TBD |
| `buy_now` | TBD | TBD |
| `accept_bid` | TBD | TBD |
| `cancel_listing` | TBD | TBD |
| `claim_expired` | TBD | TBD |

### 4.5 에러 코드 → UX 메시지 매핑

Frontend가 소유. design-doc §3.7 17개를 모두 매핑. 예시:

```ts
// frontend/src/lib/errorMessages.ts
export const ERROR_MESSAGES: Record<number, string> = {
  6101: "Streamflow 수령자가 예상과 다릅니다. 누군가 먼저 거래를 완료했을 수 있습니다.",
  6201: "만료 시간은 현재로부터 1시간 이후 ~ unlock 시점 사이여야 합니다.",
  6202: "주문 ID가 충돌했습니다. 다시 시도해주세요.",
  6304: "계산된 총액이 입력값과 일치하지 않습니다.",
  // ...
};
```

매핑 누락 시 fallback: `"트랜잭션 실패 (코드 ${code})"`.

---

## 5. Backend ↔ Frontend 계약 (REST + WS)

### 5.1 베이스 URL과 인증

| 환경 | REST | WebSocket |
|---|---|---|
| local | `http://localhost:8080/api/v1` | `ws://localhost:8080/ws` |
| devnet | `https://api-dev.<domain>/api/v1` | `wss://api-dev.<domain>/ws` |
| mainnet | `https://api.<domain>/api/v1` | `wss://api.<domain>/ws` |

**v1 인증 없음.** 모든 read API는 public. 트랜잭션은 클라이언트가 직접 RPC로 보내므로 서버 인증이 필요 없음. (악용 방지는 rate limit + Cloudflare로 충분)

### 5.2 공통 응답 형식

성공:
```json
{ "data": { ... }, "meta": { "ts": "2026-05-09T12:00:00Z" } }
```

리스트는 cursor pagination:
```json
{ "data": [ ... ], "meta": { "ts": "...", "next_cursor": "opaque-string-or-null" } }
```

에러 (design-doc §4.4):
```json
{ "error": { "code": "STRING_CODE", "message": "Human readable", "details": {} } }
```

표준 에러 코드:

| HTTP | code | 의미 |
|---|---|---|
| 400 | `INVALID_PARAMS` | 쿼리 파라미터 검증 실패 |
| 404 | `NOT_FOUND` | listing/stream/bid 없음 |
| 409 | `STALE_DATA` | 클라이언트가 보낸 If-Match 등이 stale (v1에서 미사용) |
| 429 | `RATE_LIMITED` | — |
| 500 | `INTERNAL` | — |
| 503 | `INDEXER_LAGGING` | health.lag_ms > 임계값 |

### 5.3 REST 엔드포인트 상세 (design-doc §4.4 확장)

#### `GET /orders` — 마켓 리스트

Query:

| 이름 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `status` | `LISTED` \| `SETTLED` \| `CANCELLED` \| `EXPIRED` | `LISTED` | — |
| `token` | string (mint) | — | 토큰 mint 필터 |
| `buy_now_only` | boolean | false | `asking_price_micro_usdc IS NOT NULL` |
| `min_discount` | float (0.0~1.0) | — | `discount_rate >= ?` (best bid 기준 추정 또는 asking 기준) |
| `sort` | `created_desc` \| `expires_asc` \| `discount_desc` | `created_desc` | — |
| `cursor` | string | — | 이전 응답의 `next_cursor` |
| `limit` | int (1~100) | 20 | — |

Response `data[]`:

```ts
type OrderSummary = {
  listing_pda: string;
  maker_wallet: string;
  streamflow_metadata: string;
  token_mint: string;
  token_decimals: number;
  vesting_amount_raw: ApiAmount;
  unlock_at: string;       // ISO 8601
  expires_at: string;
  asking_price_micro_usdc: ApiAmount | null;
  best_bid_price_micro_usdc: ApiAmount | null;
  bid_count: number;
  status: ListingStatus;
  market_price_micro_usdc: ApiAmount | null;  // Pyth (display only)
  estimated_discount_rate: number | null;     // 0.0~1.0, null if no price
  created_at: string;
};
```

#### `GET /orders/:listing_pda` — 디테일

Response `data`:

```ts
type OrderDetail = OrderSummary & {
  bids: Array<{
    bid_pda: string;
    bidder_wallet: string;
    price_per_token_micro_usdc: ApiAmount;
    total_usdc_raw: ApiAmount;
    status: BidStatus;
    refund_available: boolean;   // OPEN AND parent terminal
    created_at: string;
  }>;
  streamflow_snapshot: {
    version: number;
    closed: boolean;
    last_synced_at: string;
    drift_warning: string | null;   // §4.6 reconciliation 결과
  };
};
```

#### `GET /streams/:wallet` — Stream Picker용

Response `data`:

```ts
type StreamPickerResponse = {
  candidates: StreamCandidate[];   // shared/types.ts에서 import
};
```

(`StreamCandidate`는 design-doc §6.2 + H6 기준)

#### `GET /bids` — 내 입찰 / 환불 가능 목록

Query: `wallet`, `listing`, `status`, `refund_available=true`, `cursor`, `limit`.

```ts
type BidWithContext = {
  bid_pda: string;
  listing_pda: string;
  listing_status: ListingStatus;   // 환불 가능 판정용
  bidder_wallet: string;
  price_per_token_micro_usdc: ApiAmount;
  total_usdc_raw: ApiAmount;
  status: BidStatus;
  refund_available: boolean;
  created_at: string;
};
```

#### `GET /history` — 체결 내역

Query: `wallet`, `token`, `mode`, `from`, `to`, `cursor`, `limit`.

```ts
type TradeRecord = {
  trade_id: number;
  tx_signature: string;
  listing_pda: string;
  accepted_bid_pda: string | null;
  streamflow_metadata: string;
  maker_wallet: string;
  taker_wallet: string;
  token_mint: string;
  vesting_amount_raw: ApiAmount;
  price_per_token_micro_usdc: ApiAmount;
  total_usdc_raw: ApiAmount;
  market_price_micro_usdc: ApiAmount | null;
  discount_rate: number | null;
  mode: SettlementMode;
  settled_at: string;
  block_slot: number;
};
```

#### `GET /tokens/:mint/stats` — 토큰 통계

```ts
type TokenStats = {
  token_mint: string;
  active_listings: number;
  settled_count_24h: number;
  total_settled_volume_usdc: ApiAmount;
  median_discount_rate_30d: number | null;
};
```

#### `GET /health` — 헬스체크

```ts
type Health = {
  ok: boolean;
  slot: number;                  // 인덱서가 본 마지막 slot
  lag_ms: number;                // RPC head - indexer head
  reconcile_lag_min: number;     // 마지막 reconciliation 실행으로부터 분
};
```

### 5.4 WebSocket 프로토콜 (design-doc §4.5 확장)

#### 5.4.1 연결

```
wss://api-dev.<domain>/ws
```

연결 직후 client는 subscribe 메시지를 보내야 한다 (서버는 subscribe 없는 연결로 어떤 메시지도 보내지 않음).

#### 5.4.2 Subscribe / Unsubscribe

Client → Server:

```json
{ "op": "subscribe", "channels": ["market.tick", "user.7xKX...abc"] }
{ "op": "unsubscribe", "channels": ["user.7xKX...abc"] }
{ "op": "ping" }
```

Server → Client:

```json
{ "op": "subscribed", "channels": ["market.tick", "user.7xKX...abc"] }
{ "op": "pong" }
{ "op": "event", "channel": "order.created", "data": { ...payload... } }
```

#### 5.4.3 채널 / payload

| 채널 | payload `data` shape |
|---|---|
| `market.tick` | `{ active_count: number, settled_count: number, ts: string }` (10초 주기) |
| `order.created` | `OrderSummary` (위 §5.3 동일 shape) |
| `order.bid_changed` | `{ event_type: "submitted" \| "withdrawn", bid_pda, listing_pda, bidder, price_per_token_micro_usdc, total_usdc_raw }` (C3 반영: "withdrawn") |
| `order.settled` | `{ ...OrderTaken 필드... }` (design-doc §3.6) |
| `order.cancelled` | `{ event_type: "cancelled" \| "expired", listing_pda, swept_token_amount }` |
| `user.{wallet}` | 위 어떤 이벤트든 그 wallet이 maker/taker/bidder로 등장하면 forward. payload에 `original_channel` 필드 추가. |

#### 5.4.4 재연결 / 누락 보정

- WS 재연결 후 client는 **마지막 본 데이터를 신뢰하지 않는다** — 화면을 그릴 데이터는 항상 REST로 다시 fetch한다 (WS는 invalidation 신호).
- `lag_ms > 5000` 이면 client는 사용자에게 "데이터 동기화 지연" 배너 표시.

#### 5.4.5 keep-alive

서버는 30초마다 `{"op":"ping"}` 송신. client가 60초 내 응답 없으면 연결 종료.

### 5.5 캐시 정책

Backend Redis TTL (Frontend가 알 필요는 없지만 디버깅용으로 명시):

| 키 | TTL |
|---|---|
| `orders:list:<query-hash>` | 10s |
| `orders:detail:<listing_pda>` | 30s, 이벤트로 즉시 무효화 |
| `streams:<wallet>` | 60s |

Frontend는 자체 캐시 (React Query 등)를 두고, **WS 이벤트 수신 시 design-doc §5.5의 무효화 규칙** 적용.

---

## 6. 개발 순서와 Mock 전략

### 6.1 의존성 그래프

```
[Anchor IDL] ─┬─► [Backend 인덱서] ──► [REST/WS]
              │                          │
              └─► [Frontend SDK 빌드]    └─► [Frontend UI]
```

(B0 스파이크는 통과했으므로 그래프에서 제거됨. 자세한 내역은 design-document.ko.md §0.1 v1.4 → v1.5 changelog 참고.)

### 6.2 IDL 동결 전 작업 가능 항목

IDL이 안정화되기 전에도 3팀이 멈추지 않도록:

| 팀 | IDL 동결 전 가능한 일 |
|---|---|
| Blockchain | 7 instruction 스캐폴드, 단위 테스트 |
| Backend | DB migration, REST 스켈레톤 + **Mock 핸들러** (고정 fixture 응답), WS 서버 골격, 멱등성 테스트 |
| Frontend | wallet 연결, 라우팅, **Mock REST 서버** (MSW)로 UI, env 모듈, stream picker UI |

### 6.3 Mock 핸들러 합의

Backend는 IDL 동결 전 다음 fixture를 `backend/fixtures/`에 두고 REST 응답에 사용:

- `fixtures/orders.json` — 5개 listing (LISTED 3, SETTLED 1, CANCELLED 1)
- `fixtures/bids.json`
- `fixtures/streams.json` — 3개 candidate (eligible 2, ineligible 1)

**같은 fixture 파일을 Frontend가 MSW로도 재사용**한다 → 양 팀이 동일 mock으로 개발해 후행 통합 비용 최소화.

### 6.4 Contract Test (선택 권장)

Backend의 REST 응답 shape는 Frontend `shared/types.ts`와 일치해야 함. CI에 다음 게이트:

```bash
# backend/test/contract.test.ts
# 각 엔드포인트 응답을 shared/types.ts의 zod 스키마로 validate
```

zod 스키마는 `shared/types.ts`에서 export, Backend가 응답 직전 validate, Frontend가 응답 수신 후 validate. 양쪽이 같은 스키마를 본다.

---

## 7. 변경 관리

### 7.1 인터페이스 변경 절차

| 변경 종류 | 절차 |
|---|---|
| **IDL 변경** (계정/이벤트/instruction signature) | Blockchain PR → Backend/Frontend 리뷰 필수 → 머지 후 Backend/Frontend 동시 PR |
| **REST 응답 shape** | Backend PR → Frontend 리뷰 필수 → `shared/types.ts` 같이 수정 |
| **WS 채널/payload** | Backend PR → Frontend 리뷰 필수 |
| **PDA seed** | Blockchain + Frontend 동시 PR (`shared/pda.ts` 동기 변경) |
| **에러 코드 추가** | Blockchain PR + Frontend의 `ERROR_MESSAGES` 매핑 PR을 같은 마일스톤에 |

### 7.2 Breaking change 정책

v1은 단일 환경(devnet)에서 끝까지 가는 것을 전제로 함. **versioning 없음.** 단, mainnet 배포 후엔 다음 정책 적용 (v2 문서):

- REST: 새 필드 추가는 non-breaking, 필드 삭제/타입 변경은 `/api/v2`로 분기
- WS: 채널 추가는 non-breaking, payload 필드 삭제는 신규 채널로 분기
- IDL: instruction 추가는 non-breaking, 기존 instruction 계정 순서 변경은 program upgrade + IDL 갱신 + SDK major bump

### 7.3 본 문서 업데이트

본 문서가 stale 되는 순간 3팀 통합이 깨진다. **인터페이스를 건드리는 모든 PR에 본 문서의 해당 섹션 업데이트가 포함돼야 한다** (CI에 `git diff --name-only` 체크 추가 권장).

---

## 8. 체크리스트 (3팀 D-1)

각 팀이 첫 통합 전(Day 1 종료 시)에 완료해야 할 것:

### Blockchain
- [x] B0 스파이크 통과 (완료)
- [ ] `EXPECTED_STREAMFLOW_VERSION` 실제 측정값 PR
- [ ] `shared/idl/lock_n_roll.json` 첫 버전 커밋
- [ ] `shared/pda.ts` seed 공식 합의

### Backend
- [ ] Postgres 마이그레이션 적용
- [ ] REST 7개 엔드포인트 mock 응답 (fixture 기반)
- [ ] WS subscribe/unsubscribe/ping 동작
- [ ] `shared/types.ts` zod 스키마 contract test 통과

### Frontend
- [ ] wallet adapter 연결 (devnet)
- [ ] `shared/idl/lock_n_roll.json`으로 `Program` 인스턴스 생성 성공
- [ ] MSW로 fixture 기반 UI 첫 화면 (마켓 리스트) 렌더
- [ ] WS 클라이언트로 `market.tick` 수신 확인
