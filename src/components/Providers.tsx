"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Award, Archive, Bell, FileCheck2, Pause, Play } from "lucide-react";
import { AnimatePresence, motion as fm } from "framer-motion";
import { getDesktop } from "@/lib/desktop";
import { DEFAULT_SETTINGS, customThemeVars, type ChronosSettings } from "@/lib/settings-shared";
import { ymd, addDays, resolvePreset } from "@/lib/ranges";
import { formatShort } from "@/lib/time";
import { scheduledTheme } from "@/lib/v2/schedule";
import type { StatsResult, SessionRow } from "@/lib/stats";

// ---------------- Settings ----------------

type SettingsCtx = {
  settings: ChronosSettings;
  ready: boolean;
  update: (patch: Partial<ChronosSettings>) => Promise<void>;
  motion: { numbers: boolean; charts: boolean; page: boolean };
};
const SettingsContext = createContext<SettingsCtx | null>(null);
export const useSettings = () => {
  const c = useContext(SettingsContext);
  if (!c) throw new Error("SettingsContext missing");
  return c;
};

// ---------------- Live ----------------

export type LiveData = {
  serverNow: number;
  status: "tracking" | "paused" | "waiting";
  agent: { active: boolean; lastSeen: string | null };
  current: { type: string; appId: string | null; name: string; exe: string | null; startedAt: string; source: string; limited: boolean } | null;
  today: StatsResult;
  recent: SessionRow[];
  lastBackup: { id: string; status: string; createdAt: string; kind: string; message: string | null } | null;
};
type LiveCtx = { data: LiveData | null; fetchedAt: number; error: string | null; reload: () => void };
const LiveContext = createContext<LiveCtx>({ data: null, fetchedAt: 0, error: null, reload: () => {} });
const ClockContext = createContext(0);
export const useLive = () => useContext(LiveContext);

/** Totals for "today" including time elapsed since the last fetch (local monotonic clock). */
export function useLiveTotals() {
  useContext(ClockContext); // re-render once per second
  const { data, fetchedAt } = useContext(LiveContext);
  const { settings } = useSettings();
  if (!data) return null;
  const elapsed = data.current ? Math.max(0, Math.min(performance.now() - fetchedAt, 25_000)) : 0;
  const t = { ...data.today.totals };
  const cur = data.current;
  if (cur) {
    if (cur.type === "app" || cur.type === "desktop") {
      t.active += elapsed;
      if (cur.type === "app") t.app += elapsed;
      if (cur.type === "desktop") t.desktop += elapsed;
    } else if (cur.type === "idle") t.idle += elapsed;
  }
  t.screen = t.active + (settings.idleInTotal ? t.idle : 0);
  const apps = data.today.apps.map((a) => (cur && cur.type === "app" && cur.appId === a.id ? { ...a, ms: a.ms + elapsed } : a));
  if (cur && cur.type === "app" && cur.appId && !apps.some((a) => a.id === cur.appId)) {
    apps.push({ id: cur.appId, name: cur.name, exe: cur.exe ?? "", category: "Other", ms: elapsed, pct: 0 });
  }
  apps.sort((a, b) => b.ms - a.ms);
  const withPct = apps.map((a) => ({ ...a, pct: t.active ? a.ms / t.active : 0 }));
  return { data, totals: t, apps: withPct, elapsed };
}

// ---------------- Toasts ----------------

type Toast = { id: number; title: string; body?: string; kind?: "info" | "ach" | "backup" | "mon" | "file"; path?: string };
const ToastContext = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(ToastContext);

// ---------------- Provider ----------------

const CUSTOM_VARS = ["--bg", "--bg2", "--card", "--elev", "--text", "--text2", "--text3", "--accent", "--accent-ink", "--border", "--border-strong", "--shadow", "--glass", "--hover", "--heat0", "--custom-gradient"];

