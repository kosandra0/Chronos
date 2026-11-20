import { handle } from "@/lib/http";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Monitoring policy consumed by the Windows agent. */
export async function GET() {
  return handle(async () => {
    const s = await getSettings();
    return {
      monitoringEnabled: s.monitoringEnabled,
      idleEnabled: s.idleEnabled,
      idleThresholdMs: s.idleThresholdMin * 60_000,
      desktopTracking: s.desktopTracking,
      trackSelf: s.trackSelf,
      trackTitles: s.trackTitles,
      heartbeatMs: 5000,
    };
  });
}
