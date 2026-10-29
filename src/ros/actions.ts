/* Demo actions. Each one changes the shared records in a single step and
   writes who did it to Activity, so every screen that reads those records
   moves together. Messages, payments and referrals are simulated: nothing
   leaves the browser. */
import { defineAction, setClock, pushToast } from "./store";
import type { RosState, Approval, Booking, LocationId, Ref, Session, Message, Shift } from "./types";
import { TODAY, addDays, round2, toMin, PM_MIN, fmtDay, euro } from "./time";

const fam = (s: RosState, id: string) => s.families.find(f => f.id === id)!;
const kid = (s: RosState, id: string) => s.children.find(c => c.id === id)!;
const stf = (s: RosState, id: string) => s.staff.find(x => x.id === id)!;
const loc = (s: RosState, id: string) => s.locations.find(l => l.id === id)!;
const total = (lines: { amount: number }[]) => round2(lines.reduce((n, l) => n + l.amount, 0));
const mondayOf = (d: string) => { const day = new Date(d + "T00:00:00Z").getUTCDay(); return addDays(d, -((day + 6) % 7)); };
const closeTasks = (s: RosState, link: Ref) => s.tasks.forEach(t => { if (t.link && t.link.kind === link.kind && t.link.id === link.id) t.status = "Done"; });

/* ---------------- staffing ---------------- */
function addRelief(s: RosState, issueId: string, staffId: string, ctx: any) {
  const iss = s.issues.find(i => i.id === issueId);
  if (!iss || iss.status === "Resolved") return;
  const x = stf(s, staffId), l = loc(s, iss.locationId);
  const isArk = iss.locationId === "ARR";
  s.shifts.push({ id: ctx.id("SH"), staffId, locationId: iss.locationId, date: iss.date, session: iss.session as Shift["session"], roomId: iss.locationId + "-SAC",
    start: isArk ? "09:00" : "13:45", end: isArk ? "17:30" : "18:15", status: "approved", relief: true });
  iss.status = "Resolved"; iss.resolvedBy = ctx.actor; iss.resolvedAt = ctx.now;
  s.approvals.forEach(a => { if (a.status === "Pending" && a.link?.kind === "issue" && a.link.id === issueId) { a.status = "Approved"; a.decidedBy = ctx.actor; a.decidedAt = ctx.now; } });
  closeTasks(s, { kind: "issue", id: issueId });
  ctx.log({ category: "Staffing", title: "Relief approved: " + x.name + " → " + l.short, detail: fmtDay(iss.date) + " " + (isArk ? "09:00–17:30" : "13:45–18:15") + ". " + iss.session + " now " + ((iss.rostered || 0) + 1) + " of " + iss.required + " required. " + issueId + " resolved.", link: { kind: "issue", id: issueId }, locationId: iss.locationId });
  ctx.agent("rota", "Relief confirmed: " + x.name + " to " + l.short + "; forecast restored to " + ((iss.rostered || 0) + 1) + "/" + iss.required, "action", { kind: "issue", id: issueId });
}
export const approveRelief = defineAction<{ issueId: string; staffId: string }>("relief.approve", (s, p, ctx) => addRelief(s, p.issueId, p.staffId, ctx),
  { toast: () => "Relief approved. Rota, ratio forecast, Work and Activity updated.", undo: true });

export const assignShift = defineAction<{ staffId: string; locationId: LocationId; date: string; session: Session }>("shift.assign", (s, p, ctx) => {
  const x = stf(s, p.staffId);
  if (x.certs.some(c => c.kind === "Garda vetting" && c.expires < TODAY)) return;
  s.shifts.push({ id: ctx.id("SH"), staffId: p.staffId, locationId: p.locationId, date: p.date, session: p.session as Shift["session"], roomId: p.locationId + "-SAC", start: p.session === "Morning" ? "07:15" : "13:45", end: p.session === "Morning" ? "09:15" : "18:15", status: "approved" });
  ctx.log({ category: "Staffing", title: "Shift added: " + x.name, detail: loc(s, p.locationId).short + " · " + fmtDay(p.date) + " · " + p.session, link: { kind: "staff", id: p.staffId }, locationId: p.locationId });
}, { toast: () => "Shift added to the rota.", undo: true });