function applyAppearance(s: ChronosSettings) {
  const d = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const base = scheduledTheme({ enabled: s.themeScheduleEnabled, dayTheme: s.themeDay, nightTheme: s.themeNight, dayStart: s.themeDayStart, nightStart: s.themeNightStart }, new Date()) ?? s.theme;
  const theme = base === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : s.theme;
  const perf = s.performanceMode === "performance";
  if (d.dataset.theme !== theme) d.dataset.theme = theme; // unchanged theme: no attribute write, no repaint
  // The custom gradient theme is driven by inline CSS variables; they are removed again for every other theme.
  for (const name of CUSTOM_VARS) d.style.removeProperty(name);
  d.style.colorScheme = "";
  if (theme === "custom") {
    const vars = customThemeVars(s);
    for (const [name, value] of Object.entries(vars)) {
      if (name === "--scheme") d.style.colorScheme = value;
      else d.style.setProperty(name, value);
    }
    try { localStorage.setItem("chronos.customvars", JSON.stringify(vars)); } catch { /* storage unavailable: the boot script just falls back to the defaults */ }
  }
  d.dataset.accent = s.accent;
  d.dataset.density = s.density;
  d.dataset.font = s.font;
  d.dataset.motion = !s.animations || perf || reduced ? "off" : "on";
  d.dataset.speed = s.animSpeed;
  d.dataset.titlebar = s.titleBar;
  d.dataset.shadow = s.shadow;
  d.dataset.transparency = s.transparency && !perf ? "on" : "off";
  d.style.setProperty("--fs", `${s.fontSize}px`);
  d.style.setProperty("--radius", `${s.radius}px`);
}

