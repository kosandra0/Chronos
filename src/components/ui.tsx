"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Inbox, X } from "lucide-react";
import { CATEGORY_COLORS } from "@/lib/identify";
import { useSettings } from "./Providers";

export function useFetch<T>(url: string | null, opts: { refreshMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const refresh = opts.refreshMs;
  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    let first = true;
    const run = async () => {
      if (first) setLoading(true);
      try {
        const r = await fetch(url, { signal: ac.signal, cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
        setData(j as T);
        setError(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
        first = false;
      }
    };
    void run();
    const id = refresh ? setInterval(() => !document.hidden && void run(), refresh) : undefined;
    return () => {
      ac.abort();
      if (id) clearInterval(id);
    };
  }, [url, nonce, refresh]);
  return { data, error, loading, reload };
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-sub">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, right, children, className = "", style, hover = false }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties; hover?: boolean }) {
  return (
    <section className={`card ${hover ? "hover" : ""} ${className}`} style={style}>
      {title && (
        <div className="card-title">
          <span>{title}</span>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Skeleton({ h = 16, w = "100%", style }: { h?: number; w?: number | string; style?: CSSProperties }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} />;
}

export function Empty({ title, text, icon, action }: { title: string; text?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ico">{icon ?? <Inbox size={20} />}</div>
      <b>{title}</b>
      {text && <div style={{ maxWidth: 420, lineHeight: 1.5 }}>{text}</div>}
      {action}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="err flex items-center justify-between gap-3">
      <span>{message}</span>
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.id} className={o.id === value ? "on" : ""} onClick={() => onChange(o.id)} role="tab" aria-selected={o.id === value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className={`switch ${on ? "on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function SettingRow({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="set-row">
      <div>
        <div className="t">{title}</div>
        {desc && <div className="d">{desc}</div>}
      </div>
      <div className="flex-none">{children}</div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, width }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number }) {
  const { motion: m } = useSettings();
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="backdrop"
          initial={m.page ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          exit={m.page ? { opacity: 0 } : { opacity: 1 }}
          transition={{ duration: 0.16 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            className="modal"
            style={width ? { width: Math.min(width, 1000) } : undefined}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={m.page ? { opacity: 0, y: 12, scale: 0.98 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={m.page ? { opacity: 0, y: 8, scale: 0.98 } : { opacity: 1 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-start justify-between gap-3" style={{ marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 650 }}>{title}</h2>
              <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const PALETTE = ["#5b9fd8", "#4fb3a5", "#93b58c", "#d9b56a", "#c98fb5", "#a094dc", "#e0877a", "#6bc0d0", "#b8a07a", "#8a97a8"];
export function hashColor(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
export function catColor(c: string) {
  return CATEGORY_COLORS[c] ?? CATEGORY_COLORS.Other;
}
export function paletteAt(i: number) {
  return PALETTE[i % PALETTE.length];
}

export function AppIcon({ name, size = 32, special }: { name: string; size?: number; special?: "desktop" | "idle" | "locked" }) {
  const color = special === "desktop" ? CATEGORY_COLORS.Desktop : special === "idle" ? CATEGORY_COLORS.Idle : special === "locked" ? CATEGORY_COLORS.Locked : hashColor(name);
  return (
    <div className="app-icon" style={{ width: size, height: size, background: `linear-gradient(145deg, ${color}, color-mix(in srgb, ${color} 62%, #000))`, fontSize: size * 0.42 }} aria-hidden>
      {(name.trim()[0] ?? "?").toUpperCase()}
    </div>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="badge">
      <span className="dot" style={{ background: catColor(category) }} />
      {category}
    </span>
  );
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    t.current = setTimeout(() => setV(value), ms);
    return () => {
      if (t.current) clearTimeout(t.current);
    };
  }, [value, ms]);
  return v;
}

export function ChartTip({ active, payload, label, fmt }: { active?: boolean; payload?: { value?: number; name?: string; payload?: { name?: string } }[]; label?: string; fmt: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="muted" style={{ fontSize: "0.78rem" }}>
        {label ?? payload[0].payload?.name}
      </div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontWeight: 600 }}>
          {fmt(Number(p.value ?? 0))}
        </div>
      ))}
    </div>
  );
}
