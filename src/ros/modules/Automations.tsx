/* Automations & Follow-ups. Every sequence the business runs: what triggers
   it, when it runs, who it reaches and whether a person must approve. Runs
   here are demo runs: metrics, Activity and Work update, and nobody is
   contacted. Schedules are derived from each sequence's timing text and the
   live records it would act on. */
import { useMemo, useState, type ReactNode } from "react";
import type { RosState, AutomationRule, Tone } from "../types";
import { useRos, openRecord, nav, confirmThen, defineAction, setTab } from "../store";
import { idx, family, child, childName, guardian, overdueInvoices, invoiceBalance, invoiceStatus, claimsPending, underbooked, certAlerts, inScope } from "../selectors";
import { TODAY, addDays, daysBetween, fmtDate, fmtDay, dow, rel, euro, hm, pct, round2 } from "../time";
import { Card, Kpi, Grid, Table, Badge, StatusBadge, Btn, RecLink, HBars, Columns, KV, Callout, Seg, Search, ListRow, Timeline, DemoTag, Empty, Row, Stack, Sub, Label, Field, Toggle, Bar, Page, PageHead, type Col } from "../ui";
import { TaskRow } from "../records";
import { runAutomation, toggleAutomation } from "../actions";

/* ---------------- state extension (replayed with the demo log) ---------------- */
type TemplateOverride = { subject: string; body: string; by: string; at: string };
type AutoExt = RosState & { autoAcks?: Record<string, string>; autoTemplates?: Record<string, TemplateOverride> };
const ext = (s: RosState) => s as AutoExt;

const ackException = defineAction<{ id: string; at: string; note: string }>("auto.ack", (s, p, ctx) => {
  const a = s.automations.find(x => x.id === p.id); if (!a) return;
  const e = ext(s); e.autoAcks = { ...(e.autoAcks || {}), [p.id + "|" + p.at]: ctx.actor + " · " + ctx.now };
  ctx.log({ category: "System", title: "Automation exception reviewed: " + a.name, detail: p.note + " Reviewed by " + ctx.actor + ". The sequence keeps running.", link: { kind: "automation", id: a.id } });
}, { toast: () => "Exception marked reviewed and logged." });

const saveTemplate = defineAction<{ id: string; subject: string; body: string }>("auto.saveTemplate", (s, p, ctx) => {
  const a = s.automations.find(x => x.id === p.id); if (!a) return;
  const e = ext(s); e.autoTemplates = { ...(e.autoTemplates || {}), [p.id]: { subject: p.subject, body: p.body, by: ctx.actor, at: ctx.now } };
  ctx.log({ category: "Communications", title: "Template updated: " + a.name, detail: "New wording applies to the next run. Previous version kept in the audit log.", link: { kind: "automation", id: a.id } });
}, { toast: () => "Template saved. The next run uses it.", undo: true });

const resetTemplate = defineAction<{ id: string }>("auto.resetTemplate", (s, p, ctx) => {
  const e = ext(s); if (!e.autoTemplates || !e.autoTemplates[p.id]) return;
  const next = { ...e.autoTemplates }; delete next[p.id]; e.autoTemplates = next;
  const a = s.automations.find(x => x.id === p.id);
  ctx.log({ category: "Communications", title: "Template reset to default: " + (a?.name || p.id), detail: "Standard wording restored.", link: { kind: "automation", id: p.id } });
}, { toast: () => "Template reset to the standard wording." });

const testSend = defineAction<{ id: string; channel: string }>("auto.testSend", (s, p, ctx) => {
  const a = s.automations.find(x => x.id === p.id); if (!a) return;
  ctx.log({ category: "Communications", title: "Test message (simulated): " + a.name, detail: "Preview sent to " + ctx.actor + " by " + p.channel + " using sample data. Simulated: nothing left the demo.", link: { kind: "automation", id: a.id } });
}, { toast: () => "Test logged (simulated). Nothing was sent." });

