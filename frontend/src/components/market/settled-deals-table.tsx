import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TokenIcon } from "@/components/domain/token-icon";
import { DiscountBadge } from "@/components/domain/discount-badge";
import { PdaDisplay } from "@/components/domain/pda-display";
import {
  formatTokenAmount,
  formatPricePerToken,
  formatUsdc,
} from "@/lib/format";
import { getToken } from "@/lib/tokens";
import type { Trade } from "@/types/domain";

interface SettledDealsTableProps {
  trades: Trade[];
}

export function SettledDealsTable({ trades }: SettledDealsTableProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl tracking-tight">Settled Deals</h2>
        <span className="font-mono text-[11px] text-muted-foreground">
          most recent · last 30 days
        </span>
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="text-[10px] uppercase tracking-wider">
                Token
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">
                Amount
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">
                Price/Token
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">
                Total
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">
                Discount
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">
                Mode
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider">
                Tx
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trades.map((t) => {
              const token = getToken(t.tokenMint);
              return (
                <TableRow key={t.tradeId} className="border-border">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {token && <TokenIcon token={token} size={20} />}
                      <span className="font-display text-sm">
                        {token?.symbol ?? "?"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {token
                      ? formatTokenAmount(t.vestingAmountRaw, token.decimals)
                      : t.vestingAmountRaw}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {formatPricePerToken(t.pricePerTokenMicroUsdc)}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {formatUsdc(t.totalUsdcRaw)}
                  </TableCell>
                  <TableCell>
                    {t.discountRate !== undefined ? (
                      <DiscountBadge rate={t.discountRate} size="sm" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {t.mode}
                    </span>
                  </TableCell>
                  <TableCell>
                    <PdaDisplay value={t.txSignature} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
