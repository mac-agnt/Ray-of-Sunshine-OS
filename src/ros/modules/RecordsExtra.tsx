/* Extra Records tabs: a record explorer that walks the childcare ontology
   one hop at a time, the entity types with live counts and predicates, and
   a merged history for any record. Everything is derived from the shared
   state, so a record approved elsewhere shows its new links here at once. */
import { useState, type ReactNode } from "react";
import type { Ref, RefKind, Tone } from "../types";
import { useRos, openRecord, nav, setFocus, getState } from "../store";
import {
  searchRecords, idx, child, childName, family, staffById, locById, schoolName, invoiceTotal, invoiceStatus, childStatus, inScope,
} from "../selectors";
import { Page, PageHead, Card, Grid, Table, Badge, Btn, Callout, Seg, Search, ListRow, Timeline, Empty, Row, Stack, Sub, Label, KV, toneBg, toneInk } from "../ui";
import { TODAY, THIS_WEEK, fmtDay, fmtDate, rel, euro } from "../time";

/* ---------------- graph model ---------------- */
interface Node { ref?: Ref; label: string; sub?: string }
interface Group { key: string; label: string; kind: string; items: Node[] }
interface Center { kind: string; title: string; sub: string; groups: Group[]; facts: [ReactNode, ReactNode][] }
const EXPLORE = new Set<string>(["family", "child", "staff", "invoice", "payment", "route", "school", "claim", "award", "plan", "request", "location", "incident", "booking", "message", "task"]);
const DRAWER = new Set<string>(["family", "child", "invoice", "request", "issue", "claim", "route", "plan", "approval", "task", "message", "staff", "location", "incident", "enquiry", "camp", "course", "automation", "agent", "school", "booking", "award", "waitlist"]);
const KIND_LABEL: Record<string, string> = { family: "Family", child: "Child", staff: "Staff", invoice: "Invoice", payment: "Payment", route: "Route", school: "School", claim: "NCS claim", award: "NCS award", plan: "Payment plan", request: "Request", location: "Location", incident: "Incident", booking: "Booking", message: "Message", task: "Task", issue: "Alert", course: "Course", camp: "Camp", approval: "Approval", info: "Detail" };
const KIND_TONE: Record<string, Tone> = { family: "accent", child: "ok", staff: "info", invoice: "warn", payment: "warn", plan: "warn", route: "info", school: "neutral", claim: "brand", award: "brand", request: "warn", location: "info", incident: "bad", booking: "ok", message: "neutral", task: "neutral", issue: "bad", info: "neutral" };
const g = (key: string, label: string, kind: string, items: Node[]): Group => ({ key, label, kind, items });
const r = (kind: RefKind, id: string): Ref => ({ kind, id });

