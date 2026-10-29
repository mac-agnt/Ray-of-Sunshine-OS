/* Communications: one inbox across email, the parent app, SMS and the website
   form; AI drafts that a person always reviews; broadcasts with a live
   audience count; a template library; and per-family history. Every send is
   simulated and written to the family timeline and Activity. Also exports the
   family picker, templates and family timeline used by Families and Enrolment. */
import { useState, type ReactNode } from "react";
import type { Message, Family, Child, Ref, CommEvent } from "../types";
import { useRos, defineAction, openRecord, nav, setFocus, confirmThen, getState } from "../store";
import {
  family, child, idx, inScope, scopeLoc, scopedLocations, locById, searchRecords, guardian, cached, underbooked,
  invoiceStatus, invoiceBalance, childName,
} from "../selectors";
import { rel, fmtDay, fmtDate, euro, TODAY, addDays } from "../time";
import { sendDraft, escalateMessage, sendBroadcast, prepareHoursReminder, decideApproval } from "../actions";
import {
  Page, PageHead, Card, Kpi, Grid, Badge, StatusBadge, Btn, RecLink, HBars, KV, Callout, Seg, Search, ListRow, Timeline,
  DemoTag, Empty, Avatar, Row, Stack, Sub, Label, Field, Toggle, Meter,
} from "../ui";

/* ======================================================================
   Shared helpers (also used by Families and Enrolment)
   ====================================================================== */
export const STORY_FAMILIES = ["ROS1042", "ROS1087", "ROS1132", "ROS1096", "ROS1198"];

/** The family to show: the focused one if this role may see it, else a sensible default in scope. */
export function resolveFamily(focusId?: string): { id?: string; note?: string } {
  let note: string | undefined;
  if (focusId) {
    const f = family(focusId);
    if (f && inScope(f.locationId)) return { id: f.id };
    if (f) note = f.id + " is outside your location scope, so a family from your own location is shown instead.";
  }
  const id = STORY_FAMILIES.find(x => { const f = family(x); return !!f && inScope(f.locationId); })
    || getState().families.find(f => inScope(f.locationId))?.id;
  return { id, note };
}

function familiesFromHits(q: string): Family[] {
  const s = getState();
  const ids: string[] = [];
  const add = (id?: string) => { if (id && !ids.includes(id)) ids.push(id); };
  for (const h of searchRecords(q, 40)) {
    if (h.kind === "family") add(h.id);
    else if (h.kind === "child") add(child(h.id)?.familyId);
    else if (h.kind === "invoice") add(s.invoices.find(i => i.id === h.id)?.familyId);
    else if (h.kind === "request") add(s.requests.find(r => r.id === h.id)?.familyId);
    else if (h.kind === "claim") add(s.claims.find(c => c.id === h.id)?.familyId);
  }
  return ids.map(id => family(id)).filter((f): f is Family => !!f && inScope(f.locationId)).slice(0, 7);
}

