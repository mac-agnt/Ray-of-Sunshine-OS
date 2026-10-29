/* Compliance & Safeguarding. A Tusla inspection-readiness demo checklist
   (not a certificate), incidents, medication, site logs, policies, a
   restricted safeguarding log and GDPR access views. People make every
   high-risk decision; nothing here is finalised by an agent. */
import { useState } from "react";
import type { RosState, LocationId, Tone, ISODate, RefKind, Ref, Incident } from "../types";
import { useRos, defineAction, confirmThen, openRecord, nav, ROLES } from "../store";
import { certStatus, inScope, scopedLocations, staffById, locById, child, childName, family, idx, ratioAlerts, medicationReviews, openTasks } from "../selectors";
import { ApprovalPanel, TaskRow } from "../records";
import {
  Page, PageHead, Card, Kpi, Grid, Table, Badge, StatusBadge, Btn, RecLink, Callout, Seg, Search, ListRow, Timeline, DemoTag, Empty,
  Row, Stack, Sub, Label, Field, KV, Meter, Bar, type Col,
} from "../ui";
import { TODAY, fmtDay, fmtDate, fmtDateY, daysBetween, rel, addDays, hm } from "../time";

/* ---------------- module state kept beside the shared records ---------------- */
interface MedDose { id: string; childId: string; at: string; dose: string; by: string; witness: string; note: string }
interface Decision { text: string; by: string; at: string }
interface Concern { id: string; locationId: LocationId; logged: string; category: string; highRisk: boolean; decision?: Decision }
interface Sar { id: string; requester: string; familyId?: string; received: ISODate; step: number; log: { step: number; by: string; at: string }[] }
interface CompExt {
  medLog: MedDose[]; medReplace: Record<string, string>; sigRequests: Record<string, string>;
  policyReminders: Record<string, { at: string; n: number }>; concerns: Concern[]; decisions: Record<string, Decision>;
  sars: Sar[]; readings: Record<string, string>;
}
const EXT = new WeakMap<RosState, CompExt>();
function comp(s: RosState): CompExt {
  let e = EXT.get(s);
  if (!e) {
    e = { medLog: [], medReplace: {}, sigRequests: {}, policyReminders: {}, concerns: [], decisions: {}, readings: {},
      sars: [{ id: "SAR-26-004", requester: "Former parent (Dungarvan)", received: "2026-10-06", step: 2, log: [{ step: 1, by: "Deirdre Kinsella", at: "2026-10-07 10:05" }, { step: 2, by: "Orla Dempsey", at: "2026-10-14 15:20" }] }] };
    EXT.set(s, e);
  }
  return e;
}
const SAR_STEPS = ["Received", "Identity verified", "Records gathered", "Redaction review", "Response sent"];
/* Neutral placeholders only: no case narratives are held in this demo. */
const SG_SEED: Concern[] = [
  { id: "SG-26-033", locationId: "ARR", logged: "2026-10-20 08:12", category: "Concern about a child", highRisk: true },
  { id: "SG-26-031", locationId: "HAZ", logged: "2026-10-19 15:40", category: "Disclosure", highRisk: false },
  { id: "SG-26-029", locationId: "GOR", logged: "2026-10-14 17:05", category: "Concern about a child", highRisk: false, decision: { text: "Monitor and review in two weeks", by: "Tara Breen (DLP)", at: "2026-10-15 10:20" } },
  { id: "SG-26-024", locationId: "BMN", logged: "2026-10-02 16:30", category: "Attendance pattern", highRisk: false, decision: { text: "No further action, rationale on file", by: "Leanne Farrell (DLP)", at: "2026-10-06 09:45" } },
];
const SG_DECISIONS = ["Monitor and review", "Consult Tusla (referral made by the DLP)", "No further action, rationale on file"];
const MANAGES = ["owner", "ops", "locmgr"];

/* ---------------- actions ---------------- */
const reviewIncident = defineAction<{ id: string }>("comp.review", (s, p, ctx) => {
  const i = s.incidents.find(x => x.id === p.id);
  if (!i || i.managerReviewed) return;
  i.managerReviewed = true;
  if (i.parentSigned) i.status = "Closed";
  ctx.log({ category: "Safeguarding", title: "Manager review completed: " + i.id, detail: i.kind + ". " + (i.parentSigned ? "Parent signature on file, incident closed." : "Awaiting parent signature."), link: { kind: "incident", id: i.id }, locationId: i.locationId });
  ctx.agent("compliance", "Manager review recorded for " + i.id + " by " + ctx.actor, "action", { kind: "incident", id: i.id });
}, { toast: () => "Manager review recorded.", undo: true });

const requestSignature = defineAction<{ id: string }>("comp.sigRequest", (s, p, ctx) => {
  const i = s.incidents.find(x => x.id === p.id);
  if (!i || i.parentSigned || comp(s).sigRequests[i.id]) return;
  comp(s).sigRequests[i.id] = ctx.now;
  i.parentNotified = true;
  const c = s.children.find(x => x.id === i.childId);
  if (c) ctx.comm(c.familyId, "App", "out", "Incident summary " + i.id + " shared for e-signature (simulated)");
  ctx.log({ category: "Safeguarding", title: "Signature requested: " + i.id, detail: "Written summary shared in MyRosKids for the parent to sign. Simulated, nothing sent.", link: { kind: "incident", id: i.id }, locationId: i.locationId });
}, { toast: () => "Signature request logged (simulated)." });

const recordSignature = defineAction<{ id: string }>("comp.signed", (s, p, ctx) => {
  const i = s.incidents.find(x => x.id === p.id);
  if (!i || i.parentSigned) return;
  i.parentSigned = true;
  i.status = i.managerReviewed ? "Closed" : "Open";
  const c = s.children.find(x => x.id === i.childId);
  if (c) ctx.comm(c.familyId, "App", "in", "Parent signed incident summary " + i.id + " (demo portal)");
  s.tasks.forEach(t => { if (t.link?.kind === "incident" && t.link.id === i.id) t.status = "Done"; });
  ctx.log({ category: "Safeguarding", title: "Parent signature received: " + i.id, detail: i.managerReviewed ? "Manager review already done. Incident closed." : "Manager review still needed.", link: { kind: "incident", id: i.id }, locationId: i.locationId });
}, { toast: () => "Signature recorded (demo portal).", undo: true });

const recordDose = defineAction<{ childId: string; dose: string; witness: string; note: string }>("comp.medAdmin", (s, p, ctx) => {
  const c = s.children.find(x => x.id === p.childId);
  if (!c || !c.medication) return;
  comp(s).medLog.push({ id: ctx.id("MED"), childId: c.id, at: ctx.now, dose: p.dose, by: ctx.actor, witness: p.witness, note: p.note });
  ctx.comm(c.familyId, "App", "out", "Medication given at " + ctx.time + ", details at collection (simulated)");
  ctx.log({ category: "Safeguarding", title: "Medication administered: " + c.firstName + " " + c.surname, detail: "Dose recorded with a witness. Detail in the medication log (medical roles only).", link: { kind: "child", id: c.id }, locationId: c.locationId });
}, { toast: () => "Dose recorded. Parent notice simulated.", undo: true });