function explore(ref: Ref): Center | null {
  const s = getState();
  const I = idx();
  switch (ref.kind) {
    case "family": {
      const f = family(ref.id); if (!f) return null;
      const kids = f.childIds.map(id => child(id)!).filter(Boolean);
      const inv = (I.invoicesByFamily.get(f.id) || []).slice().sort((a, b) => b.weekOf.localeCompare(a.weekOf));
      return {
        kind: "family", title: f.surname + " family · " + f.id, sub: locById(f.locationId)?.short + " · " + f.funding + " · " + f.method,
        facts: [["Guardians", f.guardians.length], ["Children", kids.length], ["Channel", f.channel], ["Language", f.language]],
        groups: [
          g("guardians", "Guardians", "info", f.guardians.map(x => ({ label: x.name, sub: x.relation + (x.primary ? " · primary" : "") }))),
          g("children", "Children", "child", kids.map(c => ({ ref: r("child", c.id), label: childName(c), sub: c.programme + " · age " + c.age }))),
          g("location", "Location", "location", [{ ref: r("location", f.locationId), label: locById(f.locationId)?.short || f.locationId }]),
          g("invoices", "Invoices", "invoice", inv.map(i => ({ ref: r("invoice", i.id), label: i.id, sub: "w/c " + fmtDate(i.weekOf) + " · " + euro(invoiceTotal(i)) + " · " + invoiceStatus(i) }))),
          g("payments", "Payments", "payment", (I.paymentsByFamily.get(f.id) || []).slice().sort((a, b) => b.date.localeCompare(a.date)).map(p => ({ ref: r("payment", p.id), label: p.id, sub: fmtDate(p.date) + " · " + euro(p.amount) + " · " + p.status }))),
          g("plans", "Payment plan", "plan", s.plans.filter(p => p.familyId === f.id).map(p => ({ ref: r("plan", p.id), label: p.id, sub: p.status + " · revision " + p.revision + " of " + p.maxRevisions }))),
          g("awards", "NCS awards", "award", s.awards.filter(a => a.familyId === f.id).map(a => ({ ref: r("award", a.id), label: a.id, sub: a.type + " · " + a.agreedHours + "h" }))),
          g("claims", "NCS claims", "claim", s.claims.filter(c => c.familyId === f.id).map(c => ({ ref: r("claim", c.id), label: c.id, sub: euro(c.amount) + " · " + c.status }))),
          g("requests", "Requests", "request", s.requests.filter(q => q.familyId === f.id).map(q => ({ ref: r("request", q.id), label: q.id, sub: q.kind + " · " + q.status }))),
          g("messages", "Messages", "message", s.messages.filter(m => m.familyId === f.id).map(m => ({ ref: r("message", m.id), label: m.subject, sub: m.channel + " · " + rel(m.received) }))),
          g("tasks", "Tasks", "task", s.tasks.filter(t => t.link && ((t.link.kind === "family" && t.link.id === f.id) || (t.link.kind === "plan" && s.plans.some(p => p.id === t.link!.id && p.familyId === f.id)))).map(t => ({ ref: r("task", t.id), label: t.title, sub: t.owner + " · " + t.status }))),
          g("incidents", "Incidents", "incident", s.incidents.filter(i => f.childIds.includes(i.childId)).map(i => ({ ref: r("incident", i.id), label: i.id, sub: i.kind + " · " + i.status }))),
        ],
      };
    }
    case "child": {
      const c = child(ref.id); if (!c) return null;
      const f = family(c.familyId);
      const inv = (I.invoicesByFamily.get(c.familyId) || []).filter(i => i.lines.some(l => l.childId === c.id)).sort((a, b) => b.weekOf.localeCompare(a.weekOf));
      const invIds = new Set(inv.map(i => i.id));
      const aw = I.awardByChild.get(c.id);
      const st = childStatus(c.id);
      return {
        kind: "child", title: childName(c), sub: (c.programme === "EY" ? I.room.get(c.roomId)?.name : schoolName(c.schoolId) + " · " + (c.schoolClass || "")) + " · " + locById(c.locationId)?.short,
        facts: [["Age", c.age], ["Programme", c.programme === "EY" ? "Early years" : "School age"], ["Today", st.status + (st.time ? " " + st.time : "")], ["Medical", c.medical.length ? c.medical.map(m => m.kind).join(", ") : "None recorded"]],
        groups: [
          g("family", "Family", "family", f ? [{ ref: r("family", f.id), label: f.surname + " family", sub: f.id }] : []),
          g("location", "Location", "location", [{ ref: r("location", c.locationId), label: locById(c.locationId)?.short || c.locationId, sub: I.room.get(c.roomId)?.name }]),
          g("school", "School", "school", c.schoolId ? [{ ref: r("school", c.schoolId), label: schoolName(c.schoolId), sub: c.schoolClass }] : []),
          g("route", "Route", "route", c.routeId ? [{ ref: r("route", c.routeId), label: c.routeId, sub: I.route.get(c.routeId)?.name }] : []),
          g("keyworker", "Key worker", "staff", staffById(c.keyWorkerId) ? [{ ref: r("staff", c.keyWorkerId), label: staffById(c.keyWorkerId)!.name, sub: staffById(c.keyWorkerId)!.role }] : []),
          g("bookings", "Bookings this week", "booking", (I.bookingsByChild.get(c.id) || []).filter(b => THIS_WEEK.includes(b.date)).sort((a, b) => a.date.localeCompare(b.date)).map(b => ({ ref: r("booking", b.id), label: fmtDay(b.date) + " · " + b.session, sub: b.start + "–" + b.end + " · " + b.funding }))),
          g("attendance", "Attendance", "info", s.attendance.filter(a => a.childId === c.id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 12).map(a => ({ label: fmtDay(a.date) + " " + a.time + " · " + ({ in: "Signed in", out: "Signed out", boarded: "Boarded", absent: "Absent", "not-present": "Not present" } as Record<string, string>)[a.kind], sub: a.by + (a.collector ? " · collected by " + a.collector : "") }))),
          g("invoices", "Invoices", "invoice", inv.map(i => ({ ref: r("invoice", i.id), label: i.id, sub: "w/c " + fmtDate(i.weekOf) + " · " + invoiceStatus(i) }))),
          g("payments", "Payments", "payment", s.payments.filter(p => p.invoiceId && invIds.has(p.invoiceId)).map(p => ({ ref: r("payment", p.id), label: p.id, sub: fmtDate(p.date) + " · " + euro(p.amount) }))),
          g("plan", "Payment plan", "plan", s.plans.filter(p => p.familyId === c.familyId).map(p => ({ ref: r("plan", p.id), label: p.id, sub: p.status }))),
          g("award", "NCS award", "award", aw ? [{ ref: r("award", aw.id), label: aw.id, sub: aw.type + " · " + aw.agreedHours + "h · " + aw.status }] : []),
          g("claims", "NCS claims", "claim", s.claims.filter(k => k.childId === c.id).map(k => ({ ref: r("claim", k.id), label: k.id, sub: euro(k.amount) + " · " + k.status }))),
          g("messages", "Messages", "message", s.messages.filter(m => m.familyId === c.familyId).map(m => ({ ref: r("message", m.id), label: m.subject, sub: rel(m.received) }))),
          g("tasks", "Tasks", "task", s.tasks.filter(t => t.link && ((t.link.kind === "child" && t.link.id === c.id) || (t.link.kind === "family" && t.link.id === c.familyId))).map(t => ({ ref: r("task", t.id), label: t.title, sub: t.status }))),
          g("incidents", "Incidents", "incident", s.incidents.filter(i => i.childId === c.id).map(i => ({ ref: r("incident", i.id), label: i.id, sub: i.kind }))),
        ],
      };
    }
    case "staff": {
      const x = staffById(ref.id); if (!x) return null;
      return {
        kind: "staff", title: x.name, sub: x.role + " · " + locById(x.locationId)?.short,
        facts: [["Qualification", x.qualification], ["Contract", x.contractHours + "h"], ["Gaeilge", x.irish ? "Yes" : "No"], ["Started", fmtDate(x.startDate) + " " + x.startDate.slice(0, 4)]],
        groups: [
          g("location", "Location", "location", [{ ref: r("location", x.locationId), label: locById(x.locationId)?.short || x.locationId }]),
          g("shifts", "Shifts this week", "info", s.shifts.filter(t => t.staffId === x.id && THIS_WEEK.includes(t.date)).sort((a, b) => a.date.localeCompare(b.date)).map(t => ({ label: fmtDay(t.date) + " · " + t.session, sub: t.start + "–" + t.end + " · " + locById(t.locationId)?.short + (t.relief ? " · relief" : "") }))),
          g("certs", "Certificates", "info", x.certs.map(c => ({ label: c.kind, sub: (c.expires < TODAY ? "Expired " : "Expires ") + fmtDate(c.expires) + " " + c.expires.slice(0, 4) }))),
          g("children", "Key children", "child", s.children.filter(c => c.keyWorkerId === x.id).map(c => ({ ref: r("child", c.id), label: childName(c), sub: c.familyId }))),
          g("routes", "Routes", "route", s.routes.filter(t => t.driverId === x.id || t.escortId === x.id).map(t => ({ ref: r("route", t.id), label: t.id, sub: t.driverId === x.id ? "Driver" : "Escort" }))),
          g("courses", "Courses", "course", s.courses.filter(c => c.trainerId === x.id).map(c => ({ ref: r("course", c.id), label: c.id, sub: fmtDay(c.date) }))),
          g("tasks", "Tasks", "task", s.tasks.filter(t => t.link?.kind === "staff" && t.link.id === x.id).map(t => ({ ref: r("task", t.id), label: t.title, sub: t.status }))),
          g("absences", "Absences", "info", s.absences.filter(a => a.staffId === x.id).map(a => ({ label: fmtDay(a.date), sub: a.reason }))),
        ],
      };
    }
    case "invoice": {
      const i = I.invoice.get(ref.id); if (!i) return null;
      const kids = Array.from(new Set(i.lines.map(l => l.childId).filter(Boolean) as string[]));
      return {
        kind: "invoice", title: i.id, sub: "w/c " + fmtDate(i.weekOf) + " · " + euro(invoiceTotal(i)) + " · " + invoiceStatus(i),
        facts: [["Issued", fmtDate(i.issued)], ["Due", fmtDate(i.due)], ["Lines", i.lines.length], ["Total", euro(invoiceTotal(i))]],
        groups: [
          g("family", "Family", "family", [{ ref: r("family", i.familyId), label: family(i.familyId)?.surname + " family", sub: i.familyId }]),
          g("children", "Children billed", "child", kids.map(id => ({ ref: r("child", id), label: childName(child(id)) }))),
          g("bookings", "Bookings", "booking", i.lines.filter(l => l.bookingId).map(l => ({ ref: r("booking", l.bookingId!), label: l.label, sub: euro(l.amount) }))),
          g("payments", "Payments", "payment", s.payments.filter(p => p.invoiceId === i.id).map(p => ({ ref: r("payment", p.id), label: p.id, sub: fmtDate(p.date) + " · " + euro(p.amount) + " · " + p.status }))),
          g("plan", "Payment plan", "plan", i.planId ? [{ ref: r("plan", i.planId), label: i.planId }] : []),
          g("lines", "Lines", "info", i.lines.map(l => ({ label: l.label, sub: l.kind + " · " + euro(l.amount) }))),
        ],
      };
    }
    case "payment": {
      const p = s.payments.find(x => x.id === ref.id); if (!p) return null;
      return {
        kind: "payment", title: p.id, sub: fmtDate(p.date) + " · " + euro(p.amount) + " · " + p.status,
        facts: [["Method", p.method], ["Reference", p.ref], ["Status", p.status], ["Amount", euro(p.amount)]],
        groups: [
          g("family", "Family", "family", [{ ref: r("family", p.familyId), label: family(p.familyId)?.surname + " family", sub: p.familyId }]),
          g("invoice", "Invoice", "invoice", p.invoiceId ? [{ ref: r("invoice", p.invoiceId), label: p.invoiceId }] : []),
          g("plan", "Payment plan", "plan", p.planId ? [{ ref: r("plan", p.planId), label: p.planId }] : []),
        ],
      };
    }
    case "route": {
      const t = I.route.get(ref.id); if (!t) return null;
      const v = s.vehicles.find(x => x.id === t.vehicleId);
      const riders = (I.bookingsByDate.get(TODAY) || []).filter(b => b.routeId === t.id && b.session === "After School");
      return {
        kind: "route", title: t.id + " · " + t.name, sub: locById(t.locationId)?.short + " · " + t.stops.length + " stops",
        facts: [["Vehicle", v ? v.kind + " · " + v.reg : "None"], ["Seats", v?.seats || 0], ["Riders today", riders.length], ["Fee per run", euro(t.feePerRun)]],
        groups: [
          g("location", "Base", "location", [{ ref: r("location", t.locationId), label: locById(t.locationId)?.short || t.locationId }]),
          g("crew", "Driver and escort", "staff", [t.driverId, t.escortId].filter(Boolean).map(id => ({ ref: r("staff", id!), label: staffById(id!)?.name || id!, sub: id === t.driverId ? "Driver" : "Escort" }))),
          g("vehicle", "Vehicle", "info", v ? [{ label: v.reg, sub: v.kind }] : []),
          g("schools", "Stops", "school", t.stops.map(st => ({ ref: r("school", st.schoolId), label: schoolName(st.schoolId), sub: st.time }))),
          g("riders", "Riders today", "child", riders.map(b => ({ ref: r("child", b.childId), label: childName(child(b.childId)), sub: schoolName(b.schoolId) }))),
        ],
      };
    }
    case "school": {
      const sc = s.schools.find(x => x.id === ref.id); if (!sc) return null;
      const kids = s.children.filter(c => c.schoolId === sc.id);
      return {
        kind: "school", title: sc.name, sub: sc.region + " · served by " + locById(sc.locationId)?.short,
        facts: [["Region", sc.region], ["Children", kids.length], ["Location", locById(sc.locationId)?.short], ["Routes", s.routes.filter(t => t.stops.some(x => x.schoolId === sc.id)).length]],
        groups: [
          g("location", "Location", "location", [{ ref: r("location", sc.locationId), label: locById(sc.locationId)?.short || sc.locationId }]),
          g("routes", "Routes", "route", s.routes.filter(t => t.stops.some(x => x.schoolId === sc.id)).map(t => ({ ref: r("route", t.id), label: t.id, sub: t.stops.find(x => x.schoolId === sc.id)?.time }))),
          g("children", "Children", "child", kids.map(c => ({ ref: r("child", c.id), label: childName(c), sub: c.schoolClass }))),
        ],
      };
    }
    case "claim": {
      const k = s.claims.find(x => x.id === ref.id); if (!k) return null;
      return {
        kind: "claim", title: k.id, sub: euro(k.amount) + " · " + k.status + " · deadline " + k.deadline,
        facts: [["Period", k.period], ["Hours", k.hours], ["Amount", euro(k.amount)], ["Reminders", k.reminders.length]],
        groups: [
          g("family", "Family", "family", [{ ref: r("family", k.familyId), label: family(k.familyId)?.surname + " family", sub: k.familyId }]),
          g("child", "Child", "child", [{ ref: r("child", k.childId), label: childName(child(k.childId)) }]),
          g("award", "NCS award", "award", [{ ref: r("award", k.awardId), label: k.awardId }]),
          g("messages", "Messages", "message", s.messages.filter(m => m.link?.kind === "claim" && m.link.id === k.id).map(m => ({ ref: r("message", m.id), label: m.subject, sub: m.from }))),
        ],
      };
    }
    case "award": {
      const a = s.awards.find(x => x.id === ref.id); if (!a) return null;
      return {
        kind: "award", title: a.id + " · " + a.type, sub: a.agreedHours + "h agreed · " + a.status + " · expires " + fmtDate(a.expires),
        facts: [["CHICK", a.chick], ["Rate", euro(a.rate) + "/h"], ["Next change", fmtDate(a.nextChange)], ["Expires", fmtDate(a.expires) + " " + a.expires.slice(0, 4)]],
        groups: [
          g("child", "Child", "child", [{ ref: r("child", a.childId), label: childName(child(a.childId)) }]),
          g("family", "Family", "family", [{ ref: r("family", a.familyId), label: family(a.familyId)?.surname + " family" }]),
          g("claims", "Claims", "claim", s.claims.filter(k => k.awardId === a.id).map(k => ({ ref: r("claim", k.id), label: k.id, sub: euro(k.amount) + " · " + k.status }))),
        ],
      };
    }
    case "plan": {
      const p = s.plans.find(x => x.id === ref.id); if (!p) return null;
      return {
        kind: "plan", title: p.id, sub: family(p.familyId)?.surname + " · " + p.status + " · revision " + p.revision + " of " + p.maxRevisions,
        facts: [["Total", euro(p.total)], ["Instalments", p.instalments.length], ["Missed", p.instalments.filter(i => i.status === "Missed").length], ["E-sign", p.esign]],
        groups: [
          g("family", "Family", "family", [{ ref: r("family", p.familyId), label: family(p.familyId)?.surname + " family", sub: p.familyId }]),
          g("invoices", "Invoices", "invoice", s.invoices.filter(i => i.planId === p.id).map(i => ({ ref: r("invoice", i.id), label: i.id, sub: euro(invoiceTotal(i)) }))),
          g("payments", "Payments", "payment", s.payments.filter(x => x.planId === p.id).map(x => ({ ref: r("payment", x.id), label: x.id, sub: fmtDate(x.date) + " · " + euro(x.amount) }))),
          g("instalments", "Instalments", "info", p.instalments.map(i => ({ label: "#" + i.n + " · " + fmtDate(i.due), sub: euro(i.amount) + " · " + i.status }))),
          g("tasks", "Tasks", "task", s.tasks.filter(t => t.link?.kind === "plan" && t.link.id === p.id).map(t => ({ ref: r("task", t.id), label: t.title, sub: t.status }))),
        ],
      };
    }
    case "request": {
      const q = s.requests.find(x => x.id === ref.id); if (!q) return null;
      return {
        kind: "request", title: q.id + " · " + q.kind, sub: fmtDay(q.date) + " " + q.start + "–" + q.end + " · " + q.status,
        facts: [["Channel", q.channel], ["Received", rel(q.received)], ["Fees", euro(q.fees.reduce((n, x) => n + x.amount, 0))], ["Status", q.status]],
        groups: [
          g("family", "Family", "family", [{ ref: r("family", q.familyId), label: family(q.familyId)?.surname + " family", sub: q.familyId }]),
          g("child", "Child", "child", [{ ref: r("child", q.childId), label: childName(child(q.childId)) }]),
          g("location", "Location", "location", [{ ref: r("location", q.locationId), label: locById(q.locationId)?.short || q.locationId }]),
          g("school", "School", "school", q.schoolId ? [{ ref: r("school", q.schoolId), label: schoolName(q.schoolId) }] : []),
          g("route", "Route", "route", q.routeId ? [{ ref: r("route", q.routeId), label: q.routeId }] : []),
          g("message", "Message", "message", q.messageId ? [{ ref: r("message", q.messageId), label: q.messageId }] : []),
          g("booking", "Booking", "booking", s.bookings.filter(b => b.source === "Late request" && b.childId === q.childId && b.date === q.date).map(b => ({ ref: r("booking", b.id), label: b.id, sub: b.start + "–" + b.end }))),
        ],
      };
    }
    case "location": {
      const l = locById(ref.id); if (!l) return null;
      return {
        kind: "location", title: l.name, sub: l.town + ", Co. " + l.county + " · " + l.services.join(", "),
        facts: [["Manager", staffById(l.managerId)?.name], ["School-age places", l.sacCapacity], ["Children", s.children.filter(c => c.locationId === l.id).length], ["Staff", s.staff.filter(x => x.locationId === l.id).length]],
        groups: [
          g("manager", "Manager", "staff", [{ ref: r("staff", l.managerId), label: staffById(l.managerId)?.name || l.managerId }]),
          g("rooms", "Rooms", "info", s.rooms.filter(x => x.locationId === l.id).map(x => ({ label: x.name, sub: x.kind + " · " + x.capacity + " places" }))),
          g("schools", "Schools", "school", s.schools.filter(x => x.locationId === l.id).map(x => ({ ref: r("school", x.id), label: x.name }))),
          g("routes", "Routes", "route", s.routes.filter(x => x.locationId === l.id).map(x => ({ ref: r("route", x.id), label: x.id, sub: x.name }))),
          g("staff", "Staff", "staff", s.staff.filter(x => x.locationId === l.id).map(x => ({ ref: r("staff", x.id), label: x.name, sub: x.role }))),
          g("children", "Children", "child", s.children.filter(c => c.locationId === l.id).map(c => ({ ref: r("child", c.id), label: childName(c), sub: c.programme }))),
          g("issues", "Open alerts", "issue", s.issues.filter(i => i.locationId === l.id && i.status === "Open").map(i => ({ ref: r("issue", i.id), label: i.id, sub: i.title }))),
        ],
      };
    }
    case "incident": {
      const i = s.incidents.find(x => x.id === ref.id); if (!i) return null;
      const c = child(i.childId);
      return {
        kind: "incident", title: i.id + " · " + i.kind, sub: fmtDay(i.date) + " " + i.time + " · " + i.status,
        facts: [["Severity", i.severity], ["Manager review", i.managerReviewed ? "Done" : "Pending"], ["Parent signed", i.parentSigned ? "Yes" : "No"], ["Witnesses", i.witnesses.length]],
        groups: [
          g("child", "Child", "child", [{ ref: r("child", i.childId), label: childName(c) }]),
          g("family", "Family", "family", c ? [{ ref: r("family", c.familyId), label: family(c.familyId)?.surname + " family" }] : []),
          g("location", "Location", "location", [{ ref: r("location", i.locationId), label: locById(i.locationId)?.short || i.locationId }]),
        ],
      };
    }
    case "booking": {
      const b = s.bookings.find(x => x.id === ref.id); if (!b) return null;
      return {
        kind: "booking", title: b.id + " · " + b.session, sub: fmtDay(b.date) + " " + b.start + "–" + b.end + " · " + b.status,
        facts: [["Hours", b.hours], ["Funding", b.funding], ["Source", b.source], ["Status", b.status]],
        groups: [
          g("child", "Child", "child", [{ ref: r("child", b.childId), label: childName(child(b.childId)) }]),
          g("family", "Family", "family", [{ ref: r("family", b.familyId), label: family(b.familyId)?.surname + " family" }]),
          g("location", "Location", "location", [{ ref: r("location", b.locationId), label: locById(b.locationId)?.short || b.locationId }]),
          g("school", "School", "school", b.schoolId ? [{ ref: r("school", b.schoolId), label: schoolName(b.schoolId) }] : []),
          g("route", "Route", "route", b.routeId ? [{ ref: r("route", b.routeId), label: b.routeId }] : []),
          g("invoice", "Invoice line", "invoice", s.invoices.filter(i => i.lines.some(l => l.bookingId === b.id)).map(i => ({ ref: r("invoice", i.id), label: i.id }))),
        ],
      };
    }
    case "message": {
      const m = s.messages.find(x => x.id === ref.id); if (!m) return null;
      return {
        kind: "message", title: m.subject, sub: m.from + " · " + m.channel + " · " + rel(m.received),
        facts: [["Queue", m.queue], ["Status", m.status], ["Classification", m.classification], ["Confidence", Math.round(m.confidence * 100) + "%"]],
        groups: [
          g("family", "Family", "family", m.familyId ? [{ ref: r("family", m.familyId), label: family(m.familyId)?.surname + " family" }] : []),
          g("about", "About", m.link?.kind || "info", m.link ? [{ ref: m.link, label: m.link.id }] : []),
        ],
      };
    }
    case "task": {
      const t = s.tasks.find(x => x.id === ref.id); if (!t) return null;
      return {
        kind: "task", title: t.title, sub: t.owner + " · " + t.due + " · " + t.status,
        facts: [["Department", t.department], ["Priority", t.priority], ["Source", t.source], ["Status", t.status]],
        groups: [
          g("about", "About", t.link?.kind || "info", t.link ? [{ ref: t.link, label: t.link.id }] : []),
          g("location", "Location", "location", t.locationId ? [{ ref: r("location", t.locationId), label: locById(t.locationId)?.short || t.locationId }] : []),
        ],
      };
    }
    default: return null;
  }
}

