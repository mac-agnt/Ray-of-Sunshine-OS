/* Enrolment: from first enquiry to first day, and out again. The lead
   pipeline and its Day 1/3/7/14 follow-ups, per-site waitlists checked
   against room capacity, a digital registration that creates a real family
   and child record, and the two-month leaver workflow. Offers, follow-ups
   and confirmations are simulated and logged to Activity. */
import { useState, type ReactNode } from "react";
import type { Child, Collector, Enquiry, EnquiryStage, Family, LocationId, MedicalFlag, NCSAward, RosState, WaitlistEntry } from "../types";
import { useRos, defineAction, openRecord, nav, setFocus, confirmThen, getState } from "../store";
import { child, family, idx, inScope, scopedLocations, locById, familyDue, childName, schoolName, staffById, bookingsOn } from "../selectors";
import { TODAY, THIS_WEEK, addDays, daysBetween, fmtDate, fmtDay, fmtDateY, euro, rel } from "../time";
import {
  Page, PageHead, Card, Kpi, Grid, Table, Badge, StatusBadge, Btn, RecLink, HBars, KV, Callout, Seg, Search, ListRow,
  DemoTag, Empty, Row, Stack, Sub, Label, Field, Toggle, Meter, Timeline, type Col,
} from "../ui";
import { FamilyPicker, resolveFamily, addMonths, fillVars, TEMPLATES } from "./Comms";

/* ======================================================================
   Rules and helpers
   ====================================================================== */
const STAGES: EnquiryStage[] = ["New enquiry", "Contacted", "Visit booked", "Offered", "Registration sent", "Enrolled", "Started"];
const NEXT_IN: Record<EnquiryStage, number> = { "New enquiry": 1, Contacted: 3, "Visit booked": 2, Offered: 5, "Registration sent": 3, Enrolled: 7, Started: 14 };
const FOLLOW_DAYS = [1, 3, 7, 14];
const CLOSED: EnquiryStage[] = ["Enrolled", "Started"];
const managerOf = (s: RosState, loc: string) => { const l = s.locations.find(x => x.id === loc); return s.staff.find(x => x.id === l?.managerId)?.name || "Location manager"; };
const later = (a: string, b: string) => (a > b ? a : b);
const firstName = (n: string) => n.split(" ")[0];
const serviceText = (sv: Enquiry["service"]) => (sv === "Early Years" ? "our Early Years rooms" : sv === "SAC" ? "after-school care" : "our camps");

const FOLLOW_TEXT: Record<number, string> = {
  1: "Hi {first}, thanks for getting in touch with Ray of Sunshine about {service} at {loc}. I'd love to show you around. Would a Tuesday or Thursday morning suit for a visit? Reply with any questions about fees, NCS or the school runs too. {owner}, {loc}",
  3: "Hi {first}, just following up on your enquiry about {service} at {loc}. We have visit slots this week and next. If it helps, our NCS team can talk you through what your subsidy would cover. {owner}",
  7: "Hi {first}, checking in once more about a place for {children}. Places for {start} are being allocated now, and I can hold one for a few days while you decide. {owner}",
  14: "Hi {first}, I'll close off your enquiry for now so we don't keep emailing you. If anything changes, reply to this email and we'll pick it up straight away. You're also welcome to join the waiting list. {owner}",
};
const followText = (e: Enquiry, d: number) => FOLLOW_TEXT[d].replace(/\{first\}/g, firstName(e.parent)).replace(/\{service\}/g, serviceText(e.service)).replace(/\{loc\}/g, locById(e.locationId)?.short || "").replace(/\{owner\}/g, e.owner).replace(/\{children\}/g, e.children.replace(/^1 child · /, "your child, ")).replace(/\{start\}/g, e.startWanted);
const followSent = (s: RosState, e: Enquiry, d: number) => s.activity.some(a => a.link?.kind === "enquiry" && a.link.id === e.id && a.title.startsWith("Day " + d + " follow-up sent"));
function followStatus(s: RosState, e: Enquiry, d: number): { label: string; tone: "ok" | "bad" | "warn" | "neutral"; due: string } {
  const due = addDays(e.received, d);
  if (followSent(s, e, d)) return { label: "Sent", tone: "ok", due };
  if (due < TODAY) return e.stage === "New enquiry" ? { label: "Overdue", tone: "bad", due } : { label: "Handled earlier", tone: "neutral", due };
  if (due === TODAY) return { label: "Due today", tone: "warn", due };
  return { label: "Scheduled", tone: "neutral", due };
}
const overdueFollow = (e: Enquiry) => !CLOSED.includes(e.stage) && e.nextFollowUp < TODAY;

function nextIds(s: RosState) {
  const fam = Math.max(...s.families.map(f => +f.id.replace(/\D/g, "")).filter(n => isFinite(n)));
  const ch = Math.max(...s.children.map(c => +c.id.replace(/\D/g, "")).filter(n => isFinite(n)));
  return { fid: "ROS" + (fam + 1), cid: "CH" + (ch + 1) };
}

type Cap = { label: string; cap: number; used: number; off: number; free: number; none?: boolean };
function capacityFor(loc: string, service: WaitlistEntry["service"], roomKind: string): Cap {
  const s = getState();
  const off = s.waitlist.filter(w => w.locationId === loc && w.service === service && w.room === roomKind && (w.status === "Offered" || w.status === "Accepted")).length;
  if (service === "Early Years") {
    const room = s.rooms.find(r => r.locationId === loc && r.kind === roomKind);
    if (!room) return { label: roomKind + " (not offered here)", cap: 0, used: 0, off, free: 0, none: true };
    const used = s.children.filter(c => c.roomId === room.id).length;
    return { label: room.name + " · " + room.kind, cap: room.capacity, used, off, free: room.capacity - used - off };
  }
  const l = locById(loc);
  const peak = Math.max(0, ...THIS_WEEK.map(d => bookingsOn(d, loc, "After School").length));
  const cap = l?.sacCapacity || 0;
  return { label: "School age · busiest day this week", cap, used: peak, off, free: cap - peak - off };
}
const PRIO: Record<WaitlistEntry["priority"], number> = { Sibling: 0, Staff: 1, Standard: 2 };
const sortWait = (a: WaitlistEntry, b: WaitlistEntry) => PRIO[a.priority] - PRIO[b.priority] || a.added.localeCompare(b.added);

/* ======================================================================
   Actions owned by Enrolment
   ====================================================================== */
export const moveEnquiry = defineAction<{ id: string; stage: EnquiryStage }>("enrol.stage", (s, p, ctx) => {
  const e = s.enquiries.find(x => x.id === p.id); if (!e || e.stage === p.stage) return;
  const from = e.stage;
  e.stage = p.stage; e.nextFollowUp = addDays(TODAY, NEXT_IN[p.stage]);
  if (CLOSED.includes(p.stage)) s.tasks.forEach(t => { if (t.link?.kind === "enquiry" && t.link.id === e.id) t.status = "Done"; });
  ctx.log({ category: "Enrolment", title: e.parent + ": " + from + " → " + p.stage, detail: e.id + " · " + e.service + " · " + (s.locations.find(l => l.id === e.locationId)?.short || "") + ". Next follow-up " + fmtDay(e.nextFollowUp) + ".", link: { kind: "enquiry", id: e.id }, locationId: e.locationId });
  ctx.agent("enrolment", e.id + " moved to " + p.stage + " by " + ctx.actor, "action", { kind: "enquiry", id: e.id });
}, { toast: (p) => "Moved to " + p.stage + ". Logged to Activity.", undo: true });

export const sendFollowUp = defineAction<{ id: string; day: number; text: string }>("enrol.followup", (s, p, ctx) => {
  const e = s.enquiries.find(x => x.id === p.id); if (!e) return;
  if (e.stage === "New enquiry") e.stage = "Contacted";
  const next = FOLLOW_DAYS.find(d => d > p.day);
  e.nextFollowUp = next ? later(addDays(e.received, next), addDays(TODAY, 1)) : addDays(TODAY, 14);
  s.tasks.forEach(t => { if (t.link?.kind === "enquiry" && t.link.id === e.id && t.status !== "Done") t.status = "Done"; });
  ctx.log({ category: "Enrolment", title: "Day " + p.day + " follow-up sent: " + e.parent, detail: "Email to " + e.parent + " (simulated, not sent): " + p.text.slice(0, 120) + (p.text.length > 120 ? "..." : ""), link: { kind: "enquiry", id: e.id }, locationId: e.locationId });
  ctx.agent("enrolment", "Day " + p.day + " follow-up for " + e.id + " approved by " + ctx.actor, "action", { kind: "enquiry", id: e.id });
}, { toast: () => "Follow-up logged (simulated email)." });

export const offerPlace = defineAction<{ id: string; note?: string }>("enrol.offer", (s, p, ctx) => {
  const w = s.waitlist.find(x => x.id === p.id); if (!w || w.status !== "Waiting") return;
  w.status = "Offered";
  const due = addDays(TODAY, 2);
  s.tasks.push({ id: ctx.id("TSK"), title: "Chase reply to place offer: " + w.childName + " (48h)", owner: managerOf(s, w.locationId), due: fmtDay(due), dueDate: due, priority: "Medium", department: "Enrolment", status: "Not started", link: { kind: "waitlist", id: w.id }, source: "Enrolment agent", locationId: w.locationId });
  ctx.log({ category: "Enrolment", title: "Place offered: " + w.childName, detail: w.service + " · " + w.room + " · " + (s.locations.find(l => l.id === w.locationId)?.short || "") + " from " + fmtDate(w.requestedStart) + (p.note ? ". " + p.note : "") + ". Offer email to " + w.parent + " (simulated). Not a family yet, so there is no family timeline.", link: { kind: "waitlist", id: w.id }, locationId: w.locationId });
  ctx.agent("enrolment", "Offer for " + w.childName + " (" + w.id + ") sent on " + ctx.actor + "'s say-so", "action", { kind: "waitlist", id: w.id });
}, { toast: () => "Place offered (simulated email). A 48h chase task was added.", undo: true });