/* ---------------- approvals ---------------- */
function applyApproval(s: RosState, a: Approval, ctx: any) {
  const f = a.link?.kind === "family" ? fam(s, a.link.id) : undefined;
  switch (a.kind) {
    case "Relief shift": case "Ratio cover": {
      const iss = s.issues.find(i => i.id === a.link?.id);
      if (iss) addRelief(s, iss.id, (iss.offerStaffIds || [])[0], ctx);
      return;
    }
    case "Booking block":
      if (f) { f.blocked = true; f.flags = Array.from(new Set(f.flags.concat("Booking blocked"))); ctx.comm(f.id, "App", "out", "Bookings restricted until the overdue balance is cleared (Accounts approval)"); }
      break;
    case "Debt collection pack": {
      const plan = s.plans.find(pl => pl.familyId === a.link?.id);
      if (plan) plan.nextAction = "Pack reviewed by owner. Demo only: no referral is sent.";
      ctx.agent("collections", "Owner approved the Doyle debt pack. Logged only; nothing sent externally.", "action", a.link);
      break;
    }
    case "NCS private-charge proposal":
      if (f) ctx.comm(f.id, "App", "out", "Camp-week hours without a valid CHICK will be charged privately (€168.00) unless the CHICK arrives by Thu 22 Oct 12:00");
      break;
    case "Credit adjustment": {
      const inv = s.invoices.filter(i => i.familyId === a.link?.id).sort((x, y) => y.weekOf.localeCompare(x.weekOf))[0];
      if (inv) inv.lines.push({ id: ctx.id("L"), kind: "Credit", label: "Goodwill credit · late collection dispute (" + a.id + ")", qty: 1, rate: -(a.amount || 0), amount: -(a.amount || 0), addedBy: ctx.actor });
      if (f) ctx.comm(f.id, "Email", "out", "€" + (a.amount || 0).toFixed(2) + " credit applied to " + (inv?.id || "invoice"));
      break;
    }
    case "Incident notification": {
      const inc = s.incidents.find(i => i.status === "Awaiting signature");
      if (inc) { const c = kid(s, inc.childId); ctx.comm(c.familyId, "App", "out", "Incident summary " + inc.id + " shared for signature"); }
      break;
    }
    case "Closure broadcast":
      s.messages.push({ id: ctx.id("MSG"), queue: "Cork", from: "Ray of Sunshine", subject: "Thursday closure (weather)", body: "Simulated broadcast to Canovee families. Not sent.", received: ctx.now, classification: "Broadcast", confidence: 1, status: "Closed", direction: "out", channel: "App" });
      break;
  }
}
export const decideApproval = defineAction<{ id: string; decision: "Approved" | "Declined" }>("approval.decide", (s, p, ctx) => {
  const a = s.approvals.find(x => x.id === p.id);
  if (!a || a.status !== "Pending") return;
  if (p.decision === "Approved") applyApproval(s, a, ctx);
  a.status = p.decision; a.decidedBy = ctx.actor; a.decidedAt = ctx.now;
  s.tasks.forEach(t => { if (t.link?.kind === "approval" && t.link.id === a.id) t.status = "Done"; });
  ctx.log({ category: a.kind === "Relief shift" || a.kind === "Ratio cover" ? "Staffing" : a.kind.includes("NCS") ? "NCS" : a.kind === "Incident notification" ? "Safeguarding" : a.kind === "Closure broadcast" ? "Communications" : "Financial",
    title: a.kind + " " + p.decision.toLowerCase(), detail: a.title + (p.decision === "Approved" ? ". " + a.effect + "." : ". No change made."), link: a.link || { kind: "approval", id: a.id } });
}, { toast: (p) => p.decision === "Approved" ? "Approved. Linked records updated." : "Declined. Nothing changed downstream.", undo: true });