/* ---------------- templates ---------------- */
const TEMPLATES: Record<string, { subject: string; body: string }> = {
  "AU-01": { subject: "Bookings are open for {windowLabel}", body: "Hi {parentFirst}, bookings for {windowLabel} are open in MyRosKids. The window closes {windowClose}. Book early to be sure of your place and your bus seat. Ray of Sunshine" },
  "AU-02": { subject: "24 hours left to book {windowLabel}", body: "Hi {parentFirst}, a quick nudge: the booking window for {windowLabel} closes {windowClose}. Anything booked after that is a late booking with a {lateFee} fee. Ray of Sunshine" },
  "AU-03": { subject: "Two hours left to book {windowLabel}", body: "Hi {parentFirst}, the window for {windowLabel} closes at {windowCloseTime} today. Open MyRosKids to book. Ray of Sunshine" },
  "AU-04": { subject: "Your NCS hours for {windowLabel}", body: "Hi {parentFirst}, you've booked {hoursBooked} of your {hoursAgreed} agreed NCS hours for {windowLabel}. Booking your full agreed hours keeps your subsidy in line with your award. Reply here if you'd like a hand. NCS team" },
  "AU-05": { subject: "Invoice {invoiceId}: {amount} due", body: "Hi {parentFirst}, invoice {invoiceId} for {amount} was due on {dueDate}. You can pay in MyRosKids by card, Apple Pay or Google Pay. If something's not right, reply and Accounts will sort it out. Ray of Sunshine Accounts" },
  "AU-06": { subject: "Block candidate: {familyName} ({parentId})", body: "{invoiceId} is {daysOverdue} days overdue ({amount}) after Day 2, 5 and 7 reminders. Approve or decline a booking restriction in Pulse. Nothing changes until Accounts decides." },
  "AU-07": { subject: "Phone follow-up: {familyName}", body: "Please phone {parentName} about {invoiceId} ({amount}, {daysOverdue} days overdue). Log the outcome on the family record." },
  "AU-08": { subject: "Your direct debit didn't go through", body: "Hi {parentFirst}, your direct debit for {invoiceId} ({amount}) was returned by the bank. We'll try again on {retryDate}. To pay now instead, use the link in MyRosKids. Ray of Sunshine Accounts" },
  "AU-09": { subject: "Plan instalment due tomorrow", body: "Hi {parentFirst}, a reminder that your next plan instalment of {instalment} is due tomorrow. Thanks for keeping it on track. Ray of Sunshine Accounts" },
  "AU-10": { subject: "Your CHICK for {childFirst} ends on {chickEnd}", body: "Hi {parentFirst}, {childFirst}'s NCS award ends on {chickEnd}. Please renew on the NCS parent portal and share the new CHICK with us so the subsidy continues. NCS team" },
  "AU-11": { subject: "Please accept your NCS claim {claimId}", body: "Hi {parentFirst}, your NCS claim {claimId} for {amountNcs} is waiting for you to accept it. It lapses at {claimDeadline}. It only takes a minute in the NCS parent portal. NCS team" },
  "AU-12": { subject: "A form is missing for {childFirst}", body: "Hi {parentFirst}, we're missing a consent or medical form for {childFirst}. You can complete it in MyRosKids under Documents. Thank you." },
  "AU-13": { subject: "Your Halloween camp place", body: "Hi {parentFirst}, {childFirst}'s camp place isn't paid yet. Unpaid places may be offered to the waitlist after 72 hours. Pay in MyRosKids. Camps team" },
  "AU-14": { subject: "Following up on your enquiry", body: "Hi {enquiryParent}, thanks for asking about a place at {locationName}. Would you like to come for a visit? Reply with a day that suits and we'll book you in. Ray of Sunshine" },
  "AU-15": { subject: "We've received your notice", body: "Hi {parentFirst}, thanks for letting us know. Under our terms the notice period is two months, so the last billed week is {lastWeek}. We'll miss you. Ray of Sunshine" },
  "AU-16": { subject: "Happy birthday, {childFirst}", body: "Room note: it's {childFirst}'s birthday today. Parent message: Happy birthday to {childFirst} from everyone in the room." },
  "AU-17": { subject: "About today at {locationName}", body: "Hi {parentFirst}, there was a small incident involving {childFirst} today. The room leader has written it up; please review and sign in MyRosKids. Call us any time." },
  "AU-18": { subject: "Certificate expiring: {certKind}", body: "Hi {staffFirst}, your {certKind} expires on {certExpiry}. Please book a renewal. Your manager has been copied. Staff with an expired Garda vetting can't be rostered." },
};
function sampleVars(s: RosState): Record<string, string> {
  const kelly = family("ROS1087"), g = guardian(kelly);
  const win = s.windows.find(w => w.status === "Open");
  const od = overdueInvoices()[0], odF = od ? family(od.familyId) : undefined;
  const cl = s.claims.find(c => c.id === "NCS-0091");
  const aw = s.awards.find(a => a.status === "Expiring") || s.awards[0];
  const awChild = aw ? child(aw.childId) : undefined;
  const ub = underbooked().find(u => u.family.id === "ROS1087") || underbooked()[0];
  const fail = s.payments.find(p => p.status === "Failed");
  const plan = s.plans.find(p => p.id === "PLN-031");
  const enq = s.enquiries[0];
  const staffAlert = certAlerts().soon[0] || certAlerts().expired[0];
  const cert = staffAlert?.certs.slice().sort((a, b) => a.expires.localeCompare(b.expires))[0];
  return {
    parentFirst: (g?.name || "Rachel").split(" ")[0], parentName: odF ? guardian(odF)?.name || "" : "", parentId: odF?.id || "", familyName: odF ? odF.surname + " family" : "",
    windowLabel: win?.label || "w/c 2 Nov", windowClose: win ? fmtDay(win.closes.slice(0, 10)) + " at " + win.closes.slice(11) : "", windowCloseTime: win?.closes.slice(11) || "18:00",
    lateFee: euro(s.config.lateFee), hoursBooked: String(ub?.booked ?? 12), hoursAgreed: String(ub?.agreed ?? 15),
    invoiceId: od?.id || "", amount: od ? euro(invoiceBalance(od)) : "", dueDate: od ? fmtDay(od.due) : "", daysOverdue: od ? String(daysBetween(od.due, TODAY)) : "",
    retryDate: fail ? fmtDay(addDays(fail.date, 5)) : "", instalment: plan ? euro(plan.instalments[1]?.amount || 0) : "",
    childFirst: awChild?.firstName || "Aoife", chickEnd: aw ? fmtDay(aw.expires) : "",
    claimId: cl?.id || "", amountNcs: cl ? euro(cl.amount) : "", claimDeadline: cl ? cl.deadline.slice(11) + " " + fmtDay(cl.deadline.slice(0, 10)) : "",
    enquiryParent: enq?.parent.split(" ")[0] || "", locationName: idx().loc.get(enq?.locationId || "HAZ")?.short || "Hazelbrook", lastWeek: "w/c " + fmtDate(addDays(TODAY, 56)),
    staffFirst: staffAlert?.name.split(" ")[0] || "", certKind: cert?.kind || "First aid", certExpiry: cert ? fmtDay(cert.expires) : "",
  };
}
const fill = (t: string, vars: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? "{" + k + "}");
const varsIn = (t: string) => Array.from(new Set(Array.from(t.matchAll(/\{(\w+)\}/g)).map(m => m[1])));
function templateFor(s: RosState, id: string) {
  const o = (ext(s).autoTemplates || {})[id];
  const d = TEMPLATES[id] || { subject: "", body: "" };
  return { subject: o?.subject ?? d.subject, body: o?.body ?? d.body, override: o };
}