const requestReplacement = defineAction<{ childId: string }>("comp.medReplace", (s, p, ctx) => {
  const c = s.children.find(x => x.id === p.childId);
  if (!c || !c.medication || comp(s).medReplace[c.id]) return;
  comp(s).medReplace[c.id] = ctx.now;
  const l = s.locations.find(x => x.id === c.locationId)!;
  const mgr = s.staff.find(x => x.id === l.managerId);
  ctx.comm(c.familyId, "App", "out", "Please send in a replacement " + c.medication.name.toLowerCase() + " before " + fmtDate(c.medication.expires) + " (simulated)");
  s.tasks.push({ id: ctx.id("TSK"), title: "Check replacement medication arrives: " + c.firstName + " " + c.surname, owner: mgr?.name || "Location manager", due: fmtDay(c.medication.expires), dueDate: c.medication.expires, priority: "High", department: "Compliance", status: "Not started", link: { kind: "child", id: c.id }, source: "Compliance agent", locationId: c.locationId });
  ctx.agent("compliance", "Replacement requested from parent for " + c.firstName + " " + c.surname + " (expires " + fmtDate(c.medication.expires) + ")", "action", { kind: "child", id: c.id });
  ctx.log({ category: "Safeguarding", title: "Replacement medication requested", detail: c.firstName + " " + c.surname + " · expires " + fmtDateY(c.medication.expires) + ". Parent message simulated; task for " + (mgr?.name || "the manager") + ".", link: { kind: "child", id: c.id }, locationId: c.locationId });
}, { toast: () => "Parent asked for a replacement (simulated). Task created." });

const completeCheck = defineAction<{ id: string; reading?: string }>("comp.checkDone", (s, p, ctx) => {
  const c = s.checks.find(x => x.id === p.id);
  if (!c || c.done) return;
  c.done = true; c.by = ctx.actor;
  if (p.reading) comp(s).readings[c.id] = p.reading;
  const word = c.kind.split(" ")[0].toLowerCase();
  s.tasks.forEach(t => { if (t.status !== "Done" && t.locationId === c.locationId && t.department === "Compliance" && t.title.toLowerCase().startsWith(word)) t.status = "Done"; });
  const l = s.locations.find(x => x.id === c.locationId);
  ctx.log({ category: "Operations", title: c.kind + " signed off: " + (l?.short || c.locationId), detail: "Recorded by " + ctx.actor + (p.reading ? " · reading " + p.reading : "") + ".", locationId: c.locationId });
}, { toast: () => "Site log signed off.", undo: true });

const policyReminder = defineAction<{ id: string }>("comp.policyReminder", (s, p, ctx) => {
  const pol = s.policies.find(x => x.id === p.id);
  if (!pol || comp(s).policyReminders[pol.id]) return;
  const n = pol.required - pol.acknowledged;
  if (n <= 0) return;
  comp(s).policyReminders[pol.id] = { at: ctx.now, n };
  ctx.agent("compliance", "Acknowledgement reminder for " + pol.name + " " + pol.version + " to " + n + " staff", "action");
  ctx.log({ category: "Staffing", title: "Policy reminder: " + pol.name, detail: n + " staff yet to e-sign " + pol.version + ". Simulated email and app notice.", actor: ctx.actor });
}, { toast: () => "Acknowledgement reminder logged (simulated)." });

const logConcern = defineAction<{ locationId: LocationId; category: string; highRisk: boolean }>("comp.sgLog", (s, p, ctx) => {
  const id = ctx.id("SG");
  comp(s).concerns.push({ id, locationId: p.locationId, logged: ctx.now, category: p.category, highRisk: p.highRisk });
  ctx.log({ category: "Safeguarding", title: "Safeguarding record created", detail: "Restricted record " + id + ". Visible to designated liaison persons only.", locationId: p.locationId });
}, { toast: () => "Concern logged. The designated liaison person is notified (simulated)." });

const decideConcern = defineAction<{ id: string; decision: string; locationId: LocationId }>("comp.sgDecision", (s, p, ctx) => {
  if (comp(s).decisions[p.id]) return;
  comp(s).decisions[p.id] = { text: p.decision, by: ctx.actor, at: ctx.now };
  ctx.log({ category: "Safeguarding", title: "DLP decision recorded: " + p.id, detail: "Human decision by " + ctx.actor + ". Restricted record.", locationId: p.locationId });
}, { toast: () => "Decision recorded by a person. Restricted to designated roles.", undo: true });

const logSar = defineAction<{ requester: string; familyId?: string }>("comp.sarLog", (s, p, ctx) => {
  const id = ctx.id("SAR");
  comp(s).sars.push({ id, requester: p.requester, familyId: p.familyId, received: TODAY, step: 0, log: [{ step: 0, by: ctx.actor, at: ctx.now }] });
  ctx.log({ category: "System", title: "Subject access request logged: " + id, detail: "Response due by " + fmtDateY(addDays(TODAY, 30)) + " (one month).", link: p.familyId ? { kind: "family", id: p.familyId } : undefined });
}, { toast: () => "Subject access request logged. Clock started." });

const advanceSar = defineAction<{ id: string }>("comp.sarAdvance", (s, p, ctx) => {
  const r = comp(s).sars.find(x => x.id === p.id);
  if (!r || r.step >= SAR_STEPS.length - 1) return;
  r.step++;
  r.log.push({ step: r.step, by: ctx.actor, at: ctx.now });
  ctx.log({ category: "System", title: "Subject access request " + r.id + ": " + SAR_STEPS[r.step], detail: "Recorded by " + ctx.actor + "." + (r.step === SAR_STEPS.length - 1 ? " Response pack sent (simulated)." : ""), link: r.familyId ? { kind: "family", id: r.familyId } : undefined });
}, { toast: () => "Request moved on a step.", undo: true });

/* ---------------- readiness ---------------- */
interface ReadyItem { label: string; ok: boolean; detail: string; tab: string }
function readiness(s: RosState, loc: LocationId): { items: ReadyItem[]; pct: number } {
  const staff = s.staff.filter(x => x.locationId === loc);
  const checks = s.checks.filter(c => c.locationId === loc);
  const fire = checks.find(c => c.kind.startsWith("Fire"));
  const daily = checks.filter(c => !c.kind.startsWith("Fire"));
  const garda = staff.filter(x => certStatus(x).gardaExpired);
  const expired = staff.filter(x => certStatus(x).expired.length);
  const soon = staff.filter(x => certStatus(x).soon.length);
  const inc = s.incidents.filter(i => i.locationId === loc && i.status !== "Closed");
  const meds = s.children.filter(c => c.locationId === loc && c.medication && daysBetween(TODAY, c.medication.expires) <= 14);
  const pol = s.policies.filter(x => x.acknowledged < x.required);
  const ratio = ratioAlerts().filter(a => a.loc === loc);
  const fams = s.families.filter(f => f.locationId === loc && !f.consentsComplete);
  const items: ReadyItem[] = [
    { label: "Monthly fire drill logged", ok: !!fire?.done, detail: fire?.done ? "Done by " + fire.by : "Outstanding, due " + fmtDay(fire?.due || TODAY), tab: "Site Logs" },
    { label: "Daily logs signed (fridge, cleaning, first aid box, outdoor)", ok: daily.every(c => c.done), detail: daily.filter(c => c.done).length + " of " + daily.length + " signed today", tab: "Site Logs" },
    { label: "Garda vetting current for everyone on site", ok: !garda.length, detail: garda.length ? garda.map(x => x.name).join(", ") + " expired (rota blocked)" : staff.length + " staff checked", tab: "Overview" },
    { label: "No expired staff certificates", ok: !expired.length, detail: expired.length ? expired.length + " with an expired certificate" : "All current", tab: "Overview" },
    { label: "Certificates due in 30 days have a plan", ok: !soon.length, detail: soon.length ? soon.map(x => x.name + " (" + certStatus(x).soon.map(c => c.kind).join(", ") + ")").join("; ") : "None due", tab: "Overview" },
    { label: "Incidents reviewed and signed", ok: !inc.length, detail: inc.length ? inc.map(i => i.id + " " + i.status.toLowerCase()).join(", ") : "Nothing open", tab: "Incidents" },
    { label: "Medication in date for the next 14 days", ok: !meds.length, detail: meds.length ? meds.map(c => c.firstName + " " + c.surname + " · " + fmtDate(c.medication!.expires)).join(", ") : "All in date", tab: "Medication" },
    { label: "Ratio forecast met today and tomorrow", ok: !ratio.length, detail: ratio.length ? ratio.length + " session(s) short" : "Met", tab: "Overview" },
    { label: "Family consents complete", ok: !fams.length, detail: fams.length ? fams.length + " famil" + (fams.length === 1 ? "y" : "ies") + " missing a consent" : "Complete", tab: "Overview" },
    { label: "Group policies acknowledged by all staff", ok: !pol.length, detail: pol.length ? pol.length + " policies awaiting e-signatures (group-wide)" : "All signed", tab: "Policies" },
  ];
  return { items, pct: items.filter(i => i.ok).length / items.length };
}

