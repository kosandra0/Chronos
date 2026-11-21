// Versioned, validated theme packs. Pure data only: nothing imported is ever evaluated or injected as CSS/JS.

export type Gradient = { id?: string; name: string; color1: string; color2: string; color3: string | null; angle: number; accent: string };
export const PACK_SCHEMA = "watchtower-theme-pack";
export const PACK_VERSION = 1;
export const MAX_GRADIENTS = 200;
const HEX = /^#[0-9a-fA-F]{6}$/;

export function cleanName(v: unknown): string {
  // eslint-disable-next-line no-control-regex
  return String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
}

export function sanitizeGradient(raw: unknown): { ok: true; value: Gradient } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "gradient must be an object" };
  const r = raw as Record<string, unknown>;
  const name = cleanName(r.name);
  if (!name) return { ok: false, error: "name is required" };
  for (const k of ["color1", "color2", "accent"] as const) if (typeof r[k] !== "string" || !HEX.test(r[k] as string)) return { ok: false, error: `${k} must be a #rrggbb colour` };
  let color3: string | null = null;
  if (r.color3 !== undefined && r.color3 !== null) {
    if (typeof r.color3 !== "string" || !HEX.test(r.color3)) return { ok: false, error: "color3 must be a #rrggbb colour or null" };
    color3 = r.color3.toLowerCase();
  }
  const angle = r.angle === undefined ? 140 : Number(r.angle);
  if (!Number.isFinite(angle)) return { ok: false, error: "angle must be a number" };
  return {
    ok: true,
    value: { name, color1: (r.color1 as string).toLowerCase(), color2: (r.color2 as string).toLowerCase(), color3, angle: ((Math.round(angle) % 360) + 360) % 360, accent: (r.accent as string).toLowerCase() },
  };
}

export function exportPack(gradients: Gradient[], packName = "WatchTower theme pack", now = new Date()) {
  return {
    schema: PACK_SCHEMA,
    version: PACK_VERSION,
    name: cleanName(packName) || "WatchTower theme pack",
    exportedAt: now.toISOString(),
    gradients: gradients.map((g) => ({ name: g.name, color1: g.color1, color2: g.color2, color3: g.color3, angle: g.angle, accent: g.accent })),
  };
}

export function validatePack(text: string): { ok: true; gradients: Gradient[]; warnings: string[] } | { ok: false; errors: string[] } {
  if (typeof text !== "string" || text.length > 1_000_000) return { ok: false, errors: ["The file is empty or too large."] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["The file is not valid JSON."] };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["The JSON root must be an object."] };
  const r = raw as Record<string, unknown>;
  if (r.schema !== PACK_SCHEMA) return { ok: false, errors: [`Not a WatchTower theme pack (expected schema "${PACK_SCHEMA}").`] };
  if (typeof r.version !== "number" || !Number.isInteger(r.version) || r.version < 1) return { ok: false, errors: ["Missing or invalid pack version."] };
  if (r.version > PACK_VERSION) return { ok: false, errors: [`This pack uses version ${r.version}; this WatchTower supports up to ${PACK_VERSION}. Update WatchTower first.`] };
  if (!Array.isArray(r.gradients)) return { ok: false, errors: ["The pack has no gradients list."] };
  if (r.gradients.length === 0) return { ok: false, errors: ["The pack contains no gradients."] };
  if (r.gradients.length > MAX_GRADIENTS) return { ok: false, errors: [`The pack has more than ${MAX_GRADIENTS} gradients.`] };
  const errors: string[] = [];
  const out: Gradient[] = [];
  r.gradients.forEach((g, i) => {
    const s = sanitizeGradient(g);
    if (s.ok) out.push(s.value);
    else if (errors.length < 20) errors.push(`gradients[${i}]: ${s.error}`);
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, gradients: out, warnings: [] };
}

/** Adds incoming gradients to the existing ones. Existing presets are never overwritten: name clashes become "Name (2)", "Name (3)"... */
export function mergeImported(existing: Gradient[], incoming: Gradient[]): { merged: Gradient[]; renamed: { from: string; to: string }[] } {
  const merged = [...existing];
  const names = new Set(existing.map((g) => g.name.toLowerCase()));
  const renamed: { from: string; to: string }[] = [];
  for (const g of incoming) {
    let name = g.name;
    let n = 2;
    while (names.has(name.toLowerCase())) name = `${g.name.slice(0, 34)} (${n++})`;
    if (name !== g.name) renamed.push({ from: g.name, to: name });
    names.add(name.toLowerCase());
    merged.push({ ...g, name });
  }
  return { merged, renamed };
}
