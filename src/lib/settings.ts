import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { DEFAULT_SETTINGS, type ChronosSettings } from "./settings-shared";

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
    if (k === "radius") val = Math.min(24, Math.max(4, Math.round(Number(v))));
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
