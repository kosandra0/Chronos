import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { reconcileStale } from "@/lib/engine";
import { handle } from "@/lib/http";
import { isValidYmd, parseYmd, resolvePreset, ymd } from "@/lib/ranges";
import { getTz } from "@/lib/settings";
import { getStats, periodTotals } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** Chronos' own foreground usage (recorded under the application "Chronos"). */
export async function GET(req: Request) {
  return handle(async () => {
    await reconcileStale();
    const a = (await db.select().from(applications).where(eq(applications.identityKey, "chronos:self")).limit(1))[0];
    if (!a) return { tracked: false };
    const p = new URL(req.url).searchParams.get("today");
    const now = isValidYmd(p) ? parseYmd(p) : new Date(ymd(new Date()) + "T00:00:00");
    const tz = await getTz();
    const periods = await periodTotals(
      a.id,
      {
        lifetime: { from: null, to: null },
        today: resolvePreset("today", undefined, now),
        week: resolvePreset("thisWeek", undefined, now),
        month: resolvePreset("thisMonth", undefined, now),
      },
      tz,
    );
    const life = await getStats({ from: null, to: null }, { appId: a.id });
    return { tracked: true, id: a.id, periods, sessions: life.sessions.count, avgMs: life.sessions.avgMs, longestMs: life.sessions.longest?.ms ?? null };
  });
}