/* ---------------- booking requests ---------------- */
export const decideRequest = defineAction<{ id: string; decision: "Approved" | "Declined"; note?: string }>("request.decide", (s, p, ctx) => {
  const r = s.requests.find(x => x.id === p.id);
  if (!r || r.status !== "Pending") return;
  const f = fam(s, r.familyId), c = kid(s, r.childId), l = loc(s, r.locationId);
  r.status = p.decision; r.decidedBy = ctx.actor; r.decidedAt = ctx.now;
  closeTasks(s, { kind: "request", id: r.id });
  const msg = r.messageId ? s.messages.find(m => m.id === r.messageId) : undefined;
  if (p.decision === "Declined") {
    if (msg) msg.status = "Replied";
    ctx.comm(f.id, "Email", "out", r.kind + " " + r.id + " declined" + (p.note ? ": " + p.note : ""));
    ctx.log({ category: "Operations", title: r.kind + " declined (" + r.id + ")", detail: c.firstName + " " + c.surname + " · " + fmtDay(r.date) + ". No booking, invoice, register or manifest change.", link: { kind: "request", id: r.id }, locationId: r.locationId });
    return;
  }
  const weekOf = mondayOf(r.date);
  let inv = s.invoices.find(i => i.familyId === f.id && i.weekOf === weekOf);
  if (r.kind === "Late booking") {
    const hours = Math.ceil((toMin(r.end) - toMin(r.start)) / 60);
    const b: Booking = { id: ctx.id("BK"), childId: c.id, familyId: f.id, locationId: r.locationId, date: r.date, session: r.session, start: r.start, end: r.end, hours, funding: "Private", routeId: r.routeId, schoolId: r.schoolId, roomId: c.roomId, status: "Booked", source: "Late request" };
    s.bookings.push(b);
    // A week already paid in full gets a small supplementary invoice; otherwise the lines join the week's invoice (INV-20418 for the Nolans).
    const paidAlready = inv && total(inv.lines) > 0 && s.payments.filter(x => x.invoiceId === inv!.id && x.status === "Succeeded").reduce((n, x) => n + x.amount, 0) >= total(inv.lines);
    if (!inv || paidAlready) { inv = { id: ctx.id("INV"), familyId: f.id, weekOf, issued: TODAY, due: TODAY, lines: [], note: "Supplementary invoice for " + r.id }; s.invoices.push(inv); }
    const before = total(inv.lines);
    for (const fee of r.fees) inv.lines.push({ id: ctx.id("L"), kind: fee.label.startsWith("Late") ? "Late booking fee" : fee.label.startsWith("School") ? "Transport" : "Session", label: c.firstName + " · " + fee.label + " · " + fmtDay(r.date) + " (" + r.id + ")", childId: c.id, date: r.date, qty: fee.qty, rate: fee.rate, amount: fee.amount, bookingId: b.id, addedBy: ctx.actor });
    const after = total(inv.lines), add = round2(after - before);
    if (msg) msg.status = "Replied";
    ctx.comm(f.id, "Email", "out", "Late booking " + r.id + " confirmed: " + fmtDay(r.date) + " " + r.start + "–" + r.end + ". " + euro(add) + " added to " + inv.id + ".");
    ctx.log({ category: "Operations", title: "Late booking approved (" + r.id + ")", detail: c.firstName + " " + c.surname + " booked " + fmtDay(r.date) + " " + r.start + "–" + r.end + " at " + l.short + ". Register +1" + (r.routeId ? ", manifest " + r.routeId + " +1" : "") + ".", link: { kind: "request", id: r.id }, locationId: r.locationId });
    ctx.log({ category: "Financial", title: inv.id + " updated: " + euro(before) + " → " + euro(after), detail: r.fees.map(x => x.label + " " + euro(x.amount)).join(" · ") + " (demo fee rules)", link: { kind: "invoice", id: inv.id }, locationId: r.locationId, actor: "Billing", actorKind: "system" });
    if (r.routeId) ctx.log({ category: "Transport", title: "Manifest " + r.routeId + " updated for " + fmtDay(r.date), detail: c.firstName + " " + c.surname + " added at " + (s.schools.find(x => x.id === r.schoolId)?.name || "school") + ".", link: { kind: "route", id: r.routeId }, locationId: r.locationId, actor: "Transport agent", actorKind: "agent" });
    ctx.agent("bookings", r.id + " approved by " + ctx.actor + ": booking, invoice (" + euro(add) + "), register and manifest written together", "action", { kind: "request", id: r.id });
  } else if (r.kind === "Change") {
    const b = s.bookings.find(x => x.id === r.bookingId);
    if (b) {
      const oldH = b.hours; b.end = r.end; b.hours = Math.ceil((toMin(b.end) - toMin(b.start)) / 60);
      // Locked week: extra hours are charged, fewer hours are not refunded (published fee terms).
      const ln = inv?.lines.find(x => x.bookingId === b.id && x.kind === "Session");
      const charged = !!ln && b.hours > ln.qty;
      if (ln && charged) { ln.qty = b.hours; ln.amount = round2(b.hours * ln.rate); ln.label = c.firstName + " · After School · " + b.hours + "h (changed " + r.id + ")"; }
      ctx.log({ category: "Operations", title: "Change approved (" + r.id + ")", detail: c.firstName + " " + c.surname + " · " + fmtDay(r.date) + " now " + b.start + "–" + b.end + " (" + oldH + "h → " + b.hours + "h). " + (charged ? "Invoice line updated for the extra time." : "Locked week: billed as originally booked, no refund."), link: { kind: "request", id: r.id }, locationId: r.locationId });
    }
    ctx.comm(f.id, "App", "out", "Change " + r.id + " confirmed for " + fmtDay(r.date));
  } else {
    const b = s.bookings.find(x => x.id === r.bookingId);
    if (b) b.status = "Cancelled";
    ctx.comm(f.id, "App", "out", "Cancellation " + r.id + " noted. The week is locked, so no refund applies under the published fee terms.");
    ctx.log({ category: "Operations", title: "Cancellation recorded (" + r.id + ")", detail: c.firstName + " " + c.surname + " removed from " + fmtDay(r.date) + " register. Locked week: invoice unchanged (no refund under published policy).", link: { kind: "request", id: r.id }, locationId: r.locationId });
  }
}, { toast: (p) => p.decision === "Approved" ? "Approved. Booking, invoice, register and manifest updated together." : "Declined. Downstream records untouched.", undo: true });