/** Search-as-you-type family picker. Finds by Parent ID, surname, guardian, child, invoice or claim. */
export function FamilyPicker({ value, onPick, note, right }: { value?: string; onPick: (id: string) => void; note?: string; right?: ReactNode }) {
  const [q, setQ] = useState("");
  const f = value ? family(value) : undefined;
  const hits = q.trim().length >= 2 ? familiesFromHits(q) : [];
  const quick = STORY_FAMILIES.map(id => family(id)).filter((x): x is Family => !!x && inScope(x.locationId) && x.id !== value);
  return (
    <Card style={{ marginBottom: 16 }}>
      <Row wrap gap={14} style={{ alignItems: "flex-start" }}>
        <Row gap={12} style={{ flex: "1 1 260px" }}>
          {f ? <Avatar name={f.surname} size={38} /> : null}
          <Stack gap={3}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{f ? f.surname + " family" : "No family selected"}</span>
            {f && <Row wrap gap={6}><RecLink r={{ kind: "family", id: f.id }} /><Sub>{f.guardians.map(g => g.name).join(", ")} · {locById(f.locationId)?.short}</Sub></Row>}
          </Stack>
        </Row>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <Search value={q} onChange={setQ} placeholder="Find by Parent ID, name, child or invoice" width="100%" />
          {hits.length > 0 && (
            <div style={{ marginTop: 6, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-2)", padding: 4 }}>
              {hits.map(h => <ListRow key={h.id} onClick={() => { onPick(h.id); setQ(""); }} title={h.surname + " family · " + h.id} sub={h.guardians.map(g => g.name).join(", ") + " · " + locById(h.locationId)?.short + " · " + h.childIds.length + " child" + (h.childIds.length === 1 ? "" : "ren")} />)}
            </div>
          )}
          {q.trim().length >= 2 && !hits.length && <div style={{ marginTop: 6 }}><Sub>No family in your scope matches “{q}”.</Sub></div>}
        </div>
        {right && <Row wrap gap={6}>{right}</Row>}
      </Row>
      {quick.length > 0 && (
        <Row wrap gap={6} style={{ marginTop: 12 }}>
          <Sub>Quick open:</Sub>
          {quick.map(x => <Btn key={x.id} size="sm" variant="subtle" onClick={() => onPick(x.id)}>{x.surname} · {x.id}</Btn>)}
        </Row>
      )}
      {note && <div style={{ marginTop: 10 }}><Callout tone="warn">{note}</Callout></div>}
    </Card>
  );
}

/* ---------------- family timeline ---------------- */
export interface TItem { at: string; channel: string; dir: "in" | "out" | "note"; title: string; by: string; ref?: Ref; status?: string }
function commsByFamily() {
  return cached("comms:byFam", () => {
    const m = new Map<string, CommEvent[]>();
    for (const c of getState().comms) { if (!m.has(c.familyId)) m.set(c.familyId, []); m.get(c.familyId)!.push(c); }
    return m;
  });
}
export function familyTimeline(fid: string): TItem[] {
  const s = getState();
  const msgs = s.messages.filter(m => m.familyId === fid && (m.direction === "in" || m.status === "Drafted"));
  const inAt = new Set(msgs.filter(m => m.direction === "in").map(m => m.received));
  const out: TItem[] = [];
  for (const c of commsByFamily().get(fid) || []) {
    if (c.direction === "in" && inAt.has(c.at)) continue; // the message itself is listed below
    out.push({ at: c.at, channel: c.channel, dir: c.direction, title: c.summary, by: c.by });
  }
  for (const m of msgs) out.push({ at: m.received, channel: m.channel, dir: m.direction === "in" ? "in" : "out", title: m.direction === "in" ? "“" + m.subject + "”" : "Draft awaiting review: " + m.subject, by: m.direction === "in" ? m.from : "AI draft", ref: { kind: "message", id: m.id }, status: m.status });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
export const dirTone = (d: TItem["dir"]) => (d === "in" ? "info" : d === "note" ? "neutral" : "accent") as "info" | "neutral" | "accent";

/* ---------------- merge fields ---------------- */
export function fillVars(text: string, fid?: string): string {
  const s = getState();
  const f = fid ? family(fid) : undefined;
  const g = guardian(f);
  const kids = (f?.childIds || []).map(child).filter((c): c is Child => !!c);
  const inv = f ? (idx().invoicesByFamily.get(f.id) || []).slice().sort((a, b) => b.due.localeCompare(a.due)).find(i => invoiceBalance(i) > 0) : undefined;
  const sub = f ? s.windows.find(w => w.status === "Open")?.submissions.find(x => x.familyId === f.id) : undefined;
  const agreed = kids.reduce((n, k) => n + (idx().awardByChild.get(k.id)?.agreedHours || 0), 0);
  const claim = f ? s.claims.find(c => c.familyId === f.id && c.status === "Awaiting acceptance") : undefined;
  const map: Record<string, string> = {
    first: g ? g.name.split(" ")[0] : "{first}",
    child: kids.length ? kids.map(k => k.firstName).join(" and ") : "{child}",
    location: f ? locById(f.locationId)?.short || "" : "{location}",
    parentId: f ? f.id : "{parentId}",
    invoice: inv ? inv.id : "{invoice}",
    amount: inv ? euro(invoiceBalance(inv)) : "{amount}",
    due: inv ? fmtDay(inv.due) : "{due}",
    blockDate: inv ? fmtDay(addDays(inv.due, s.config.blockDay)) : "{blockDate}",
    week: "2 November",
    booked: sub ? String(sub.hours) : "{booked}",
    agreed: agreed ? String(agreed) : "{agreed}",
    claim: claim ? claim.id : "{claim}",
    deadline: claim ? claim.deadline.slice(11) + " " + fmtDay(claim.deadline.slice(0, 10)) : "{deadline}",
    lateFee: String(s.config.lateFee),
    date: fmtDay(addDays(TODAY, 3)),
    notice: fmtDay(TODAY),
    finalDate: fmtDay(addMonths(TODAY, s.config.leavingNoticeMonths)),
  };
  return text.replace(/\{(\w+)\}/g, (m0, k: string) => (k in map ? map[k] : m0));
}
export function addMonths(d: string, n: number): string {
  const y = +d.slice(0, 4), m = +d.slice(5, 7) - 1 + n, day = +d.slice(8, 10);
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return yy + "-" + String(mm + 1).padStart(2, "0") + "-" + String(Math.min(day, last)).padStart(2, "0");
}

/* ---------------- template library ---------------- */
export interface Tpl { id: string; name: string; group: "Bookings" | "NCS" | "Collections" | "Operations" | "Camps" | "Enrolment"; channels: string[]; trigger: string; subject: string; body: string; owner: string; auto?: string }
export const TEMPLATES: Tpl[] = [
  { id: "TPL-01", auto: "AU-01", name: "Booking window opening", group: "Bookings", channels: ["Push", "Email"], trigger: "Monday 09:00 when the weekly window opens", owner: "Bookings agent",
    subject: "Booking window open for w/c {week}", body: "Hi {first}, the booking window for the week of {week} is open now in MyRosKids. It closes Thursday at 6pm. Book {child}'s sessions before then so we can plan staff and the school runs. Ray of Sunshine" },
  { id: "TPL-02", auto: "AU-02", name: "Booking window closing", group: "Bookings", channels: ["Push", "SMS"], trigger: "24h and 2h before the window closes, families not yet submitted", owner: "Bookings agent",
    subject: "Booking window closes Thursday at 6pm", body: "Hi {first}, a quick reminder that the booking window for w/c {week} closes Thursday at 6pm. After that, late bookings carry a €{lateFee} fee and depend on space and staffing. Ray of Sunshine" },
  { id: "TPL-03", auto: "AU-04", name: "NCS hours under-booked", group: "NCS", channels: ["Push", "Email"], trigger: "Submitted hours below agreed NCS hours", owner: "NCS agent",
    subject: "Your NCS hours for w/c {week}", body: "Hi {first}, you've booked {booked} of your {agreed} agreed NCS hours for the week of {week}. Booking your full agreed hours keeps your subsidy in line with your award. Reply here if you'd like a hand. NCS team" },
  { id: "TPL-04", auto: "AU-11", name: "NCS claim acceptance", group: "NCS", channels: ["Push", "SMS"], trigger: "Claim awaiting acceptance, Days 2, 4 and 6", owner: "NCS agent",
    subject: "Please accept your NCS claim", body: "Hi {first}, claim {claim} for {child} is waiting for your acceptance on the NCS parent portal. Please accept it before {deadline}. If it lapses, those hours may be charged privately. NCS team" },
  { id: "TPL-05", auto: "AU-05", name: "Invoice reminder · Day 2", group: "Collections", channels: ["Email", "Push"], trigger: "Invoice unpaid 2 days after due", owner: "Collections agent",
    subject: "Friendly reminder: invoice {invoice}", body: "Hi {first}, invoice {invoice} ({amount}) was due on {due}. If you've paid already, thanks and please ignore this. You can pay in MyRosKids in a few taps. Accounts team" },
  { id: "TPL-06", auto: "AU-05", name: "Invoice reminder · Day 5", group: "Collections", channels: ["Email", "Push"], trigger: "Invoice unpaid 5 days after due", owner: "Collections agent",
    subject: "Second reminder: invoice {invoice}", body: "Hi {first}, invoice {invoice} for {amount} is still open. Please pay by Friday, or get in touch if you'd like to talk about it. Accounts team" },
  { id: "TPL-07", auto: "AU-05", name: "Invoice reminder · Day 7", group: "Collections", channels: ["Email", "SMS"], trigger: "Invoice unpaid 7 days after due (final warning)", owner: "Collections agent",
    subject: "Final reminder: invoice {invoice}", body: "Hi {first}, invoice {invoice} for {amount} is now 7 days overdue. If it isn't paid or arranged by {blockDate}, new bookings may be paused under our fee terms. Call the Accounts line if a payment plan would help. Accounts team" },
  { id: "TPL-08", name: "Late booking confirmation", group: "Bookings", channels: ["Email", "Push"], trigger: "Late booking approved by staff", owner: "Bookings agent",
    subject: "Late booking confirmed for {child}", body: "Hi {first}, {child} is booked for {date}. As it was after the window closed, a €{lateFee} late booking fee applies and has been added to your invoice. Thanks, {location} team" },
  { id: "TPL-09", auto: "AU-17", name: "Incident follow-up", group: "Operations", channels: ["Push"], trigger: "Incident logged and reviewed by a manager", owner: "Compliance agent",
    subject: "Incident report for {child}", body: "Hi {first}, as mentioned at collection, {child} had a minor accident today. The incident report is in MyRosKids for your signature. Any questions, talk to the room leader or to me. {location} manager" },
  { id: "TPL-10", auto: "AU-13", name: "Camp places available", group: "Camps", channels: ["Push", "Email"], trigger: "Camp under 80% full seven days before start", owner: "Camps agent",
    subject: "Halloween camp places left", body: "Hi {first}, we still have places at the Halloween camp, 26 to 30 October. Book by the day in MyRosKids. NCS hours can be used where your award allows. Ray of Sunshine Camps" },
  { id: "TPL-11", auto: "AU-15", name: "Leaver confirmation", group: "Enrolment", channels: ["Email"], trigger: "Written notice received", owner: "Accounts",
    subject: "We've received your notice", body: "Hi {first}, thanks for letting us know. We received your written notice on {notice}. Under our terms fees continue for two months, so the final charge date is {finalDate}. We'll send a final statement before then. We'll miss {child}. Ray of Sunshine" },
];

/* ---------------- actions owned by Communications ---------------- */
export const sendFamilyMessage = defineAction<{ familyId: string; channel: string; subject: string; body: string; note?: boolean }>("comms.familyMessage", (s, p, ctx) => {
  const f = s.families.find(x => x.id === p.familyId); if (!f) return;
  if (p.note) {
    ctx.comm(f.id, p.channel, "note", p.subject + (p.body ? ": " + p.body : ""));
    ctx.log({ category: "Communications", title: "Note logged: " + f.surname + " (" + f.id + ")", detail: p.channel + " · " + p.subject, link: { kind: "family", id: f.id }, locationId: f.locationId });
    return;
  }
  ctx.comm(f.id, p.channel, "out", p.subject + " (simulated, not sent)");
  ctx.log({ category: "Communications", title: "Message to " + f.surname + " family: " + p.subject, detail: "By " + p.channel + " to " + (f.guardians[0]?.name || f.surname) + ". Simulated: nothing left the demo.", link: { kind: "family", id: f.id }, locationId: f.locationId });
}, { toast: (p) => p.note ? "Note added to the family timeline." : "Message logged to the family timeline (simulated send)." });

export const matchMessage = defineAction<{ messageId: string; familyId: string }>("comms.match", (s, p, ctx) => {
  const m = s.messages.find(x => x.id === p.messageId), f = s.families.find(x => x.id === p.familyId);
  if (!m || !f) return;
  m.familyId = f.id;
  ctx.comm(f.id, m.channel, "in", "“" + m.subject + "” (matched to this family by " + ctx.actor + ")", m.from);
  ctx.log({ category: "Communications", title: "Message matched: " + m.id + " → " + f.id, detail: "Matched by a person after a low-confidence AI classification.", link: { kind: "family", id: f.id }, locationId: f.locationId });
  ctx.agent("inbox", m.id + " matched to " + f.surname + " (" + f.id + ") by " + ctx.actor, "action", { kind: "message", id: m.id });
}, { toast: () => "Matched. The message now sits on the family timeline." });

export const closeMessage = defineAction<{ messageId: string }>("comms.close", (s, p, ctx) => {
  const m = s.messages.find(x => x.id === p.messageId); if (!m) return;
  m.status = "Closed";
  ctx.log({ category: "Communications", title: "Closed without reply: " + m.subject, detail: "Closed by " + ctx.actor + ". No message sent.", link: { kind: "message", id: m.id } });
}, { toast: () => "Closed. No reply sent.", undo: true });

export const discardDraft = defineAction<{ messageId: string }>("comms.discardDraft", (s, p, ctx) => {
  const m = s.messages.find(x => x.id === p.messageId); if (!m) return;
  if (m.direction === "out") {
    m.status = "Closed";
    s.tasks.forEach(t => { if (m.familyId && t.link?.kind === "family" && t.link.id === m.familyId && t.title.startsWith("Send NCS hours") && t.status !== "Done") t.status = "Done"; });
  } else m.draft = undefined;
  ctx.log({ category: "Communications", title: "AI draft discarded: " + m.subject, detail: m.direction === "out" ? "Outbound draft withdrawn by " + ctx.actor + "." : "Inbound message stays open for a hand-written reply.", link: { kind: "message", id: m.id } });
}, { toast: () => "Draft discarded." });

/* ---------------- scope and labels ---------------- */
const QUEUES: Message["queue"][] = ["General", "Accounts", "NCS", "Wicklow", "Arklow", "Wexford", "Cork", "Waterford", "Dublin", "Parent app", "Website form"];
function msgInScope(m: Message): boolean {
  if (m.familyId) return inScope(family(m.familyId)?.locationId);
  const sc = scopeLoc();
  if (sc === "ALL") return true;
  return locById(sc)?.region === m.queue;
}
/** A reply that confirms a booking request is sent by approving the request, never on its own. */
const pendingReq = (m: Message) => { const l = m.link; return l?.kind === "request" ? getState().requests.find(r => r.id === l.id && r.status === "Pending") : undefined; };
const isOpen = (m: Message) => m.status === "New" || m.status === "Drafted" || m.status === "Escalated";
const confTone = (c: number) => (c >= 0.9 ? "ok" : c >= 0.75 ? "info" : "warn") as "ok" | "info" | "warn";

/** A reply a person can start from when the AI did not draft one. */
function suggestDraft(m: Message): string {
  const c = m.classification.toLowerCase();
  const t =
    /collector/.test(c) ? "Hi {first}, thanks for letting us know. Please add the new collector in MyRosKids under Collectors before collection day, and ask them to bring photo ID. We can't release a child to anyone who isn't on the list. {location} team"
    : /camp/.test(c) ? "Hi {first}, thanks for asking. There are still places at the Halloween camp, 26 to 30 October, and you can book by the day in MyRosKids. NCS hours can be used where your award allows. Ray of Sunshine Camps"
    : /dispute/.test(c) ? "Hi {first}, thanks for flagging this. I've asked the {location} team to check the kiosk log for that day and I'll come back to you by tomorrow. If the charge is wrong we'll credit it on your next invoice. Accounts team"
    : /absence/.test(c) ? "Hi {first}, thanks for letting us know, and we hope {child} feels better soon. Today is marked as absent on the register. {location} team"
    : /training/.test(c) ? "Hello, thanks for your enquiry. We have places on the half-day Manual Handling course on 4 and 18 November at Hazelbrook. I can hold three places for 48 hours while you confirm names. Kevin, Training"
    : /recruit/.test(c) ? "Hello, thanks for your interest in the relief panel. Please send your CV and a copy of your Level 6 certificate to HR, and we'll be in touch about Garda vetting and an informal chat. Orla, HR and Admin"
    : /chick/.test(c) ? "Hi {first}, thanks for that. Once the new CHICK comes through, add it in MyRosKids or reply with it here and we'll update {child}'s award before the current one expires. NCS team"
    : /medical/.test(c) ? "Hi {first}, thanks, we've received the form. The room leader will check it against the medication in the medicine box and confirm with you. {location} team"
    : /window/.test(c) ? "Hi {first}, the window for w/c 2 November is open until Thursday 22 October at 6pm, so you're in time. Book in MyRosKids under Book. {location} team"
    : /failed payment/.test(c) ? "Hi {first}, no problem. You can pay by card in MyRosKids under Payments, or call the Accounts line and we'll take it over the phone. Accounts team"
    : /consent/.test(c) ? "Hi {first}, thanks. We'll update photo consent for {child} today and confirm once it's done. The room team will see the change straight away. {location} team"
    : /restriction|blocked/.test(c) ? "Hi {first}, new bookings for {child} are paused because the payment plan on the account has fallen behind. Gráinne in Accounts will call you today to talk through the options. Accounts team"
    : "Hi {first}, thanks for your message. We're looking into it and will come back to you today. {location} team";
  return fillVars(t, m.familyId);
}

/* ======================================================================
   Module
   ====================================================================== */
export default function Comms({ tab }: { tab: string }) {
  useRos();
  switch (tab) {
    case "AI Drafts": return <Drafts />;
    case "Broadcasts": return <Broadcasts />;
    case "Templates": return <Templates />;
    case "Family History": return <History />;
    default: return <Inbox />;
  }
}

/* ---------------- Unified Inbox ---------------- */
function Inbox() {
  const { s, ui } = useRos();
  const [queue, setQueue] = useState<string>("All");
  const [status, setStatus] = useState<"Open" | "Done" | "All">("Open");
  const [q, setQ] = useState("");
  const all = s.messages.filter(m => m.direction === "in" && msgInScope(m));
  const openAll = all.filter(isOpen);
  const counts = new Map<string, number>();
  for (const m of openAll) counts.set(m.queue, (counts.get(m.queue) || 0) + 1);
  const t = q.trim().toLowerCase();
  const list = all.filter(m => (queue === "All" || m.queue === queue) && (status === "All" || (status === "Open" ? isOpen(m) : !isOpen(m)))
    && (!t || (m.subject + " " + m.from + " " + m.body + " " + (m.familyId || "") + " " + m.classification).toLowerCase().includes(t)))
    .sort((a, b) => b.received.localeCompare(a.received));
  const focusM = ui.focus.messageId ? all.find(m => m.id === ui.focus.messageId) : undefined;
  const sel = focusM || list[0];
  const unmatched = openAll.filter(m => !m.familyId).length, low = openAll.filter(m => m.confidence < 0.75).length;
  const avg = all.length ? all.reduce((n, m) => n + m.confidence, 0) / all.length : 0;
  return (
    <Page>
      <PageHead eyebrow="Communications · Unified inbox" title="Every parent message in one place"
        sub="Email, MyRosKids, SMS and the website form land here. The Inbox agent classifies each one, matches the ROS Parent ID and drafts a reply. A person reviews before anything is sent."
        right={<DemoTag>Sends are simulated</DemoTag>} />
      <Grid min={150} style={{ marginBottom: 16 }}>
        <Kpi label="Open messages" value={openAll.length} sub={all.length + " received in scope"} />
        <Kpi label="No Parent ID" value={unmatched} tone={unmatched ? "warn" : "ok"} sub="Need a person to match" />
        <Kpi label="Low confidence" value={low} tone={low ? "warn" : "ok"} sub="Below 75%, routed to a person" />
        <Kpi label="Escalated" value={openAll.filter(m => m.status === "Escalated").length} sub="With a named owner" />
        <Kpi label="Average AI confidence" value={Math.round(avg * 100) + "%"} sub="Classification" />
      </Grid>
      <div style={{ marginBottom: 12 }}>
        <Seg size="sm" value={queue} onChange={setQueue}
          options={[["All", "All · " + openAll.length] as [string, ReactNode], ...QUEUES.map(qq => [qq, qq + " · " + (counts.get(qq) || 0)] as [string, ReactNode])]} />
      </div>
      <div className="ros-split">
        <Card title={list.length + " message" + (list.length === 1 ? "" : "s")} pad={false}
          right={<Seg size="sm" value={status} onChange={setStatus} options={["Open", "Done", "All"]} />}>
          <div style={{ padding: "0 14px 10px" }}><Search value={q} onChange={setQ} placeholder="Search subject, sender, Parent ID" width="100%" /></div>
          <div style={{ padding: "0 4px 8px", maxHeight: 720, overflowY: "auto" }}>
            {list.map(m => (
              <ListRow key={m.id} onClick={() => setFocus({ messageId: m.id })} tone={sel?.id === m.id ? "accent" : m.status === "Escalated" ? "bad" : undefined}
                lead={<Avatar name={m.from} size={30} />}
                title={<Row gap={6} wrap><b style={{ fontWeight: 600 }}>{m.from}</b><Sub>{rel(m.received)}</Sub></Row>}
                sub={<span>{m.subject}<br /><span style={{ color: "var(--faint)" }}>{m.queue} · {m.classification} · {m.familyId || "no Parent ID"}</span></span>}
                right={<Stack gap={4}><StatusBadge s={m.status} /><Badge tone={confTone(m.confidence)}>{Math.round(m.confidence * 100)}%</Badge></Stack>} />
            ))}
            {!list.length && <Empty title="Nothing in this view" body={status === "Open" ? "Every message in this queue has been handled." : "Try another queue or status."} />}
          </div>
        </Card>
        {sel ? <InboxDetail key={sel.id} m={sel} /> : <Card><Empty title="Pick a message" /></Card>}
      </div>
    </Page>
  );
}

function InboxDetail({ m }: { m: Message }) {
  const { s, role } = useRos();
  const [text, setText] = useState<string>(m.draft ?? "");
  const [started, setStarted] = useState<boolean>(m.draft !== undefined);
  const f = m.familyId ? family(m.familyId) : undefined;
  const kids = (f?.childIds || []).map(child).filter((c): c is Child => !!c);
  const reqs = f ? s.requests.filter(r => r.familyId === f.id && r.status === "Pending") : [];
  const claims = f ? s.claims.filter(c => c.familyId === f.id && c.status === "Awaiting acceptance") : [];
  const plan = f ? s.plans.find(p => p.familyId === f.id) : undefined;
  const inv = f ? (idx().invoicesByFamily.get(f.id) || []).slice().sort((a, b) => b.weekOf.localeCompare(a.weekOf))[0] : undefined;
  const done = m.status === "Replied" || m.status === "Closed";
  const name = /Name:\s*([^.]+)\./.exec(m.body)?.[1]?.trim();
  const cands = !f && name ? familiesFromHits(name.split(" ").slice(-1)[0]).slice(0, 4) : [];
  const [mq, setMq] = useState("");
  const manual = mq.trim().length >= 2 ? familiesFromHits(mq).slice(0, 4) : [];
  return (
    <Stack gap={14}>
      <Card title={m.subject} sub={"From " + m.from + " · " + rel(m.received) + " · " + m.channel}
        right={<><StatusBadge s={m.status} /><Badge tone="info">{m.queue}</Badge></>}>
        <div style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--body)", padding: "12px 14px", borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)" }}>{m.body || <Sub>No body text.</Sub>}</div>
        <div style={{ marginTop: 12 }}>
          <KV cols={3} items={[["AI classification", m.classification], ["Confidence", Math.round(m.confidence * 100) + "%"], ["Matched family", f ? f.surname + " · " + f.id : "No Parent ID"]]} />
        </div>
        <div style={{ marginTop: 10 }}><Meter label="Classification confidence" value={Math.round(m.confidence * 100)} max={100} tone={confTone(m.confidence)} hint={m.confidence < 0.75 ? "below 75% threshold" : undefined} /></div>
        {m.confidence < 0.75 && <div style={{ marginTop: 10 }}><Callout tone="warn" title="Low confidence: a person decides">The Inbox agent will not act on this message by itself. Read it, match it if you can, then reply.</Callout></div>}
      </Card>

      {m.link?.kind === "request" && (
        <Callout tone="brand" title={"This email is booking request " + m.link.id}
          right={<Btn variant="primary" size="sm" onClick={() => openRecord(m.link!)}>Open {m.link.id}</Btn>}>
          Review the policy, capacity and ratio checks and approve it there. Approving writes the booking, the invoice change, the register and the bus manifest together, and marks this message as replied.
        </Callout>
      )}

      {!f && (
        <Card title="Match to a family" sub="The sender gave no ROS Parent ID. Matching is a human decision; the draft below asks them for it.">
          {name && <div style={{ marginBottom: 8 }}><Sub>Name given in the form: <b style={{ color: "var(--ink)" }}>{name}</b></Sub></div>}
          {cands.length > 0 && <Label style={{ marginBottom: 6 }}>Possible matches by surname</Label>}
          {cands.map(c => <ListRow key={c.id} title={c.surname + " family · " + c.id} sub={c.guardians.map(g => g.name).join(", ") + " · " + locById(c.locationId)?.short} right={<Btn size="sm" onClick={() => confirmThen({ title: "Match " + m.id + " to " + c.id + "?", body: "Adds the message to the " + c.surname + " family timeline. Only do this if you are sure it is the same person.", confirmLabel: "Match", run: () => matchMessage({ messageId: m.id, familyId: c.id }) })}>Match</Btn>} />)}
          {name && !cands.length && <Sub>No family in your scope has that surname.</Sub>}
          <div style={{ marginTop: 10 }}><Search value={mq} onChange={setMq} placeholder="Search another family" width="100%" /></div>
          {manual.map(c => <ListRow key={c.id} title={c.surname + " family · " + c.id} sub={c.guardians.map(g => g.name).join(", ")} right={<Btn size="sm" onClick={() => confirmThen({ title: "Match " + m.id + " to " + c.id + "?", body: "Adds the message to the " + c.surname + " family timeline.", confirmLabel: "Match", run: () => matchMessage({ messageId: m.id, familyId: c.id }) })}>Match</Btn>} />)}
        </Card>
      )}

      {f && (
        <Card title="Related records" sub="Pulled from the matched Parent ID">
          <Row wrap gap={8}>
            <RecLink r={{ kind: "family", id: f.id }}>{f.id} · {f.surname} family</RecLink>
            {kids.map(k => <RecLink key={k.id} r={{ kind: "child", id: k.id }}>{childName(k)}</RecLink>)}
            {m.link && m.link.kind !== "request" && <RecLink r={m.link} />}
            {reqs.map(r => <RecLink key={r.id} r={{ kind: "request", id: r.id }}>{r.id} · {r.kind}</RecLink>)}
            {claims.map(c => <RecLink key={c.id} r={{ kind: "claim", id: c.id }}>{c.id} · claim</RecLink>)}
            {role.finance && plan && <RecLink r={{ kind: "plan", id: plan.id }} />}
            {role.finance && inv && <RecLink r={{ kind: "invoice", id: inv.id }}>{inv.id} · {invoiceStatus(inv)}</RecLink>}
          </Row>
          <Row wrap style={{ marginTop: 12 }}>
            <Btn size="sm" onClick={() => nav("Families", "Family Profile", { familyId: f.id })}>Open family profile</Btn>
            <Btn size="sm" variant="subtle" onClick={() => nav("Comms", "Family History", { familyId: f.id })}>Full history</Btn>
          </Row>
        </Card>
      )}

      <Card title="Reply · human review required" sub={done ? "This message is " + m.status.toLowerCase() + "." : m.draft !== undefined ? "Drafted by the Inbox agent (" + (m.tone || "plain") + " tone). Edit freely before sending." : "No AI draft for this message."}
        right={<DemoTag />}>
        {started ? (
          <textarea className="ros-input" rows={7} value={text} onChange={(e) => setText(e.target.value)} disabled={done} aria-label="Draft reply" />
        ) : (
          <Btn onClick={() => { setText(suggestDraft(m)); setStarted(true); }} disabled={done}>Start a reply from the house template</Btn>
        )}
        {!done && (
          <Row wrap style={{ marginTop: 12 }}>
            {pendingReq(m)
              ? <Btn variant="primary" onClick={() => openRecord(m.link!)}>Approve {m.link!.id} to send</Btn>
              : <Btn variant="primary" disabled={!started || !text.trim()} onClick={() => sendDraft({ messageId: m.id, text })}>Approve and send (simulated)</Btn>}
            {m.status !== "Escalated" && <Btn onClick={() => escalateMessage({ messageId: m.id })}>Escalate to a person</Btn>}
            <Btn variant="subtle" onClick={() => confirmThen({ title: "Close without replying?", body: "Marks " + m.id + " as closed. Nothing is sent to " + m.from + ".", confirmLabel: "Close message", run: () => closeMessage({ messageId: m.id }) })}>Close without reply</Btn>
          </Row>
        )}
        {!done && pendingReq(m) && <div style={{ marginTop: 10 }}><Sub>This reply confirms {m.link!.id}. It goes out when the request is approved, so the booking, invoice and reply never disagree.</Sub></div>}
        {done && <div style={{ marginTop: 10 }}><Callout tone="ok" title={m.status}>{f ? "Logged on the " + f.surname + " family timeline." : "Recorded in Activity."}</Callout></div>}
      </Card>
    </Stack>
  );
}

