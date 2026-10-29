/* Staff & HR. Directory, rota, absence and relief, certifications,
   timesheets, recruitment and training, all read from the shared staff,
   shift and absence records. Every change is a replayable action that
   writes to Activity, so Command, Work and the agents move with it.
   Payroll figures appear for the owner only; everyone else sees hours. */
import { useState } from "react";
import type { RosState, Staff as StaffRec, StaffRole, CertKind, LocationId, Session, Tone, ISODate } from "../types";
import { useRos, defineAction, confirmThen, openRecord, nav, pushToast, getState } from "../store";
import { certStatus, certAlerts, ratioCheck, ratioAlerts, absentStaff, inScope, scopedLocations, staffById, locById, idx, scopeLoc, cached, openTasks } from "../selectors";
import { approveRelief, assignShift } from "../actions";
import { IssuePanel, TaskRow } from "../records";
import {
  Page, PageHead, Card, Kpi, Grid, Table, Badge, StatusBadge, Btn, RecLink, HBars, Callout, Seg, Search, ListRow, DemoTag, Empty,
  Avatar, Row, Stack, Sub, Label, Field, KV, Meter, toneBg, toneInk, type Col,
} from "../ui";
import { TODAY, THIS_WEEK, fmtDay, fmtDate, fmtDateY, daysBetween, dow, toMin, rel, euro, addDays } from "../time";

/* ---------------- shared helpers ---------------- */
const CERT_KINDS: CertKind[] = ["Garda vetting", "First aid", "Children First", "Manual handling", "Safe driving"];
const CERT_SHORT: Record<CertKind, string> = { "Garda vetting": "GV", "First aid": "FA", "Children First": "CF", "Manual handling": "MH", "Safe driving": "SD", "Food safety": "FS" };
const certTone = (exp: string): Tone => (exp < TODAY ? "bad" : daysBetween(TODAY, exp) <= 30 ? "warn" : daysBetween(TODAY, exp) <= 90 ? "info" : "ok");
const certText = (exp: string) => (exp < TODAY ? "Expired " + fmtDate(exp) : daysBetween(TODAY, exp) <= 30 ? daysBetween(TODAY, exp) + " days" : fmtDate(exp) + " " + exp.slice(2, 4));
const CARE_SAC = (r: StaffRole) => r === "SAC Leader" || r === "SAC Practitioner" || r === "Relief Practitioner";
const CARE_EY = (r: StaffRole) => r === "Room Leader" || r === "Practitioner" || r === "Relief Practitioner";
const ON_ROTA = (r: StaffRole) => CARE_SAC(r) || CARE_EY(r);
const MANAGES: string[] = ["owner", "ops", "locmgr"];
const ROLE_GROUPS: [string, string, (r: StaffRole) => boolean][] = [
  ["all", "All roles", () => true],
  ["office", "Management and office", r => ["Owner", "Operations Manager", "Accounts", "NCS Administrator", "HR & Admin", "Trainer"].includes(r)],
  ["mgr", "Location managers", r => r === "Location Manager"],
  ["ey", "Early years rooms", r => r === "Room Leader" || r === "Practitioner"],
  ["sac", "School age", r => r === "SAC Leader" || r === "SAC Practitioner"],
  ["relief", "Relief panel", r => r === "Relief Practitioner"],
  ["transport", "Drivers and escorts", r => r === "Driver" || r === "Escort"],
];
const WEEK_LABEL = "w/c 19 Oct";
const selStyle: React.CSSProperties = { width: "auto", maxWidth: "100%", height: 34, borderRadius: 999 };

function SiteSelect({ value, onChange, allowAll = true }: { value: string; onChange: (v: string) => void; allowAll?: boolean }) {
  const locs = scopedLocations();
  return (
    <select aria-label="Site" className="ros-input" style={selStyle} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowAll && locs.length > 1 && <option value="ALL">All sites</option>}
      {locs.map(l => <option key={l.id} value={l.id}>{l.short}</option>)}
    </select>
  );
}
function CertPills({ st }: { st: StaffRec }) {
  return (
    <Row gap={4}>
      {st.certs.map(c => { const t = certTone(c.expires); return (
        <span key={c.kind} title={c.kind + (c.expires < TODAY ? " · expired " : " · expires ") + fmtDateY(c.expires)}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 20, minWidth: 26, padding: "0 6px", borderRadius: 6, fontSize: 10.5, fontWeight: 600, letterSpacing: ".03em", background: toneBg[t], color: toneInk[t] }}>
          {CERT_SHORT[c.kind]}
        </span>); })}
    </Row>
  );
}
function defaultSite(focus?: string): string {
  const sc = scopeLoc();
  if (focus && inScope(focus)) return focus;
  if (sc !== "ALL") return sc;
  return "ARR";
}
const shiftHours = (start: string, end: string) => (toMin(end) - toMin(start)) / 60;

/* ---------------- module state kept beside the shared records ---------------- */
type Stage = "Applied" | "Screening" | "Interview" | "Offer" | "Vetting & references" | "Onboarding" | "Ready for rota";
const STAGES: Stage[] = ["Applied", "Screening", "Interview", "Offer", "Vetting & references", "Onboarding", "Ready for rota"];
const CHECKS = ["Garda vetting (NVB e-vetting)", "Two references verified", "Children First e-learning (Tusla)", "First aid certificate", "Qualification verified", "Contract signed", "Induction and policy sign-off"];
const GATE = [0, 1, 2]; // must be confirmed before anyone goes on the rota
interface HrExt {
  timesheets: Partial<Record<LocationId, { by: string; at: string; hours: number }>>;
  reminders: Record<string, string>;
  recruit: Record<string, { stage?: Stage; checks: Record<number, boolean> }>;
  training: Record<string, { what: string; at: string }>;
}
const HR = new WeakMap<RosState, HrExt>();
function hr(s: RosState): HrExt {
  let e = HR.get(s);
  if (!e) { e = { timesheets: {}, reminders: {}, recruit: {}, training: {} }; HR.set(s, e); }
  return e;
}

/* ---------------- actions ---------------- */
const assignRoom = defineAction<{ staffId: string; locationId: LocationId; date: ISODate; roomId: string }>("hr.assignRoom", (s, p, ctx) => {
  const x = s.staff.find(t => t.id === p.staffId);
  if (!x || x.certs.some(c => c.kind === "Garda vetting" && c.expires < TODAY)) return;
  if (s.shifts.some(t => t.staffId === p.staffId && t.date === p.date && t.status !== "proposed")) return;
  const room = s.rooms.find(r => r.id === p.roomId);
  s.shifts.push({ id: ctx.id("SH"), staffId: x.id, locationId: p.locationId, date: p.date, session: "Full Day", roomId: p.roomId, start: "07:45", end: "17:45", status: "approved" });
  ctx.log({ category: "Staffing", title: "Room cover added: " + x.name, detail: (room?.name || p.roomId) + " · " + fmtDay(p.date) + " · 07:45–17:45", link: { kind: "staff", id: x.id }, locationId: p.locationId });
  ctx.agent("rota", "Rota updated: " + x.name + " covering " + (room?.name || p.roomId) + " on " + fmtDay(p.date), "action", { kind: "staff", id: x.id });
}, { toast: () => "Room cover added to the rota.", undo: true });

const logAbsence = defineAction<{ staffId: string; date: ISODate; reason: string }>("hr.absence", (s, p, ctx) => {
  const x = s.staff.find(t => t.id === p.staffId);
  if (!x || s.absences.some(a => a.staffId === p.staffId && a.date === p.date)) return;
  s.absences.push({ staffId: x.id, date: p.date, reason: p.reason, reported: ctx.now });
  const sh = s.shifts.filter(t => t.staffId === x.id && t.date === p.date);
  const l = s.locations.find(t => t.id === x.locationId);
  ctx.log({ category: "Staffing", title: "Absence logged: " + x.name, detail: fmtDay(p.date) + " · " + p.reason + (sh.length ? ". Was rostered " + sh.map(t => t.session).join(" and ") + "; ratio forecast re-checked." : ". Not rostered that day."), link: { kind: "staff", id: x.id }, locationId: x.locationId });
  if (sh.length) ctx.agent("rota", "Absence for " + x.name + " on " + fmtDay(p.date) + ": re-forecast " + (l?.short || x.locationId) + " " + sh.map(t => t.session).join(" and "), "run", { kind: "staff", id: x.id });
}, { toast: () => "Absence logged. The rota and ratio forecast now count it.", undo: true });

const certReminder = defineAction<{ items: { staffId: string; kind: CertKind }[] }>("hr.certReminder", (s, p, ctx) => {
  let n = 0;
  for (const it of p.items) {
    const x = s.staff.find(t => t.id === it.staffId), c = x?.certs.find(k => k.kind === it.kind);
    if (!x || !c) continue;
    const key = x.id + "|" + it.kind;
    if (hr(s).reminders[key]) continue;
    hr(s).reminders[key] = ctx.now; n++;
    const past = c.expires < TODAY;
    ctx.agent("compliance", "Renewal reminder to " + x.name + ": " + it.kind + (past ? " expired " : " expires ") + fmtDate(c.expires), "action", { kind: "staff", id: x.id });
    ctx.log({ category: "Staffing", title: "Certificate reminder: " + x.name, detail: it.kind + (past ? " expired " : " expires ") + fmtDateY(c.expires) + ". Simulated email to " + x.email + ", copy to HR.", link: { kind: "staff", id: x.id }, locationId: x.locationId });
  }
  if (n > 1) ctx.log({ category: "Staffing", title: n + " certificate reminders sent", detail: "Run by " + ctx.actor + " from Staff & HR. Simulated, nobody emailed.", actor: "Compliance agent", actorKind: "agent" });
}, { toast: (p) => (p.items.length === 1 ? "Renewal reminder logged (simulated email)." : p.items.length + " renewal reminders logged (simulated)."), undo: true });

