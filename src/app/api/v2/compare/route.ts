import { badRequest, handle } from "@/lib/http";
import { comparePeriods } from "@/lib/v2/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind") ?? "week";
  if (kind !== "week" && kind !== "month") return badRequest("kind must be week or month");
  return handle(() => comparePeriods(kind));
}
