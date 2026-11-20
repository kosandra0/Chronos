"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CornerDownLeft, Palette, PanelLeft, Search, Sparkles, Zap } from "lucide-react";
import { NAV, THEMES } from "@/lib/settings-shared";
import { useSettings } from "./Providers";

type Item = { id: string; group: string; label: string; hint?: string; icon: React.ReactNode; run: () => void };

/** Ctrl+K command palette: jump to any page, switch theme, toggle common settings. */
export function CommandPalette({ open, onClose, onOpenLogs }: { open: boolean; onClose: () => void; onOpenLogs: () => void }) {
  const router = useRouter();
  const { settings, update } = useSettings();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = NAV.map((n) => ({ id: `nav:${n.href}`, group: "Go to", label: n.label, icon: <Search size={16} />, run: () => router.push(n.href) }));
    THEMES.forEach((t) => out.push({ id: `theme:${t.id}`, group: "Theme", label: t.label, hint: settings.theme === t.id ? "current" : undefined, icon: <Palette size={16} />, run: () => void update({ theme: t.id }) }));
    out.push(
      { id: "act:sidebar", group: "Actions", label: settings.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar", icon: <PanelLeft size={16} />, run: () => void update({ sidebarCollapsed: !settings.sidebarCollapsed }) },
      { id: "act:anim", group: "Actions", label: settings.animations ? "Turn animations off" : "Turn animations on", icon: <Sparkles size={16} />, run: () => void update({ animations: !settings.animations }) },
      { id: "act:perf", group: "Actions", label: "Use Performance mode", icon: <Zap size={16} />, run: () => void update({ performanceMode: "performance" }) },
      { id: "act:logs", group: "Actions", label: "Open update logs", icon: <Sparkles size={16} />, run: onOpenLogs },
    );
    return out;
  }, [router, settings, update, onOpenLogs]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((i) => `${i.group} ${i.label}`.toLowerCase().includes(s)) : items;
  }, [items, q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);
  useEffect(() => setSel(0), [q]);

  const run = (i?: Item) => {
    if (!i) return;
    onClose();
    i.run();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="palette-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} onMouseDown={onClose}>
          <motion.div
            className="palette"
            role="dialog"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={q}
              placeholder="Search pages, themes and actions…"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(filtered.length - 1, s + 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
                else if (e.key === "Enter") { e.preventDefault(); run(filtered[sel]); }
                else if (e.key === "Escape") onClose();
              }}
            />
            <div className="palette-list">
              {filtered.length === 0 && <div className="muted" style={{ padding: 16 }}>No matches</div>}
              {filtered.map((it, i) => (
                <div key={it.id}>
                  {(i === 0 || filtered[i - 1].group !== it.group) && <div className="palette-group">{it.group}</div>}
                  <button className={`palette-item ${i === sel ? "sel" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => run(it)}>
                    {it.icon}
                    <span style={{ flex: 1 }}>{it.label}</span>
                    {it.hint && <span className="faint" style={{ fontSize: "0.78rem" }}>{it.hint}</span>}
                    {i === sel && <CornerDownLeft size={14} />}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
