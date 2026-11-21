import { bodyOf, handle } from "@/lib/http";
import { deleteLimit, limitsWithUsage, saveLimit } from "@/lib/v2/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(() => limitsWithUsage());
}
export async function POST(req: Request) {
  return handle(async () => saveLimit(await bodyOf(req)));
}
export async function DELETE(req: Request) {
  return handle(async () => {
    const id = new URL(req.url).searchParams.get("id") ?? "";
    await deleteLimit(id);
    return { ok: true };
  });
}