/* ---------------- AI Drafts ---------------- */
function Drafts() {
  const { s, role } = useRos();
  const drafts = s.messages.filter(m => m.draft !== undefined && (m.status === "New" || m.status === "Drafted") && msgInScope(m))
    .sort((a, b) => b.confidence - a.confidence || b.received.localeCompare(a.received));
  const ub = underbooked();
  const hasDraft = (fid: string) => s.messages.some(m => m.familyId === fid && m.classification === "NCS hours reminder" && m.status === "Drafted");
  const todo = ub.filter(u => !hasDraft(u.family.id));
  const high = drafts.filter(m => m.confidence >= 0.9 && !pendingReq(m));
  const canNcs = role.finance;
  return (
    <Page>
      <PageHead eyebrow="Communications · AI drafts" title="Drafts waiting for a person"
        sub="Replies drafted by the Inbox agent and outbound reminders prepared by the NCS and Collections agents. Nothing leaves until someone approves it."
        right={<>
          <DemoTag>Sends are simulated</DemoTag>
          {high.length > 0 && <Btn variant="primary" onClick={() => confirmThen({ title: "Send " + high.length + " high-confidence drafts?", body: "Sends every draft at 90% confidence or above as written: " + high.map(m => m.subject).join("; ") + ". Each is logged to its family timeline (simulated).", confirmLabel: "Send " + high.length, run: () => high.forEach(m => sendDraft({ messageId: m.id })) })}>Send all at 90%+ ({high.length})</Btn>}
        </>} />
      <Grid min={160} style={{ marginBottom: 16 }}>
        <Kpi label="Drafts awaiting review" value={drafts.length} />
        <Kpi label="Replies to parents" value={drafts.filter(m => m.direction === "in").length} sub="Inbound with AI draft" />
        <Kpi label="Outbound reminders" value={drafts.filter(m => m.direction === "out").length} sub="NCS hours and similar" />
        <Kpi label="Under-booked NCS families" value={ub.length} tone={todo.length ? "warn" : "ok"} sub={todo.length + " without a reminder yet"} />
      </Grid>
      <div className="ros-split">
        <Stack gap={12}>
          {drafts.map(m => <DraftCard key={m.id} m={m} />)}
          {!drafts.length && <Card><Empty title="No drafts waiting" body="New drafts appear here as messages arrive or agents prepare reminders." /></Card>}
        </Stack>
        <Card title="NCS hours: under-booked for w/c 2 Nov" sub="Families whose submitted hours are below their agreed NCS hours. The NCS agent prepares a reminder; a person sends it.">
          {ub.map(u => (
            <ListRow key={u.family.id} onClick={() => openRecord({ kind: "family", id: u.family.id })}
              title={u.family.surname + " · " + u.family.id} sub={u.booked + " of " + u.agreed + "h booked · " + locById(u.family.locationId)?.short}
              right={hasDraft(u.family.id) ? <Badge tone="warn">Draft ready</Badge> : canNcs ? <Btn size="sm" onClick={() => prepareHoursReminder({ familyId: u.family.id, booked: u.booked, agreed: u.agreed })}>Prepare</Btn> : <Badge>NCS team</Badge>} />
          ))}
          {!ub.length && <Empty title="Nobody under-booked" />}
          {canNcs && todo.length > 1 && <Row style={{ marginTop: 10 }}><Btn onClick={() => todo.forEach(u => prepareHoursReminder({ familyId: u.family.id, booked: u.booked, agreed: u.agreed }))}>Prepare all {todo.length}</Btn></Row>}
          {!canNcs && <div style={{ marginTop: 8 }}><Sub>Preparing NCS reminders needs the NCS, Accounts, Operations or Owner role.</Sub></div>}
        </Card>
      </div>
    </Page>
  );
}