/* ---------------- schedule derivation ---------------- */
type PlannedRun = { date: string; time: string; a: AutomationRule; n: number | null; note: string };
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const windowDays = () => Array.from({ length: 7 }, (_, i) => addDays(TODAY, i));
function plannedRuns(s: RosState): { runs: PlannedRun[]; event: AutomationRule[] } {
  const days = windowDays(), runs: PlannedRun[] = [], event: AutomationRule[] = [];
  const win = s.windows.find(w => w.status === "Open");
  const unpaid = s.invoices.filter(i => { const st = invoiceStatus(i); return (st === "Overdue" || st === "Due") && inScope(family(i.familyId)?.locationId); });
  const offsetCount = (d: string, offsets: number[]) => unpaid.filter(i => offsets.includes(daysBetween(i.due, d))).length;
  const counter = (a: AutomationRule, d: string): number | null => {
    switch (a.id) {
      case "AU-04": return underbooked().length;
      case "AU-05": return offsetCount(d, s.config.reminderDays);
      case "AU-06": return offsetCount(d, [s.config.blockDay]);
      case "AU-07": return offsetCount(d, [s.config.phoneDay]);
      case "AU-09": return s.plans.filter(p => p.status === "Active").reduce((n, p) => n + p.instalments.filter(i => i.due === addDays(d, 1) && i.status !== "Paid").length, 0);
      case "AU-10": return s.awards.filter(x => [30, 14, 7].includes(daysBetween(d, x.expires))).length;
      case "AU-13": return d < "2026-10-26" ? s.campRegs.filter(r => !r.paid).length : 0;
      case "AU-16": return s.children.filter(c => c.dob.slice(5) === d.slice(5) && inScope(c.locationId)).length;
      case "AU-18": return s.staff.reduce((n, x) => n + x.certs.filter(c => [60, 30, 7].includes(daysBetween(d, c.expires))).length, 0);
      default: return null;
    }
  };
  for (const a of s.automations) {
    const t = a.timing;
    let m: RegExpMatchArray | null;
    if (/^On event/i.test(t) || /^Same day/i.test(t)) { event.push(a); continue; }
    if ((m = t.match(/^(?:Weekly )?(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (\d\d:\d\d)$/))) {
      for (const d of days) if (WEEKDAY[new Date(d + "T00:00:00Z").getUTCDay()] === m[1]) runs.push({ date: d, time: m[2], a, n: counter(a, d), note: a.audience });
      continue;
    }
    if ((m = t.match(/^Daily (\d\d:\d\d)( while window open)?/))) {
      const until = m[2] && win ? win.closes.slice(0, 10) : "9999";
      for (const d of days) if (d <= until) runs.push({ date: d, time: m[1], a, n: counter(a, d), note: a.audience });
      continue;
    }
    if (/^Day 0 · 2 · 5 · 7/.test(t)) { for (const d of days) { const n = counter(a, d); if (n) runs.push({ date: d, time: "08:00", a, n, note: "invoices reaching Day " + s.config.reminderDays.join(", ") }); } continue; }
    if (/^Retry Day 2 and Day 5/.test(t)) {
      for (const p of s.payments.filter(x => x.status === "Failed" && !(x.retry || "").startsWith("Retried"))) for (const k of [2, 5]) { const d = addDays(p.date, k); if (days.includes(d)) runs.push({ date: d, time: "10:00", a, n: 1, note: "Day " + k + " retry · " + (p.invoiceId || p.id) + " · " + euro(p.amount) }); }
      continue;
    }
    if (/^Day 2 · 4 · 6/.test(t)) {
      for (const c of claimsPending()) for (const k of [2, 4, 6]) { const d = addDays(c.raised, k); if (days.includes(d) && !c.reminders.some(r => r.day === k)) runs.push({ date: d, time: "09:00", a, n: 1, note: "Day " + k + " · " + c.id }); }
      continue;
    }
    if (/^Day 1 · 3 · 7 · 14/.test(t)) {
      for (const e of s.enquiries.filter(x => x.stage !== "Enrolled" && x.stage !== "Started" && inScope(x.locationId))) for (const k of [1, 3, 7, 14]) { const d = addDays(e.received, k); if (days.includes(d)) runs.push({ date: d, time: "10:00", a, n: 1, note: "Day " + k + " · " + e.id }); }
      continue;
    }
    if (/^60 · 30 · 7 days/.test(t)) { for (const d of days) runs.push({ date: d, time: "07:00", a, n: counter(a, d), note: "certificates at 60, 30 or 7 days" }); continue; }
    event.push(a);
  }
  // Group per-item runs (claims, retries, enquiries) into one run per sequence per slot.
  const merged = new Map<string, PlannedRun>();
  for (const r of runs) {
    const k = r.date + "|" + r.time + "|" + r.a.id;
    const prev = merged.get(k);
    if (prev) { prev.n = (prev.n || 0) + (r.n || 0); prev.note = prev.note + "; " + r.note; } else merged.set(k, { ...r });
  }
  return { runs: Array.from(merged.values()).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time)), event };
}

/* ---------------- exceptions ---------------- */
type Exc = { key: string; a: AutomationRule; at: string; kind: "Run" | "Paused" | "Review"; title: string; detail: string; tone: Tone; fix?: { label: string; go: () => void }[] };
function exceptions(s: RosState): { open: Exc[]; reviewed: (Exc & { by: string })[] } {
  const acks = ext(s).autoAcks || {};
  const out: Exc[] = [];
  for (const a of s.automations) {
    const bad = a.runs.find(r => r.result !== "ok");
    if (bad && a.runs[0] === bad) {
      const fix: Exc["fix"] = [];
      if (a.id === "AU-08") fix.push({ label: "Open failed payments", go: () => nav("Billing", "Payments & Reconciliation") });
      if (a.id === "AU-18") {
        const st = certAlerts().expired.find(x => x.certs.some(c => c.kind === "Garda vetting" && c.expires < TODAY));
        if (st) fix.push({ label: "Open " + st.name, go: () => openRecord({ kind: "staff", id: st.id }) });
        fix.push({ label: "Staff certifications", go: () => nav("Staff", "Certifications") });
      }
      fix.push({ label: "Sequence", go: () => openRecord({ kind: "automation", id: a.id }) });
      out.push({ key: a.id + "|" + bad.at, a, at: bad.at, kind: "Run", title: a.name + ": " + (bad.result === "failed" ? "run failed" : "partial run"), detail: bad.summary, tone: bad.result === "failed" ? "bad" : "warn", fix });
    }
    if (!a.on) out.push({ key: a.id + "|paused", a, at: "", kind: "Paused", title: a.name + " is paused", detail: "No " + a.audience.toLowerCase() + " will hear from this sequence until it is resumed.", tone: "warn" });
    const review = s.tasks.filter(t => t.status !== "Done" && t.link?.kind === "automation" && t.link.id === a.id);
    if (review.length) out.push({ key: a.id + "|review|" + review.map(t => t.id).join(","), a, at: "", kind: "Review", title: review.length + " item" + (review.length > 1 ? "s" : "") + " from " + a.name + " waiting for a person", detail: a.approval + ". Review in Work before anything goes out.", tone: "info" });
  }
  return {
    open: out.filter(e => !(e.kind === "Run" && acks[e.key])),
    reviewed: out.filter(e => e.kind === "Run" && acks[e.key]).map(e => ({ ...e, by: acks[e.key] })),
  };
}

