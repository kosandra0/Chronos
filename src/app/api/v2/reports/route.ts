import { handle } from "@/lib/http";
import { weeklyReport } from "@/lib/v2/store";

export const dynamic = "force-dynamic";

/** Weekly report for a COMPLETED Monday-Sunday week (?week=YYYY-MM-DD Monday; default: last completed week). */
export async function GET(req: Request) {
  return handle(() => weeklyReport(new URL(req.url).searchParams.get("week") ?? undefined));
}