function DraftCard({ m }: { m: Message }) {
  const [text, setText] = useState(m.draft || "");
  const f = m.familyId ? family(m.familyId) : undefined;
  return (
    <Card title={(m.direction === "in" ? "Reply: " : "") + m.subject}
      sub={(m.direction === "in" ? "To " + m.from : "To " + (f ? (guardian(f)?.name || f.surname) : m.from)) + " · " + m.channel + " · " + m.classification + " · " + rel(m.received)}
      right={<><Badge tone={confTone(m.confidence)}>{Math.round(m.confidence * 100)}%</Badge>{f ? <RecLink r={{ kind: "family", id: f.id }} /> : <Badge tone="warn">No Parent ID</Badge>}</>}>
      {m.direction === "in" && m.body && <div style={{ fontSize: 12.5, color: "var(--dim)", fontStyle: "italic", marginBottom: 10, lineHeight: 1.55 }}>“{m.body}”</div>}
      <textarea className="ros-input" rows={5} value={text} onChange={(e) => setText(e.target.value)} aria-label="Draft text" />
      <Row wrap style={{ marginTop: 10 }}>
        {pendingReq(m)
          ? <Btn variant="primary" onClick={() => openRecord(m.link!)}>Approve {m.link!.id} to send</Btn>
          : <Btn variant="primary" disabled={!text.trim()} onClick={() => sendDraft({ messageId: m.id, text })}>{text !== (m.draft || "") ? "Send edited (simulated)" : "Send (simulated)"}</Btn>}
        <Btn onClick={() => openRecord({ kind: "message", id: m.id })}>Open message</Btn>
        {m.link?.kind === "request" && !pendingReq(m) && <Btn onClick={() => openRecord(m.link!)}>Open {m.link.id}</Btn>}
        <Btn variant="subtle" onClick={() => confirmThen({ title: "Discard this draft?", body: m.direction === "out" ? "The reminder will not be sent and its task is closed." : "The message stays open in the inbox for a hand-written reply.", confirmLabel: "Discard", danger: true, run: () => discardDraft({ messageId: m.id }) })}>Discard</Btn>
      </Row>
    </Card>
  );
}

