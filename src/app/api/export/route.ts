import { buildExport, renderMarkdown, renderText } from "@/lib/dataio";
import { badRequest, handle } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const format = new URL(req.url).searchParams.get("format") ?? "json";
    const day = new Date().toISOString().slice(0, 10);
    if (format === "json") {
      const body = JSON.stringify(await buildExport(), null, 2);
      return new Response(body, {
        headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="watchtower-export-${day}.json"` },
      });
    }
    if (format === "md") {
      return new Response(await renderMarkdown(), {
        headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="watchtower-report-${day}.md"` },
      });
    }
    if (format === "txt") {
      return new Response(await renderText(), {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="watchtower-report-${day}.txt"` },
      });
    }
    return badRequest("Unsupported format. WatchTower exports JSON, Markdown (.md) and Text (.txt) only.");
  });
}