export const setWaitlistStatus = defineAction<{ id: string; status: "Accepted" | "Declined" }>("enrol.waitlistStatus", (s, p, ctx) => {
  const w = s.waitlist.find(x => x.id === p.id); if (!w || w.status !== "Offered") return;
  w.status = p.status;
  s.tasks.forEach(t => { if (t.link?.kind === "waitlist" && t.link.id === w.id) t.status = "Done"; });
  ctx.log({ category: "Enrolment", title: "Offer " + p.status.toLowerCase() + ": " + w.childName, detail: p.status === "Accepted" ? "Next step: digital registration." : "Place returns to the waitlist for the next family.", link: { kind: "waitlist", id: w.id }, locationId: w.locationId });
}, { toast: (p) => p.status === "Accepted" ? "Accepted. Start the digital registration next." : "Declined. The place is free again." });

interface RegPayload {
  guardians: { name: string; relation: string; email: string; phone: string }[];
  channel: Family["channel"]; language: Family["language"];
  first: string; surname: string; dob: string; programme: "EY" | "SAC"; locationId: LocationId; roomId: string;
  schoolId?: string; schoolClass?: string; routeId?: string; start: string;
  medical?: MedicalFlag; collectors: Collector[];
  funding: "NCS" | "Private"; chickTail: string; awardType: NCSAward["type"]; hours: number; rate: number;
  consents: Child["consents"]; method: Family["method"]; waitlistId?: string; enquiryId?: string;
}
export const completeRegistration = defineAction<RegPayload>("enrol.register", (s, p, ctx) => {
  const loc = s.locations.find(l => l.id === p.locationId); if (!loc) return;
  const { fid, cid } = nextIds(s);
  const f: Family = {
    id: fid, surname: p.surname, guardians: p.guardians.map((g, i) => ({ ...g, primary: i === 0 })), childIds: [], locationId: loc.id,
    funding: p.funding, method: p.method, language: p.language, channel: p.channel, consentsComplete: true, blocked: false,
    flags: ["New starter"], notes: "Registered digitally on " + fmtDate(TODAY) + " by " + ctx.actor + ".", joined: TODAY,
  };
  s.families.push(f);
  const kw = s.staff.find(x => x.locationId === loc.id && (p.programme === "EY" ? x.role === "Room Leader" : x.role === "SAC Leader")) || s.staff.find(x => x.id === loc.managerId)!;
  const c: Child = {
    id: cid, firstName: p.first, surname: p.surname, familyId: fid, dob: p.dob, age: Math.max(0, Math.floor(daysBetween(p.dob, TODAY) / 365.25)),
    locationId: loc.id, programme: p.programme, roomId: p.roomId, schoolId: p.programme === "SAC" ? p.schoolId : undefined, schoolClass: p.programme === "SAC" ? p.schoolClass : undefined,
    keyWorkerId: kw.id, medical: p.medical ? [p.medical] : [],
    collectors: p.guardians.map(g => ({ name: g.name, relation: g.relation, permitted: true } as Collector)).concat(p.collectors),
    consents: p.consents, routeId: p.programme === "SAC" && p.consents.transport ? p.routeId : undefined, started: p.start,
  };
  s.children.push(c); f.childIds.push(c.id);
  if (p.funding === "NCS") {
    const aw: NCSAward = { id: ctx.id("AW"), childId: c.id, familyId: fid, chick: "CHK-••••-" + p.chickTail, type: p.awardType, agreedHours: p.hours, rate: p.rate, lastChange: TODAY, nextChange: addDays(TODAY, 56), expires: addDays(TODAY, 364), status: "Active" };
    s.awards.push(aw); c.awardId = aw.id;
  }
  const w = p.waitlistId ? s.waitlist.find(x => x.id === p.waitlistId) : undefined;
  if (w) { w.status = "Accepted"; s.tasks.forEach(t => { if (t.link?.kind === "waitlist" && t.link.id === w.id) t.status = "Done"; }); }
  const e = p.enquiryId ? s.enquiries.find(x => x.id === p.enquiryId) : undefined;
  if (e) { e.stage = "Enrolled"; e.nextFollowUp = addDays(TODAY, 7); }
  ctx.comm(fid, "Email", "out", "Registration complete. Welcome pack and MyRosKids invite sent (simulated)", ctx.actor);
  if (p.method === "SEPA direct debit") ctx.comm(fid, "System", "note", "SEPA mandate captured: IE•• •••• •••• •••• 1234 (demo, masked)", "Registration");
  const startD = later(addDays(p.start, -3), TODAY);
  s.tasks.push({ id: ctx.id("TSK"), title: "Set up billing and first invoice: " + p.surname + " (" + fid + ")", owner: "Gráinne Whelan", due: fmtDay(startD), dueDate: startD, priority: "Medium", department: "Accounts", status: "Not started", link: { kind: "family", id: fid }, source: "Registration", locationId: loc.id });
  ctx.log({ category: "Enrolment", title: "New family registered: " + p.surname + " (" + fid + ")", detail: p.first + " " + p.surname + " · " + (p.programme === "EY" ? "Early Years" : "School age") + " at " + loc.short + " from " + fmtDate(p.start) + " · " + p.funding + (p.medical ? " · medical alert on file" : "") + ". Parent ID " + fid + ", child " + cid + ".", link: { kind: "family", id: fid }, locationId: loc.id });
  ctx.agent("enrolment", "Digital registration completed for " + p.first + " " + p.surname + " (" + fid + ")" + (w ? ", waitlist " + w.id + " closed" : "") + (e ? ", enquiry " + e.id + " enrolled" : ""), "action", { kind: "family", id: fid });
}, { toast: () => "Registered. New family and child records created." });

export const createSettling = defineAction<{ childId: string }>("enrol.settling", (s, p, ctx) => {
  const c = s.children.find(x => x.id === p.childId); if (!c) return;
  if (s.tasks.some(t => t.link?.kind === "child" && t.link.id === c.id && t.source === "Settling-in plan")) return;
  const kw = s.staff.find(x => x.id === c.keyWorkerId)?.name || managerOf(s, c.locationId);
  const steps: [string, number][] = [["Visit 1 with parent (1 hour)", -7], ["Visit 2, short stay without parent (2 hours)", -4], ["Key worker call and All About Me review", -2], ["First short day (half day)", 0], ["Two-week settling review with parent", 14]];
  for (const [title, off] of steps) {
    const d = later(addDays(c.started, off), TODAY);
    s.tasks.push({ id: ctx.id("TSK"), title: "Settling-in: " + title + " · " + c.firstName + " " + c.surname, owner: kw, due: fmtDay(d), dueDate: d, priority: off === 0 ? "High" : "Medium", department: "Early Years", status: "Not started", link: { kind: "child", id: c.id }, source: "Settling-in plan", locationId: c.locationId });
  }
  ctx.log({ category: "Enrolment", title: "Settling-in plan created: " + c.firstName + " " + c.surname, detail: steps.length + " tasks for " + kw + ", starting " + fmtDay(c.started) + ".", link: { kind: "child", id: c.id }, locationId: c.locationId });
}, { toast: () => "Settling-in tasks created for the key worker." });

export const recordLeaver = defineAction<{ familyId: string; notice: string; finalCharge: string; lastDay: string; reason: string }>("enrol.leaver", (s, p, ctx) => {
  const f = s.families.find(x => x.id === p.familyId); if (!f) return;
  f.flags = f.flags.filter(x => !x.startsWith("Leaving")).concat("Leaving " + fmtDate(p.finalCharge));
  f.notes = (f.notes ? f.notes + " " : "") + "Written notice received " + fmtDate(p.notice) + " (" + p.reason.toLowerCase() + "). Last day " + fmtDate(p.lastDay) + "; final charge date " + fmtDate(p.finalCharge) + ".";
  const loc = s.locations.find(l => l.id === f.locationId)!;
  s.tasks.push({ id: ctx.id("TSK"), title: "Final invoice and statement: " + f.surname + " (" + f.id + ")", owner: "Gráinne Whelan", due: fmtDay(p.finalCharge), dueDate: p.finalCharge, priority: "Medium", department: "Accounts", status: "Not started", link: { kind: "family", id: f.id }, source: "Leaver workflow", locationId: f.locationId });
  if (f.funding === "NCS") s.tasks.push({ id: ctx.id("TSK"), title: "Update NCS records: " + f.surname + " leaving " + fmtDate(p.lastDay), owner: "Lorraine Tobin", due: fmtDay(p.lastDay), dueDate: p.lastDay, priority: "Medium", department: "NCS", status: "Not started", link: { kind: "family", id: f.id }, source: "Leaver workflow", locationId: f.locationId });
  const offerBy = later(addDays(p.lastDay, -14), TODAY);
  s.tasks.push({ id: ctx.id("TSK"), title: "Offer freed place(s) at " + loc.short + " from " + fmtDate(p.lastDay), owner: managerOf(s, f.locationId), due: fmtDay(offerBy), dueDate: offerBy, priority: "Low", department: "Enrolment", status: "Not started", link: { kind: "family", id: f.id }, source: "Leaver workflow", locationId: f.locationId });
  ctx.comm(f.id, "Email", "out", "Leaver confirmation: notice received " + fmtDate(p.notice) + ", final charge date " + fmtDate(p.finalCharge) + " (simulated, not sent)", ctx.actor);
  ctx.log({ category: "Enrolment", title: "Leaver notice recorded: " + f.surname + " (" + f.id + ")", detail: "Notice " + fmtDate(p.notice) + " · last day " + fmtDate(p.lastDay) + " · fees continue to " + fmtDate(p.finalCharge) + " (" + s.config.leavingNoticeMonths + "-month notice) · " + p.reason + ".", link: { kind: "family", id: f.id }, locationId: f.locationId });
  ctx.agent("enrolment", "Leaver workflow started for " + f.surname + " (" + f.id + "): final invoice, NCS update and waitlist offer tasks", "action", { kind: "family", id: f.id });
}, { toast: () => "Notice recorded. Confirmation logged and follow-up tasks created." });

