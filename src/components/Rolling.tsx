"use client";

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { splitMs } from "@/lib/time";
import { useSettings } from "./Providers";

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

/** One digit column. Changing digits slide vertically; 9→0 rolls forward through an extra "0". */
const Digit = memo(function Digit({ d, animate }: { d: number; animate: boolean }) {
  const [pos, setPos] = useState(d);
  const [snap, setSnap] = useState(true);
  const prev = useRef(d);
  useEffect(() => {
    if (prev.current === d) return;
    const wrap = prev.current === 9 && d === 0;
    prev.current = d;
    if (!animate) {
      setSnap(true);
      setPos(d);
      return;
    }
    setSnap(false);
    if (wrap) {
      setPos(10);
      const t = setTimeout(() => {
        setSnap(true);
        setPos(0);
      }, 420);
      return () => clearTimeout(t);
    }
    setPos(d);
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

/** HH:MM:SS with sliding digits. Floors (never rounds) the milliseconds it is given. */
export function RollingTime({ ms, style, className = "", showHours = true }: { ms: number; style?: CSSProperties; className?: string; showHours?: boolean }) {
  const { motion } = useSettings();
  const p = splitMs(ms);
  const hs = String(p.totalHours).padStart(2, "0");
  const chars: ({ d: number } | { sep: true })[] = [];
  if (showHours) {
    [...hs].forEach((c) => chars.push({ d: Number(c) }));
    chars.push({ sep: true });
  }
  chars.push({ d: Math.floor(p.minutes / 10) }, { d: p.minutes % 10 }, { sep: true }, { d: Math.floor(p.seconds / 10) }, { d: p.seconds % 10 });
  // Keys are anchored from the right so a growing hour count never remounts the minute/second columns.
  return (
    <span className={`roll num ${className}`} style={style} role="timer" aria-label={`${p.totalHours} hours ${p.minutes} minutes ${p.seconds} seconds`}>
      {chars.map((c, i) => {
        const key = chars.length - i;
        return "sep" in c ? (
          <span key={key} className="sep" aria-hidden>
            :
          </span>
        ) : (
          <Digit key={key} d={c.d} animate={motion.numbers} />
        );
      })}
    </span>
  );
}