const approveTimesheets = defineAction<{ sites: { id: LocationId; hours: number; staff: number }[] }>("hr.timesheets", (s, p, ctx) => {
  for (const x of p.sites) {
    if (hr(s).timesheets[x.id]) continue;
    hr(s).timesheets[x.id] = { by: ctx.actor, at: ctx.now, hours: x.hours };
    ctx.log({ category: "Staffing", title: "Timesheets approved: " + (s.locations.find(l => l.id === x.id)?.short || x.id) + " · " + WEEK_LABEL, detail: x.staff + " staff · " + x.hours + "h. Hours only; no payroll system connected.", locationId: x.id });
  }
  if (s.locations.every(l => hr(s).timesheets[l.id])) s.tasks.forEach(t => { if (t.title === "Sign off October payroll timesheets") t.status = "Done"; });
}, { toast: (p) => "Timesheets approved for " + p.sites.length + " site" + (p.sites.length === 1 ? "" : "s") + ".", undo: true });

const recruitUpdate = defineAction<{ id: string; name: string; locationId: LocationId; stage?: Stage; check?: number; value?: boolean }>("hr.recruit", (s, p, ctx) => {
  const e = hr(s).recruit[p.id] || (hr(s).recruit[p.id] = { checks: {} });
  if (p.stage) {
    e.stage = p.stage;
    ctx.log({ category: "Staffing", title: "Recruitment: " + p.name + " moved to " + p.stage, detail: p.id + (p.stage === "Ready for rota" ? ". Garda vetting, references and Children First confirmed by " + ctx.actor + "." : "."), locationId: p.locationId });
  }
  if (p.check !== undefined) {
    e.checks[p.check] = !!p.value;
    ctx.log({ category: "Staffing", title: "Onboarding: " + CHECKS[p.check] + (p.value ? " confirmed" : " reopened"), detail: p.name + " · " + p.id, locationId: p.locationId });
  }
}, { toast: (p) => (p.stage ? p.name + " moved to " + p.stage + "." : "Onboarding checklist updated.") });

const planTraining = defineAction<{ staffId: string; kind: CertKind; courseId?: string }>("hr.training", (s, p, ctx) => {
  const x = s.staff.find(t => t.id === p.staffId);
  const key = p.staffId + "|" + p.kind;
  if (!x || hr(s).training[key]) return;
  if (p.courseId) {
    const c = s.courses.find(t => t.id === p.courseId);
    if (!c || s.courseBookings.filter(b => b.courseId === c.id).length >= c.capacity) return;
    s.courseBookings.push({ id: ctx.id("CB"), courseId: c.id, name: x.name, company: "Ray of Sunshine (staff)", email: x.email, paid: true, status: "Booked" });
    hr(s).training[key] = { what: "Booked on " + c.id + " · " + fmtDay(c.date), at: ctx.now };
    ctx.log({ category: "Staffing", title: "Staff place booked: " + x.name + " on " + c.id, detail: c.name + " · " + fmtDay(c.date) + " " + c.start + " · " + c.venue + ". Internal place, no charge.", link: { kind: "course", id: c.id }, locationId: x.locationId });
  } else {
    const cert = x.certs.find(t => t.kind === p.kind);
    const id = ctx.id("TSK");
    s.tasks.push({ id, title: (p.kind === "Children First" ? "Assign Children First e-learning: " : "Book " + p.kind.toLowerCase() + " refresher: ") + x.name, owner: "Orla Dempsey", due: fmtDay(addDays(TODAY, 10)), dueDate: addDays(TODAY, 10), priority: cert && cert.expires < addDays(TODAY, 30) ? "High" : "Medium", department: "HR", status: "Not started", link: { kind: "staff", id: x.id }, source: "Staff & HR", locationId: x.locationId });
    hr(s).training[key] = { what: "Task " + id + " with Orla Dempsey", at: ctx.now };
    ctx.log({ category: "Staffing", title: "Training planned: " + p.kind + " for " + x.name, detail: "Task " + id + " for HR. Current certificate " + (cert ? (cert.expires < TODAY ? "expired " : "expires ") + fmtDateY(cert.expires) : "not on file") + ".", link: { kind: "task", id }, locationId: x.locationId });
  }
}, { toast: (p) => (p.courseId ? "Place booked on " + p.courseId + ". Training Courses updated." : "Training task created for HR."), undo: true });

/* ---------------- derived hours ---------------- */
interface Hours { st: StaffRec; byDay: number[]; total: number; source: "Rota" | "Contract"; shifts: number }
function weekHours(): Hours[] {
  return cached("hr:hours", () => {
    const s = getState();
    const away = new Map<string, Set<string>>();
    for (const a of s.absences) { if (!away.has(a.date)) away.set(a.date, new Set()); away.get(a.date)!.add(a.staffId); }
    const by = new Map<string, number[]>(), cnt = new Map<string, number>();
    for (const x of s.shifts) {
      const i = THIS_WEEK.indexOf(x.date);
      if (i < 0 || x.status === "proposed" || away.get(x.date)?.has(x.staffId)) continue;
      if (!by.has(x.staffId)) by.set(x.staffId, [0, 0, 0, 0, 0]);
      by.get(x.staffId)![i] += shiftHours(x.start, x.end);
      cnt.set(x.staffId, (cnt.get(x.staffId) || 0) + 1);
    }
    return s.staff.map(st => {
      const d = by.get(st.id);
      if (d || ON_ROTA(st.role)) { const byDay = d || [0, 0, 0, 0, 0]; return { st, byDay, total: byDay.reduce((a, b) => a + b, 0), source: "Rota" as const, shifts: cnt.get(st.id) || 0 }; }
      const per = st.contractHours / 5;
      return { st, byDay: [per, per, per, per, per], total: st.contractHours, source: "Contract" as const, shifts: 0 };
    });
  });
}

/* ---------------- module ---------------- */
export default function Staff({ tab }: { tab: string }) {
  useRos();
  return (
    <Page>
      {tab === "Directory" && <Directory />}
      {tab === "Rota" && <Rota />}
      {tab === "Absence & Relief" && <AbsenceRelief />}
      {tab === "Certifications" && <Certifications />}
      {tab === "Timesheets" && <Timesheets />}
      {tab === "Recruitment" && <Recruitment />}
      {tab === "Training" && <TrainingPlan />}
    </Page>
  );
}