/* ---------------- module ---------------- */
export default function Compliance({ tab }: { tab: string }) {
  useRos();
  return (
    <Page>
      {tab === "Overview" && <Overview />}
      {tab === "Incidents" && <Incidents />}
      {tab === "Medication" && <Medication />}
      {tab === "Site Logs" && <SiteLogs />}
      {tab === "Policies" && <Policies />}
      {tab === "Safeguarding" && <Safeguarding />}
      {tab === "Audit Access" && <AuditAccess />}
    </Page>
  );
}

/* ---------------- Overview ---------------- */
function Overview() {
  const { s, ui } = useRos();
  const locs = scopedLocations();
  const rows = locs.map(l => ({ l, ...readiness(s, l.id) }));
  const [selLoc, setSel] = useState<string>(() => (ui.focus.locationId && inScope(ui.focus.locationId) ? ui.focus.locationId : rows.slice().sort((a, b) => a.pct - b.pct)[0]?.l.id || "HAZ"));
  const cur = rows.find(r => r.l.id === selLoc) || rows[0];
  const avg = rows.reduce((n, r) => n + r.pct, 0) / Math.max(1, rows.length);
  const tasks = openTasks().filter(t => t.department === "Compliance" || (t.department === "HR" && /garda|first aid|vetting/i.test(t.title)));
  const openInc = s.incidents.filter(i => i.status !== "Closed" && inScope(i.locationId));
  return (
    <>
      <PageHead eyebrow="Compliance & Safeguarding" title="Tusla inspection-readiness demo checklist"
        sub="A working checklist built from site logs, certificates, incidents, medication, ratios, consents and policy sign-offs. It shows where to look before an inspection. It is not a certificate of compliance and is not a Tusla assessment." right={<DemoTag>Readiness demo, not certification</DemoTag>} />
      <Grid min={160} style={{ marginBottom: 16 }}>
        <Kpi label="Average readiness" value={Math.round(avg * 100) + "%"} sub={locs.length + " site" + (locs.length === 1 ? "" : "s")} tone={avg >= 0.9 ? "ok" : avg >= 0.7 ? "warn" : "bad"} />
        <Kpi label="Open incidents" value={openInc.length} sub={openInc.filter(i => !i.parentSigned).length + " awaiting signature"} tone={openInc.length ? "warn" : "ok"} onClick={() => nav("Compliance", "Incidents")} />
        <Kpi label="Site logs outstanding" value={s.checks.filter(c => !c.done && inScope(c.locationId)).length} tone={s.checks.some(c => !c.done && inScope(c.locationId)) ? "warn" : "ok"} onClick={() => nav("Compliance", "Site Logs")} />
        <Kpi label="Medication to review" value={medicationReviews().length} tone={medicationReviews().length ? "warn" : "ok"} onClick={() => nav("Compliance", "Medication")} />
        <Kpi label="Rota blocked (vetting)" value={s.staff.filter(x => inScope(x.locationId) && certStatus(x).gardaExpired).length} tone="bad" onClick={() => nav("Staff", "Certifications")} />
      </Grid>
      <div className="ros-split">
        <Card title="Readiness by site" sub="Share of checklist items currently met. Select a site for the detail." pad={false}>
          <Table rows={rows} rowKey={r => r.l.id} minWidth={560} onRow={r => setSel(r.l.id)} rowTone={r => (r.l.id === cur?.l.id ? "accent" : undefined)}
            cols={[
              { key: "s", label: "Site", w: "1.1fr", sort: r => r.l.short, render: r => <Stack><span>{r.l.short}</span><Sub>{r.l.county}</Sub></Stack> },
              { key: "p", label: "Readiness", w: "1.6fr", sort: r => r.pct, render: r => <div style={{ width: "100%" }}><Row gap={8}><div style={{ flex: 1 }}><Bar value={r.pct} tone={r.pct >= 0.9 ? "ok" : r.pct >= 0.7 ? "warn" : "bad"} /></div><span style={{ fontSize: 12.5, width: 38, textAlign: "right" }}>{Math.round(r.pct * 100)}%</span></Row></div> },
              { key: "o", label: "Outstanding", w: "1.6fr", render: r => <Row gap={4} wrap>{r.items.filter(i => !i.ok).slice(0, 2).map(i => <Badge key={i.label} tone="warn">{i.label.split(" (")[0].split(" for ")[0]}</Badge>)}{r.items.filter(i => !i.ok).length > 2 && <Sub>+{r.items.filter(i => !i.ok).length - 2}</Sub>}</Row> },
            ]} />
        </Card>
        {cur && (
          <Card title={cur.l.name} sub={Math.round(cur.pct * 100) + "% of " + cur.items.length + " items met · manager " + (staffById(cur.l.managerId)?.name || "")} right={<Btn size="sm" onClick={() => openRecord({ kind: "location", id: cur.l.id })}>Site</Btn>}>
            <Stack gap={2}>
              {cur.items.map(i => (
                <ListRow key={i.label} tone={i.ok ? undefined : "warn"} onClick={i.tab !== "Overview" ? () => nav("Compliance", i.tab, { locationId: cur.l.id }) : undefined}
                  lead={<Badge tone={i.ok ? "ok" : "warn"}>{i.ok ? "Met" : "Open"}</Badge>} title={i.label} sub={i.detail} />
              ))}
            </Stack>
          </Card>
        )}
      </div>
      <Card title="Compliance tasks" sub="Open tasks raised by the Compliance agent and HR." style={{ marginTop: 16 }} right={<Btn size="sm" onClick={() => nav("Agents", "Agent Details", { agentId: "compliance" })}>Compliance agent</Btn>}>
        {tasks.length ? tasks.slice(0, 8).map(t => <TaskRow key={t.id} id={t.id} />) : <Empty title="No open compliance tasks" />}
      </Card>
    </>
  );
}

