import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { DEFAULT_SETTINGS, LOGOS, type ChronosSettings } from "./settings-shared";
import { isCurrency } from "./v2/billing";
import { parseHM } from "./v2/schedule";

const g = globalThis as typeof globalThis & { __chronosSettingsCache?: { at: number; value: ChronosSettings } | null };

export function invalidateSettingsCache() {
  g.__chronosSettingsCache = null;
}

export async function getSettings(): Promise<ChronosSettings> {
  const c = g.__chronosSettingsCache;
  if (c && Date.now() - c.at < 2000) return c.value;
  const rows = await db.select().from(settings);
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (!(r.key in DEFAULT_SETTINGS)) continue;
    try {
      const v = JSON.parse(r.value);
      const def = (DEFAULT_SETTINGS as Record<string, unknown>)[r.key];
      if (typeof v === typeof def) merged[r.key] = v;
    } catch {
      /* ignore malformed value, keep default */
    }
  }
  if (merged.landing === "/heatmap") merged.landing = "/statistics"; // Heat Map now lives inside Statistics
  const value = merged as ChronosSettings;
  g.__chronosSettingsCache = { at: Date.now(), value };
  return value;
}

export async function updateSettings(partial: Record<string, unknown>): Promise<ChronosSettings> {
  const defs = DEFAULT_SETTINGS as Record<string, unknown>;
  for (const [k, v] of Object.entries(partial)) {
    if (!(k in defs) || typeof v !== typeof defs[k]) continue;
    let val = v;
    if (k === "idleThresholdMin") val = Math.min(240, Math.max(1, Math.round(Number(v))));
    if (k === "fontSize") val = Math.min(18, Math.max(12, Math.round(Number(v))));
    if (k === "logo" && !LOGOS.some((l) => l.id === v)) continue;
    if ((k === "customColor1" || k === "customColor2" || k === "customColor3" || k === "customAccent") && !/^#[0-9a-fA-F]{6}$/.test(String(v))) continue;
    if (k === "customAngle") val = ((Math.round(Number(v)) % 360) + 360) % 360;
    if (k === "userName") val = String(v).replace(/\s+/g, " ").trim().slice(0, 40);
    if (k === "radius") val = Math.min(24, Math.max(0, Math.round(Number(v))));
    if (k === "dailyGoalHours") val = Math.min(24, Math.max(0, Math.round(Number(v) * 2) / 2));
    if (k === "weeklyReportDay") val = Math.min(6, Math.max(0, Math.round(Number(v))));
    if (k === "weeklyReportTime" || k === "themeDayStart" || k === "themeNightStart") {
      if (parseHM(v) === null) continue;
      val = String(v).trim().padStart(5, "0");
    }
    if (k === "productivityGoalHours") val = Math.min(24, Math.max(0, Math.round(Number(v) * 2) / 2));
    if (k === "currency" && !isCurrency(v)) continue;
    if ((k === "themeDay" || k === "themeNight") && !/^[a-z0-9-]{2,30}$/.test(String(v))) continue;
    const value = JSON.stringify(val);
    await db.insert(settings).values({ key: k, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
  }
  invalidateSettingsCache();
  return getSettings();
}

export async function getKV(key: string): Promise<string | null> {
  const r = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return r[0]?.value ?? null;
}

export async function setKV(key: string, value: string) {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function getTz(): Promise<string> {
  const s = await getSettings();
  const tz = s.timezone || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}
