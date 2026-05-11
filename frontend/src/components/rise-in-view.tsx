"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Wrap any block of content with a fade + rise animation that fires once
 * when the wrapper scrolls into the viewport. Server-component-safe via
 * the `"use client"` boundary on this file alone.
 */
export default function RiseInView({
  children,
  delay = 0,
  distance = 60,
  duration = 1.1,
  once = false,
  className,
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  duration?: number;
  once?: boolean;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-80px" }}
      transition={{ duration, ease: [0.19, 1, 0.22, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