/* ---------------- NCS ---------------- */
export const sendClaimReminder = defineAction<{ claimId: string }>("ncs.claimReminder", (s, p, ctx) => {
  const cl = s.claims.find(x => x.id === p.claimId); if (!cl) return;
  const day = Math.min(7, Math.max(1, Math.round((Date.parse(ctx.now.replace(" ", "T")) - Date.parse(cl.raised + "T09:00")) / 86400000)));
  cl.reminders.push({ day, at: ctx.now, channel: "App + SMS" });
  const c = kid(s, cl.childId);
  ctx.comm(cl.familyId, "App + SMS", "out", "Reminder: accept NCS claim " + cl.id + " (" + euro(cl.amount) + ") before " + cl.deadline.slice(11) + " " + fmtDay(cl.deadline.slice(0, 10)) + " (simulated, not sent)", "NCS agent");
  ctx.agent("ncs", "Claim reminder for " + cl.id + " (" + c.firstName + " " + c.surname + ", " + euro(cl.amount) + ") sent on " + ctx.actor + "'s say-so", "action", { kind: "claim", id: cl.id });
  ctx.log({ category: "NCS", title: "Claim reminder sent: " + cl.id, detail: c.firstName + " " + c.surname + " · " + euro(cl.amount) + " · lapses " + cl.deadline + ". Simulated message.", link: { kind: "claim", id: cl.id }, locationId: c.locationId });
}, { toast: () => "Reminder logged to the family timeline and the NCS agent log (simulated send)." });

export const acceptClaim = defineAction<{ claimId: string }>("ncs.accept", (s, p, ctx) => {
  const cl = s.claims.find(x => x.id === p.claimId); if (!cl || cl.status !== "Awaiting acceptance") return;
  cl.status = "Accepted";
  closeTasks(s, { kind: "claim", id: cl.id });
  ctx.comm(cl.familyId, "Portal", "in", "Accepted NCS claim " + cl.id + " (demo portal)");
  ctx.log({ category: "NCS", title: "Claim accepted: " + cl.id, detail: "Parent accepted in the demo portal. " + euro(cl.amount) + " subsidy confirmed for " + cl.period + ".", link: { kind: "claim", id: cl.id }, locationId: kid(s, cl.childId).locationId });
}, { toast: () => "Claim marked accepted (demo)." });

export const prepareHoursReminder = defineAction<{ familyId: string; booked: number; agreed: number }>("ncs.prepareHours", (s, p, ctx) => {
  const f = fam(s, p.familyId);
  if (s.messages.some(m => m.familyId === f.id && m.classification === "NCS hours reminder" && m.status === "Drafted")) return;
  const g = f.guardians[0];
  s.messages.push({ id: ctx.id("MSG"), queue: "NCS", familyId: f.id, from: "NCS team", subject: "Your NCS hours for w/c 2 Nov", direction: "out", channel: "App",
    body: "", received: ctx.now, classification: "NCS hours reminder", confidence: 1, status: "Drafted", tone: "Helpful",
    draft: "Hi " + g.name.split(" ")[0] + ", you've booked " + p.booked + " of your " + p.agreed + " agreed NCS hours for the week of 2 November. Booking your full agreed hours keeps your subsidy in line with your award. The booking window closes Thursday 22 Oct at 6pm. Reply here if you'd like a hand. NCS team",
    link: { kind: "family", id: f.id } });
  s.tasks.push({ id: ctx.id("TSK"), title: "Send NCS hours reminder: " + f.surname + " (" + p.booked + "/" + p.agreed + "h)", owner: "Lorraine Tobin", due: "Thu 22 Oct", dueDate: "2026-10-22", priority: "Medium", department: "NCS", status: "Not started", link: { kind: "family", id: f.id }, source: "NCS agent", locationId: f.locationId });
  ctx.agent("ncs", "Prepared under-booked hours reminder for " + f.surname + " (" + f.id + "): " + p.booked + " of " + p.agreed + "h", "proposal", { kind: "family", id: f.id });
  ctx.log({ category: "NCS", title: "Hours reminder drafted: " + f.surname, detail: p.booked + " of " + p.agreed + " agreed hours booked for w/c 2 Nov. Draft waits for review.", link: { kind: "family", id: f.id }, locationId: f.locationId });
}, { toast: () => "Draft hours reminder created and a task added for the NCS team." });

