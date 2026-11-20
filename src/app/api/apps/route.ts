import { handle } from "@/lib/http";
import { reconcileStale } from "@/lib/engine";
import { listApps } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const u = new URL(req.url).searchParams;
    await reconcileStale();
    return listApps({ q: u.get("q") || undefined, sort: u.get("sort") || undefined, category: u.get("category") || undefined });
  });
}
