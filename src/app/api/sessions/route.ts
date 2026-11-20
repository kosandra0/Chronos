import { handle } from "@/lib/http";
import { reconcileStale } from "@/lib/engine";
import { isValidYmd } from "@/lib/ranges";
import { querySessions } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const u = new URL(req.url).searchParams;
    await reconcileStale();
    const from = u.get("from");
    const to = u.get("to");
    return querySessions({
      page: Number(u.get("page")) || 1,
      pageSize: Number(u.get("pageSize")) || 25,
      q: u.get("q") || undefined,
      from: isValidYmd(from) ? from : null,
      to: isValidYmd(to) ? to : null,
      appId: u.get("appId") || undefined,
      category: u.get("category") || undefined,
      type: u.get("type") || undefined,
      sort: u.get("sort") || undefined,
      dir: u.get("dir") || undefined,
    });
  });
}
