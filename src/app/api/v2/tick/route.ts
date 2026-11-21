import { badRequest, bodyOf, handle } from "@/lib/http";
import { pendingNotes, v2Tick } from "@/lib/v2/store";

export const dynamic = "force-dynamic";

/** Test seam: only exists when WATCHTOWER_TEST_HOOKS=1. Lets automated tests run the scheduler at a chosen clock time. */
export async function POST(req: Request) {
  if (process.env.WATCHTOWER_TEST_HOOKS !== "1") return badRequest("Not available.", 404);
  return handle(async () => {
    const b = await bodyOf(req);
    await v2Tick(typeof b.now === "number" ? b.now : Date.now(), true);
    return { notes: pendingNotes() };
  });
}