/* ---------------- Broadcasts ---------------- */
type AudType = "Location" | "School" | "Route" | "Room" | "Service";
type Chan = "Push" | "SMS" | "Email" | "WhatsApp";
const CHANS: Chan[] = ["Push", "SMS", "Email", "WhatsApp"];
function audienceOptions(t: AudType): [string, string][] {
  const s = getState();
  switch (t) {
    case "Location": return scopedLocations().map(l => [l.id, l.short]);
    case "School": return s.schools.filter(x => inScope(x.locationId)).map(x => [x.id, x.name]);
    case "Route": return s.routes.filter(r => inScope(r.locationId)).map(r => [r.id, r.id + " · " + r.name]);
    case "Room": return s.rooms.filter(r => inScope(r.locationId)).map(r => [r.id, r.name + " · " + (locById(r.locationId)?.short || "")]);
    default: return [["EY", "Early Years rooms"], ["SAC", "School age (after school)"], ["TRANSPORT", "School run users"], ["CAMPS", "Halloween camp families"], ["NCS", "NCS-funded families"]];
  }
}
function audience(t: AudType, v: string, funding: "All" | "NCS" | "Private"): Family[] {
  const s = getState(), ids = new Set<string>();
  for (const c of s.children) {
    if (!inScope(c.locationId)) continue;
    const hit = t === "Location" ? c.locationId === v : t === "School" ? c.schoolId === v : t === "Route" ? c.routeId === v : t === "Room" ? c.roomId === v
      : v === "EY" ? c.programme === "EY" : v === "SAC" ? c.programme === "SAC" : v === "TRANSPORT" ? !!c.routeId : v === "NCS" ? family(c.familyId)?.funding === "NCS" : false;
    if (hit) ids.add(c.familyId);
  }
  if (t === "Service" && v === "CAMPS") for (const r of s.campRegs) if (r.status !== "Waitlist" && inScope(family(r.familyId)?.locationId)) ids.add(r.familyId);
  return [...ids].map(id => family(id)).filter((f): f is Family => !!f && (funding === "All" || f.funding === funding));
}

