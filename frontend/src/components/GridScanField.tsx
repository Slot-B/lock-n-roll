"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

export type GridScanFieldProps = {
  sensitivity?: number;
  lineThickness?: number;
  linesColor?: string;
  scanColor?: string;
  scanOpacity?: number;
  gridScale?: number;
  lineStyle?: "solid" | "dashed" | string;
  lineJitter?: number;
  scanDirection?: "pingpong" | "down" | "up" | string;
  noiseIntensity?: number;
  scanGlow?: number;
  scanSoftness?: number;
  scanDuration?: number;
  scanDelay?: number;
  scanOnClick?: boolean;
};

// Lazy, client-only — GridScan pulls in `three`, `postprocessing`, and
// `face-api.js`, which all need a browser environment and would balloon
// the SSR bundle if imported eagerly.
const GridScan = dynamic<GridScanFieldProps>(
  () =>
    import("./GridScan").then(
      (mod) => mod.GridScan as ComponentType<GridScanFieldProps>,
    ),
  { ssr: false },
);

export default function GridScanField(props: GridScanFieldProps) {
  return <GridScan {...props} />;
}
