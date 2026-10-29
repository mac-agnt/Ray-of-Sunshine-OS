/* Billing & Collections. Booking-to-cash for all nine locations. Every figure
   here is derived from invoices, payments, plans and the bank feed through the
   shared selectors, so a count on this page always matches the table behind
   it. Card, wallet, SEPA, Stripe, the bank feed and accounting exports are
   simulated; fee amounts are demo values only. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { RosState, Invoice, Family, PaymentPlan, BankLine, Approval, Instalment, Tone } from "../types";
import { useRos, getState, openRecord, nav, confirmThen, defineAction, setTab } from "../store";
import {
  idx, cached, family, locById, guardian, invoiceTotal, invoicePaid, invoiceBalance, invoiceStatus, overdueInvoices,
  reminderStage, daysOverdue, familyDue, paymentStatus, agedDebt, weekFinance, revenueByLocation, collectionRate,
  inScope, scopedLocations, type InvStatus,
} from "../selectors";
import { TODAY, THIS_WEEK, addDays, daysBetween, fmtDate, fmtDay, fmtDateY, rel, euro, euro0, pct, round2 } from "../time";
import {
  Card, Kpi, Grid, Table, Badge, StatusBadge, Btn, RecLink, HBars, Columns, StackBar, KV, Callout, Seg, Search,
  ListRow, Timeline, DemoTag, Empty, Row, Stack, Sub, Label, Field, Bar, Page, PageHead, type Col,
} from "../ui";
import { PlanPanel, TaskRow } from "../records";
import { reconcile, ignoreBank, decideApproval } from "../actions";

/* ---------------- helpers ---------------- */
type ConfigExt = RosState["config"] & { reEnrolFee?: number };
const REENROL_DEFAULT = 40;
const sumLines = (inv: Invoice) => round2(inv.lines.reduce((n, l) => n + l.amount, 0));
const mondayOf = (d: string) => { const day = new Date(d + "T00:00:00Z").getUTCDay(); return addDays(d, -((day + 6) % 7)); };
const ROLE_LABEL: Record<string, string> = { owner: "Owner", ops: "Operations", accounts: "Accounts", ncs: "NCS admin", locmgr: "Location manager", practitioner: "Room leader", driver: "Driver", parent: "Parent" };
const canDecide = (a: Approval, roleId: string) =>
  a.status === "Pending" && (a.kind === "Debt collection pack" ? roleId === "owner" : roleId === "owner" || roleId === "ops" || a.ownerRole === roleId);
const STAGE_NAMES = ["Invoice issued", "Friendly reminder", "Second reminder", "Final warning", "Block candidate", "Phone follow-up", "Statement cycle", "Debt review"];
const BUCKET_LABEL: Record<string, string> = { "0–7": "0 to 7 days", "8–30": "8 to 30 days", "31–60": "31 to 60 days", "60+": "Over 60 days" };

function schedule(total: number, count: number, every: number, first: string) {
  const base = Math.floor((total / count) * 100) / 100;
  return Array.from({ length: count }, (_, i) => ({ n: i + 1, due: addDays(first, i * every), amount: i === count - 1 ? round2(total - base * (count - 1)) : base }));
}
function nextPlanId(s: RosState) { let n = 50 + s.plans.length; while (s.plans.some(p => p.id === "PLN-0" + n)) n++; return "PLN-0" + n; }
function nextApprovalId(s: RosState) { let n = 201 + s.approvals.length; while (s.approvals.some(a => a.id === "APR-" + n)) n++; return "APR-" + n; }
const balIn = (s: RosState, i: Invoice) => round2(Math.max(0, sumLines(i) - s.payments.filter(x => x.invoiceId === i.id && x.status === "Succeeded").reduce((n, x) => n + x.amount, 0)));

