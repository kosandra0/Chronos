import { bodyOf, handle, rangeFrom } from "@/lib/http";
import { productivityDashboard, productivitySummary, setProdClass } from "@/lib/v2/store";

export const dynamic = "force-dynamic";

/** ?day=YYYY-MM-DD => dashboard (day vs previous day); ?from&to => summary of that period. */
export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    if (url.searchParams.get("from") || url.searchParams.get("to")) return productivitySummary(rangeFrom(url));
    return productivityDashboard(url.searchParams.get("day") ?? undefined);
  });
}
/** { appId, class: "productive" | "neutral" | "distracting" | null (reset to default) } */
export async function PUT(req: Request) {
  return handle(async () => {
    const b = await bodyOf(req);
    await setProdClass(String(b.appId ?? ""), b.class === null ? null : String(b.class));
    return { ok: true };
  });
}
