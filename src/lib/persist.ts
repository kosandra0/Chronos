"use client";

import { useCallback, useState } from "react";

/**
 * useState that remembers its value while you move between menus (in-memory) and across restarts
 * (localStorage). Used for filters, sort order and date ranges so users never have to re-pick them.
 */
const mem = new Map<string, unknown>();

export function usePersisted<T>(key: string, initial: T) {
  const full = `wt.filter.${key}`;
  const [value, setValue] = useState<T>(() => {
    if (mem.has(full)) return mem.get(full) as T;
    try {
      const raw = localStorage.getItem(full);
      if (raw !== null) {
        const v = JSON.parse(raw) as T;
        mem.set(full, v);
        return v;
      }
    } catch {
      /* storage unavailable: fall back to the default */
    }
    return initial;
  });
  const set = useCallback(
    (v: T | ((prev: T) => T)) =>
      setValue((prev) => {
        const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        mem.set(full, next);
        try {
          localStorage.setItem(full, JSON.stringify(next));
        } catch {
          /* non-critical */
        }
        return next;
      }),
    [full],
  );
  return [value, set] as const;
}