function csvCell(v: unknown) { const t = v === undefined || v === null ? "" : String(v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }
function downloadCsv(name: string, rows: (string | number | undefined)[][]) {
  const blob = new Blob([rows.map(r => r.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ---------------- billing actions (simulated, replayable) ---------------- */
const bulkRemind = defineAction<{ invoiceIds: string[]; stage: string }>("billing.bulkRemind", (s, p, ctx) => {
  const invs = p.invoiceIds.map(id => s.invoices.find(i => i.id === id)).filter((i): i is Invoice => !!i);
  if (!invs.length) return;
  for (const inv of invs) ctx.comm(inv.familyId, "Email + App", "out", p.stage + " for " + inv.id + " (" + euro(balIn(s, inv)) + "). Simulated, not sent.", "Collections agent");
  ctx.agent("collections", p.stage + ": " + invs.length + " reminder" + (invs.length > 1 ? "s" : "") + " logged on " + ctx.actor + "'s say-so (simulated)", "action", invs.length === 1 ? { kind: "invoice", id: invs[0].id } : undefined);
  ctx.log({ category: "Financial", title: p.stage + ": " + invs.length + " reminder" + (invs.length > 1 ? "s" : "") + " sent (simulated)", detail: invs.map(i => i.id).join(", ") + ". Logged to each family timeline. Nothing left the demo.", link: invs.length === 1 ? { kind: "invoice", id: invs[0].id } : undefined });
}, { toast: (p) => p.invoiceIds.length + " reminder" + (p.invoiceIds.length > 1 ? "s" : "") + " logged to family timelines (simulated)." });

const raiseBlock = defineAction<{ familyId: string; invoiceId: string }>("billing.raiseBlock", (s, p, ctx) => {
  const f = s.families.find(x => x.id === p.familyId), inv = s.invoices.find(i => i.id === p.invoiceId);
  if (!f || !inv || f.blocked) return;
  if (s.approvals.some(a => a.status === "Pending" && a.kind === "Booking block" && a.link?.id === f.id)) return;
  const id = nextApprovalId(s);
  s.approvals.push({ id, kind: "Booking block", status: "Pending", title: "Restrict new bookings: " + f.surname + " (" + f.id + ") · Day " + s.config.blockDay, summary: inv.id + " is past Day " + s.config.blockDay + " after Day 2, 5 and 7 reminders. Policy allows a booking restriction only with Accounts approval.", requestedBy: ctx.actor, requestedAt: ctx.now, ownerRole: "accounts", link: { kind: "family", id: f.id }, amount: balIn(s, inv), effect: "Blocks new bookings for this family until paid; current week unaffected", agentId: "collections" });
  ctx.agent("collections", "Block candidate raised for " + f.surname + " (" + inv.id + "); waiting on Accounts", "proposal", { kind: "approval", id });
  ctx.log({ category: "Financial", title: "Block candidate raised: " + f.surname, detail: inv.id + " · " + euro(balIn(s, inv)) + ". Accounts approval required before anything changes.", link: { kind: "approval", id }, locationId: f.locationId });
}, { toast: () => "Block candidate sent to Accounts for approval. Nothing is blocked yet." });

const phoneTask = defineAction<{ invoiceId: string }>("billing.phoneTask", (s, p, ctx) => {
  const inv = s.invoices.find(i => i.id === p.invoiceId); if (!inv) return;
  if (s.tasks.some(t => t.status !== "Done" && t.link?.kind === "invoice" && t.link.id === inv.id)) return;
  const f = s.families.find(x => x.id === inv.familyId)!;
  const g = f.guardians.find(x => x.primary) || f.guardians[0];
  s.tasks.push({ id: ctx.id("TSK"), title: "Phone " + g.name + ": " + inv.id + " " + euro(balIn(s, inv)) + " overdue", owner: "Paul Hennessy", due: "Today", dueDate: TODAY, priority: "Medium", department: "Accounts", status: "Not started", link: { kind: "invoice", id: inv.id }, source: "Collections agent", locationId: f.locationId });
  ctx.log({ category: "Financial", title: "Phone follow-up task: " + f.surname, detail: inv.id + " is past Day " + s.config.phoneDay + ". Task for Accounts.", link: { kind: "invoice", id: inv.id }, locationId: f.locationId });
}, { toast: () => "Phone task added to Work for Accounts." });

const sendStatement = defineAction<{ familyId: string }>("billing.statement", (s, p, ctx) => {
  const f = s.families.find(x => x.id === p.familyId); if (!f) return;
  ctx.comm(f.id, "Email", "out", "Statement of account sent (simulated, not sent)", "Accounts");
  ctx.log({ category: "Financial", title: "Statement sent (simulated): " + f.surname, detail: "Statement of account for " + f.id + " logged to the family timeline.", link: { kind: "family", id: f.id }, locationId: f.locationId });
}, { toast: () => "Statement logged to the family timeline (simulated)." });

const createPlan = defineAction<{ familyId: string; invoiceIds: string[]; count: number; every: number; firstDue: string }>("billing.createPlan", (s, p, ctx) => {
  const f = s.families.find(x => x.id === p.familyId); if (!f) return;
  if (s.plans.some(x => x.familyId === f.id && (x.status === "Active" || x.status === "Broken"))) return;
  const invs = p.invoiceIds.map(id => s.invoices.find(i => i.id === id)).filter((i): i is Invoice => !!i && i.familyId === f.id && !i.planId);
  const total = round2(invs.reduce((n, i) => n + balIn(s, i), 0));
  if (!invs.length || p.count < 2 || total <= 0) return;
  const id = nextPlanId(s);
  const instalments: Instalment[] = schedule(total, p.count, p.every, p.firstDue).map(x => ({ ...x, status: "Scheduled" }));
  s.plans.push({ id, familyId: f.id, total, revision: 1, maxRevisions: s.config.planMaxRevisions, status: "Active", esign: "Sent", instalments, started: TODAY, owner: ctx.actor, nextAction: "E-signature sent (simulated) · first instalment " + fmtDay(p.firstDue) });
  invs.forEach(i => { i.planId = id; });
  f.flags = Array.from(new Set(f.flags.concat("Payment plan")));
  ctx.comm(f.id, "Email", "out", "Payment plan " + id + " sent for e-signature: " + p.count + " × about " + euro(instalments[0].amount) + " (simulated)", "Accounts");
  ctx.agent("collections", "Plan " + id + " set up for " + f.surname + " by " + ctx.actor + ": " + euro(total) + " over " + p.count + " instalments", "action", { kind: "plan", id });
  ctx.log({ category: "Financial", title: "Payment plan created: " + id + " (" + f.surname + ")", detail: euro(total) + " over " + p.count + " instalments from " + fmtDay(p.firstDue) + ". " + invs.map(i => i.id).join(", ") + " move to On plan and leave the overdue list. E-sign sent (simulated).", link: { kind: "plan", id }, locationId: f.locationId });
}, { toast: () => "Plan created and sent for e-signature (simulated). Invoices moved to On plan.", undo: true });

const revisePlan = defineAction<{ planId: string; count: number; every: number; firstDue: string }>("billing.revisePlan", (s, p, ctx) => {
  const pl = s.plans.find(x => x.id === p.planId);
  if (!pl || pl.status !== "Active" || pl.revision >= pl.maxRevisions || p.count < 1) return;
  const paidIns = pl.instalments.filter(i => i.status === "Paid");
  const paid = s.payments.filter(x => x.planId === pl.id && x.status === "Succeeded").reduce((n, x) => n + x.amount, 0);
  const remaining = round2(pl.total - paid); if (remaining <= 0) return;
  const fresh: Instalment[] = schedule(remaining, p.count, p.every, p.firstDue).map((x, k) => ({ ...x, n: paidIns.length + k + 1, status: "Scheduled" }));
  pl.instalments = paidIns.concat(fresh); pl.revision += 1; pl.esign = "Sent";
  pl.nextAction = "Revision " + pl.revision + " of " + pl.maxRevisions + " sent for e-signature (simulated) · next instalment " + fmtDay(p.firstDue);
  const f = s.families.find(x => x.id === pl.familyId)!;
  ctx.comm(f.id, "Email", "out", "Revised plan " + pl.id + " (revision " + pl.revision + ") sent for e-signature (simulated)", "Accounts");
  ctx.log({ category: "Financial", title: "Plan revised: " + pl.id + " (" + f.surname + ")", detail: "Revision " + pl.revision + " of " + pl.maxRevisions + ". " + euro(remaining) + " over " + p.count + " instalments. A further revision will be blocked at the cap.", link: { kind: "plan", id: pl.id }, locationId: f.locationId });
}, { toast: () => "Plan revised and re-sent for e-signature (simulated).", undo: true });

const planSigned = defineAction<{ planId: string }>("billing.planSigned", (s, p, ctx) => {
  const pl = s.plans.find(x => x.id === p.planId); if (!pl || pl.esign === "Signed") return;
  pl.esign = "Signed";
  const nx = pl.instalments.find(i => i.status === "Scheduled" || i.status === "Due");
  pl.nextAction = "Signed · next instalment " + (nx ? fmtDay(nx.due) : "none due");
  ctx.log({ category: "Financial", title: "Plan e-signed (simulated): " + pl.id, detail: "Parent signature recorded in the demo.", link: { kind: "plan", id: pl.id } });
}, { toast: () => "E-signature recorded (simulated)." });

const planEscalate = defineAction<{ planId: string }>("billing.planEscalate", (s, p, ctx) => {
  const pl = s.plans.find(x => x.id === p.planId); if (!pl || pl.status !== "Active") return;
  const missed = pl.instalments.find(i => i.status === "Missed"); if (!missed) return;
  if (s.tasks.some(t => t.status !== "Done" && t.link?.kind === "plan" && t.link.id === pl.id)) return;
  const f = s.families.find(x => x.id === pl.familyId)!;
  const due = addDays(missed.due, 7);
  s.tasks.push({ id: ctx.id("TSK"), title: "Missed instalment follow-up: " + f.surname + " (" + pl.id + ", " + euro(missed.amount) + ")", owner: pl.owner, due: fmtDay(due), dueDate: due, priority: "High", department: "Accounts", status: "Not started", link: { kind: "plan", id: pl.id }, source: "Collections agent", locationId: f.locationId });
  ctx.agent("collections", "Escalated missed instalment on " + pl.id + " to Accounts (due " + fmtDay(due) + ")", "escalation", { kind: "plan", id: pl.id });
  ctx.log({ category: "Financial", title: "Missed instalment escalated: " + pl.id, detail: f.surname + " · " + euro(missed.amount) + " missed " + fmtDay(missed.due) + ". Accounts follow-up due " + fmtDay(due) + ".", link: { kind: "plan", id: pl.id }, locationId: f.locationId });
}, { toast: () => "Follow-up task raised for Accounts." });

const retryPayment = defineAction<{ paymentId: string }>("billing.retry", (s, p, ctx) => {
  const pay = s.payments.find(x => x.id === p.paymentId);
  if (!pay || pay.status !== "Failed" || (pay.retry || "").startsWith("Retried")) return;
  const inv = pay.invoiceId ? s.invoices.find(i => i.id === pay.invoiceId) : undefined;
  s.payments.push({ id: ctx.id("PAY"), familyId: pay.familyId, invoiceId: pay.invoiceId, date: TODAY, amount: pay.amount, method: "SEPA direct debit (retry, simulated)", status: "Succeeded", ref: "RETRY " + (inv?.id || pay.ref) });
  pay.retry = "Retried " + fmtDay(TODAY) + " · collected (simulated)";
  if (inv) inv.note = "Direct debit collected on retry (simulated)";
  ctx.comm(pay.familyId, "Email", "out", "Direct debit retried for " + (inv?.id || "invoice") + ": " + euro(pay.amount) + " collected (simulated)", "Collections agent");
  ctx.log({ category: "Financial", title: "Direct debit retry (simulated): " + (inv?.id || pay.id), detail: euro(pay.amount) + " collected in the demo. No bank was contacted.", link: inv ? { kind: "invoice", id: inv.id } : undefined });
}, { toast: () => "Retry simulated and collected. Overdue list and aged debt updated.", undo: true });

const sendPayLink = defineAction<{ invoiceId: string }>("billing.payLink", (s, p, ctx) => {
  const inv = s.invoices.find(i => i.id === p.invoiceId); if (!inv) return;
  ctx.comm(inv.familyId, "SMS + App", "out", "Card payment link for " + inv.id + " (" + euro(balIn(s, inv)) + "). Simulated, not sent.", "Collections agent");
  ctx.log({ category: "Financial", title: "Pay link sent (simulated): " + inv.id, detail: "Card / Apple Pay / Google Pay link. Not connected to Stripe in the demo.", link: { kind: "invoice", id: inv.id } });
}, { toast: () => "Pay link logged to the family timeline (simulated)." });

type FeeChange =
  | { target: "loc"; id: string; key: "hourlyRate" | "eyDayRate"; value: number }
  | { target: "config"; key: "lateFee" | "transportFee" | "noticeHours"; value: number }
  | { target: "camp"; id: string; key: "dayRate"; value: number }
  | { target: "ext"; key: "reEnrolFee"; value: number };
const setFees = defineAction<{ changes: FeeChange[] }>("billing.setFees", (s, p, ctx) => {
  const notes: string[] = [];
  for (const c of p.changes) {
    if (!(c.value >= 0) || c.value > 10000) continue;
    if (c.target === "loc") { const l = s.locations.find(x => x.id === c.id); if (!l) continue; notes.push(l.short + " " + (c.key === "hourlyRate" ? "SAC hourly" : "EY day") + " " + euro(l[c.key]) + " to " + euro(c.value)); l[c.key] = c.value; }
    else if (c.target === "config") { const old = s.config[c.key]; notes.push((c.key === "lateFee" ? "Late booking fee " : c.key === "transportFee" ? "Transport per run " : "Notice hours ") + old + " to " + c.value); s.config[c.key] = c.value; }
    else if (c.target === "camp") { const cp = s.camps.find(x => x.id === c.id); if (!cp) continue; notes.push(cp.name + " day rate " + euro(cp.dayRate) + " to " + euro(c.value)); cp.dayRate = c.value; }
    else { const cfg = s.config as ConfigExt; notes.push("Re-enrolment fee " + euro(cfg.reEnrolFee ?? REENROL_DEFAULT) + " to " + euro(c.value)); cfg.reEnrolFee = c.value; }
  }
  if (!notes.length) return;
  ctx.log({ category: "Financial", title: "Fee rules updated (demo only)", detail: notes.join(" · ") + ". Applies to new invoices only; existing invoices keep the rates they were issued with." });
}, { toast: () => "Fee rules saved (demo). New invoices use them; existing invoices are unchanged.", undo: true });

const logExport = defineAction<{ what: string; rows: number }>("billing.export", (_s, p, ctx) => {
  ctx.log({ category: "Financial", title: "Export downloaded: " + p.what, detail: p.rows + " rows · CSV generated in the browser. Nothing was sent to Xero, Sage or a bank." });
}, { toast: (p) => p.what + " downloaded (" + p.rows + " rows). Logged to Activity." });

/* ---------------- shared derived rows ---------------- */
type InvRow = { inv: Invoice; fam: Family; total: number; paid: number; bal: number; status: InvStatus; step: number; stage: string; week: string };
function invoiceRows(): InvRow[] {
  return cached("bill:rows", () => getState().invoices.filter(i => inScope(family(i.familyId)?.locationId)).map(inv => {
    const fam = family(inv.familyId)!, status = invoiceStatus(inv);
    const od = status === "Overdue" || status === "Debt review";
    const st = od ? reminderStage(inv) : { label: "", step: -1 };
    return { inv, fam, total: invoiceTotal(inv), paid: invoicePaid(inv), bal: invoiceBalance(inv), status, step: st.step, stage: st.label, week: mondayOf(inv.weekOf) };
  }));
}
const stageName = (step: number) => STAGE_NAMES[step] || "";

/* ---------------- page ---------------- */
const SUBS: Record<string, string> = {
  Overview: "Booking to cash across the group: what was invoiced, what came in, and what needs a person today.",
  Invoices: "Every invoice, searchable and filterable. Open any row to see the invoice as the parent sees it.",
  "Payments & Reconciliation": "Payment methods, failed collections and the overnight bank feed. Exact matches clear in one click; ambiguous ones need a person to confirm.",
  "Reminder Stages": "Day 0 through to debt review, with the invoices sitting at each stage and the decision each stage needs.",
  "Payment Plans": "Plans, instalments, revisions and the plan builder. At most three revisions; a third breach goes to the owner.",
  "Fee Rules": "The per-site fee schedule and the rules behind every invoice line. Demo values only, not quoted fees.",
  "Statements & Exports": "Family statements, CSV exports and the proposed accounting connection.",
};

export default function Billing({ tab }: { tab: string }) {
  const { role } = useRos();
  let body: ReactNode;
  if (!role.finance) body = <Card><Empty title="Billing detail is restricted" body="Switch role preview to Owner, Operations or Accounts to see invoices, payments and plans." /></Card>;
  else if (tab === "Invoices") body = <Invoices />;
  else if (tab === "Payments & Reconciliation") body = <Payments />;
  else if (tab === "Reminder Stages") body = <Stages />;
  else if (tab === "Payment Plans") body = <Plans />;
  else if (tab === "Fee Rules") body = <FeeRules />;
  else if (tab === "Statements & Exports") body = <Statements />;
  else body = <Overview />;
  return (
    <Page>
      <PageHead eyebrow="Billing & Collections" title={tab} sub={SUBS[tab] || SUBS.Overview} right={<DemoTag title="Payments, SEPA, Stripe, bank feeds and exports are simulated. Fee amounts are demo values.">Payments simulated · demo fees</DemoTag>} />
      {body}
    </Page>
  );
}

/* ---------------- approvals inline ---------------- */
function ApprovalInline({ a, extra }: { a: Approval; extra?: ReactNode }) {
  const { role } = useRos();
  const who = a.kind === "Debt collection pack" ? "owner" : a.ownerRole;
  const can = canDecide(a, role.id);
  return (
    <Card tone={a.status === "Pending" ? "warn" : a.status === "Approved" ? "ok" : undefined} title={a.title} sub={a.summary}
      right={<><RecLink r={{ kind: "approval", id: a.id }} /><StatusBadge s={a.status} /></>}>
      <KV items={[["Requested by", a.requestedBy + " · " + rel(a.requestedAt)], ["Decides", ROLE_LABEL[who]], ["On approval", a.effect], ["Amount", a.amount ? euro(a.amount) : "n/a"]]} />
      {extra}
      {a.status === "Pending" && (can ? (
        <Row wrap style={{ marginTop: 12 }}>
          <Btn variant="primary" onClick={() => confirmThen({ title: "Approve " + a.id + "?", body: a.effect + "." + (a.kind === "Debt collection pack" ? " This records the owner decision only. No referral, letter or third-party contact is sent." : ""), confirmLabel: "Approve", run: () => decideApproval({ id: a.id, decision: "Approved" }) })}>Approve</Btn>
          <Btn variant="danger" onClick={() => confirmThen({ title: "Decline " + a.id + "?", body: "Nothing changes downstream. The decision is logged to Activity.", confirmLabel: "Decline", danger: true, run: () => decideApproval({ id: a.id, decision: "Declined" }) })}>Decline</Btn>
        </Row>
      ) : <div style={{ marginTop: 12 }}><Sub>Waiting on the {ROLE_LABEL[who]} role. Switch role preview in the header to decide.</Sub></div>)}
      {a.status !== "Pending" && <div style={{ marginTop: 12 }}><Callout tone={a.status === "Approved" ? "ok" : "neutral"} title={a.status + " by " + (a.decidedBy || "")}>{rel(a.decidedAt || "")}</Callout></div>}
    </Card>
  );
}

/* ================= Overview ================= */
function Overview() {
  const { s } = useRos();
  const wf = weekFinance(), aged = agedDebt(), od = overdueInvoices();
  const blocked = s.families.filter(f => f.blocked && inScope(f.locationId));
  const plans = s.plans.filter(p => inScope(family(p.familyId)?.locationId));
  const active = plans.filter(p => p.status === "Active").length, broken = plans.filter(p => p.status === "Broken").length;
  const wkBk = cached("bill:wkbk", () => getState().bookings.filter(b => b.status === "Booked" && THIS_WEEK.includes(b.date) && inScope(b.locationId)).length);
  const win = s.windows.find(w => w.status === "Open");
  const winSubs = win ? win.submissions.filter(x => inScope(family(x.familyId)?.locationId)).length : 0;
  const rows = invoiceRows();
  const mix = cached("bill:mix", () => {
    const m: Record<string, number> = {};
    for (const r of rows) if (r.inv.weekOf === "2026-10-19" && r.total > 0) m[r.status] = round2((m[r.status] || 0) + r.total);
    return m;
  });
  const collLoc = cached("bill:collLoc", () => scopedLocations().map(l => ({ l, rate: collectionRate(l.id) })));
  const rev = revenueByLocation();
  const decisions = s.approvals.filter(a => a.status === "Pending" && ["Booking block", "Debt collection pack", "Credit adjustment", "Payment plan revision"].includes(a.kind) && (a.link?.kind !== "family" || inScope(family(a.link.id)?.locationId)));
  const finAct = s.activity.filter(e => e.category === "Financial" && inScope(e.locationId)).sort((a, b) => b.seq - a.seq).slice(0, 7);
  const odBal = round2(od.reduce((n, i) => n + invoiceBalance(i), 0));
  const steps: { n: number; label: string; value: string; sub: string; tone?: Tone; go: () => void }[] = [
    { n: 1, label: "Bookings", value: wkBk.toLocaleString("en-IE"), sub: "sessions booked this week", go: () => nav("Bookings", "Weekly Calendar") },
    { n: 2, label: "Window close", value: winSubs + " / " + s.families.filter(f => inScope(f.locationId) && !f.blocked).length, sub: (win ? win.label : "No open window") + " · closes Thu 22 Oct 18:00", go: () => nav("Bookings", "Window Control") },
    { n: 3, label: "Invoices", value: euro0(wf.invoiced), sub: wf.count + " issued for w/c 19 Oct", go: () => setTab("Billing", "Invoices") },
    { n: 4, label: "Payments", value: euro0(wf.collected), sub: euro0(wf.scheduled) + " scheduled by direct debit", tone: "ok", go: () => setTab("Billing", "Payments & Reconciliation") },
    { n: 5, label: "Reminders", value: od.length + " overdue", sub: euro(odBal) + " across the reminder stages", tone: od.length ? "warn" : "ok", go: () => setTab("Billing", "Reminder Stages") },
    { n: 6, label: "Plans", value: active + " active", sub: broken + " broken · owner decision", tone: broken ? "bad" : undefined, go: () => setTab("Billing", "Payment Plans") },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card title="Booking to cash" sub="Each step feeds the next. Click a step to open it." right={<Badge tone="info">w/c 19 Oct · live</Badge>}>
        <div className="ros-scroll-x">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(150px,1fr))", gap: 10, minWidth: 940 }}>
            {steps.map((st, i) => (
              <button key={st.n} className="ros-btn ros-focus" onClick={st.go}
                style={{ position: "relative", textAlign: "left", cursor: "pointer", background: "var(--surface-2)", border: "1px solid " + (st.tone === "bad" ? "var(--bad-soft)" : st.tone === "warn" ? "var(--warn-soft)" : "var(--border)"), borderRadius: 14, padding: "12px 14px", color: "var(--ink)", display: "flex", flexDirection: "column", gap: 5 }}>
                <Label>Step {st.n} · {st.label}</Label>
                <span style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-.5px", color: st.tone === "bad" ? "var(--bad)" : st.tone === "warn" ? "var(--warn)" : "var(--ink)" }}>{st.value}</span>
                <span style={{ fontSize: 11.5, color: "var(--dim)", lineHeight: 1.4 }}>{st.sub}</span>
                {i < steps.length - 1 && <span aria-hidden style={{ position: "absolute", right: -11, top: "50%", transform: "translateY(-50%)", color: "var(--faint)", fontSize: 13, zIndex: 1 }}>→</span>}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Grid min={170} gap={12}>
        <Kpi label="Invoiced this week" value={euro0(wf.invoiced)} sub={wf.count + " invoices · w/c 19 Oct"} onClick={() => setTab("Billing", "Invoices")} />
        <Kpi label="Collected this week" value={euro0(wf.collected)} sub={pct(wf.invoiced ? wf.collected / wf.invoiced : 0) + " of invoiced"} tone="ok" onClick={() => setTab("Billing", "Payments & Reconciliation")} />
        <Kpi label="Scheduled direct debit" value={euro0(wf.scheduled)} sub="collects Fri 23 Oct (simulated)" tone="info" onClick={() => setTab("Billing", "Payments & Reconciliation")} />
        <Kpi label="Outstanding this week" value={euro0(wf.outstanding)} sub="not yet paid or scheduled" tone={wf.outstanding > 0 ? "warn" : "ok"} onClick={() => setTab("Billing", "Invoices")} />
        <Kpi label="MTD collection rate" value={pct(wf.mtdRate, 1)} sub={euro0(wf.mtdCollected) + " of " + euro0(wf.mtdBilled)} onClick={() => setTab("Billing", "Statements & Exports")} />
        <Kpi label="Overdue invoices" value={od.length} sub={euro(odBal) + " overdue"} tone={od.length ? "bad" : "ok"} onClick={() => setTab("Billing", "Reminder Stages")} />
        <Kpi label="Aged debt" value={euro0(aged.total)} sub="unpaid past due, incl. plans" tone="warn" onClick={() => setTab("Billing", "Statements & Exports")} />
        <Kpi label="Booking-blocked accounts" value={blocked.length} sub={blocked.map(f => f.surname).join(", ") || "None"} tone={blocked.length ? "bad" : "ok"} onClick={() => setTab("Billing", "Reminder Stages")} />
        <Kpi label="Payment plans" value={active + " active · " + broken + " broken"} sub={plans.length + " plans in total"} tone={broken ? "warn" : "ok"} onClick={() => setTab("Billing", "Payment Plans")} />
      </Grid>

      <div className="ros-split">
        <Card title="Aged debt" sub="Unpaid balances past their due date, including plan invoices. Click a bucket for the overdue list.">
          <Columns height={130} format={euro0} data={Object.entries(aged.buckets).map(([k, v]) => ({ label: BUCKET_LABEL[k] || k, value: v, hint: (aged.counts[k] || 0) + " invoices · " + euro(v), tone: (k === "60+" ? "bad" : k === "31–60" ? "warn" : "accent") as Tone }))} />
          <Row wrap gap={8} style={{ marginTop: 6 }}>
            {Object.entries(aged.counts).map(([k, n]) => <Badge key={k} tone={k === "60+" ? "bad" : k === "31–60" ? "warn" : "neutral"}>{BUCKET_LABEL[k]}: {n}</Badge>)}
            <span style={{ flex: 1 }} />
            <Btn size="sm" onClick={() => nav("Billing", "Invoices", { billStatus: "Overdue@" + Date.now() })}>Open overdue list</Btn>
          </Row>
        </Card>
        <Card title="This week's invoices by status" sub="Gross invoice value for w/c 19 Oct, after NCS subsidy.">
          <StackBar height={12} parts={([["Paid", "ok"], ["Scheduled DD", "info"], ["Due", "warn"], ["Overdue", "bad"], ["On plan", "accent"], ["Debt review", "bad"]] as [string, Tone][]).filter(([k]) => mix[k]).map(([k, t]) => ({ label: k + " " + euro0(mix[k]), value: mix[k], tone: t }))} />
          <div style={{ marginTop: 14 }}>
            <KV items={[["NCS subsidy this week", euro(wf.subsidy)], ["Invoices this week", String(wf.count)]]} />
          </div>
        </Card>
      </div>

      <div className="ros-split-even">
        <Card title="Collection rate by location" sub="October to date: paid against billed, excluding direct debits not yet due.">
          <HBars format={(n) => pct(n, 1)} max={1} items={collLoc.map(x => ({ label: x.l.short, value: x.rate, tone: (x.rate < 0.85 ? "bad" : x.rate < 0.93 ? "warn" : "ok") as Tone, onClick: () => nav("Locations", "Overview", { locationId: x.l.id }) }))} />
        </Card>
        <Card title="Childcare revenue this week by location" sub="Positive invoice lines for w/c 19 Oct, before subsidy. Training courses are reported separately.">
          <HBars format={euro0} items={scopedLocations().map(l => ({ label: l.short, value: rev.get(l.id)?.revenue || 0, sub: (rev.get(l.id)?.children.size || 0) + " children" }))} />
        </Card>
      </div>

      <div className="ros-split">
        <Card title="Decisions waiting" sub="Financial approvals raised by the Collections agent and staff. Nothing changes until a person decides.">
          {decisions.length ? <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{decisions.map(a => <ApprovalInline key={a.id} a={a} />)}</div> : <Empty title="No financial decisions waiting" body="Block candidates, credits and debt reviews appear here." />}
        </Card>
        <Card title="Recent financial activity" right={<Btn size="sm" variant="subtle" onClick={() => nav("Activity")}>All activity</Btn>}>
          {finAct.length ? <Timeline items={finAct.map(e => ({ at: rel(e.at), title: e.title, detail: e.detail + " · " + e.actor, tone: (e.actorKind === "agent" ? "info" : e.actorKind === "system" ? "neutral" : "accent") as Tone, right: e.link ? <RecLink r={e.link} /> : undefined }))} /> : <Empty title="No financial activity yet" />}
        </Card>
      </div>
    </div>
  );
}

/* ================= Invoices ================= */
/* Navigation focus is read once per navigation: a value that has already
   been applied is not re-applied when the tab is revisited. */
let consumedFamilyFocus = "", consumedStatusFocus = "";
const focusValue = (raw?: string) => (raw || "").split("@")[0];
function Invoices() {
  const { s, ui, v } = useRos();
  const famFocus = ui.focus.familyId && ui.focus.familyId !== consumedFamilyFocus ? ui.focus.familyId : "";
  const statusFocus = ui.focus.billStatus && ui.focus.billStatus !== consumedStatusFocus ? focusValue(ui.focus.billStatus) : "";
  const [q, setQ] = useState(famFocus);
  const [status, setStatus] = useState<string>(statusFocus || "All");
  const [stage, setStage] = useState<string>("All");
  const [loc, setLoc] = useState<string>("ALL");
  const [week, setWeek] = useState<string>("All");
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (famFocus) consumedFamilyFocus = famFocus;
    if (statusFocus) consumedStatusFocus = ui.focus.billStatus || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const all = invoiceRows();
  const weeks = useMemo(() => Array.from(new Set(all.map(r => r.week))).sort().reverse().slice(0, 14), [all]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter(r => (status === "All" || r.status === status) && (stage === "All" || String(r.step) === stage) && (loc === "ALL" || r.fam.locationId === loc) && (week === "All" || r.week === week)
      && (!t || r.inv.id.toLowerCase().includes(t) || r.fam.id.toLowerCase().includes(t) || r.fam.surname.toLowerCase().includes(t)))
      .sort((a, b) => (b.inv.due.localeCompare(a.inv.due)) || a.inv.id.localeCompare(b.inv.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, q, status, stage, loc, week]);
  const counts = useMemo(() => { const m: Record<string, number> = {}; for (const r of all) m[r.status] = (m[r.status] || 0) + 1; return m; }, [all]);
  const selectable = rows.filter(r => r.status === "Overdue");
  const selRows = all.filter(r => sel.has(r.inv.id) && r.status === "Overdue");
  const toggle = (id: string) => setSel(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const stageLabel = stage !== "All" && +stage <= 3 ? "Day " + s.config.reminderDays[+stage] + " " + stageName(+stage).toLowerCase() : "Payment reminder";
  const cols: Col<InvRow>[] = [
    { key: "sel", label: "", w: "38px", render: r => r.status === "Overdue" ? <input type="checkbox" aria-label={"Select " + r.inv.id} checked={sel.has(r.inv.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(r.inv.id)} style={{ accentColor: "var(--accent)", width: 15, height: 15 }} /> : null },
    { key: "id", label: "Invoice", w: "1fr", sort: r => r.inv.id, render: r => <RecLink r={{ kind: "invoice", id: r.inv.id }} /> },
    { key: "fam", label: "Family", w: "1.5fr", sort: r => r.fam.surname, render: r => <Stack><span>{r.fam.surname}</span><Sub>{r.fam.id} · {locById(r.fam.locationId)?.short}</Sub></Stack> },
    { key: "wk", label: "Week of", w: ".8fr", sort: r => r.week, render: r => fmtDate(r.week) },
    { key: "due", label: "Due", w: ".8fr", sort: r => r.inv.due, render: r => fmtDate(r.inv.due) },
    { key: "tot", label: "Total", w: ".8fr", align: "right", sort: r => r.total, render: r => euro(r.total) },
    { key: "bal", label: "Balance", w: ".8fr", align: "right", sort: r => r.bal, render: r => <span style={{ color: r.bal > 0 && (r.status === "Overdue" || r.status === "Debt review") ? "var(--bad)" : "var(--ink)" }}>{euro(r.bal)}</span> },
    { key: "st", label: "Status", w: "1fr", sort: r => r.status, render: r => <StatusBadge s={r.status} /> },
    { key: "stage", label: "Reminder stage", w: "1.4fr", sort: r => r.step, render: r => r.step >= 0 ? <Stack><span style={{ fontSize: 12.5 }}>{stageName(r.step)}</span><Sub>{r.step === 7 ? "owner decision" : daysOverdue(r.inv) + " days overdue"}</Sub></Stack> : <Sub>{r.inv.planId ? "Plan " + r.inv.planId : "n/a"}</Sub> },
  ];
  const totBal = round2(rows.reduce((n, r) => n + r.bal, 0)), totInv = round2(rows.reduce((n, r) => n + r.total, 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card pad={false}>
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <Seg size="sm" value={status} onChange={(x) => { setStatus(x); setSel(new Set()); }} options={(["All", "Overdue", "Debt review", "Due", "Scheduled DD", "On plan", "Paid", "Nil"] as string[]).map(x => [x, x + (x === "All" ? " " + all.length : counts[x] ? " " + counts[x] : " 0")] as [string, string])} />
          <Row wrap gap={8}>
            <Search value={q} onChange={setQ} placeholder="Invoice, Parent ID or surname" width={250} />
            <select aria-label="Reminder stage" className="ros-input" value={stage} onChange={(e) => setStage(e.target.value)} style={{ width: "auto", height: 34 }}>
              <option value="All">All stages</option>
              {STAGE_NAMES.map((n, i) => <option key={i} value={String(i)}>{n}</option>)}
            </select>
            <select aria-label="Location" className="ros-input" value={loc} onChange={(e) => setLoc(e.target.value)} style={{ width: "auto", height: 34 }}>
              <option value="ALL">All locations</option>
              {scopedLocations().map(l => <option key={l.id} value={l.id}>{l.short}</option>)}
            </select>
            <select aria-label="Week" className="ros-input" value={week} onChange={(e) => setWeek(e.target.value)} style={{ width: "auto", height: 34 }}>
              <option value="All">All weeks</option>
              {weeks.map(w => <option key={w} value={w}>w/c {fmtDate(w)}</option>)}
            </select>
            {(q || status !== "All" || stage !== "All" || loc !== "ALL" || week !== "All") && <Btn size="sm" variant="subtle" onClick={() => { setQ(""); setStatus("All"); setStage("All"); setLoc("ALL"); setWeek("All"); setSel(new Set()); }}>Clear filters</Btn>}
          </Row>
          {famFocus && q === famFocus && <Callout tone="info" title={"Filtered to " + (family(famFocus)?.surname || famFocus) + " (" + famFocus + ")"}>Opened from the family record. Clear the search to see every invoice.</Callout>}
          <Row wrap gap={10} style={{ padding: "8px 10px", borderRadius: 12, background: sel.size ? "var(--accent-faint)" : "var(--surface-2)", border: "1px solid " + (sel.size ? "var(--accent-line)" : "var(--border)") }}>
            <span style={{ fontSize: 12.5, color: "var(--body)", flex: "1 1 220px" }}>
              {selRows.length ? selRows.length + " overdue selected · " + euro(selRows.reduce((n, r) => n + r.bal, 0)) : "Tick overdue invoices to send reminders in bulk. Pick a stage first to use that stage's wording."}
            </span>
            <Btn size="sm" disabled={!selectable.length} onClick={() => setSel(new Set(selectable.map(r => r.inv.id)))}>Select all overdue shown ({selectable.length})</Btn>
            {sel.size > 0 && <Btn size="sm" variant="subtle" onClick={() => setSel(new Set())}>Clear</Btn>}
            <Btn size="sm" variant="primary" disabled={!selRows.length} onClick={() => confirmThen({ title: "Send " + stageLabel.toLowerCase() + " to " + selRows.length + " families?", body: "Logs a " + stageLabel.toLowerCase() + " on each family timeline and in Activity. Simulated: no email, SMS or app message leaves the demo.", confirmLabel: "Send (simulated)", run: () => { bulkRemind({ invoiceIds: selRows.map(r => r.inv.id), stage: stageLabel }); setSel(new Set()); } })}>Send reminders (simulated)</Btn>
          </Row>
        </div>
        <Table rows={rows} cols={cols} rowKey={r => r.inv.id} onRow={r => openRecord({ kind: "invoice", id: r.inv.id })} minWidth={1020} empty="No invoices match these filters" rowTone={r => r.status === "Overdue" || r.status === "Debt review" ? "bad" : r.status === "On plan" ? "warn" : undefined} />
        <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--faint)" }}>{rows.length.toLocaleString("en-IE")} invoices · {euro(totInv)} invoiced · {euro(totBal)} balance (scheduled direct debits and plans included)</div>
      </Card>
    </div>
  );
}

/* ================= Payments & Reconciliation ================= */
function Payments() {
  const { s } = useRos();
  const od = overdueInvoices(), aged = agedDebt();
  const failed = s.payments.filter(p => p.status === "Failed" && inScope(family(p.familyId)?.locationId)).sort((a, b) => a.date.localeCompare(b.date));
  const open = s.bank.filter(b => b.status === "Suggested" || b.status === "Unmatched");
  const done = s.bank.filter(b => b.status === "Matched" || b.status === "Ignored");
  const exact = open.filter(b => b.suggestion?.confidence === "Exact");
  const exactClears = exact.map(b => s.invoices.find(i => i.id === b.suggestion!.invoiceId)).filter((i): i is Invoice => !!i && invoiceStatus(i) === "Overdue");
  const methodCount = (m: string) => s.families.filter(f => f.method === m && inScope(f.locationId)).length;
  const mtdBy = cached("bill:mtdMethod", () => {
    const m = new Map<string, number>();
    for (const p of getState().payments) if (p.status === "Succeeded" && p.date >= "2026-10-01" && inScope(family(p.familyId)?.locationId)) { const k = p.method.replace(/ \(.*\)$/, ""); m.set(k, round2((m.get(k) || 0) + p.amount)); }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  });
  const methods: [string, string, string, number | null][] = [
    ["Card on file (Stripe)", "Charged on invoice day. Card details held by the provider, never by Ray of Sunshine.", "Card on file", methodCount("Card on file")],
    ["Apple Pay / Google Pay", "Offered at checkout in MyRosKids for one-off payments.", "", null],
    ["SEPA direct debit", "Collected on the due date. Failed collections retried Day 2 and Day 5.", "SEPA direct debit", methodCount("SEPA direct debit")],
    ["Bank transfer", "Matched from the overnight bank feed by reference and amount.", "Bank transfer", methodCount("Bank transfer")],
    ["Card by phone", "Taken by Accounts over the phone and keyed into the provider.", "Card by phone", methodCount("Card by phone")],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Grid min={170} gap={12}>
        <Kpi label="Bank lines to reconcile" value={open.length} sub={euro(open.reduce((n, b) => n + b.amount, 0)) + " unallocated"} tone={open.length ? "warn" : "ok"} />
        <Kpi label="Overdue invoices" value={od.length} sub="drops as lines are matched" tone={od.length ? "bad" : "ok"} onClick={() => setTab("Billing", "Reminder Stages")} />
        <Kpi label="Aged debt" value={euro0(aged.total)} sub="live from invoices and payments" tone="warn" />
        <Kpi label="Failed collections" value={failed.filter(p => !(p.retry || "").startsWith("Retried")).length} sub="SEPA returns awaiting retry" tone={failed.length ? "warn" : "ok"} />
      </Grid>

      <Card title="Overnight bank feed" sub={"Imported 06:30 · " + s.bank.length + " lines. The Collections agent suggests a match; a person confirms anything that is not exact."}
        right={<><DemoTag>Bank feed simulated</DemoTag>{exact.length > 0 && <Btn size="sm" variant="primary" onClick={() => confirmThen({ title: "Match " + exact.length + " exact lines?", body: "Each line's amount and invoice number match exactly. Clears " + euro(exact.reduce((n, b) => n + b.amount, 0)) + " and removes " + exactClears.length + " invoice" + (exactClears.length === 1 ? "" : "s") + " from the overdue list.", confirmLabel: "Match all exact", run: () => exact.forEach(b => reconcile({ bankId: b.id, invoiceId: b.suggestion!.invoiceId })) })}>Match all exact ({exact.length})</Btn>}</>}>
        {exact.length > 0 && <div style={{ marginBottom: 12 }}><Callout tone="info" title={"Matching the exact lines clears " + euro(exact.reduce((n, b) => n + b.amount, 0))}>{exactClears.length} invoice{exactClears.length === 1 ? "" : "s"} leave the overdue list ({od.length} to {od.length - exactClears.length}) and aged debt falls by the same amount.</Callout></div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {open.map(b => <BankLineCard key={b.id} bl={b} />)}
          {!open.length && <Empty title="Bank feed reconciled" body="Every line is matched or set aside for review." />}
        </div>
        {done.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <Label style={{ marginBottom: 6 }}>Done</Label>
            {done.map(b => <ListRow key={b.id} title={<span>{b.id} · {euro(b.amount)} · “{b.ref}”</span>} sub={b.payer + " · " + fmtDay(b.date) + (b.status === "Matched" && b.suggestion ? " · suggested " + b.suggestion.invoiceId : "")} right={<StatusBadge s={b.status} />} />)}
          </div>
        )}
      </Card>

      <div className="ros-split">
        <Card title="Failed payments" sub="SEPA returns. Retries run on Day 2 and Day 5 after the failed collection. A retry here is simulated.">
          {failed.length ? failed.map(p => {
            const inv = p.invoiceId ? s.invoices.find(i => i.id === p.invoiceId) : undefined;
            const f = family(p.familyId)!;
            const retried = (p.retry || "").startsWith("Retried");
            const d2 = addDays(p.date, 2), d5 = addDays(p.date, 5);
            return (
              <div key={p.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                <Row wrap gap={8}>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{euro(p.amount)} · {f.surname}</span>
                  <RecLink r={{ kind: "family", id: f.id }} />
                  {inv && <RecLink r={{ kind: "invoice", id: inv.id }} />}
                  <span style={{ flex: 1 }} />
                  <StatusBadge s={retried ? "Collected" : inv ? invoiceStatus(inv) : "Failed"} />
                </Row>
                <div style={{ marginTop: 10 }}>
                  <Timeline items={[
                    { at: fmtDay(p.date), title: "Collection failed", detail: p.ref, tone: "bad" },
                    { at: fmtDay(d2), title: "Day 2 retry", detail: retried ? "Superseded by manual retry" : d2 <= TODAY ? "Ran, not collected" : "Scheduled", tone: d2 <= TODAY ? "warn" : "neutral" },
                    { at: fmtDay(d5), title: "Day 5 retry", detail: retried ? p.retry : d5 <= TODAY ? "Ran" : "Scheduled · " + (daysBetween(TODAY, d5) === 1 ? "tomorrow" : "in " + daysBetween(TODAY, d5) + " days"), tone: retried ? "ok" : "neutral" },
                  ]} />
                </div>
                {!retried && (
                  <Row wrap gap={8}>
                    <Btn size="sm" variant="primary" onClick={() => confirmThen({ title: "Retry " + euro(p.amount) + " now?", body: "Simulates an early SEPA retry for " + (inv?.id || "this payment") + ". In the demo the retry collects; in production the bank decides.", confirmLabel: "Retry (simulated)", run: () => retryPayment({ paymentId: p.id }) })}>Retry now (simulated)</Btn>
                    {inv && <Btn size="sm" onClick={() => sendPayLink({ invoiceId: inv.id })}>Send card pay link (simulated)</Btn>}
                  </Row>
                )}
              </div>
            );
          }) : <Empty title="No failed payments" />}
        </Card>
        <Card title="Payment methods" sub="How families pay. None of these are connected in the demo.">
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {methods.map(([name, desc, , n]) => (
              <ListRow key={name} title={<Row wrap gap={8}><span>{name}</span><Badge tone="neutral">Not connected</Badge></Row>} sub={desc} right={n === null ? <Sub>at checkout</Sub> : <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>{n} families</span>} />
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <Label style={{ marginBottom: 8 }}>Collected in October by method</Label>
            <HBars format={euro0} items={mtdBy.map(([k, v]) => ({ label: k, value: v }))} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function BankLineCard({ bl }: { bl: BankLine }) {
  const { s } = useRos();
  const sug = bl.suggestion;
  const opts = sug ? [sug.invoiceId, ...(sug.alternatives || [])] : [];
  const cands = cached("bill:cand:" + bl.id, () => {
    const sur = (bl.payer.split(/\s+/).pop() || "").toLowerCase().replace(/[^a-z]/g, "");
    const all = getState().invoices.filter(i => !opts.includes(i.id) && invoiceBalance(i) > 0 && invoiceStatus(i) !== "Scheduled DD");
    const byName = all.filter(i => family(i.familyId)!.surname.toLowerCase().replace(/[^a-z]/g, "") === sur);
    const byAmt = all.filter(i => Math.abs(invoiceBalance(i) - bl.amount) < 0.005 && !byName.includes(i));
    const list = byName.concat(byAmt);
    return (list.length ? list : overdueInvoices().filter(i => !opts.includes(i.id))).slice(0, 12);
  });
  const [pick, setPick] = useState<string>(opts[0] || "");
  const [other, setOther] = useState<string>("");
  const chosen = pick === "__other" ? other : pick;
  const inv = chosen ? s.invoices.find(i => i.id === chosen) : undefined;
  const exact = sug?.confidence === "Exact";
  const diff = inv ? round2(bl.amount - invoiceBalance(inv)) : 0;
  const confirm = () => {
    if (!inv) return;
    const f = family(inv.familyId)!;
    confirmThen({
      title: "Allocate " + euro(bl.amount) + " to " + inv.id + "?",
      body: (exact ? "Exact match. " : "You are confirming a match the agent was not sure about. ") + f.surname + " family (" + f.id + "), balance " + euro(invoiceBalance(inv)) + "." + (inv.planId ? " This is a plan invoice: the payment is recorded against " + inv.planId + " and the missed instalment is marked paid." : "") + (diff > 0 ? " The payment is " + euro(diff) + " more than the balance; Accounts can refund or credit the difference." : diff < 0 ? " This part-pays the invoice; " + euro(-diff) + " stays outstanding." : ""),
      confirmLabel: "Confirm match", run: () => reconcile({ bankId: bl.id, invoiceId: inv.id }),
    });
  };
  return (
    <div style={{ border: "1px solid " + (exact ? "var(--border)" : bl.status === "Unmatched" ? "var(--bad-soft)" : "var(--warn-soft)"), borderRadius: 14, padding: "12px 14px", background: "var(--surface-2)" }}>
      <Row wrap gap={8}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--faint)" }}>{bl.id}</span>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{euro(bl.amount)}</span>
        <span style={{ fontSize: 12.5, color: "var(--body)" }}>“{bl.ref}” · {bl.payer} · {fmtDay(bl.date)}</span>
        <span style={{ flex: 1 }} />
        <Badge tone={exact ? "ok" : sug ? "warn" : "bad"}>{exact ? "Exact" : sug ? "Ambiguous: confirm" : "Unmatched"}</Badge>
      </Row>
      {sug && <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 6 }}>{sug.reason}</div>}
      {exact && sug ? (
        <Row wrap gap={8} style={{ marginTop: 10 }}>
          <span style={{ fontSize: 12.5 }}>Suggested</span><RecLink r={{ kind: "invoice", id: sug.invoiceId }} />
          <Sub>{family(s.invoices.find(i => i.id === sug.invoiceId)?.familyId || "")?.surname} · balance {euro(invoiceBalance(s.invoices.find(i => i.id === sug.invoiceId)!))}</Sub>
          <span style={{ flex: 1 }} />
          <Btn size="sm" variant="primary" onClick={() => reconcile({ bankId: bl.id, invoiceId: sug.invoiceId })}>Match</Btn>
        </Row>
      ) : (
        <div style={{ marginTop: 10 }}>
          <Label style={{ marginBottom: 6 }}>{sug ? "Choose the invoice this payment belongs to" : "No suggestion. Match manually or set aside"}</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {opts.map((id, k) => {
              const i = s.invoices.find(x => x.id === id); if (!i) return null;
              const f = family(i.familyId)!;
              return (
                <label key={id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 10, cursor: "pointer", background: pick === id ? "var(--accent-faint)" : "transparent", border: "1px solid " + (pick === id ? "var(--accent-line)" : "transparent") }}>
                  <input type="radio" name={"bl-" + bl.id} checked={pick === id} onChange={() => setPick(id)} style={{ accentColor: "var(--accent)" }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}><b>{id}</b> · {f.surname} ({f.id}) · {i.planId ? "plan " + i.planId : "due " + fmtDate(i.due)} · balance {euro(invoiceBalance(i))}</span>
                  <Badge tone={k === 0 ? "warn" : "neutral"}>{k === 0 ? "Agent suggestion" : "Alternative"}</Badge>
                </label>
              );
            })}
            <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 10, cursor: "pointer", flexWrap: "wrap", background: pick === "__other" ? "var(--accent-faint)" : "transparent", border: "1px solid " + (pick === "__other" ? "var(--accent-line)" : "transparent") }}>
              <input type="radio" name={"bl-" + bl.id} checked={pick === "__other"} onChange={() => setPick("__other")} style={{ accentColor: "var(--accent)" }} />
              <span style={{ fontSize: 12.5 }}>Another open invoice</span>
              <select aria-label="Another invoice" className="ros-input" value={other} onChange={(e) => { setOther(e.target.value); setPick("__other"); }} style={{ width: "auto", minWidth: 0, maxWidth: "100%", height: 30, flex: "1 1 220px" }}>
                <option value="">Choose…</option>
                {cands.map(i => <option key={i.id} value={i.id}>{i.id} · {family(i.familyId)?.surname} · {euro(invoiceBalance(i))} · {invoiceStatus(i)}</option>)}
              </select>
            </label>
          </div>
          <Row wrap gap={8} style={{ marginTop: 10 }}>
            <Btn size="sm" variant="primary" disabled={!inv} onClick={confirm}>Confirm match</Btn>
            <Btn size="sm" variant="subtle" onClick={() => confirmThen({ title: "Set " + bl.id + " aside?", body: "Leaves " + euro(bl.amount) + " (“" + bl.ref + "”) unallocated for manual review. No invoice changes.", confirmLabel: "Set aside", run: () => ignoreBank({ bankId: bl.id }) })}>Set aside for review</Btn>
            {inv && diff !== 0 && <Sub>{diff > 0 ? euro(diff) + " more than the balance" : "part payment, " + euro(-diff) + " left"}</Sub>}
          </Row>
        </div>
      )}
    </div>
  );
}

/* ================= Reminder Stages ================= */
function Stages() {
  const { s, role } = useRos();
  const od = overdueInvoices();
  const byStep = useMemo(() => { const m = new Map<number, Invoice[]>(); for (const i of od) { const k = reminderStage(i).step; if (!m.has(k)) m.set(k, []); m.get(k)!.push(i); } return m; }, [od]);
  const [step, setStep] = useState<number>(4);
  const days = ["Day " + s.config.reminderDays[0], "Day " + s.config.reminderDays[1], "Day " + s.config.reminderDays[2], "Day " + s.config.reminderDays[3], "Day " + s.config.blockDay, "Day " + s.config.phoneDay, "Day 30+", "Owner"];
  const rules = [
    "Invoice and pay link go out on issue. Automatic (AU-05).",
    "Friendly nudge with the balance and a pay link. Automatic.",
    "Second reminder. Failed direct debits are retried the same day. Automatic.",
    "Final warning that new bookings may be restricted on Day " + s.config.blockDay + ". Automatic.",
    "The Collections agent proposes a booking restriction. Accounts approves or declines. Nothing is blocked automatically.",
    "A person phones the family. A task is raised for Accounts.",
    "Monthly statement of account and a payment plan offered.",
    "Third broken plan. The owner reviews the debt pack. Approving records the decision only; no referral is sent.",
  ];
  const list = byStep.get(step) || [];
  const lastComm = cached("bill:lastComm", () => {
    const m = new Map<string, string>();
    for (const c of getState().comms) { const hit = /INV-\d+/.exec(c.summary); if (hit && (!m.has(hit[0]) || m.get(hit[0])! < c.at)) m.set(hit[0], c.at); }
    return m;
  });
  const stageWord = days[step] + " " + STAGE_NAMES[step].toLowerCase();
  const blockApprovals = s.approvals.filter(a => a.kind === "Booking block" && (a.link?.kind !== "family" || inScope(family(a.link.id)?.locationId)));
  const debtAppr = s.approvals.find(a => a.kind === "Debt collection pack");
  const doylePlan = s.plans.find(p => p.status === "Broken");
  const phoneSeedTask = s.tasks.find(t => t.title.startsWith("Phone follow-ups"));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card title="Reminder ladder" sub={od.length + " overdue invoices across the stages. Click a stage to work it."} right={<Btn size="sm" variant="subtle" onClick={() => nav("Automations", "Sequences")}>Sequence settings</Btn>}>
        <div className="ros-scroll-x">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(8,minmax(118px,1fr))", gap: 8, minWidth: 980 }}>
            {days.map((d, i) => {
              const inv = byStep.get(i) || [];
              const amt = round2(inv.reduce((n, x) => n + invoiceBalance(x), 0));
              const on = i === step;
              const tone = i >= 7 ? "bad" : i >= 4 ? "warn" : "neutral";
              return (
                <button key={i} className="ros-btn ros-focus" onClick={() => setStep(i)}
                  style={{ textAlign: "left", cursor: "pointer", borderRadius: 14, padding: "11px 12px", background: on ? "var(--accent-soft)" : "var(--surface-2)", border: "1px solid " + (on ? "var(--accent-line)" : "var(--border)"), color: "var(--ink)", display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 11, color: tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : "var(--faint)", fontWeight: 600 }}>{d}</span>
                  <span style={{ fontSize: 12.5, color: "var(--body)" }}>{STAGE_NAMES[i]}</span>
                  <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-.5px" }}>{inv.length}</span>
                  <span style={{ fontSize: 11, color: "var(--faint)" }}>{euro(amt)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="ros-split">
        <Card title={stageWord[0].toUpperCase() + stageWord.slice(1)} sub={rules[step]}
          right={step <= 3 && list.length > 0 && role.finance ? <Btn size="sm" variant="primary" onClick={() => confirmThen({ title: "Send " + stageWord + " to " + list.length + " families?", body: "Logs the reminder on each family timeline and in Activity. Simulated: nothing is sent.", confirmLabel: "Send (simulated)", run: () => bulkRemind({ invoiceIds: list.map(i => i.id), stage: stageWord[0].toUpperCase() + stageWord.slice(1) }) })}>Send to all {list.length} (simulated)</Btn> : undefined}>
          {step === 4 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
              {blockApprovals.filter(a => a.status === "Pending" || a.decidedAt).map(a => {
                const f = a.link ? family(a.link.id) : undefined;
                const inv = f ? list.find(i => i.familyId === f.id) : undefined;
                return <ApprovalInline key={a.id} a={a} extra={inv ? <Row wrap gap={8} style={{ marginTop: 10 }}><Sub>Overdue invoice</Sub><RecLink r={{ kind: "invoice", id: inv.id }} /><Sub>{euro(invoiceBalance(inv))} · {daysOverdue(inv)} days</Sub></Row> : undefined} />;
              })}
            </div>
          )}
          {step === 7 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
              {debtAppr && <ApprovalInline a={debtAppr} extra={<div style={{ marginTop: 10 }}><Callout tone="warn" title="Demo safeguard">Approving records the owner's decision only. No referral, solicitor letter or third-party contact happens in this demo; production would need legal and business validation.</Callout></div>} />}
              {doylePlan && <PlanPanel id={doylePlan.id} compact />}
            </div>
          )}
          {step === 5 && phoneSeedTask && <div style={{ marginBottom: 10 }}><TaskRow id={phoneSeedTask.id} /></div>}
          {list.length ? list.map(inv => {
            const f = family(inv.familyId)!;
            const g = guardian(f);
            const last = lastComm.get(inv.id);
            const pending = s.approvals.find(a => a.status === "Pending" && a.kind === "Booking block" && a.link?.id === f.id);
            const task = s.tasks.find(t => t.link?.kind === "invoice" && t.link.id === inv.id);
            let action: ReactNode = null;
            if (step <= 3) action = <Btn size="sm" onClick={() => bulkRemind({ invoiceIds: [inv.id], stage: stageWord[0].toUpperCase() + stageWord.slice(1) })}>Send</Btn>;
            else if (step === 4) action = f.blocked ? <Badge tone="bad">Booking blocked</Badge> : pending ? <Badge tone="warn">{pending.id} pending</Badge> : <Btn size="sm" onClick={() => raiseBlock({ familyId: f.id, invoiceId: inv.id })}>Raise block candidate</Btn>;
            else if (step === 5) action = task ? <StatusBadge s={task.status} /> : <Btn size="sm" onClick={() => phoneTask({ invoiceId: inv.id })}>Create phone task</Btn>;
            else if (step === 6) action = <><Btn size="sm" onClick={() => sendStatement({ familyId: f.id })}>Send statement</Btn><Btn size="sm" variant="subtle" onClick={() => nav("Billing", "Statements & Exports", { statementFamily: f.id + "@" + Date.now() })}>View</Btn></>;
            else action = <Badge tone="bad">Owner</Badge>;
            return (
              <ListRow key={inv.id} tone={step >= 4 ? (step === 7 ? "bad" : "warn") : undefined} onClick={() => openRecord({ kind: "invoice", id: inv.id })}
                title={<Row wrap gap={8}><RecLink r={{ kind: "invoice", id: inv.id }} /><span>{f.surname}</span><Sub>{f.id} · {locById(f.locationId)?.short}</Sub>{f.blocked && <Badge tone="bad">Blocked</Badge>}{inv.note && <Badge tone="warn">{inv.note}</Badge>}</Row>}
                sub={euro(invoiceBalance(inv)) + " · due " + fmtDate(inv.due) + " · " + daysOverdue(inv) + " days · " + (g ? g.name + " · " + f.channel : "") + (last ? " · last contact " + rel(last) : "")}
                right={action} />
            );
          }) : <Empty title="Nothing at this stage" body="Invoices move along the ladder as days pass, and leave it when paid or put on a plan." />}
        </Card>
        <Stack gap={16}>
          <Card title="How the ladder runs" sub="Ray of Sunshine collections policy. Not an NCS programme rule.">
            <Timeline items={days.map((d, i) => ({ at: d, title: STAGE_NAMES[i], detail: rules[i], tone: (i === step ? "accent" : i >= 7 ? "bad" : i >= 4 ? "warn" : "neutral") as Tone }))} />
          </Card>
          <Card title="Booking-blocked accounts">
            {s.families.filter(f => f.blocked && inScope(f.locationId)).map(f => <ListRow key={f.id} onClick={() => openRecord({ kind: "family", id: f.id })} title={f.surname + " · " + f.id} sub={euro(familyDue(f.id)) + " outstanding · " + locById(f.locationId)?.short} right={<StatusBadge s={paymentStatus(f)} />} />)}
          </Card>
        </Stack>
      </div>
    </div>
  );
}

/* ================= Payment Plans ================= */
function Plans() {
  const { s, role } = useRos();
  const plans = s.plans.filter(p => inScope(family(p.familyId)?.locationId));
  const paidOf = (p: PaymentPlan) => round2(s.payments.filter(x => x.planId === p.id && x.status === "Succeeded").reduce((n, x) => n + x.amount, 0));
  const missed = plans.filter(p => p.instalments.some(i => i.status === "Missed"));
  const atCap = plans.filter(p => p.revision >= p.maxRevisions);
  const cols: Col<PaymentPlan>[] = [
    { key: "id", label: "Plan", w: ".8fr", sort: p => p.id, render: p => <RecLink r={{ kind: "plan", id: p.id }} /> },
    { key: "f", label: "Family", w: "1.3fr", sort: p => family(p.familyId)?.surname || "", render: p => <Stack><span>{family(p.familyId)?.surname}</span><Sub>{p.familyId} · {locById(family(p.familyId)?.locationId || "")?.short}</Sub></Stack> },
    { key: "t", label: "Total", w: ".8fr", align: "right", sort: p => p.total, render: p => euro(p.total) },
    { key: "pr", label: "Paid", w: "1.3fr", sort: p => paidOf(p) / p.total, render: p => <div style={{ width: "100%" }}><Row gap={6}><span style={{ fontSize: 12 }}>{euro(paidOf(p))}</span><Sub>{p.instalments.filter(i => i.status === "Paid").length}/{p.instalments.length}</Sub></Row><Bar value={paidOf(p)} max={p.total} tone={p.status === "Broken" ? "bad" : "ok"} /></div> },
    { key: "r", label: "Revision", w: ".8fr", sort: p => p.revision, render: p => <Badge tone={p.revision >= p.maxRevisions ? "warn" : "neutral"}>{p.revision} of {p.maxRevisions}</Badge> },
    { key: "e", label: "E-sign", w: ".7fr", render: p => <StatusBadge s={p.esign} /> },
    { key: "s", label: "Status", w: ".9fr", sort: p => p.status, render: p => <StatusBadge s={p.instalments.some(i => i.status === "Missed") && p.status === "Active" ? "Missed instalment" : p.status} /> },
    { key: "n", label: "Next", w: "1.1fr", render: p => { const nx = p.instalments.find(i => i.status !== "Paid"); return nx ? <Stack><span style={{ fontSize: 12.5 }}>{euro(nx.amount)}</span><Sub>{fmtDay(nx.due)} · {nx.status}</Sub></Stack> : <Sub>Complete</Sub>; } },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Grid min={170} gap={12}>
        <Kpi label="Active plans" value={plans.filter(p => p.status === "Active").length} sub={euro0(plans.filter(p => p.status === "Active").reduce((n, p) => n + p.total - paidOf(p), 0)) + " still to collect"} tone="ok" />
        <Kpi label="Broken plans" value={plans.filter(p => p.status === "Broken").length} sub="owner decision only" tone="bad" onClick={() => setTab("Billing", "Reminder Stages")} />
        <Kpi label="Missed instalments" value={missed.reduce((n, p) => n + p.instalments.filter(i => i.status === "Missed").length, 0)} sub={missed.map(p => family(p.familyId)?.surname).join(", ") || "None"} tone={missed.length ? "warn" : "ok"} />
        <Kpi label="Plans at revision cap" value={atCap.length} sub={"cap is " + s.config.planMaxRevisions + " revisions"} tone={atCap.length ? "warn" : "ok"} />
      </Grid>
      <Card pad={false} title="All payment plans" sub="Instalments are allocated to the oldest invoice first. Click a plan for the full schedule.">
        <Table rows={plans} cols={cols} rowKey={p => p.id} onRow={p => openRecord({ kind: "plan", id: p.id })} minWidth={900} rowTone={p => p.status === "Broken" ? "bad" : p.instalments.some(i => i.status === "Missed") ? "warn" : undefined} />
      </Card>
      <div className="ros-split">
        <PlanBuilder />
        <Stack gap={16}>
          <Card title="Missed instalments" sub="Raised with Accounts within a week of the miss. No automatic penalties.">
            {missed.length ? missed.map(p => {
              const f = family(p.familyId)!;
              const m = p.instalments.find(i => i.status === "Missed")!;
              const esc = addDays(m.due, 7);
              const task = s.tasks.find(t => t.link?.kind === "plan" && t.link.id === p.id);
              return (
                <div key={p.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  <Row wrap gap={8}><RecLink r={{ kind: "plan", id: p.id }} /><span style={{ fontSize: 13 }}>{f.surname}</span><StatusBadge s={p.status} /><span style={{ flex: 1 }} /><Sub>revision {p.revision} of {p.maxRevisions}</Sub></Row>
                  <div style={{ fontSize: 12.5, color: "var(--dim)", margin: "6px 0 8px" }}>{euro(m.amount)} missed {fmtDay(m.due)} · escalate by {fmtDay(esc)} ({daysBetween(TODAY, esc) >= 0 ? daysBetween(TODAY, esc) + " days left" : "overdue"})</div>
                  {p.status === "Broken" ? <Callout tone="bad" title="Third breach: owner decision">{p.nextAction}. Only the owner can decide what happens next.</Callout>
                    : task ? <TaskRow id={task.id} /> : role.finance && <Btn size="sm" onClick={() => planEscalate({ planId: p.id })}>Raise follow-up for Accounts</Btn>}
                </div>
              );
            }) : <Empty title="No missed instalments" />}
          </Card>
          <Card title="Plan rules" sub="Ray of Sunshine collections policy (demo configuration).">
            <Timeline items={[
              { at: "Set up", title: "Family agrees an instalment schedule", detail: "E-signature sent through MyRosKids (simulated). Covered invoices show On plan and leave the overdue list.", tone: "ok" },
              { at: "Missed", title: "Accounts follows up within a week", detail: "A task is raised; the parent gets a reminder. No automatic penalty or fee.", tone: "warn" },
              { at: "Revise", title: "Up to " + s.config.planMaxRevisions + " revisions", detail: "A fourth revision is blocked in the builder.", tone: "warn" },
              { at: "Breach", title: "Third breach goes to the owner", detail: "The plan is marked broken, its invoices return to overdue as Debt review, and the owner decides. Nothing is referred automatically.", tone: "bad" },
            ]} />
          </Card>
        </Stack>
      </div>
    </div>
  );
}

function PlanBuilder() {
  const { s, role } = useRos();
  const [mode, setMode] = useState<"new" | "revise">("new");
  const candidates = cached("bill:planCands", () => {
    const m = new Map<string, Invoice[]>();
    for (const i of overdueInvoices()) if (invoiceStatus(i) === "Overdue" && !i.planId) { if (!m.has(i.familyId)) m.set(i.familyId, []); m.get(i.familyId)!.push(i); }
    return Array.from(m.entries()).filter(([fid]) => !getState().plans.some(p => p.familyId === fid && (p.status === "Active" || p.status === "Broken"))).map(([fid, invs]) => ({ f: family(fid)!, invs }))
      .sort((a, b) => b.invs.reduce((n, i) => n + invoiceBalance(i), 0) - a.invs.reduce((n, i) => n + invoiceBalance(i), 0));
  });
  const activePlans = s.plans.filter(p => p.status === "Active" && inScope(family(p.familyId)?.locationId));
  const [fid, setFid] = useState<string>("");
  const famId = fid && candidates.some(c => c.f.id === fid) ? fid : candidates[0]?.f.id || "";
  const cand = candidates.find(c => c.f.id === famId);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(4);
  const [every, setEvery] = useState(7);
  const [first, setFirst] = useState(addDays(TODAY, 6));
  const [planId, setPlanId] = useState<string>("PLN-031");
  const pl = activePlans.find(p => p.id === planId) || activePlans[0];
  const invs = (cand?.invs || []).filter(i => !unticked.has(i.id));
  const total = round2(invs.reduce((n, i) => n + invoiceBalance(i), 0));
  const plPaid = pl ? round2(s.payments.filter(x => x.planId === pl.id && x.status === "Succeeded").reduce((n, x) => n + x.amount, 0)) : 0;
  const remaining = pl ? round2(pl.total - plPaid) : 0;
  const sched = schedule(mode === "new" ? total : remaining, Math.max(1, count), every, first);
  const blockedRev = !!pl && pl.revision >= pl.maxRevisions;
  const odNow = overdueInvoices().length;
  const brokenFams = s.plans.filter(p => p.status === "Broken");
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(first) && first >= TODAY;
  return (
    <Card title="Plan builder" sub="Set up a new plan for an overdue family, or revise an existing plan within the cap."
      right={<Seg size="sm" value={mode} onChange={setMode} options={[["new", "New plan"], ["revise", "Revise a plan"]]} />}>
      {mode === "new" ? (
        candidates.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Family with overdue invoices">
              <select className="ros-input" value={famId} onChange={(e) => { setFid(e.target.value); setUnticked(new Set()); }}>
                {candidates.map(c => <option key={c.f.id} value={c.f.id}>{c.f.surname} · {c.f.id} · {euro(c.invs.reduce((n, i) => n + invoiceBalance(i), 0))} over {c.invs.length} invoice{c.invs.length > 1 ? "s" : ""}{c.f.blocked ? " · blocked" : ""}</option>)}
              </select>
            </Field>
            {cand && (
              <div>
                <Label style={{ marginBottom: 6 }}>Invoices to include</Label>
                {cand.invs.map(i => (
                  <label key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px", fontSize: 12.5, cursor: "pointer" }}>
                    <input type="checkbox" checked={!unticked.has(i.id)} onChange={() => setUnticked(prev => { const n = new Set(prev); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })} style={{ accentColor: "var(--accent)" }} />
                    <span style={{ flex: 1 }}><b>{i.id}</b> · due {fmtDate(i.due)} · {daysOverdue(i)} days · {reminderStage(i).label}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{euro(invoiceBalance(i))}</span>
                  </label>
                ))}
              </div>
            )}
            <PlanTerms count={count} setCount={setCount} every={every} setEvery={setEvery} first={first} setFirst={setFirst} />
            <SchedulePreview sched={sched} total={total} />
            <KV items={[["Revision", "1 of " + s.config.planMaxRevisions], ["E-signature", "Sent on create (simulated)"], ["Overdue list", invs.length ? odNow + " to " + (odNow - invs.length) : "No change"], ["Plan owner", "You, as " + ROLE_LABEL[role.id]]]} />
            <Btn variant="primary" disabled={!invs.length || total <= 0 || !validDate || !role.finance} onClick={() => cand && confirmThen({
              title: "Create plan for the " + cand.f.surname + " family?",
              body: euro(total) + " over " + count + " instalments from " + fmtDay(first) + ". " + invs.map(i => i.id).join(", ") + " move to On plan and leave the overdue list. An e-signature request is logged (simulated); nothing is sent.",
              confirmLabel: "Create plan", run: () => { createPlan({ familyId: cand.f.id, invoiceIds: invs.map(i => i.id), count, every, firstDue: first }); setFid(""); setUnticked(new Set()); },
            })}>Create plan and send for e-signature</Btn>
          </div>
        ) : <Empty title="No overdue families without a plan" body="Every overdue family is already on a plan or in debt review." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Active plan">
            <select className="ros-input" value={pl?.id || ""} onChange={(e) => setPlanId(e.target.value)}>
              {activePlans.map(p => <option key={p.id} value={p.id}>{p.id} · {family(p.familyId)?.surname} · revision {p.revision} of {p.maxRevisions}</option>)}
            </select>
          </Field>
          {pl && (blockedRev ? (
            <Callout tone="bad" title={"Revision " + pl.revision + " of " + pl.maxRevisions + ": a fourth revision is blocked"}>{family(pl.familyId)?.surname} has used every revision. If this plan breaks again it goes to the owner for a decision. {pl.nextAction}.</Callout>
          ) : (
            <>
              <KV items={[["Paid so far", euro(plPaid)], ["Left to schedule", euro(remaining)], ["This will be", "Revision " + (pl.revision + 1) + " of " + pl.maxRevisions], ["E-signature", "Re-sent (simulated)"]]} />
              <PlanTerms count={count} setCount={setCount} every={every} setEvery={setEvery} first={first} setFirst={setFirst} />
              <SchedulePreview sched={sched} total={remaining} />
              <Btn variant="primary" disabled={!validDate || remaining <= 0 || !role.finance} onClick={() => confirmThen({ title: "Revise " + pl.id + "?", body: "Reschedules " + euro(remaining) + " over " + count + " instalments from " + fmtDay(first) + ". Uses revision " + (pl.revision + 1) + " of " + pl.maxRevisions + ".", confirmLabel: "Revise plan", run: () => revisePlan({ planId: pl.id, count, every, firstDue: first }) })}>Revise plan</Btn>
            </>
          ))}
          {pl && pl.esign !== "Signed" && <Btn onClick={() => planSigned({ planId: pl.id })}>Mark e-signed (simulated)</Btn>}
        </div>
      )}
      {brokenFams.length > 0 && <div style={{ marginTop: 14 }}><Callout tone="neutral" title="Not eligible for a new plan">{brokenFams.map(p => family(p.familyId)?.surname + " (" + p.id + ", third plan broken)").join(", ")}: owner decision only.</Callout></div>}
      {s.plans.filter(p => p.esign === "Sent" && p.status === "Active").map(p => (
        <div key={p.id} style={{ marginTop: 10 }}><Callout tone="warn" title={p.id + " awaiting e-signature"} right={<Btn size="sm" onClick={() => planSigned({ planId: p.id })}>Mark signed</Btn>}>{family(p.familyId)?.surname} · sent (simulated). The plan protects its invoices from reminders while the signature is outstanding.</Callout></div>
      ))}
    </Card>
  );
}
function PlanTerms({ count, setCount, every, setEvery, first, setFirst }: { count: number; setCount: (n: number) => void; every: number; setEvery: (n: number) => void; first: string; setFirst: (d: string) => void }) {
  return (
    <Grid min={150} gap={10}>
      <Field label="Instalments">
        <select className="ros-input" value={count} onChange={(e) => setCount(+e.target.value)}>{[2, 3, 4, 5, 6, 8, 10, 12].map(n => <option key={n} value={n}>{n}</option>)}</select>
      </Field>
      <Field label="Frequency">
        <select className="ros-input" value={every} onChange={(e) => setEvery(+e.target.value)}><option value={7}>Weekly</option><option value={14}>Fortnightly</option><option value={28}>Every 4 weeks</option></select>
      </Field>
      <Field label="First instalment" hint={first < TODAY ? "Must be today or later" : fmtDay(first)}>
        <input type="date" className="ros-input" value={first} min={TODAY} onChange={(e) => setFirst(e.target.value)} />
      </Field>
    </Grid>
  );
}
function SchedulePreview({ sched, total }: { sched: { n: number; due: string; amount: number }[]; total: number }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "8px 12px", background: "var(--surface-2)" }}>
      <Row gap={8} style={{ marginBottom: 4 }}><Label>Schedule preview</Label><span style={{ flex: 1 }} /><span style={{ fontSize: 12.5, fontWeight: 600 }}>{euro(total)}</span></Row>
      <div style={{ maxHeight: 170, overflowY: "auto" }}>
        {sched.map(x => <Row key={x.n} gap={10} style={{ padding: "4px 0", borderTop: "1px solid var(--border)", fontSize: 12.5 }}><span style={{ width: 24, color: "var(--faint)" }}>#{x.n}</span><span style={{ flex: 1 }}>{fmtDay(x.due)}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{euro(x.amount)}</span></Row>)}
      </div>
    </div>
  );
}

/* ================= Fee Rules ================= */
function FeeRules() {
  const { s, role } = useRos();
  const cfg = s.config as ConfigExt;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [calcLoc, setCalcLoc] = useState<string>("HAZ");
  const [mins, setMins] = useState("5");
  const locs = s.locations;
  const reEnrol = cfg.reEnrolFee ?? REENROL_DEFAULT;
  const upcomingCamps = s.camps.filter(c => !c.past);
  const val = (k: string, cur: number) => draft[k] ?? String(cur);
  const set = (k: string, v: string) => setDraft(d => ({ ...d, [k]: v }));
  const changes: FeeChange[] = [];
  const diff = (k: string, cur: number) => { const raw = draft[k]; if (raw === undefined || raw.trim() === "") return null; const n = Number(raw); return isFinite(n) && n >= 0 && Math.abs(n - cur) > 0.0001 ? round2(n) : null; };
  for (const l of locs) {
    const h = diff("loc:" + l.id + ":hourlyRate", l.hourlyRate); if (h !== null) changes.push({ target: "loc", id: l.id, key: "hourlyRate", value: h });
    if (l.services.includes("EY")) { const d = diff("loc:" + l.id + ":eyDayRate", l.eyDayRate); if (d !== null) changes.push({ target: "loc", id: l.id, key: "eyDayRate", value: d }); }
  }
  for (const k of ["lateFee", "transportFee", "noticeHours"] as const) { const d = diff("cfg:" + k, s.config[k]); if (d !== null) changes.push({ target: "config", key: k, value: d }); }
  for (const c of upcomingCamps) { const d = diff("camp:" + c.id, c.dayRate); if (d !== null) changes.push({ target: "camp", id: c.id, key: "dayRate", value: d }); }
  { const d = diff("ext:reEnrolFee", reEnrol); if (d !== null) changes.push({ target: "ext", key: "reEnrolFee", value: d }); }
  const numIn = (k: string, cur: number, step = 0.5, label?: string) => (
    <input aria-label={label || k} type="number" min={0} step={step} className="ros-input" disabled={!role.finance} value={val(k, cur)} onChange={(e) => set(k, e.target.value)}
      style={{ width: 92, height: 30, textAlign: "right", borderColor: diff(k, cur) !== null ? "var(--accent-line)" : undefined }} />
  );
  const calcL = locById(calcLoc) || locs[0];
  const m = Math.max(0, Math.floor(Number(mins) || 0));
  const extraH = Math.ceil(m / 60);
  const nolan = s.invoices.find(i => i.id === "INV-20418");
  const nCharges = nolan ? round2(nolan.lines.filter(l => l.amount > 0).reduce((n, l) => n + l.amount, 0)) : 0;
  const nSub = nolan ? round2(nolan.lines.filter(l => l.kind === "NCS subsidy").reduce((n, l) => n + l.amount, 0)) : 0;
  const nOther = nolan ? round2(nolan.lines.filter(l => l.amount < 0 && l.kind !== "NCS subsidy").reduce((n, l) => n + l.amount, 0)) : 0;
  const lastChange = s.activity.filter(e => e.title.startsWith("Fee rules updated")).sort((a, b) => b.seq - a.seq)[0];
  const hl = locById("HAZ")!;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Callout tone="warn" title="Demo fee values only" right={changes.length ? <Row gap={8}><Btn size="sm" variant="subtle" onClick={() => setDraft({})}>Discard</Btn><Btn size="sm" variant="primary" onClick={() => confirmThen({ title: "Save " + changes.length + " fee change" + (changes.length > 1 ? "s" : "") + "?", body: "New invoices and late-booking quotes use the new values from now on. Existing invoices do not change retroactively. Logged to Activity. Demo values only.", confirmLabel: "Save fee rules", run: () => { setFees({ changes }); setDraft({}); } })}>Save {changes.length} change{changes.length > 1 ? "s" : ""}</Btn></Row> : undefined}>
        These amounts drive the demo invoices. They are illustrative and are not Ray of Sunshine's quoted fees. Changes apply to invoices generated after the change; existing invoices keep the rates they were issued with.{lastChange ? " Last changed " + rel(lastChange.at) + " by " + lastChange.actor + "." : ""}
      </Callout>

      <Card pad={false} title="Per-site fee schedule" sub="School-age care is billed by the hour; Early Years by the day. Edit a value, then save.">
        <div className="ros-scroll-x">
          <div style={{ minWidth: 760 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 1fr 1fr 1fr 1fr", padding: "9px 16px", fontSize: 11.5, color: "var(--faint)", background: "var(--surface-faint)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
              <span>Location</span><span>Services</span><span style={{ textAlign: "right" }}>SAC per hour</span><span style={{ textAlign: "right" }}>EY per day</span><span style={{ textAlign: "right" }}>Transport per run</span><span style={{ textAlign: "right" }}>Late booking fee</span>
            </div>
            {locs.map(l => (
              <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.2fr 1fr 1fr 1fr 1fr", alignItems: "center", padding: "8px 16px", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                <Stack><span>{l.short}</span><Sub>{l.town}, Co. {l.county}</Sub></Stack>
                <Row wrap gap={4}>{l.services.filter(x => x !== "ADMIN").map(x => <Badge key={x}>{x}</Badge>)}</Row>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>{numIn("loc:" + l.id + ":hourlyRate", l.hourlyRate, 0.5, l.short + " SAC hourly rate")}</div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>{l.services.includes("EY") ? numIn("loc:" + l.id + ":eyDayRate", l.eyDayRate, 1, l.short + " EY day rate") : <Sub>No Early Years</Sub>}</div>
                <div style={{ textAlign: "right", color: l.services.includes("TRANSPORT") ? "var(--ink)" : "var(--faint)" }}>{l.services.includes("TRANSPORT") ? euro(s.config.transportFee) : "No bus"}</div>
                <div style={{ textAlign: "right" }}>{euro(s.config.lateFee)}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="ros-split-even">
        <Card title="Group fee rules" sub="Apply at every site.">
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <ListRow title="School collection (transport)" sub="Per run, added to the invoice for each booked bus collection." right={numIn("cfg:transportFee", s.config.transportFee, 0.5, "Transport fee")} />
            <ListRow title="Late booking fee" sub={"Requests made with less than " + s.config.noticeHours + "h weekday notice. Staff approve every late booking."} right={numIn("cfg:lateFee", s.config.lateFee, 0.5, "Late booking fee")} />
            <ListRow title="Notice period (hours)" sub="Booking changes inside this window count as late." right={numIn("cfg:noticeHours", s.config.noticeHours, 1, "Notice hours")} />
            <ListRow title="Partial hours" sub="Always rounded up to the next full hour at the site's hourly rate." right={<Badge tone="info">Next full hour</Badge>} />
            <ListRow title="Late collection" sub={"Collection after the booked end time is billed as extra hours at the site rate, next full hour rule. Disputes go to Accounts as a credit approval."} right={<Badge tone="info">Site rate</Badge>} />
            <ListRow title="Re-enrolment fee" sub="Per family, once a year at re-registration." right={numIn("ext:reEnrolFee", reEnrol, 5, "Re-enrolment fee")} />
            {upcomingCamps.map(c => <ListRow key={c.id} title={c.name + " day rate"} sub={fmtDate(c.start) + " to " + fmtDate(c.end) + " · ages " + c.ages + (c.ncsEligible ? " · NCS hours can apply" : "")} right={numIn("camp:" + c.id, c.dayRate, 1, c.name + " day rate")} />)}
          </div>
        </Card>
        <Stack gap={16}>
          <Card title="Worked example: partial hours" sub="Try it. Five minutes over is a full extra hour.">
            <Grid min={140} gap={10}>
              <Field label="Site">
                <select className="ros-input" value={calcLoc} onChange={(e) => setCalcLoc(e.target.value)}>{locs.map(l => <option key={l.id} value={l.id}>{l.short} · {euro(l.hourlyRate)}/h</option>)}</select>
              </Field>
              <Field label="Minutes past the booked time">
                <input type="number" min={0} step={5} className="ros-input" value={mins} onChange={(e) => setMins(e.target.value)} />
              </Field>
            </Grid>
            <div style={{ marginTop: 12 }}>
              <Callout tone={m ? "warn" : "ok"} title={m ? m + " minute" + (m === 1 ? "" : "s") + " over = " + extraH + " extra hour" + (extraH === 1 ? "" : "s") + " = " + euro(extraH * calcL.hourlyRate) : "No extra time, no extra charge"}>
                {m ? "Billed as ceil(" + m + " ÷ 60) = " + extraH + " × " + euro(calcL.hourlyRate) + " (" + calcL.short + " SAC rate). Shown on the invoice as its own line." : "Enter minutes to see the charge."}
              </Callout>
            </div>
            <div style={{ marginTop: 10 }}>
              <KV items={[["Late booking, 3h After School at " + hl.short, euro(3 * hl.hourlyRate) + " + " + euro(s.config.lateFee) + " late fee + " + euro(s.config.transportFee) + " bus = " + euro(3 * hl.hourlyRate + s.config.lateFee + s.config.transportFee)], ["Early Years full day at " + hl.short, euro(hl.eyDayRate) + " per day"]]} cols={1} />
            </div>
          </Card>
          <Card title="NCS contribution is its own line" sub="Programme subsidy is shown separately from Ray of Sunshine charges on every invoice." right={nolan ? <RecLink r={{ kind: "invoice", id: nolan.id }} /> : undefined}>
            {nolan ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                <Row><span style={{ flex: 1 }}>Charges ({family(nolan.familyId)?.surname}, w/c {fmtDate(nolan.weekOf)})</span><span>{euro(nCharges)}</span></Row>
                {nolan.lines.filter(l => l.kind === "NCS subsidy").map(l => <Row key={l.id}><span style={{ flex: 1, color: "var(--info)" }}>{l.label}</span><span style={{ color: "var(--info)" }}>{euro(l.amount)}</span></Row>)}
                {nOther !== 0 && <Row><span style={{ flex: 1, color: "var(--ok)" }}>Credits</span><span>{euro(nOther)}</span></Row>}
                <Row style={{ borderTop: "1px solid var(--border)", paddingTop: 6, fontWeight: 600 }}><span style={{ flex: 1 }}>Parent pays</span><span>{euro(nCharges + nSub + nOther)}</span></Row>
                <Row wrap gap={6} style={{ marginTop: 6 }}><Badge tone="info">NCS programme rule</Badge><Sub>subsidy applies to agreed hours only</Sub></Row>
                <Row wrap gap={6}><Badge tone="brand">Ray of Sunshine policy</Badge><Sub>hours above the award are charged privately at the site rate</Sub></Row>
              </div>
            ) : <Empty title="Example invoice not found" />}
          </Card>
          <Card title="Siblings" sub="Ray of Sunshine policy text (demo).">
            <div style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.6 }}>No automatic sibling discount on weekly sessions, so every invoice line is billed at the site rate. Siblings get priority on waitlists and first refusal on camp places. Any goodwill reduction is a credit adjustment approved by Accounts.</div>
          </Card>
        </Stack>
      </div>
    </div>
  );
}

/* ================= Statements & Exports ================= */
let consumedStatementFocus = "";
function Statements() {
  const { s, ui, v } = useRos();
  const rawFocus = ui.focus.statementFamily && ui.focus.statementFamily !== consumedStatementFocus ? ui.focus.statementFamily : "";
  const [fid, setFid] = useState<string>(focusValue(rawFocus) || "ROS1096");
  const [q, setQ] = useState("");
  const [exp, setExp] = useState<string>("invoices");
  useEffect(() => { if (rawFocus) consumedStatementFocus = rawFocus; }, [rawFocus]);
  const f = family(fid);
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase(); if (t.length < 2) return [];
    return s.families.filter(x => inScope(x.locationId) && (x.id.toLowerCase().includes(t) || x.surname.toLowerCase().includes(t) || x.guardians.some(g => g.name.toLowerCase().includes(t)))).slice(0, 8);
  }, [q, s.families]);
  const ledger = useMemo(() => {
    if (!f) return [] as { date: string; desc: string; ref: string; debit: number; credit: number; bal: number }[];
    const ev: { date: string; desc: string; ref: string; debit: number; credit: number }[] = [];
    for (const i of idx().invoicesByFamily.get(f.id) || []) ev.push({ date: i.issued, desc: "Invoice · week of " + fmtDate(i.weekOf) + (i.planId ? " · plan " + i.planId : ""), ref: i.id, debit: Math.max(0, invoiceTotal(i)), credit: 0 });
    for (const p of idx().paymentsByFamily.get(f.id) || []) {
      if (p.status === "Succeeded") ev.push({ date: p.date, desc: "Payment · " + p.method, ref: p.invoiceId || p.planId || p.ref, debit: 0, credit: p.amount });
      else if (p.status === "Failed") ev.push({ date: p.date, desc: "Failed payment · " + p.ref, ref: p.invoiceId || "", debit: 0, credit: 0 });
    }
    ev.sort((a, b) => a.date.localeCompare(b.date) || b.debit - a.debit);
    let bal = 0;
    return ev.map(e => { bal = round2(bal + e.debit - e.credit); return { ...e, bal }; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, v]);
  const invd = round2(ledger.reduce((n, e) => n + e.debit, 0)), paid = round2(ledger.reduce((n, e) => n + e.credit, 0));
  const due = f ? familyDue(f.id) : 0;
  const odAmt = f ? round2((idx().invoicesByFamily.get(f.id) || []).filter(i => invoiceStatus(i) === "Overdue" || invoiceStatus(i) === "Debt review").reduce((n, i) => n + invoiceBalance(i), 0)) : 0;

  const exports = useMemo(() => buildExports(), []);
  const cur = exports.find(e => e.id === exp) || exports[0];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const preview = useMemo(() => cur.rows(), [cur, v]);
  return (
    <div className="ros-split-even">
      <style>{"@media print{body *{visibility:hidden !important}.ros-print,.ros-print *{visibility:visible !important}.ros-print{position:absolute;left:0;top:0;width:100%;box-shadow:none !important}}"}</style>
      <Card title="Family statement" sub="Statement of account as the family would receive it. Search any family.">
        <Search value={q} onChange={setQ} placeholder="Surname, guardian or Parent ID" width="100%" />
        {matches.length > 0 && (
          <div style={{ marginTop: 6, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            {matches.map(m => <ListRow key={m.id} onClick={() => { setFid(m.id); setQ(""); }} title={m.surname + " · " + m.id} sub={m.guardians.map(g => g.name).join(", ") + " · " + locById(m.locationId)?.short} right={<StatusBadge s={paymentStatus(m)} />} />)}
          </div>
        )}
        {f ? (
          <>
            <div className="ros-print" style={{ marginTop: 14, background: "#fff", color: "#1d2433", borderRadius: 14, padding: "22px 22px 18px", boxShadow: "0 10px 30px rgba(0,0,0,.25)" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 220px", fontSize: 11.5, lineHeight: 1.5, color: "#4b5468" }}><div style={{ fontWeight: 700, color: "#060068", fontSize: 13 }}>Ray of Sunshine Morning, After School and Early Years Services</div>Hazelbrook Rise, Rathnew, Co. Wicklow, A67 HX39</div>
                <div style={{ textAlign: "right" }}><div style={{ fontSize: 17, fontWeight: 700, color: "#060068" }}>Statement of account</div><div style={{ fontSize: 11, color: "#6b7280" }}>As at {fmtDateY(TODAY)}</div></div>
              </div>
              <div style={{ marginTop: 14, fontSize: 12, color: "#4b5468" }}>For <b style={{ color: "#1d2433" }}>{guardian(f)?.name}</b> · Parent ID <b style={{ color: "#1d2433" }}>{f.id}</b> · {locById(f.locationId)?.short} · pays by {f.method.toLowerCase()}</div>
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <div style={{ minWidth: 440 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 90px 72px 72px 78px", gap: 6, fontSize: 10.5, color: "#6b7280", borderBottom: "1px solid #e5e7eb", padding: "4px 0" }}><span>Date</span><span>Detail</span><span>Ref</span><span style={{ textAlign: "right" }}>Charged</span><span style={{ textAlign: "right" }}>Paid</span><span style={{ textAlign: "right" }}>Balance</span></div>
                  {ledger.map((e, k) => (
                    <div key={k} style={{ display: "grid", gridTemplateColumns: "70px 1fr 90px 72px 72px 78px", gap: 6, fontSize: 11.5, padding: "5px 0", borderBottom: "1px solid #f0f1f4", color: e.desc.startsWith("Failed") ? "#b42323" : "#1d2433" }}>
                      <span>{fmtDate(e.date)}</span><span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.desc}</span><span style={{ fontFamily: "var(--mono)", fontSize: 10.5 }}>{e.ref}</span>
                      <span style={{ textAlign: "right" }}>{e.debit ? euro(e.debit) : ""}</span><span style={{ textAlign: "right" }}>{e.credit ? euro(e.credit) : ""}</span><span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{euro(e.bal)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 10, fontSize: 12.5 }}>
                <div style={{ display: "flex", padding: "3px 0" }}><span style={{ flex: 1, color: "#4b5468" }}>Total charged</span><span>{euro(invd)}</span></div>
                <div style={{ display: "flex", padding: "3px 0" }}><span style={{ flex: 1, color: "#4b5468" }}>Total paid</span><span>{euro(paid)}</span></div>
                {odAmt > 0 && <div style={{ display: "flex", padding: "3px 0", color: "#b42323" }}><span style={{ flex: 1 }}>Of which overdue</span><span>{euro(odAmt)}</span></div>}
                <div style={{ display: "flex", padding: "8px 0 0", marginTop: 6, borderTop: "2px solid #060068", fontWeight: 700, color: "#060068", fontSize: 14 }}><span style={{ flex: 1 }}>Balance due</span><span>{euro(due)}</span></div>
              </div>
              <div style={{ marginTop: 12, fontSize: 10.5, color: "#6b7280", lineHeight: 1.5 }}>Direct debits not yet due are shown as charged and not yet paid. NCS subsidy is netted on each invoice. Demo statement: amounts are illustrative.</div>
            </div>
            <Row wrap gap={8} style={{ marginTop: 12 }}>
              <Btn variant="primary" onClick={() => window.print()}>Print statement</Btn>
              <Btn onClick={() => sendStatement({ familyId: f.id })}>Send to family (simulated)</Btn>
              <Btn onClick={() => { downloadCsv("statement-" + f.id + ".csv", [["Date", "Detail", "Reference", "Charged", "Paid", "Balance"], ...ledger.map(e => [e.date, e.desc, e.ref, e.debit.toFixed(2), e.credit.toFixed(2), e.bal.toFixed(2)])]); logExport({ what: "Statement " + f.id, rows: ledger.length }); }}>Download CSV</Btn>
              <Btn variant="subtle" onClick={() => openRecord({ kind: "family", id: f.id })}>Open family</Btn>
            </Row>
          </>
        ) : <Empty title="Pick a family" />}
      </Card>
      <Stack gap={16}>
        <Card title="Exports" sub="Generated in your browser from the live records. Nothing is sent anywhere.">
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {exports.map(e => (
              <ListRow key={e.id} onClick={() => setExp(e.id)} tone={exp === e.id ? "accent" : undefined}
                title={<Row wrap gap={8}><span>{e.name}</span>{e.proposed && <Badge tone="info">Proposed connection</Badge>}</Row>} sub={e.desc}
                right={<Btn size="sm" onClick={() => { const r = e.rows(); downloadCsv(e.file, r); logExport({ what: e.name, rows: r.length - 1 }); }}>CSV</Btn>} />
            ))}
          </div>
        </Card>
        <Card title={"Preview · " + cur.name} sub={(preview.length - 1).toLocaleString("en-IE") + " rows. First six shown."} right={cur.proposed ? <DemoTag>Mapping to be confirmed with the accountant</DemoTag> : undefined}>
          <div className="ros-scroll-x">
            <table style={{ borderCollapse: "collapse", fontSize: 11.5, minWidth: 560 }}>
              <thead><tr>{preview[0].map((h, k) => <th key={k} style={{ textAlign: "left", padding: "6px 8px", color: "var(--faint)", fontWeight: 500, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
              <tbody>{preview.slice(1, 7).map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", color: "var(--body)" }}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </Card>
      </Stack>
    </div>
  );
}

function buildExports() {
  const scopedInv = () => getState().invoices.filter(i => inScope(family(i.familyId)?.locationId));
  const bucket = (d: number) => d <= 7 ? "0-7" : d <= 30 ? "8-30" : d <= 60 ? "31-60" : "60+";
  return [
    { id: "invoices", name: "Invoices", file: "ros-invoices.csv", desc: "Every invoice with totals, balance, status and reminder stage.", proposed: false,
      rows: () => [["Invoice", "Parent ID", "Family", "Location", "Week of", "Issued", "Due", "Total", "Paid", "Balance", "Status", "Stage", "Plan"] as (string | number)[]].concat(scopedInv().map(i => { const f = family(i.familyId)!; const st = invoiceStatus(i); return [i.id, f.id, f.surname, locById(f.locationId)?.short || "", i.weekOf, i.issued, i.due, invoiceTotal(i).toFixed(2), invoicePaid(i).toFixed(2), invoiceBalance(i).toFixed(2), st, st === "Overdue" || st === "Debt review" ? reminderStage(i).label.replace(" · ", ": ") : "", i.planId || ""]; })) },
    { id: "aged", name: "Aged debt", file: "ros-aged-debt.csv", desc: "Overdue invoices with days overdue, bucket and stage.", proposed: false,
      rows: () => [["Invoice", "Parent ID", "Family", "Location", "Due", "Days overdue", "Bucket", "Balance", "Stage", "Plan"] as (string | number)[]].concat(overdueInvoices().map(i => { const f = family(i.familyId)!; return [i.id, f.id, f.surname, locById(f.locationId)?.short || "", i.due, daysOverdue(i), bucket(daysOverdue(i)), invoiceBalance(i).toFixed(2), reminderStage(i).label.replace(" · ", ": "), i.planId || ""]; })) },
    { id: "payments", name: "Payments", file: "ros-payments.csv", desc: "Succeeded, failed and pending payments with method and reference.", proposed: false,
      rows: () => [["Payment", "Parent ID", "Family", "Date", "Amount", "Method", "Status", "Invoice", "Plan", "Reference"] as (string | number)[]].concat(getState().payments.filter(p => inScope(family(p.familyId)?.locationId)).slice().sort((a, b) => b.date.localeCompare(a.date)).map(p => [p.id, p.familyId, family(p.familyId)?.surname || "", p.date, p.amount.toFixed(2), p.method, p.status, p.invoiceId || "", p.planId || "", p.ref])) },
    { id: "xero", name: "Xero sales invoices", file: "ros-xero-sales-invoices.csv", desc: "One row per invoice line in Xero's sales invoice import layout.", proposed: true,
      rows: () => [["*ContactName", "EmailAddress", "*InvoiceNumber", "*InvoiceDate", "*DueDate", "*Description", "*Quantity", "*UnitAmount", "*AccountCode", "*TaxType", "TrackingName1", "TrackingOption1"] as (string | number)[]].concat(scopedInv().filter(i => i.issued >= "2026-10-01").flatMap(i => { const f = family(i.familyId)!; const g = guardian(f); return i.lines.map(l => [g?.name || f.surname, g?.email || "", i.id, i.issued, i.due, l.label, l.qty, l.rate.toFixed(2), l.kind === "NCS subsidy" ? "4100" : "4000", "Exempt (to confirm)", "Location", locById(f.locationId)?.short || ""]); })) },
    { id: "sage", name: "Sage 50 sales invoices", file: "ros-sage50-invoices.csv", desc: "One row per invoice in Sage 50 audit trail import layout.", proposed: true,
      rows: () => [["Type", "Account Reference", "Nominal A/C Ref", "Department Code", "Date", "Reference", "Details", "Net Amount", "Tax Code", "Tax Amount"] as (string | number)[]].concat(scopedInv().filter(i => i.issued >= "2026-10-01").map(i => [invoiceTotal(i) < 0 ? "SC" : "SI", i.familyId, "4000", family(i.familyId)?.locationId || "", i.issued, i.id, "Childcare w/c " + i.weekOf, Math.abs(invoiceTotal(i)).toFixed(2), "T2", "0.00"])) },
  ];
}
