import { handle, rangeFrom } from "@/lib/http";
import { projectSessions } from "@/lib/v2/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    return projectSessions(url.searchParams.get("project") ?? "", rangeFrom(url), Number(url.searchParams.get("page")) || 1);
  });
}