const MODULE_FOR: Record<string, [string, string]> = {
  Bookings: ["Bookings", "Window Control"], NCS: ["NCS", "Overview"], Collections: ["Billing", "Reminder Stages"], Compliance: ["Compliance", "Overview"],
  Camps: ["Camps", "Registrations"], Enrolment: ["Enrolment", "Lead Pipeline"], Families: ["Families", "Directory"], HR: ["Staff", "Certifications"],
};
const approvalTone = (x: AutomationRule["approval"]): Tone => x === "Automatic" ? "ok" : x === "Approval required" ? "warn" : "info";
const rate = (n: number, d: number) => (d ? n / d : 0);

/* ---------------- page ---------------- */
const SUBS: Record<string, string> = {
  Overview: "Every follow-up the business runs, whether it is on, how it is doing, and what is waiting for a person.",
  Sequences: "Each sequence as a rule: trigger, timing, audience, channels, owner and approval mode. Runs are demo runs.",
  "Scheduled Runs": "What runs in the next seven days, derived from each sequence's timing and the records it acts on.",
  Exceptions: "Partial or failed runs, paused sequences and items waiting for review, with a link to fix each one.",
  Templates: "The wording each sequence sends, with variables filled from live sample records.",
  Results: "Delivered, opened and actioned for every sequence. Demo counters that move when a sequence runs.",
};
export default function Automations({ tab }: { tab: string }) {
  let body: ReactNode;
  if (tab === "Sequences") body = <Sequences />;
  else if (tab === "Scheduled Runs") body = <Scheduled />;
  else if (tab === "Exceptions") body = <Exceptions />;
  else if (tab === "Templates") body = <Templates />;
  else if (tab === "Results") body = <Results />;
  else body = <Overview />;
  return (
    <Page>
      <PageHead eyebrow="Automations & Follow-ups" title={tab} sub={SUBS[tab] || SUBS.Overview} right={<DemoTag title="Runs are simulated. Nobody is emailed, texted or notified.">Simulated runs · nobody contacted</DemoTag>} />
      {body}
    </Page>
  );
}

function RunBtn({ a, size = "sm" }: { a: AutomationRule; size?: "sm" | "md" }) {
  const { role } = useRos();
  return <Btn size={size} variant="primary" disabled={!a.on || role.id === "parent"} title={a.on ? "Run once now in demo mode" : "Resume the sequence to run it"}
    onClick={() => confirmThen({ title: "Run “" + a.name + "” now?", body: "Demo run: metrics, Activity" + (a.approval !== "Automatic" ? " and a review task in Work" : "") + " update. " + (a.approval === "Draft only" ? "Messages are prepared as drafts only. " : a.approval === "Approval required" ? "Items are queued for approval. " : "") + "Nobody is contacted.", confirmLabel: "Run (demo)", run: () => runAutomation({ id: a.id }) })}>Run sequence</Btn>;
}

/* ================= Overview ================= */
function Overview() {
  const { s } = useRos();
  const A = s.automations;
  const on = A.filter(a => a.on).length;
  const del = A.reduce((n, a) => n + a.delivered, 0), op = A.reduce((n, a) => n + a.opened, 0), act = A.reduce((n, a) => n + a.actioned, 0);
  const exc = exceptions(s);
  const reviewTasks = s.tasks.filter(t => t.status !== "Done" && t.link?.kind === "automation");
  const agentApprovals = s.approvals.filter(a => a.status === "Pending" && a.agentId);
  const groups = useMemo(() => Array.from(new Set(A.map(a => a.group))), [A]);
  const lastRuns = A.flatMap(a => a.runs.map(r => ({ a, r }))).sort((x, y) => y.r.at.localeCompare(x.r.at)).slice(0, 8);
  const { runs } = plannedRuns(s);
  const nowKey = TODAY + " " + hm(s.clockMin);
  const next = runs.filter(r => r.a.on && r.date + " " + r.time > nowKey).slice(0, 6);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Grid min={160} gap={12}>
        <Kpi label="Sequences" value={A.length} sub={groups.length + " areas of the business"} onClick={() => setTab("Automations", "Sequences")} />
        <Kpi label="On" value={on} sub={(A.length - on) + " paused"} tone={A.length - on ? "warn" : "ok"} onClick={() => setTab("Automations", "Sequences")} />
        <Kpi label="Delivered" value={del.toLocaleString("en-IE")} sub="all time, demo counters" onClick={() => setTab("Automations", "Results")} />
        <Kpi label="Opened" value={pct(rate(op, del))} sub={op.toLocaleString("en-IE") + " opened"} tone="info" onClick={() => setTab("Automations", "Results")} />
        <Kpi label="Actioned" value={pct(rate(act, del))} sub={act.toLocaleString("en-IE") + " acted on"} tone="ok" onClick={() => setTab("Automations", "Results")} />
        <Kpi label="Exceptions" value={exc.open.filter(e => e.kind === "Run").length} sub="partial or failed last run" tone={exc.open.some(e => e.kind === "Run") ? "warn" : "ok"} onClick={() => setTab("Automations", "Exceptions")} />
        <Kpi label="Waiting on a person" value={reviewTasks.length + agentApprovals.length} sub={agentApprovals.length + " approvals · " + reviewTasks.length + " review tasks"} tone={reviewTasks.length + agentApprovals.length ? "warn" : "ok"} onClick={() => nav("Agents", "Approvals")} />
      </Grid>
      <div className="ros-split">
        <Card title="By area" sub="Sequences on, and how often their messages lead to action.">
          {groups.map(g => {
            const list = A.filter(a => a.group === g);
            const d = list.reduce((n, a) => n + a.delivered, 0), x = list.reduce((n, a) => n + a.actioned, 0);
            const route = MODULE_FOR[g];
            return (
              <ListRow key={g} onClick={() => setTab("Automations", "Sequences")} title={<Row wrap gap={8}><span>{g}</span><Sub>{list.filter(a => a.on).length} of {list.length} on</Sub></Row>}
                sub={<div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ flex: 1, maxWidth: 220 }}><Bar value={rate(x, d)} max={1} tone="ok" /></div><span>{pct(rate(x, d))} actioned · {d} delivered</span></div>}
                right={route ? <Btn size="sm" variant="subtle" onClick={() => nav(route[0], route[1])}>Open {route[0]}</Btn> : undefined} />
            );
          })}
        </Card>
        <Stack gap={16}>
          <Card title="Approval modes">
            <HBars items={(["Automatic", "Approval required", "Draft only"] as AutomationRule["approval"][]).map(m => ({ label: m, value: A.filter(a => a.approval === m).length, tone: approvalTone(m) }))} />
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--dim)", lineHeight: 1.55 }}>Anything that changes what a family is charged, blocks a booking or contacts a family about a sensitive matter is approval-required or draft-only.</div>
          </Card>
          <Card title="Next runs" right={<Btn size="sm" variant="subtle" onClick={() => setTab("Automations", "Scheduled Runs")}>Schedule</Btn>}>
            {next.length ? next.map((r, i) => <ListRow key={i} title={r.a.name} sub={(r.date === TODAY ? "Today" : fmtDay(r.date)) + " " + r.time + (r.n !== null ? " · " + r.n + " expected" : "") } right={<Badge tone={approvalTone(r.a.approval)}>{r.a.approval}</Badge>} />) : <Empty title="Nothing scheduled" />}
          </Card>
        </Stack>
      </div>
      <div className="ros-split-even">
        <Card title="Latest runs">
          <Timeline items={lastRuns.map(({ a, r }) => ({ at: rel(r.at), title: a.name, detail: r.summary, tone: (r.result === "ok" ? "ok" : r.result === "partial" ? "warn" : "bad") as Tone, right: <RecLink r={{ kind: "automation", id: a.id }} /> }))} />
        </Card>
        <Card title="Waiting on a person" sub="Review tasks from draft-only and approval sequences, and approvals raised by agents.">
          {reviewTasks.map(t => <TaskRow key={t.id} id={t.id} />)}
          {agentApprovals.map(a => <ListRow key={a.id} onClick={() => openRecord({ kind: "approval", id: a.id })} title={a.title} sub={a.kind + " · " + a.requestedBy + " · " + rel(a.requestedAt)} right={<StatusBadge s={a.status} />} />)}
          {!reviewTasks.length && !agentApprovals.length && <Empty title="Nothing waiting" />}
        </Card>
      </div>
    </div>
  );
}

