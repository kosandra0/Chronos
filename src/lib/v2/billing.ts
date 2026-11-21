export const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "CAD", "AUD", "CHF", "CNY", "SEK", "NZD", "SGD", "ZAR", "BRL", "MXN"] as const;
export const isCurrency = (v: unknown): v is string => typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);

/** Estimated amount for tracked time at an hourly rate, rounded to cents. */
export function amountFor(ms: number, hourlyRate: number): number {
  if (!Number.isFinite(ms) || !Number.isFinite(hourlyRate) || ms <= 0 || hourlyRate <= 0) return 0;
  return Math.round((ms / 3_600_000) * hourlyRate * 100) / 100;
}

export type ProjectReportRow = { client: string; project: string; totalMs: number; billableMs: number; nonBillableMs: number; rate: number; amount: number; from: string; to: string; currency: string };

export function projectRow(p: { client: string; name: string; billable: boolean; rate: number }, totalMs: number, range: { from: string | null; to: string | null }, currency: string): ProjectReportRow {
  const billableMs = p.billable ? totalMs : 0;
  return { client: p.client, project: p.name, totalMs, billableMs, nonBillableMs: totalMs - billableMs, rate: p.rate, amount: amountFor(billableMs, p.rate), from: range.from ?? "", to: range.to ?? "", currency };
}

/** CSV cell with RFC 4180 quoting and protection against spreadsheet formula injection (text starting with = + - @). */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function reportCsv(rows: ProjectReportRow[]): string {
  const head = ["Client", "Project", "From", "To", "Total hours", "Billable hours", "Non-billable hours", "Hourly rate", "Currency", "Estimated amount"];
  const h = (ms: number) => (ms / 3_600_000).toFixed(4);
  const lines = [head.join(",")];
  for (const r of rows) lines.push([r.client, r.project, r.from, r.to, h(r.totalMs), h(r.billableMs), h(r.nonBillableMs), r.rate.toFixed(2), r.currency, r.amount.toFixed(2)].map(csvCell).join(","));
  const total = rows.reduce((n, r) => n + r.amount, 0);
  lines.push(["", "TOTAL", "", "", h(rows.reduce((n, r) => n + r.totalMs, 0)), h(rows.reduce((n, r) => n + r.billableMs, 0)), h(rows.reduce((n, r) => n + r.nonBillableMs, 0)), "", rows[0]?.currency ?? "", total.toFixed(2)].map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}
