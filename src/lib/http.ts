import { initializeDatabase } from "@/db";
import { isValidYmd, type DateRange } from "./ranges";

export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    // Idempotent and shared: guarantees the schema exists before any API touches the database,
    // and propagates an initialization failure as a clear 500 instead of a missing-table error.
    await initializeDatabase();
    const out = await fn();
    if (out instanceof Response) return out;
    return Response.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const status = typeof (e as { status?: unknown })?.status === "number" ? ((e as { status: number }).status) : 500;
    if (status >= 500) console.error("[chronos api]", e);
    return Response.json({ error: e instanceof Error ? e.message : "Unexpected server error" }, { status });
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

export async function bodyOf(req: Request): Promise<Record<string, unknown>> {
  const j = await req.json().catch(() => ({}));
  return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
}