function Broadcasts() {
  const { s, ui } = useRos();
  const tplId = ui.focus.templateId || "";
  const recent = s.messages.filter(m => m.classification === "Broadcast").sort((a, b) => b.received.localeCompare(a.received));
  return (
    <Page>
      <PageHead eyebrow="Communications · Broadcasts" title="Message a group of families"
        sub="Pick the audience from live records: a location, a school, a bus route, a room or a service. The count updates as you choose. Closures and emergencies need owner approval first."
        right={<DemoTag>Nothing is sent</DemoTag>} />
      <Composer key={tplId} tplId={tplId} />
      <div style={{ marginTop: 16 }}>
        <Card title="Broadcast log" sub="Audit trail of every broadcast queued in this demo">
          {recent.length ? <Timeline items={recent.map(m => ({ at: rel(m.received), title: m.subject, detail: m.body, tone: "accent" as const }))} /> : <Empty title="No broadcasts yet" body="Send one from the composer above. It is written here and to Activity." />}
        </Card>
      </div>
    </Page>
  );
}

function Composer({ tplId }: { tplId: string }) {
  const { s, role } = useRos();
  const tpl = TEMPLATES.find(t => t.id === tplId);
  const locs = scopedLocations();
  const [type, setType] = useState<AudType>("Location");
  const [value, setValue] = useState<string>(locs[0]?.id || "");
  const [funding, setFunding] = useState<"All" | "NCS" | "Private">("All");
  const [ch, setCh] = useState<Record<Chan, boolean>>(() => ({ Push: tpl ? tpl.channels.includes("Push") : true, SMS: tpl ? tpl.channels.includes("SMS") : false, Email: tpl ? tpl.channels.includes("Email") : true, WhatsApp: false }));
  const [subject, setSubject] = useState(tpl?.subject || "");
  const [body, setBody] = useState(tpl?.body || "");
  const [closure, setClosure] = useState(false);
  const opts = audienceOptions(type);
  const val = opts.some(o => o[0] === value) ? value : opts[0]?.[0] || "";
  const fams = audience(type, val, funding);
  const kids = fams.reduce((n, f) => n + f.childIds.length, 0);
  const reach: Record<Chan, number> = {
    Push: fams.filter(f => f.channel === "App").length,
    SMS: fams.filter(f => f.guardians.some(g => g.phone)).length,
    Email: fams.filter(f => f.guardians.some(g => g.email)).length,
    WhatsApp: fams.filter(f => f.channel !== "Email" && f.guardians.some(g => g.phone)).length,
  };
  const chosen = CHANS.filter(c => ch[c]);
  const closureApr = s.approvals.find(a => a.kind === "Closure broadcast");
  const apr = type === "Location" && val === "CAN" ? closureApr : undefined; // APR-208 covers the Canovee closure only
  const blocked = closure && apr?.status !== "Approved";
  const label = type + ": " + (opts.find(o => o[0] === val)?.[1] || val) + (funding !== "All" ? " · " + funding + " only" : "");
  const sample = fams[0];
  const canSend = !!subject.trim() && !!body.trim() && chosen.length > 0 && fams.length > 0 && !blocked;
  const preset = (k: "weather" | "window" | "camp") => {
    if (k === "weather") {
      const can = locs.find(l => l.id === "CAN");
      if (!can) return;
      setType("Location"); setValue(can?.id || ""); setFunding("All"); setClosure(true);
      setCh({ Push: true, SMS: true, Email: true, WhatsApp: false });
      setSubject(can.short + " closing at 1pm on Thursday (weather)");
      setBody("Hi {first}, Met Éireann has issued an orange wind warning for Co. " + can.county + " on Thursday afternoon. For everyone's safety, " + can.short + " will close at 1pm on Thursday 22 October and the school run will not operate. Please collect {child} by 1pm. We'll confirm by 7am Thursday if anything changes. " + can.short + " team");
    } else if (k === "window") {
      setType("Service"); setValue("SAC"); setFunding("All"); setClosure(false);
      setCh({ Push: true, SMS: true, Email: false, WhatsApp: false });
      setSubject(TEMPLATES[1].subject); setBody(TEMPLATES[1].body);
    } else {
      setType("Service"); setValue("SAC"); setFunding("All"); setClosure(false);
      setCh({ Push: true, SMS: false, Email: true, WhatsApp: false });
      setSubject(TEMPLATES[9].subject); setBody(TEMPLATES[9].body);
    }
  };
  return (
    <div className="ros-split">
      <Card title="Composer" sub={tpl ? "Started from template " + tpl.id + " · " + tpl.name : "Start blank or from an example"}
        right={tpl ? <Btn size="sm" variant="subtle" onClick={() => setFocus({ templateId: "" })}>Clear template</Btn> : undefined}>
        <Row wrap gap={6} style={{ marginBottom: 14 }}>
          <Sub>Examples:</Sub>
          {locs.some(l => l.id === "CAN") && <Btn size="sm" onClick={() => preset("weather")}>Weather closure</Btn>}
          <Btn size="sm" onClick={() => preset("window")}>Window closing</Btn>
          <Btn size="sm" onClick={() => preset("camp")}>Camp places</Btn>
        </Row>
        <Stack gap={12}>
          <Field label="Audience by">
            <Seg size="sm" value={type} onChange={(v) => { setType(v); setValue(audienceOptions(v)[0]?.[0] || ""); }} options={["Location", "School", "Route", "Room", "Service"]} />
          </Field>
          <div className="ros-split-even">
            <Field label={type}>
              <select className="ros-input" value={val} onChange={(e) => setValue(e.target.value)}>
                {opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Funding">
              <select className="ros-input" value={funding} onChange={(e) => setFunding(e.target.value as "All" | "NCS" | "Private")}>
                <option value="All">All families</option><option value="NCS">NCS families only</option><option value="Private">Private only</option>
              </select>
            </Field>
          </div>
          <Field label="Channels">
            <Row wrap gap={14}>
              {CHANS.map(c => <label key={c} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}><Toggle on={ch[c]} onChange={() => setCh(x => ({ ...x, [c]: !x[c] }))} label={c} />{c} <Sub>{reach[c]}</Sub></label>)}
            </Row>
          </Field>
          <Field label="Subject"><input className="ros-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short and specific" /></Field>
          <Field label="Message" hint="Merge fields such as {first} and {child} are filled per family when sent.">
            <textarea className="ros-input" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, cursor: "pointer" }}>
            <Toggle on={closure} onChange={() => setClosure(x => !x)} label="Closure or emergency" /> This is a closure or emergency message
          </label>
          {closure && !apr && (
            <Callout tone="warn" title="Owner approval needed">No owner approval is on file for a closure at this audience{closureApr ? " (" + closureApr.id + " covers the Canovee closure only)" : ""}. Exceptional closures need the owner's approval before any message or billing change, so sending is locked.</Callout>
          )}
          {closure && apr && (
            <Callout tone={apr.status === "Approved" ? "ok" : apr.status === "Declined" ? "bad" : "warn"} title={"Owner approval " + apr.id + " · " + apr.status}
              right={<Row gap={6}><Btn size="sm" onClick={() => openRecord({ kind: "approval", id: apr.id })}>Open {apr.id}</Btn>{apr.status === "Pending" && role.id === "owner" && <Btn size="sm" variant="primary" onClick={() => confirmThen({ title: "Approve " + apr.id + "?", body: apr.effect + ". Fee handling under the closure policy stays a separate decision.", confirmLabel: "Approve closure message", run: () => decideApproval({ id: apr.id, decision: "Approved" }) })}>Approve</Btn>}</Row>}>
              {apr.status === "Approved" ? "Approved by " + apr.decidedBy + ". You can send the closure message." : apr.status === "Declined" ? "The owner declined this closure. Do not send it." : "Exceptional closures need the owner's approval before any message goes out or any billing changes. Sending is locked until " + apr.id + " is approved."}
            </Callout>
          )}
          <Row wrap>
            <Btn variant="primary" disabled={!canSend} onClick={() => confirmThen({
              title: "Send to " + fams.length + " families?",
              body: "“" + subject + "” to " + label + " by " + chosen.join(", ") + ". This is simulated: nothing is sent, and the broadcast is written to the audit log and Activity.",
              confirmLabel: "Send broadcast", run: () => sendBroadcast({ subject, audience: label, count: fams.length, channels: chosen }),
            })}>Send to {fams.length} families</Btn>
            <DemoTag />
          </Row>
          {!fams.length && <Sub>No families match this audience.</Sub>}
        </Stack>
      </Card>
      <Stack gap={14}>
        <Card title="Live audience" sub={label}>
          <Grid min={110}>
            <Kpi label="Families" value={fams.length} />
            <Kpi label="Children" value={kids} />
            <Kpi label="Guardians" value={fams.reduce((n, f) => n + f.guardians.length, 0)} />
          </Grid>
          <div style={{ marginTop: 14 }}>
            <HBars items={CHANS.map(c => ({ label: c + (ch[c] ? "" : " (off)"), value: reach[c], tone: ch[c] ? "accent" as const : "neutral" as const }))} />
          </div>
          <div style={{ marginTop: 10 }}><Sub>Push reaches families using MyRosKids. WhatsApp assumes opt-in for app and SMS families (demo).</Sub></div>
        </Card>
        <Card title="Preview" sub={sample ? "As " + (guardian(sample)?.name || sample.surname) + " (" + sample.id + ") would see it" : "Pick an audience to preview"}>
          <div style={{ borderRadius: 16, padding: 14, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <Row gap={8} style={{ marginBottom: 8 }}><Badge tone="brand">MyRosKids</Badge><Sub>now</Sub></Row>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{subject ? fillVars(subject, sample?.id) : "Subject"}</div>
            <div style={{ fontSize: 12.5, color: "var(--body)", marginTop: 6, lineHeight: 1.6 }}>{body ? fillVars(body, sample?.id) : "Your message appears here."}</div>
          </div>
        </Card>
      </Stack>
    </div>
  );
}

