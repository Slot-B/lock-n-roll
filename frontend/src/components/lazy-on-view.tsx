"use client";

import {
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  rootMargin?: string;
  /** Rendered until the wrapper scrolls into view. */
  placeholder?: ReactNode;
};

// Mounts children only after the wrapper enters the viewport. Used to defer
// heavy WebGL fields (Hyperspeed / GridScan / GridMotion) so their `three` /
// `postprocessing` chunks don't load on first paint when the section is
// off-screen.
export default function LazyOnView({
  children,
  rootMargin = "300px",
  placeholder = null,
  ...rest
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            obs.disconnect();
            return;
          }
        }
      },
      { rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin, shown]);

  return (
    <div ref={ref} {...rest}>
      {shown ? children : placeholder}
    </div>
  );
}
