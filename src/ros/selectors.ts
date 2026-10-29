/* Derived numbers. Nothing on any screen is typed in by hand: counts, totals,
   ratios and ages all come from the records through these functions, and
   they are cached per store version so a big table stays fast. */
import type { RosState, Invoice, LocationId, Session, Booking, Child, Family, NCSAward, Issue, Staff, Approval, Task } from "./types";
import { getState, getVersion, getUi, roleDef } from "./store";
import { TODAY, TOMORROW, THIS_WEEK, daysBetween, round2, hm, toMin } from "./time";

const cache = new Map<string, any>();
let cacheV = -1;
export function cached<T>(key: string, fn: () => T): T {
  const v = getVersion();
  if (v !== cacheV) { cache.clear(); cacheV = v; }
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

/* ---------------- indexes ---------------- */
export function idx() {
  return cached("idx", () => {
    const s = getState();
    const by = <T extends { id: string }>(a: T[]) => new Map(a.map(x => [x.id, x]));
    const group = <T,>(a: T[], k: (x: T) => string) => { const m = new Map<string, T[]>(); for (const x of a) { const key = k(x); if (!m.has(key)) m.set(key, []); m.get(key)!.push(x); } return m; };
    return {
      child: by(s.children), family: by(s.families), staff: by(s.staff), loc: by(s.locations), room: by(s.rooms),
      school: by(s.schools), route: by(s.routes), invoice: by(s.invoices), award: by(s.awards), plan: by(s.plans),
      bookingsByChild: group(s.bookings.filter(b => b.status === "Booked"), b => b.childId),
      bookingsByDate: group(s.bookings.filter(b => b.status === "Booked"), b => b.date),
      invoicesByFamily: group(s.invoices, i => i.familyId),
      paymentsByInvoice: group(s.payments.filter(p => p.status === "Succeeded" && p.invoiceId), p => p.invoiceId!),
      paymentsByFamily: group(s.payments, p => p.familyId),
      attendanceByChildDate: group(s.attendance, a => a.childId + "|" + a.date),
      shiftsByKey: group(s.shifts, x => x.locationId + "|" + x.date + "|" + x.session),
      awardByChild: new Map(s.awards.map(a => [a.childId, a])),
    };
  });
}
export const child = (id: string) => idx().child.get(id);
export const family = (id: string) => idx().family.get(id);
export const staffById = (id: string) => idx().staff.get(id);
export const locById = (id: string) => idx().loc.get(id as LocationId);
export const schoolName = (id?: string) => (id && idx().school.get(id)?.name) || "—";
export const childName = (c?: Child) => (c ? c.firstName + " " + c.surname : "—");
export const familyName = (f?: Family) => (f ? f.surname + " family" : "—");
export const guardian = (f?: Family) => f?.guardians.find(g => g.primary) || f?.guardians[0];

/* ---------------- role and location scope ---------------- */
export function scopeLoc(): LocationId | "ALL" {
  const ui = getUi(), r = roleDef(ui.role);
  if (r.scope !== "ALL") return r.scope;
  return ui.loc;
}
export const inScope = (loc?: string) => { const sc = scopeLoc(); return sc === "ALL" || !loc || loc === sc; };
export const scopedLocations = () => getState().locations.filter(l => inScope(l.id));

/* ---------------- money ---------------- */
export const invoiceTotal = (inv: Invoice) => round2(inv.lines.reduce((n, l) => n + l.amount, 0));
/** Plan instalments are allocated oldest invoice first. */
function planAllocations(): Map<string, number> {
  return cached("planAlloc", () => {
    const s = getState(), out = new Map<string, number>();
    for (const p of s.plans) {
      let paid = s.payments.filter(x => x.planId === p.id && x.status === "Succeeded").reduce((n, x) => n + x.amount, 0);
      for (const inv of s.invoices.filter(i => i.planId === p.id).sort((a, b) => a.due.localeCompare(b.due))) {
        const take = Math.min(paid, invoiceTotal(inv)); out.set(inv.id, take); paid -= take;
      }
    }
    return out;
  });
}
export function invoicePaid(inv: Invoice) {
  const direct = (idx().paymentsByInvoice.get(inv.id) || []).reduce((n, p) => n + p.amount, 0);
  return round2(direct + (planAllocations().get(inv.id) || 0));
}
export const invoiceBalance = (inv: Invoice) => round2(Math.max(0, invoiceTotal(inv) - invoicePaid(inv)));
export const daysOverdue = (inv: Invoice) => daysBetween(inv.due, TODAY);
export function planOf(inv: Invoice) { return inv.planId ? idx().plan.get(inv.planId) : undefined; }

export type InvStatus = "Paid" | "Nil" | "Scheduled DD" | "Due" | "Overdue" | "On plan" | "Debt review";
export function invoiceStatus(inv: Invoice): InvStatus {
  const t = invoiceTotal(inv), bal = invoiceBalance(inv);
  if (t <= 0) return "Nil";
  if (bal <= 0) return "Paid";
  const plan = planOf(inv);
  if (plan && plan.status === "Broken") return "Debt review";
  if (plan) return "On plan";
  if (inv.due >= TODAY) return family(inv.familyId)?.method === "SEPA direct debit" && inv.due > TODAY ? "Scheduled DD" : "Due";
  return "Overdue";
}
/** Overdue = unpaid after its due date and not protected by an active plan. */
export function overdueInvoices(): Invoice[] {
  return cached("overdue", () => getState().invoices.filter(i => { const st = invoiceStatus(i); return (st === "Overdue" || st === "Debt review") && inScope(family(i.familyId)?.locationId); })
    .sort((a, b) => a.due.localeCompare(b.due)));
}
export function reminderStage(inv: Invoice): { label: string; step: number } {
  if (invoiceStatus(inv) === "Debt review") return { label: "Debt review (owner)", step: 7 };
  const d = daysOverdue(inv);
  if (d < 2) return { label: "Day 0 · Invoice issued", step: 0 };
  if (d < 5) return { label: "Day 2 · Friendly reminder", step: 1 };
  if (d < 7) return { label: "Day 5 · Second reminder", step: 2 };
  if (d < 10) return { label: "Day 7 · Final warning", step: 3 };
  if (d < 14) return { label: "Day 10 · Block candidate", step: 4 };
  if (d < 30) return { label: "Day 14 · Phone follow-up", step: 5 };
  return { label: "Statement cycle", step: 6 };
}
export function familyBalance(fid: string) {
  return round2((idx().invoicesByFamily.get(fid) || []).reduce((n, i) => n + (invoiceStatus(i) === "Scheduled DD" || invoiceStatus(i) === "Due" ? 0 : invoiceBalance(i)), 0));
}
export function familyDue(fid: string) {
  return round2((idx().invoicesByFamily.get(fid) || []).reduce((n, i) => n + invoiceBalance(i), 0));
}
export function paymentStatus(f: Family): "Paid up" | "Due" | "Overdue" | "Plan" | "Blocked" {
  if (f.blocked) return "Blocked";
  const inv = idx().invoicesByFamily.get(f.id) || [];
  if (inv.some(i => invoiceStatus(i) === "On plan")) return "Plan";
  if (inv.some(i => invoiceStatus(i) === "Overdue" || invoiceStatus(i) === "Debt review")) return "Overdue";
  if (inv.some(i => invoiceBalance(i) > 0)) return "Due";
  return "Paid up";
}
export function agedDebt() {
  return cached("aged", () => {
    const b = { "0–7": 0, "8–30": 0, "31–60": 0, "60+": 0 } as Record<string, number>;
    const n = { "0–7": 0, "8–30": 0, "31–60": 0, "60+": 0 } as Record<string, number>;
    for (const i of getState().invoices) {
      const bal = invoiceBalance(i);
      if (bal <= 0 || i.due >= TODAY || !inScope(family(i.familyId)?.locationId)) continue;
      if (invoiceStatus(i) === "Nil") continue;
      const d = daysOverdue(i), k = d <= 7 ? "0–7" : d <= 30 ? "8–30" : d <= 60 ? "31–60" : "60+";
      b[k] = round2(b[k] + bal); n[k]++;
    }
    return { buckets: b, counts: n, total: round2(Object.values(b).reduce((x, y) => x + y, 0)) };
  });
}
export function weekFinance() {
  return cached("weekFin", () => {
    const s = getState();
    const cur = s.invoices.filter(i => i.weekOf === "2026-10-19" && inScope(family(i.familyId)?.locationId));
    const invoiced = round2(cur.reduce((n, i) => n + Math.max(0, invoiceTotal(i)), 0));
    const collected = round2(cur.reduce((n, i) => n + Math.min(invoicePaid(i), Math.max(0, invoiceTotal(i))), 0));
    const scheduled = round2(cur.filter(i => invoiceStatus(i) === "Scheduled DD").reduce((n, i) => n + invoiceBalance(i), 0));
    const octInv = s.invoices.filter(i => i.issued >= "2026-10-01" && inScope(family(i.familyId)?.locationId));
    const mtdBilled = round2(octInv.reduce((n, i) => n + Math.max(0, invoiceTotal(i)), 0));
    const mtdCollected = round2(s.payments.filter(p => p.status === "Succeeded" && p.date >= "2026-10-01" && inScope(family(p.familyId)?.locationId)).reduce((n, p) => n + p.amount, 0));
    const subsidy = round2(-cur.reduce((n, i) => n + i.lines.filter(l => l.kind === "NCS subsidy").reduce((a, l) => a + l.amount, 0), 0));
    // One definition everywhere: collected share of October invoices that are already due (direct debits not yet due are left out).
    const sc = scopeLoc();
    return { invoiced, collected, scheduled, outstanding: round2(invoiced - collected - scheduled), mtdBilled, mtdCollected, mtdRate: collectionRate(sc === "ALL" ? undefined : sc), subsidy, count: cur.length };
  });
}
export function revenueByLocation() {
  return cached("revLoc", () => {
    const s = getState(), out = new Map<string, { revenue: number; children: Set<string> }>();
    for (const l of s.locations) out.set(l.id, { revenue: 0, children: new Set() });
    for (const inv of s.invoices.filter(i => i.weekOf === "2026-10-19")) for (const ln of inv.lines) {
      if (!ln.childId || ln.amount <= 0) continue;
      const c = child(ln.childId); if (!c) continue;
      const e = out.get(c.locationId)!; e.revenue = round2(e.revenue + ln.amount); e.children.add(c.id);
    }
    return out;
  });
}
export function collectionRate(loc?: string) {
  const s = getState();
  const inv = s.invoices.filter(i => i.issued >= "2026-10-01" && (!loc || family(i.familyId)?.locationId === loc) && invoiceStatus(i) !== "Scheduled DD");
  const billed = inv.reduce((n, i) => n + Math.max(0, invoiceTotal(i)), 0);
  const paid = inv.reduce((n, i) => n + Math.min(invoicePaid(i), Math.max(0, invoiceTotal(i))), 0);
  return billed ? paid / billed : 1;
}

/* ---------------- bookings, attendance, ratios ---------------- */
export function bookingsOn(date: string, loc?: string, session?: Session): Booking[] {
  return (idx().bookingsByDate.get(date) || []).filter(b => (!loc || b.locationId === loc) && (!session || b.session === session));
}
export type ChildDayStatus = "Expected" | "Signed in" | "Signed out" | "On bus" | "Absent" | "Not present";
export function childStatus(childId: string, date = TODAY): { status: ChildDayStatus; time?: string; by?: string; collector?: string } {
  const ev = (idx().attendanceByChildDate.get(childId + "|" + date) || []).slice().sort((a, b) => a.time.localeCompare(b.time));
  const last = ev[ev.length - 1];
  if (!last) return { status: "Expected" };
  const map: Record<string, ChildDayStatus> = { in: "Signed in", out: "Signed out", boarded: "On bus", absent: "Absent", "not-present": "Not present" };
  return { status: map[last.kind], time: last.time, by: last.by, collector: last.collector };
}
export function onSiteNow(loc?: string) {
  const s = getState();
  return s.children.filter(c => (!loc || c.locationId === loc) && inScope(c.locationId) && childStatus(c.id).status === "Signed in").length;
}
export function absentStaff(date: string) { return new Set(getState().absences.filter(a => a.date === date).map(a => a.staffId)); }
export function ratioCheck(loc: string, date: string, session: Session, roomId?: string) {
  const s = getState();
  const booked = bookingsOn(date, loc, session).filter(b => !roomId || b.roomId === roomId).length;
  const ratio = roomId ? (idx().room.get(roomId)?.ratio || s.config.sacRatio) : s.config.sacRatio;
  const away = absentStaff(date);
  const shifts = (idx().shiftsByKey.get(loc + "|" + date + "|" + session) || []).filter(x => (!roomId || x.roomId === roomId) && x.status !== "proposed");
  const rostered = shifts.filter(x => !away.has(x.staffId)).length;
  const required = booked ? Math.ceil(booked / ratio) : 0;
  return { booked, ratio, rostered, required, ok: rostered >= required, shifts, gap: Math.max(0, required - rostered) };
}
/** Live ratio alerts for today and tomorrow, derived from bookings, rota and absences. */
export function ratioAlerts() {
  return cached("ratioAlerts", () => {
    const s = getState(), out: { loc: LocationId; date: string; session: Session; roomId?: string; booked: number; rostered: number; required: number; issue?: Issue }[] = [];
    for (const l of s.locations) for (const date of [TODAY, TOMORROW]) {
      for (const session of ["Morning", "After School"] as Session[]) {
        if (date === TODAY && session === "Morning" && s.clockMin > toMin("09:15")) continue;
        const r = ratioCheck(l.id, date, session);
        if (!r.ok) out.push({ loc: l.id, date, session, booked: r.booked, rostered: r.rostered, required: r.required, issue: s.issues.find(i => i.locationId === l.id && i.date === date && i.session === session) });
      }
      for (const room of s.rooms.filter(rm => rm.locationId === l.id && rm.kind !== "SAC")) {
        const r = ratioCheck(l.id, date, "Full Day", room.id);
        if (!r.ok) out.push({ loc: l.id, date, session: "Full Day", roomId: room.id, booked: r.booked, rostered: r.rostered, required: r.required });
      }
    }
    return out.filter(a => inScope(a.loc));
  });
}
export function occupancy(loc: string, date = TODAY) {
  const s = getState(), l = locById(loc)!;
  const sac = bookingsOn(date, loc, "After School").length;
  const eyRooms = s.rooms.filter(r => r.locationId === loc && r.kind !== "SAC");
  const ey = eyRooms.reduce((n, r) => n + bookingsOn(date, loc, "Full Day").filter(b => b.roomId === r.id).length, 0);
  const cap = l.sacCapacity + eyRooms.reduce((n, r) => n + r.capacity, 0);
  return { sac, ey, booked: sac + ey, cap, rate: cap ? (sac + ey) / cap : 0 };
}
export function weekOccupancy(loc: string) {
  const vals = THIS_WEEK.map(d => occupancy(loc, d).rate);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
export function register(loc: string, date: string, session?: Session) {
  return bookingsOn(date, loc, session).map(b => ({ booking: b, child: child(b.childId)!, ...childStatus(b.childId, date) }))
    .sort((a, b) => a.child.firstName.localeCompare(b.child.firstName));
}
export function manifest(routeId: string, date: string) {
  const rt = idx().route.get(routeId)!;
  const order = new Map(rt.stops.map((st, i) => [st.schoolId, i]));
  return bookingsOn(date).filter(b => b.routeId === routeId && b.session === "After School")
    .map(b => {
      const ev = (idx().attendanceByChildDate.get(b.childId + "|" + date) || []);
      // Only an afternoon sign-in counts as a bus arrival; morning club sign-ins happen hours earlier.
      const boarded = ev.find(e => e.kind === "boarded"), arrived = ev.find(e => e.kind === "in" && (e.routeId === routeId || e.time >= "13:00")), missing = ev.find(e => e.kind === "not-present");
      return { booking: b, child: child(b.childId)!, stop: rt.stops[order.get(b.schoolId || "") ?? 0], boarded, arrived, missing };
    })
    .sort((a, b) => (order.get(a.booking.schoolId || "") ?? 0) - (order.get(b.booking.schoolId || "") ?? 0) || a.child.firstName.localeCompare(b.child.firstName));
}
export const clockLabel = () => hm(getState().clockMin);

/* ---------------- NCS ---------------- */
export function claimsPending() { return getState().claims.filter(c => c.status === "Awaiting acceptance" && inScope(family(c.familyId)?.locationId)); }
export function claimsExpiringToday() { return claimsPending().filter(c => c.deadline.slice(0, 10) === TODAY); }
export function chickExpiring() { return getState().awards.filter(a => a.expires >= TODAY && a.expires <= "2026-10-31" && inScope(family(a.familyId)?.locationId)); }
export function underbooked() {
  return cached("underbooked", () => {
    const s = getState(), w = s.windows.find(x => x.status === "Open");
    if (!w) return [];
    return w.submissions.map(sub => {
      const f = family(sub.familyId)!;
      const aws = f.childIds.map(id => idx().awardByChild.get(id)).filter(Boolean) as NCSAward[];
      const agreed = aws.reduce((n, a) => n + a.agreedHours, 0);
      return { family: f, sub, agreed, booked: sub.hours, short: agreed - sub.hours, awards: aws };
    }).filter(x => x.awards.length && x.booked < x.agreed && inScope(x.family.locationId));
  });
}

/* ---------------- people ---------------- */
export function certStatus(st: Staff) {
  const exp = st.certs.filter(c => c.expires < TODAY);
  const soon = st.certs.filter(c => c.expires >= TODAY && daysBetween(TODAY, c.expires) <= 30);
  return { expired: exp, soon, gardaExpired: exp.some(c => c.kind === "Garda vetting"), ok: !exp.length && !soon.length };
}
export function certAlerts() {
  return cached("certs", () => {
    const s = getState();
    return { expired: s.staff.filter(x => certStatus(x).expired.length && inScope(x.locationId)), soon: s.staff.filter(x => certStatus(x).soon.length && !certStatus(x).expired.length && inScope(x.locationId)) };
  });
}

/* ---------------- work ---------------- */
export function pendingApprovals(): Approval[] {
  const ui = getUi();
  return getState().approvals.filter(a => a.status === "Pending" && (ui.role === "owner" || ui.role === "ops" || a.ownerRole === ui.role || (ui.role === "locmgr" && a.ownerRole === "locmgr")));
}
export function openTasks(): Task[] { return getState().tasks.filter(t => t.status !== "Done" && (!t.locationId || inScope(t.locationId))); }
export function pendingRequests() { return getState().requests.filter(r => r.status === "Pending" && inScope(r.locationId)); }
export function openIncidents() { return getState().incidents.filter(i => i.status !== "Closed" && inScope(i.locationId)); }
export function medicationReviews() {
  return getState().children.filter(c => c.medication && c.medication.expires <= "2026-11-03" && inScope(c.locationId));
}
export function missingChildAlerts() { return getState().issues.filter(i => i.kind === "Missing child" && i.status === "Open" && inScope(i.locationId)); }

/* ---------------- headline KPIs (Command Centre) ---------------- */
export function headline() {
  return cached("headline:" + scopeLoc(), () => {
    const s = getState(), locs = scopedLocations().map(l => l.id) as string[];
    const today = (idx().bookingsByDate.get(TODAY) || []).filter(b => locs.includes(b.locationId));
    const uniqueKids = new Set(today.map(b => b.childId)).size;
    const away = absentStaff(TODAY);
    const staffToday = new Set(s.shifts.filter(x => x.date === TODAY && locs.includes(x.locationId) && !away.has(x.staffId)).map(x => x.staffId)).size;
    const occ = locs.map(l => occupancy(l)).reduce((a, o) => ({ b: a.b + o.booked, c: a.c + o.cap }), { b: 0, c: 0 });
    const wf = weekFinance(), aged = agedDebt();
    return {
      bookedToday: uniqueKids, sessionsToday: today.length, onSite: onSiteNow(), staffToday,
      ratioAlerts: ratioAlerts().length, invoiced: wf.invoiced, collected: wf.collected, scheduled: wf.scheduled,
      mtdRate: wf.mtdRate, mtdCollected: wf.mtdCollected, aged: aged.total, occupancy: occ.c ? occ.b / occ.c : 0,
      claims: claimsPending().length, claimsToday: claimsExpiringToday().length,
      waitlist: s.waitlist.filter(w => w.status === "Waiting" && inScope(w.locationId)).length,
      incidents: openIncidents().length, overdue: overdueInvoices().length, approvals: pendingApprovals().length,
      requests: pendingRequests().length,
    };
  });
}

/* ---------------- search ---------------- */
export type SearchHit = { kind: "family" | "child" | "invoice" | "staff" | "school" | "request" | "claim" | "route"; id: string; title: string; meta: string };
export function searchRecords(q: string, limit = 12): SearchHit[] {
  const s = getState(), t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  const out: SearchHit[] = [];
  const push = (h: SearchHit) => { if (out.length < limit) out.push(h); };
  for (const f of s.families) if (f.id.toLowerCase().includes(t) || f.surname.toLowerCase().includes(t) || f.guardians.some(g => g.name.toLowerCase().includes(t)))
    push({ kind: "family", id: f.id, title: f.surname + " family · " + f.id, meta: f.guardians.map(g => g.name).join(", ") + " · " + locById(f.locationId)?.short });
  for (const c of s.children) if ((c.firstName + " " + c.surname).toLowerCase().includes(t) || c.id.toLowerCase() === t)
    push({ kind: "child", id: c.id, title: c.firstName + " " + c.surname, meta: (c.programme === "EY" ? idx().room.get(c.roomId)?.name : schoolName(c.schoolId)) + " · " + locById(c.locationId)?.short + " · " + c.familyId });
  for (const i of s.invoices) if (i.id.toLowerCase().includes(t)) push({ kind: "invoice", id: i.id, title: i.id, meta: family(i.familyId)?.surname + " · " + invoiceStatus(i) });
  for (const x of s.staff) if (x.name.toLowerCase().includes(t)) push({ kind: "staff", id: x.id, title: x.name, meta: x.role + " · " + locById(x.locationId)?.short });
  for (const x of s.schools) if (x.name.toLowerCase().includes(t)) push({ kind: "school", id: x.id, title: x.name, meta: "School · " + x.region });
  for (const x of s.requests) if (x.id.toLowerCase().includes(t)) push({ kind: "request", id: x.id, title: x.id + " · " + x.kind, meta: family(x.familyId)?.surname + " · " + x.status });
  for (const x of s.claims) if (x.id.toLowerCase().includes(t)) push({ kind: "claim", id: x.id, title: x.id, meta: family(x.familyId)?.surname + " · " + x.status });
  for (const x of s.routes) if (x.id.toLowerCase().includes(t) || x.name.toLowerCase().includes(t)) push({ kind: "route", id: x.id, title: x.id + " · " + x.name, meta: "Route · " + locById(x.locationId)?.short });
  return out;
}