/* ---------------- shared selection ---------------- */
function useSelection(): [Ref, (r: Ref) => void] {
  const { ui } = useRos();
  const cur: Ref = ui.focus.recKind && ui.focus.recId && EXPLORE.has(ui.focus.recKind) ? { kind: ui.focus.recKind as RefKind, id: ui.focus.recId } : { kind: "family", id: "ROS1042" };
  return [cur, (x: Ref) => setFocus({ recKind: x.kind, recId: x.id })];
}
const QUICK: [Ref, string][] = [
  [{ kind: "family", id: "ROS1042" }, "O'Neill · ROS1042"], [{ kind: "child", id: "CH2001" }, "Luca O'Neill"], [{ kind: "route", id: "WKR-02" }, "WKR-02"],
  [{ kind: "claim", id: "NCS-0091" }, "NCS-0091"], [{ kind: "plan", id: "PLN-031" }, "PLN-031 Byrne"], [{ kind: "request", id: "LBR-006" }, "LBR-006"],
  [{ kind: "staff", id: "S031" }, "Shane Molloy"], [{ kind: "location", id: "ARR" }, "Arklow Rocks"],
];
function Picker({ onPick }: { onPick: (r: Ref) => void }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");
  const hits = searchRecords(q, 40).filter(h => kind === "all" || h.kind === kind);
  return (
    <Card title="Find a record" sub="Search families, children, staff, invoices, schools, routes, claims and requests by name or ID.">
      <Row wrap gap={8}>
        <Search value={q} onChange={setQ} placeholder="ROS1042, Luca, INV-20418, WKR-02" width={280} />
        <Seg size="sm" value={kind} onChange={setKind} options={[["all", "All"], ["family", "Families"], ["child", "Children"], ["staff", "Staff"], ["invoice", "Invoices"], ["route", "Routes"], ["school", "Schools"], ["claim", "Claims"], ["request", "Requests"]]} />
      </Row>
      {q.trim().length >= 2 ? (
        <div style={{ marginTop: 10, maxHeight: 260, overflowY: "auto" }}>
          {hits.length ? hits.map(h => <ListRow key={h.kind + h.id} onClick={() => { onPick({ kind: h.kind, id: h.id }); setQ(""); }} lead={<KindDot kind={h.kind} />} title={h.title} sub={KIND_LABEL[h.kind] + " · " + h.meta} />) : <Sub>No matches.</Sub>}
        </div>
      ) : (
        <Row wrap gap={6} style={{ marginTop: 12 }}>
          {QUICK.map(([ref, label]) => <Btn key={ref.id} size="sm" variant="subtle" onClick={() => onPick(ref)}>{label}</Btn>)}
        </Row>
      )}
    </Card>
  );
}
function KindDot({ kind }: { kind: string }) {
  const t = KIND_TONE[kind] || "neutral";
  return <span style={{ flex: "none", height: 22, padding: "0 7px", borderRadius: 6, display: "inline-flex", alignItems: "center", fontSize: 10.5, fontWeight: 600, background: toneBg[t], color: t === "brand" ? "var(--ros-navy)" : toneInk[t] }}>{(KIND_LABEL[kind] || kind).split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 3)}</span>;
}