/* ---------------- Templates ---------------- */
function Templates() {
  const { s, ui } = useRos();
  const [sel, setSel] = useState(TEMPLATES[0].id);
  const [grp, setGrp] = useState<string>("All");
  const { id: fid } = resolveFamily(ui.focus.familyId);
  const t = TEMPLATES.find(x => x.id === sel) || TEMPLATES[0];
  const groups = ["All", ...Array.from(new Set(TEMPLATES.map(x => x.group)))];
  const list = TEMPLATES.filter(x => grp === "All" || x.group === grp);
  const auto = t.auto ? s.automations.find(a => a.id === t.auto) : undefined;
  const f = fid ? family(fid) : undefined;
  return (
    <Page>
      <PageHead eyebrow="Communications · Templates" title="House message templates"
        sub="Plain, Irish-English wording agreed with the owner. Agents and staff start from these, so families hear the same thing from every location." />
      <div style={{ marginBottom: 12 }}><Seg size="sm" value={grp} onChange={setGrp} options={groups} /></div>
      <div className="ros-split">
        <Card pad={false} title={list.length + " templates"}>
          <div style={{ padding: "0 4px 8px" }}>
            {list.map(x => <ListRow key={x.id} onClick={() => setSel(x.id)} tone={x.id === t.id ? "accent" : undefined} title={x.name} sub={x.group + " · " + x.channels.join(", ") + " · " + x.trigger} right={<Sub>{x.id}</Sub>} />)}
          </div>
        </Card>
        <Stack gap={14}>
          <Card title={t.name} sub={t.id + " · owned by " + t.owner} right={<Badge tone="info">{t.group}</Badge>}>
            <KV items={[["When it is used", t.trigger], ["Channels", t.channels.join(", ")], ["Subject", t.subject], ["Linked automation", auto ? auto.name + " (" + (auto.on ? "on" : "paused") + ")" : "Used by staff on demand"]]} />
            <Label style={{ marginTop: 14, marginBottom: 6 }}>Template text</Label>
            <div style={{ fontSize: 13, lineHeight: 1.65, color: "var(--body)", padding: 12, borderRadius: 12, border: "1px dashed var(--border-strong)", fontFamily: "var(--mono)" }}>{t.body}</div>
            <Row wrap style={{ marginTop: 14 }}>
              <Btn variant="primary" onClick={() => nav("Comms", "Broadcasts", { templateId: t.id })}>Use in composer</Btn>
              {f && <Btn onClick={() => nav("Families", "Communications", { templateId: t.id, familyId: f.id })}>Send to {f.surname} family</Btn>}
              {auto && <Btn variant="subtle" onClick={() => openRecord({ kind: "automation", id: auto.id })}>Open automation</Btn>}
            </Row>
          </Card>
          <Card title="Preview with real data" sub={f ? "Filled for " + f.surname + " (" + f.id + "). Change family on the Family History tab." : "No family in scope"}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{fillVars(t.subject, fid)}</div>
            <div style={{ fontSize: 13, color: "var(--body)", marginTop: 8, lineHeight: 1.65 }}>{fillVars(t.body, fid)}</div>
          </Card>
        </Stack>
      </div>
    </Page>
  );
}

