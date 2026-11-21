// Focus Mode: a pure, wall-clock based state machine. All functions take `now` (ms) so they are deterministic
// and testable. State is persisted by the caller; time while WatchTower was not running (restart, sleep) is frozen.

export type FocusPhase = "focus" | "short" | "long";
export type FocusConfig = {
  focusMin: number;
  shortMin: number;
  longMin: number;
  longEvery: number; // a long break after this many focus blocks
  auto: boolean; // start the next phase automatically
  reminders: boolean; // eye/stretch reminders while focusing
  reminderEveryMin: number;
  notifyPhaseEnd: boolean;
};
export const DEFAULT_FOCUS_CONFIG: FocusConfig = { focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4, auto: false, reminders: true, reminderEveryMin: 20, notifyPhaseEnd: true };

const clampInt = (v: unknown, lo: number, hi: number, def: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, Math.round(n)));
};

/** Invalid or missing values fall back to the base config; out-of-range values are clamped. */
export function sanitizeFocusConfig(raw: unknown, base: FocusConfig = DEFAULT_FOCUS_CONFIG): FocusConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const b = (k: "auto" | "reminders" | "notifyPhaseEnd") => (typeof r[k] === "boolean" ? (r[k] as boolean) : base[k]);
  return {
    focusMin: clampInt(r.focusMin ?? base.focusMin, 1, 180, base.focusMin),
    shortMin: clampInt(r.shortMin ?? base.shortMin, 1, 60, base.shortMin),
    longMin: clampInt(r.longMin ?? base.longMin, 1, 120, base.longMin),
    longEvery: clampInt(r.longEvery ?? base.longEvery, 2, 10, base.longEvery),
    auto: b("auto"),
    reminders: b("reminders"),
    reminderEveryMin: clampInt(r.reminderEveryMin ?? base.reminderEveryMin, 5, 120, base.reminderEveryMin),
    notifyPhaseEnd: b("notifyPhaseEnd"),
  };
}

export type FocusState = {
  status: "idle" | "running" | "paused";
  phase: FocusPhase; // current phase, or the suggested next one while idle
  endsAt: number | null; // running
  remainingMs: number | null; // paused
  phaseMs: number; // full length of the current phase
  lastSeen: number; // last time the engine observed the clock
  completedFocus: number; // focus blocks completed in this run (resets on stop)
  reminderIdx: number; // reminders already sent in this focus block
  focusMsToday: number; // accumulated completed focus time (informational)
};

export type FocusEvent =
  | { type: "phase-complete"; phase: FocusPhase; next: FocusPhase; auto: boolean; at: number }
  | { type: "reminder"; kind: "eyes" | "stretch"; at: number }
  | { type: "gap"; skippedMs: number; at: number };

export const initialFocusState = (now = 0): FocusState => ({ status: "idle", phase: "focus", endsAt: null, remainingMs: null, phaseMs: 0, lastSeen: now, completedFocus: 0, reminderIdx: 0, focusMsToday: 0 });

export const phaseMs = (cfg: FocusConfig, phase: FocusPhase) => (phase === "focus" ? cfg.focusMin : phase === "short" ? cfg.shortMin : cfg.longMin) * 60_000;
/** Longest time between clock observations that still counts as continuous (sleep/restart/hibernate exceeds it). */
export const GAP_MS = 150_000;

export function startPhase(s: FocusState, cfg: FocusConfig, phase: FocusPhase, now: number): FocusState {
  const ms = phaseMs(cfg, phase);
  return { ...s, status: "running", phase, endsAt: now + ms, remainingMs: null, phaseMs: ms, lastSeen: now, reminderIdx: 0 };
}
/** Starts the suggested phase when idle (a fresh run begins with focus). Starting while running/paused restarts a fresh focus block. */
export function startFocus(s: FocusState, cfg: FocusConfig, now: number): FocusState {
  return s.status === "idle" ? startPhase(s, cfg, s.phase, now) : startPhase(initialFocusState(now), cfg, "focus", now);
}
export function pause(s: FocusState, now: number): FocusState {
  if (s.status !== "running" || s.endsAt === null) return s;
  return { ...s, status: "paused", remainingMs: Math.max(0, s.endsAt - now), endsAt: null, lastSeen: now };
}
export function resume(s: FocusState, now: number): FocusState {
  if (s.status !== "paused" || s.remainingMs === null) return s;
  return { ...s, status: "running", endsAt: now + s.remainingMs, remainingMs: null, lastSeen: now };
}
export const stop = (s: FocusState, now: number): FocusState => ({ ...initialFocusState(now), focusMsToday: s.focusMsToday });

export const nextPhase = (completedFocus: number, cfg: FocusConfig): FocusPhase => (completedFocus > 0 && completedFocus % cfg.longEvery === 0 ? "long" : "short");

export function remaining(s: FocusState, now: number): number {
  if (s.status === "running" && s.endsAt !== null) return Math.max(0, s.endsAt - now);
  if (s.status === "paused" && s.remainingMs !== null) return s.remainingMs;
  return 0;
}

/** Moves the machine forward to `now`. At most one phase transition per call. Never replays missed time. */
export function advance(s0: FocusState, cfg: FocusConfig, now: number): { state: FocusState; events: FocusEvent[] } {
  const events: FocusEvent[] = [];
  let s = s0;
  if (s.status === "running" && s.endsAt !== null) {
    const gap = now - s.lastSeen;
    if (gap > GAP_MS) {
      // Computer slept or WatchTower was closed: the missing time does not count towards the timer.
      s = { ...s, endsAt: s.endsAt + gap };
      events.push({ type: "gap", skippedMs: gap, at: now });
    }
    const endsAt = s.endsAt as number;
    if (now >= endsAt) {
      const done = s.phase;
      const completedFocus = done === "focus" ? s.completedFocus + 1 : s.completedFocus;
      const focusMsToday = done === "focus" ? s.focusMsToday + s.phaseMs : s.focusMsToday;
      const next: FocusPhase = done === "focus" ? nextPhase(completedFocus, cfg) : "focus";
      events.push({ type: "phase-complete", phase: done, next, auto: cfg.auto, at: now });
      const base: FocusState = { ...s, completedFocus: done === "long" ? 0 : completedFocus, focusMsToday };
      s = cfg.auto ? startPhase(base, cfg, next, now) : { ...base, status: "idle", phase: next, endsAt: null, remainingMs: null, phaseMs: 0, lastSeen: now, reminderIdx: 0 };
      return { state: s, events };
    }
    if (cfg.reminders && s.phase === "focus") {
      const elapsed = s.phaseMs - (endsAt - now);
      const idx = Math.floor(elapsed / (cfg.reminderEveryMin * 60_000));
      // at most one reminder per call, and never in the last minute of the block
      if (idx > s.reminderIdx && endsAt - now > 60_000) {
        events.push({ type: "reminder", kind: idx % 2 === 1 ? "eyes" : "stretch", at: now });
        s = { ...s, reminderIdx: idx };
      }
    }
  }
  return { state: { ...s, lastSeen: now }, events };
}
