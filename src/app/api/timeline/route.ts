import { badRequest, handle } from "@/lib/http";
import { reconcileStale } from "@/lib/engine";
import { isValidYmd } from "@/lib/ranges";
import { sessionsForDay } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const date = new URL(req.url).searchParams.get("date");
    if (!isValidYmd(date)) return badRequest("date=YYYY-MM-DD is required");
    await reconcileStale();
    return sessionsForDay(date);
  });
}