/* ---------------- Family History ---------------- */
function History() {
  const { ui } = useRos();
  const r = resolveFamily(ui.focus.familyId);
  const [chan, setChan] = useState("All");
  const [dir, setDir] = useState<"All" | "in" | "out" | "note">("All");
  const [range, setRange] = useState<"All" | "7d" | "30d">("All");
  const [q, setQ] = useState("");
  if (!r.id) return <Page><Card><Empty title="No families in your scope" /></Card></Page>;
  const f = family(r.id)!;
  const all = familyTimeline(f.id);
  const chans = ["All", ...Array.from(new Set(all.map(x => x.channel)))];
  const from = range === "7d" ? addDays(TODAY, -7) : range === "30d" ? addDays(TODAY, -30) : "";
  const t = q.trim().toLowerCase();
  const items = all.filter(x => (chan === "All" || x.channel === chan) && (dir === "All" || x.dir === dir) && (!from || x.at.slice(0, 10) >= from) && (!t || (x.title + " " + x.by).toLowerCase().includes(t)));
  const byChan = new Map<string, number>(); for (const x of all) byChan.set(x.channel, (byChan.get(x.channel) || 0) + 1);
  const inbound = all.filter(x => x.dir === "in").length, outbound = all.filter(x => x.dir === "out").length;
  const last = all[0];
  return (
    <Page>
      <PageHead eyebrow="Communications · Family history" title={"Every conversation with the " + f.surname + " family"}
        sub="Email, app, SMS, phone notes, push notifications and system messages for one Parent ID, newest first." />
      <FamilyPicker value={f.id} note={r.note} onPick={(id) => setFocus({ familyId: id })}
        right={<Btn variant="primary" size="sm" onClick={() => nav("Families", "Communications", { familyId: f.id })}>Compose</Btn>} />
      <Grid min={150} style={{ marginBottom: 16 }}>
        <Kpi label="Touchpoints" value={all.length} />
        <Kpi label="From the family" value={inbound} tone="info" />
        <Kpi label="From us" value={outbound} />
        <Kpi label="Notes" value={all.length - inbound - outbound} />
        <Kpi label="Last contact" value={last ? rel(last.at).replace(/ \d\d:\d\d$/, "") : "None"} sub={last ? last.channel : undefined} />
      </Grid>
      <div className="ros-split">
        <Card title={items.length + " of " + all.length + " entries"}
          right={<Seg size="sm" value={range} onChange={setRange} options={[["All", "All time"], ["30d", "30 days"], ["7d", "7 days"]] as [typeof range, ReactNode][]} />}>
          <Row wrap gap={8} style={{ marginBottom: 12 }}>
            <Seg size="sm" value={dir} onChange={setDir} options={[["All", "All"], ["in", "Inbound"], ["out", "Outbound"], ["note", "Notes"]] as [typeof dir, ReactNode][]} />
            <Search value={q} onChange={setQ} placeholder="Search history" width={220} />
          </Row>
          <div style={{ marginBottom: 12 }}><Seg size="sm" value={chan} onChange={setChan} options={chans} /></div>
          {items.length ? <Timeline items={items.map(x => ({ at: rel(x.at), title: x.title, detail: x.channel + " · " + (x.dir === "in" ? "from " : x.dir === "note" ? "note by " : "by ") + x.by + (x.status ? " · " + x.status : ""), tone: dirTone(x.dir), right: x.ref ? <RecLink r={x.ref} /> : undefined }))} /> : <Empty title="Nothing matches these filters" />}
        </Card>
        <Stack gap={14}>
          <Card title="By channel">
            <HBars items={[...byChan.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, onClick: () => setChan(k) }))} />
          </Card>
          <Card title="Contact preferences">
            <KV items={[["Prefers", f.channel], ["Language", f.language], ["Billing contact", guardian(f)?.name || ""], ["Joined", fmtDate(f.joined) + " " + f.joined.slice(0, 4)]]} />
            <div style={{ marginTop: 12 }}>
              {f.guardians.map(g => <ListRow key={g.name} lead={<Avatar name={g.name} size={26} />} title={g.name} sub={g.relation + " · " + g.email + " · " + g.phone} />)}
            </div>
          </Card>
        </Stack>
      </div>
    </Page>
  );
}