export const sendDraft = defineAction<{ messageId: string; text?: string }>("message.send", (s, p, ctx) => {
  const m = s.messages.find(x => x.id === p.messageId); if (!m) return;
  if (p.text) m.draft = p.text;
  m.status = m.direction === "out" ? "Closed" : "Replied";
  if (m.familyId) ctx.comm(m.familyId, m.channel, "out", (m.direction === "out" ? m.subject : "Reply: " + m.subject) + " (simulated, not sent)");
  s.tasks.forEach(t => { if (m.familyId && t.link?.kind === "family" && t.link.id === m.familyId && t.title.startsWith("Send NCS hours")) t.status = "Done"; });
  ctx.log({ category: "Communications", title: (m.direction === "out" ? "Message sent: " : "Reply sent: ") + m.subject, detail: "To " + (m.familyId ? fam(s, m.familyId).surname + " family (" + m.familyId + ")" : m.from) + " by " + m.channel + ". Simulated: nothing left the demo.", link: m.familyId ? { kind: "family", id: m.familyId } : { kind: "message", id: m.id } });
  ctx.agent("inbox", "Reply to “" + m.subject + "” approved by " + ctx.actor + " (simulated send)", "action", { kind: "message", id: m.id });
}, { toast: () => "Sent (simulated). Logged to the family timeline." });

export const escalateMessage = defineAction<{ messageId: string }>("message.escalate", (s, p, ctx) => {
  const m = s.messages.find(x => x.id === p.messageId); if (!m) return;
  m.status = "Escalated";
  s.tasks.push({ id: ctx.id("TSK"), title: "Escalated: " + m.subject, owner: m.queue === "Accounts" ? "Gráinne Whelan" : m.queue === "NCS" ? "Lorraine Tobin" : "Deirdre Kinsella", due: "Today", dueDate: TODAY, priority: "Medium", department: m.queue === "Accounts" ? "Accounts" : m.queue === "NCS" ? "NCS" : "Operations", status: "Not started", link: { kind: "message", id: m.id }, source: "Inbox agent" });
  ctx.log({ category: "Communications", title: "Message escalated: " + m.subject, detail: "Routed to a person for review.", link: { kind: "message", id: m.id } });
}, { toast: () => "Escalated to a person, task created." });

/* ---------------- transport and attendance ---------------- */
export const advanceAfternoon = () => setClock({ min: PM_MIN });
export const board = defineAction<{ routeId: string; childId: string; time: string }>("transport.board", (s, p, ctx) => {
  if (s.attendance.some(a => a.childId === p.childId && a.date === TODAY && a.kind === "boarded")) return;
  s.clockMin = Math.max(s.clockMin, toMin(p.time));
  const c = kid(s, p.childId), rt = s.routes.find(r => r.id === p.routeId)!;
  s.attendance.push({ id: ctx.id("AT"), childId: c.id, date: TODAY, kind: "boarded", time: p.time, by: stf(s, rt.driverId).name, routeId: rt.id });
  ctx.comm(c.familyId, "Push", "out", c.firstName + " boarded " + rt.id + " at " + p.time + " (simulated notification)", "Transport agent");
  ctx.log({ category: "Transport", title: c.firstName + " " + c.surname + " boarded " + rt.id + " at " + p.time, detail: "At " + (s.schools.find(x => x.id === c.schoolId)?.name || "school") + ". Parent notified in MyRosKids (simulated).", link: { kind: "child", id: c.id }, locationId: rt.locationId, actor: stf(s, rt.driverId).name });
}, { toast: () => "Boarded. Parent app and route log updated." });

