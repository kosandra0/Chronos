"use client";

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { formatHMS } from "@/lib/time";
import { useSettings } from "./Providers";

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

/**
 * One digit column. On first appearance the strip slides up from 0 to the digit; afterwards every
 * change slides vertically (9 -> 0 rolls forward through an extra "0" so it always moves upward).
 */
const OdoDigit = memo(function OdoDigit({ d, animate }: { d: number; animate: boolean }) {
  const [pos, setPos] = useState(animate ? 0 : d);
  const [snap, setSnap] = useState(true);
  const prev = useRef(animate ? 0 : d);
  useEffect(() => {
    if (!animate) {
      setSnap(true);
      setPos(d);
      prev.current = d;
      return;
    }
    if (prev.current === d && pos === d) return;
    const wrap = prev.current === 9 && d === 0;
    prev.current = d;
    setSnap(false);
    if (wrap) {
      setPos(10);
      const t = setTimeout(() => {
        setSnap(true);
        setPos(0);
      }, 700);
      return () => clearTimeout(t);
    }
    // next frame so the browser has painted the starting position (slide-up on mount)
    const raf = requestAnimationFrame(() => setPos(d));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, animate]);
  return (
    <span className="col" aria-hidden>
      <span className={`strip ${snap ? "snap" : ""}`} style={{ transform: `translateY(-${pos}em)` }}>
        {DIGITS.map((n, i) => (
          <span key={i}>{n}</span>
        ))}
      </span>
    </span>
  );
});

/**
 * Renders text such as "3h 12m 08s" with every digit sliding upward whenever it changes (and from 0 on
 * first appearance). Non-digit characters stay put. Keys are anchored from the right so a growing number
 * never remounts the columns that did not change.
 */
export function Odometer({ text, className = "", style }: { text: string; className?: string; style?: CSSProperties }) {
  const { motion } = useSettings();
  const chars = Array.from(text);
  return (
    <span className={`roll odo num ${className}`} style={style} aria-label={text}>
      {chars.map((c, i) => {
        const key = chars.length - i;
        return /\d/.test(c) ? (
          <OdoDigit key={`d${key}`} d={Number(c)} animate={motion.numbers} />
        ) : (
          <span key={`c${key}`} className="odo-ch" aria-hidden>
            {c}
          </span>
        );
      })}
    </span>
  );
}

/** Drop-in for plain text values: numbers inside slide up as they appear and as they change. */
export function AnimText({ value }: { value: string }) {
  return <Odometer text={value} />;
}

/** A duration in ms rendered as HH:MM:SS with sliding digits. */
export function Ms({ ms, className }: { ms: number; className?: string }) {
  return <Odometer text={formatHMS(ms)} className={className} />;
}
