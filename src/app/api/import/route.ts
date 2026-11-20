import { applyImport, extractEmbedded, previewImport, validateJson } from "@/lib/dataio";
import { badRequest, handle } from "@/lib/http";

export const dynamic = "force-dynamic";

const UNSUPPORTED = "Unsupported file format. WatchTower supports JSON, Markdown (.md), and Text (.txt) files only.";

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => null)) as { filename?: string; content?: string; mode?: string } | null;
    if (!body || typeof body.filename !== "string" || typeof body.content !== "string") return badRequest("filename and content are required");
    const ext = body.filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
    if (![".json", ".md", ".txt"].includes(ext)) return Response.json({ ok: false, kind: "unsupported", error: UNSUPPORTED }, { status: 415 });
    let text = body.content;
    if (ext !== ".json") {
      // WatchTower reports (.md / .txt) end with a data block holding the complete export.
      const embedded = extractEmbedded(body.content, ext as ".md" | ".txt");
      if (!embedded) {
        return Response.json({
          ok: false,
          kind: "report",
          error: "This file has no WatchTower data block, so nothing can be restored from it. Only reports exported by this version of WatchTower (or JSON exports) can be imported.",
        });
      }
      text = embedded;
    }
    const v = validateJson(text);
    if (!v.ok) return Response.json({ ok: false, kind: "invalid", errors: v.errors });
    if (body.mode === "merge" || body.mode === "replace") {
      const r = await applyImport(v.data, body.mode);
      return { ok: true, applied: true, mode: body.mode, result: r };
    }
    return { ok: true, applied: false, warnings: v.warnings, summary: await previewImport(v.data) };
  });
}