/* ---------------- Incidents ---------------- */
const BODY_SPOT: [RegExp, number, number][] = [[/head|face/i, 50, 13], [/knee|leg/i, 43, 80], [/arm|bite|hand/i, 27, 42]];
function BodyMap({ kind }: { kind: string }) {
  const spot = BODY_SPOT.find(([re]) => re.test(kind));
  const fig = (dx: number) => (
    <g transform={"translate(" + dx + ",0)"} fill="none" stroke="var(--border-strong)" strokeWidth={1.4}>
      <circle cx={50} cy={13} r={8} />
      <rect x={38} y={23} width={24} height={34} rx={8} />
      <path d="M38 27 L26 52 M62 27 L74 52 M44 57 L42 92 M56 57 L58 92" strokeLinecap="round" />
    </g>
  );
  return (
    <div style={{ padding: 12, borderRadius: 14, border: "1px dashed var(--border-strong)", background: "var(--surface-2)" }}>
      <svg viewBox="0 0 200 100" style={{ width: "100%", maxWidth: 300, height: 140, display: "block", margin: "0 auto" }} aria-label="Body map placeholder">
        {fig(0)}{fig(100)}
        <text x={50} y={99} fontSize={7} textAnchor="middle" fill="var(--faint)">Front</text>
        <text x={150} y={99} fontSize={7} textAnchor="middle" fill="var(--faint)">Back</text>
        {spot && <circle cx={spot[1]} cy={spot[2]} r={4} fill="var(--bad)" opacity={0.75} />}
      </svg>
      <Sub>Placeholder. The room leader completes the body map on the tablet form; the manager reviews it.</Sub>
    </div>
  );
}
function Incidents() {
  const { s, role, ui } = useRos();
  const list = s.incidents.filter(i => inScope(i.locationId)).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const [selId, setSel] = useState(() => (list.find(i => i.status !== "Closed") || list[0])?.id || "");
  const [view, setView] = useState<"open" | "all">("open");
  const rows = list.filter(i => view === "all" || i.status !== "Closed");
  const cur = list.find(i => i.id === selId);
  const pendingNotice = s.approvals.filter(a => a.kind === "Incident notification" && a.status === "Pending");
  const cols: Col<Incident>[] = [
    { key: "id", label: "Incident", w: ".9fr", render: i => <RecLink r={{ kind: "incident", id: i.id }} /> },
    { key: "c", label: "Child", w: "1.2fr", render: i => <RecLink r={{ kind: "child", id: i.childId }} mono={false}>{childName(child(i.childId))}</RecLink> },
    { key: "w", label: "When", w: "1fr", sort: i => i.date + i.time, render: i => fmtDay(i.date) + " " + i.time },
    { key: "k", label: "Type", w: "1.3fr", render: i => <Stack><span>{i.kind}</span><Sub>{locById(i.locationId)?.short} · {i.severity}</Sub></Stack> },
    { key: "r", label: "Review", w: ".8fr", render: i => <Badge tone={i.managerReviewed ? "ok" : "warn"}>{i.managerReviewed ? "Done" : "Pending"}</Badge> },
    { key: "p", label: "Parent", w: ".9fr", render: i => <Badge tone={i.parentSigned ? "ok" : "warn"}>{i.parentSigned ? "Signed" : "Awaiting"}</Badge> },
    { key: "st", label: "Status", w: "1fr", render: i => <StatusBadge s={i.status} /> },
  ];
  return (
    <>
      <PageHead eyebrow="Compliance & Safeguarding" title="Incidents" sub="Accidents and incidents from every room and bus. Room staff record; a manager reviews; the parent signs. Notifiable incidents go to Tusla through a person, never through an agent." />
      {ui.focus.locationId && inScope(ui.focus.locationId) && <div style={{ marginBottom: 12 }}><Sub>Site in focus: {locById(ui.focus.locationId)?.short}</Sub></div>}
      <div className="ros-split">
        <Card pad={false} title="Incident log" right={<Seg size="sm" value={view} onChange={setView} options={[["open", "Open"], ["all", "All"]]} />}>
          <Table rows={rows} cols={cols} rowKey={i => i.id} onRow={i => setSel(i.id)} minWidth={820} empty="No open incidents in scope" rowTone={i => (i.id === selId ? "accent" : undefined)} />
        </Card>
        <Stack gap={16}>
          {cur ? <IncidentDetail inc={cur} canManage={MANAGES.includes(role.id)} /> : <Card><Empty title="Select an incident" /></Card>}
          {pendingNotice.map(a => <Card key={a.id} title={"Pending approval " + a.id} sub="Written summary to the parent needs a manager's sign-off."><ApprovalPanel id={a.id} /></Card>)}
        </Stack>
      </div>
    </>
  );
}
function IncidentDetail({ inc, canManage }: { inc: Incident; canManage: boolean }) {
  const { s } = useRos();
  const c = child(inc.childId);
  const ext = comp(s);
  const req = ext.sigRequests[inc.id];
  const at = (t: string) => fmtDay(inc.date) + " " + t;
  const plus = (m: number) => { const [h, mm] = inc.time.split(":").map(Number); return hm(h * 60 + mm + m); };
  const chrono: { at: string; title: string; detail?: string; tone?: Tone }[] = [
    { at: at(inc.time), title: "Incident: " + inc.kind, detail: inc.summary, tone: inc.severity === "Minor" ? "warn" : "bad" },
    { at: at(plus(5)), title: "First response recorded", detail: "Witnesses: " + inc.witnesses.join(", ") },
    { at: inc.parentNotified ? at(plus(20)) : "pending", title: "Parent notified", detail: inc.parentNotified ? "By phone, then the written summary" : "Not yet", tone: inc.parentNotified ? "ok" : "neutral" },
    { at: inc.managerReviewed ? "done" : "pending", title: "Manager review", detail: inc.managerReviewed ? "Reviewed by the location manager" : "Waiting on the manager", tone: inc.managerReviewed ? "ok" : "warn" },
  ];
  if (req) chrono.push({ at: rel(req), title: "Signature requested in MyRosKids", detail: "Simulated", tone: "info" });
  chrono.push({ at: inc.parentSigned ? "done" : "pending", title: "Parent signature", detail: inc.parentSigned ? "Signed" : "Awaiting", tone: inc.parentSigned ? "ok" : "warn" });
  return (
    <Card title={inc.id + " · " + inc.kind} sub={locById(inc.locationId)?.name + " · " + fmtDay(inc.date) + " " + inc.time} right={<><Badge tone={inc.severity === "Notifiable" ? "bad" : inc.severity === "Moderate" ? "warn" : "neutral"}>{inc.severity}</Badge><StatusBadge s={inc.status} /></>}>
      <KV items={[["Child", c ? <RecLink r={{ kind: "child", id: c.id }} mono={false}>{childName(c)}</RecLink> : "Unknown"], ["Family", c ? <RecLink r={{ kind: "family", id: c.familyId }} /> : ""], ["Witnesses", inc.witnesses.join(", ")], ["Parent notified", inc.parentNotified ? "Yes" : "No"]]} />
      <Label style={{ margin: "16px 0 8px" }}>Chronology</Label>
      <Timeline items={chrono} />
      <Label style={{ margin: "6px 0 8px" }}>Body map</Label>
      <BodyMap kind={inc.kind + " " + inc.summary} />
      {inc.severity === "Notifiable" && <div style={{ marginTop: 12 }}><Callout tone="bad" title="Notifiable">A person submits the Tusla notification. This demo never submits anything.</Callout></div>}
      <Row wrap style={{ marginTop: 14 }}>
        {!inc.managerReviewed && <Btn variant="primary" disabled={!canManage} onClick={() => confirmThen({ title: "Complete manager review of " + inc.id + "?", body: "Confirms the chronology, first response and body map have been reviewed by a manager. " + (inc.parentSigned ? "The parent has signed, so the incident closes." : "The incident stays open until the parent signs."), confirmLabel: "Complete review", run: () => reviewIncident({ id: inc.id }) })}>Complete manager review</Btn>}
        {!inc.parentSigned && !req && <Btn disabled={!canManage} onClick={() => requestSignature({ id: inc.id })}>Request parent signature</Btn>}
        {!inc.parentSigned && req && <Btn onClick={() => recordSignature({ id: inc.id })}>Record signature received</Btn>}
        {!inc.parentSigned && <DemoTag>Signature is simulated</DemoTag>}
        {inc.status === "Closed" && <Badge tone="ok">Closed · reviewed and signed</Badge>}
      </Row>
      {!canManage && !inc.managerReviewed && <div style={{ marginTop: 8 }}><Sub>Manager review needs the owner, operations or a location manager.</Sub></div>}
    </Card>
  );
}

