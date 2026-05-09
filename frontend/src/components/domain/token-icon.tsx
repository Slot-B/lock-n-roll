"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Token } from "@/types/domain";

interface TokenIconProps {
  token: Pick<Token, "symbol" | "logoUrl" | "name">;
  /** Pixel size; default 32. */
  size?: number;
  className?: string;
}

/**
 * Token logo with graceful fallback to symbol initials when the CDN URL
 * fails or is missing — never renders a broken image.
 */
export function TokenIcon({ token, size = 32, className }: TokenIconProps) {
  const [errored, setErrored] = useState(false);

  if (errored || !token.logoUrl) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground font-mono text-[0.7em] uppercase",
          className,
        )}
        style={{ width: size, height: size }}
        aria-label={`${token.name} logo`}
      >
        {token.symbol.slice(0, 2)}
      </span>
    );
  }

  return (
    <Image
      src={token.logoUrl}
      alt={`${token.name} logo`}
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full", className)}
      onError={() => setErrored(true)}
      unoptimized={false}
    />
  );
}
