import { handle } from "@/lib/http";
import { getSettings, updateSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => getSettings());
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return updateSettings(body);
  });
}
