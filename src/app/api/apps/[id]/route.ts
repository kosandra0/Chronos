import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { reconcileStale } from "@/lib/engine";
import { badRequest, handle, rangeFrom } from "@/lib/http";
import { CATEGORIES } from "@/lib/identify";
import { isValidYmd, parseYmd, resolvePreset, ymd } from "@/lib/ranges";
import { getTz } from "@/lib/settings";
import { getStats, periodTotals, querySessions } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const a = (await db.select().from(applications).where(eq(applications.id, id)).limit(1))[0];
    if (!a) return badRequest("Application not found", 404);
    await reconcileStale();
    const todayParam = url.searchParams.get("today");
    const now = isValidYmd(todayParam) ? parseYmd(todayParam) : new Date(ymd(new Date()) + "T00:00:00");
    const range = rangeFrom(url);
    const tz = await getTz();
    const periods = await periodTotals(
      id,
      {
        lifetime: { from: null, to: null },
        today: resolvePreset("today", undefined, now),
        yesterday: resolvePreset("yesterday", undefined, now),
        week: resolvePreset("thisWeek", undefined, now),
        month: resolvePreset("thisMonth", undefined, now),
        year: resolvePreset("thisYear", undefined, now),
        custom: range.from || range.to ? range : { from: null, to: null },
      },
      tz,
    );
    const [lifetime, selected, recent] = await Promise.all([
      getStats({ from: null, to: null }, { appId: id }),
      getStats(range.from || range.to ? range : { from: null, to: null }, { appId: id }),
      querySessions({ appId: id, page: 1, pageSize: 15, sort: "date", dir: "desc" }),
    ]);
    return {
      app: {
        id: a.id,
        name: a.name,
        exe: a.executableName,
        path: a.executablePath,
        category: a.category,
        categoryOverridden: a.categoryOverridden,
        detectionStatus: a.detectionStatus,
        elevated: a.elevated,
        firstSeen: a.firstSeen.toISOString(),
        lastSeen: a.lastSeen.toISOString(),
      },
      periods,
      lifetimeSessions: lifetime.sessions,
      selected: { byDay: selected.byDay, byHour: selected.byHour, sessions: selected.sessions },
      lifetimeByDay: lifetime.byDay,
      recent: recent.sessions,
    };
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { category?: string; reset?: boolean };
    if (!body.category || !(CATEGORIES as readonly string[]).includes(body.category)) return badRequest("Unknown category");
    await db.update(applications).set({ category: body.category, categoryOverridden: true }).where(eq(applications.id, id));
    return { ok: true };
  });
}
