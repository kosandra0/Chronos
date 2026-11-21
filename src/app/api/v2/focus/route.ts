import { bodyOf, handle } from "@/lib/http";
import { focusAction, focusSnapshot } from "@/lib/v2/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => focusSnapshot());
}

/** { action: "start" | "pause" | "resume" | "stop" | "skip" | "config", config?: {...} } */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await bodyOf(req);
    return focusAction(String(b.action ?? "config"), b);
  });
}