/* ======================================================================
   Module
   ====================================================================== */
export default function Enrolment({ tab }: { tab: string }) {
  useRos();
  switch (tab) {
    case "Enquiries": return <Enquiries />;
    case "Waitlists": return <Waitlists />;
    case "Digital Registration": return <Registration />;
    case "Leavers": return <Leavers />;
    default: return <Pipeline />;
  }
}

/* ---------------- Lead Pipeline ---------------- */
function Pipeline() {
  const { s } = useRos();
  const [svc, setSvc] = useState<"All" | Enquiry["service"]>("All");
  const [owner, setOwner] = useState("All");
  const all = s.enquiries.filter(e => inScope(e.locationId));
  const owners = ["All", ...Array.from(new Set(all.map(e => e.owner)))];
  const list = all.filter(e => (svc === "All" || e.service === svc) && (owner === "All" || e.owner === owner));
  const open = all.filter(e => !CLOSED.includes(e.stage));
  const od = open.filter(overdueFollow);
  const conv = all.length ? all.filter(e => CLOSED.includes(e.stage)).length / all.length : 0;
  const bySource = new Map<string, number>(); for (const e of all) bySource.set(e.source, (bySource.get(e.source) || 0) + 1);
  return (
    <Page>
      <PageHead eyebrow="Enrolment · Lead pipeline" title="From enquiry to first day"
        sub="Every enquiry from the website, Facebook, phone and walk-ins, owned by a location manager. The Enrolment agent drafts the Day 1, 3, 7 and 14 follow-ups; a person moves each lead on." />
      <Grid min={150} style={{ marginBottom: 16 }}>
        <Kpi label="Open leads" value={open.length} />
        <Kpi label="Follow-ups overdue" value={od.length} tone={od.length ? "bad" : "ok"} onClick={() => nav("Enrolment", "Enquiries")} />
        <Kpi label="Visits booked" value={all.filter(e => e.stage === "Visit booked").length} />
        <Kpi label="Offers out" value={all.filter(e => e.stage === "Offered" || e.stage === "Registration sent").length} tone="warn" />
        <Kpi label="Converted" value={Math.round(conv * 100) + "%"} sub="Enrolled or started" tone="ok" />
      </Grid>
      <Row wrap gap={10} style={{ marginBottom: 12 }}>
        <Seg size="sm" value={svc} onChange={setSvc} options={["All", "Early Years", "SAC", "Camps"]} />
        <select className="ros-input" style={{ width: 200 }} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">{owners.map(o => <option key={o} value={o}>{o === "All" ? "Every owner" : o}</option>)}</select>
        <div style={{ flex: 1 }} />
        <Sub>{list.length} leads shown</Sub>
      </Row>
      <div className="ros-scroll-x" style={{ paddingBottom: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(232px, 1fr))", gap: 12, minWidth: 7 * 244 }}>
          {STAGES.map((st, si) => {
            const col = list.filter(e => e.stage === st).sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp));
            return (
              <div key={st} style={{ background: "var(--surface-faint)", border: "1px solid var(--border)", borderRadius: 16, padding: 10, minWidth: 0 }}>
                <Row gap={8} style={{ padding: "2px 4px 10px" }}><span style={{ fontSize: 13, fontWeight: 600 }}>{st}</span><Badge>{col.length}</Badge></Row>
                <Stack gap={8}>
                  {col.map(e => <LeadCard key={e.id} e={e} si={si} />)}
                  {!col.length && <div style={{ padding: "16px 8px", textAlign: "center" }}><Sub>No leads</Sub></div>}
                </Stack>
              </div>
            );
          })}
        </div>
      </div>
      <div className="ros-split-even" style={{ marginTop: 16 }}>
        <Card title="Funnel"><HBars items={STAGES.map(st => ({ label: st, value: all.filter(e => STAGES.indexOf(e.stage) >= STAGES.indexOf(st)).length, tone: CLOSED.includes(st) ? "ok" as const : "accent" as const }))} /></Card>
        <Card title="Where enquiries come from"><HBars items={[...bySource.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v }))} /></Card>
      </div>
    </Page>
  );
}

function LeadCard({ e, si }: { e: Enquiry; si: number }) {
  const od = overdueFollow(e);
  const today = !CLOSED.includes(e.stage) && e.nextFollowUp === TODAY;
  const next = STAGES[si + 1];
  return (
    <div className="ros-card-click" onClick={() => openRecord({ kind: "enquiry", id: e.id })}
      style={{ background: "var(--surface)", border: "1px solid " + (od ? "var(--bad)" : "var(--border)"), borderRadius: 12, padding: 11 }}>
      <Row gap={6}><span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.parent}</span><Sub>{e.id}</Sub></Row>
      <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 4 }}>{e.children}</div>
      <Row wrap gap={4} style={{ marginTop: 8 }}>
        <Badge tone="info">{e.service}</Badge><Badge>{locById(e.locationId)?.short}</Badge><Badge>{e.source}</Badge>{e.sibling && <Badge tone="accent">Sibling</Badge>}
      </Row>
      <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 8 }}>{e.owner} · wants {e.startWanted}</div>
      {!CLOSED.includes(e.stage) && <div style={{ marginTop: 6 }}><Badge tone={od ? "bad" : today ? "warn" : "neutral"}>{od ? "Overdue · was " + fmtDay(e.nextFollowUp) : "Follow up " + (today ? "today" : fmtDay(e.nextFollowUp))}</Badge></div>}
      <Row wrap gap={6} style={{ marginTop: 10 }}>
        {si > 0 && <Btn size="sm" variant="subtle" title={"Back to " + STAGES[si - 1]} onClick={() => moveEnquiry({ id: e.id, stage: STAGES[si - 1] })}>Back</Btn>}
        {next && <Btn size="sm" variant={od ? "primary" : "ghost"} onClick={() => moveEnquiry({ id: e.id, stage: next })}>{next === "Visit booked" ? "Book visit" : next === "Offered" ? "Offer place" : next === "Registration sent" ? "Send registration" : next === "Started" ? "Mark started" : "Move to " + next.toLowerCase()}</Btn>}
        {e.stage === "Registration sent" && <Btn size="sm" onClick={() => nav("Enrolment", "Digital Registration", { enquiryId: e.id, waitlistId: "" })}>Register</Btn>}
        {e.stage === "New enquiry" && <Btn size="sm" variant="subtle" onClick={() => nav("Enrolment", "Enquiries", { enquiryId: e.id })}>Drafts</Btn>}
      </Row>
    </div>
  );
}

/* ---------------- Enquiries ---------------- */
function Enquiries() {
  const { s, ui } = useRos();
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("All");
  const all = s.enquiries.filter(e => inScope(e.locationId));
  const t = q.trim().toLowerCase();
  const rows = all.filter(e => (stage === "All" || (stage === "Overdue" ? overdueFollow(e) : e.stage === stage)) && (!t || (e.id + " " + e.parent + " " + e.note + " " + e.children).toLowerCase().includes(t)))
    .sort((a, b) => (overdueFollow(b) ? 1 : 0) - (overdueFollow(a) ? 1 : 0) || b.received.localeCompare(a.received));
  const sel = all.find(e => e.id === ui.focus.enquiryId) || rows[0];
  const cols: Col<Enquiry>[] = [
    { key: "id", label: "Enquiry", w: ".7fr", render: e => <RecLink r={{ kind: "enquiry", id: e.id }} />, sort: e => e.id },
    { key: "p", label: "Parent", w: "1.3fr", render: e => <Stack><span style={{ fontWeight: 500 }}>{e.parent}</span><Sub>{e.children}</Sub></Stack>, sort: e => e.parent },
    { key: "s", label: "Service", w: "1fr", render: e => <Stack><span>{e.service}</span><Sub>{locById(e.locationId)?.short}</Sub></Stack>, sort: e => e.service },
    { key: "src", label: "Source", w: ".7fr", render: e => e.source, sort: e => e.source },
    { key: "st", label: "Stage", w: "1fr", render: e => <StatusBadge s={e.stage} />, sort: e => STAGES.indexOf(e.stage) },
    { key: "r", label: "Received", w: ".7fr", render: e => fmtDate(e.received), sort: e => e.received },
    { key: "n", label: "Next follow-up", w: ".9fr", render: e => CLOSED.includes(e.stage) ? <Sub>Done</Sub> : <Badge tone={overdueFollow(e) ? "bad" : e.nextFollowUp === TODAY ? "warn" : "neutral"}>{fmtDay(e.nextFollowUp)}</Badge>, sort: e => e.nextFollowUp },
  ];
  return (
    <Page>
      <PageHead eyebrow="Enrolment · Enquiries" title="Enquiries and follow-ups"
        sub="Each enquiry gets drafted follow-ups on Day 1, 3, 7 and 14 from the day it arrived. Edit the wording, then send. Sends are simulated and logged against the enquiry." />
      <Row wrap gap={10} style={{ marginBottom: 12 }}>
        <Search value={q} onChange={setQ} placeholder="Parent, enquiry ID or note" width={260} />
        <select className="ros-input" style={{ width: 190 }} value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Stage">
          {["All", "Overdue", ...STAGES].map(x => <option key={x} value={x}>{x === "All" ? "Every stage" : x === "Overdue" ? "Follow-up overdue" : x}</option>)}
        </select>
        <div style={{ flex: 1 }} /><Sub>{rows.length} of {all.length}</Sub>
      </Row>
      <div className="ros-split">
        <Card pad={false}><Table rows={rows} cols={cols} rowKey={e => e.id} minWidth={820} dense empty="No enquiries match" onRow={e => setFocus({ enquiryId: e.id })} rowTone={e => (sel && e.id === sel.id ? "accent" : overdueFollow(e) ? "bad" : undefined)} /></Card>
        {sel ? <EnquiryDetail key={sel.id} e={sel} /> : <Card><Empty title="No enquiries in scope" /></Card>}
      </div>
    </Page>
  );
}