export const markNotPresent = defineAction<{ routeId: string; childId: string; time: string }>("transport.missing", (s, p, ctx) => {
  const c = kid(s, p.childId), rt = s.routes.find(r => r.id === p.routeId)!;
  if (s.issues.some(i => i.kind === "Missing child" && i.title.includes(c.firstName + " " + c.surname) && i.status === "Open")) return;
  s.attendance.push({ id: ctx.id("AT"), childId: c.id, date: TODAY, kind: "not-present", time: p.time, by: stf(s, rt.driverId).name, routeId: rt.id });
  const issueId = ctx.id("MISS");
  s.issues.push({ id: issueId, kind: "Missing child", locationId: rt.locationId, date: TODAY, session: "After School", status: "Open",
    title: "Not at pickup: " + c.firstName + " " + c.surname + " (" + rt.id + ")", detail: "Driver reported " + c.firstName + " not present at " + (s.schools.find(x => x.id === c.schoolId)?.name || "school") + " at " + p.time + ". Booked and expected. A person must confirm the child's whereabouts; this alert cannot be closed automatically." });
  s.tasks.push({ id: ctx.id("TSK"), title: "URGENT: confirm whereabouts of " + c.firstName + " " + c.surname, owner: loc(s, rt.locationId).managerId === "S010" ? "Siobhán Keogh" : stf(s, loc(s, rt.locationId).managerId).name, due: "Now", dueDate: TODAY, priority: "High", department: "Transport", status: "Not started", link: { kind: "issue", id: issueId }, source: "Driver", locationId: rt.locationId });
  ctx.log({ category: "Safeguarding", title: "Child not at pickup: " + c.firstName + " " + c.surname, detail: rt.id + " · reported by " + stf(s, rt.driverId).name + " at " + p.time + ". Location manager and parent call required. Requires human review.", link: { kind: "issue", id: issueId }, locationId: rt.locationId, actor: stf(s, rt.driverId).name });
  ctx.agent("transport", "Raised missing-child alert for " + c.firstName + " " + c.surname + "; escalated to location manager. Not resolvable by an agent.", "escalation", { kind: "issue", id: issueId });
}, { toast: () => "Urgent alert raised. Location manager tasked; a person must resolve it." });

export const resolveMissing = defineAction<{ issueId: string; note: string }>("transport.resolveMissing", (s, p, ctx) => {
  const i = s.issues.find(x => x.id === p.issueId); if (!i || i.status === "Resolved") return;
  i.status = "Resolved"; i.resolvedBy = ctx.actor; i.resolvedAt = ctx.now; i.detail += " Resolved by " + ctx.actor + ": " + p.note;
  closeTasks(s, { kind: "issue", id: i.id });
  ctx.log({ category: "Safeguarding", title: "Whereabouts confirmed", detail: p.note + " (confirmed by " + ctx.actor + ")", link: { kind: "issue", id: i.id }, locationId: i.locationId });
}, { toast: () => "Resolved by a person and logged." });

export const signIn = defineAction<{ childId: string; time: string; by: string; collector?: string; routeId?: string }>("attendance.in", (s, p, ctx) => {
  const c = kid(s, p.childId);
  s.clockMin = Math.max(s.clockMin, toMin(p.time));
  s.attendance.push({ id: ctx.id("AT"), childId: c.id, date: TODAY, kind: "in", time: p.time, by: p.by, collector: p.collector, routeId: p.routeId });
  ctx.comm(c.familyId, "Push", "out", c.firstName + " signed in at " + loc(s, c.locationId).short + " " + p.time + " (simulated notification)", "Kiosk");
  ctx.log({ category: "Operations", title: c.firstName + " " + c.surname + " signed in · " + p.time, detail: loc(s, c.locationId).short + (p.routeId ? " · arrived on " + p.routeId : "") + " · by " + p.by, link: { kind: "child", id: c.id }, locationId: c.locationId });
}, { toast: () => "Signed in. Register, site dashboard and parent app updated." });

