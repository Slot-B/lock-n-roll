CREATE TABLE "bids" (
	"bid_pda" text PRIMARY KEY NOT NULL,
	"listing_pda" text NOT NULL,
	"bidder_wallet" text NOT NULL,
	"price_per_token_micro_usdc" numeric(20, 0) NOT NULL,
	"total_usdc_raw" numeric(20, 0) NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"listing_pda" text PRIMARY KEY NOT NULL,
	"maker_wallet" text NOT NULL,
	"streamflow_metadata" text NOT NULL,
	"token_mint" text NOT NULL,
	"token_decimals" smallint NOT NULL,
	"vesting_amount_raw" numeric(40, 0) NOT NULL,
	"unlock_at" timestamp with time zone NOT NULL,
	"asking_price_micro_usdc" numeric(20, 0),
	"expires_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"bid_count" integer DEFAULT 0 NOT NULL,
	"best_bid_price_micro_usdc" numeric(20, 0),
	"swept_token_amount" numeric(40, 0),
	"created_slot" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_expires_le_unlock" CHECK (expires_at <= unlock_at)
);
--> statement-breakpoint
CREATE TABLE "processed_events" (
	"tx_signature" text NOT NULL,
	"event_index" integer NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_events_tx_signature_event_index_pk" PRIMARY KEY("tx_signature","event_index")
);
--> statement-breakpoint
CREATE TABLE "reconciliation_issues" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"listing_pda" text NOT NULL,
	"issue_type" text NOT NULL,
	"details" jsonb NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "trade_history" (
	"trade_id" bigserial PRIMARY KEY NOT NULL,
	"tx_signature" text NOT NULL,
	"listing_pda" text NOT NULL,
	"accepted_bid_pda" text,
	"streamflow_metadata" text NOT NULL,
	"maker_wallet" text NOT NULL,
	"taker_wallet" text NOT NULL,
	"token_mint" text NOT NULL,
	"vesting_amount_raw" numeric(40, 0) NOT NULL,
	"price_per_token_micro_usdc" numeric(20, 0) NOT NULL,
	"total_usdc_raw" numeric(20, 0) NOT NULL,
	"market_price_micro_usdc" numeric(20, 0),
	"discount_rate" numeric(8, 6) GENERATED ALWAYS AS (1 - (price_per_token_micro_usdc::numeric(40,10) / NULLIF(market_price_micro_usdc, 0)::numeric(40,10))) STORED,
	"mode" text NOT NULL,
	"swept_token_amount" numeric(40, 0) DEFAULT '0' NOT NULL,
	"settled_at" timestamp with time zone NOT NULL,
	"block_slot" bigint,
	CONSTRAINT "trade_history_tx_signature_unique" UNIQUE("tx_signature")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"wallet_address" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_listing_pda_orders_listing_pda_fk" FOREIGN KEY ("listing_pda") REFERENCES "public"."orders"("listing_pda") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_bidder_wallet_users_wallet_address_fk" FOREIGN KEY ("bidder_wallet") REFERENCES "public"."users"("wallet_address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_maker_wallet_users_wallet_address_fk" FOREIGN KEY ("maker_wallet") REFERENCES "public"."users"("wallet_address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_bids_listing_bidder" ON "bids" USING btree ("listing_pda","bidder_wallet");--> statement-breakpoint
CREATE INDEX "idx_bids_listing_status" ON "bids" USING btree ("listing_pda","status");--> statement-breakpoint
CREATE INDEX "idx_bids_bidder_status" ON "bids" USING btree ("bidder_wallet","status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_orders_streamflow_active" ON "orders" USING btree ("streamflow_metadata") WHERE status = 'LISTED';--> statement-breakpoint
CREATE INDEX "idx_orders_status_token" ON "orders" USING btree ("status","token_mint");