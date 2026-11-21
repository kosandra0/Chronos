import { bodyOf, handle } from "@/lib/http";
import { assignSessions, sessionProject } from "@/lib/v2/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => ({ projectId: await sessionProject(new URL(req.url).searchParams.get("session") ?? "") }));
}
/** { sessionIds: string[], projectId: string | null } (null removes the assignment) */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await bodyOf(req);
    const ids = Array.isArray(b.sessionIds) ? (b.sessionIds as unknown[]).map(String) : [];
    return assignSessions(ids, b.projectId === null ? null : String(b.projectId));
  });
}
