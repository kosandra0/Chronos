import { handle, rangeFrom } from "@/lib/http";
import { reconcileStale } from "@/lib/engine";
import { getSettings, getTz } from "@/lib/settings";
import { getSlices } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    await reconcileStale();
    const range = rangeFrom(new URL(req.url));
    const [tz, settings] = await Promise.all([getTz(), getSettings()]);
    const slices = await getSlices(range, tz);
    const map = new Map<string, { day: string; hour: number; active: number; idle: number; desktop: number }>();
    for (const s of slices) {
      const k = `${s.day}|${s.hour}`;
      const c = map.get(k) ?? { day: s.day, hour: s.hour, active: 0, idle: 0, desktop: 0 };
      if (s.type === "app" || s.type === "desktop") c.active += s.ms;
      if (s.type === "desktop") c.desktop += s.ms;
      if (s.type === "idle") c.idle += s.ms;
      map.set(k, c);
    }
    return { range, idleInTotal: settings.idleInTotal, cells: [...map.values()] };
  });
}
