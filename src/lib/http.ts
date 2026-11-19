import { isValidYmd, type DateRange } from "./ranges";

export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const out = await fn();
    if (out instanceof Response) return out;
    return Response.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[chronos api]", e);
    return Response.json({ error: e instanceof Error ? e.message : "Unexpected server error" }, { status: 500 });
  }
}

export function rangeFrom(url: URL): DateRange {
  const f = url.searchParams.get("from");
  const t = url.searchParams.get("to");
  return { from: isValidYmd(f) ? f : null, to: isValidYmd(t) ? t : null };
}

export function badRequest(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
