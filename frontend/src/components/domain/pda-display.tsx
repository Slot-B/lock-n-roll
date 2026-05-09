"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PdaDisplayProps {
  value: string;
  /** When true, show full base58. Default false → "9xKj…3mF9". */
  full?: boolean;
  /** Optional explorer URL — if provided, the address text is a link. */
  href?: string;
  className?: string;
}

/**
 * Mono-font address display with one-click copy.
 * Used for `listing_pda`, `streamflow_metadata`, wallet, tx signatures, etc.
 */
export function PdaDisplay({ value, full, href, className }: PdaDisplayProps) {
  const [copied, setCopied] = useState(false);
  const display = full ? value : shortAddress(value, 4, 4);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied", { duration: 1500 });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  const text = (
    <span className="font-mono text-xs tabular-nums">{display}</span>
  );

  return (
    <span className={cn("inline-flex items-center gap-1.5 align-middle", className)}>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground transition-colors"
          title={value}
        >
          {text}
        </a>
      ) : (
        <span className="text-muted-foreground" title={value}>
          {text}
        </span>
      )}
      <button
        type="button"
        onClick={onCopy}
        className="text-muted-foreground/70 hover:text-foreground transition-colors"
        aria-label="Copy address"
      >
        {copied ? (
          <Check className="h-3 w-3 text-primary" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </span>
  );
}