/* ---------------- Medication ---------------- */
function Medication() {
  const { s, role } = useRos();
  const kids = s.children.filter(c => c.medication && inScope(c.locationId)).sort((a, b) => a.medication!.expires.localeCompare(b.medication!.expires));
  const review = new Set(medicationReviews().map(c => c.id));
  const [selId, setSel] = useState(() => kids.find(c => review.has(c.id))?.id || kids[0]?.id || "");
  const cur = kids.find(c => c.id === selId);
  const ext = comp(s);
  const [dose, setDose] = useState("2 puffs");
  const [witness, setWitness] = useState("");
  const [note, setNote] = useState("Wheezy after outdoor play");
  if (!role.medical) return <><PageHead eyebrow="Compliance & Safeguarding" title="Medication" /><Callout tone="neutral" title="Restricted">Medication records are visible to roles with medical access only (owner, operations, location managers, room staff). Switch role in the header to see how access changes.</Callout></>;
  const tone = (exp: string): Tone => (exp < TODAY ? "bad" : daysBetween(TODAY, exp) <= 14 ? "bad" : daysBetween(TODAY, exp) <= 45 ? "warn" : "ok");
  const log = ext.medLog.filter(d => kids.some(c => c.id === d.childId)).slice().reverse();
  return (
    <>
      <PageHead eyebrow="Compliance & Safeguarding" title="Medication" sub="Medication held on site for each child, with expiry dates and the administration log. Doses are recorded with a witness and the parent is told at collection." />
      <Grid min={160} style={{ marginBottom: 16 }}>
        <Kpi label="Children with medication" value={kids.length} />
        <Kpi label="Expiring within 14 days" value={kids.filter(c => daysBetween(TODAY, c.medication!.expires) <= 14).length} tone={kids.some(c => daysBetween(TODAY, c.medication!.expires) <= 14) ? "bad" : "ok"} />
        <Kpi label="Review list" value={review.size} sub="expires by 3 Nov" tone={review.size ? "warn" : "ok"} />
        <Kpi label="Doses recorded" value={log.length} sub="this session" />
      </Grid>
      {[...review].map(id => { const c = child(id)!; return (
        <div key={id} style={{ marginBottom: 12 }}>
          <Callout tone="bad" title={"Expiring: " + c.medication!.name + " for " + childName(c)} right={ext.medReplace[id] ? <Badge tone="ok">Parent asked {rel(ext.medReplace[id])}</Badge> : <Btn size="sm" variant="primary" onClick={() => requestReplacement({ childId: id })}>Ask parent for replacement</Btn>}>
            {locById(c.locationId)?.short} · {idx().room.get(c.roomId)?.name} · expires {fmtDateY(c.medication!.expires)} ({daysBetween(TODAY, c.medication!.expires)} days). Stored: {c.medication!.stored}.
          </Callout>
        </div>); })}
      <div className="ros-split">
        <Card pad={false} title="Medication register">
          <Table rows={kids} rowKey={c => c.id} onRow={c => setSel(c.id)} minWidth={720} rowTone={c => (c.id === selId ? "accent" : review.has(c.id) ? "bad" : undefined)}
            cols={[
              { key: "c", label: "Child", w: "1.3fr", render: c => <Stack><span>{childName(c)}</span><Sub>{locById(c.locationId)?.short} · {idx().room.get(c.roomId)?.name}</Sub></Stack> },
              { key: "m", label: "Medication", w: "1.6fr", render: c => <Stack><span style={{ fontSize: 12.5 }}>{c.medication!.name}</span><Sub>{c.medical.map(m => m.kind).join(", ")}</Sub></Stack> },
              { key: "st", label: "Stored", w: "1fr", render: c => <Sub>{c.medication!.stored}</Sub> },
              { key: "e", label: "Expires", w: ".9fr", sort: c => c.medication!.expires, render: c => <Badge tone={tone(c.medication!.expires)}>{fmtDate(c.medication!.expires)} {c.medication!.expires.slice(2, 4)}</Badge> },
            ]} />
        </Card>
        <Stack gap={16}>
          {cur && (
            <Card title={"Record a dose · " + childName(cur)} sub={cur.medication!.name + " · " + cur.medical.map(m => m.detail).join("; ")} right={<RecLink r={{ kind: "child", id: cur.id }} />}>
              <Stack gap={10}>
                <div className="ros-split-even" style={{ gap: 10 }}>
                  <Field label="Dose"><input className="ros-input" value={dose} onChange={(e) => setDose(e.target.value)} /></Field>
                  <Field label="Witness"><input className="ros-input" value={witness} placeholder="Second staff member" onChange={(e) => setWitness(e.target.value)} /></Field>
                </div>
                <Field label="Reason"><input className="ros-input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                <KV items={[["Given by", role.person], ["Time", hm(s.clockMin)]]} />
                {cur.medication!.expires < TODAY && <Callout tone="bad" title="Expired">Do not administer expired medication. Contact the parent.</Callout>}
                <Row wrap>
                  <Btn variant="primary" disabled={!dose.trim() || !witness.trim() || cur.medication!.expires < TODAY} onClick={() => confirmThen({ title: "Record dose for " + childName(cur) + "?", body: dose + " of " + cur.medication!.name + " at " + hm(s.clockMin) + ", given by " + role.person + ", witnessed by " + witness + ". The parent is told at collection (simulated).", confirmLabel: "Record dose", run: () => { recordDose({ childId: cur.id, dose, witness, note }); setWitness(""); } })}>Record administration</Btn>
                  {!witness.trim() && <Sub>A witness is required.</Sub>}
                </Row>
              </Stack>
            </Card>
          )}
          <Card title="Administration log" sub="Doses recorded in this demo session.">
            {log.length ? <Timeline items={log.map(d => { const c = child(d.childId)!; return { at: rel(d.at), title: childName(c) + " · " + d.dose, detail: c.medication!.name + " · by " + d.by + ", witnessed by " + d.witness + (d.note ? " · " + d.note : "") }; })} />
              : <Empty title="No doses recorded yet" body="Doses recorded here appear in the child's file trail and Activity." />}
          </Card>
        </Stack>
      </div>
    </>
  );
}

