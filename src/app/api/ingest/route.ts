import { ingest, type Observation, type ObsKind } from "@/lib/engine";
import { badRequest, handle } from "@/lib/http";
import { getSettings, updateSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const KINDS: ObsKind[] = ["app", "desktop", "idle", "locked", "none"];

export async function POST(req: Request) {
  return handle(async () => {
    let body: Record<string, unknown>;
    try {
      const text = await req.text();
      body = JSON.parse(text);
    } catch {
      return badRequest("Invalid JSON body");
    }
    const kind = body.kind as ObsKind;
    if (!KINDS.includes(kind)) return badRequest("kind must be one of app, desktop, idle, locked, none");
    const app = body.app as Observation["app"];
    if (kind === "app" && !body.self && (!app || typeof app.exe !== "string" || !app.exe)) return badRequest("app.exe is required for kind=app");

    const tz = typeof body.tz === "string" ? body.tz : "";
    if (tz) {
      const s = await getSettings();
      if (!s.timezone) {
        try {
          new Intl.DateTimeFormat("en", { timeZone: tz });
          await updateSettings({ timezone: tz });
        } catch {
          /* ignore invalid tz */
        }
      }
    }

    const result = await ingest({
      kind,
      at: typeof body.at === "string" ? body.at : undefined,
      source: body.source === "ui" ? "ui" : "agent",
      reason: typeof body.reason === "string" ? body.reason.slice(0, 80) : undefined,
      self: body.self === true,
      title: typeof body.title === "string" ? body.title : null,
      app: app
        ? {
            exe: String(app.exe).slice(0, 260),
            description: app.description ? String(app.description).slice(0, 200) : null,
            product: app.product ? String(app.product).slice(0, 200) : null,
            path: app.path ? String(app.path).slice(0, 1000) : null,
            pid: typeof app.pid === "number" ? app.pid : null,
            elevated: app.elevated === true,
            limited: app.limited === true,
          }
        : undefined,
    });
    return result;
  });
}