/* ---------------- module ---------------- */
export default function RecordsExtra({ tab }: { tab: string }) {
  useRos();
  return (
    <Page>
      {tab === "Record Explorer" && <Explorer />}
      {tab === "Entity Types" && <EntityTypes />}
      {tab === "Linked History" && <History />}
      {!["Record Explorer", "Entity Types", "Linked History"].includes(tab) && <Card><Empty title={tab} body="This tab belongs to the Pulse Records page." /></Card>}
    </Page>
  );
}

/* ---------------- Record Explorer ---------------- */
function Explorer() {
  useRos();
  const [cur, setCur] = useSelection();
  const [trail, setTrail] = useState<Ref[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [all, setAll] = useState<Record<string, boolean>>({});
  const c = explore(cur);
  const go = (x: Ref) => {
    if (!EXPLORE.has(x.kind)) { if (DRAWER.has(x.kind)) openRecord(x); return; }
    setTrail(t => t.concat(cur).slice(-8)); setActive(null); setAll({}); setCur(x);
  };
  const back = (i: number) => { const x = trail[i]; setTrail(trail.slice(0, i)); setActive(null); setCur(x); };
  if (!c) return <><PageHead eyebrow="Records" title="Record explorer" /><Picker onPick={go} /><Card style={{ marginTop: 16 }}><Empty title="Record not found" body="Pick another record above." /></Card></>;
  const groups = c.groups.filter(x => x.items.length);
  const n = groups.length;
  const scoped = c.kind === "family" ? inScope(family(cur.id)?.locationId) : c.kind === "child" ? inScope(child(cur.id)?.locationId) : true;
  return (
    <>
      <PageHead eyebrow="Records" title="Record explorer" sub="Pick a record and walk its relationships one hop at a time. Select a node to re-centre on it; open any record in the drawer for full detail." />
      <Picker onPick={go} />
      {trail.length > 0 && (
        <Row wrap gap={6} style={{ margin: "14px 0 0" }}>
          <Sub>Path:</Sub>
          {trail.map((t, i) => <Btn key={i + t.id} size="sm" variant="subtle" onClick={() => back(i)}>{t.id}</Btn>)}
          <Badge tone="accent">{cur.id}</Badge>
        </Row>
      )}
      {!scoped && <div style={{ marginTop: 12 }}><Callout tone="neutral" title="Outside your location filter">This record belongs to another site. It is shown because you opened it directly.</Callout></div>}
      <Card style={{ marginTop: 16 }} pad={false} title={<Row gap={8}><KindDot kind={c.kind} /><span>{c.title}</span></Row>} sub={c.sub}
        right={DRAWER.has(cur.kind) ? <Btn size="sm" variant="primary" onClick={() => openRecord(cur)}>Open details</Btn> : undefined}>
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 10", minHeight: 340 }}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
              {groups.map((x, i) => {
                const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
                return <line key={x.key} x1={50} y1={50} x2={50 + 40 * Math.cos(a)} y2={50 + 39 * Math.sin(a)} stroke={active === x.key ? "var(--accent)" : "var(--border-strong)"} strokeWidth={active === x.key ? 2 : 1} vectorEffect="non-scaling-stroke" />;
              })}
            </svg>
            <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", maxWidth: "38%", padding: "10px 14px", borderRadius: 14, background: "var(--accent-soft)", border: "1px solid var(--accent-line)", textAlign: "center" }}>
              <div style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--accent)" }}>{KIND_LABEL[c.kind]}</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis" }}>{cur.id}</div>
            </div>
            {groups.map((x, i) => {
              const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
              const t = KIND_TONE[x.kind] || "neutral";
              const single = x.items.length === 1 && x.items[0].ref;
              return (
                <button key={x.key} className="ros-btn ros-focus" title={x.label + " (" + x.items.length + ")"}
                  onClick={() => (single ? go(x.items[0].ref!) : setActive(active === x.key ? null : x.key))}
                  style={{ position: "absolute", left: "clamp(56px, " + (50 + 40 * Math.cos(a)).toFixed(2) + "%, calc(100% - 56px))", top: 50 + 39 * Math.sin(a) + "%", transform: "translate(-50%,-50%)", maxWidth: 112, padding: "6px 9px", borderRadius: 10, cursor: "pointer", textAlign: "center", background: "var(--surface)", color: "var(--ink)", border: "1px solid " + (active === x.key ? "var(--accent)" : "var(--border-strong)"), boxShadow: "0 4px 14px rgba(0,0,0,.18)" }}>
                  <div style={{ fontSize: 9.5, letterSpacing: ".06em", textTransform: "uppercase", color: t === "brand" ? "var(--ink)" : toneInk[t], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.label}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{single ? x.items[0].label : x.items.length}</div>
                </button>
              );
            })}
          </div>
          <Grid min={150} gap={10} style={{ marginTop: 6 }}>{c.facts.map(([k, v], i) => (
            <div key={i} style={{ padding: "10px 12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-sm,10px)", minWidth: 0 }}>
              <Label style={{ fontSize: 8.5 }}>{k}</Label>
              <div style={{ fontSize: 13, marginTop: 5, overflowWrap: "anywhere" }}>{v}</div>
            </div>))}</Grid>
        </div>
      </Card>
      <Grid min={260} style={{ marginTop: 16 }}>
        {groups.slice().sort((a, b) => Number(b.key === active) - Number(a.key === active)).map(x => {
          const show = all[x.key] ? x.items : x.items.slice(0, 6);
          return (
            <Card key={x.key} title={x.label} sub={x.items.length + " linked"} tone={active === x.key ? "accent" : undefined} right={<KindDot kind={x.kind} />}>
              <Stack gap={0}>
                {show.map((it, i) => (
                  <ListRow key={i + it.label} onClick={it.ref ? () => go(it.ref!) : undefined} title={<span style={{ fontSize: 12.5 }}>{it.label}</span>} sub={it.sub}
                    right={it.ref && DRAWER.has(it.ref.kind) ? <Btn size="sm" variant="subtle" onClick={() => openRecord(it.ref!)}>Open</Btn> : undefined} />
                ))}
              </Stack>
              {x.items.length > 6 && <Btn size="sm" variant="subtle" onClick={() => setAll({ ...all, [x.key]: !all[x.key] })}>{all[x.key] ? "Show fewer" : "Show all " + x.items.length}</Btn>}
            </Card>
          );
        })}
      </Grid>
      <Row style={{ marginTop: 14 }}><Btn onClick={() => nav("Records", "Linked History", { recKind: cur.kind, recId: cur.id })}>See linked history for {cur.id}</Btn></Row>
    </>
  );
}