/* ================= Sequences ================= */
function Sequences() {
  const { s, role } = useRos();
  const groups = useMemo(() => ["All", ...Array.from(new Set(s.automations.map(a => a.group)))], [s.automations]);
  const [g, setG] = useState("All");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string>("AU-11");
  const list = s.automations.filter(a => (g === "All" || a.group === g) && (!q.trim() || (a.name + " " + a.trigger + " " + a.audience + " " + a.id).toLowerCase().includes(q.trim().toLowerCase())));
  const a = s.automations.find(x => x.id === sel) || list[0];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Row wrap gap={10}>
        <Seg size="sm" value={g} onChange={setG} options={groups} />
        <Search value={q} onChange={setQ} placeholder="Search sequences" width={220} />
      </Row>
      <div className="ros-split">
        <Card pad={false}>
          {list.map(x => {
            const last = x.runs[0];
            return (
              <div key={x.id} className="ros-row-hover" onClick={() => setSel(x.id)}
                style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "13px 16px", borderBottom: "1px solid var(--border)", cursor: "pointer", boxShadow: a?.id === x.id ? "inset 3px 0 0 var(--accent)" : undefined, opacity: x.on ? 1 : 0.7 }}>
                <div style={{ paddingTop: 2 }}><Toggle on={x.on} onChange={() => role.id !== "parent" && toggleAutomation({ id: x.id })} label={(x.on ? "Pause " : "Resume ") + x.name} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Row wrap gap={8}><span style={{ fontSize: 13.5, fontWeight: 600 }}>{x.name}</span><Sub>{x.id}</Sub><Badge>{x.group}</Badge><Badge tone={approvalTone(x.approval)}>{x.approval}</Badge></Row>
                  <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 4, lineHeight: 1.5 }}><b style={{ color: "var(--body)", fontWeight: 500 }}>When</b> {x.trigger.toLowerCase()} · <b style={{ color: "var(--body)", fontWeight: 500 }}>at</b> {x.timing} · <b style={{ color: "var(--body)", fontWeight: 500 }}>to</b> {x.audience.toLowerCase()} · <b style={{ color: "var(--body)", fontWeight: 500 }}>via</b> {x.channels.join(", ")} · <b style={{ color: "var(--body)", fontWeight: 500 }}>owner</b> {x.owner}</div>
                  <Row wrap gap={8} style={{ marginTop: 6 }}><Badge tone={last.result === "ok" ? "ok" : last.result === "partial" ? "warn" : "bad"}>Last run {rel(last.at)}</Badge><Sub>{x.delivered} delivered · {pct(rate(x.actioned, x.delivered))} actioned</Sub></Row>
                </div>
                <div style={{ flex: "none" }}><RunBtn a={x} /></div>
              </div>
            );
          })}
          {!list.length && <Empty title="No sequences match" />}
        </Card>
        {a ? <SequenceDetail a={a} /> : <Card><Empty title="Pick a sequence" /></Card>}
      </div>
    </div>
  );
}
function SequenceDetail({ a }: { a: AutomationRule }) {
  const { s, role } = useRos();
  const route = MODULE_FOR[a.group];
  const tpl = templateFor(s, a.id);
  const vars = sampleVars(s);
  const block = (k: string, v: ReactNode, tone?: Tone) => (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 12px", borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <span style={{ flex: "none", width: 64, fontSize: 10.5, fontWeight: 600, letterSpacing: ".08em", color: tone === "warn" ? "var(--warn)" : "var(--accent)", paddingTop: 2 }}>{k}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--ink)", lineHeight: 1.45 }}>{v}</span>
    </div>
  );
  return (
    <Stack gap={16}>
      <Card title={a.name} sub={a.id + " · " + a.group} right={<><StatusBadge s={a.on ? "Active" : "Paused"} /><RecLink r={{ kind: "automation", id: a.id }} /></>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {block("WHEN", a.trigger)}
          {block("AT", a.timing)}
          {block("TO", a.audience)}
          {block("VIA", <Row wrap gap={6}>{a.channels.map(c => <Badge key={c} tone="info">{c}</Badge>)}</Row>)}
          {block("THEN", a.approval === "Automatic" ? "Sends automatically (simulated in the demo)" : a.approval === "Approval required" ? "Queues each item for a person to approve" : "Prepares drafts only; a person reviews and sends", a.approval === "Automatic" ? undefined : "warn")}
          {block("OWNER", a.owner)}
        </div>
        <Row wrap gap={8} style={{ marginTop: 12 }}>
          <RunBtn a={a} size="md" />
          <Btn disabled={role.id === "parent"} onClick={() => toggleAutomation({ id: a.id })}>{a.on ? "Pause" : "Resume"}</Btn>
          {route && <Btn variant="subtle" onClick={() => nav(route[0], route[1])}>Open {route[0]}</Btn>}
        </Row>
      </Card>
      <Card title="Results">
        <Grid min={110} gap={10}>
          <Kpi label="Delivered" value={a.delivered} />
          <Kpi label="Opened" value={pct(rate(a.opened, a.delivered))} sub={a.opened + ""} tone="info" />
          <Kpi label="Actioned" value={pct(rate(a.actioned, a.delivered))} sub={a.actioned + ""} tone="ok" />
        </Grid>
        <div style={{ marginTop: 12 }}><Label style={{ marginBottom: 8 }}>Runs</Label>
          <Timeline items={a.runs.slice(0, 6).map(r => ({ at: rel(r.at), title: r.summary, tone: (r.result === "ok" ? "ok" : r.result === "partial" ? "warn" : "bad") as Tone }))} />
        </div>
      </Card>
      {tpl.body && (
        <Card title="Message" sub={tpl.override ? "Edited by " + tpl.override.by + " · " + rel(tpl.override.at) : "Standard wording"} right={<Btn size="sm" variant="subtle" onClick={() => setTab("Automations", "Templates")}>Edit template</Btn>}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{fill(tpl.subject, vars)}</div>
          <div style={{ fontSize: 12.5, color: "var(--body)", marginTop: 6, lineHeight: 1.6 }}>{fill(tpl.body, vars)}</div>
          <div style={{ marginTop: 8 }}><Sub>Filled from live sample records.</Sub></div>
        </Card>
      )}
    </Stack>
  );
}

