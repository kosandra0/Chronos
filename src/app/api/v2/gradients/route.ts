import { bodyOf, handle } from "@/lib/http";
import { deleteGradient, exportGradients, importGradients, listGradients, saveGradient } from "@/lib/v2/store";

export const dynamic = "force-dynamic";

/** ?export=1[&ids=a,b] returns a downloadable theme pack; otherwise the list of saved presets. */
export async function GET(req: Request) {
  return handle(async () => {
    const u = new URL(req.url).searchParams;
    if (u.get("export")) {
      const pack = await exportGradients(u.get("ids")?.split(",").filter(Boolean));
      return new Response(JSON.stringify(pack, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="watchtower-theme-pack.json"', "Cache-Control": "no-store" } });
    }
    return { gradients: await listGradients() };
  });
}
/** { gradient } saves/edits a preset; { action: "import" | "preview", content } imports a pack. */
export async function POST(req: Request) {
  return handle(async () => {
    const b = await bodyOf(req);
    if (b.action === "import" || b.action === "preview") return importGradients(String(b.content ?? ""), b.action === "import");
    return saveGradient((b.gradient ?? {}) as Record<string, unknown>);
  });
}
export async function DELETE(req: Request) {
  return handle(async () => {
    await deleteGradient(new URL(req.url).searchParams.get("id") ?? "");
    return { ok: true };
  });
}