/* ---------------- Entity Types ---------------- */
interface EntityDef { name: string; count: number; fields: string; rels: [string, string][]; sample?: Ref[]; note?: string }
function EntityTypes() {
  const { s } = useRos();
  const [sel, setSel] = useState("Child");
  const pick = (refs: Ref[]) => refs.slice(0, 6);
  const E: EntityDef[] = [
    { name: "Organisation", count: 1, fields: "Name, registered office, nine locations", rels: [["operates", "Location"], ["employs", "Staff"]], note: "Ray of Sunshine group" },
    { name: "Location", count: s.locations.length, fields: "Name, town, county, services, manager, places", rels: [["hasRoom", "Room"], ["servesSchool", "School"], ["runsRoute", "Route"], ["managedBy", "Staff"]], sample: pick(s.locations.map(x => r("location", x.id))) },
    { name: "Room", count: s.rooms.length, fields: "Name, kind, age band, capacity, demo ratio", rels: [["inLocation", "Location"], ["groups", "Child"]] },
    { name: "School", count: s.schools.length, fields: "Name, region, serving location", rels: [["collectedBy", "Route"], ["attendedBy", "Child"]], sample: pick(s.schools.map(x => r("school", x.id))) },
    { name: "Family", count: s.families.length, fields: "Parent ID, surname, funding, payment method, channel, consents", rels: [["hasGuardian", "Guardian"], ["hasChild", "Child"], ["billedBy", "Invoice"], ["pays", "Payment"], ["onPlan", "PaymentPlan"], ["sends", "Message"]], sample: pick([r("family", "ROS1042"), r("family", "ROS1087"), r("family", "ROS1132"), r("family", "ROS1096"), r("family", "ROS1198")]) },
    { name: "Guardian", count: s.families.reduce((n, f) => n + f.guardians.length, 0), fields: "Name, relation, email, phone, primary", rels: [["guardianOf", "Family"], ["collects", "Child"]] },
    { name: "Child", count: s.children.length, fields: "Name, date of birth, programme, room, school, key worker, medical, collectors, consents", rels: [["memberOf", "Family"], ["attends", "Location"], ["inRoom", "Room"], ["attendsSchool", "School"], ["rides", "Route"], ["keyWorker", "Staff"], ["hasBooking", "Booking"], ["hasAttendance", "Attendance"], ["fundedBy", "NCSAward"], ["involvedIn", "Incident"]], sample: pick([r("child", "CH2001")].concat(s.children.slice(1, 6).map(x => r("child", x.id)))) },
    { name: "Staff", count: s.staff.length, fields: "Name, role, location, contract hours, qualification, Gaeilge, certificates", rels: [["worksAt", "Location"], ["keyWorkerFor", "Child"], ["drives", "Route"], ["trains", "Course"]], sample: pick([r("staff", "S031"), r("staff", "S019"), r("staff", "S020"), r("staff", "S013"), r("staff", "S023")]) },
    { name: "Booking", count: s.bookings.filter(b => b.status === "Booked").length, fields: "Child, date, session, times, hours, funding, route, source", rels: [["forChild", "Child"], ["atLocation", "Location"], ["usesRoute", "Route"], ["invoicedOn", "Invoice"]], sample: pick((idx().bookingsByChild.get("CH2001") || []).map(b => r("booking", b.id))) },
    { name: "Attendance", count: s.attendance.length, fields: "Child, date, event, time, recorded by, collector", rels: [["forChild", "Child"], ["onRoute", "Route"]] },
    { name: "Route", count: s.routes.length, fields: "Name, base, vehicle, driver, escort, stops, fee per run", rels: [["fromLocation", "Location"], ["usesVehicle", "Vehicle"], ["drivenBy", "Staff"], ["stopsAt", "School"]], sample: pick(s.routes.map(x => r("route", x.id))) },
    { name: "Vehicle", count: s.vehicles.length, fields: "Registration, seats, kind", rels: [["assignedTo", "Route"]] },
    { name: "Invoice", count: s.invoices.length, fields: "Family, week, issued, due, lines, plan", rels: [["billsFamily", "Family"], ["linesFor", "Child"], ["settledBy", "Payment"], ["coveredBy", "PaymentPlan"]], sample: pick((idx().invoicesByFamily.get("ROS1042") || []).concat(idx().invoicesByFamily.get("ROS1132") || []).map(i => r("invoice", i.id))) },
    { name: "Payment", count: s.payments.length, fields: "Family, invoice or plan, date, amount, method, status", rels: [["fromFamily", "Family"], ["settles", "Invoice"], ["instalmentOf", "PaymentPlan"]], sample: pick((idx().paymentsByFamily.get("ROS1042") || []).map(p => r("payment", p.id))) },
    { name: "PaymentPlan", count: s.plans.length, fields: "Family, total, revision, instalments, e-sign, owner", rels: [["forFamily", "Family"], ["covers", "Invoice"], ["collects", "Payment"]], sample: pick(s.plans.map(p => r("plan", p.id))) },
    { name: "NCSAward", count: s.awards.length, fields: "Child, CHICK, type, agreed hours, rate, expiry", rels: [["forChild", "Child"], ["claimedBy", "NCSClaim"]], sample: pick(s.awards.slice(0, 6).map(a => r("award", a.id))) },
    { name: "NCSClaim", count: s.claims.length, fields: "Award, period, hours, amount, deadline, reminders", rels: [["underAward", "NCSAward"], ["acceptedBy", "Family"]], sample: pick([r("claim", "NCS-0091")].concat(s.claims.filter(c => c.id !== "NCS-0091").slice(0, 5).map(c => r("claim", c.id)))) },
    { name: "Message", count: s.messages.length, fields: "Queue, family, subject, classification, confidence, draft, status", rels: [["fromFamily", "Family"], ["about", "any record"]], sample: pick(s.messages.map(m => r("message", m.id))) },
    { name: "Task", count: s.tasks.length, fields: "Title, owner, due, priority, department, status, link", rels: [["about", "any record"], ["ownedBy", "Staff"]], sample: pick(s.tasks.map(t => r("task", t.id))) },
    { name: "Incident", count: s.incidents.length, fields: "Child, location, time, kind, severity, witnesses, review, signature", rels: [["involves", "Child"], ["atLocation", "Location"]], sample: pick(s.incidents.map(i => r("incident", i.id))) },
    { name: "Camp", count: s.camps.length, fields: "Name, dates, ages, themes, capacity, day rate, staff, excursion", rels: [["atLocation", "Location"], ["staffedBy", "Staff"], ["registers", "Child"]], sample: pick(s.camps.map(c => r("camp", c.id))) },
    { name: "Course", count: s.courses.length, fields: "Name, date, venue, capacity, trainer, price", rels: [["trainer", "Staff"], ["bookedBy", "external attendee"]], sample: pick(s.courses.map(c => r("course", c.id))) },
  ];
  const cur = E.find(x => x.name === sel) || E[0];
  const total = E.reduce((n, x) => n + x.count, 0);
  const open = (x: Ref) => (EXPLORE.has(x.kind) ? nav("Records", "Record Explorer", { recKind: x.kind, recId: x.id }) : openRecord(x));
  return (
    <>
      <PageHead eyebrow="Records" title="Entity types" sub={"The childcare ontology behind every screen: " + E.length + " entity types and " + total.toLocaleString("en-IE") + " live records. Counts move as you work through the demo."} />
      <div className="ros-split">
        <Card pad={false}>
          <Table rows={E} rowKey={x => x.name} onRow={x => setSel(x.name)} minWidth={720} pageSize={30} rowTone={x => (x.name === sel ? "accent" : undefined)}
            cols={[
              { key: "n", label: "Entity", w: "1fr", sort: x => x.name, render: x => <span style={{ fontWeight: 500 }}>{x.name}</span> },
              { key: "c", label: "Records", w: ".6fr", align: "right", sort: x => x.count, render: x => x.count.toLocaleString("en-IE") },
              { key: "r", label: "Relationships", w: "2.4fr", render: x => <Row wrap gap={4}>{x.rels.map(([p, t]) => <Badge key={p + t} tone="info">{p} → {t}</Badge>)}</Row> },
            ]} />
        </Card>
        <Stack gap={16}>
          <Card title={cur.name} sub={cur.count.toLocaleString("en-IE") + " live record" + (cur.count === 1 ? "" : "s") + (cur.note ? " · " + cur.note : "")}>
            <Label style={{ marginBottom: 6 }}>Key fields</Label>
            <div style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.6 }}>{cur.fields}</div>
            <Label style={{ margin: "14px 0 6px" }}>Predicates</Label>
            <Stack gap={4}>
              {cur.rels.map(([p, t]) => (
                <Row key={p + t} gap={8}>
                  <Badge>{cur.name}</Badge><span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)" }}>{p}</span><span style={{ color: "var(--faint)" }}>→</span>
                  {E.some(x => x.name === t) ? <Btn size="sm" variant="subtle" onClick={() => setSel(t)}>{t}</Btn> : <Sub>{t}</Sub>}
                </Row>
              ))}
            </Stack>
            {cur.sample && cur.sample.length > 0 && (
              <>
                <Label style={{ margin: "14px 0 6px" }}>Sample records</Label>
                <Row wrap gap={6}>{cur.sample.map(x => <Btn key={x.id} size="sm" onClick={() => open(x)}>{x.id}</Btn>)}</Row>
              </>
            )}
          </Card>
          <Callout tone="info" title="One model, many screens">Every module reads these same records through shared selectors, so a count on one page cannot disagree with the table behind it on another.</Callout>
        </Stack>
      </div>
    </>
  );
}

