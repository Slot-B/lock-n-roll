"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

// Lazy, client-only — `three` cannot be evaluated during SSR.
const Antigravity = dynamic(() => import("./Antigravity"), { ssr: false });

export type AntigravityFieldProps = ComponentProps<typeof Antigravity>;

export default function AntigravityField(props: AntigravityFieldProps) {
  return <Antigravity {...props} />;
}
