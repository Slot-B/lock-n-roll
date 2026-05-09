"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

export type GridMotionFieldProps = {
  items?: string[];
  gradientColor?: string;
};

// Lazy, client-only — GridMotion reads `window.innerWidth` during render.
const GridMotion = dynamic<GridMotionFieldProps>(
  () =>
    import("./GridMotion").then(
      (mod) => mod.default as ComponentType<GridMotionFieldProps>,
    ),
  { ssr: false },
);

export default function GridMotionField(props: GridMotionFieldProps) {
  return <GridMotion {...props} />;
}
