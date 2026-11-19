import { restoreBackup } from "@/lib/dataio";
import { badRequest, handle } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { confirm?: boolean };
  if (body.confirm !== true) return badRequest("Restore requires explicit confirmation.");
  return handle(async () => ({ ok: true, result: await restoreBackup(id) }));
}
