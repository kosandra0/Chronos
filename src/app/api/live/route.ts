import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, backupHistory, sessions } from "@/db/schema";
import { agentActive, agentInfo, agentLastSeen, reconcileStale } from "@/lib/engine";
import { handle } from "@/lib/http";
import { ymd } from "@/lib/ranges";
import { getSettings } from "@/lib/settings";
import { getStats, querySessions } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const day = url.searchParams.get("day") || ymd(new Date());
    await reconcileStale();
    const settings = await getSettings();
    const [today, recent, open, lastBackup] = await Promise.all([
      getStats({ from: day, to: day }),
      querySessions({ page: 1, pageSize: 8, sort: "date", dir: "desc" }),
      db
        .select({ s: sessions, a: applications })
        .from(sessions)
        .leftJoin(applications, eq(applications.id, sessions.applicationId))
        .where(eq(sessions.isOpen, true))
        .limit(1),
      db.select().from(backupHistory).orderBy(desc(backupHistory.createdAt)).limit(1),
    ]);
    const cur = open[0];
    return {
      serverNow: Date.now(),
      status: !settings.monitoringEnabled ? "paused" : cur ? "tracking" : "waiting",
      agent: { active: agentActive(), lastSeen: agentLastSeen() ? new Date(agentLastSeen()).toISOString() : null, info: agentInfo() },
      current: cur
        ? {
            type: cur.s.activityType,
            appId: cur.a?.id ?? null,
            name: cur.a?.name ?? (cur.s.activityType === "desktop" ? "Desktop" : cur.s.activityType === "idle" ? "Idle" : "Locked"),
            exe: cur.a?.executableName ?? null,
            startedAt: cur.s.startTime.toISOString(),
            source: cur.s.source,
            limited: cur.a?.detectionStatus === "limited",
          }
        : null,
      today,
      recent: recent.sessions,
      lastBackup: lastBackup[0]
        ? { id: lastBackup[0].id, status: lastBackup[0].status, createdAt: lastBackup[0].createdAt.toISOString(), kind: lastBackup[0].kind, message: lastBackup[0].message }
        : null,
    };
  });
}