/* ================= Scheduled Runs ================= */
function Scheduled() {
  const { s, v } = useRos();
  const { runs, event } = useMemo(() => plannedRuns(s), [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const [onlyOn, setOnlyOn] = useState(true);
  const days = windowDays();
  const nowKey = TODAY + " " + hm(s.clockMin);
  const shown = runs.filter(r => !onlyOn || r.a.on);
  const ranToday = (r: PlannedRun) => r.date === TODAY && r.a.runs.some(x => x.at.startsWith(TODAY) && x.at.slice(11) >= r.time);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Row wrap gap={10}>
        <Seg size="sm" value={onlyOn ? "on" : "all"} onChange={(x) => setOnlyOn(x === "on")} options={[["on", "Sequences that are on"], ["all", "Include paused"]]} />
        <Sub>{shown.length} runs between {fmtDay(days[0])} and {fmtDay(days[6])} · counts are what each run would pick up from today's records</Sub>
      </Row>
      <div className="ros-scroll-x">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(170px,1fr))", gap: 10, minWidth: 1220 }}>
          {days.map(d => {
            const list = shown.filter(r => r.date === d);
            return (
              <div key={d} style={{ background: "var(--surface)", border: "1px solid " + (d === TODAY ? "var(--accent-line)" : "var(--border)"), borderRadius: 16, padding: 10, minWidth: 0 }}>
                <Row gap={6} style={{ marginBottom: 8 }}><span style={{ fontSize: 12.5, fontWeight: 600, color: d === TODAY ? "var(--accent)" : "var(--ink)" }}>{d === TODAY ? "Today" : dow(d)}</span><Sub>{fmtDate(d)}</Sub><span style={{ flex: 1 }} /><Badge>{list.length}</Badge></Row>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {list.map((r, i) => {
                    const past = d + " " + r.time <= nowKey;
                    return (
                      <button key={i} className="ros-focus" onClick={() => openRecord({ kind: "automation", id: r.a.id })} title={r.note}
                        style={{ textAlign: "left", border: "1px solid var(--border)", borderRadius: 10, padding: "7px 9px", background: past ? "transparent" : "var(--surface-2)", color: "var(--ink)", cursor: "pointer", opacity: r.a.on ? (past ? 0.6 : 1) : 0.45 }}>
                        <Row gap={6}><span style={{ fontSize: 11.5, fontVariantNumeric: "tabular-nums", color: "var(--accent)", fontWeight: 600 }}>{r.time}</span><span style={{ flex: 1 }} />{!r.a.on ? <Badge>Paused</Badge> : past ? <Badge tone={ranToday(r) ? "ok" : "neutral"}>{ranToday(r) ? "Ran" : "Due"}</Badge> : r.n !== null ? <Badge tone={r.n ? "info" : "neutral"}>{r.n}</Badge> : null}</Row>
                        <div style={{ fontSize: 12, marginTop: 3, lineHeight: 1.35 }}>{r.a.name}</div>
                        <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.note}</div>
                      </button>
                    );
                  })}
                  {!list.length && <Sub>Nothing scheduled</Sub>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="ros-split">
        <Card pad={false} title="Next runs" sub="In time order from the demo clock.">
          <Table rows={shown.filter(r => r.date + " " + r.time > nowKey).slice(0, 30)} rowKey={r => r.date + r.time + r.a.id} onRow={r => openRecord({ kind: "automation", id: r.a.id })} minWidth={680} dense
            cols={[
              { key: "w", label: "When", w: "1fr", render: r => (r.date === TODAY ? "Today" : fmtDay(r.date)) + " " + r.time },
              { key: "a", label: "Sequence", w: "1.8fr", render: r => <Stack><span>{r.a.name}</span><Sub>{r.a.id} · {r.a.timing}</Sub></Stack> },
              { key: "n", label: "Picks up", w: "1.4fr", render: r => <Sub>{r.n !== null ? r.n + " · " : ""}{r.note}</Sub> },
              { key: "m", label: "Mode", w: "1fr", render: r => <Badge tone={approvalTone(r.a.approval)}>{r.a.approval}</Badge> },
            ] as Col<PlannedRun>[]} empty="Nothing else this week" />
        </Card>
        <Card title="Event-driven" sub="These run when something happens, not on a clock.">
          {event.map(a => <ListRow key={a.id} onClick={() => openRecord({ kind: "automation", id: a.id })} title={a.name} sub={a.trigger + " · " + a.timing + " · " + a.audience} right={<StatusBadge s={a.on ? "Active" : "Paused"} />} />)}
        </Card>
      </div>
    </div>
  );
}

/* ================= Exceptions ================= */
function Exceptions() {
  const { s, role } = useRos();
  const { open, reviewed } = exceptions(s);
  const failedPays = s.payments.filter(p => p.status === "Failed" && !(p.retry || "").startsWith("Retried")).length;
  const garda = certAlerts().expired.filter(x => x.certs.some(c => c.kind === "Garda vetting" && c.expires < TODAY));
  const live: Record<string, string> = { "AU-08": failedPays + " failed collection" + (failedPays === 1 ? "" : "s") + " still awaiting retry", "AU-18": garda.length + " staff blocked from the rota: " + garda.map(g => g.name).join(", ") };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Grid min={170} gap={12}>
        <Kpi label="Partial or failed runs" value={open.filter(e => e.kind === "Run").length} tone={open.some(e => e.kind === "Run") ? "warn" : "ok"} />
        <Kpi label="Paused sequences" value={open.filter(e => e.kind === "Paused").length} tone={open.some(e => e.kind === "Paused") ? "warn" : "ok"} />
        <Kpi label="Waiting for review" value={open.filter(e => e.kind === "Review").length} tone="info" />
        <Kpi label="Reviewed" value={reviewed.length} tone="ok" />
      </Grid>
      <Card title="Open exceptions" sub="Fix the cause in the linked screen, then mark the run reviewed. Reviewing does not hide the run history.">
        {open.length ? open.map(e => (
          <div key={e.key} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
            <Row wrap gap={8}>
              <Badge tone={e.tone}>{e.kind === "Run" ? "Run issue" : e.kind}</Badge>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{e.title}</span>
              <span style={{ flex: 1 }} />
              {e.at && <Sub>{rel(e.at)}</Sub>}
            </Row>
            <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 5, lineHeight: 1.5 }}>{e.detail}{live[e.a.id] && e.kind === "Run" ? ". Now: " + live[e.a.id] + "." : ""}</div>
            <Row wrap gap={8} style={{ marginTop: 8 }}>
              {(e.fix || []).map(f => <Btn key={f.label} size="sm" onClick={f.go}>{f.label}</Btn>)}
              {e.kind === "Paused" && <Btn size="sm" variant="primary" disabled={role.id === "parent"} onClick={() => toggleAutomation({ id: e.a.id })}>Resume</Btn>}
              {e.kind === "Review" && <Btn size="sm" onClick={() => nav("Work")}>Open Work</Btn>}
              {e.kind === "Run" && <Btn size="sm" variant="ok" disabled={role.id === "parent"} onClick={() => ackException({ id: e.a.id, at: e.at, note: e.detail + "." })}>Mark reviewed</Btn>}
            </Row>
          </div>
        )) : <Empty title="No open exceptions" body="Every sequence's last run succeeded and nothing is paused." />}
      </Card>
      {reviewed.length > 0 && (
        <Card title="Reviewed">
          {reviewed.map(e => <ListRow key={e.key} title={e.title} sub={e.detail + " · reviewed by " + e.by} right={<StatusBadge s="Resolved" />} />)}
        </Card>
      )}
    </div>
  );
}

/* ================= Templates ================= */
function Templates() {
  const { s, role } = useRos();
  const [sel, setSel] = useState<string>("AU-05");
  const [draft, setDraft] = useState<{ id: string; subject: string; body: string } | null>(null);
  const a = s.automations.find(x => x.id === sel)!;
  const tpl = templateFor(s, sel);
  const cur = draft && draft.id === sel ? draft : { id: sel, subject: tpl.subject, body: tpl.body };
  const vars = sampleVars(s);
  const used = varsIn(cur.subject + " " + cur.body);
  const unknown = used.filter(v => !(v in vars));
  const dirty = cur.subject !== tpl.subject || cur.body !== tpl.body;
  return (
    <div className="ros-split">
      <Card pad={false} title="Templates" sub="One per sequence. Variables in braces are filled at send time.">
        {s.automations.map(x => {
          const t = templateFor(s, x.id);
          return <ListRow key={x.id} onClick={() => { setSel(x.id); setDraft(null); }} tone={x.id === sel ? "accent" : undefined}
            title={<Row wrap gap={8}><span>{x.name}</span>{t.override && <Badge tone="warn">Edited</Badge>}</Row>}
            sub={x.channels.join(", ") + " · " + varsIn(t.subject + " " + t.body).length + " variables"} />;
        })}
      </Card>
      <Stack gap={16}>
        <Card title={a.name} sub={a.id + " · " + a.trigger + " · " + a.timing} right={<Row wrap gap={6}>{a.channels.map(c => <Badge key={c} tone="info">{c}</Badge>)}</Row>}>
          <Field label="Subject or first line">
            <input className="ros-input" value={cur.subject} disabled={role.id === "parent"} onChange={(e) => setDraft({ ...cur, subject: e.target.value })} />
          </Field>
          <div style={{ marginTop: 10 }}>
            <Field label="Message" hint={a.channels.includes("SMS") ? (fill(cur.body, vars).length + " characters with sample data · SMS splits after 160") : undefined}>
              <textarea className="ros-input" rows={6} value={cur.body} disabled={role.id === "parent"} onChange={(e) => setDraft({ ...cur, body: e.target.value })} />
            </Field>
          </div>
          <div style={{ marginTop: 10 }}>
            <Label style={{ marginBottom: 6 }}>Variables · click to add</Label>
            <Row wrap gap={6}>
              {Object.keys(vars).filter(k => TEMPLATES[sel] && varsIn(TEMPLATES[sel].subject + " " + TEMPLATES[sel].body).includes(k) || used.includes(k)).map(k => (
                <button key={k} className="ros-focus" onClick={() => setDraft({ ...cur, body: cur.body + " {" + k + "}" })} style={{ border: "1px dashed var(--accent-line)", background: "var(--accent-faint)", color: "var(--accent)", borderRadius: 999, height: 24, padding: "0 10px", fontSize: 11.5, cursor: "pointer", fontFamily: "var(--mono)" }}>{"{" + k + "}"}</button>
              ))}
            </Row>
            {unknown.length > 0 && <div style={{ marginTop: 8 }}><Callout tone="bad" title="Unknown variable">{unknown.map(u => "{" + u + "}").join(", ")} will not be filled. Use one of the variables above.</Callout></div>}
          </div>
          <Row wrap gap={8} style={{ marginTop: 12 }}>
            <Btn variant="primary" disabled={!dirty || unknown.length > 0 || !cur.body.trim() || role.id === "parent"} onClick={() => { saveTemplate({ id: sel, subject: cur.subject, body: cur.body }); setDraft(null); }}>Save template</Btn>
            {dirty && <Btn variant="subtle" onClick={() => setDraft(null)}>Discard changes</Btn>}
            {tpl.override && !dirty && <Btn variant="subtle" onClick={() => resetTemplate({ id: sel })}>Reset to standard</Btn>}
            <Btn onClick={() => testSend({ id: sel, channel: a.channels[0] || "Email" })}>Send test to me (simulated)</Btn>
          </Row>
          {tpl.override && <div style={{ marginTop: 10 }}><Sub>Last edited by {tpl.override.by} · {rel(tpl.override.at)}</Sub></div>}
        </Card>
        <Card title="Preview" sub="Filled from live records (for example the Kelly family, NCS-0091 and the oldest overdue invoice).">
          <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 14, background: "var(--surface-2)" }}>
            <Row gap={8}><Badge tone="info">{a.channels[0]}</Badge><Sub>From Ray of Sunshine</Sub></Row>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 8 }}>{fill(cur.subject, vars)}</div>
            <div style={{ fontSize: 13, color: "var(--body)", marginTop: 6, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{fill(cur.body, vars)}</div>
          </div>
          <div style={{ marginTop: 10 }}><KV cols={2} items={used.slice(0, 8).map(k => ["{" + k + "}", vars[k] || "not available"] as [string, string])} /></div>
        </Card>
      </Stack>
    </div>
  );
}