/* ---------------- Linked History ---------------- */
type Src = "Activity" | "Comms" | "Payments" | "Attendance" | "Rota";
interface Ev { at: string; src: Src; title: string; detail?: string; tone?: Tone; link?: Ref }
function History() {
  const { s } = useRos();
  const [cur, setCur] = useSelection();
  const [src, setSrc] = useState<"all" | Src>("all");
  const [shown, setShown] = useState(40);
  const c = explore(cur);
  const related = new Set<string>([cur.kind + ":" + cur.id]);
  if (c) for (const grp of c.groups) for (const it of grp.items) if (it.ref && ["child", "invoice", "plan", "claim", "request", "award", "message", "incident", "family"].includes(it.ref.kind) && cur.kind !== "location" && cur.kind !== "school" && cur.kind !== "staff") related.add(it.ref.kind + ":" + it.ref.id);
  const fam = cur.kind === "family" ? cur.id : cur.kind === "child" ? child(cur.id)?.familyId : undefined;
  const kids = cur.kind === "family" ? family(cur.id)?.childIds || [] : cur.kind === "child" ? [cur.id] : [];
  const evs: Ev[] = [];
  for (const e of s.activity) if (e.link && related.has(e.link.kind + ":" + e.link.id)) evs.push({ at: e.at, src: "Activity", title: e.title, detail: e.actor + " · " + e.detail, tone: e.actorKind === "agent" ? "info" : e.category === "Financial" ? "warn" : "neutral", link: e.link });
  if (fam) for (const m of s.comms) if (m.familyId === fam) evs.push({ at: m.at, src: "Comms", title: (m.direction === "in" ? "In · " : m.direction === "out" ? "Out · " : "Note · ") + m.summary, detail: m.channel + " · " + m.by });
  if (fam) for (const p of s.payments) if (p.familyId === fam && (cur.kind !== "child" || !p.invoiceId || s.invoices.find(i => i.id === p.invoiceId)?.lines.some(l => l.childId === cur.id))) evs.push({ at: p.date, src: "Payments", title: euro(p.amount) + " · " + p.status, detail: p.method + " · " + p.ref + (p.retry ? " · retry " + p.retry : ""), tone: p.status === "Failed" ? "bad" : p.status === "Succeeded" ? "ok" : "warn", link: { kind: "payment", id: p.id } });
  if (cur.kind === "invoice") {
    const inv = idx().invoice.get(cur.id);
    if (inv) evs.push({ at: inv.issued, src: "Activity", title: "Invoice issued · " + euro(invoiceTotal(inv)), detail: "Due " + fmtDate(inv.due) });
    for (const p of s.payments) if (p.invoiceId === cur.id || (inv?.planId && p.planId === inv.planId)) evs.push({ at: p.date, src: "Payments", title: euro(p.amount) + " · " + p.status, detail: p.method + " · " + p.ref, tone: p.status === "Failed" ? "bad" : "ok" });
  }
  if (cur.kind === "plan") for (const p of s.payments) if (p.planId === cur.id) evs.push({ at: p.date, src: "Payments", title: euro(p.amount) + " · " + p.status, detail: p.ref, tone: "ok" });
  const ATT: Record<string, string> = { in: "Signed in", out: "Signed out", boarded: "Boarded", absent: "Absent", "not-present": "Not present at pickup" };
  for (const a of s.attendance) if (kids.includes(a.childId) || (cur.kind === "route" && a.routeId === cur.id)) evs.push({ at: a.date + " " + a.time, src: "Attendance", title: (kids.length > 1 || cur.kind === "route" ? child(a.childId)?.firstName + " · " : "") + ATT[a.kind], detail: a.by + (a.collector ? " · collected by " + a.collector : "") + (a.note ? " · " + a.note : ""), tone: a.kind === "not-present" ? "bad" : a.kind === "absent" ? "warn" : "ok", link: { kind: "child", id: a.childId } });
  if (cur.kind === "staff") {
    for (const t of s.shifts) if (t.staffId === cur.id) evs.push({ at: t.date + " " + t.start, src: "Rota", title: t.session + " · " + locById(t.locationId)?.short, detail: t.start + "–" + t.end + (t.relief ? " · relief" : "") + " · " + t.status, tone: t.relief ? "info" : "neutral" });
    for (const a of s.absences) if (a.staffId === cur.id) evs.push({ at: a.reported, src: "Rota", title: "Absence logged for " + fmtDay(a.date), detail: a.reason, tone: "warn" });
  }
  const list = evs.filter(e => src === "all" || e.src === src).sort((a, b) => b.at.localeCompare(a.at));
  const count = (x: Src) => evs.filter(e => e.src === x).length;
  const srcs: Src[] = ["Activity", "Comms", "Payments", "Attendance", "Rota"];
  const when = (at: string) => (at.length > 10 ? rel(at) : fmtDay(at));
  const segOpts: ["all" | Src, ReactNode][] = [["all", "All · " + evs.length]];
  for (const x of srcs) if (count(x)) segOpts.push([x, x + " · " + count(x)]);
  return (
    <>
      <PageHead eyebrow="Records" title="Linked history" sub="Everything that touched one record, merged in time order: activity on it and its linked records, family communications, payments, attendance and rota changes." />
      <Picker onPick={(x) => { setCur(x); setShown(40); }} />
      <Card style={{ marginTop: 16 }} title={c ? <Row gap={8}><KindDot kind={c.kind} /><span>{c.title}</span></Row> : cur.id} sub={c?.sub}
        right={<>{DRAWER.has(cur.kind) && <Btn size="sm" onClick={() => openRecord(cur)}>Open details</Btn>}<Btn size="sm" onClick={() => nav("Records", "Record Explorer", { recKind: cur.kind, recId: cur.id })}>Explore links</Btn></>}>
        <Row wrap gap={8} style={{ marginBottom: 14 }}>
          <Seg size="sm" value={src} onChange={(v) => { setSrc(v); setShown(40); }} options={segOpts} />
        </Row>
        {list.length ? (
          <>
            <Timeline items={list.slice(0, shown).map(e => ({ at: when(e.at), title: e.title, detail: e.detail, tone: e.tone, right: <><Badge>{e.src}</Badge>{e.link && e.link.kind !== "payment" && !(e.link.kind === cur.kind && e.link.id === cur.id) && DRAWER.has(e.link.kind) && <Btn size="sm" variant="subtle" onClick={() => openRecord(e.link!)}>{e.link.id}</Btn>}</> }))} />
            {list.length > shown && <Row><Sub>Showing {shown} of {list.length}</Sub><Btn size="sm" onClick={() => setShown(n => n + 60)}>Show more</Btn></Row>}
          </>
        ) : <Empty title="No history for this record yet" body="Approve, message or pay something linked to it and the entry lands here." />}
      </Card>
    </>
  );
}
