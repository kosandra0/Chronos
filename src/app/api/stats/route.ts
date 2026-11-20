import { handle, rangeFrom } from "@/lib/http";
import { reconcileStale } from "@/lib/engine";
import { getStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    await reconcileStale();
    return getStats(rangeFrom(url), { appId: url.searchParams.get("appId") || undefined });
  });
}
