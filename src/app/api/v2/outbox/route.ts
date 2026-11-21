import { bodyOf, handle } from "@/lib/http";
import { ackNotes, pendingNotes, v2Tick } from "@/lib/v2/store";

export const dynamic = "force-dynamic";

/** Polled by the desktop host: evaluates focus/limits/weekly report and returns notifications to display. */
export async function GET() {
  return handle(async () => {
    await v2Tick();
    return { notes: pendingNotes() };
  });
}
export async function POST(req: Request) {
  return handle(async () => {
    const b = await bodyOf(req);
    ackNotes(Array.isArray(b.ids) ? (b.ids as unknown[]).map(String) : []);
    return { ok: true };
  });
}