/* ================= Results ================= */
function Results() {
  const { s } = useRos();
  const [sort, setSort] = useState<"actioned" | "opened" | "delivered">("actioned");
  const rows = s.automations.slice().sort((a, b) => sort === "delivered" ? b.delivered - a.delivered : sort === "opened" ? rate(b.opened, b.delivered) - rate(a.opened, a.delivered) : rate(b.actioned, b.delivered) - rate(a.actioned, a.delivered));
  const groups = Array.from(new Set(s.automations.map(a => a.group)));
  const del = s.automations.reduce((n, a) => n + a.delivered, 0), op = s.automations.reduce((n, a) => n + a.opened, 0), act = s.automations.reduce((n, a) => n + a.actioned, 0);
  const cols: Col<AutomationRule>[] = [
    { key: "n", label: "Sequence", w: "2fr", sort: a => a.name, render: a => <Stack><span>{a.name}</span><Sub>{a.id} · {a.group} · {a.approval}</Sub></Stack> },
    { key: "d", label: "Delivered", w: ".8fr", align: "right", sort: a => a.delivered, render: a => a.delivered.toLocaleString("en-IE") },
    { key: "o", label: "Opened", w: ".9fr", align: "right", sort: a => rate(a.opened, a.delivered), render: a => <Stack><span style={{ textAlign: "right" }}>{pct(rate(a.opened, a.delivered))}</span><Sub>{a.opened}</Sub></Stack> },
    { key: "x", label: "Actioned", w: ".9fr", align: "right", sort: a => rate(a.actioned, a.delivered), render: a => <Stack><span style={{ textAlign: "right" }}>{pct(rate(a.actioned, a.delivered))}</span><Sub>{a.actioned}</Sub></Stack> },
    { key: "b", label: "Conversion", w: "1.4fr", render: a => <div style={{ width: "100%" }}><Bar value={rate(a.actioned, a.delivered)} max={1} tone={rate(a.actioned, a.delivered) >= 0.5 ? "ok" : rate(a.actioned, a.delivered) >= 0.25 ? "warn" : "bad"} /></div> },
    { key: "s", label: "Status", w: ".8fr", render: a => <StatusBadge s={a.on ? "Active" : "Paused"} /> },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Grid min={170} gap={12}>
        <Kpi label="Delivered" value={del.toLocaleString("en-IE")} sub="demo counters" />
        <Kpi label="Open rate" value={pct(rate(op, del), 1)} sub={op.toLocaleString("en-IE") + " opened"} tone="info" />
        <Kpi label="Action rate" value={pct(rate(act, del), 1)} sub={act.toLocaleString("en-IE") + " acted on"} tone="ok" />
        <Kpi label="Best performer" value={rows.slice().sort((a, b) => rate(b.actioned, b.delivered) - rate(a.actioned, a.delivered))[0]?.id || "n/a"} sub={rows.slice().sort((a, b) => rate(b.actioned, b.delivered) - rate(a.actioned, a.delivered))[0]?.name} />
      </Grid>
      <div className="ros-split">
        <Card title="Actioned per sequence" sub="Share of delivered messages that led to the action asked for: a booking, a payment, an accepted claim, a renewed CHICK.">
          <HBars format={(n) => pct(n)} max={1} items={s.automations.filter(a => a.delivered > 0).slice().sort((a, b) => rate(b.actioned, b.delivered) - rate(a.actioned, a.delivered)).map(a => ({ label: a.name, value: round2(rate(a.actioned, a.delivered)), sub: a.actioned + "/" + a.delivered, tone: (rate(a.actioned, a.delivered) >= 0.5 ? "ok" : rate(a.actioned, a.delivered) >= 0.25 ? "warn" : "bad") as Tone, onClick: () => openRecord({ kind: "automation", id: a.id }) }))} />
        </Card>
        <Card title="Delivered by area">
          <Columns height={140} data={groups.map(g => ({ label: g, value: s.automations.filter(a => a.group === g).reduce((n, a) => n + a.delivered, 0) }))} />
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--dim)", lineHeight: 1.55 }}>Booking reminders reach the most families; collections and NCS sequences are smaller but carry the money. Running a sequence adds to these counters.</div>
        </Card>
      </div>
      <Card pad={false} title="All sequences" right={<Seg size="sm" value={sort} onChange={setSort} options={[["actioned", "By action rate"], ["opened", "By open rate"], ["delivered", "By volume"]]} />}>
        <Table rows={rows} cols={cols} rowKey={a => a.id} onRow={a => openRecord({ kind: "automation", id: a.id })} minWidth={820} pageSize={30} />
      </Card>
    </div>
  );
}
