import { applyImport, previewImport, validateJson } from "@/lib/dataio";
import { badRequest, handle } from "@/lib/http";

export const dynamic = "force-dynamic";

const UNSUPPORTED = "Unsupported file format. Chronos supports JSON, Markdown (.md), and Text (.txt) files only.";

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json().catch(() => null)) as { filename?: string; content?: string; mode?: string } | null;
    if (!body || typeof body.filename !== "string" || typeof body.content !== "string") return badRequest("filename and content are required");
    const ext = body.filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
    if (![".json", ".md", ".txt"].includes(ext)) return Response.json({ ok: false, kind: "unsupported", error: UNSUPPORTED }, { status: 415 });
    if (ext !== ".json") {
      return Response.json({
        ok: false,
        kind: "report",
        error:
          "Markdown and text files are human-readable reports. They do not contain the full, exact session records, so Chronos cannot rebuild a database from them. To restore data, import a Chronos JSON export or backup instead.",
      });
    }
    const v = validateJson(body.content);
    if (!v.ok) return Response.json({ ok: false, kind: "invalid", errors: v.errors });
    if (body.mode === "merge" || body.mode === "replace") {
      const r = await applyImport(v.data, body.mode);
      return { ok: true, applied: true, mode: body.mode, result: r };
    }
    return { ok: true, applied: false, warnings: v.warnings, summary: await previewImport(v.data) };
  });
}