function EnquiryDetail({ e }: { e: Enquiry }) {
  const { s } = useRos();
  const [open, setOpen] = useState<number>(() => FOLLOW_DAYS.find(d => { const st = followStatus(s, e, d).label; return st === "Overdue" || st === "Due today"; }) || 1);
  const [texts, setTexts] = useState<Record<number, string>>(() => Object.fromEntries(FOLLOW_DAYS.map(d => [d, followText(e, d)])));
  const si = STAGES.indexOf(e.stage);
  const log = s.activity.filter(a => a.link?.kind === "enquiry" && a.link.id === e.id).sort((a, b) => b.seq - a.seq);
  return (
    <Stack gap={14}>
      <Card title={e.parent} sub={e.id + " · " + e.service + " at " + locById(e.locationId)?.short} right={<StatusBadge s={e.stage} />}>
        <KV items={[["Children", e.children], ["Start wanted", e.startWanted], ["Source", e.source], ["Owner", e.owner], ["Received", fmtDay(e.received)], ["Sibling", e.sibling ? "Yes, priority" : "No"]]} />
        <div style={{ marginTop: 10, fontSize: 13, color: "var(--body)", lineHeight: 1.55 }}>“{e.note}”</div>
        <Row wrap gap={4} style={{ marginTop: 12 }}>
          {STAGES.map((st, i) => <Badge key={st} tone={i < si ? "ok" : i === si ? "accent" : "neutral"}>{st}</Badge>)}
        </Row>
        <Row wrap style={{ marginTop: 12 }}>
          {STAGES[si + 1] && <Btn variant="primary" size="sm" onClick={() => moveEnquiry({ id: e.id, stage: STAGES[si + 1] })}>Move to {STAGES[si + 1].toLowerCase()}</Btn>}
          {(e.stage === "Offered" || e.stage === "Registration sent") && <Btn size="sm" onClick={() => nav("Enrolment", "Digital Registration", { enquiryId: e.id, waitlistId: "" })}>Start registration</Btn>}
          <Btn size="sm" variant="subtle" onClick={() => nav("Enrolment", "Lead Pipeline")}>Pipeline</Btn>
        </Row>
      </Card>
      <Card title="Follow-up drafts" sub="Drafted by the Enrolment agent from the day the enquiry arrived" right={<DemoTag>Simulated email</DemoTag>}>
        {FOLLOW_DAYS.map(d => {
          const st = followStatus(s, e, d);
          return (
            <div key={d} style={{ borderTop: "1px solid var(--border)", padding: "10px 0" }}>
              <Row gap={8} style={{ cursor: "pointer" }}>
                <span onClick={() => setOpen(open === d ? 0 : d)} style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>Day {d} · {fmtDay(st.due)}</span>
                <Badge tone={st.tone}>{st.label}</Badge>
                <Btn size="sm" variant="subtle" onClick={() => setOpen(open === d ? 0 : d)}>{open === d ? "Hide" : "View"}</Btn>
              </Row>
              {open === d && (
                <div style={{ marginTop: 8 }}>
                  <textarea className="ros-input" rows={5} value={texts[d]} onChange={(ev) => setTexts(x => ({ ...x, [d]: ev.target.value }))} disabled={st.label === "Sent"} aria-label={"Day " + d + " draft"} />
                  {st.label !== "Sent" && <Row style={{ marginTop: 8 }}><Btn size="sm" variant="primary" disabled={!texts[d].trim() || CLOSED.includes(e.stage)} onClick={() => sendFollowUp({ id: e.id, day: d, text: texts[d] })}>Send Day {d} (simulated)</Btn>{CLOSED.includes(e.stage) && <Sub>Already enrolled.</Sub>}</Row>}
                </div>
              )}
            </div>
          );
        })}
      </Card>
      <Card title="Activity on this enquiry">
        {log.length ? <Timeline items={log.slice(0, 8).map(a => ({ at: rel(a.at), title: a.title, detail: a.actor }))} /> : <Sub>No activity logged in this demo session yet.</Sub>}
      </Card>
    </Stack>
  );
}

