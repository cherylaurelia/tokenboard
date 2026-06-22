"use client";

// Scroll-reveal wrapper (landing-dark's .reveal). Polymorphic via `as` (default div). Adds .in when
// it scrolls into view; the stagger delay is a discrete class (.d1..d4), NOT an inline style. Under
// prefers-reduced-motion it renders visible immediately and never observes.
import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import styles from "./reveal.module.css";

const DELAY_CLASS = ["", styles.d1, styles.d2, styles.d3, styles.d4] as const;

export function Reveal({
  as,
  delay = 0,
  className,
  id,
  children,
}: {
  as?: ElementType;
  delay?: 0 | 1 | 2 | 3 | 4;
  className?: string;
  id?: string;
  children: ReactNode;
}) {
  const Tag = as ?? "div";
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      id={id}
      className={`${styles.reveal} ${DELAY_CLASS[delay]} ${shown ? styles.in : ""} ${className ?? ""}`}
    >
      {children}
    </Tag>
  );
}