/* ---------------- Directory ---------------- */
function Directory() {
  const { s } = useRos();
  const [q, setQ] = useState("");
  const [site, setSite] = useState("ALL");
  const [grp, setGrp] = useState("all");
  const [cert, setCert] = useState<"all" | "expired" | "soon" | "ok">("all");
  const away = absentStaff(TODAY);
  const onToday = new Set(s.shifts.filter(x => x.date === TODAY && x.status !== "proposed").map(x => x.staffId));
  const base = s.staff.filter(x => inScope(x.locationId));
  const g = ROLE_GROUPS.find(x => x[0] === grp)!;
  const t = q.trim().toLowerCase();
  const rows = base.filter(x => {
    const cs = certStatus(x);
    if (site !== "ALL" && x.locationId !== site) return false;
    if (!g[2](x.role)) return false;
    if (cert === "expired" && !cs.expired.length) return false;
    if (cert === "soon" && !cs.soon.length) return false;
    if (cert === "ok" && !cs.ok) return false;
    return !t || x.name.toLowerCase().includes(t) || x.id.toLowerCase().includes(t) || x.qualification.toLowerCase().includes(t);
  });
  const ca = certAlerts();
  const status = (x: StaffRec) => {
    const ab = s.absences.find(a => a.staffId === x.id && a.date === TODAY);
    if (ab) return <Badge tone="warn">{ab.reason.split(" (")[0].split(" ·")[0]}</Badge>;
    if (certStatus(x).gardaExpired) return <Badge tone="bad">Rota blocked</Badge>;
    if (onToday.has(x.id)) return <Badge tone="ok">On rota today</Badge>;
    return <Badge>Not rostered today</Badge>;
  };
  const cols: Col<StaffRec>[] = [
    { key: "name", label: "Name", w: "1.6fr", sort: x => x.name, render: x => <Row gap={10}><Avatar name={x.name} size={26} /><Stack><span style={{ fontSize: 13 }}>{x.name}</span><Sub>{x.id}</Sub></Stack></Row> },
    { key: "site", label: "Site", w: "1fr", sort: x => locById(x.locationId)?.short || "", render: x => locById(x.locationId)?.short },
    { key: "role", label: "Role", w: "1.2fr", sort: x => x.role, render: x => x.role },
    { key: "hrs", label: "Contract", w: ".7fr", align: "right", sort: x => x.contractHours, render: x => x.contractHours + "h" },
    { key: "qual", label: "Qualification", w: "1.3fr", sort: x => x.qualification, render: x => <span style={{ fontSize: 12.5, color: "var(--body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.qualification}</span> },
    { key: "ga", label: "Gaeilge", w: ".7fr", sort: x => (x.irish ? 0 : 1), render: x => (x.irish ? <Badge tone="info">Gaeilge</Badge> : <Sub>No</Sub>) },
    { key: "certs", label: "Certificates", w: "1.3fr", sort: x => (certStatus(x).expired.length ? 0 : certStatus(x).soon.length ? 1 : 2), render: x => <CertPills st={x} /> },
    { key: "today", label: "Today", w: "1.1fr", render: status },
  ];
  return (
    <>
      <PageHead eyebrow="Staff & HR" title="Staff directory" sub={"Everyone across " + (scopeLoc() === "ALL" ? "all nine locations" : locById(scopeLoc())?.short) + ", with contract hours, qualification, Gaeilge and certificate status. Select a person for their file."} />
      <Grid min={150} style={{ marginBottom: 16 }}>
        <Kpi label="Headcount" value={base.length} sub={base.filter(x => ON_ROTA(x.role)).length + " on the care rota"} />
        <Kpi label="On rota today" value={base.filter(x => onToday.has(x.id) && !away.has(x.id)).length} sub={fmtDay(TODAY)} />
        <Kpi label="Absent today" value={base.filter(x => away.has(x.id)).length} tone={base.some(x => away.has(x.id)) ? "warn" : undefined} onClick={() => nav("Staff", "Absence & Relief")} />
        <Kpi label="Rota blocked" value={ca.expired.filter(x => certStatus(x).gardaExpired).length} sub="Garda vetting expired" tone={ca.expired.length ? "bad" : "ok"} onClick={() => setCert("expired")} />
        <Kpi label="Certificates due 30 days" value={ca.soon.length} tone={ca.soon.length ? "warn" : "ok"} onClick={() => setCert("soon")} />
        <Kpi label="Gaeilge speakers" value={base.filter(x => x.irish).length} sub="for Gaelscoil runs and families" />
      </Grid>
      <Card pad={false}>
        <Row wrap gap={8} style={{ padding: "14px 16px" }}>
          <Search value={q} onChange={setQ} placeholder="Name, ID or qualification" />
          <SiteSelect value={site} onChange={setSite} />
          <select aria-label="Role group" className="ros-input" style={selStyle} value={grp} onChange={(e) => setGrp(e.target.value)}>
            {ROLE_GROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <Seg size="sm" value={cert} onChange={setCert} options={[["all", "All certificates"], ["expired", "Expired"], ["soon", "Due in 30 days"], ["ok", "All current"]]} />
          <div style={{ flex: 1 }} />
          <Sub>{rows.length} of {base.length}</Sub>
        </Row>
        <Table rows={rows} cols={cols} rowKey={x => x.id} onRow={x => openRecord({ kind: "staff", id: x.id })} minWidth={980} empty="No staff match these filters"
          rowTone={x => (certStatus(x).gardaExpired ? "bad" : certStatus(x).soon.length ? "warn" : undefined)} />
        <Row wrap gap={12} style={{ padding: "12px 16px" }}>
          <Sub>Certificates: GV Garda vetting · FA First aid · CF Children First · MH Manual handling · SD Safe driving.</Sub>
          <Row gap={6}><Badge tone="ok">Current</Badge><Badge tone="info">90 days</Badge><Badge tone="warn">30 days</Badge><Badge tone="bad">Expired</Badge></Row>
        </Row>
      </Card>
    </>
  );
}

/* ---------------- Rota ---------------- */
type RotaRow = { key: string; label: string; sub: string; session: Session; roomId?: string };
function rotaRows(loc: string): RotaRow[] {
  const s = getState(), l = locById(loc)!;
  const out: RotaRow[] = [];
  if (l.services.includes("SAC")) {
    out.push({ key: "am", label: "Morning club", sub: "07:15–09:15 · school age", session: "Morning" });
    out.push({ key: "pm", label: "After School", sub: "13:45–18:15 · school age", session: "After School" });
  }
  for (const r of s.rooms.filter(x => x.locationId === loc && x.kind !== "SAC")) out.push({ key: r.id, label: r.name, sub: r.kind + " · 1:" + r.ratio, session: "Full Day", roomId: r.id });
  return out;
}
function Rota() {
  const { s, ui, role } = useRos();
  const [site, setSite] = useState(() => defaultSite(ui.focus.locationId));
  const [sel, setSel] = useState<{ row: string; date: ISODate } | null>(() => (site === "ARR" ? { row: "pm", date: TODAY } : null));
  const loc = inScope(site) ? site : defaultSite();
  const rows = rotaRows(loc);
  const blocked = s.staff.filter(x => certStatus(x).gardaExpired && inScope(x.locationId));
  const cur = sel ? rows.find(r => r.key === sel.row) : undefined;
  const gaps = rows.reduce((n, r) => n + THIS_WEEK.filter(d => d >= TODAY && !ratioCheck(loc, d, r.session, r.roomId).ok).length, 0);
  return (
    <>
      <PageHead eyebrow="Staff & HR" title={"Rota · " + locById(loc)?.short + " · " + WEEK_LABEL}
        sub="Required staff come from this week's bookings at the demo ratios (school age 1:10, crèche 1:5, preschool 1:6 and 1:8). These ratios are illustrative settings, not a regulatory determination."
        right={<SiteSelect value={loc} onChange={(v) => { setSite(v); setSel(null); }} allowAll={false} />} />
      {blocked.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Callout tone="bad" title={"Rota blocks: " + blocked.length + " person" + (blocked.length === 1 ? "" : "s") + " cannot be assigned"}>
            {blocked.map(x => <span key={x.id}><RecLink r={{ kind: "staff", id: x.id }} mono={false}>{x.name}</RecLink> ({locById(x.locationId)?.short}) · Garda vetting expired {fmtDate(x.certs.find(c => c.kind === "Garda vetting")!.expires)}. </span>)}
            The rota refuses these assignments until the renewal is on file.
          </Callout>
        </div>
      )}
      <Card title="Week grid" sub={"Each cell shows rostered against required. " + (gaps ? gaps + " gap" + (gaps === 1 ? "" : "s") + " from today on." : "Every session from today on meets the demo ratio.")} pad={false}
        right={<Row gap={6}><Badge tone="ok">Covered</Badge><Badge tone="bad">Short</Badge></Row>}>
        <div className="ros-scroll-x">
          <div style={{ minWidth: 640, display: "grid", gridTemplateColumns: "minmax(150px,1.3fr) repeat(5,minmax(84px,1fr))", padding: "0 12px 14px" }}>
            <div />
            {THIS_WEEK.map(d => <div key={d} style={{ padding: "8px 6px", fontSize: 11.5, color: d === TODAY ? "var(--accent)" : "var(--faint)", fontWeight: d === TODAY ? 600 : 500, textAlign: "center" }}>{fmtDay(d)}{d === TODAY ? " · today" : ""}</div>)}
            {rows.map(r => (
              <RotaLine key={r.key} r={r} loc={loc} sel={sel} onSel={(date) => setSel(sel && sel.row === r.key && sel.date === date ? null : { row: r.key, date })} />
            ))}
          </div>
        </div>
        {!rows.length && <Empty title="No rota sessions at this site" />}
      </Card>
      {sel && cur && <div style={{ marginTop: 16 }}><CellDetail loc={loc} row={cur} date={sel.date} canAssign={MANAGES.includes(role.id)} /></div>}
      {!sel && <div style={{ marginTop: 12 }}><Sub>Select a cell to see who is on shift and to assign cover.</Sub></div>}
    </>
  );
}
function RotaLine({ r, loc, sel, onSel }: { r: RotaRow; loc: string; sel: { row: string; date: ISODate } | null; onSel: (d: ISODate) => void }) {
  return (
    <>
      <div style={{ padding: "8px 6px", borderTop: "1px solid var(--border)", minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{r.label}</div>
        <Sub>{r.sub}</Sub>
      </div>
      {THIS_WEEK.map(d => {
        const k = ratioCheck(loc, d, r.session, r.roomId);
        const on = sel && sel.row === r.key && sel.date === d;
        const none = !k.booked && !k.rostered;
        const tone: Tone = none ? "neutral" : k.ok ? "ok" : "bad";
        return (
          <div key={d} style={{ padding: 4, borderTop: "1px solid var(--border)" }}>
            <button className="ros-btn ros-focus" onClick={() => onSel(d)} aria-label={r.label + " " + fmtDay(d)}
              style={{ width: "100%", minHeight: 54, borderRadius: 12, cursor: "pointer", border: "1px solid " + (on ? "var(--accent)" : "transparent"), background: none ? "var(--surface-2)" : toneBg[tone], color: "var(--ink)", padding: "6px 8px", textAlign: "center", opacity: d < TODAY ? 0.62 : 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: none ? "var(--faint)" : toneInk[tone], fontVariantNumeric: "tabular-nums" }}>{none ? "None" : k.rostered + "/" + k.required}</div>
              <div style={{ fontSize: 10.5, color: "var(--dim)", marginTop: 2 }}>{k.booked} booked{!k.ok ? " · short " + k.gap : ""}</div>
            </button>
          </div>
        );
      })}
    </>
  );
}
function CellDetail({ loc, row, date, canAssign }: { loc: string; row: RotaRow; date: ISODate; canAssign: boolean }) {
  const { s } = useRos();
  const k = ratioCheck(loc, date, row.session, row.roomId);
  const issue = s.issues.find(i => i.kind === "Ratio" && i.locationId === loc && i.date === date && i.session === row.session);
  const isSac = row.session !== "Full Day";
  const overlaps = (a: string) => a === "Full Day" || row.session === "Full Day" || a === row.session;
  const pool = s.staff.filter(x => (x.locationId === loc || x.role === "Relief Practitioner") && (isSac ? CARE_SAC(x.role) : CARE_EY(x.role)))
    .map(x => {
      const cs = certStatus(x);
      const ab = s.absences.find(a => a.staffId === x.id && a.date === date);
      const busy = s.shifts.find(t => t.staffId === x.id && t.date === date && t.status !== "proposed" && overlaps(t.session));
      const reason = cs.gardaExpired ? "Blocked: Garda vetting expired " + fmtDateY(cs.expired.find(c => c.kind === "Garda vetting")!.expires) + ". Cannot be rostered until the renewal is on file."
        : ab ? "Unavailable: " + ab.reason : busy ? "Already rostered: " + locById(busy.locationId)?.short + " " + busy.session + " " + busy.start + "–" + busy.end : "";
      return { x, cs, reason, blocked: cs.gardaExpired, ok: !reason };
    })
    .sort((a, b) => Number(b.ok) - Number(a.ok) || Number(a.x.locationId !== loc) - Number(b.x.locationId !== loc) || a.x.name.localeCompare(b.x.name));
  const assign = (x: StaffRec) => {
    if (certStatus(x).gardaExpired) { pushToast(x.name + " cannot be rostered: Garda vetting has expired.", "bad"); return; }
    confirmThen({
      title: "Assign " + x.name + "?", confirmLabel: "Assign",
      body: "Adds " + x.name + " to " + locById(loc)?.short + " " + row.label + " on " + fmtDay(date) + (isSac ? (row.session === "Morning" ? " (07:15–09:15)" : " (13:45–18:15)") : " (07:45–17:45)") + ". The ratio forecast, Command and Activity update together.",
      run: () => (isSac ? assignShift({ staffId: x.id, locationId: loc as LocationId, date, session: row.session }) : assignRoom({ staffId: x.id, locationId: loc as LocationId, date, roomId: row.roomId! })),
    });
  };
  return (
    <div className="ros-split">
      <Stack gap={16}>
        <Card title={row.label + " · " + fmtDay(date)} sub={locById(loc)?.short + " · " + row.sub}
          right={<StatusBadge s={!k.booked && !k.rostered ? "No bookings" : k.ok ? "Covered" : "Short " + k.gap} />}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, marginBottom: 12 }}>
            {([["Booked", k.booked], ["Rostered", k.rostered], ["Required", k.required]] as [string, number][]).map(([a, b]) => (
              <div key={a} style={{ padding: 12, borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <Label>{a}</Label>
                <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4, color: a === "Rostered" && !k.ok ? "var(--bad)" : "var(--ink)" }}>{b}</div>
              </div>
            ))}
          </div>
          <Label style={{ marginBottom: 6 }}>On shift</Label>
          {k.shifts.length ? k.shifts.map(t => {
            const st = staffById(t.staffId)!;
            const ab = s.absences.find(a => a.staffId === st.id && a.date === date);
            return <ListRow key={t.id} onClick={() => openRecord({ kind: "staff", id: st.id })} lead={<Avatar name={st.name} />} title={st.name}
              sub={st.role + " · " + t.start + "–" + t.end + (t.relief ? " · relief" : "")}
              right={ab ? <Badge tone="bad">{ab.reason.split(" (")[0].split(" ·")[0]}</Badge> : <Badge tone={t.status === "approved" ? "ok" : "neutral"}>{t.status === "approved" ? "Approved" : "Rostered"}</Badge>} />;
          }) : <Sub>Nobody rostered for this session.</Sub>}
        </Card>
        {issue && <Card title={"Open alert " + issue.id} sub="Proposed by the Ratio & Rota agent. Approving here updates the rota, Command, Work and Activity together."><IssuePanel id={issue.id} /></Card>}
      </Stack>
      <Card title="Assign cover" sub={isSac ? "School-age staff at this site plus the relief panel." : "Room staff at this site plus the relief panel."}>
        {!canAssign && <div style={{ marginBottom: 10 }}><Callout tone="neutral" title="View only">Assigning shifts needs the owner, operations or a location manager.</Callout></div>}
        {k.ok && k.booked > 0 && <div style={{ marginBottom: 10 }}><Callout tone="ok" title="Ratio met">Extra cover is optional for this session.</Callout></div>}
        <Stack gap={4}>
          {pool.slice(0, 14).map(({ x, reason, blocked, ok, cs }) => (
            <ListRow key={x.id} tone={blocked ? "bad" : undefined} lead={<Avatar name={x.name} size={26} />}
              title={<Row gap={6} wrap><RecLink r={{ kind: "staff", id: x.id }} mono={false}>{x.name}</RecLink>{x.locationId !== loc && <Badge tone="info">Relief · {locById(x.locationId)?.short}</Badge>}{cs.soon.length > 0 && <Badge tone="warn">{cs.soon[0].kind} {daysBetween(TODAY, cs.soon[0].expires)}d</Badge>}</Row>}
              sub={reason ? <span style={{ color: blocked ? "var(--bad)" : "var(--dim)" }}>{reason}</span> : x.role + " · " + x.qualification}
              right={blocked ? <Badge tone="bad">Blocked</Badge> : <Btn size="sm" variant={ok ? "primary" : "ghost"} disabled={!ok || !canAssign} onClick={() => assign(x)}>Assign</Btn>} />
          ))}
          {!pool.length && <Empty title="No eligible staff for this session" />}
        </Stack>
      </Card>
    </div>
  );
}

/* ---------------- Absence & Relief ---------------- */
function AbsenceRelief() {
  const { s, role } = useRos();
  const issues = s.issues.filter(i => i.kind === "Ratio" && inScope(i.locationId));
  const alerts = ratioAlerts().filter(a => !issues.some(i => i.locationId === a.loc && i.date === a.date && i.session === a.session));
  const abs = s.absences.filter(a => inScope(staffById(a.staffId)?.locationId)).sort((a, b) => a.date.localeCompare(b.date));
  const reliefPool = s.staff.filter(x => x.role === "Relief Practitioner");
  const reliefShifts = s.shifts.filter(x => x.relief && THIS_WEEK.includes(x.date) && inScope(x.locationId));
  const canApprove = MANAGES.includes(role.id);
  const openGaps = issues.filter(i => i.status === "Open" && !ratioCheck(i.locationId, i.date, i.session as Session).ok).length;
  return (
    <>
      <PageHead eyebrow="Staff & HR" title="Absence and relief" sub="Absences this week, the cover gaps they create, and qualified relief proposed by the Ratio & Rota agent. A person approves every relief shift." />
      <Grid min={160} style={{ marginBottom: 16 }}>
        <Kpi label="Absences this week" value={abs.length} sub={abs.filter(a => a.date === TODAY).length + " today"} />
        <Kpi label="Open cover gaps" value={openGaps + alerts.length} tone={openGaps || alerts.length ? "bad" : "ok"} sub="today and tomorrow" />
        <Kpi label="Relief panel" value={reliefPool.length} sub="qualified, Garda vetted" />
        <Kpi label="Relief shifts approved" value={reliefShifts.length} sub={WEEK_LABEL} tone={reliefShifts.length ? "ok" : undefined} />
      </Grid>
      <Stack gap={16}>
        {issues.map(i => <ReliefCard key={i.id} id={i.id} canApprove={canApprove} />)}
        {alerts.map(a => (
          <Callout key={a.loc + a.date + a.session + (a.roomId || "")} tone="bad" title={locById(a.loc)?.short + " · " + fmtDay(a.date) + " · " + (a.roomId ? idx().room.get(a.roomId)?.name : a.session)}
            right={<Btn size="sm" onClick={() => nav("Staff", "Rota", { locationId: a.loc })}>Open rota</Btn>}>
            {a.booked} booked, {a.rostered} rostered against {a.required} required. No relief proposal yet: assign cover from the rota.
          </Callout>
        ))}
        {!issues.length && !alerts.length && <Card><Empty title="No cover gaps in scope" body="Ratio forecasts for today and tomorrow are met." /></Card>}
        <div className="ros-split">
          <Card title="Absences this week" sub="From the absence log. Planned leave is kept off the published rota; sick calls are counted against it." pad={false}>
            <Table rows={abs} rowKey={a => a.staffId + a.date} minWidth={560} onRow={a => openRecord({ kind: "staff", id: a.staffId })} empty="No absences logged this week"
              cols={[
                { key: "who", label: "Staff", w: "1.5fr", render: a => { const x = staffById(a.staffId)!; return <Row gap={8}><Avatar name={x.name} size={24} /><Stack><span>{x.name}</span><Sub>{x.role}</Sub></Stack></Row>; } },
                { key: "site", label: "Site", w: "1fr", render: a => locById(staffById(a.staffId)!.locationId)?.short },
                { key: "day", label: "Day", w: ".9fr", render: a => fmtDay(a.date) },
                { key: "why", label: "Reason", w: "1.4fr", render: a => <Stack><span style={{ fontSize: 12.5 }}>{a.reason}</span><Sub>Logged {rel(a.reported)}</Sub></Stack> },
                { key: "imp", label: "Impact", w: "1fr", render: a => { const x = staffById(a.staffId)!; const sh = s.shifts.find(t => t.staffId === x.id && t.date === a.date); if (!sh) return <Sub>Kept off rota</Sub>; const r = ratioCheck(sh.locationId, a.date, sh.session, sh.session === "Full Day" ? sh.roomId : undefined); return <Badge tone={r.ok ? "ok" : "bad"}>{sh.session} {r.rostered}/{r.required}</Badge>; } },
              ]} />
          </Card>
          <Stack gap={16}>
            <LogAbsence />
            <Card title="Relief panel this week" sub="Availability from the rota. Relief practitioners float between sites.">
              {reliefPool.map(x => {
                const sh = s.shifts.filter(t => t.staffId === x.id && THIS_WEEK.includes(t.date));
                const cs = certStatus(x);
                return <ListRow key={x.id} onClick={() => openRecord({ kind: "staff", id: x.id })} lead={<Avatar name={x.name} size={26} />} title={x.name}
                  sub={x.qualification + " · based " + locById(x.locationId)?.short + " · " + (sh.length ? sh.map(t => dow(t.date) + " " + locById(t.locationId)?.short).join(", ") : "free all week")}
                  right={cs.gardaExpired ? <Badge tone="bad">Blocked</Badge> : <Badge tone={sh.length ? "info" : "ok"}>{sh.length ? sh.length + " shift" + (sh.length === 1 ? "" : "s") : "Available"}</Badge>} />;
              })}
            </Card>
          </Stack>
        </div>
      </Stack>
    </>
  );
}
function ReliefCard({ id, canApprove }: { id: string; canApprove: boolean }) {
  const { s } = useRos();
  const iss = s.issues.find(i => i.id === id)!;
  const r = ratioCheck(iss.locationId, iss.date, iss.session as Session);
  const appr = s.approvals.find(a => a.link?.kind === "issue" && a.link.id === iss.id);
  const relief = s.shifts.find(t => t.relief && t.locationId === iss.locationId && t.date === iss.date && t.session === iss.session);
  const resolved = iss.status === "Resolved" || r.ok;
  return (
    <Card tone={resolved ? undefined : "bad"} title={iss.title} sub={iss.detail}
      right={<><RecLink r={{ kind: "issue", id: iss.id }} />{appr && <RecLink r={{ kind: "approval", id: appr.id }} />}<StatusBadge s={resolved ? "Resolved" : "Open"} dot={!resolved} /></>}>
      <Row wrap gap={8} style={{ marginBottom: 12 }}>
        <Badge>{fmtDay(iss.date)} · {iss.session}</Badge>
        <Badge tone="info">{r.booked} booked</Badge>
        <Badge tone={r.ok ? "ok" : "bad"}>{r.rostered} of {r.required} required</Badge>
        <Sub>Demo ratio 1:{r.ratio}</Sub>
      </Row>
      {resolved ? (
        <Callout tone="ok" title={"Covered" + (relief ? " by " + staffById(relief.staffId)?.name + " " + relief.start + "–" + relief.end : "")}>
          {iss.resolvedBy ? "Approved by " + iss.resolvedBy + " · " + rel(iss.resolvedAt || "") + ". Rota, ratio forecast, Command, Work and Activity updated together." : "The rota now meets the demo ratio after a direct assignment, so the relief proposal is no longer needed."}
        </Callout>
      ) : (
        <>
          <Label style={{ marginBottom: 8 }}>Qualified relief offers</Label>
          <Grid min={260}>
            {(iss.offerStaffIds || []).map(sid => {
              const st = staffById(sid)!;
              const cs = certStatus(st);
              const busy = s.shifts.find(t => t.staffId === sid && t.date === iss.date);
              const hours = iss.locationId === "ARR" ? "09:00–17:30" : "13:45–18:15";
              return (
                <div key={sid} style={{ padding: 14, borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface-2)", minWidth: 0 }}>
                  <Row gap={10} style={{ marginBottom: 10 }}>
                    <Avatar name={st.name} size={34} />
                    <Stack><RecLink r={{ kind: "staff", id: st.id }} mono={false}>{st.name}</RecLink><Sub>{st.role} · {st.qualification} · based {locById(st.locationId)?.short}</Sub></Stack>
                  </Row>
                  <Row wrap gap={4} style={{ marginBottom: 10 }}>
                    {st.certs.map(c => <Badge key={c.kind} tone={certTone(c.expires) === "info" ? "ok" : certTone(c.expires)}>{c.kind} · {certText(c.expires)}</Badge>)}
                  </Row>
                  <Row wrap gap={8}>
                    {cs.gardaExpired ? <Badge tone="bad">Blocked: Garda vetting expired</Badge> : busy ? <Badge tone="warn">Already on {locById(busy.locationId)?.short} {busy.session}</Badge> : <Badge tone="ok">Eligible · free {dow(iss.date)}</Badge>}
                    <div style={{ flex: 1 }} />
                    {canApprove ? (
                      <Btn variant="primary" size="sm" disabled={cs.gardaExpired} onClick={() => confirmThen({
                        title: "Approve " + st.name + " for " + locById(iss.locationId)?.short + "?", confirmLabel: "Approve relief",
                        body: "Adds a qualified relief shift (" + hours + ") on " + fmtDay(iss.date) + ". " + iss.session + " goes to " + (r.rostered + 1) + " of " + r.required + " required, " + iss.id + " resolves, and " + (appr ? appr.id : "the approval") + " closes. Command, Work and Activity update together.",
                        run: () => approveRelief({ issueId: iss.id, staffId: sid }),
                      })}>Approve {st.name.split(" ")[0]}</Btn>
                    ) : <Badge>Needs ops or manager approval</Badge>}
                  </Row>
                </div>
              );
            })}
          </Grid>
        </>
      )}
    </Card>
  );
}
function LogAbsence() {
  const { s, role } = useRos();
  const staff = s.staff.filter(x => ON_ROTA(x.role) && inScope(x.locationId)).sort((a, b) => a.name.localeCompare(b.name));
  const days = THIS_WEEK.filter(d => d >= TODAY);
  const [who, setWho] = useState("");
  const [day, setDay] = useState<ISODate>(days[0]);
  const [why, setWhy] = useState("Sick leave · reported by phone");
  const can = MANAGES.includes(role.id);
  const x = staffById(who);
  const dup = !!x && s.absences.some(a => a.staffId === x.id && a.date === day);
  return (
    <Card title="Log an absence" sub="Counts against the rota straight away and re-runs the ratio forecast.">
      <Stack gap={10}>
        <Field label="Staff member">
          <select className="ros-input" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Choose a person</option>
            {staff.map(t => <option key={t.id} value={t.id}>{t.name} · {locById(t.locationId)?.short}</option>)}
          </select>
        </Field>
        <div className="ros-split-even" style={{ gap: 10 }}>
          <Field label="Day">
            <select className="ros-input" value={day} onChange={(e) => setDay(e.target.value)}>{days.map(d => <option key={d} value={d}>{fmtDay(d)}</option>)}</select>
          </Field>
          <Field label="Reason">
            <select className="ros-input" value={why} onChange={(e) => setWhy(e.target.value)}>
              {["Sick leave · reported by phone", "Annual leave (approved)", "Family emergency", "Training day", "Force majeure leave"].map(r => <option key={r}>{r}</option>)}
            </select>
          </Field>
        </div>
        {dup && <Sub>Already logged for that day.</Sub>}
        <Row><Btn variant="primary" disabled={!x || dup || !can} onClick={() => x && confirmThen({ title: "Log absence for " + x.name + "?", body: fmtDay(day) + " · " + why + ". The rota, ratio forecast and Activity update together.", confirmLabel: "Log absence", run: () => logAbsence({ staffId: x.id, date: day, reason: why }) })}>Log absence</Btn>{!can && <Sub>Managers only</Sub>}</Row>
      </Stack>
    </Card>
  );
}

/* ---------------- Certifications ---------------- */
function Certifications() {
  const { s, role } = useRos();
  const [site, setSite] = useState("ALL");
  const [view, setView] = useState<"all" | "action" | "expired">("action");
  const [kind, setKind] = useState<"all" | CertKind>("all");
  const base = s.staff.filter(x => inScope(x.locationId) && (site === "ALL" || x.locationId === site));
  const due = (x: StaffRec, days: number) => x.certs.filter(c => (kind === "all" || c.kind === kind) && (c.expires < TODAY || daysBetween(TODAY, c.expires) <= days));
  const rows = base.filter(x => view === "all" ? (kind === "all" || x.certs.some(c => c.kind === kind)) : view === "expired" ? x.certs.some(c => (kind === "all" || c.kind === kind) && c.expires < TODAY) : due(x, 90).length > 0)
    .sort((a, b) => Math.min(...a.certs.map(c => daysBetween(TODAY, c.expires))) - Math.min(...b.certs.map(c => daysBetween(TODAY, c.expires))));
  const ext = hr(s);
  const can = MANAGES.includes(role.id);
  const remindable = base.flatMap(x => x.certs.filter(c => c.expires < TODAY || daysBetween(TODAY, c.expires) <= 30).map(c => ({ staffId: x.id, kind: c.kind }))).filter(it => !ext.reminders[it.staffId + "|" + it.kind]);
  const all = s.staff.filter(x => inScope(x.locationId));
  const count = (k: CertKind, t: Tone) => all.filter(x => x.certs.some(c => c.kind === k && certTone(c.expires) === t)).length;
  const cols: Col<StaffRec>[] = [
    { key: "who", label: "Staff", w: "1.6fr", sort: x => x.name, render: x => <Stack><RecLink r={{ kind: "staff", id: x.id }} mono={false}>{x.name}</RecLink><Sub>{x.role} · {locById(x.locationId)?.short}</Sub></Stack> },
    ...CERT_KINDS.map((k): Col<StaffRec> => ({
      key: k, label: k, w: "1fr", align: "center", sort: x => x.certs.find(c => c.kind === k)?.expires || "9999",
      render: x => {
        const c = x.certs.find(t => t.kind === k);
        if (!c) return <Sub>n/a</Sub>;
        const t = certTone(c.expires);
        return <span title={k + " · " + fmtDateY(c.expires)} style={{ display: "inline-flex", justifyContent: "center", minWidth: 78, padding: "4px 8px", borderRadius: 8, background: toneBg[t], color: toneInk[t], fontSize: 11.5, fontWeight: 500, whiteSpace: "nowrap" }}>{certText(c.expires)}</span>;
      },
    })),
    { key: "act", label: "Renewal", w: "1.1fr", align: "right", render: x => {
      const need = x.certs.filter(c => c.expires < TODAY || daysBetween(TODAY, c.expires) <= 30);
      if (!need.length) return <Sub>{due(x, 90).length ? "Plan in Training" : "Current"}</Sub>;
      const pending = need.filter(c => !ext.reminders[x.id + "|" + c.kind]);
      if (!pending.length) return <Badge tone="ok">Reminded {rel(ext.reminders[x.id + "|" + need[0].kind]).replace("Today ", "")}</Badge>;
      return <Btn size="sm" disabled={!can} onClick={() => certReminder({ items: pending.map(c => ({ staffId: x.id, kind: c.kind })) })}>Send reminder</Btn>;
    } },
  ];
  return (
    <>
      <PageHead eyebrow="Staff & HR" title="Certification matrix" sub="Garda vetting, first aid, Children First, manual handling and safe driving for every person, coloured by expiry. Expired Garda vetting blocks the rota automatically."
        right={<Btn variant="primary" disabled={!remindable.length || !can} onClick={() => confirmThen({ title: "Send " + remindable.length + " renewal reminders?", body: "Simulated emails to each person with a certificate expired or due inside 30 days, with a copy to HR. Logged to Activity and the Compliance agent.", confirmLabel: "Send reminders", run: () => certReminder({ items: remindable }) })}>{remindable.length ? "Remind all due (" + remindable.length + ")" : "All due reminded"}</Btn>} />
      <Grid min={190} style={{ marginBottom: 16 }}>
        {CERT_KINDS.map(k => {
          const held = all.filter(x => x.certs.some(c => c.kind === k)).length;
          return (
            <Card key={k} title={k} sub={held + " holders"} style={{ cursor: "pointer" }} onClick={() => { setKind(kind === k ? "all" : k); setView("all"); }} tone={kind === k ? "accent" : undefined}>
              <Row wrap gap={6}><Badge tone="bad">{count(k, "bad")} expired</Badge><Badge tone="warn">{count(k, "warn")} ≤30d</Badge><Badge tone="info">{count(k, "info")} ≤90d</Badge></Row>
            </Card>
          );
        })}
      </Grid>
      <Card pad={false}>
        <Row wrap gap={8} style={{ padding: "14px 16px" }}>
          <SiteSelect value={site} onChange={setSite} />
          <Seg size="sm" value={view} onChange={setView} options={[["action", "Due in 90 days"], ["expired", "Expired"], ["all", "Everyone"]]} />
          {kind !== "all" && <Btn size="sm" variant="subtle" onClick={() => setKind("all")}>{kind} · clear</Btn>}
          <div style={{ flex: 1 }} />
          <Row gap={6}><Badge tone="ok">Current</Badge><Badge tone="info">90 days</Badge><Badge tone="warn">30 days</Badge><Badge tone="bad">Expired</Badge></Row>
        </Row>
        <Table rows={rows} cols={cols} rowKey={x => x.id} minWidth={1000} pageSize={30} empty="Nothing due for these filters"
          rowTone={x => (certStatus(x).gardaExpired ? "bad" : undefined)} />
      </Card>
    </>
  );
}

/* ---------------- Timesheets ---------------- */
function Timesheets() {
  const { s, role } = useRos();
  const [site, setSite] = useState<string>(() => scopeLoc());
  const [src, setSrc] = useState<"all" | "Rota" | "Contract">("Rota");
  const ext = hr(s);
  const all = weekHours().filter(h => inScope(h.st.locationId) && (site === "ALL" || h.st.locationId === site));
  const rows = all.filter(h => src === "all" || h.source === src);
  const sites = scopedLocations().filter(l => site === "ALL" || l.id === site);
  const pay = role.payroll;
  const fmtH = (n: number) => (Math.round(n * 10) / 10).toString();
  const siteHours = (id: string) => weekHours().filter(h => h.st.locationId === id);
  const pendingSites = sites.filter(l => !ext.timesheets[l.id]);
  const can = MANAGES.includes(role.id);
  const csv = ["staff_id,name,site,source," + THIS_WEEK.map(d => dow(d).toLowerCase()).join(",") + ",total_hours,contract_hours" + (pay ? ",hourly_cost_eur,gross_eur" : "")]
    .concat(rows.map(h => [h.st.id, '"' + h.st.name + '"', locById(h.st.locationId)?.short, h.source, ...h.byDay.map(fmtH), fmtH(h.total), h.st.contractHours, ...(pay ? [h.st.hourlyCost.toFixed(2), (h.total * h.st.hourlyCost).toFixed(2)] : [])].join(","))).join("\n");
  const cols: Col<Hours>[] = [
    { key: "who", label: "Staff", w: "1.5fr", sort: h => h.st.name, render: h => <Stack><RecLink r={{ kind: "staff", id: h.st.id }} mono={false}>{h.st.name}</RecLink><Sub>{h.st.role} · {locById(h.st.locationId)?.short}</Sub></Stack> },
    ...THIS_WEEK.map((d, i): Col<Hours> => ({ key: d, label: dow(d) + (d === TODAY ? " (today)" : ""), w: ".6fr", align: "right", render: h => <span style={{ color: h.byDay[i] ? "var(--ink)" : "var(--faint)" }}>{h.byDay[i] ? fmtH(h.byDay[i]) : "0"}</span> })),
    { key: "tot", label: "Week", w: ".6fr", align: "right", sort: h => h.total, render: h => <b style={{ fontWeight: 600 }}>{fmtH(h.total)}h</b> },
    { key: "con", label: "Contract", w: ".7fr", align: "right", sort: h => h.st.contractHours, render: h => h.st.contractHours + "h" },
    { key: "var", label: "Variance", w: ".7fr", align: "right", sort: h => h.total - h.st.contractHours, render: h => { const v = h.total - h.st.contractHours; return <span style={{ color: v > 0 ? "var(--warn)" : "var(--dim)" }}>{v > 0 ? "+" : ""}{fmtH(v)}h</span>; } },
    { key: "src", label: "Source", w: ".7fr", render: h => <Badge tone={h.source === "Rota" ? "info" : "neutral"}>{h.source}</Badge> },
    ...(pay ? [
      { key: "rate", label: "Cost/h", w: ".7fr", align: "right", sort: (h: Hours) => h.st.hourlyCost, render: (h: Hours) => euro(h.st.hourlyCost) } as Col<Hours>,
      { key: "gross", label: "Gross (proxy)", w: ".9fr", align: "right", sort: (h: Hours) => h.total * h.st.hourlyCost, render: (h: Hours) => euro(h.total * h.st.hourlyCost) } as Col<Hours>,
    ] : []),
  ];
  const totalH = rows.reduce((n, h) => n + h.total, 0);
  return (
    <>
      <PageHead eyebrow="Staff & HR" title={"Timesheets · " + WEEK_LABEL} sub="Hours come from the published rota (approved relief and room cover included, absences removed). Office, management and transport staff are shown at contract hours."
        right={<><SiteSelect value={site} onChange={setSite} /><DemoTag>No payroll system connected</DemoTag></>} />
      <Grid min={170} style={{ marginBottom: 16 }}>
        <Kpi label="Staff in view" value={rows.length} sub={src === "all" ? "rota and contract" : src.toLowerCase() + " hours"} />
        <Kpi label="Hours this week" value={fmtH(totalH) + "h"} sub="Mon to Fri" />
        <Kpi label="Sites approved" value={sites.length - pendingSites.length + " of " + sites.length} tone={pendingSites.length ? "warn" : "ok"} />
        {pay ? <Kpi label="Gross cost (proxy)" value={euro(rows.reduce((n, h) => n + h.total * h.st.hourlyCost, 0), 0)} sub="owner view · demo rates" /> : <Kpi label="Payroll detail" value="Hidden" sub="owner only; hours shown" />}
      </Grid>
      <div className="ros-split">
        <Card pad={false} title="Hours by person" right={<Seg size="sm" value={src} onChange={setSrc} options={[["Rota", "Rota"], ["Contract", "Contract"], ["all", "All"]]} />}>
          <Table rows={rows} cols={cols} rowKey={h => h.st.id} minWidth={pay ? 1100 : 940} pageSize={20} empty="No hours for these filters" />
        </Card>
        <Stack gap={16}>
          <Card title="Approve timesheets" sub="Approval locks the week's hours for export. Payroll stays outside this demo.">
            <Stack gap={4}>
              {sites.map(l => {
                const a = ext.timesheets[l.id];
                const h = siteHours(l.id);
                return <ListRow key={l.id} title={l.short} sub={h.length + " staff · " + fmtH(h.reduce((n, x) => n + x.total, 0)) + "h"}
                  right={a ? <Badge tone="ok">Approved · {a.by.split(" ")[0]} {a.at.slice(11)}</Badge> : <Btn size="sm" disabled={!can} onClick={() => confirmThen({ title: "Approve " + l.short + " timesheets?", body: h.length + " staff, " + fmtH(h.reduce((n, x) => n + x.total, 0)) + " hours for " + WEEK_LABEL + ". Logged to Activity. No payroll system is connected, so nothing is submitted.", confirmLabel: "Approve", run: () => approveTimesheets({ sites: [{ id: l.id, hours: Math.round(h.reduce((n, x) => n + x.total, 0) * 10) / 10, staff: h.length }] }) })}>Approve</Btn>} />;
              })}
            </Stack>
            {pendingSites.length > 1 && can && (
              <Row style={{ marginTop: 10 }}>
                <Btn variant="primary" full onClick={() => confirmThen({ title: "Approve " + pendingSites.length + " sites?", body: "Approves every site still pending for " + WEEK_LABEL + ". Hours only; nothing is sent to payroll.", confirmLabel: "Approve all", run: () => approveTimesheets({ sites: pendingSites.map(l => { const h = siteHours(l.id); return { id: l.id, hours: Math.round(h.reduce((n, x) => n + x.total, 0) * 10) / 10, staff: h.length }; }) }) })}>Approve all pending ({pendingSites.length})</Btn>
              </Row>
            )}
          </Card>
          <Card title="Export preview" sub={pay ? "Payslip-ready CSV including proxy cost (owner view)." : "Hours-only CSV. Rates and pay are hidden for this role."} right={<DemoTag />}>
            <textarea className="ros-input" readOnly rows={9} value={csv.split("\n").slice(0, 12).join("\n") + (rows.length > 11 ? "\n… " + (rows.length - 11) + " more rows" : "")} style={{ fontFamily: "var(--mono)", fontSize: 11, whiteSpace: "pre", overflowX: "auto" }} />
            <Row wrap style={{ marginTop: 10 }}>
              <Btn onClick={() => { try { navigator.clipboard.writeText(csv).then(() => pushToast("CSV copied: " + rows.length + " rows.", "ok"), () => pushToast("The browser blocked the clipboard. Select the preview text instead.", "warn")); } catch { pushToast("The browser blocked the clipboard. Select the preview text instead.", "warn"); } }}>Copy CSV ({rows.length} rows)</Btn>
              <Sub>No payroll system connected. Nothing leaves the browser.</Sub>
            </Row>
          </Card>
        </Stack>
      </div>
    </>
  );
}

/* ---------------- Recruitment ---------------- */
interface Applicant { id: string; name: string; role: string; loc: LocationId; qualification: string; applied: ISODate; source: string; stage: Stage; done: number[]; note: string; irish: boolean }
const APPLICANTS: Applicant[] = [
  { id: "APP-301", name: "Méabh Gallagher", role: "Relief Practitioner (panel)", loc: "ARC", qualification: "QQI Level 6", applied: "2026-10-02", source: "Website", stage: "Interview", done: [], note: "Free weekday afternoons and drives. Interview Thu 22 Oct 10:00 with Nicola Cash.", irish: false },
  { id: "APP-302", name: "Tomasz Wiśniewski", role: "SAC Practitioner", loc: "GOR", qualification: "QQI Level 5", applied: "2026-09-21", source: "Staff referral", stage: "Vetting & references", done: [3, 4], note: "NVB vetting submitted 9 Oct. One of two references back.", irish: false },
  { id: "APP-303", name: "Laoise Ní Bhriain", role: "Relief Practitioner (panel)", loc: "HAZ", qualification: "BA ECCE (Level 7)", applied: "2026-09-15", source: "Website", stage: "Onboarding", done: [0, 1, 2, 4, 5], note: "Fluent Gaeilge, suits Gaelscoil runs. Induction booked Thu 29 Oct.", irish: true },
  { id: "APP-304", name: "Ruth Kearney", role: "SAC Leader", loc: "DUN", qualification: "BA ECCE (Level 8)", applied: "2026-10-12", source: "Jobs board", stage: "Screening", done: [], note: "Six years leading a school-age service in Waterford.", irish: false },
  { id: "APP-305", name: "Jamie Fennelly", role: "SAC Practitioner", loc: "BMN", qualification: "QQI Level 5", applied: "2026-10-17", source: "Website", stage: "Applied", done: [], note: "Afternoons only. Lives locally.", irish: false },
  { id: "APP-306", name: "Oksana Melnyk", role: "SAC Practitioner", loc: "CAN", qualification: "QQI Level 6 (recognised)", applied: "2026-09-08", source: "Walk-in", stage: "Onboarding", done: [0, 1, 2, 3, 4], note: "Contract out for e-signature. Start pencilled for 2 Nov.", irish: false },
  { id: "APP-307", name: "Cormac Dolan", role: "Driver", loc: "GOR", qualification: "D1 licence · CPC", applied: "2026-10-06", source: "Staff referral", stage: "Offer", done: [4], note: "Offer sent 19 Oct. Safe driving assessment to book.", irish: false },
  { id: "APP-308", name: "Sorcha Healy", role: "Relief Practitioner (panel)", loc: "ARC", qualification: "QQI Level 6", applied: "2026-10-19", source: "Website", stage: "Applied", done: [], note: "Applied after the Arklow relief panel post.", irish: true },
];
function Recruitment() {
  const { s, role } = useRos();
  const ext = hr(s);
  const list = APPLICANTS.filter(a => inScope(a.loc)).map(a => {
    const e = ext.recruit[a.id];
    const checks = CHECKS.map((_, i) => (e && i in e.checks ? e.checks[i] : a.done.includes(i)));
    return { a, stage: e?.stage || a.stage, checks };
  });
  const [selId, setSel] = useState(() => (list.find(x => x.a.id === "APP-302") || list[0])?.a.id || "");
  const cur = list.find(x => x.a.id === selId) || list[0];
  const can = MANAGES.includes(role.id);
  if (!list.length) return <><PageHead eyebrow="Staff & HR" title="Recruitment" /><Card><Empty title="No applicants for this location" /></Card></>;
  const gateOk = (c: boolean[]) => GATE.every(i => c[i]);
  return (
    <>
      <PageHead eyebrow="Staff & HR" title="Recruitment and onboarding" sub="Relief panel and school-age hiring. Nobody reaches the rota until Garda vetting, two references and Children First are confirmed by a person." right={<DemoTag>Fictional applicants</DemoTag>} />
      <Grid min={160} style={{ marginBottom: 16 }}>
        <Kpi label="In pipeline" value={list.filter(x => x.stage !== "Ready for rota").length} />
        <Kpi label="Relief panel candidates" value={list.filter(x => x.a.role.startsWith("Relief")).length} sub="Arklow and Wicklow cover" />
        <Kpi label="Vetting and references" value={list.filter(x => x.stage === "Vetting & references").length} tone="warn" />
        <Kpi label="Ready for rota" value={list.filter(x => x.stage === "Ready for rota").length} tone="ok" />
      </Grid>
      <Card title="Pipeline" pad={false}>
        <div className="ros-scroll-x" style={{ padding: "0 14px 14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(" + STAGES.length + ",minmax(170px,1fr))", gap: 10, minWidth: STAGES.length * 180 }}>
            {STAGES.map(st => (
              <div key={st} style={{ background: "var(--surface-faint)", border: "1px solid var(--border)", borderRadius: 14, padding: 10, minHeight: 120 }}>
                <Row style={{ marginBottom: 8 }}><span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{st}</span><Sub>{list.filter(x => x.stage === st).length}</Sub></Row>
                <Stack gap={6}>
                  {list.filter(x => x.stage === st).map(x => (
                    <button key={x.a.id} className="ros-btn ros-focus" onClick={() => setSel(x.a.id)}
                      style={{ textAlign: "left", padding: "9px 10px", borderRadius: 10, cursor: "pointer", background: "var(--surface)", color: "var(--ink)", border: "1px solid " + (cur?.a.id === x.a.id ? "var(--accent)" : "var(--border)") }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500 }}>{x.a.name}</div>
                      <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{x.a.role} · {locById(x.a.loc)?.short}</div>
                      <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 4 }}>{x.checks.filter(Boolean).length}/{CHECKS.length} checks</div>
                    </button>
                  ))}
                </Stack>
              </div>
            ))}
          </div>
        </div>
      </Card>
      {cur && (
        <div className="ros-split" style={{ marginTop: 16 }}>
          <Card title={cur.a.name} sub={cur.a.role + " · " + locById(cur.a.loc)?.name} right={<><Badge tone="info">{cur.a.id}</Badge><StatusBadge s={cur.stage} /></>}>
            <KV items={[["Qualification", cur.a.qualification], ["Applied", fmtDateY(cur.a.applied) + " · " + cur.a.source], ["Gaeilge", cur.a.irish ? "Yes" : "No"], ["Stage", cur.stage]]} />
            <div style={{ fontSize: 13, color: "var(--body)", marginTop: 12, lineHeight: 1.55 }}>{cur.a.note}</div>
            {(() => {
              const i = STAGES.indexOf(cur.stage);
              const next = STAGES[i + 1];
              if (!next) return <div style={{ marginTop: 14 }}><Callout tone="ok" title="Ready for rota">All gate checks confirmed. Add to the rota from the Rota tab once the contract start date arrives.</Callout></div>;
              const blocked = next === "Ready for rota" && !gateOk(cur.checks);
              return (
                <div style={{ marginTop: 14 }}>
                  {blocked && <div style={{ marginBottom: 10 }}><Callout tone="warn" title="Cannot go on the rota yet">Still needed: {GATE.filter(g => !cur.checks[g]).map(g => CHECKS[g]).join(", ")}.</Callout></div>}
                  <Row wrap>
                    <Btn variant="primary" disabled={blocked || !can} onClick={() => recruitUpdate({ id: cur.a.id, name: cur.a.name, locationId: cur.a.loc, stage: next })}>Move to {next}</Btn>
                    {i > 0 && <Btn variant="subtle" disabled={!can} onClick={() => recruitUpdate({ id: cur.a.id, name: cur.a.name, locationId: cur.a.loc, stage: STAGES[i - 1] })}>Back to {STAGES[i - 1]}</Btn>}
                  </Row>
                </div>
              );
            })()}
          </Card>
          <Card title="Onboarding checklist" sub="Ticked by HR against documents on file. The first three are gate checks.">
            <Stack gap={2}>
              {CHECKS.map((c, i) => (
                <ListRow key={c}
                  lead={<button aria-label={"Toggle " + c} className="ros-focus" disabled={!can} onClick={() => recruitUpdate({ id: cur.a.id, name: cur.a.name, locationId: cur.a.loc, check: i, value: !cur.checks[i] })}
                    style={{ width: 20, height: 20, flex: "none", borderRadius: 7, border: "1.5px solid " + (cur.checks[i] ? "var(--ok)" : "var(--border-strong)"), background: cur.checks[i] ? "var(--ok)" : "none", color: "var(--bg)", cursor: can ? "pointer" : "not-allowed", fontSize: 12, lineHeight: 1 }}>{cur.checks[i] ? "✓" : ""}</button>}
                  title={c} right={GATE.includes(i) ? <Badge tone={cur.checks[i] ? "ok" : "warn"}>Gate</Badge> : undefined} />
              ))}
            </Stack>
          </Card>
        </div>
      )}
    </>
  );
}

/* ---------------- Training ---------------- */
function TrainingPlan() {
  const { s, role } = useRos();
  const [site, setSite] = useState("ALL");
  const ext = hr(s);
  const kinds: CertKind[] = ["First aid", "Children First", "Manual handling"];
  const courses = s.courses.filter(c => c.date >= TODAY).sort((a, b) => a.date.localeCompare(b.date));
  const booked = (cid: string) => s.courseBookings.filter(b => b.courseId === cid).length;
  const needs = s.staff.filter(x => inScope(x.locationId) && (site === "ALL" || x.locationId === site))
    .flatMap(x => x.certs.filter(c => kinds.includes(c.kind) && (c.expires < TODAY || daysBetween(TODAY, c.expires) <= 90)).map(c => ({ x, c })))
    .sort((a, b) => a.c.expires.localeCompare(b.c.expires));
  const can = MANAGES.includes(role.id);
  const hrTasks = openTasks().filter(t => t.department === "HR");
  const plan = (x: StaffRec, k: CertKind) => {
    const key = x.id + "|" + k;
    if (ext.training[key]) return <Badge tone="ok">{ext.training[key].what}</Badge>;
    if (k === "Manual handling") {
      const c = courses.find(t => booked(t.id) < t.capacity && t.date <= addDays(TODAY, 60));
      if (s.courseBookings.some(b => b.name === x.name && courses.some(t => t.id === b.courseId))) return <Badge tone="ok">Already booked</Badge>;
      return c ? <Btn size="sm" disabled={!can} onClick={() => planTraining({ staffId: x.id, kind: k, courseId: c.id })}>Book {c.id} · {fmtDate(c.date)}</Btn> : <Badge tone="warn">No course with space</Badge>;
    }
    return <Btn size="sm" disabled={!can} onClick={() => planTraining({ staffId: x.id, kind: k })}>{k === "Children First" ? "Assign e-learning" : "Book refresher"}</Btn>;
  };
  return (
    <>
      <PageHead eyebrow="Staff & HR" title="Staff training plan" sub="Refreshers due inside 90 days, matched to Kevin Lawless's in-house manual handling courses. First aid uses an external provider; Children First is Tusla e-learning."
        right={<><SiteSelect value={site} onChange={setSite} /><Btn variant="primary" onClick={() => nav("Training", "Calendar")}>Open Training Courses</Btn></>} />
      <Grid min={180} style={{ marginBottom: 16 }}>
        {kinds.map(k => {
          const n = needs.filter(t => t.c.kind === k);
          return <Kpi key={k} label={k + " due in 90 days"} value={n.length} sub={n.filter(t => t.c.expires < addDays(TODAY, 31)).length + " inside 30 days"} tone={n.some(t => t.c.expires < addDays(TODAY, 31)) ? "warn" : undefined} />;
        })}
        <Kpi label="Planned so far" value={Object.keys(ext.training).length} tone={Object.keys(ext.training).length ? "ok" : undefined} sub="this session" />
      </Grid>
      <div className="ros-split">
        <Card title="Refreshers due" sub="Soonest first. Booking a course place updates Training Courses; other refreshers become HR tasks." pad={false}>
          <Table rows={needs} rowKey={t => t.x.id + t.c.kind} minWidth={700} pageSize={20} empty="No refreshers due in the next 90 days"
            rowTone={t => (t.c.expires < TODAY ? "bad" : daysBetween(TODAY, t.c.expires) <= 30 ? "warn" : undefined)}
            cols={[
              { key: "who", label: "Staff", w: "1.5fr", render: t => <Stack><RecLink r={{ kind: "staff", id: t.x.id }} mono={false}>{t.x.name}</RecLink><Sub>{t.x.role} · {locById(t.x.locationId)?.short}</Sub></Stack> },
              { key: "k", label: "Certificate", w: "1fr", render: t => t.c.kind },
              { key: "e", label: "Expires", w: ".9fr", render: t => <Badge tone={certTone(t.c.expires)}>{certText(t.c.expires)}</Badge> },
              { key: "p", label: "Plan", w: "1.4fr", align: "right", render: t => plan(t.x, t.c.kind) },
            ]} />
        </Card>
        <Stack gap={16}>
          <Card title="In-house courses" sub="Manual handling, delivered by Kevin Lawless at Hazelbrook." right={<Btn size="sm" onClick={() => nav("Training", "Calendar")}>Calendar</Btn>}>
            <Stack gap={14}>
              {courses.map(c => {
                const staffOn = s.courseBookings.filter(b => b.courseId === c.id && b.company === "Ray of Sunshine (staff)");
                return (
                  <div key={c.id}>
                    <Meter label={<><RecLink r={{ kind: "course", id: c.id }} /> · {fmtDay(c.date)} {c.start}</>} value={booked(c.id)} max={c.capacity} hint={staffOn.length ? staffOn.length + " staff" : undefined} />
                  </div>
                );
              })}
              {!courses.length && <Sub>No upcoming courses.</Sub>}
            </Stack>
          </Card>
          <Card title="HR training tasks" sub="Open tasks for Orla Dempsey and the HR team.">
            {hrTasks.length ? hrTasks.slice(0, 8).map(t => <TaskRow key={t.id} id={t.id} />) : <Sub>No open HR tasks.</Sub>}
          </Card>
          <Card title="By site" sub="Refreshers due in 90 days.">
            <HBars items={scopedLocations().map(l => ({ label: l.short, value: needs.filter(t => t.x.locationId === l.id).length, tone: needs.some(t => t.x.locationId === l.id && t.c.expires < addDays(TODAY, 31)) ? "warn" as Tone : "accent" as Tone, onClick: () => setSite(l.id) }))} />
          </Card>
        </Stack>
      </div>
    </>
  );
}
