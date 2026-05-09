"use client";

import { useMemo, useState } from "react";
import { Lock, Wallet, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { DiscountBadge } from "@/components/domain/discount-badge";
import {
  formatPricePerToken,
  formatTokenAmount,
  formatUsdc,
  microUsdcToUsd,
} from "@/lib/format";
import type { ListingView } from "@/types/domain";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

interface DualCTAPanelProps {
  listing: ListingView;
}

/**
 * Right-rail panel offering Buy Now and/or Place Bid.
 * Buy Now tab is hidden when the listing has no asking price.
 * Both submit handlers are M1 stubs — M3 wires the SDK.
 */
export function DualCTAPanel({ listing }: DualCTAPanelProps) {
  const { hasAsking, token } = listing;
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();

  const wholeTokenCount = useMemo(() => {
    const big = BigInt(listing.vestingAmountRaw);
    const divisor = BigInt(10) ** BigInt(listing.tokenDecimals);
    return Number(big / divisor);
  }, [listing.vestingAmountRaw, listing.tokenDecimals]);

  return (
    <Card className="p-0 bg-card border-border overflow-hidden">
      <Tabs defaultValue={hasAsking ? "buy_now" : "bid"} className="w-full">
        <TabsList className="grid w-full grid-cols-2 rounded-none bg-secondary/50">
          <TabsTrigger value="buy_now" disabled={!hasAsking}>
            <Zap className="mr-1.5 h-3 w-3" />
            Buy Now
          </TabsTrigger>
          <TabsTrigger value="bid">Place Bid</TabsTrigger>
        </TabsList>

        {/* ── Buy Now ── */}
        <TabsContent value="buy_now" className="m-0 p-5 space-y-4">
          {hasAsking && listing.askingPriceMicroUsdc ? (
            <BuyNowBody
              listing={listing}
              tokenSymbol={token.symbol}
              wholeTokenCount={wholeTokenCount}
              connected={!!publicKey}
              onConnect={() => setVisible(true)}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              No asking price set. Use the Bid tab.
            </p>
          )}
        </TabsContent>

        {/* ── Place Bid ── */}
        <TabsContent value="bid" className="m-0 p-5 space-y-4">
          <PlaceBidBody
            listing={listing}
            tokenSymbol={token.symbol}
            wholeTokenCount={wholeTokenCount}
            connected={!!publicKey}
            onConnect={() => setVisible(true)}
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function BuyNowBody({
  listing,
  tokenSymbol,
  wholeTokenCount,
  connected,
  onConnect,
}: {
  listing: ListingView;
  tokenSymbol: string;
  wholeTokenCount: number;
  connected: boolean;
  onConnect: () => void;
}) {
  const market = listing.token.marketPriceUsd;
  const askingUsd = microUsdcToUsd(listing.askingPriceMicroUsdc!);
  const totalUsd = askingUsd * wholeTokenCount;
  const discount = market && market > 0 ? Math.max(0, 1 - askingUsd / market) : undefined;

  return (
    <>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Asking
        </div>
        <div className="mt-1 font-mono text-3xl tabular-nums">
          {formatPricePerToken(listing.askingPriceMicroUsdc!)}
          <span className="text-sm text-muted-foreground ml-2">
            / {tokenSymbol}
          </span>
        </div>
        {discount !== undefined && (
          <div className="mt-1">
            <DiscountBadge rate={discount} />
            <span className="ml-2 text-xs text-muted-foreground">
              vs Pyth market
            </span>
          </div>
        )}
      </div>

      <SettlementSummary
        wholeTokenCount={wholeTokenCount}
        tokenSymbol={tokenSymbol}
        totalUsd={totalUsd}
      />

      <EscrowReassurance variant="buy_now" />

      <Button
        className="w-full rounded-pill h-11 text-sm"
        onClick={() => {
          if (!connected) onConnect();
          // M3: real buy_now SDK call.
        }}
      >
        {connected ? (
          <>
            <Zap className="h-3.5 w-3.5" />
            Buy Now @ {formatPricePerToken(listing.askingPriceMicroUsdc!)}
          </>
        ) : (
          <>
            <Wallet className="h-3.5 w-3.5" />
            Connect to buy
          </>
        )}
      </Button>
    </>
  );
}

function PlaceBidBody({
  listing,
  tokenSymbol,
  wholeTokenCount,
  connected,
  onConnect,
}: {
  listing: ListingView;
  tokenSymbol: string;
  wholeTokenCount: number;
  connected: boolean;
  onConnect: () => void;
}) {
  const market = listing.token.marketPriceUsd ?? 0;
  const [priceInput, setPriceInput] = useState("");
  const priceUsd = Number(priceInput);
  const validPrice = priceInput !== "" && Number.isFinite(priceUsd) && priceUsd > 0;
  const discount = validPrice && market > 0 ? Math.max(0, 1 - priceUsd / market) : undefined;
  const totalUsd = validPrice ? priceUsd * wholeTokenCount : 0;

  return (
    <>
      <div>
        <Label htmlFor="bid-price" className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Your offer (per token, USDC)
        </Label>
        <Input
          id="bid-price"
          type="number"
          inputMode="decimal"
          step="0.000001"
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          placeholder={market > 0 ? (market * 0.7).toFixed(6).replace(/0+$/, "") : "0.00"}
          className="mt-1.5 h-11 font-mono text-base tabular-nums"
        />
        {discount !== undefined && (
          <div className="mt-2">
            <DiscountBadge rate={discount} />
            <span className="ml-2 text-xs text-muted-foreground">
              vs Pyth market
            </span>
          </div>
        )}
      </div>

      <SettlementSummary
        wholeTokenCount={wholeTokenCount}
        tokenSymbol={tokenSymbol}
        totalUsd={totalUsd}
      />

      <EscrowReassurance variant="bid" />

      <Button
        className="w-full rounded-pill h-11 text-sm"
        disabled={connected && !validPrice}
        onClick={() => {
          if (!connected) onConnect();
          // M3: real submit_bid SDK call.
        }}
      >
        {connected ? (
          <>Submit Bid</>
        ) : (
          <>
            <Wallet className="h-3.5 w-3.5" />
            Connect to bid
          </>
        )}
      </Button>
    </>
  );
}

function SettlementSummary({
  wholeTokenCount,
  tokenSymbol,
  totalUsd,
}: {
  wholeTokenCount: number;
  tokenSymbol: string;
  totalUsd: number;
}) {
  return (
    <dl className="space-y-1.5 text-xs border-y border-border py-3">
      <Row label="Token amount">
        <span className="font-mono tabular-nums">
          {formatTokenAmount(
            (BigInt(wholeTokenCount) * BigInt(10) ** BigInt(0)).toString(),
            0,
          )}{" "}
          <span className="text-muted-foreground">{tokenSymbol}</span>
        </span>
      </Row>
      <Row label="Total USDC">
        <span className="font-mono tabular-nums">
          {totalUsd > 0
            ? formatUsdc(BigInt(Math.round(totalUsd * 1_000_000)).toString())
            : "—"}
        </span>
      </Row>
    </dl>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function EscrowReassurance({ variant }: { variant: "buy_now" | "bid" }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl bg-brand-ice/45 border border-brand-blue/20 px-3 py-2">
      <Lock className="h-3.5 w-3.5 mt-0.5 text-brand-blue shrink-0" />
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {variant === "buy_now" ? (
          <>
            On submit, USDC moves directly from your wallet to the maker, and
            Streamflow recipient is transferred to you — atomically.
          </>
        ) : (
          <>
            Your USDC is held in a per-bid escrow PDA until the maker accepts.
            You can withdraw any time before acceptance.
          </>
        )}
      </p>
    </div>
  );
}
