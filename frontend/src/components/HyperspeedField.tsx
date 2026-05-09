"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

import { hyperspeedPresets } from "./HyperSpeedPresets";

// Lazy, client-only — Hyperspeed pulls in `three` + `postprocessing` which
// access the WebGL stack and cannot be evaluated during SSR.
const Hyperspeed = dynamic<{ effectOptions?: Record<string, unknown> }>(
  () =>
    import("./Hyperspeed").then(
      (mod) =>
        mod.default as ComponentType<{ effectOptions?: Record<string, unknown> }>,
    ),
  { ssr: false },
);

export type HyperspeedPreset = keyof typeof hyperspeedPresets;

export type HyperspeedFieldProps = {
  preset?: HyperspeedPreset;
};

export default function HyperspeedField({
  preset = "one",
}: HyperspeedFieldProps) {
  const effectOptions = hyperspeedPresets[preset] as Record<string, unknown>;
  return <Hyperspeed effectOptions={effectOptions} />;
}
