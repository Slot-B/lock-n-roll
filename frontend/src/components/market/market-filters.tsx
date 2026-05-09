"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type MarketSort = "discount" | "newest" | "unlock-soon";

interface MarketFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  buyNowOnly: boolean;
  onBuyNowToggle: (v: boolean) => void;
  sort: MarketSort;
  onSortChange: (v: MarketSort) => void;
  resultCount: number;
}

export function MarketFilters({
  search,
  onSearchChange,
  buyNowOnly,
  onBuyNowToggle,
  sort,
  onSortChange,
  resultCount,
}: MarketFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative flex-1 min-w-[220px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by token symbol"
          className="pl-8 h-9 font-mono text-xs"
        />
      </div>

      {/* Buy Now Only toggle */}
      <Button
        type="button"
        variant={buyNowOnly ? "default" : "outline"}
        size="sm"
        className={cn(
          "rounded-pill font-mono text-xs",
          buyNowOnly && "shadow-[0_0_0_1px_var(--ring)]",
        )}
        onClick={() => onBuyNowToggle(!buyNowOnly)}
        aria-pressed={buyNowOnly}
      >
        ⚡ Buy Now Only
      </Button>

      {/* Sort */}
      <Select
        value={sort}
        onValueChange={(v) => onSortChange(v as MarketSort)}
      >
        <SelectTrigger className="w-[180px] h-9 font-mono text-xs rounded-pill">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="discount">Best discount</SelectItem>
          <SelectItem value="newest">Newest</SelectItem>
          <SelectItem value="unlock-soon">Unlocking soon</SelectItem>
        </SelectContent>
      </Select>

      <div className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
        {resultCount.toLocaleString()} results
      </div>
    </div>
  );
}