export const signOut = defineAction<{ childId: string; time: string; by: string; collector: string; lateMins?: number }>("attendance.out", (s, p, ctx) => {
  const c = kid(s, p.childId);
  s.clockMin = Math.max(s.clockMin, toMin(p.time));
  s.attendance.push({ id: ctx.id("AT"), childId: c.id, date: TODAY, kind: "out", time: p.time, by: p.by, collector: p.collector });
  if (p.lateMins && p.lateMins > 0) {
    const inv = s.invoices.find(i => i.familyId === c.familyId && i.weekOf === "2026-10-19");
    const rate = loc(s, c.locationId).hourlyRate;
    if (inv) inv.lines.push({ id: ctx.id("L"), kind: "Late collection", label: c.firstName + " · collected " + p.time + " (" + p.lateMins + " min late, billed as 1 extra hour)", childId: c.id, date: TODAY, qty: 1, rate, amount: rate, addedBy: p.by });
  }
  ctx.comm(c.familyId, "Push", "out", c.firstName + " signed out " + p.time + " · collected by " + p.collector, "Kiosk");
  ctx.log({ category: "Operations", title: c.firstName + " " + c.surname + " signed out · " + p.time, detail: "Collected by " + p.collector + (p.lateMins ? " · late collection billed (next full hour rule)" : ""), link: { kind: "child", id: c.id }, locationId: c.locationId });
}, { toast: () => "Signed out. Collector check recorded." });

/* ---------------- money ---------------- */
export const reconcile = defineAction<{ bankId: string; invoiceId: string }>("bank.reconcile", (s, p, ctx) => {
  const bl = s.bank.find(b => b.id === p.bankId), inv = s.invoices.find(i => i.id === p.invoiceId);
  if (!bl || !inv || bl.status === "Matched") return;
  bl.status = "Matched";
  if (inv.planId) s.payments.push({ id: ctx.id("PAY"), familyId: inv.familyId, planId: inv.planId, date: bl.date, amount: bl.amount, method: "Bank transfer", status: "Succeeded", ref: bl.ref });
  else s.payments.push({ id: ctx.id("PAY"), familyId: inv.familyId, invoiceId: inv.id, date: bl.date, amount: bl.amount, method: "Bank transfer", status: "Succeeded", ref: bl.ref });
  if (inv.planId) { const pl = s.plans.find(x => x.id === inv.planId); const ins = pl?.instalments.find(x => x.status === "Missed" || x.status === "Due"); if (ins) ins.status = "Paid"; if (pl) pl.nextAction = "Instalment received " + bl.date.slice(8) + "/10 · next due " + (pl.instalments.find(x => x.status === "Scheduled")?.due || "—"); }
  ctx.log({ category: "Financial", title: "Bank line matched: " + euro(bl.amount) + " → " + inv.id, detail: "Reference “" + bl.ref + "”. " + (bl.suggestion?.confidence === "Ambiguous" ? "Ambiguous suggestion confirmed by " + ctx.actor + "." : "Exact match."), link: { kind: "invoice", id: inv.id } });
}, { toast: () => "Matched. Invoice, family balance and aged debt updated.", undo: true });

export const ignoreBank = defineAction<{ bankId: string }>("bank.ignore", (s, p, ctx) => {
  const bl = s.bank.find(b => b.id === p.bankId); if (!bl) return;
  bl.status = "Ignored";
  ctx.log({ category: "Financial", title: "Bank line set aside: " + euro(bl.amount), detail: "“" + bl.ref + "” left unmatched for manual review.", actorKind: "person" });
});

export const payNow = defineAction<{ invoiceId: string; method: string }>("invoice.pay", (s, p, ctx) => {
  const inv = s.invoices.find(i => i.id === p.invoiceId); if (!inv) return;
  const paid = s.payments.filter(x => x.invoiceId === inv.id && x.status === "Succeeded").reduce((n, x) => n + x.amount, 0);
  const bal = round2(total(inv.lines) - paid);
  if (bal <= 0) return;
  s.payments.push({ id: ctx.id("PAY"), familyId: inv.familyId, invoiceId: inv.id, date: TODAY, amount: bal, method: p.method + " (simulated)", status: "Succeeded", ref: "DEMO-" + inv.id });
  ctx.comm(inv.familyId, "App", "in", "Paid " + inv.id + " " + euro(bal) + " by " + p.method + " (simulated, no charge made)");
  ctx.log({ category: "Financial", title: "Payment received (simulated): " + inv.id, detail: euro(bal) + " by " + p.method + ". No real charge was made.", link: { kind: "invoice", id: inv.id } });
}, { toast: () => "Payment simulated. No card was charged." });