/* ---------------- Site logs ---------------- */
const KINDS = ["Fire drill (monthly)", "Fridge temperature log", "Cleaning schedule sign-off", "First aid box check", "Outdoor area safety check"];
function SiteLogs() {
  const { s, role } = useRos();
  const locs = scopedLocations();
  const [sel, setSel] = useState<string | null>(null);
  const [reading, setReading] = useState("3.5");
  const ext = comp(s);
  const cur = sel ? s.checks.find(c => c.id === sel) : undefined;
  const out = s.checks.filter(c => !c.done && inScope(c.locationId));
  const can = role.id !== "parent" && role.id !== "driver";
  const temp = parseFloat(reading);
  return (
    <>
      <PageHead eyebrow="Compliance & Safeguarding" title="Site logs" sub="Fire drills, fridge temperatures, cleaning, first aid boxes and outdoor checks for every site. Select an outstanding log to sign it off." />
      <Grid min={160} style={{ marginBottom: 16 }}>
        <Kpi label="Logs signed" value={s.checks.filter(c => c.done && inScope(c.locationId)).length + " of " + s.checks.filter(c => inScope(c.locationId)).length} tone={out.length ? "warn" : "ok"} />
        <Kpi label="Outstanding" value={out.length} tone={out.length ? "warn" : "ok"} sub={out.filter(c => c.kind.startsWith("Fire")).length + " fire drill"} />
        <Kpi label="Fire drills this month" value={s.checks.filter(c => c.kind.startsWith("Fire") && c.done && inScope(c.locationId)).length + " of " + locs.length} />
      </Grid>
      <div className="ros-split">
        <Card pad={false} title="Today's logs by site" sub="Fire drills are due Fri 23 Oct; the daily logs are due today.">
          <div className="ros-scroll-x">
            <div style={{ minWidth: 760, display: "grid", gridTemplateColumns: "minmax(120px,1fr) repeat(5,minmax(110px,1fr))" }}>
              <div style={{ padding: "9px 14px", fontSize: 11.5, color: "var(--faint)", borderBottom: "1px solid var(--border)" }}>Site</div>
              {KINDS.map(k => <div key={k} style={{ padding: "9px 8px", fontSize: 11.5, color: "var(--faint)", borderBottom: "1px solid var(--border)" }}>{k.replace(" (monthly)", "").replace(" schedule sign-off", "").replace(" temperature log", " temps").replace(" area safety check", " area")}</div>)}
              {locs.map(l => (
                <SiteRow key={l.id} loc={l.id} sel={sel} onSel={(id) => setSel(sel === id ? null : id)} />
              ))}
            </div>
          </div>
        </Card>
        <Card title={cur ? cur.kind + " · " + locById(cur.locationId)?.short : "Sign off a log"} sub={cur ? "Due " + fmtDay(cur.due) : "Select an outstanding cell."}>
          {!cur && (out.length ? <Stack gap={2}>{out.map(c => <ListRow key={c.id} onClick={() => setSel(c.id)} title={c.kind} sub={locById(c.locationId)?.short + " · due " + fmtDay(c.due)} right={<Badge tone={c.due < TODAY ? "bad" : "warn"}>{c.due === TODAY ? "Due today" : "Due " + fmtDate(c.due)}</Badge>} />)}</Stack> : <Empty title="Every log is signed" />)}
          {cur && cur.done && <Callout tone="ok" title="Signed off">By {cur.by}{ext.readings[cur.id] ? " · reading " + ext.readings[cur.id] : ""}.</Callout>}
          {cur && !cur.done && (
            <Stack gap={10}>
              {cur.kind.startsWith("Fridge") && (
                <Field label="Fridge reading (°C)" hint="Safe range 0 to 5 °C.">
                  <input className="ros-input" inputMode="decimal" value={reading} onChange={(e) => setReading(e.target.value)} />
                </Field>
              )}
              {cur.kind.startsWith("Fridge") && isFinite(temp) && (temp < 0 || temp > 5) && <Callout tone="bad" title="Out of range">Log a corrective action and move high-risk food. The reading is still recorded.</Callout>}
              {cur.kind.startsWith("Fire") && <Sub>Record the evacuation time and headcount on the drill sheet; this sign-off confirms it was done.</Sub>}
              <KV items={[["Signed by", role.person], ["Time", hm(s.clockMin)]]} />
              <Row><Btn variant="primary" disabled={!can || (cur.kind.startsWith("Fridge") && !isFinite(temp))} onClick={() => { completeCheck({ id: cur.id, reading: cur.kind.startsWith("Fridge") ? temp.toFixed(1) + " °C" : undefined }); setSel(null); }}>Mark complete</Btn></Row>
            </Stack>
          )}
        </Card>
      </div>
    </>
  );
}
function SiteRow({ loc, sel, onSel }: { loc: string; sel: string | null; onSel: (id: string) => void }) {
  const { s } = useRos();
  return (
    <>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontSize: 13 }}>{locById(loc)?.short}</div>
      {KINDS.map(k => {
        const c = s.checks.find(x => x.locationId === loc && x.kind === k);
        if (!c) return <div key={k} style={{ borderBottom: "1px solid var(--border)" }} />;
        return (
          <div key={k} style={{ padding: 6, borderBottom: "1px solid var(--border)" }}>
            <button className="ros-btn ros-focus" onClick={() => onSel(c.id)} style={{ width: "100%", padding: "6px 8px", borderRadius: 10, cursor: "pointer", textAlign: "left", border: "1px solid " + (sel === c.id ? "var(--accent)" : "transparent"), background: c.done ? "var(--ok-soft)" : "var(--warn-soft)", color: "var(--ink)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: c.done ? "var(--ok)" : "var(--warn)" }}>{c.done ? "Done" : "Outstanding"}</div>
              <div style={{ fontSize: 10.5, color: "var(--dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.done ? (c.by || "").split(" ")[0] : "Due " + fmtDate(c.due)}</div>
            </button>
          </div>
        );
      })}
    </>
  );
}

/* ---------------- Policies ---------------- */
function Policies() {
  const { s, role } = useRos();
  const ext = comp(s);
  const ack = s.policies.reduce((n, p) => n + p.acknowledged, 0), req = s.policies.reduce((n, p) => n + p.required, 0);
  const can = MANAGES.includes(role.id);
  return (
    <>
      <PageHead eyebrow="Compliance & Safeguarding" title="Policies and acknowledgements" sub="Current versions and staff e-signatures. Reminders go to whoever has not yet signed the current version." />
      <Grid min={170} style={{ marginBottom: 16 }}>
        <Kpi label="Policies" value={s.policies.length} />
        <Kpi label="Signatures" value={ack + " of " + req} sub={Math.round((ack / req) * 100) + "% acknowledged"} tone={ack === req ? "ok" : "warn"} />
        <Kpi label="Fully signed" value={s.policies.filter(p => p.acknowledged >= p.required).length} tone="ok" />
        <Kpi label="Reminders sent" value={Object.keys(ext.policyReminders).length} sub="this session" />
      </Grid>
      <Card pad={false}>
        <Table rows={s.policies} rowKey={p => p.id} minWidth={820}
          cols={[
            { key: "n", label: "Policy", w: "2fr", sort: p => p.name, render: p => <Stack><span>{p.name}</span><Sub>{p.id}</Sub></Stack> },
            { key: "v", label: "Version", w: ".7fr", render: p => <Badge tone="info">{p.version}</Badge> },
            { key: "u", label: "Updated", w: ".9fr", sort: p => p.updated, render: p => fmtDateY(p.updated) },
            { key: "a", label: "E-signed", w: "1.6fr", sort: p => p.acknowledged / p.required, render: p => <div style={{ width: "100%" }}><Meter label="" value={p.acknowledged} max={p.required} tone={p.acknowledged >= p.required ? "ok" : "warn"} /></div> },
            { key: "r", label: "Reminder", w: "1.2fr", align: "right", render: p => {
              const out = p.required - p.acknowledged;
              if (out <= 0) return <Badge tone="ok">All signed</Badge>;
              const r = ext.policyReminders[p.id];
              if (r) return <Badge tone="ok">Sent to {r.n} · {r.at.slice(11)}</Badge>;
              return <Btn size="sm" disabled={!can} onClick={() => policyReminder({ id: p.id })}>Remind {out}</Btn>;
            } },
          ]} />
      </Card>
      <div style={{ marginTop: 12 }}><Row gap={8}><DemoTag>Simulated reminders</DemoTag><Sub>No emails or app notices are sent. Each reminder is written to Activity and the Compliance agent log.</Sub></Row></div>
    </>
  );
}

/* ---------------- Safeguarding ---------------- */
function Safeguarding() {
  const { s, role } = useRos();
  const ext = comp(s);
  const [loc, setLoc] = useState<string>(() => scopedLocations()[0]?.id || "HAZ");
  const [cat, setCat] = useState("Concern about a child");
  const [high, setHigh] = useState(false);
  if (!role.safeguarding) {
    return (
      <>
        <PageHead eyebrow="Compliance & Safeguarding" title="Safeguarding" />
        <Callout tone="neutral" title="Restricted to designated liaison persons">The safeguarding log is visible to designated roles only (owner, operations and location managers acting as DLP or deputy DLP). Switch role in the header to see how access changes.</Callout>
      </>
    );
  }
  const list = SG_SEED.concat(ext.concerns).filter(c => inScope(c.locationId)).map(c => ({ ...c, decision: ext.decisions[c.id] || c.decision }))
    .sort((a, b) => b.logged.localeCompare(a.logged));
  const status = (c: Concern) => (c.decision ? (c.decision.text.startsWith("No further") ? "Closed" : c.decision.text.startsWith("Consult") ? "Referred by DLP" : "Monitoring") : c.highRisk ? "Awaiting DLP decision" : "DLP reviewing");
  return (
    <>
      <PageHead eyebrow="Compliance & Safeguarding" title="Safeguarding concern log" sub="Restricted to designated liaison persons. Entries here are neutral placeholders: this demo holds no case narratives. Every decision is made and recorded by a person."
        right={<Badge tone="bad">Restricted</Badge>} />
      <div style={{ marginBottom: 14 }}>
        <Callout tone="warn" title="High-risk: human decision required">Agents never assess, score or close a safeguarding concern. High-risk entries stay open until the DLP records a decision. Under Children First, reports to Tusla are made by the DLP through the Tusla portal, outside this demo.</Callout>
      </div>
      <div className="ros-split">
        <Card pad={false} title="Concerns">
          <Stack gap={0}>
            {list.map(c => (
              <div key={c.id} style={{ padding: "14px 16px", borderTop: "1px solid var(--border)", boxShadow: c.highRisk && !c.decision ? "inset 3px 0 0 var(--bad)" : undefined }}>
                <Row wrap gap={8}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{c.id}</span>
                  <Badge>{locById(c.locationId)?.short}</Badge>
                  <Badge tone="info">{c.category}</Badge>
                  {c.highRisk && <Badge tone="bad" dot={!c.decision}>High risk</Badge>}
                  <div style={{ flex: 1 }} />
                  <StatusBadge s={status(c)} />
                </Row>
                <div style={{ fontSize: 13, color: "var(--body)", marginTop: 8 }}>Concern logged · {c.decision ? "decision recorded by " + c.decision.by + ": " + c.decision.text.toLowerCase() : "designated liaison person reviewing"}.</div>
                <Sub>Logged {rel(c.logged)} · child record restricted</Sub>
                {!c.decision && (
                  <Row wrap gap={6} style={{ marginTop: 10 }}>
                    <Label>Record DLP decision</Label>
                    {SG_DECISIONS.map(d => (
                      <Btn key={d} size="sm" variant={c.highRisk ? "ghost" : "subtle"} onClick={() => confirmThen({ title: "Record decision on " + c.id + "?", body: "Records \"" + d + "\" as a human decision by " + role.person + ". The system does not assess or finalise safeguarding concerns; any Tusla report is made by the DLP outside this demo.", confirmLabel: "Record decision", danger: c.highRisk, run: () => decideConcern({ id: c.id, decision: d, locationId: c.locationId }) })}>{d.split(" (")[0].split(",")[0]}</Btn>
                    ))}
                  </Row>
                )}
              </div>
            ))}
          </Stack>
        </Card>
        <Stack gap={16}>
          <Card title="Log a concern" sub="Creates a restricted placeholder and alerts the DLP (simulated). Details are recorded on the paper or secure form, not here.">
            <Stack gap={10}>
              <Field label="Site"><select className="ros-input" value={loc} onChange={(e) => setLoc(e.target.value)}>{scopedLocations().map(l => <option key={l.id} value={l.id}>{l.short}</option>)}</select></Field>
              <Field label="Category"><select className="ros-input" value={cat} onChange={(e) => setCat(e.target.value)}>{["Concern about a child", "Disclosure", "Concern about staff conduct", "Attendance pattern", "Other"].map(x => <option key={x}>{x}</option>)}</select></Field>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={high} onChange={(e) => setHigh(e.target.checked)} /> Flag as high risk (needs a DLP decision)</label>
              <Row><Btn variant="primary" onClick={() => confirmThen({ title: "Log a safeguarding concern?", body: "Creates a restricted record for " + locById(loc)?.short + ". Activity shows only that a restricted record exists.", confirmLabel: "Log concern", run: () => { logConcern({ locationId: loc as LocationId, category: cat, highRisk: high }); setHigh(false); } })}>Log concern</Btn></Row>
            </Stack>
          </Card>
          <Card title="Designated liaison persons" sub="DLP and deputies by site (demo assignment).">
            {scopedLocations().map(l => <ListRow key={l.id} title={l.short} sub={"DLP " + (staffById(l.managerId)?.name || "") + " · deputy Deirdre Kinsella"} />)}
          </Card>
        </Stack>
      </div>
    </>
  );
}

/* ---------------- Audit access ---------------- */
const SENSITIVE: RefKind[] = ["child", "family", "incident", "staff", "plan", "invoice", "claim", "award", "message", "payment"];
const RETENTION: [string, string, string, string][] = [
  ["Child file and registration", "Child, guardians, collectors, consents", "2 years after the child leaves", "Archive, then delete"],
  ["Attendance registers", "Sign-in and sign-out times, collectors", "2 years after the child leaves", "Delete"],
  ["Accident and incident records", "Chronology, body map, signatures", "Until the child turns 25", "Secure archive"],
  ["Medication administration", "Doses, witnesses, expiry checks", "2 years after the child leaves", "Delete"],
  ["Safeguarding records", "DLP log and decisions", "Long-term, restricted access", "Review with DPO"],
  ["Staff files and vetting", "Contract, qualifications, vetting reference and date", "6 years after employment ends", "Delete; vetting disclosures not copied"],
  ["Invoices and payments", "Fees, NCS subsidy lines, receipts", "6 years", "Delete"],
  ["Messages and call notes", "Parent app, email, SMS", "2 years", "Delete"],
];
function AuditAccess() {
  const { s, role } = useRos();
  const [kind, setKind] = useState<"all" | RefKind>("all");
  const [q, setQ] = useState("");
  const [who, setWho] = useState("");
  const [fid, setFid] = useState("");
  const ext = comp(s);
  if (role.id !== "owner" && role.id !== "ops") {
    return <><PageHead eyebrow="Compliance & Safeguarding" title="Audit access" /><Callout tone="neutral" title="Restricted">The data access log and subject access requests are for the data controller roles (owner and operations). Switch role in the header to see them.</Callout></>;
  }
  const roleOf = (actor: string, kindA: string) => ROLES.find(r => r.person === actor)?.label || (kindA === "agent" ? "Agent (scoped read)" : kindA === "system" ? "System" : s.staff.find(x => x.name === actor)?.role || "Parent (own record)");
  const now = TODAY + " " + hm(s.clockMin);
  const entries = [{ at: now, actor: role.person, actorKind: "person", role: role.label + " (role preview)", action: "Opened Audit Access", link: undefined as Ref | undefined, purpose: "GDPR oversight" }]
    .concat(s.activity.filter(e => e.link && SENSITIVE.includes(e.link.kind)).map(e => ({ at: e.at, actor: e.actor, actorKind: e.actorKind, role: roleOf(e.actor, e.actorKind), action: e.actorKind === "agent" ? "Read and proposed" : e.actorKind === "system" ? "Wrote" : "Viewed and updated", link: e.link, purpose: e.category })))
    .filter(e => (kind === "all" || e.link?.kind === kind) && (!q.trim() || (e.actor + " " + (e.link?.id || "") + " " + e.purpose).toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => b.at.localeCompare(a.at));
  const fam = fid.trim() ? family(fid.trim().toUpperCase()) : undefined;
  return (
    <>
      <PageHead eyebrow="Compliance & Safeguarding" title="Audit access (GDPR)" sub="Who touched sensitive records, how long each record type is kept, and the subject access request workflow." right={<DemoTag>Demo log</DemoTag>} />
      <Card pad={false} title="Data access log" sub="Derived from Activity: every person, agent or system event that read or changed a child, family, staff, incident or financial record, plus the current role-preview session.">
        <Row wrap gap={8} style={{ padding: "0 16px 12px" }}>
          <Search value={q} onChange={setQ} placeholder="Person, record or purpose" />
          <Seg size="sm" value={kind} onChange={setKind} options={[["all", "All"], ["child", "Children"], ["family", "Families"], ["staff", "Staff"], ["incident", "Incidents"], ["plan", "Plans"], ["claim", "Claims"]]} />
        </Row>
        <Table rows={entries} rowKey={e => e.at + e.actor + (e.link?.id || "") + e.action} minWidth={820} pageSize={15} empty="No access events for these filters"
          cols={[
            { key: "a", label: "When", w: ".9fr", render: e => rel(e.at) },
            { key: "w", label: "Who", w: "1.3fr", render: e => <Stack><span>{e.actor}</span><Sub>{e.role}</Sub></Stack> },
            { key: "x", label: "Action", w: "1fr", render: e => <Badge tone={e.actorKind === "agent" ? "info" : e.actorKind === "system" ? "neutral" : "accent"}>{e.action}</Badge> },
            { key: "r", label: "Record", w: "1fr", render: e => (e.link ? <RecLink r={e.link} /> : <Sub>Session</Sub>) },
            { key: "p", label: "Purpose", w: ".9fr", render: e => <Sub>{e.purpose}</Sub> },
          ]} />
      </Card>
      <div className="ros-split" style={{ marginTop: 16 }}>
        <Card title="Subject access requests" sub="One calendar month to respond. The workflow below is a placeholder; production needs DPO review.">
          <Stack gap={12}>
            {ext.sars.map(r => {
              const due = addDays(r.received, 30), left = daysBetween(TODAY, due);
              return (
                <div key={r.id} style={{ padding: 12, borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                  <Row wrap gap={8}><span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{r.id}</span><span style={{ fontSize: 13 }}>{r.requester}</span>{r.familyId && <RecLink r={{ kind: "family", id: r.familyId }} />}<div style={{ flex: 1 }} /><Badge tone={r.step === SAR_STEPS.length - 1 ? "ok" : left <= 7 ? "bad" : "warn"}>{r.step === SAR_STEPS.length - 1 ? "Complete" : left + " days left"}</Badge></Row>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(" + SAR_STEPS.length + ",1fr)", gap: 4, marginTop: 10 }}>
                    {SAR_STEPS.map((st, i) => <div key={st} title={st} style={{ height: 6, borderRadius: 3, background: i <= r.step ? "var(--accent)" : "var(--track)" }} />)}
                  </div>
                  <Row wrap gap={8} style={{ marginTop: 8 }}>
                    <Sub>{SAR_STEPS[r.step]} · received {fmtDate(r.received)} · due {fmtDateY(due)}</Sub>
                    <div style={{ flex: 1 }} />
                    {r.step < SAR_STEPS.length - 1 && <Btn size="sm" onClick={() => advanceSar({ id: r.id })}>Mark {SAR_STEPS[r.step + 1].toLowerCase()}</Btn>}
                  </Row>
                </div>
              );
            })}
            <Label>Log a new request</Label>
            <div className="ros-split-even" style={{ gap: 10 }}>
              <Field label="Requester"><input className="ros-input" value={who} placeholder="Name of the person asking" onChange={(e) => setWho(e.target.value)} /></Field>
              <Field label="Parent ID (optional)" hint={fid.trim() ? (fam ? fam.surname + " family" : "No family with that ID") : undefined}><input className="ros-input" value={fid} placeholder="ROS1042" onChange={(e) => setFid(e.target.value)} /></Field>
            </div>
            <Row><Btn variant="primary" disabled={!who.trim() || (!!fid.trim() && !fam)} onClick={() => { logSar({ requester: who.trim(), familyId: fam?.id }); setWho(""); setFid(""); }}>Log request</Btn></Row>
          </Stack>
        </Card>
        <Card title="Retention schedule" sub="Illustrative periods for the demo. Confirm each one with your DPO against current Early Years regulations and Revenue rules." pad={false}>
          <Table rows={RETENTION} rowKey={r => r[0]} minWidth={560}
            cols={[
              { key: "a", label: "Record", w: "1.3fr", render: r => <Stack><span>{r[0]}</span><Sub>{r[1]}</Sub></Stack> },
              { key: "b", label: "Kept for", w: "1.1fr", render: r => <span style={{ fontSize: 12.5 }}>{r[2]}</span> },
              { key: "c", label: "Then", w: "1fr", render: r => <Sub>{r[3]}</Sub> },
            ]} />
        </Card>
      </div>
    </>
  );
}
