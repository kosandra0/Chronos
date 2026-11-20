import { evaluate, markSeen, recordEvent } from "@/lib/gamification";
import { handle } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => evaluate());
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { event?: string; seen?: boolean };
    if (body.event) await recordEvent(body.event);
    if (body.seen) await markSeen();
    return evaluate();
  });
}
