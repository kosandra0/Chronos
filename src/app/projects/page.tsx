"use client";

import { useState } from "react";
import { Archive, Download, FolderKanban, Pencil, Trash2 } from "lucide-react";
import { Sl, Tm } from "@/components/V2Parts";
import { Card, Empty, ErrorBox, Modal, PageHeader, Skeleton, useFetch } from "@/components/ui";
import { RangePicker, useRangeState } from "@/components/RangePicker";
import { Select } from "@/components/Select";
import { useSettings } from "@/components/Providers";
import { rangeQuery } from "@/lib/ranges";
import { CURRENCIES, amountFor } from "@/lib/v2/billing";
import { formatShort, fmtDateTime } from "@/lib/time";

type Project = { id: string; name: string; client: string; color: string; billable: boolean; rate: number; archived: boolean; totalMs: number; sessions: number; assignedSessions: number };
type Sess = { total: number; sessions: { id: string; date: string; start: string; end: string; ms: number; type: string; name: string }[] };
const money = (n: number, cur: string) => {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n); } catch { return `${n.toFixed(2)} ${cur}`; }
};
const EMPTY = { name: "", client: "", color: "#5b8def", rate: 0, billable: true };

export default function ProjectsPage() {
  const [rs, setRs] = useRangeState("thisMonth", "projects.range");
  const q = rangeQuery(rs.range);
  const { settings, update } = useSettings();
  const { data, error, loading, reload } = useFetch<{ projects: Project[]; currency: string }>(`/api/v2/projects?${q}`, { refreshMs: 5000 });
  const [edit, setEdit] = useState<(typeof EMPTY & { id?: string }) | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const sess = useFetch<Sess>(open ? `/api/v2/projects/sessions?project=${open}&${q}` : null);
  const cur = settings.currency;

  const save = async () => {
    if (!edit) return;
    setMsg(null);
    const r = await fetch("/api/v2/projects", { method: edit.id ? "PATCH" : "POST", body: JSON.stringify(edit) });
    const j = await r.json();
    if (!r.ok) return setMsg(j.error ?? "Could not save the project.");
    setEdit(null);
    reload();
  };
  const patch = async (p: Project, body: Record<string, unknown>) => {
    await fetch("/api/v2/projects", { method: "PATCH", body: JSON.stringify({ id: p.id, ...body }) });
    reload();
  };
  const remove = async (p: Project) => {
    if (!confirm(`Delete "${p.name}"? Its ${p.assignedSessions} assigned session(s) are kept but become unassigned.`)) return;
    await fetch(`/api/v2/projects?id=${p.id}`, { method: "DELETE" });
    reload();
  };

  const list = data?.projects ?? [];
  const totals = list.reduce((a, p) => ({ ms: a.ms + p.totalMs, bill: a.bill + (p.billable ? p.totalMs : 0), amt: a.amt + (p.billable ? amountFor(p.totalMs, p.rate) : 0) }), { ms: 0, bill: 0, amt: 0 });

  return (
    <div className="page">
      <PageHeader title="Projects" subtitle="Tag sessions with projects and clients, then export time reports for billing. Reports are estimates, not invoices." actions={<button className="btn btn-primary" onClick={() => { setMsg(null); setEdit({ ...EMPTY }); }}>New project</button>} />
      <RangePicker state={rs} onChange={setRs} />
      <div style={{ height: 16 }} />
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Card><div className="stat-label">Tracked in period</div><div className="stat-value" style={{ fontSize: "1.4rem" }}><Tm ms={totals.ms} /></div></Card>
        <Card><div className="stat-label">Billable time</div><div className="stat-value" style={{ fontSize: "1.4rem" }}><Tm ms={totals.bill} /></div></Card>
        <Card><div className="stat-label">Estimated amount</div><div className="stat-value" style={{ fontSize: "1.4rem" }} data-testid="project-amount"><Sl text={money(Math.round(totals.amt * 100) / 100, cur)} /></div></Card>
        <Card>
          <div className="stat-label">Currency</div>
          <Select className="select" value={cur} onChange={(e) => update({ currency: e.target.value })} aria-label="Currency">
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <a className="btn btn-sm" style={{ marginTop: 10, display: "inline-flex", gap: 6 }} href={`/api/v2/projects/report?format=csv&${q}`} download><Download size={14} /> Export CSV</a>
        </Card>
      </div>
      <Card style={{ padding: 0 }}>
        {loading && !data ? <div style={{ padding: 20 }}><Skeleton h={80} /></div> : list.length === 0 ? (
          <Empty icon={<FolderKanban size={20} />} title="No projects yet" text="Create a project, then assign sessions to it from Session details." />
        ) : (
          <div className="table-wrap">
            <table className="tbl" data-testid="project-table">
              <thead><tr><th>Project</th><th>Client</th><th style={{ textAlign: "right" }}>Time</th><th style={{ textAlign: "right" }}>Rate</th><th style={{ textAlign: "right" }}>Estimated</th><th>Sessions</th><th /></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className="clickable" style={{ opacity: p.archived ? 0.6 : 1 }} onClick={() => setOpen(open === p.id ? null : p.id)}>
                    <td><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 99, background: p.color, marginRight: 8 }} />{p.name}{p.archived && <span className="muted"> (archived)</span>}{!p.billable && <span className="muted"> · non-billable</span>}</td>
                    <td className="muted">{p.client || "—"}</td>
                    <td className="num" style={{ textAlign: "right" }}><Tm ms={p.totalMs} /></td>
                    <td className="num muted" style={{ textAlign: "right" }}>{p.billable ? <Sl text={`${money(p.rate, cur)}/h`} /> : "—"}</td>
                    <td className="num" style={{ textAlign: "right" }}>{p.billable ? <Sl text={money(amountFor(p.totalMs, p.rate), cur)} /> : "—"}</td>
                    <td className="num"><Sl text={String(p.sessions)} /></td>
                    <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                      <button className="btn btn-sm" aria-label={`Edit ${p.name}`} onClick={() => { setMsg(null); setEdit({ id: p.id, name: p.name, client: p.client, color: p.color, rate: p.rate, billable: p.billable }); }}><Pencil size={13} /></button>{" "}
                      <button className="btn btn-sm" aria-label={`${p.archived ? "Unarchive" : "Archive"} ${p.name}`} onClick={() => patch(p, { archived: !p.archived })}><Archive size={13} /></button>{" "}
                      <button className="btn btn-sm" aria-label={`Delete ${p.name}`} onClick={() => remove(p)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {open && (
        <Card title={`Sessions in ${list.find((p) => p.id === open)?.name ?? "project"}`} className="">
          {sess.loading && !sess.data ? <Skeleton h={60} /> : sess.data && sess.data.sessions.length ? sess.data.sessions.map((s) => (
            <div key={s.id} className="set-row" style={{ padding: "8px 0" }}>
              <div>{s.name} <span className="muted" style={{ fontSize: "0.85rem" }}>· {fmtDateTime(s.start)}</span></div>
              <div className="num"><Tm ms={s.ms} /></div>
            </div>
          )) : <div className="muted">No sessions are assigned to this project in the selected period.</div>}
          {sess.data && sess.data.total > sess.data.sessions.length && <div className="muted" style={{ fontSize: "0.85rem", marginTop: 8 }}>Showing the latest {sess.data.sessions.length} of {sess.data.total}.</div>}
        </Card>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit project" : "New project"}>
        {edit && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.82rem" }}>Project name<input className="input" value={edit.name} maxLength={40} onChange={(e) => setEdit({ ...edit, name: e.target.value })} aria-label="Project name" /></label>
            <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.82rem" }}>Client<input className="input" value={edit.client} maxLength={40} onChange={(e) => setEdit({ ...edit, client: e.target.value })} aria-label="Client name" /></label>
            <div className="flex items-end gap-3">
              <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.82rem" }}>Colour<input type="color" value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value })} aria-label="Project colour" style={{ width: 56, height: 34, border: "none", background: "none" }} /></label>
              <label className="flex flex-col gap-1 muted" style={{ fontSize: "0.82rem" }}>Hourly rate ({cur})<input className="input" type="number" min={0} step={0.5} value={edit.rate} style={{ width: 130 }} onChange={(e) => setEdit({ ...edit, rate: Number(e.target.value) })} aria-label="Hourly rate" /></label>
              <label className="flex items-center gap-2 muted" style={{ fontSize: "0.9rem" }}><input type="checkbox" checked={edit.billable} onChange={(e) => setEdit({ ...edit, billable: e.target.checked })} /> Billable</label>
            </div>
            {msg && <div role="alert" style={{ color: "#e5646f", fontSize: "0.9rem" }}>{msg}</div>}
            <div className="flex gap-2"><button className="btn btn-primary" onClick={save}>Save</button><button className="btn" onClick={() => setEdit(null)}>Cancel</button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