/* ---------------- Waitlists ---------------- */
function Waitlists() {
  const { s } = useRos();
  const [svc, setSvc] = useState<"All" | WaitlistEntry["service"]>("All");
  const [status, setStatus] = useState<"Open" | "All">("Open");
  const all = s.waitlist.filter(w => inScope(w.locationId));
  const list = all.filter(w => (svc === "All" || w.service === svc) && (status === "All" || w.status === "Waiting" || w.status === "Offered"));
  const sites = scopedLocations().filter(l => list.some(w => w.locationId === l.id));
  const waiting = all.filter(w => w.status === "Waiting");
  return (
    <Page>
      <PageHead eyebrow="Enrolment · Waitlists" title="Waitlists by site"
        sub="Siblings first, then staff, then by date added. Each offer is checked against the room's capacity, counting places already offered. Offers are simulated emails." />
      <Grid min={150} style={{ marginBottom: 16 }}>
        <Kpi label="Waiting" value={waiting.length} />
        <Kpi label="Sibling priority" value={waiting.filter(w => w.priority === "Sibling").length} tone="info" />
        <Kpi label="Staff priority" value={waiting.filter(w => w.priority === "Staff").length} />
        <Kpi label="Offers out" value={all.filter(w => w.status === "Offered").length} tone="warn" />
        <Kpi label="Accepted" value={all.filter(w => w.status === "Accepted").length} tone="ok" />
      </Grid>
      <Row wrap gap={10} style={{ marginBottom: 12 }}>
        <Seg size="sm" value={svc} onChange={setSvc} options={["All", "Early Years", "SAC"]} />
        <Seg size="sm" value={status} onChange={setStatus} options={[["Open", "Waiting and offered"], ["All", "Everything"]] as ["Open" | "All", ReactNode][]} />
      </Row>
      {!sites.length && <Card><Empty title="Nobody on a waitlist here" body="Waitlist entries appear when a family asks for a place that is full." /></Card>}
      <Stack gap={16}>
        {sites.map(l => {
          const ws = list.filter(w => w.locationId === l.id).sort(sortWait);
          const groups = Array.from(new Set(ws.map(w => w.service + "|" + w.room)));
          return (
            <Card key={l.id} title={l.name} sub={ws.length + " on the list · " + l.town + ", Co. " + l.county}>
              <Grid min={240} gap={12} style={{ marginBottom: 14 }}>
                {groups.map(g => { const [sv, rk] = g.split("|") as [WaitlistEntry["service"], string]; const c = capacityFor(l.id, sv, rk); return (
                  <div key={g} style={{ padding: 12, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                    <Meter label={c.label} value={c.used + c.off} max={c.cap || 1} hint={c.off ? c.off + " offered" : undefined} />
                    <div style={{ marginTop: 6 }}><Sub>{c.none ? "Room type not offered at this site" : c.free > 0 ? c.free + " place" + (c.free === 1 ? "" : "s") + " free to offer" : "Full · offers wait for a leaver"}</Sub></div>
                  </div>
                ); })}
              </Grid>
              {ws.map((w, i) => {
                const c = capacityFor(l.id, w.service, w.room);
                return (
                  <ListRow key={w.id} tone={w.priority !== "Standard" && w.status === "Waiting" ? "accent" : undefined}
                    lead={<span style={{ width: 22, textAlign: "center", fontSize: 12, color: "var(--faint)", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>}
                    title={<Row wrap gap={6}><span style={{ fontWeight: 500 }}>{w.childName}</span>{w.priority !== "Standard" && <Badge tone={w.priority === "Sibling" ? "info" : "brand"}>{w.priority} priority</Badge>}<StatusBadge s={w.status} /></Row>}
                    sub={w.parent + " · " + w.room + " · " + w.days + " · from " + fmtDate(w.requestedStart) + " · added " + fmtDate(w.added) + " (" + daysBetween(w.added, TODAY) + " days)"}
                    right={<Row gap={6}>
                      <RecLink r={{ kind: "waitlist", id: w.id }} />
                      {w.status === "Waiting" && <Btn size="sm" variant="primary" disabled={c.free <= 0} title={c.free <= 0 ? "No free place in " + c.label : undefined}
                        onClick={() => confirmThen({ title: "Offer a place to " + w.childName + "?", body: w.room + " at " + l.short + " from " + fmtDay(w.requestedStart) + ". Capacity check: " + (c.used + c.off) + " of " + c.cap + " taken, " + c.free + " free. Sends an offer email to " + w.parent + " (simulated) and adds a 48h chase task.", confirmLabel: "Offer place", run: () => offerPlace({ id: w.id }) })}>Offer place</Btn>}
                      {w.status === "Offered" && <><Btn size="sm" variant="ok" onClick={() => setWaitlistStatus({ id: w.id, status: "Accepted" })}>Accepted</Btn><Btn size="sm" variant="subtle" onClick={() => setWaitlistStatus({ id: w.id, status: "Declined" })}>Declined</Btn></>}
                      {w.status === "Accepted" && <Btn size="sm" onClick={() => nav("Enrolment", "Digital Registration", { waitlistId: w.id, enquiryId: "" })}>Register</Btn>}
                    </Row>} />
                );
              })}
            </Card>
          );
        })}
      </Stack>
    </Page>
  );
}

/* ---------------- Digital Registration ---------------- */
interface Coll { name: string; relation: string; permitted: boolean; note: string }
interface Form {
  src: string;
  g1: { name: string; relation: string; email: string; phone: string };
  g2: { name: string; relation: string; email: string; phone: string }; hasG2: boolean;
  channel: Family["channel"]; language: Family["language"];
  first: string; surname: string; dob: string; programme: "EY" | "SAC"; loc: string; roomId: string; schoolId: string; schoolClass: string; routeId: string; start: string;
  medKind: "None" | MedicalFlag["kind"]; medDetail: string; medSeverity: MedicalFlag["severity"];
  collectors: Coll[];
  funding: "NCS" | "Private"; chick: string; awardType: NCSAward["type"]; hours: number; rate: number;
  consents: Child["consents"];
  docs: Record<string, boolean>;
  terms: boolean; policy: boolean; signature: string;
  method: Family["method"]; mandate: boolean;
}
const STEPS = ["Parent", "Child", "Medical", "Collectors", "NCS", "Consents", "Documents", "Terms", "Payment", "Review"] as const;
type Step = typeof STEPS[number];
const CLASSES = ["Junior Infants", "Senior Infants", "1st Class", "2nd Class", "3rd Class", "4th Class", "5th Class", "6th Class"];
const DOB_FOR: Record<string, string> = { "Crèche": "2025-02-10", "Preschool Junior": "2023-06-12", "Preschool Senior (ECCE)": "2022-11-03", SAC: "2019-04-22" };
const email = (n: string) => n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/'/g, "").replace(/\s+/g, ".") + "@parents.demo.roskids.example";
const eyRoomsAt = (loc: string) => getState().rooms.filter(r => r.locationId === loc && r.kind !== "SAC");
const schoolsAt = (loc: string) => getState().schools.filter(x => x.locationId === loc && x.name !== "Hazelbrook");
const routesFor = (loc: string, school: string) => getState().routes.filter(r => r.locationId === loc && r.stops.some(st => st.schoolId === school));

function placeDefaults(loc: string, programme: "EY" | "SAC", roomKind?: string): Pick<Form, "programme" | "roomId" | "schoolId" | "schoolClass" | "routeId" | "dob"> {
  const rooms = eyRoomsAt(loc);
  if (programme === "EY" && rooms.length) {
    const room = rooms.find(r => r.kind === roomKind) || rooms.find(r => capacityFor(loc, "Early Years", r.kind).free > 0) || rooms[0];
    return { programme: "EY", roomId: room.id, schoolId: "", schoolClass: "", routeId: "", dob: DOB_FOR[room.kind] };
  }
  const sc = schoolsAt(loc)[0];
  return { programme: "SAC", roomId: loc + "-SAC", schoolId: sc?.id || "", schoolClass: "2nd Class", routeId: sc ? routesFor(loc, sc.id)[0]?.id || "" : "", dob: DOB_FOR.SAC };
}

function blankForm(src: string): Form {
  const s = getState();
  const locs = scopedLocations();
  const w = s.waitlist.find(x => x.id === src);
  const e = s.enquiries.find(x => x.id === src);
  const loc = (w?.locationId || e?.locationId) && locs.some(l => l.id === (w?.locationId || e?.locationId)) ? (w?.locationId || e?.locationId)! : (locs.find(l => eyRoomsAt(l.id).length) || locs[0]).id;
  const wantsEY = w ? w.service === "Early Years" : e ? e.service === "Early Years" : eyRoomsAt(loc).length > 0;
  const parent = w?.parent || e?.parent || "Clodagh Brennan";
  const surname = parent.split(" ").slice(1).join(" ") || "Brennan";
  const childFirst = w ? w.childName.split(" ")[0] : e ? "" : "Fiadh";
  const place = placeDefaults(loc, wantsEY ? "EY" : "SAC", w?.room);
  return {
    src,
    g1: { name: parent, relation: "Mother", email: email(parent), phone: "087 555 3184" },
    g2: { name: (w || e) ? "" : "Rory " + surname, relation: "Father", email: (w || e) ? "" : email("Rory " + surname), phone: (w || e) ? "" : "086 555 7720" }, hasG2: !(w || e),
    channel: "App", language: "English",
    first: childFirst, surname, ...place, loc, start: w?.requestedStart && w.requestedStart > TODAY ? w.requestedStart : "2026-11-02",
    medKind: "None", medDetail: "", medSeverity: "Moderate",
    collectors: [{ name: "Bernadette " + surname, relation: "Grandmother", permitted: true, note: "" }],
    funding: "NCS", chick: "", awardType: "Universal", hours: wantsEY ? 30 : 12, rate: 2.14,
    consents: { photos: true, transport: true, outings: true, sunscreen: true },
    docs: {}, terms: false, policy: false, signature: "", method: "SEPA direct debit", mandate: false,
  };
}
function docsNeeded(f: Form): string[] {
  return ["Birth certificate (copy)", ...(f.programme === "EY" ? ["Immunisation record", "All About Me form"] : []), ...(f.medKind !== "None" ? ["Medical care plan signed by GP"] : []), ...(f.funding === "NCS" ? ["NCS award letter"] : []), ...(f.collectors.length ? ["Photo ID for extra collectors"] : [])];
}
function stepIssues(f: Form): Record<Step, string[]> {
  const out = Object.fromEntries(STEPS.map(x => [x, [] as string[]])) as Record<Step, string[]>;
  if (f.g1.name.trim().split(" ").length < 2) out.Parent.push("First and last name for the main guardian");
  if (!/@/.test(f.g1.email)) out.Parent.push("A valid email");
  if (f.g1.phone.replace(/\D/g, "").length < 7) out.Parent.push("A mobile number");
  if (f.hasG2 && !f.g2.name.trim()) out.Parent.push("Second guardian's name, or remove them");
  if (!f.first.trim() || !f.surname.trim()) out.Child.push("Child's first name and surname");
  if (!f.dob) out.Child.push("Date of birth");
  if (f.programme === "SAC" && !f.schoolId) out.Child.push("School");
  if (f.programme === "EY" && !f.roomId) out.Child.push("Room");
  if (!f.start || f.start < TODAY) out.Child.push("A start date from today on");
  if (f.medKind !== "None" && !f.medDetail.trim()) out.Medical.push("Describe the condition and what staff should do");
  if (f.collectors.some(c => !c.name.trim())) out.Collectors.push("Every extra collector needs a name");
  if (f.funding === "NCS" && f.chick.replace(/\s/g, "").length < 6) out.NCS.push("The CHICK from the NCS award letter");
  if (f.funding === "NCS" && !(f.hours > 0)) out.NCS.push("Agreed hours per week");
  const need = docsNeeded(f).filter(d => !f.docs[d]);
  if (need.length) out.Documents.push("Upload: " + need.join(", "));
  if (!f.terms || !f.policy) out.Terms.push("Accept the fee terms and the collection policy");
  if (f.signature.trim().toLowerCase() !== f.g1.name.trim().toLowerCase()) out.Terms.push("Type the main guardian's full name to sign");
  if (f.method === "SEPA direct debit" && !f.mandate) out.Payment.push("Authorise the direct debit mandate");
  return out;
}

type Done = { fid: string; cid: string; ey: boolean };
function Registration() {
  const { ui } = useRos();
  const [done, setDone] = useState<Done | null>(null);
  const src = ui.focus.waitlistId || ui.focus.enquiryId || "";
  if (done) return <RegDone done={done} onAgain={() => setDone(null)} />;
  return <RegistrationForm key={src} src={src} onDone={setDone} />;
}

function RegistrationForm({ src, onDone }: { src: string; onDone: (d: Done) => void }) {
  const { s } = useRos();
  const [f, setF] = useState<Form>(() => blankForm(src));
  const [step, setStep] = useState<Step>("Parent");
  const up = (p: Partial<Form>) => setF(x => ({ ...x, ...p }));
  const issues = stepIssues(f);
  const allOk = STEPS.every(st => !issues[st].length);
  const locs = scopedLocations();
  const sources = [
    ...s.waitlist.filter(w => inScope(w.locationId) && (w.status === "Offered" || w.status === "Accepted")).map(w => [w.id, w.id + " · " + w.childName + " (waitlist, " + w.status.toLowerCase() + ")"] as [string, string]),
    ...s.enquiries.filter(e => inScope(e.locationId) && (e.stage === "Offered" || e.stage === "Registration sent")).map(e => [e.id, e.id + " · " + e.parent + " (enquiry)"] as [string, string]),
  ];
  const srcLabel = src ? (s.waitlist.find(w => w.id === src) ? "waitlist " + src : "enquiry " + src) : "";
  const idxStep = STEPS.indexOf(step);
  const submit = () => {
    const ids = nextIds(getState());
    const payload: RegPayload = {
      guardians: [f.g1, ...(f.hasG2 && f.g2.name.trim() ? [f.g2] : [])].map(g => ({ name: g.name.trim(), relation: g.relation, email: g.email || email(g.name), phone: g.phone })),
      channel: f.channel, language: f.language, first: f.first.trim(), surname: f.surname.trim(), dob: f.dob, programme: f.programme, locationId: f.loc as LocationId,
      roomId: f.programme === "EY" ? f.roomId : f.loc + "-SAC", schoolId: f.schoolId || undefined, schoolClass: f.schoolClass || undefined, routeId: f.routeId || undefined, start: f.start,
      medical: f.medKind !== "None" ? { kind: f.medKind, detail: f.medDetail.trim(), severity: f.medSeverity } : undefined,
      collectors: f.collectors.map(c => ({ name: c.name.trim(), relation: c.relation, permitted: c.permitted, note: c.note.trim() || undefined })),
      funding: f.funding, chickTail: f.chick.replace(/\s/g, "").slice(-3).toUpperCase(), awardType: f.awardType, hours: f.hours, rate: f.rate,
      consents: f.consents, method: f.method, waitlistId: s.waitlist.some(w => w.id === f.src) ? f.src : undefined, enquiryId: s.enquiries.some(e => e.id === f.src) ? f.src : undefined,
    };
    confirmThen({
      title: "Complete registration for " + payload.first + " " + payload.surname + "?",
      body: "Creates Parent ID " + ids.fid + " and child " + ids.cid + " at " + locById(f.loc)?.short + ", starting " + fmtDay(f.start) + (payload.waitlistId ? ", closes " + payload.waitlistId + " as accepted" : "") + (payload.enquiryId ? ", marks " + payload.enquiryId + " enrolled" : "") + ". The welcome email and mandate are simulated.",
      confirmLabel: "Create family", run: () => { completeRegistration(payload); onDone({ fid: ids.fid, cid: ids.cid, ey: f.programme === "EY" }); setFocus({ waitlistId: "", enquiryId: "" }); },
    });
  };


  const rooms = eyRoomsAt(f.loc), schools = schoolsAt(f.loc), routes = f.schoolId ? routesFor(f.loc, f.schoolId) : [];
  const inp = (val: string, on: (v: string) => void, ph?: string, type = "text") => <input className="ros-input" type={type} value={val} placeholder={ph} onChange={(e) => on(e.target.value)} />;
  const sel = (val: string, on: (v: string) => void, opts: [string, string][]) => <select className="ros-input" value={val} onChange={(e) => on(e.target.value)}>{opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
  const tog = (on: boolean, flip: () => void, label: ReactNode) => <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, cursor: "pointer", padding: "6px 0" }}><Toggle on={on} onChange={flip} label={typeof label === "string" ? label : undefined} />{label}</label>;

  return (
    <Page>
      <PageHead eyebrow="Enrolment · Digital registration" title="Registration form preview"
        sub="What a new family completes in MyRosKids. Completing it here creates a real family and child record in the demo with the next free ROS Parent ID."
        right={<DemoTag>Simulated mandate and email</DemoTag>} />
      <Card style={{ marginBottom: 14 }}>
        <Row wrap gap={10}>
          <Field label="Start from">
            <select className="ros-input" style={{ minWidth: 280 }} value={src} onChange={(e) => { const v = e.target.value; const isW = s.waitlist.some(w => w.id === v); setFocus({ waitlistId: isW ? v : "", enquiryId: !isW ? v : "" }); }}>
              <option value="">Blank sample family</option>
              {sources.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <div style={{ flex: 1 }} />
          {srcLabel && <Badge tone="info">Prefilled from {srcLabel}</Badge>}
          <Btn size="sm" variant="subtle" onClick={() => { setF(blankForm(src)); setStep("Parent"); }}>Reset form</Btn>
        </Row>
      </Card>
      <div style={{ marginBottom: 14 }}>
        <Seg size="sm" value={step} onChange={setStep} options={STEPS.map((st, i) => [st, (issues[st].length ? "" : "✓ ") + (i + 1) + " " + st] as [Step, ReactNode])} />
      </div>
      <div className="ros-split">
        <Card title={(idxStep + 1) + ". " + step} sub={issues[step].length ? "Still needed: " + issues[step].join("; ") : "Complete"}>
          <Stack gap={12}>
            {step === "Parent" && <>
              <Label>Main guardian (billing contact)</Label>
              <div className="ros-split-even">
                <Field label="Full name">{inp(f.g1.name, v => up({ g1: { ...f.g1, name: v } }))}</Field>
                <Field label="Relationship">{sel(f.g1.relation, v => up({ g1: { ...f.g1, relation: v } }), ["Mother", "Father", "Guardian", "Grandparent", "Foster parent"].map(x => [x, x]))}</Field>
                <Field label="Email">{inp(f.g1.email, v => up({ g1: { ...f.g1, email: v } }), "name@example.com", "email")}</Field>
                <Field label="Mobile" hint="Fictional 555 numbers in the demo">{inp(f.g1.phone, v => up({ g1: { ...f.g1, phone: v } }), "087 555 0000", "tel")}</Field>
              </div>
              {tog(f.hasG2, () => up({ hasG2: !f.hasG2 }), "Add a second guardian")}
              {f.hasG2 && <div className="ros-split-even">
                <Field label="Full name">{inp(f.g2.name, v => up({ g2: { ...f.g2, name: v, email: f.g2.email || "" } }))}</Field>
                <Field label="Relationship">{sel(f.g2.relation, v => up({ g2: { ...f.g2, relation: v } }), ["Father", "Mother", "Guardian", "Grandparent", "Partner"].map(x => [x, x]))}</Field>
                <Field label="Email">{inp(f.g2.email, v => up({ g2: { ...f.g2, email: v } }), "Optional", "email")}</Field>
                <Field label="Mobile">{inp(f.g2.phone, v => up({ g2: { ...f.g2, phone: v } }), "Optional", "tel")}</Field>
              </div>}
              <div className="ros-split-even">
                <Field label="Preferred channel">{sel(f.channel, v => up({ channel: v as Family["channel"] }), [["App", "MyRosKids app"], ["Email", "Email"], ["SMS", "SMS"]])}</Field>
                <Field label="Home language">{sel(f.language, v => up({ language: v as Family["language"] }), ["English", "Irish", "Polish", "Portuguese", "Ukrainian"].map(x => [x, x]))}</Field>
              </div>
            </>}
            {step === "Child" && <>
              <div className="ros-split-even">
                <Field label="First name">{inp(f.first, v => up({ first: v }))}</Field>
                <Field label="Surname">{inp(f.surname, v => up({ surname: v }))}</Field>
                <Field label="Date of birth">{inp(f.dob, v => up({ dob: v }), "", "date")}</Field>
                <Field label="Start date">{inp(f.start, v => up({ start: v }), "", "date")}</Field>
                <Field label="Location">{sel(f.loc, v => up({ loc: v, ...placeDefaults(v, f.programme === "EY" && eyRoomsAt(v).length ? "EY" : "SAC") }), locs.map(l => [l.id, l.short]))}</Field>
                <Field label="Service">{sel(f.programme, v => up(placeDefaults(f.loc, v as "EY" | "SAC")), [...(rooms.length ? [["EY", "Early Years"] as [string, string]] : []), ["SAC", "School age (after school)"]])}</Field>
              </div>
              {f.programme === "EY" ? (
                <Field label="Room" hint="Capacity counts enrolled children plus places already offered">
                  {sel(f.roomId, v => up({ roomId: v, dob: DOB_FOR[rooms.find(r => r.id === v)?.kind || "SAC"] }), rooms.map(r => { const c = capacityFor(f.loc, "Early Years", r.kind); return [r.id, r.name + " · " + r.kind + " · " + (c.free > 0 ? c.free + " free" : "full")]; }))}
                </Field>
              ) : (
                <div className="ros-split-even">
                  <Field label="School">{sel(f.schoolId, v => up({ schoolId: v, routeId: routesFor(f.loc, v)[0]?.id || "" }), schools.map(x => [x.id, x.name]))}</Field>
                  <Field label="Class">{sel(f.schoolClass, v => up({ schoolClass: v }), CLASSES.map(x => [x, x]))}</Field>
                  <Field label="School run" hint={routes.length ? "Needs transport consent" : "No bus serves this school"}>{sel(f.routeId, v => up({ routeId: v }), [["", "No bus (walk or parent drop)"], ...routes.map(r => [r.id, r.id + " · " + r.name + " · " + r.stops.find(st => st.schoolId === f.schoolId)?.time] as [string, string])])}</Field>
                </div>
              )}
              {f.programme === "EY" && (() => { const r = rooms.find(x => x.id === f.roomId); const c = r ? capacityFor(f.loc, "Early Years", r.kind) : undefined; return c && c.free <= 0 ? <Callout tone="warn" title={r!.name + " is full"}>Registration can still complete for a future start, but the place should come from a leaver or the waitlist offer first.</Callout> : null; })()}
            </>}
            {step === "Medical" && <>
              <Field label="Medical need, allergy or diet">{sel(f.medKind, v => up({ medKind: v as Form["medKind"] }), ["None", "Allergy", "Asthma", "Epilepsy", "Diabetes", "Eczema", "Dietary"].map(x => [x, x === "None" ? "None to declare" : x]))}</Field>
              {f.medKind !== "None" && <>
                <Field label="What staff need to know and do"><textarea className="ros-input" rows={4} value={f.medDetail} onChange={(e) => up({ medDetail: e.target.value })} placeholder="e.g. Peanut allergy · adrenaline auto-injector, call 112 and parent" /></Field>
                <Field label="Severity">{sel(f.medSeverity, v => up({ medSeverity: v as MedicalFlag["severity"] }), ["Info", "Moderate", "Severe"].map(x => [x, x]))}</Field>
                <Callout tone="info">Medical details are only shown to roles with medical access: owner, operations, location manager, room staff and drivers.</Callout>
              </>}
            </>}
            {step === "Collectors" && <>
              <Sub>Guardians are authorised automatically. Add anyone else who may collect, and anyone who must not.</Sub>
              {f.collectors.map((c, i) => (
                <div key={i} style={{ padding: 12, borderRadius: 12, border: "1px solid " + (c.permitted ? "var(--border)" : "var(--bad)"), background: "var(--surface-2)" }}>
                  <div className="ros-split-even">
                    <Field label="Name">{inp(c.name, v => up({ collectors: f.collectors.map((x, j) => j === i ? { ...x, name: v } : x) }))}</Field>
                    <Field label="Relationship">{sel(c.relation, v => up({ collectors: f.collectors.map((x, j) => j === i ? { ...x, relation: v } : x) }), ["Grandmother", "Grandfather", "Aunt", "Uncle", "Childminder", "Neighbour", "Family friend", "Not permitted"].map(x => [x, x]))}</Field>
                  </div>
                  <Row wrap gap={12} style={{ marginTop: 8 }}>
                    {tog(c.permitted, () => up({ collectors: f.collectors.map((x, j) => j === i ? { ...x, permitted: !x.permitted } : x) }), c.permitted ? "Permitted to collect" : "NOT permitted")}
                    <div style={{ flex: 1, minWidth: 160 }}>{inp(c.note, v => up({ collectors: f.collectors.map((x, j) => j === i ? { ...x, note: v } : x) }), c.permitted ? "Password or note (optional)" : "Reason, e.g. court order on file")}</div>
                    <Btn size="sm" variant="subtle" onClick={() => up({ collectors: f.collectors.filter((_, j) => j !== i) })}>Remove</Btn>
                  </Row>
                </div>
              ))}
              <Row><Btn size="sm" onClick={() => up({ collectors: [...f.collectors, { name: "", relation: "Grandmother", permitted: true, note: "" }] })}>Add collector</Btn></Row>
            </>}
            {step === "NCS" && <>
              {sel(f.funding, v => up({ funding: v as Form["funding"] }), [["NCS", "Using the National Childcare Scheme"], ["Private", "Paying privately"]])}
              {f.funding === "NCS" && <>
                <div className="ros-split-even">
                  <Field label="CHICK (from the award letter)" hint="Stored masked; only the last 3 characters are kept in the demo"><input className="ros-input" type="password" autoComplete="off" value={f.chick} onChange={(e) => up({ chick: e.target.value })} placeholder="e.g. AB12CD3" /></Field>
                  <Field label="Award type">{sel(f.awardType, v => up({ awardType: v as NCSAward["type"], rate: v === "Universal" ? 2.14 : f.rate }), [["Universal", "Universal"], ["Income assessed", "Income assessed"]])}</Field>
                  <Field label="Agreed hours per week">{inp(String(f.hours), v => up({ hours: Math.max(0, Math.min(45, Number(v) || 0)) }), "", "number")}</Field>
                  <Field label="Subsidy per hour (demo)">{inp(String(f.rate), v => up({ rate: Math.max(0, Number(v) || 0) }), "", "number")}</Field>
                </div>
                {f.chick && <Sub>Will be stored as CHK-••••-{f.chick.replace(/\s/g, "").slice(-3).toUpperCase()}</Sub>}
                <Callout tone="neutral" title="Programme rule vs our policy">NCS rule: the CHICK must be registered before the week it applies to. Ray of Sunshine policy: hours booked without a valid CHICK are charged privately after a human review.</Callout>
              </>}
            </>}
            {step === "Consents" && <>
              {tog(f.consents.photos, () => up({ consents: { ...f.consents, photos: !f.consents.photos } }), "Photos in the app and room displays")}
              {tog(f.consents.transport, () => up({ consents: { ...f.consents, transport: !f.consents.transport } }), "Transport on the school run minibus")}
              {tog(f.consents.outings, () => up({ consents: { ...f.consents, outings: !f.consents.outings } }), "Local outings and excursions")}
              {tog(f.consents.sunscreen, () => up({ consents: { ...f.consents, sunscreen: !f.consents.sunscreen } }), "Sunscreen applied by staff")}
              <Sub>Saying no is fine; staff see each choice on the child file.</Sub>
            </>}
            {step === "Documents" && <>
              {docsNeeded(f).map(d => <ListRow key={d} title={d} sub={f.docs[d] ? "Uploaded (demo file)" : "Not uploaded"} right={<Btn size="sm" variant={f.docs[d] ? "ok" : "ghost"} onClick={() => up({ docs: { ...f.docs, [d]: !f.docs[d] } })}>{f.docs[d] ? "Uploaded" : "Upload (demo)"}</Btn>} />)}
              <Row><Btn size="sm" variant="subtle" onClick={() => up({ docs: Object.fromEntries(docsNeeded(f).map(d => [d, true])) })}>Mark all uploaded</Btn></Row>
            </>}
            {step === "Terms" && <>
              <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--body)", padding: 12, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)", maxHeight: 180, overflowY: "auto" }}>
                Fees and payment terms 2026/27 (summary). Bookings are made in the weekly window and fees are due on receipt. Part hours are billed to the next full hour. Late bookings carry a €{s.config.lateFee} fee and depend on space and staffing. Collection after 18:00 is billed as an extra hour. Leaving needs {s.config.leavingNoticeMonths} months' written notice; fees continue for the notice period. Unpaid balances follow the reminder steps on Days 2, 5 and 7, and new bookings may be paused from Day {s.config.blockDay}.
              </div>
              {tog(f.terms, () => up({ terms: !f.terms }), "I accept the fees and payment terms 2026/27")}
              {tog(f.policy, () => up({ policy: !f.policy }), "I have read the collection and late collection policy")}
              <Field label={"Sign by typing " + (f.g1.name || "the main guardian's name")}>{inp(f.signature, v => up({ signature: v }), f.g1.name)}</Field>
              {f.signature && f.signature.trim().toLowerCase() === f.g1.name.trim().toLowerCase() && <Badge tone="ok">Signed {fmtDateY(TODAY)} (demo e-signature)</Badge>}
            </>}
            {step === "Payment" && <>
              <Field label="How will you pay?">{sel(f.method, v => up({ method: v as Family["method"] }), [["SEPA direct debit", "SEPA direct debit"], ["Card on file", "Card saved in MyRosKids"], ["Bank transfer", "Bank transfer"]])}</Field>
              {f.method === "SEPA direct debit" && <>
                <KV items={[["Account (IBAN)", "IE•• •••• •••• •••• 1234 (demo)"], ["Mandate reference", "ROS-MDT-" + nextIds(s).fid.slice(3)], ["Creditor", "Ray of Sunshine Services"], ["Collected", "Friday after the invoice week"]]} />
                {tog(f.mandate, () => up({ mandate: !f.mandate }), "I authorise Ray of Sunshine to collect fees by SEPA direct debit")}
                <Callout tone="neutral">No real bank details are entered in this demo. Production would hand this step to the payment provider's hosted page.</Callout>
              </>}
              {f.method === "Card on file" && <Callout tone="neutral">The card is added on the payment provider's secure page inside MyRosKids. No card details are collected here.</Callout>}
              {f.method === "Bank transfer" && <Callout tone="neutral">Invoices show the Parent ID as the payment reference so the bank feed can match transfers.</Callout>}
            </>}
            {step === "Review" && <ReviewStep f={f} issues={issues} />}
            <Row wrap style={{ marginTop: 4 }}>
              {idxStep > 0 && <Btn onClick={() => setStep(STEPS[idxStep - 1])}>Back</Btn>}
              {idxStep < STEPS.length - 1 && <Btn variant="primary" onClick={() => setStep(STEPS[idxStep + 1])}>Next: {STEPS[idxStep + 1]}</Btn>}
              {step === "Review" && <Btn variant="primary" disabled={!allOk} onClick={submit}>Complete registration</Btn>}
            </Row>
          </Stack>
        </Card>
        <Stack gap={14}>
          <Card title="Progress" sub={STEPS.filter(st => !issues[st].length).length + " of " + STEPS.length + " sections complete"}>
            {STEPS.map(st => <ListRow key={st} onClick={() => setStep(st)} tone={st === step ? "accent" : undefined} title={st} sub={issues[st].length ? issues[st].join("; ") : undefined} right={<Badge tone={issues[st].length ? "warn" : "ok"}>{issues[st].length ? "To do" : "Done"}</Badge>} />)}
          </Card>
          {f.programme === "EY" && <SettlingPreview f={f} />}
        </Stack>
      </div>
    </Page>
  );
}

function ReviewStep({ f, issues }: { f: Form; issues: Record<Step, string[]> }) {
  const { s } = useRos();
  const ids = nextIds(s);
  const room = s.rooms.find(r => r.id === f.roomId);
  const todo = STEPS.filter(st => issues[st].length);
  return (
    <Stack gap={12}>
      {todo.length ? <Callout tone="warn" title="Not ready yet">{todo.map(st => st + ": " + issues[st].join("; ")).join(" · ")}</Callout> : <Callout tone="ok" title="Ready to register">Completing creates {ids.fid} and {ids.cid}.</Callout>}
      <KV items={[
        ["New Parent ID", ids.fid], ["Child", (f.first || "?") + " " + f.surname + " · " + ids.cid],
        ["Guardians", [f.g1.name, f.hasG2 ? f.g2.name : ""].filter(Boolean).join(", ")], ["Contact", f.channel + " · " + f.language],
        ["Place", locById(f.loc)?.short + " · " + (f.programme === "EY" ? (room?.name || "") + " (" + (room?.kind || "") + ")" : schoolName(f.schoolId) + ", " + f.schoolClass)],
        ["Starts", f.start ? fmtDay(f.start) + " " + f.start.slice(0, 4) : "Not set"],
        ["School run", f.programme === "SAC" && f.routeId && f.consents.transport ? f.routeId : "No"],
        ["Medical", f.medKind === "None" ? "None declared" : f.medKind + " · " + f.medSeverity],
        ["Extra collectors", f.collectors.length ? f.collectors.map(c => c.name + (c.permitted ? "" : " (NOT permitted)")).join(", ") : "None"],
        ["Funding", f.funding === "NCS" ? "NCS · " + f.awardType + " · " + f.hours + "h/wk · CHK-••••-" + f.chick.replace(/\s/g, "").slice(-3).toUpperCase() : "Private"],
        ["Consents", Object.entries(f.consents).map(([k, v]) => k + (v ? " yes" : " no")).join(", ")],
        ["Payment", f.method === "SEPA direct debit" ? "SEPA · IE•• •••• •••• •••• 1234 (demo)" + (f.mandate ? " · authorised" : "") : f.method],
      ]} />
    </Stack>
  );
}

function SettlingPreview({ f }: { f: Form }) {
  const steps: [string, number][] = [["Visit 1 with parent (1 hour)", -7], ["Visit 2, short stay without parent (2 hours)", -4], ["Key worker call and All About Me review", -2], ["First short day (half day)", 0], ["Two-week settling review with parent", 14]];
  return (
    <Card title="Early Years settling-in plan" sub="Created as tasks for the key worker when the family is registered">
      {steps.map(([t, off]) => <ListRow key={t} title={t} sub={f.start ? fmtDay(later(addDays(f.start, off), TODAY)) : "Set a start date"} />)}
      <div style={{ marginTop: 6 }}><Sub>Comfort item, sleep routine and feeding notes are captured on the All About Me form.</Sub></div>
    </Card>
  );
}

function RegDone({ done, onAgain }: { done: Done; onAgain: () => void }) {
  const { s } = useRos();
  const f = family(done.fid), c = child(done.cid);
  const settled = s.tasks.some(t => t.link?.kind === "child" && t.link.id === done.cid && t.source === "Settling-in plan");
  return (
    <Page>
      <PageHead eyebrow="Enrolment · Digital registration" title="Registration complete" sub="The new family exists everywhere in the demo now: search the Parent ID from the header, Families or the inbox." />
      {f && c ? (
        <div className="ros-split">
          <Card title={f.surname + " family · " + f.id} sub={childName(c) + " · " + c.id + " · " + locById(c.locationId)?.short + " from " + fmtDay(c.started)} right={<Badge tone="ok">New starter</Badge>}>
            <KV items={[["Guardians", f.guardians.map(g => g.name).join(", ")], ["Funding", f.funding], ["Pays by", f.method], ["Key worker", staffById(c.keyWorkerId)?.name || ""]]} />
            <Row wrap style={{ marginTop: 14 }}>
              <Btn variant="primary" onClick={() => nav("Families", "Family Profile", { familyId: f.id })}>Open new family</Btn>
              <Btn onClick={() => nav("Children", "Child File", { childId: c.id })}>Open child file</Btn>
              <Btn variant="subtle" onClick={onAgain}>Register another</Btn>
            </Row>
          </Card>
          {done.ey ? (
            <Card title="Settling-in checklist" sub={"Early Years · key worker " + (staffById(c.keyWorkerId)?.name || "")}>
              {settled ? s.tasks.filter(t => t.link?.kind === "child" && t.link.id === c.id && t.source === "Settling-in plan").map(t => <ListRow key={t.id} title={t.title.replace("Settling-in: ", "").replace(" · " + childName(c), "")} sub={t.owner + " · " + t.due} right={<StatusBadge s={t.status} />} />)
                : <><Sub>Five steps from the first visit to the two-week review.</Sub><Row style={{ marginTop: 12 }}><Btn variant="primary" onClick={() => createSettling({ childId: c.id })}>Create settling-in tasks</Btn></Row></>}
            </Card>
          ) : (
            <Card title="Next steps"><Stack gap={6}><Sub>Accounts sets up billing before the first week (task created).</Sub><Sub>The family books sessions in the next booking window from MyRosKids.</Sub>{c.routeId && <Sub>{c.firstName} is added to {c.routeId} from the first booked day.</Sub>}</Stack></Card>
          )}
        </div>
      ) : <Card><Empty title="Record not found" body="Undo may have removed it." action={<Btn onClick={onAgain}>Start again</Btn>} /></Card>}
    </Page>
  );
}

/* ---------------- Leavers ---------------- */
function Leavers() {
  const { s, ui, role } = useRos();
  const r = resolveFamily(ui.focus.familyId);
  const [notice, setNotice] = useState(TODAY);
  const [lastDay, setLastDay] = useState("");
  const [reason, setReason] = useState("Moving away");
  if (!r.id) return <Page><Card><Empty title="No families in your scope" /></Card></Page>;
  const f = family(r.id)!;
  const kids = f.childIds.map(child).filter((c): c is Child => !!c);
  const finalCharge = addMonths(notice || TODAY, s.config.leavingNoticeMonths);
  const last = lastDay || finalCharge;
  const due = familyDue(f.id);
  const lastAtt = kids.flatMap(k => s.attendance.filter(a => a.childId === k.id && a.kind === "in").map(a => a.date)).sort().slice(-1)[0];
  const lastBooked = kids.flatMap(k => (idx().bookingsByChild.get(k.id) || []).map(b => b.date)).sort().slice(-1)[0];
  const ncsBy = addDays(last, s.config.ncsLeaveNoticeWeeks * 7);
  const leaving = f.flags.find(x => x.startsWith("Leaving"));
  const leavers = s.families.filter(x => inScope(x.locationId) && x.flags.some(fl => fl.startsWith("Leaving")));
  const tpl = TEMPLATES.find(t => t.id === "TPL-11")!;
  const preview = fillVars(tpl.body, f.id).replace(fmtDay(TODAY), fmtDay(notice || TODAY)).replace(fmtDay(addMonths(TODAY, s.config.leavingNoticeMonths)), fmtDay(finalCharge));
  return (
    <Page>
      <PageHead eyebrow="Enrolment · Leavers" title="Two-month written notice"
        sub={"Fees continue for " + s.config.leavingNoticeMonths + " months from the day written notice arrives, even if the child leaves sooner. Record the notice, confirm it to the family, and offer the freed place to the waitlist."} />
      <FamilyPicker value={f.id} note={r.note} onPick={(id) => setFocus({ familyId: id })} />
      <div className="ros-split">
        <Stack gap={14}>
          <Card title={"Notice from the " + f.surname + " family"} sub={kids.map(k => k.firstName + " (" + (k.programme === "EY" ? idx().room.get(k.roomId)?.name : k.schoolClass) + ")").join(", ")} right={leaving ? <Badge tone="warn">{leaving}</Badge> : undefined}>
            <div className="ros-split-even">
              <Field label="Written notice received"><input type="date" className="ros-input" value={notice} onChange={(e) => setNotice(e.target.value)} /></Field>
              <Field label="Last day attending" hint="Leave blank to stay to the end of notice"><input type="date" className="ros-input" value={lastDay} min={TODAY} onChange={(e) => setLastDay(e.target.value)} /></Field>
            </div>
            <div style={{ marginTop: 12 }}><Field label="Reason"><select className="ros-input" value={reason} onChange={(e) => setReason(e.target.value)}>{["Moving away", "Starting primary school", "Change of work hours", "Moving to a childminder", "Cost", "Other"].map(x => <option key={x} value={x}>{x}</option>)}</select></Field></div>
            <div style={{ marginTop: 14 }}>
              <KV items={[
                ["Final charge date", fmtDay(finalCharge) + " " + finalCharge.slice(0, 4)],
                ["Last day attending", fmtDay(last) + " " + last.slice(0, 4)],
                ["Charged but not attending", last < finalCharge ? daysBetween(last, finalCharge) + " days" : "None"],
                ["Outstanding now", role.finance ? euro(due) : "Restricted"],
                ["Last attended", lastAtt ? fmtDay(lastAtt) : "No record"],
                ["Last booked", lastBooked ? fmtDay(lastBooked) : "Nothing booked"],
                ...(f.funding === "NCS" ? [["NCS records", "Update within " + s.config.ncsLeaveNoticeWeeks + " weeks, by " + fmtDay(ncsBy)] as [string, string]] : []),
              ]} />
            </div>
            {last > finalCharge && <div style={{ marginTop: 10 }}><Callout tone="info">The last day is after the notice period ends, so fees simply continue until {fmtDay(last)}.</Callout></div>}
            <Row wrap style={{ marginTop: 14 }}>
              <Btn variant="primary" onClick={() => confirmThen({
                title: (leaving ? "Update" : "Record") + " notice for the " + f.surname + " family?",
                body: "Final charge date " + fmtDay(finalCharge) + ", last day " + fmtDay(last) + ". Sends the leaver confirmation (simulated), flags the family, and creates tasks for the final invoice" + (f.funding === "NCS" ? ", the NCS update" : "") + " and the waitlist offer.",
                confirmLabel: leaving ? "Update notice" : "Record notice", run: () => recordLeaver({ familyId: f.id, notice: notice || TODAY, finalCharge, lastDay: last, reason }),
              })}>{leaving ? "Update notice" : "Record notice and confirm"}</Btn>
              <DemoTag />
            </Row>
          </Card>
          <Card title="Confirmation to the family" sub={"Template " + tpl.id + " · " + tpl.channels.join(", ")}>
            <div style={{ fontSize: 13, lineHeight: 1.65, color: "var(--body)" }}>{preview}</div>
          </Card>
        </Stack>
        <Stack gap={14}>
          <Card title="Places this frees" sub="Best waitlist match at the same site, siblings first">
            {kids.map(k => {
              const service: WaitlistEntry["service"] = k.programme === "EY" ? "Early Years" : "SAC";
              const kind = k.programme === "EY" ? idx().room.get(k.roomId)?.kind || "" : "School Age";
              const cands = s.waitlist.filter(w => w.locationId === k.locationId && w.service === service && w.room === kind && w.status === "Waiting").sort(sortWait);
              const top = cands[0];
              return (
                <div key={k.id} style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
                  <Row gap={8}><span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{k.firstName}'s place · {kind} · {locById(k.locationId)?.short}</span><Sub>from {fmtDay(last)}</Sub></Row>
                  {top ? (
                    <ListRow title={<Row wrap gap={6}><span>{top.childName}</span>{top.priority !== "Standard" && <Badge tone="info">{top.priority}</Badge>}</Row>} sub={top.parent + " · wants " + top.days + " from " + fmtDate(top.requestedStart) + " · " + (cands.length - 1) + " more waiting"}
                      right={<Btn size="sm" variant="primary" onClick={() => confirmThen({ title: "Offer " + k.firstName + "'s place to " + top.childName + "?", body: "Offer from " + fmtDay(last) + " at " + locById(k.locationId)?.short + ". Sends an offer email to " + top.parent + " (simulated) and adds a 48h chase task.", confirmLabel: "Offer place", run: () => offerPlace({ id: top.id, note: "Place freed by " + childName(k) + " leaving " + fmtDate(last) }) })}>Offer</Btn>} />
                  ) : <Sub>Nobody waiting for this room type here. The place goes back on the website.</Sub>}
                </div>
              );
            })}
          </Card>
          <Card title="Families on notice" sub={leavers.length + " in scope"}>
            {leavers.length ? leavers.map(x => <ListRow key={x.id} onClick={() => setFocus({ familyId: x.id })} title={x.surname + " · " + x.id} sub={x.childIds.length + " child" + (x.childIds.length === 1 ? "" : "ren") + " · " + locById(x.locationId)?.short} right={<Badge tone="warn">{x.flags.find(fl => fl.startsWith("Leaving"))}</Badge>} />)
              : <Empty title="No one on notice" body="Recorded notices appear here with their final charge date." />}
          </Card>
        </Stack>
      </div>
    </Page>
  );
}
