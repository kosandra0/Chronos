import { randomUUID } from "crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { withDatabaseWriteLock } from "@/db/write-lock";
import { applications, sessions } from "@/db/schema";
import { identifyApp, identityKey } from "./identify";
import { getSettings } from "./settings";

/**
 * Session management engine.
 *
 * Observations (foreground app / desktop / idle / locked / none) arrive from a native monitor
 * (the Windows agent) or from the Chronos UI itself. Writes are transition-based: a heartbeat
 * only advances end_time of the single open session; a different activity closes it and opens
 * the next one at the same instant, so sessions never overlap and never leave invented gaps.
 * If heartbeats stop (crash, sleep, shutdown) the open session is closed at its last heartbeat.
 */

export const STALE_MS = 20_000;

export type ObsKind = "app" | "desktop" | "idle" | "locked" | "none";

export type Observation = {
  kind: ObsKind;
  at?: string;
  source?: "agent" | "ui";
  reason?: string;
  self?: boolean;
  title?: string | null;
  app?: {
    exe: string;
    description?: string | null;
    product?: string | null;
    path?: string | null;
    pid?: number | null;
    elevated?: boolean;
    limited?: boolean;
  };
};

const g = globalThis as typeof globalThis & { __chronosAgentSeen?: number; __chronosAgentInfo?: Record<string, unknown> };

export function agentLastSeen(): number {
  return g.__chronosAgentSeen ?? 0;
}
export function agentInfo() {
  return g.__chronosAgentInfo ?? null;
}
export function agentActive(): boolean {
  return Date.now() - agentLastSeen() < STALE_MS;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function upsertApp(tx: Tx, obs: Observation, now: Date): Promise<string> {
  const self = !!obs.self;
  const a = obs.app;
  const exe = self ? "chronos" : (a?.exe || "unknown.exe");
  const key = self ? "chronos:self" : identityKey(exe, a?.path);
  const found = await tx.select().from(applications).where(eq(applications.identityKey, key)).limit(1);
  if (found[0]) {
    const f = found[0];
    const patch: Partial<typeof applications.$inferInsert> = { lastSeen: now };
    if (!f.executablePath && a?.path) patch.executablePath = a.path;
    if (self && f.name === "Chronos") patch.name = "WatchTower"; // product renamed; identity key is unchanged
    if (a?.elevated && !f.elevated) patch.elevated = true;
    if (a?.limited && f.detectionStatus === "ok") patch.detectionStatus = "limited";
    if (!a?.limited && f.detectionStatus === "limited" && a?.path) patch.detectionStatus = "ok";
    await tx.update(applications).set(patch).where(eq(applications.id, f.id));
    return f.id;
  }
  const id = randomUUID();
  const ident = self
    ? { name: "WatchTower", category: "Productivity" as const }
    : identifyApp({ exe, description: a?.description, product: a?.product, path: a?.path });
  await tx.insert(applications).values({
    id,
    identityKey: key,
    name: ident.name,
    executableName: exe,
    executablePath: a?.path ?? null,
    category: ident.category,
    detectionStatus: a?.limited ? "limited" : "ok",
    elevated: !!a?.elevated,
    firstSeen: now,
    lastSeen: now,
  });
  return id;
}

async function closeSession(tx: Tx, id: string, start: Date, endAt: Date, reason: string) {
  const end = endAt.getTime() < start.getTime() ? start : endAt;
  await tx
    .update(sessions)
    .set({ endTime: end, durationMs: end.getTime() - start.getTime(), isOpen: false, terminationReason: reason })
    .where(eq(sessions.id, id));
}

/** Close open sessions whose monitor stopped reporting. Ends them at their last heartbeat. */
export async function reconcileStale(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_MS);
  const res = await db
    .update(sessions)
    .set({
      isOpen: false,
      terminationReason: "monitor-unavailable",
      durationMs: sql`(extract(epoch from (${sessions.endTime} - ${sessions.startTime})) * 1000)::bigint`,
    })
    .where(and(eq(sessions.isOpen, true), lt(sessions.endTime, cutoff)))
    .returning({ id: sessions.id });
  return res.length;
}

