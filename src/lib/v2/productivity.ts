export type ProdClass = "productive" | "neutral" | "distracting";
export const PROD_CLASSES: ProdClass[] = ["productive", "neutral", "distracting"];
export const isProdClass = (v: unknown): v is ProdClass => v === "productive" || v === "neutral" || v === "distracting";

/** Default classification from the existing application category. Users can override it per application. */
export function defaultProdClass(category: string): ProdClass {
  if (category === "Development" || category === "Productivity" || category === "Education" || category === "Administration") return "productive";
  if (category === "Entertainment" || category === "Gaming" || category === "Media") return "distracting";
  return "neutral";
}

/** Productive / (Productive + Distracting) x 100. Neutral time is excluded. null when nothing is classified. */
export function productivityScore(productiveMs: number, distractingMs: number): number | null {
  const d = productiveMs + distractingMs;
  if (d <= 0) return null;
  return (productiveMs / d) * 100;
}

export function goalProgress(productiveMs: number, goalHours: number) {
  const goalMs = Math.max(0, goalHours) * 3_600_000;
  if (goalMs <= 0) return { goalMs: 0, pct: null as number | null, remainingMs: 0, met: false };
  return { goalMs, pct: Math.min(100, (productiveMs / goalMs) * 100), remainingMs: Math.max(0, goalMs - productiveMs), met: productiveMs >= goalMs };
}