export function Providers({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ChronosSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [live, setLive] = useState<LiveCtx>({ data: null, fetchedAt: 0, error: null, reload: () => {} });
  const [tick, setTick] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.kind === "file" ? 9000 : 6500);
  }, []);

  // Load settings once; cache for flash-free boot.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = (await (await fetch("/api/settings")).json()) as ChronosSettings;
        if (!alive) return;
        if (!s.timezone) {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          fetch("/api/settings", { method: "PATCH", body: JSON.stringify({ timezone: tz }) }).catch(() => {});
          s.timezone = tz;
        }
        setSettings(s);
        localStorage.setItem("chronos.settings", JSON.stringify(s));
        applyAppearance(s);
      } catch {
        /* keep defaults */
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (ready) applyAppearance(settings);
    // Automatic theme schedule: re-evaluated every 30 s; the DOM is only touched when the scheduled theme actually changes.
    const sched = setInterval(() => {
      const s = settingsRef.current;
      if (!s.themeScheduleEnabled) return;
      const want = scheduledTheme({ enabled: true, dayTheme: s.themeDay, nightTheme: s.themeNight, dayStart: s.themeDayStart, nightStart: s.themeNightStart }, new Date());
      if (want && document.documentElement.dataset.theme !== want) applyAppearance(s);
    }, 30000);
    const mq = matchMedia("(prefers-color-scheme: light)");
    const h = () => settingsRef.current.theme === "system" && applyAppearance(settingsRef.current);
    mq.addEventListener("change", h);
    return () => { mq.removeEventListener("change", h); clearInterval(sched); };
  }, [settings, ready]);

  const update = useCallback(
    async (patch: Partial<ChronosSettings>) => {
      const prev = settingsRef.current;
      const next = { ...prev, ...patch };
      setSettings(next);
      localStorage.setItem("chronos.settings", JSON.stringify(next));
      try {
        const r = await fetch("/api/settings", { method: "PATCH", body: JSON.stringify(patch) });
        if (!r.ok) throw new Error("save failed");
        const saved = (await r.json()) as ChronosSettings;
        setSettings(saved);
        localStorage.setItem("chronos.settings", JSON.stringify(saved));
        if ("monitoringEnabled" in patch && patch.monitoringEnabled !== prev.monitoringEnabled && saved.notifyMonitoring) {
          toast({ kind: "mon", title: patch.monitoringEnabled ? "Monitoring started" : "Monitoring stopped", body: patch.monitoringEnabled ? "WatchTower is recording foreground activity." : "No activity is being recorded." });
        }
      } catch {
        setSettings(prev);
        toast({ title: "Could not save settings", body: "The change was reverted." });
      }
    },
    [toast],
  );

  // Desktop shell: keep the native side in sync with saved settings, and report where files were saved.
  useEffect(() => {
    const desk = getDesktop();
    if (!desk || !ready) return;
    desk.applyShell({
      launchAtStartup: settings.launchAtStartup,
      startMinimized: settings.startMinimized,
      minimizeToTray: settings.minimizeToTray,
      closeToTray: settings.closeToTray,
      confirmExit: settings.confirmExit,
    });
  }, [ready, settings.launchAtStartup, settings.startMinimized, settings.minimizeToTray, settings.closeToTray, settings.confirmExit]);

  useEffect(() => {
    const desk = getDesktop();
    if (desk && ready) desk.setLogo(settings.logo);
  }, [ready, settings.logo]);

  useEffect(() => {
    const desk = getDesktop();
    if (!desk) return;
    document.documentElement.dataset.desktop = "true";
    const offMax = desk.onMaximized((m) => { document.documentElement.dataset.maximized = m ? "true" : "false"; });
    const offDl = desk.onDownload((d) => {
      if (d.state === "completed") toast({ kind: "file", title: "Export saved", body: d.path, path: d.path });
      else if (d.state === "cancelled") toast({ kind: "info", title: "Export cancelled", body: "No file was saved." });
      else toast({ kind: "info", title: "Export failed", body: "The file could not be saved." });
    });
    return () => { offMax(); offDl(); };
  }, [toast]);

  const motion = useMemo(() => {
    const perf = settings.performanceMode === "performance";
    return { numbers: settings.animations && !perf && settings.numberRoll, charts: settings.animations && !perf, page: settings.animations && !perf };
  }, [settings.animations, settings.performanceMode]);

  // Live polling (slower in performance mode — tracking accuracy is unaffected, it is server-side).
  const pollMs = settings.performanceMode === "performance" ? 10_000 : 3_000;
  const fetchLive = useCallback(async () => {
    try {
      const r = await fetch(`/api/live?day=${ymd(new Date())}`, { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      const data = (await r.json()) as LiveData;
      setLive((l) => ({ ...l, data, fetchedAt: performance.now(), error: null }));
    } catch (e) {
      setLive((l) => ({ ...l, error: e instanceof Error ? e.message : "Cannot reach WatchTower engine" }));
    }
  }, []);
  useEffect(() => {
    void fetchLive();
    const id = setInterval(() => {
      if (!document.hidden) void fetchLive();
    }, pollMs);
    const vis = () => !document.hidden && void fetchLive();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [fetchLive, pollMs]);
  const liveValue = useMemo(() => ({ ...live, reload: fetchLive }), [live, fetchLive]);

  // One-second clock for counters.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ---- WatchTower self-usage tracking (UI focus based; the server ignores it when the native agent is active) ----
  useEffect(() => {
    if (!ready) return;
    let lastInput = Date.now();
    let wasActive = false;
    const onInput = () => {
      lastInput = Date.now();
    };
    const events = ["mousemove", "keydown", "pointerdown", "wheel", "touchstart"];
    events.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
    const post = (body: object, beacon = false) => {
      const json = JSON.stringify({ source: "ui", ...body });
      if (beacon && navigator.sendBeacon) navigator.sendBeacon("/api/ingest", new Blob([json], { type: "application/json" }));
      else fetch("/api/ingest", { method: "POST", body: json, keepalive: true }).catch(() => {});
    };
    const beat = () => {
      const s = settingsRef.current;
      if (!s.trackSelf || !s.monitoringEnabled) return;
      const focused = document.hasFocus() && !document.hidden;
      if (!focused) {
        if (wasActive) post({ kind: "none", reason: "chronos-unfocused" });
        wasActive = false;
        return;
      }
      wasActive = true;
      const thr = s.idleThresholdMin * 60_000;
      if (s.idleEnabled && Date.now() - lastInput >= thr) post({ kind: "idle", at: new Date(lastInput + thr).toISOString() });
      else post({ kind: "app", self: true, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    };
    const id = setInterval(beat, 5000);
    beat();
    const onFocus = () => beat();
    const onHide = () => {
      if (wasActive) post({ kind: "none", reason: "chronos-closed" }, true);
      wasActive = false;
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(id);
      events.forEach((e) => window.removeEventListener(e, onInput));
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("pagehide", onHide);
    };
  }, [ready]);

  // ---- Notifications: achievements, level-ups, backups, summaries ----
  const lastBackupId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const b = live.data?.lastBackup;
    if (!live.data) return;
    if (lastBackupId.current === undefined) {
      lastBackupId.current = b?.id ?? null;
      return;
    }
    if (b && b.id !== lastBackupId.current) {
      lastBackupId.current = b.id;
      const s = settingsRef.current;
      if (b.status === "ok" && s.notifyBackupOk) toast({ kind: "backup", title: "Backup completed", body: b.message ?? undefined });
      if (b.status !== "ok" && s.notifyBackupFail) toast({ kind: "backup", title: "Backup failed", body: b.message ?? undefined });
    }
  }, [live.data, toast]);

  useEffect(() => {
    if (!ready) return;
    const check = async () => {
      try {
        const p = (await (await fetch("/api/achievements")).json()) as { unseen: { id: string; title: string; xp: number }[]; level: { level: number; name: string } };
        const prevLevel = Number(localStorage.getItem("chronos.level") ?? 0);
        const s = settingsRef.current;
        if (p.unseen?.length) {
          if (s.notifyAchievement && s.gamificationNotify) {
            p.unseen.forEach((u) => toast({ kind: "ach", title: `Achievement unlocked: ${u.title}`, body: `+${u.xp} XP` }));
            if (prevLevel && p.level.level > prevLevel) toast({ kind: "ach", title: `Level ${p.level.level} · ${p.level.name}`, body: "You reached a new level." });
          }
          await fetch("/api/achievements", { method: "POST", body: JSON.stringify({ seen: true }) });
        }
        localStorage.setItem("chronos.level", String(p.level.level));
      } catch {
        /* non-critical */
      }
    };
    void check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [ready, toast]);

  useEffect(() => {
    if (!ready) return;
    const s = settingsRef.current;
    const today = new Date();
    const key = ymd(today);
    (async () => {
      try {
        if (s.notifyDaily && localStorage.getItem("chronos.dailySummary") !== key) {
          localStorage.setItem("chronos.dailySummary", key);
          const y = ymd(addDays(today, -1));
          const st = (await (await fetch(`/api/stats?from=${y}&to=${y}`)).json()) as StatsResult;
          if (st.totals?.screen > 0) toast({ kind: "info", title: "Daily summary", body: `Yesterday: ${formatShort(st.totals.screen)} of screen time${st.mostUsed ? `, most used ${st.mostUsed.name}` : ""}.` });
        }
        if (s.notifyWeekly && today.getDay() === 1 && localStorage.getItem("chronos.weeklySummary") !== key) {
          localStorage.setItem("chronos.weeklySummary", key);
          const r = resolvePreset("lastWeek", undefined, today);
          const st = (await (await fetch(`/api/stats?from=${r.from}&to=${r.to}`)).json()) as StatsResult;
          if (st.totals?.screen > 0) toast({ kind: "info", title: "Weekly summary", body: `Last week: ${formatShort(st.totals.screen)} across ${st.averages.usageDays} days.` });
        }
      } catch {
        /* non-critical */
      }
    })();
  }, [ready, toast]);

  const ctx = useMemo(() => ({ settings, ready, update, motion }), [settings, ready, update, motion]);

  return (
    <SettingsContext.Provider value={ctx}>
      <ToastContext.Provider value={toast}>
        <LiveContext.Provider value={liveValue}>
          <ClockContext.Provider value={tick}>
            {children}
            <div className="toasts" aria-live="polite">
              <AnimatePresence initial={false}>
                {toasts.map((t) => (
                  <fm.div
                    key={t.id}
                    layout
                    className={`toast ${t.kind === "ach" ? "ach unlock" : ""}`}
                    initial={{ opacity: 0, y: 18, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.97, transition: { duration: 0.35 } }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  >
                    <div className="t-ico">
                      {t.kind === "ach" ? <Award size={17} /> : t.kind === "file" ? <FileCheck2 size={17} /> : t.kind === "backup" ? <Archive size={17} /> : t.kind === "mon" ? (t.title.includes("started") ? <Play size={16} /> : <Pause size={16} />) : <Bell size={16} />}
                    </div>
                    <div className="min-w-0" style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{t.title}</div>
                      {t.body && <div className="muted" style={{ fontSize: "0.86rem", marginTop: 2, wordBreak: "break-all" }}>{t.body}</div>}
                      {t.path && getDesktop() && <button className="btn" style={{ height: 28, marginTop: 8, padding: "0 10px", fontSize: "0.82rem" }} onClick={() => getDesktop()?.showInFolder(t.path!)}>Show in folder</button>}
                    </div>
                  </fm.div>
                ))}
              </AnimatePresence>
            </div>
          </ClockContext.Provider>
        </LiveContext.Provider>
      </ToastContext.Provider>
    </SettingsContext.Provider>
  );
}