async function ingestSerialized(obs: Observation): Promise<Record<string, unknown>> {
  const settings = await getSettings();
  const source = obs.source ?? "agent";
  const now = new Date();

  if (source === "agent") {
    g.__chronosAgentSeen = now.getTime();
    g.__chronosAgentInfo = { seenAt: now.toISOString(), kind: obs.kind };
  } else if (agentActive()) {
    return { ignored: "agent-active" };
  }

  let at = obs.at ? new Date(obs.at) : now;
  if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime()) at = now;
  if (now.getTime() - at.getTime() > 6 * 3600_000) at = now;

  let kind: ObsKind = obs.kind;
  let reason = obs.reason;
  if (!settings.monitoringEnabled) {
    kind = "none";
    reason = "monitoring-paused";
  } else if (kind === "desktop" && !settings.desktopTracking) {
    kind = "none";
    reason = "desktop-tracking-off";
  } else if (kind === "idle" && !settings.idleEnabled) {
    kind = "none";
    reason = "idle-detection-off";
  } else if (kind === "app" && obs.self && !settings.trackSelf) {
    kind = "none";
    reason = "self-tracking-off";
  }

  return db.transaction(async (tx) => {
    const open = await tx.select().from(sessions).where(eq(sessions.isOpen, true)).orderBy(sql`${sessions.startTime} desc`);

    // Defensive: there must never be more than one open session.
    for (const extra of open.slice(1)) await closeSession(tx, extra.id, extra.startTime, extra.endTime, "reconciled");
    let cur: (typeof open)[number] | undefined = open[0];
    if (cur && now.getTime() - cur.endTime.getTime() > STALE_MS) {
      await closeSession(tx, cur.id, cur.startTime, cur.endTime, "monitor-unavailable");
      cur = undefined;
    }

    if (kind === "none") {
      if (cur) {
        if (source === "ui" && cur.source !== "ui") return { ok: true, noop: true };
        await closeSession(tx, cur.id, cur.startTime, at, reason ?? "monitoring-stopped");
      }
      return { ok: true, state: "none" };
    }

    let appId: string | null = null;
    if (kind === "app") appId = await upsertApp(tx, obs, now);

    if (cur && cur.activityType === kind && (cur.applicationId ?? null) === appId) {
      // Heartbeat: monotonic extension to "now" (never backwards, `at` only matters for transitions).
      const end = now.getTime() > cur.endTime.getTime() ? now : cur.endTime;
      await tx
        .update(sessions)
        .set({ endTime: end, durationMs: end.getTime() - cur.startTime.getTime() })
        .where(eq(sessions.id, cur.id));
      if (appId && Math.random() < 0.1) await tx.update(applications).set({ lastSeen: now }).where(eq(applications.id, appId));
      return { ok: true, state: kind, sessionId: cur.id };
    }

    let start = at;
    if (cur) {
      const closeAt = at.getTime() < cur.startTime.getTime() ? cur.startTime : at;
      await closeSession(tx, cur.id, cur.startTime, closeAt, reason ?? `switched-to-${kind}`);
      start = closeAt;
      if (cur.applicationId) await tx.update(applications).set({ lastSeen: closeAt }).where(eq(applications.id, cur.applicationId));
    }
    const end = now.getTime() >= start.getTime() ? now : start;
    const id = randomUUID();
    await tx.insert(sessions).values({
      id,
      applicationId: appId,
      startTime: start,
      endTime: end,
      durationMs: end.getTime() - start.getTime(),
      activityType: kind,
      windowTitle: settings.trackTitles && kind === "app" ? (obs.title ?? null)?.slice(0, 200) ?? null : null,
      source,
      isOpen: true,
    });
    return { ok: true, state: kind, sessionId: id, started: true };
  });
}


// Serialize transitions against imports and other multi-step writes in this local process.
export function ingest(obs: Observation): Promise<Record<string, unknown>> {
  return withDatabaseWriteLock(() => ingestSerialized(obs));
}

/** Close any open session at its last heartbeat (used before destructive operations). */
export async function closeOpenSessions(reason: string) {
  await db
    .update(sessions)
    .set({
      isOpen: false,
      terminationReason: reason,
      durationMs: sql`(extract(epoch from (${sessions.endTime} - ${sessions.startTime})) * 1000)::bigint`,
    })
    .where(eq(sessions.isOpen, true));
}