export const sendInvoiceReminder = defineAction<{ invoiceId: string; stage: string }>("invoice.remind", (s, p, ctx) => {
  const inv = s.invoices.find(i => i.id === p.invoiceId); if (!inv) return;
  ctx.comm(inv.familyId, "Email", "out", p.stage + " for " + inv.id + " (simulated)", "Collections agent");
  ctx.log({ category: "Financial", title: "Reminder sent: " + inv.id, detail: p.stage + " · simulated email to " + fam(s, inv.familyId).surname + " family.", link: { kind: "invoice", id: inv.id } });
}, { toast: () => "Reminder logged (simulated)." });

/* ---------------- tasks ---------------- */
export const toggleTask = defineAction<{ id: string }>("task.toggle", (s, p, ctx) => {
  const t = s.tasks.find(x => x.id === p.id); if (!t) return;
  t.status = t.status === "Done" ? "In progress" : "Done";
  ctx.log({ category: "Operations", title: "Task " + (t.status === "Done" ? "completed" : "reopened") + ": " + t.title, detail: "Owner " + t.owner, link: { kind: "task", id: t.id }, locationId: t.locationId });
});
export const addTask = defineAction<{ title: string; priority: "High" | "Medium" | "Low"; owner: string; link?: Ref }>("task.add", (s, p, ctx) => {
  s.tasks.unshift({ id: ctx.id("TSK"), title: p.title, owner: p.owner, due: "No due date", dueDate: addDays(TODAY, 7), priority: p.priority, department: "Operations", status: "Not started", link: p.link, source: ctx.actor });
  ctx.log({ category: "Operations", title: "Task created: " + p.title, detail: "Owner " + p.owner });
}, { toast: () => "Task added." });

/* ---------------- automations ---------------- */
export const toggleAutomation = defineAction<{ id: string }>("automation.toggle", (s, p, ctx) => {
  const a = s.automations.find(x => x.id === p.id); if (!a) return;
  a.on = !a.on;
  ctx.log({ category: "System", title: "Automation " + (a.on ? "resumed" : "paused") + ": " + a.name, detail: "Changed by " + ctx.actor, link: { kind: "automation", id: a.id } });
});
export const runAutomation = defineAction<{ id: string }>("automation.run", (s, p, ctx) => {
  const a = s.automations.find(x => x.id === p.id); if (!a) return;
  const n = Math.max(1, Math.round(a.delivered * 0.12));
  a.delivered += n; a.opened += Math.round(n * 0.8); a.actioned += Math.round(n * 0.35);
  a.runs.unshift({ at: ctx.now, result: "ok", summary: n + " " + (a.approval === "Draft only" ? "drafts prepared" : a.approval === "Approval required" ? "items queued for approval" : "messages simulated") + " · run by " + ctx.actor });
  if (a.approval !== "Automatic") s.tasks.push({ id: ctx.id("TSK"), title: "Review " + n + " item(s) from “" + a.name + "”", owner: a.owner, due: "Today", dueDate: TODAY, priority: "Medium", department: a.group === "NCS" ? "NCS" : a.group === "Collections" ? "Accounts" : a.group === "HR" ? "HR" : a.group === "Compliance" ? "Compliance" : a.group === "Enrolment" ? "Enrolment" : "Operations", status: "Not started", link: { kind: "automation", id: a.id }, source: a.owner });
  ctx.log({ category: "Communications", title: "Sequence run: " + a.name, detail: n + " recipients · " + a.channels.join(", ") + " · simulated, nobody contacted.", link: { kind: "automation", id: a.id }, actor: a.owner, actorKind: "agent" });
}, { toast: () => "Sequence run in demo mode. Metrics, Activity and Work updated; nobody was contacted." });

/* ---------------- broadcasts ---------------- */
export const sendBroadcast = defineAction<{ subject: string; audience: string; count: number; channels: string[] }>("broadcast.send", (s, p, ctx) => {
  const m: Message = { id: ctx.id("MSG"), queue: "General", from: "Ray of Sunshine", subject: p.subject, body: "Broadcast to " + p.audience + " (" + p.count + " families) via " + p.channels.join(", ") + ". Simulated.", received: ctx.now, classification: "Broadcast", confidence: 1, status: "Closed", direction: "out", channel: "App" };
  s.messages.push(m);
  ctx.log({ category: "Communications", title: "Broadcast queued (simulated): " + p.subject, detail: p.count + " families · " + p.audience + " · " + p.channels.join(", ") + ". Audit only; nothing sent.", link: { kind: "message", id: m.id } });
}, { toast: (p) => "Broadcast to " + p.count + " families simulated and written to the audit log." });

export function sessionTimeNow(s: RosState) { return s.clockMin; }
export { pushToast };
