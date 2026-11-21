import { handle, rangeFrom } from "@/lib/http";
import { projectReport, projectReportCsv } from "@/lib/v2/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const r = await projectReport(rangeFrom(url));
    if (url.searchParams.get("format") === "csv") {
      const name = `watchtower-project-report-${r.range.from ?? "start"}_${r.range.to ?? "now"}.csv`;
      return new Response(projectReportCsv(r), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
    }
    return r;
  });
}
