/* MyRosKids, reimagined: the parent app preview for the O'Neill family
   (ROS1042). Phone-first: a centred device frame on desktop, full width on a
   phone. Every status, booking and amount is read live from the shared store,
   so when the driver boards Luca or Hazelbrook signs him in, this screen moves
   with them. A parent only ever sees their own family: no other children,
   ratios, payroll or internal notes. Nothing is sent or charged. */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRos, defineAction, setTab, confirmThen, getState } from "../store";
import { BrandMark } from "../chrome";
import { InvoicePanel } from "../records";
import { Badge, DemoTag, StatusBadge, Avatar } from "../ui";
import { idx, family, child, guardian, invoiceTotal, invoiceBalance, invoiceStatus, familyDue, locById, schoolName, staffById } from "../selectors";
import { payNow } from "../actions";
import { TODAY, THIS_WEEK, dow, dowLong, fmtDate, fmtDay, fmtDateY, hm, toMin, euro, rel } from "../time";
import type { BookingRequest, BookingWindow, Child, Family, HHMM, ISODate, Message, Tone } from "../types";
import { ICONS } from "../../logic/data";
import {
  PARENT_FAMILY, CARD_LABEL, SUNNY_SOURCE, SUNNY_STARTERS, END_TIMES, journey, activityNotes, askSunny, openSunnyCase, classify, policies,
  openWindow, lockedWeek, submissionOf, planFor, priceWeek, lateFees, hoursBetween, sacStart, noticeHoursUntil, minsUntil, countdown, fmtAt,
  familyInvoices, familyPayments, methodLabel, nextInvoice, submittedAt, clean,
  type DayPlan, type SunnyReply, type Journey, type PlanSubmission,
} from "../sunny";

const FID = PARENT_FAMILY;
const NAVY = "#060068", SUN = "#FFF100";
const firstName = (full?: string) => (full || "").split(" ")[0];
const sum = (a: { amount: number }[]) => Math.round(a.reduce((n, x) => n + x.amount, 0) * 100) / 100;

/* ---------------- parent actions (replayable and deterministic) ---------------- */
export const submitWindow = defineAction<{ windowId: string; familyId: string; childId: string; plan: DayPlan[] }>("parent.window.submit", (s, p, ctx) => {
  const w = s.windows.find(x => x.id === p.windowId);
  const f = s.families.find(x => x.id === p.familyId);
  const c = s.children.find(x => x.id === p.childId && x.familyId === p.familyId);
  if (!w || !f || !c || w.status !== "Open" || ctx.now >= w.closes) return;
  let sub = w.submissions.find(x => x.familyId === f.id) as PlanSubmission | undefined;
  const first = !sub;
  if (!sub) { sub = { familyId: f.id, submittedAt: ctx.now, sessions: 0, hours: 0 }; w.submissions.push(sub); }
  sub.plans = { ...(sub.plans || {}), [c.id]: p.plan.map(d => ({ ...d, collect: d.collect && c.consents.transport && !!c.routeId })) };
  let sessions = 0, hours = 0;
  for (const [cid, plan] of Object.entries(sub.plans)) {
    const k = s.children.find(x => x.id === cid); if (!k) continue;
    const start = sacStart(s, k);
    for (const d of plan) if (d.on) { sessions++; hours += hoursBetween(start, d.end); }
  }
  sub.sessions = sessions; sub.hours = hours; sub.submittedAt = ctx.now;
  const days = p.plan.filter(d => d.on).map(d => d.date.slice(8) + "/" + d.date.slice(5, 7)).join(", ") || "no sessions";
  ctx.log({ category: "Operations", title: "Booking window " + (first ? "submission" : "update") + ": " + f.surname + " (" + w.label + ")", detail: c.firstName + " " + c.surname + " · " + sessions + " sessions, " + hours + "h (" + days + "). Sent from MyRosKids by " + ctx.actor + ".", link: { kind: "family", id: f.id }, locationId: f.locationId });
  ctx.comm(f.id, "App", "in", (first ? "Submitted" : "Updated") + " bookings for " + w.label + " (" + sessions + " sessions, " + hours + "h)");
}, { toast: () => "Booking saved for the window. Staff see it straight away (demo)." });

export const requestChange = defineAction<{ familyId: string; childId: string; kind: BookingRequest["kind"]; date: ISODate; end: HHMM; collect: boolean; note: string }>("parent.request", (s, p, ctx) => {
  const f = s.families.find(x => x.id === p.familyId);
  const c = s.children.find(x => x.id === p.childId && x.familyId === p.familyId);
  const l = c && s.locations.find(x => x.id === c.locationId);
  if (!f || !c || !l) return;
  if (s.requests.some(r => r.familyId === f.id && r.childId === c.id && r.date === p.date && r.kind === p.kind && r.status === "Pending")) return;
  const existing = s.bookings.find(b => b.childId === c.id && b.date === p.date && b.session === "After School" && b.status === "Booked");
  if (p.kind === "Late booking" ? !!existing : !existing) return;
  const start = existing?.start || sacStart(s, c);
  const end = p.kind === "Cancellation" && existing ? existing.end : p.end;
  if (toMin(end) <= toMin(start)) return;
  const collect = p.kind === "Late booking" && p.collect && c.consents.transport && !!c.routeId;
  const fees = p.kind === "Late booking" ? lateFees(s, c, hoursBetween(start, end), collect) : [];
  const id = ctx.id(p.kind === "Late booking" ? "LBR" : p.kind === "Change" ? "CHG" : "CXL");
  const msgId = ctx.id("MSG");
  const what = p.kind === "Late booking" ? "add After School on " + fmtDay(p.date) + ", " + start + " to " + end + (collect ? ", with school collection" : "")
    : p.kind === "Change" && existing ? "change " + fmtDay(p.date) + " to " + start + " to " + end + " (booked " + existing.start + " to " + existing.end + ")"
    : "cancel After School on " + fmtDay(p.date);
  const note = p.note.trim();
  const body = "Request from MyRosKids: " + what + " for " + c.firstName + "." + (note ? " " + note : "");
  s.messages.push({
    id: msgId, queue: "Parent app", familyId: f.id, from: ctx.actor, subject: p.kind + " for " + c.firstName + ", " + fmtDay(p.date), body, received: ctx.now,
    classification: p.kind === "Late booking" ? "Late booking request" : p.kind === "Change" ? "Change request" : "Cancellation request", confidence: 1, status: "New", direction: "in", channel: "App", link: { kind: "request", id },
  });
  s.requests.push({
    id, kind: p.kind, familyId: f.id, childId: c.id, locationId: c.locationId, date: p.date, session: "After School", start, end, schoolId: c.schoolId,
    routeId: collect ? c.routeId : existing?.routeId, bookingId: existing?.id, received: ctx.now, channel: "Parent app", status: "Pending", note: note || body, fees, messageId: msgId,
  });
  const mgr = s.staff.find(x => x.id === l.managerId)?.name || "Location manager";
  s.tasks.push({ id: ctx.id("TSK"), title: "Decide " + p.kind.toLowerCase() + " " + id + " (" + f.surname + ", " + fmtDay(p.date) + ")", owner: mgr, due: "Today", dueDate: TODAY, priority: "Medium", department: "Operations", status: "Not started", link: { kind: "request", id }, source: "MyRosKids", locationId: c.locationId });
  ctx.agent("bookings", id + " received from MyRosKids (" + f.surname + "): notice, capacity, ratio and fee checks ready for staff", "run", { kind: "request", id });
  ctx.log({ category: "Operations", title: p.kind + " requested in MyRosKids (" + id + ")", detail: c.firstName + " " + c.surname + " · " + fmtDay(p.date) + " " + start + " to " + end + (fees.length ? " · " + euro(sum(fees)) + " if approved (demo fee rules)" : "") + ". Waiting for staff approval.", link: { kind: "request", id }, locationId: c.locationId });
  ctx.comm(f.id, "App", "in", p.kind + " request " + id + " for " + fmtDay(p.date) + " sent for approval");
}, { toast: () => "Request sent to the team. Nothing is booked or charged until staff approve it." });

export const sendParentMessage = defineAction<{ familyId: string; body: string }>("parent.message", (s, p, ctx) => {
  const f = s.families.find(x => x.id === p.familyId);
  const body = p.body.trim();
  if (!f || !body) return;
  const cls = classify(body);
  const words = body.split(/\s+/);
  const subject = words.slice(0, 7).join(" ").replace(/[.,;:!?]$/, "") + (words.length > 7 ? "…" : "");
  const id = ctx.id("MSG");
  s.messages.push({ id, queue: "Parent app", familyId: f.id, from: ctx.actor, subject, body, received: ctx.now, classification: cls.label, confidence: cls.confidence, status: "New", direction: "in", channel: "App", link: { kind: "family", id: f.id } });
  ctx.log({ category: "Communications", title: "Parent message: " + subject, detail: ctx.actor + " (" + f.id + ") wrote in MyRosKids. Classified as " + cls.label + " (" + Math.round(cls.confidence * 100) + "%). Waiting in the Unified Inbox.", link: { kind: "message", id }, locationId: f.locationId });
  ctx.comm(f.id, "App", "in", "Message: " + subject);
}, { toast: () => "Sent to the team (demo, simulated)." });

export const signIncident = defineAction<{ incidentId: string; familyId: string }>("parent.incident.sign", (s, p, ctx) => {
  const inc = s.incidents.find(x => x.id === p.incidentId);
  const c = inc && s.children.find(x => x.id === inc.childId);
  if (!inc || !c || c.familyId !== p.familyId || inc.parentSigned) return;
  inc.parentSigned = true;
  if (inc.status === "Awaiting signature") inc.status = inc.managerReviewed ? "Closed" : "Open";
  s.tasks.forEach(t => { if (t.link?.kind === "incident" && t.link.id === inc.id) t.status = "Done"; });
  ctx.log({ category: "Safeguarding", title: "Parent signed incident " + inc.id, detail: ctx.actor + " read and signed the " + inc.kind.toLowerCase() + " report for " + c.firstName + " " + c.surname + " in MyRosKids.", link: { kind: "incident", id: inc.id }, locationId: inc.locationId });
  ctx.comm(p.familyId, "App", "in", "Signed incident report " + inc.id);
}, { toast: () => "Signed. The team can see your signature (demo)." });

type ConsentKey = keyof Child["consents"];
const CONSENT_LABEL: Record<ConsentKey, string> = { photos: "Photos", outings: "Outings", transport: "School transport", sunscreen: "Sunscreen" };
const consentSubject = (k: ConsentKey, c: Child) => "Consent change: " + CONSENT_LABEL[k] + " for " + c.firstName;
export const requestConsentChange = defineAction<{ familyId: string; childId: string; consent: ConsentKey; to: boolean }>("parent.consent.request", (s, p, ctx) => {
  const f = s.families.find(x => x.id === p.familyId);
  const c = s.children.find(x => x.id === p.childId && x.familyId === p.familyId);
  const l = c && s.locations.find(x => x.id === c.locationId);
  if (!f || !c || !l) return;
  const subject = consentSubject(p.consent, c);
  if (s.messages.some(m => m.familyId === f.id && m.subject === subject && (m.status === "New" || m.status === "Escalated" || m.status === "Drafted"))) return;
  const msgId = ctx.id("MSG");
  s.messages.push({ id: msgId, queue: "Parent app", familyId: f.id, from: ctx.actor, subject, body: "Please " + (p.to ? "give" : "withdraw") + " " + CONSENT_LABEL[p.consent].toLowerCase() + " consent for " + c.firstName + ". Requested in MyRosKids.", received: ctx.now, classification: "Consent change", confidence: 1, status: "New", direction: "in", channel: "App", link: { kind: "child", id: c.id } });
  const mgr = s.staff.find(x => x.id === l.managerId)?.name || "Location manager";
  s.tasks.push({ id: ctx.id("TSK"), title: "Update " + CONSENT_LABEL[p.consent].toLowerCase() + " consent for " + c.firstName + " " + c.surname + " (" + (p.to ? "give" : "withdraw") + ")", owner: mgr, due: "Today", dueDate: TODAY, priority: "Medium", department: "Operations", status: "Not started", link: { kind: "message", id: msgId }, source: "MyRosKids", locationId: c.locationId });
  ctx.log({ category: "Operations", title: "Consent change requested: " + c.firstName + " " + c.surname, detail: CONSENT_LABEL[p.consent] + " consent: parent asked to " + (p.to ? "give" : "withdraw") + " it. Stays as it is until staff confirm.", link: { kind: "child", id: c.id }, locationId: c.locationId });
  ctx.comm(f.id, "App", "in", "Asked to " + (p.to ? "give" : "withdraw") + " " + CONSENT_LABEL[p.consent].toLowerCase() + " consent for " + c.firstName);
}, { toast: () => "Change requested. The team will confirm before anything changes." });

/* ---------------- shell state ---------------- */
type MsgView = "team" | "sunny" | "updates";
type SheetRef = { kind: "invoice" | "receipt" | "doc" | "medical"; id: string };
interface ChatItem { id: number; who: "me" | "sunny"; text: string; at: string; reply?: SunnyReply; caseId?: string }
interface AppCtx {
  f: Family; c: Child; place: string;
  go: (tab: string) => void; ask: (q: string) => void; open: (sh: SheetRef) => void; compose: (text: string) => void;
  method: string; setMethod: (m: string) => void; view: MsgView; setView: (v: MsgView) => void;
  draft: string; setDraft: (t: string) => void; chat: ChatItem[];
}

/* ---------------- icons (codebase set plus a few in the same stroke style) ---------------- */
const PATH = {
  home: ICONS.navHome, book: ICONS.visits, chat: ICONS.helios, docs: ICONS.records, bell: ICONS.bell,
  card: "M3.5 7.2A1.7 1.7 0 0 1 5.2 5.5h13.6a1.7 1.7 0 0 1 1.7 1.7v9.6a1.7 1.7 0 0 1-1.7 1.7H5.2a1.7 1.7 0 0 1-1.7-1.7V7.2Z M3.5 10h17 M7 14.6h3.4",
  bus: "M6.5 4h11A2 2 0 0 1 19.5 6v10.5h-15V6a2 2 0 0 1 2-2Z M4.5 11h15 M7.5 19.5v-3 M16.5 19.5v-3 M8 14h.01 M16 14h.01",
  sun: "M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z M12 2.8v2 M12 19.2v2 M2.8 12h2 M19.2 12h2 M5.5 5.5l1.4 1.4 M17.1 17.1l1.4 1.4 M5.5 18.5l1.4-1.4 M17.1 6.9l1.4-1.4",
  heart: "M12 19.6s-7.3-4.4-7.3-9.6A4 4 0 0 1 12 7.6 4 4 0 0 1 19.3 10c0 5.2-7.3 9.6-7.3 9.6Z",
  check: "M5 12.5l4.2 4.2L19 7", send: "M4.5 11.8 19.5 4.5l-5.6 15-2.9-6.1-6.5-1.6Z", close: "M6.5 6.5l11 11 M17.5 6.5l-11 11",
  clock: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z M12 7.5V12l3 2", lock: "M7.5 10.5V8.2a4.5 4.5 0 0 1 9 0v2.3 M6 10.5h12v9H6v-9Z", chev: "M9.5 6l6 6-6 6",
};
function Ico({ d, size = 20, sw = 1.7 }: { d: string; size?: number; sw?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}><path d={d} /></svg>;
}

const NAV: { tab: string; label: string; d: string }[] = [
  { tab: "Home", label: "Home", d: PATH.home }, { tab: "Book", label: "Book", d: PATH.book }, { tab: "Payments", label: "Pay", d: PATH.card },
  { tab: "Child Updates", label: "Updates", d: PATH.heart }, { tab: "Messages", label: "Messages", d: PATH.chat }, { tab: "Documents", label: "Docs", d: PATH.docs },
];

const CSS = `
.myros{--pa-link:var(--info);color:var(--ink)}
[data-theme="light"] .myros{--pa-link:var(--ros-blue)}
.myros-wrap{display:flex;justify-content:center;align-items:flex-start;gap:32px;padding:14px 20px 48px}
.myros-col{display:flex;flex-direction:column;align-items:center;gap:10px;width:min(430px,100%);flex:none}
.myros-cap{font-size:11.5px;color:var(--dim);letter-spacing:.02em;text-align:center}
.myros-frame{position:relative;width:100%;height:clamp(620px,calc(100vh - 200px),900px);display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--border-strong);border-radius:34px;overflow:hidden;box-shadow:0 0 0 7px var(--surface-2),0 0 0 8px var(--border),0 34px 80px rgba(0,0,0,.26)}
.myros-status{flex:none;display:flex;justify-content:space-between;align-items:center;padding:11px 26px 3px;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--ink)}
.myros-head{flex:none;display:flex;align-items:center;gap:10px;padding:8px 16px 11px;background:var(--bg);border-bottom:1px solid var(--border)}
.myros-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:16px 16px 28px;scrollbar-width:thin}
.myros-nav{flex:none;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:2px;padding:6px 6px 10px;border-top:1px solid var(--border);background:var(--surface-strong,var(--surface))}
.myros-navbtn{min-height:54px;border:0;background:none;color:var(--dim);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:10.5px;font-weight:500;cursor:pointer;border-radius:14px;padding:4px 0;font-family:inherit}
.myros-navbtn[aria-current="page"]{color:var(--ink);font-weight:650}
.myros-navico{width:44px;height:28px;border-radius:999px;display:flex;align-items:center;justify-content:center;transition:background .2s var(--ease),color .2s var(--ease)}
.myros-navbtn[aria-current="page"] .myros-navico{background:#FFF100;color:#060068}
.myros-side{width:250px;flex:none;padding-top:40px;font-size:12.5px;line-height:1.55;color:var(--dim)}
.myros-side b{color:var(--ink);font-weight:600}
.myros-press{transition:transform .14s var(--ease),background .2s var(--ease),border-color .2s var(--ease)}
.myros-press:active:not(:disabled){transform:translateY(1px)}
.myros-press:focus-visible,.myros-focus:focus-visible{outline:2px solid var(--pa-link);outline-offset:2px}
.myros-row:hover{background:var(--surface-2)}
.myros-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.myros select.ros-input{height:46px;font-size:14px;border-radius:14px}
@keyframes myrosPulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes myrosIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes myrosSheet{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
.myros-live{animation:myrosPulse 1.6s ease-in-out infinite}
.myros-in{animation:myrosIn .26s cubic-bezier(.2,.8,.2,1) both}
.myros-sheet{animation:myrosSheet .26s cubic-bezier(.2,.8,.2,1) both}
@media (max-width:1180px){.myros-side{display:none}}
@media (max-width:519px){.myros-wrap{padding:0}.myros-col{width:100%;gap:0}.myros-cap,.myros-status{display:none}.myros-frame{height:auto;min-height:calc(100dvh - 130px);border:0;border-radius:0;box-shadow:none;overflow:visible}.myros-head{position:sticky;top:0;z-index:5}.myros-scroll{overflow:visible}.myros-nav{position:sticky;bottom:0;z-index:5}}
@media (prefers-reduced-motion:reduce){.myros-live,.myros-in,.myros-sheet{animation:none}.myros-press{transition:none}}
`;

/* ---------------- small building blocks ---------------- */
function Stack({ children, gap = 14 }: { children: ReactNode; gap?: number }) {
  return <div style={{ display: "flex", flexDirection: "column", gap, minWidth: 0 }}>{children}</div>;
}
function Box({ children, style, pad = 16 }: { children: ReactNode; style?: CSSProperties; pad?: number }) {
  return <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 22, padding: pad, minWidth: 0, ...style }}>{children}</section>;
}
function H({ children, right, sub }: { children: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 650, letterSpacing: "-.2px", color: "var(--ink)" }}>{children}</h3>
        {sub && <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 3, lineHeight: 1.45 }}>{sub}</div>}
      </div>
      {right && <div style={{ flex: "none", display: "flex", alignItems: "center", gap: 6 }}>{right}</div>}
    </div>
  );
}
function Small({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 12.5, color: "var(--dim)", lineHeight: 1.5, ...style }}>{children}</div>;
}
function PageTitle({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ padding: "2px 2px 0" }}>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 650, letterSpacing: "-.6px", lineHeight: 1.15 }}>{title}</h2>
      {sub && <div style={{ fontSize: 13, color: "var(--dim)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
type BtnKind = "sun" | "navy" | "ghost" | "quiet";
function PBtn({ children, onClick, kind = "ghost", full, disabled, ariaLabel, type = "button", small, style }: {
  children: ReactNode; onClick?: () => void; kind?: BtnKind; full?: boolean; disabled?: boolean; ariaLabel?: string; type?: "button" | "submit"; small?: boolean; style?: CSSProperties;
}) {
  const k: Record<BtnKind, CSSProperties> = {
    sun: { background: SUN, color: NAVY, border: "1px solid " + SUN, fontWeight: 650 },
    navy: { background: NAVY, color: "#ffffff", border: "1px solid " + NAVY, fontWeight: 650 },
    ghost: { background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--border-strong)", fontWeight: 550 },
    quiet: { background: "none", color: "var(--pa-link)", border: "1px solid transparent", fontWeight: 600 },
  };
  return (
    <button type={type} aria-label={ariaLabel} disabled={disabled} onClick={onClick} className="myros-press"
      style={{ minHeight: 44, minWidth: 44, padding: small ? "0 14px" : "0 18px", borderRadius: 999, fontSize: small ? 13 : 14, fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, width: full ? "100%" : undefined, whiteSpace: "nowrap", ...k[kind], ...style }}>
      {children}
    </button>
  );
}
function Chip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="myros-press"
      style={{ minHeight: 44, padding: "0 14px", borderRadius: 999, border: "1px solid var(--border-strong)", background: "var(--surface-2)", color: "var(--ink)", fontSize: 13, fontFamily: "inherit", cursor: "pointer", textAlign: "left" }}>
      {children}
    </button>
  );
}
function Switch({ on, onChange, label, sub, disabled }: { on: boolean; onChange: () => void; label: ReactNode; sub?: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={onChange} className="myros-focus"
      style={{ width: "100%", minHeight: 52, display: "flex", alignItems: "center", gap: 12, padding: "6px 2px", background: "none", border: 0, color: "var(--ink)", textAlign: "left", fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1 }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>{label}</span>
        {sub && <span style={{ display: "block", fontSize: 12.5, color: "var(--dim)", marginTop: 2, lineHeight: 1.4 }}>{sub}</span>}
      </span>
      <span aria-hidden="true" style={{ width: 48, height: 28, borderRadius: 999, flex: "none", position: "relative", background: on ? SUN : "var(--track)", border: "1px solid " + (on ? NAVY : "var(--border-strong)"), transition: "background .2s var(--ease)" }}>
        <span style={{ position: "absolute", top: 3, left: 3, width: 20, height: 20, borderRadius: 10, background: on ? NAVY : "var(--dim)", transform: on ? "translateX(20px)" : "none", transition: "transform .2s var(--ease)" }} />
      </span>
    </button>
  );
}
function Row({ title, sub, right, onClick, lead }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void; lead?: ReactNode }) {
  const inner = (
    <>
      {lead}
      <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
        <span style={{ display: "block", fontSize: 14, color: "var(--ink)", lineHeight: 1.35 }}>{title}</span>
        {sub && <span style={{ display: "block", fontSize: 12.5, color: "var(--dim)", marginTop: 2, lineHeight: 1.4 }}>{sub}</span>}
      </span>
      {right && <span style={{ flex: "none", display: "flex", alignItems: "center", gap: 8 }}>{right}</span>}
      {onClick && <span style={{ color: "var(--faint)", display: "flex" }}><Ico d={PATH.chev} size={16} /></span>}
    </>
  );
  const st: CSSProperties = { width: "100%", minHeight: 54, display: "flex", alignItems: "center", gap: 12, padding: "8px 8px", borderRadius: 14, background: "none", border: 0, color: "var(--ink)", fontFamily: "inherit" };
  return onClick
    ? <button type="button" onClick={onClick} className="myros-row myros-focus" style={{ ...st, cursor: "pointer", transition: "background .15s var(--ease)" }}>{inner}</button>
    : <div style={st}>{inner}</div>;
}
function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string][]; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: "grid", gridTemplateColumns: `repeat(${options.length},minmax(0,1fr))`, gap: 4, padding: 4, borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)} className="myros-focus"
          style={{ minHeight: 44, borderRadius: 999, border: 0, fontFamily: "inherit", fontSize: 13, fontWeight: v === value ? 650 : 500, cursor: "pointer", background: v === value ? SUN : "none", color: v === value ? NAVY : "var(--dim)", transition: "background .2s var(--ease),color .2s var(--ease)" }}>
          {l}
        </button>
      ))}
    </div>
  );
}
function SunnyAvatar({ size = 40 }: { size?: number }) {
  return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: size / 2, background: SUN, color: NAVY, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Ico d={PATH.sun} size={size * 0.56} sw={2} /></span>;
}
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 12.5, color: "var(--dim)", fontWeight: 550 }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 12, color: "var(--dim)" }}>{hint}</span>}
    </label>
  );
}
function Line({ label, value, strong, tone }: { label: ReactNode; value: ReactNode; strong?: boolean; tone?: string }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "5px 0", fontSize: strong ? 15 : 13.5, fontWeight: strong ? 700 : 400, color: tone || (strong ? "var(--ink)" : "var(--body)") }}>
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span><span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}
const statusTone = (st: string): Tone => (st === "Signed in" ? "ok" : st === "On bus" ? "brand" : st === "Signed out" ? "info" : st === "Not present" || st === "Absent" ? "bad" : "neutral");

/* ---------------- the app ---------------- */
export default function Parent({ tab }: { tab: string }) {
  const { s } = useRos();
  const f = family(FID);
  const c = f ? child(f.childIds[0]) : undefined;
  const [view, setView] = useState<MsgView>("team");
  const [sheet, setSheet] = useState<SheetRef | null>(null);
  const [method, setMethod] = useState(CARD_LABEL);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState("");
  const seq = useRef(1);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [tab]);

  if (!f || !c) return <div className="ros-page"><Small>The O'Neill family record is not in this demo dataset.</Small></div>;
  const place = locById(f.locationId)?.short || "the centre";
  const go = (t: string) => setTab("Parent", t);
  const ask = (q: string) => {
    const text = q.trim();
    if (!text) return;
    const reply = askSunny(text, FID);
    let caseId: string | undefined;
    if (reply.sensitive) {
      openSunnyCase({ familyId: FID, topic: reply.sensitive, question: text });
      caseId = getState().tasks.filter(t => t.source === SUNNY_SOURCE).pop()?.id;
    }
    const at = hm(getState().clockMin);
    setChat(prev => prev.concat({ id: seq.current++, who: "me", text, at }, { id: seq.current++, who: "sunny", text: reply.text, at, reply, caseId }));
    setView("sunny");
    go("Messages");
  };
  const app: AppCtx = {
    f, c, place, go, ask, open: setSheet, method, setMethod, view, setView, draft, setDraft, chat,
    compose: (text) => { setDraft(text); setView("team"); go("Messages"); },
  };
  const body = tab === "Book" ? <BookTab app={app} /> : tab === "Payments" ? <PaymentsTab app={app} /> : tab === "Child Updates" ? <UpdatesTab app={app} />
    : tab === "Messages" ? <MessagesTab app={app} /> : tab === "Documents" ? <DocsTab app={app} /> : <HomeTab app={app} />;

  return (
    <div className="myros">
      <style>{CSS}</style>
      <div className="myros-wrap">
        <div className="myros-col">
          <div className="myros-cap">MyRosKids preview · reimagined parent app (demo)</div>
          <div className="myros-frame">
            <div className="myros-status" aria-hidden="true"><span>{hm(s.clockMin)}</span><span>Demo · simulated</span></div>
            <header className="myros-head">
              <BrandMark size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-.2px" }}>MyRosKids</div>
                <div style={{ fontSize: 12, color: "var(--dim)" }}>{f.surname} family · {place}</div>
              </div>
              <Avatar name={guardian(f)?.name || "Parent"} size={34} tone={NAVY} />
            </header>
            <main ref={scroller} className="myros-scroll" aria-label={"MyRosKids " + tab}>
              <div key={tab} className="myros-in">{body}</div>
            </main>
            <nav className="myros-nav" aria-label="MyRosKids sections">
              {NAV.map(n => (
                <button key={n.tab} type="button" className="myros-navbtn myros-focus" aria-current={n.tab === tab ? "page" : undefined} onClick={() => go(n.tab)}>
                  <span className="myros-navico"><Ico d={n.d} size={19} sw={n.tab === tab ? 2 : 1.7} /></span>{n.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
        <aside className="myros-side" aria-label="How this preview works">
          <div style={{ fontSize: 13.5, fontWeight: 650, color: "var(--ink)", marginBottom: 8 }}>Live from the same records</div>
          <p style={{ margin: "0 0 10px" }}>Sinéad sees only the O'Neill family. Statuses, invoices and bookings are read from the shared demo records, nothing is typed in.</p>
          <p style={{ margin: "0 0 6px" }}><b>Try the school run</b></p>
          <ol style={{ margin: "0 0 12px", paddingLeft: 18 }}>
            <li>Use <b>Advance to afternoon</b> in the demo strip.</li>
            <li>Switch role to <b>Driver</b> and board Luca on WKR-02.</li>
            <li>Sign Luca in at Hazelbrook from a staff view.</li>
            <li>Come back here: Home, Updates and Sunny all move.</li>
          </ol>
          <p style={{ margin: 0 }}>Requests, messages and Sunny cases sent here land in staff Bookings, the Unified Inbox and Work.</p>
        </aside>
      </div>
      {sheet && <SheetView sheet={sheet} app={app} onClose={() => setSheet(null)} />}
    </div>
  );
}

/* ---------------- Home ---------------- */
function HomeTab({ app }: { app: AppCtx }) {
  const { s } = useRos();
  const greet = s.clockMin < 12 * 60 ? "Good morning" : s.clockMin < 18 * 60 ? "Good afternoon" : "Good evening";
  return (
    <Stack>
      <div style={{ padding: "2px 2px 0" }}>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 650, letterSpacing: "-.8px", lineHeight: 1.15 }}>{greet}, {firstName(guardian(app.f)?.name)}</h2>
        <div style={{ fontSize: 13, color: "var(--dim)", marginTop: 5 }}>{dowLong(TODAY)} {fmtDate(TODAY)} · {hm(s.clockMin)}</div>
      </div>
      <LiveCard c={app.c} />
      <NeedsCard app={app} />
      <WeekCard app={app} />
      <MoneyCard app={app} />
      <QuickActions app={app} />
      <SunnyEntry app={app} />
    </Stack>
  );
}

function LiveCard({ c }: { c: Child }) {
  const j = journey(c.id);
  const escort = j.route?.escortId ? staffById(j.route.escortId)?.name : undefined;
  return (
    <section aria-live="polite" aria-label={c.firstName + " today"} style={{ background: SUN, color: NAVY, borderRadius: 24, padding: 16, boxShadow: "0 14px 34px rgba(6,0,104,.14)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 14, background: NAVY, color: SUN, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, flex: "none" }}>{c.firstName[0]}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{c.firstName}</div>
          <div style={{ fontSize: 12.5, opacity: 0.82 }}>{c.schoolClass} · {schoolName(c.schoolId)}</div>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 11px", borderRadius: 999, background: NAVY, color: "#ffffff", fontSize: 12, fontWeight: 650, whiteSpace: "nowrap" }}>
          {j.live && <span className="myros-live" style={{ width: 7, height: 7, borderRadius: 4, background: SUN }} />}{j.live ? "Live · " + j.status : j.status}
        </span>
      </div>
      <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-.5px", lineHeight: 1.2, marginTop: 14 }}>{j.headline}</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 6, opacity: 0.9 }}>{j.detail}</div>
      {j.steps.length > 0 && <Stepper steps={j.steps} />}
      {j.route && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(6,0,104,.16)", fontSize: 12.5 }}>
          <Ico d={PATH.bus} size={18} />
          <span style={{ flex: 1, minWidth: 0 }}>{j.route.id} · Driver {j.driver}{escort ? " · Escort " + escort : ""}</span>
        </div>
      )}
    </section>
  );
}

function Stepper({ steps }: { steps: Journey["steps"] }) {
  return (
    <ol aria-label="Today's journey" style={{ listStyle: "none", margin: "16px 0 0", padding: 0, display: "grid", gridTemplateColumns: `repeat(${steps.length},minmax(0,1fr))` }}>
      {steps.map((st, i) => (
        <li key={st.key} style={{ minWidth: 0, paddingRight: 6 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ width: 20, height: 20, borderRadius: 10, flex: "none", border: "2px solid " + NAVY, background: st.done ? NAVY : "transparent", color: SUN, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {st.done && <Ico d={PATH.check} size={11} sw={3.2} />}
            </span>
            {i < steps.length - 1 && <span style={{ flex: 1, height: 2, marginLeft: 4, borderRadius: 2, background: steps[i + 1].done ? NAVY : "rgba(6,0,104,.22)" }} />}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 650, marginTop: 7, lineHeight: 1.25 }}>{st.label}</div>
          <div style={{ fontSize: 11.5, marginTop: 2, fontVariantNumeric: "tabular-nums", opacity: 0.85 }}>{st.time || (st.key === "out" ? st.detail.replace("Booked until ", "Until ") : "Pending")}</div>
        </li>
      ))}
    </ol>
  );
}

function NeedsCard({ app }: { app: AppCtx }) {
  const { s } = useRos();
  const { f } = app;
  const items: { key: string; urgent: boolean; title: string; detail: string; cta: string; run: () => void }[] = [];
  const w = openWindow();
  if (w) {
    const sub = submissionOf(w, f.id), left = countdown(minsUntil(w.closes));
    items.push(sub
      ? { key: "win", urgent: false, title: "Booked for " + w.label, detail: sub.sessions + " sessions, " + sub.hours + "h · you can change it until " + fmtAt(w.closes) + " (" + left + " left)", cta: "Review", run: () => app.go("Book") }
      : { key: "win", urgent: true, title: "Book " + w.label, detail: "Window closes " + fmtAt(w.closes) + " · " + left + " left", cta: "Book now", run: () => app.go("Book") });
  }
  familyInvoices(f.id).filter(i => invoiceBalance(i) > 0).forEach(i => items.push({ key: i.id, urgent: true, title: "Invoice " + i.id + " to pay", detail: euro(invoiceBalance(i)) + " · w/c " + fmtDate(i.weekOf), cta: "Pay", run: () => app.open({ kind: "invoice", id: i.id }) }));
  s.incidents.filter(i => f.childIds.includes(i.childId) && !i.parentSigned && i.status === "Awaiting signature").forEach(i => items.push({ key: i.id, urgent: true, title: "Incident report to sign", detail: i.kind + " · " + fmtDay(i.date), cta: "Read", run: () => app.go("Child Updates") }));
  s.claims.filter(cl => cl.familyId === f.id && cl.status === "Awaiting acceptance").forEach(cl => items.push({ key: cl.id, urgent: true, title: "Accept NCS claim " + cl.id, detail: "On the NCS parent portal by " + cl.deadline.slice(11) + " " + fmtDay(cl.deadline.slice(0, 10)), cta: "Details", run: () => app.go("Payments") }));
  s.requests.filter(r => r.familyId === f.id && r.status === "Pending").forEach(r => items.push({ key: r.id, urgent: false, title: r.kind + " " + r.id + " with the team", detail: fmtDay(r.date) + " · waiting for staff approval", cta: "View", run: () => app.go("Book") }));
  s.messages.filter(m => m.familyId === f.id && m.direction === "in" && m.status === "Replied" && m.received.slice(0, 10) === TODAY && !!m.draft).forEach(m => items.push({ key: m.id, urgent: false, title: "Reply from the " + app.place + " team", detail: "Re: " + m.subject, cta: "Read", run: () => { app.setView("team"); app.go("Messages"); } }));
  const urgent = items.filter(x => x.urgent).length;
  return (
    <Box>
      <H right={urgent ? <Badge tone="warn">{urgent} to do</Badge> : <Badge tone="ok">All sorted</Badge>}>{urgent ? "Needs you" : "Coming up"}</H>
      {!items.length && <Small>Nothing needs you right now.</Small>}
      <Stack gap={8}>
        {items.map(it => (
          <div key={it.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 16, background: it.urgent ? "var(--warn-soft)" : "var(--surface-2)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{it.title}</div>
              <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 2, lineHeight: 1.4 }}>{it.detail}</div>
            </div>
            <PBtn small kind={it.urgent ? "sun" : "ghost"} onClick={it.run}>{it.cta}</PBtn>
          </div>
        ))}
      </Stack>
    </Box>
  );
}

function WeekCard({ app }: { app: AppCtx }) {
  const { s } = useRos();
  const { f, c } = app;
  const mine = (idx().bookingsByChild.get(c.id) || []).filter(b => b.session === "After School");
  const pending = s.requests.filter(r => r.familyId === f.id && r.status === "Pending");
  const j = journey(c.id);
  return (
    <Box pad={12}>
      <div style={{ padding: "4px 4px 0" }}><H right={<PBtn small kind="quiet" onClick={() => app.go("Book")}>Book</PBtn>}>This week</H></div>
      {THIS_WEEK.map((d, i) => {
        const b = mine.find(x => x.date === d);
        const ev = (idx().attendanceByChildDate.get(c.id + "|" + d) || []).filter(e => e.time >= "12:00");
        const inn = ev.find(e => e.kind === "in"), out = ev.find(e => e.kind === "out");
        const req = pending.find(r => r.date === d);
        const today = d === TODAY, past = d < TODAY;
        const value = today && b ? j.short : past && inn ? inn.time + " to " + (out?.time || "") : b ? b.start + " to " + b.end : "Not booked";
        const tag = past && inn ? <Badge tone="ok">Attended</Badge> : today && b ? <Badge tone="brand">Today</Badge> : req ? <Badge tone="warn">Requested</Badge> : b ? <Badge>Booked</Badge> : null;
        return (
          <div key={d} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 54, padding: "6px 4px", borderTop: i ? "1px solid var(--border)" : "none" }}>
            <div style={{ width: 38, flex: "none", textAlign: "center" }}>
              <div style={{ fontSize: 11.5, color: "var(--dim)" }}>{dow(d)}</div>
              <div style={{ fontSize: 17, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{+d.slice(8)}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5 }}>{b ? "After School" : "No session"}</div>
              <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 1 }}>{b ? (b.routeId ? "Bus " + b.routeId + " from " + schoolName(b.schoolId) : "Drop-off") : req ? req.kind + " requested" : today ? "" : past ? "" : "Late booking possible"}</div>
            </div>
            <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{value}</span>{tag}
            </div>
          </div>
        );
      })}
    </Box>
  );
}

function MoneyCard({ app }: { app: AppCtx }) {
  const { f } = app;
  const due = familyDue(f.id);
  const nx = nextInvoice(f.id);
  const last = familyInvoices(f.id)[0];
  const lastPay = last ? familyPayments(f.id).find(p => p.invoiceId === last.id && p.status === "Succeeded") : undefined;
  const tile: CSSProperties = { padding: "12px 12px 13px", borderRadius: 16, background: "var(--surface-2)", minWidth: 0 };
  return (
    <Box>
      <H>Money</H>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={tile}>
          <Small>Balance due</Small>
          <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: "-.6px", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{euro(due)}</div>
          <Small style={{ marginTop: 3 }}>{due > 0 ? "Ready to pay in the app" : last && lastPay ? last.id + " paid " + fmtDate(lastPay.date) : "Nothing to pay"}</Small>
        </div>
        <div style={tile}>
          <Small>Next invoice</Small>
          <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: "-.6px", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{nx && nx.submitted ? euro(nx.estimate) : "Not booked"}</div>
          <Small style={{ marginTop: 3 }}>{nx ? "Estimate · " + nx.label + " · issued " + fmtDay(nx.issued) : "No window open"}</Small>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0", fontSize: 13, color: "var(--body)" }}>
        <Ico d={PATH.card} size={18} /><span style={{ flex: 1 }}>{methodLabel(f.id)}</span><DemoTag>Demo</DemoTag>
      </div>
      <PBtn full onClick={() => app.go("Payments")}>Invoices and payments</PBtn>
    </Box>
  );
}

function QuickActions({ app }: { app: AppCtx }) {
  const items = [
    { label: "Add or change a session", d: PATH.book, run: () => app.go("Book") },
    { label: "Report an absence", d: PATH.bell, run: () => app.compose(app.c.firstName + " won't be in on ") },
    { label: "Message " + app.place, d: PATH.chat, run: () => { app.setView("team"); app.go("Messages"); } },
    { label: "Invoices and receipts", d: PATH.card, run: () => app.go("Payments") },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {items.map(it => (
        <button key={it.label} type="button" onClick={it.run} className="myros-press myros-row"
          style={{ minHeight: 84, display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "space-between", gap: 10, padding: 14, borderRadius: 20, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, textAlign: "left", cursor: "pointer" }}>
          <span style={{ width: 34, height: 34, borderRadius: 12, background: SUN, color: NAVY, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Ico d={it.d} size={18} sw={1.9} /></span>
          {it.label}
        </button>
      ))}
    </div>
  );
}

function SunnyEntry({ app }: { app: AppCtx }) {
  const [q, setQ] = useState("");
  return (
    <Box>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <SunnyAvatar />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Ask Sunny</div>
          <Small>Instant answers from your family's own records. Anything sensitive goes straight to a person.</Small>
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) { app.ask(q); setQ(""); } }} style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <label htmlFor="myros-home-ask" className="myros-sr">Ask Sunny a question</label>
        <input id="myros-home-ask" className="ros-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={"Ask about " + app.c.firstName + ", bookings or fees"} style={{ height: 46, borderRadius: 999, fontSize: 14, paddingLeft: 16 }} />
        <PBtn kind="sun" type="submit" ariaLabel="Ask Sunny" disabled={!q.trim()}><Ico d={PATH.send} size={18} /></PBtn>
      </form>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {SUNNY_STARTERS.slice(0, 3).map(x => { const qq = x.replace("Luca", app.c.firstName); return <Chip key={x} onClick={() => app.ask(qq)}>{qq}</Chip>; })}
      </div>
    </Box>
  );
}

/* ---------------- Book ---------------- */
function BookTab({ app }: { app: AppCtx }) {
  const w = openWindow();
  const p = policies();
  return (
    <Stack>
      <PageTitle title="Book" sub={"After School at " + app.place + " for " + app.c.firstName} />
      {w ? <WindowBooking app={app} w={w} /> : <Box><Small>No booking window is open right now.</Small></Box>}
      <Box>
        <H>Booking policy</H>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: "var(--body)" }}>
          <li>{p.notice}</li><li>{p.weekend}</li><li>{p.locked}</li><li>{p.partHours}</li><li>{p.late}</li>
        </ul>
      </Box>
      <RequestForm app={app} />
      <MyRequests app={app} />
    </Stack>
  );
}

function WindowBooking({ app, w }: { app: AppCtx; w: BookingWindow }) {
  const { s } = useRos();
  const { f, c } = app;
  const sub = submissionOf(w, f.id);
  const savedKey = JSON.stringify(planFor(w, f.id, c));
  const [plan, setPlan] = useState<DayPlan[]>(() => JSON.parse(savedKey) as DayPlan[]);
  useEffect(() => { setPlan(JSON.parse(savedKey) as DayPlan[]); }, [savedKey]);
  const dirty = JSON.stringify(plan) !== savedKey;
  const price = priceWeek(c, plan);
  const mins = minsUntil(w.closes);
  const closed = mins <= 0;
  const route = c.routeId ? idx().route.get(c.routeId) : undefined;
  const pickup = route?.stops.find(st => st.schoolId === c.schoolId)?.time;
  const canCollect = c.consents.transport && !!route;
  const set = (i: number, patch: Partial<DayPlan>) => setPlan(p => p.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const aw = price.award;
  return (
    <>
      <Box>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Small>Booking window</Small>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-.4px", marginTop: 2 }}>{w.label}</div>
          </div>
          <Badge tone={closed ? "neutral" : "ok"}>{closed ? "Closed" : "Open"}</Badge>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13.5 }}>
          <Ico d={PATH.clock} size={17} /><span>Closes {fmtAt(w.closes)} · <b>{countdown(mins)} left</b></span>
        </div>
        <Small style={{ marginTop: 6 }}>{sub ? "Submitted " + fmtAt(submittedAt(w, f.id) || sub.submittedAt) + " · " + sub.sessions + " sessions, " + sub.hours + "h. You can change it until the window closes." : "Not submitted yet."}</Small>
      </Box>
      <Box pad={10}>
        {plan.map((d, i) => (
          <div key={d.date} style={{ padding: "2px 6px", borderTop: i ? "1px solid var(--border)" : "none" }}>
            <Switch on={d.on} disabled={closed} onChange={() => set(i, { on: !d.on })} label={dowLong(d.date) + " " + fmtDate(d.date)}
              sub={d.on ? "After School " + price.start + " to " + d.end + " · " + hoursBetween(price.start, d.end) + "h" : "Not booked"} />
            {d.on && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 8 }}>
                <Field label="Collect at">
                  <select className="ros-input" value={d.end} disabled={closed} onChange={(e) => set(i, { end: e.target.value })}>
                    {END_TIMES.map(t => <option key={t} value={t}>{t} ({hoursBetween(price.start, t)}h)</option>)}
                  </select>
                </Field>
                <Switch on={d.collect && canCollect} disabled={!canCollect || closed} onChange={() => set(i, { collect: !d.collect })} label="School collection"
                  sub={canCollect && route ? schoolName(c.schoolId) + " · " + route.id + " pickup " + pickup + " · " + euro(s.config.transportFee) : "Transport consent is off. You can ask to change it in Docs."} />
              </div>
            )}
          </div>
        ))}
      </Box>
      <Box>
        <H right={<DemoTag>Demo fee rules</DemoTag>}>Price preview</H>
        {price.lines.map(l => <Line key={l.label} label={l.label} value={euro(l.amount)} tone={l.kind === "subsidy" ? "var(--pa-link)" : undefined} />)}
        {!price.lines.length && <Small>No sessions picked.</Small>}
        <div style={{ borderTop: "1px solid var(--border-strong)", marginTop: 6, paddingTop: 4 }}><Line strong label="Estimated for the week" value={euro(price.total)} /></div>
        {aw && (
          <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 14, background: price.hours < aw.agreedHours ? "var(--warn-soft)" : "var(--surface-2)", fontSize: 12.5, lineHeight: 1.5, color: "var(--body)" }}>
            {price.hours < aw.agreedHours
              ? "You've picked " + price.hours + " of your " + aw.agreedHours + " agreed NCS hours. Booking your full agreed hours keeps your subsidy in line with your award."
              : price.hours > aw.agreedHours
                ? (price.hours - aw.agreedHours) + "h above your " + aw.agreedHours + " agreed NCS hours are charged privately."
                : "All " + aw.agreedHours + " agreed NCS hours are used, so every hour gets the subsidy."}
          </div>
        )}
        <Small style={{ marginTop: 10 }}>{euro(price.rate)} an hour at {app.place}, {euro(s.config.transportFee)} per school collection. {policies().partHours} The NCS subsidy is its own line.</Small>
      </Box>
      <PBtn kind="sun" full disabled={closed || (!dirty && !!sub) || (!sub && price.sessions === 0)} onClick={() => submitWindow({ windowId: w.id, familyId: f.id, childId: c.id, plan })}>
        {closed ? "Window closed" : sub ? (dirty ? "Update submission" : "Submitted, no changes") : "Submit booking"}
      </PBtn>
      {dirty && <PBtn kind="quiet" full onClick={() => setPlan(JSON.parse(savedKey) as DayPlan[])}>Undo my changes</PBtn>}
    </>
  );
}

function RequestForm({ app }: { app: AppCtx }) {
  const { s } = useRos();
  const { f, c } = app;
  const lw = lockedWeek();
  const mine = (idx().bookingsByChild.get(c.id) || []).filter(b => b.session === "After School");
  const days = THIS_WEEK.filter(d => d > TODAY);
  const [kind, setKind] = useState<BookingRequest["kind"]>("Late booking");
  const [dateSel, setDate] = useState<string>("");
  const [endSel, setEnd] = useState<HHMM>("18:00");
  const [collect, setCollect] = useState(true);
  const [note, setNote] = useState("");
  const options = days.filter(d => (kind === "Late booking" ? !mine.some(b => b.date === d) : mine.some(b => b.date === d)));
  const day = options.includes(dateSel) ? dateSel : options[0] || "";
  const existing = mine.find(b => b.date === day);
  const start = existing?.start || sacStart(s, c);
  const ends = END_TIMES.filter(t => toMin(t) > toMin(start) && (kind !== "Change" || t !== existing?.end));
  const end = ends.includes(endSel) ? endSel : ends[ends.length - 1];
  const route = c.routeId ? idx().route.get(c.routeId) : undefined;
  const canCollect = c.consents.transport && !!route;
  const notice = day ? noticeHoursUntil(day, start) : 0;
  const noticeOk = notice >= s.config.noticeHours;
  const dup = s.requests.some(r => r.familyId === f.id && r.childId === c.id && r.date === day && r.kind === kind && r.status === "Pending");
  const fees = kind === "Late booking" && day ? lateFees(s, c, hoursBetween(start, end), collect && canCollect) : [];
  const rate = locById(c.locationId)?.hourlyRate || 15;
  const diff = kind === "Change" && existing ? hoursBetween(start, end) - existing.hours : 0;
  const weekendNow = dow(TODAY) === "Sat" || dow(TODAY) === "Sun";
  const can = !!day && !!end && noticeOk && !dup;
  const send = () => {
    requestChange({ familyId: f.id, childId: c.id, kind, date: day, end, collect: collect && canCollect, note });
    setNote("");
  };
  return (
    <Box>
      <H sub={(lw ? lw.label : "This week") + " is locked. Requests go to the " + app.place + " team and need staff approval."}>Late booking or change</H>
      <Seg<BookingRequest["kind"]> label="Request type" value={kind} onChange={setKind} options={[["Late booking", "Add a day"], ["Change", "Change time"], ["Cancellation", "Cancel"]]} />
      {!options.length ? (
        <Small style={{ marginTop: 12 }}>{kind === "Late booking" ? "Every day left this week is already booked." : "There are no booked sessions left this week to " + (kind === "Change" ? "change" : "cancel") + "."}</Small>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
          <Field label="Day">
            <select className="ros-input" value={day} onChange={(e) => setDate(e.target.value)}>
              {options.map(d => { const b = mine.find(x => x.date === d); return <option key={d} value={d}>{fmtDay(d)}{b ? " · booked " + b.start + " to " + b.end : ""}</option>; })}
            </select>
          </Field>
          {kind !== "Cancellation" && (
            <Field label="Collect at" hint={"Starts " + start + (existing ? ", as booked" : " after school")}>
              <select className="ros-input" value={end} onChange={(e) => setEnd(e.target.value)}>
                {ends.map(t => <option key={t} value={t}>{t} ({hoursBetween(start, t)}h)</option>)}
              </select>
            </Field>
          )}
          {kind === "Late booking" && (
            <Switch on={collect && canCollect} disabled={!canCollect} onChange={() => setCollect(v => !v)} label="School collection"
              sub={canCollect && route ? schoolName(c.schoolId) + " · " + route.id + " · " + euro(s.config.transportFee) : "Transport consent is off."} />
          )}
          <Field label="Note for the team (optional)">
            <textarea className="ros-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} style={{ fontSize: 14, borderRadius: 14 }} />
          </Field>
          <div style={{ padding: "10px 12px", borderRadius: 14, background: "var(--surface-2)" }}>
            {kind === "Late booking" && <>
              {fees.map(x => <Line key={x.label} label={x.label} value={euro(x.amount)} />)}
              <div style={{ borderTop: "1px solid var(--border-strong)", marginTop: 4 }}><Line strong label="If approved" value={euro(sum(fees))} /></div>
              <Small>Added to your invoice for w/c {fmtDate(THIS_WEEK[0])} once staff approve it.</Small>
            </>}
            {kind === "Change" && existing && (
              <Small>{diff > 0 ? "Adds " + diff + "h, about " + euro(diff * rate) + " more. " : diff < 0 ? "Shorter by " + -diff + "h. " : "Same number of hours. "}Staff confirm any price change when they approve it.</Small>
            )}
            {kind === "Cancellation" && <Small>{lw ? lw.label : "This week"} is locked, so a cancelled session isn't refunded. Telling us still helps the team plan staff and the bus.</Small>}
          </div>
          {!noticeOk && <div role="alert" style={{ fontSize: 12.5, padding: "9px 12px", borderRadius: 12, background: "var(--warn-soft)", color: "var(--ink)" }}>Less than {s.config.noticeHours} hours' notice for {fmtDay(day)}. Please message the team instead.</div>}
          {dup && <div role="status" style={{ fontSize: 12.5, padding: "9px 12px", borderRadius: 12, background: "var(--surface-2)" }}>You already have a request for this day waiting for the team.</div>}
          {weekendNow && <Small>{policies().weekend}</Small>}
          <PBtn kind="sun" full disabled={!can} onClick={send}>Send request</PBtn>
          <Small style={{ textAlign: "center" }}>Needs staff approval · nothing is booked or charged until then · demo, simulated</Small>
        </div>
      )}
    </Box>
  );
}

function MyRequests({ app }: { app: AppCtx }) {
  const { s } = useRos();
  const reqs = s.requests.filter(r => r.familyId === app.f.id).sort((a, b) => b.received.localeCompare(a.received));
  return (
    <Box pad={10}>
      <div style={{ padding: "6px 6px 0" }}><H>Your requests</H></div>
      {!reqs.length && <Small style={{ padding: "0 6px 6px" }}>No requests yet.</Small>}
      {reqs.map(r => (
        <Row key={r.id} title={r.kind + " · " + fmtDay(r.date)}
          sub={r.start + " to " + r.end + " · " + r.id + (r.fees.length ? " · " + euro(sum(r.fees)) : "") + (r.decidedBy ? " · " + r.status.toLowerCase() + " by " + r.decidedBy : " · sent " + fmtAt(r.received) + " · needs staff approval")}
          right={<StatusBadge s={r.status} />} />
      ))}
    </Box>
  );
}

/* ---------------- Payments ---------------- */
function payFlow(invoiceId: string, method: string) {
  const inv = getState().invoices.find(i => i.id === invoiceId);
  if (!inv) return;
  const bal = invoiceBalance(inv);
  confirmThen({
    title: "Pay " + inv.id + " now?", confirmLabel: "Pay " + euro(bal),
    body: euro(bal) + " by " + method + ". Demo: this is simulated, no card is charged and nothing leaves the browser.",
    run: () => payNow({ invoiceId: inv.id, method }),
  });
}

function PaymentsTab({ app }: { app: AppCtx }) {
  const { s } = useRos();
  const { f, c } = app;
  const due = familyDue(f.id);
  const invs = familyInvoices(f.id);
  const unpaid = invs.filter(i => invoiceBalance(i) > 0);
  const pays = familyPayments(f.id);
  const nx = nextInvoice(f.id);
  const aw = idx().awardByChild.get(c.id);
  const claims = s.claims.filter(cl => cl.familyId === f.id).sort((a, b) => b.raised.localeCompare(a.raised));
  const weekH = (idx().bookingsByChild.get(c.id) || []).filter(b => THIS_WEEK.includes(b.date)).reduce((n, b) => n + b.hours, 0);
  const methods: [string, string][] = [
    [methodLabel(f.id), f.method === "Card on file" ? "On file · used for weekly invoices (demo card)" : "Your current method"],
    ["Apple Pay", "Simulated, not connected"], ["Google Pay", "Simulated, not connected"], ["SEPA direct debit", "Simulated, not connected"],
  ];
  return (
    <Stack>
      <PageTitle title="Payments" sub="Invoices, receipts and how you pay" />
      <Box>
        <Small>Balance due</Small>
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-1px", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{euro(due)}</div>
        {unpaid.length ? (
          <Stack gap={8}>
            {unpaid.map(i => (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{i.id}</div><Small>{euro(invoiceBalance(i))} · w/c {fmtDate(i.weekOf)}</Small></div>
                <PBtn kind="sun" onClick={() => payFlow(i.id, app.method)}>Pay now</PBtn>
              </div>
            ))}
          </Stack>
        ) : (
          <Small style={{ marginTop: 4 }}>You're all paid up.{nx && nx.submitted ? " Next: " + nx.label + ", about " + euro(nx.estimate) + ", issued " + fmtDay(nx.issued) + " and paid by " + (f.method === "Card on file" ? "your card on file" : f.method) + "." : ""}</Small>
        )}
      </Box>
      <Box pad={10}>
        <div style={{ padding: "6px 6px 0" }}><H>Invoices</H></div>
        {invs.map(i => (
          <Row key={i.id} onClick={() => app.open({ kind: "invoice", id: i.id })} title={i.id} sub={"w/c " + fmtDate(i.weekOf) + " · issued " + fmtDate(i.issued)}
            right={<><span style={{ fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>{euro(invoiceTotal(i))}</span><StatusBadge s={invoiceStatus(i)} /></>} />
        ))}
      </Box>
      <Box>
        <H right={<DemoTag>Not connected</DemoTag>} sub="Used for Pay now. Nothing is charged in this demo.">Pay with</H>
        <div role="radiogroup" aria-label="Payment method" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {methods.map(([m, sub]) => {
            const on = app.method === m;
            return (
              <button key={m} type="button" role="radio" aria-checked={on} onClick={() => app.setMethod(m)} className="myros-focus myros-press"
                style={{ minHeight: 56, display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 16, border: "1px solid " + (on ? NAVY : "var(--border)"), background: on ? "var(--surface-2)" : "none", color: "var(--ink)", fontFamily: "inherit", textAlign: "left", cursor: "pointer" }}>
                <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 10, flex: "none", border: "2px solid " + (on ? NAVY : "var(--border-strong)"), background: on ? SUN : "none", boxShadow: on ? "inset 0 0 0 3px " + NAVY : "none" }} />
                <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>{m}</span><span style={{ display: "block", fontSize: 12.5, color: "var(--dim)" }}>{sub}</span></span>
              </button>
            );
          })}
        </div>
      </Box>
      {aw && (
        <Box>
          <H sub={"CHICK " + aw.chick + " · runs until " + fmtDateY(aw.expires)}>NCS subsidy for {c.firstName}</H>
          <Line label="Award type" value={aw.type} />
          <Line label="Hourly subsidy" value={euro(aw.rate)} />
          <Line label="Agreed hours a week" value={aw.agreedHours + "h"} />
          <Line label="This week" value={Math.min(weekH, aw.agreedHours) + " of " + weekH + "h subsidised"} />
          <div style={{ marginTop: 8 }}>
            {claims.length ? claims.map(cl => <Row key={cl.id} title={"Claim " + cl.id + " · " + euro(cl.amount)} sub={cl.period + (cl.status === "Awaiting acceptance" ? " · accept on the NCS portal by " + cl.deadline.slice(11) + " " + fmtDay(cl.deadline.slice(0, 10)) : "")} right={<StatusBadge s={cl.status} />} />)
              : <Small>No NCS claims waiting for you to accept.</Small>}
          </div>
        </Box>
      )}
      <Box pad={10}>
        <div style={{ padding: "6px 6px 0" }}><H>Receipts</H></div>
        {!pays.length && <Small style={{ padding: "0 6px 6px" }}>No payments yet.</Small>}
        {pays.map(p => <Row key={p.id} onClick={() => app.open({ kind: "receipt", id: p.id })} title={euro(p.amount) + " · " + fmtDate(p.date)} sub={p.method + (p.invoiceId ? " · " + p.invoiceId : "")} right={<StatusBadge s={p.status} />} />)}
      </Box>
    </Stack>
  );
}

/* ---------------- Child Updates ---------------- */
const GRADS = [
  "linear-gradient(140deg,#FFF9B0 0%,#FFE600 55%,#F5A524 100%)",
  "linear-gradient(140deg,#d6e8f8 0%,#6fa9e0 58%,#1B75BB 100%)",
  "linear-gradient(140deg,#e7f1d8 0%,#8DB35E 58%,#53948D 100%)",
];
function UpdatesTab({ app }: { app: AppCtx }) {
  const { s } = useRos();
  const { f, c } = app;
  const j = journey(c.id);
  const notes = activityNotes(c.id);
  const shared = notes.filter(n => n.shared);
  const inc = s.incidents.filter(i => f.childIds.includes(i.childId)).sort((a, b) => b.date.localeCompare(a.date));
  const toSign = inc.filter(i => !i.parentSigned && i.status === "Awaiting signature");
  const done = inc.filter(i => !toSign.includes(i));
  const mine = (idx().bookingsByChild.get(c.id) || []).filter(b => b.session === "After School");
  return (
    <Stack>
      <PageTitle title={c.firstName + "'s updates"} sub={dowLong(TODAY) + " " + fmtDate(TODAY) + " · " + j.place} />
      <Box>
        <H right={j.live ? <Badge tone="brand" dot>Live</Badge> : <Badge tone={statusTone(j.status)}>{j.status}</Badge>} sub={j.detail}>Today's journey</H>
        {j.steps.length ? (
          <ol aria-label="Journey steps" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {j.steps.map((st, i) => (
              <li key={st.key} style={{ display: "flex", gap: 12 }}>
                <div style={{ width: 22, flex: "none", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ width: 22, height: 22, borderRadius: 11, border: "2px solid " + (st.done ? NAVY : "var(--border-strong)"), background: st.done ? SUN : "none", color: NAVY, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{st.done && <Ico d={PATH.check} size={12} sw={3} />}</span>
                  {i < j.steps.length - 1 && <span style={{ flex: 1, width: 2, minHeight: 18, background: j.steps[i + 1].done ? "var(--ink)" : "var(--border)", margin: "3px 0" }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingBottom: 14 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: st.done ? 600 : 500, color: st.done ? "var(--ink)" : "var(--dim)" }}>{st.label}</span>
                    <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", color: st.done ? "var(--ink)" : "var(--dim)" }}>{st.time || ""}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 2 }}>{st.detail}</div>
                </div>
              </li>
            ))}
          </ol>
        ) : <Small>No after-school session today.</Small>}
      </Box>
      <Box>
        <H right={<DemoTag>Demo notes</DemoTag>} sub="School age: short notes from the team, not a learning journal.">Today at {j.place}</H>
        {!notes.length && <Small>No session today, so no notes.</Small>}
        <Stack gap={8}>
          {notes.map(n => (
            <div key={n.time} style={{ display: "flex", gap: 12, padding: "10px 12px", borderRadius: 16, background: n.shared ? "var(--surface-2)" : "none", border: n.shared ? "1px solid transparent" : "1px dashed var(--border-strong)" }}>
              <span style={{ width: 44, flex: "none", fontSize: 13, fontVariantNumeric: "tabular-nums", color: n.shared ? "var(--ink)" : "var(--dim)" }}>{n.time}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: n.shared ? "var(--ink)" : "var(--dim)" }}>{n.title}</div>
                <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 2, lineHeight: 1.45 }}>{n.shared ? n.detail : "Planned for this afternoon"}</div>
              </div>
            </div>
          ))}
        </Stack>
      </Box>
      <Box>
        <H sub="Placeholders only: no real photos in this demo.">Photos</H>
        {!c.consents.photos ? <Small>Photo consent is off for {c.firstName}, so no photos are shared.</Small>
          : !shared.length ? <Small>Photos from today will appear here once the team shares them.</Small>
          : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {shared.map((n, i) => (
                <figure key={n.time} style={{ margin: 0, gridColumn: shared.length === 3 && i === 0 ? "span 2" : undefined }}>
                  <div role="img" aria-label={"Photo placeholder: " + n.title} style={{ aspectRatio: shared.length === 3 && i === 0 ? "16 / 9" : "4 / 3", borderRadius: 18, background: GRADS[i % GRADS.length], display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(6,0,104,.35)" }}>
                    <Ico d={PATH.sun} size={34} sw={1.6} />
                  </div>
                  <figcaption style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 6 }}>{n.title} · {n.time}</figcaption>
                </figure>
              ))}
            </div>
          )}
      </Box>
      <Box pad={10}>
        <div style={{ padding: "6px 6px 0" }}><H>This week</H></div>
        {THIS_WEEK.map(d => {
          const b = mine.find(x => x.date === d);
          const ev = (idx().attendanceByChildDate.get(c.id + "|" + d) || []).filter(e => e.time >= "12:00");
          const inn = ev.find(e => e.kind === "in"), out = ev.find(e => e.kind === "out");
          const sub = !b ? "Not booked" : d > TODAY ? "Booked " + b.start + " to " + b.end : inn ? "In " + inn.time + (out ? " · out " + out.time + (out.collector ? " with " + firstName(out.collector) : "") : "") : d === TODAY ? j.short : "Booked " + b.start + " to " + b.end;
          return <Row key={d} title={fmtDay(d)} sub={sub} right={d < TODAY && inn ? <Badge tone="ok">Attended</Badge> : d === TODAY && b ? <Badge tone="brand">Today</Badge> : undefined} />;
        })}
      </Box>
      <Box>
        <H>Incident reports</H>
        {!toSign.length && <Small>Nothing to sign.</Small>}
        <Stack gap={10}>
          {toSign.map(i => (
            <div key={i.id} style={{ padding: 12, borderRadius: 16, background: "var(--warn-soft)" }}>
              <div style={{ fontSize: 14, fontWeight: 650 }}>{i.kind}</div>
              <Small>{fmtDay(i.date)} {i.time} · {i.id} · {i.managerReviewed ? "Reviewed by the manager" : "Manager review pending"}</Small>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 8, color: "var(--body)" }}>{i.summary}</div>
              <div style={{ marginTop: 10 }}>
                <PBtn kind="sun" full onClick={() => confirmThen({ title: "Sign " + i.id + "?", body: "You confirm you've read this report about " + c.firstName + ". Demo: your signature is recorded in the demo only.", confirmLabel: "Sign report", run: () => signIncident({ incidentId: i.id, familyId: f.id }) })}>I've read this, sign</PBtn>
              </div>
            </div>
          ))}
        </Stack>
        {done.length > 0 && <div style={{ marginTop: 8 }}>{done.map(i => <Row key={i.id} title={i.kind} sub={fmtDay(i.date) + " · " + i.id} right={<StatusBadge s={i.parentSigned ? "Signed" : i.status} />} />)}</div>}
      </Box>
    </Stack>
  );
}

/* ---------------- Messages ---------------- */
function MessagesTab({ app }: { app: AppCtx }) {
  return (
    <Stack>
      <PageTitle title="Messages" sub={"The " + app.place + " team, Sunny and your updates"} />
      <Seg<MsgView> label="Message views" value={app.view} onChange={app.setView} options={[["team", "Team"], ["sunny", "Ask Sunny"], ["updates", "Updates"]]} />
      {app.view === "team" ? <TeamThread app={app} /> : app.view === "sunny" ? <SunnyChat app={app} /> : <UpdatesFeed app={app} />}
    </Stack>
  );
}

function Bubble({ mine, children, meta, at }: { mine: boolean; children: ReactNode; meta?: ReactNode; at?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
      <div style={{ maxWidth: "86%" }}>
        <div style={{ padding: "10px 13px", borderRadius: mine ? "18px 18px 6px 18px" : "18px 18px 18px 6px", background: mine ? SUN : "var(--surface-2)", color: mine ? NAVY : "var(--ink)", border: mine ? "none" : "1px solid var(--border)", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{children}</div>
        {(meta || at) && <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 4, textAlign: mine ? "right" : "left" }}>{[meta, at].filter(Boolean).map((x, i) => <span key={i}>{i ? " · " : ""}{x}</span>)}</div>}
      </div>
    </div>
  );
}

function TeamThread({ app }: { app: AppCtx }) {
  const { s } = useRos();
  const { f } = app;
  const msgs: Message[] = s.messages.filter(m => m.familyId === f.id && (m.direction === "in" || m.status === "Closed"));
  const items: { key: string; mine: boolean; text: string; at: string; meta?: string }[] = [];
  for (const m of msgs) {
    if (m.direction === "out") { items.push({ key: m.id, mine: false, text: clean(m.draft || m.body), at: m.received, meta: m.from }); continue; }
    const req = m.link?.kind === "request" ? s.requests.find(r => r.id === m.link!.id) : undefined;
    const sunnyCase = m.classification.startsWith("Sunny case");
    items.push({ key: m.id, mine: true, text: m.body, at: m.received, meta: sunnyCase ? "Passed on by Sunny · with " + (s.tasks.find(t => t.link?.kind === "message" && t.link.id === m.id)?.owner || "the team") : m.status === "Replied" ? "Answered" : m.status === "Escalated" ? "With a manager" : "Delivered" });
    if (m.status === "Replied" && m.draft) {
      const at = s.comms.find(x => x.familyId === f.id && x.direction === "out" && x.summary.startsWith("Reply: " + m.subject))?.at || m.received;
      items.push({ key: m.id + "-r", mine: false, text: clean(m.draft), at, meta: app.place + " team" });
    }
    if (req && req.status !== "Pending" && req.decidedAt) {
      const total = sum(req.fees);
      items.push({ key: m.id + "-d", mine: false, at: req.decidedAt, meta: req.decidedBy || app.place + " team",
        text: req.status === "Approved"
          ? "Approved: " + req.kind.toLowerCase() + " for " + fmtDay(req.date) + ", " + req.start + " to " + req.end + "." + (total ? " " + euro(total) + " added to your invoice." : "")
          : "Sorry, we couldn't approve this " + req.kind.toLowerCase() + " for " + fmtDay(req.date) + ". Nothing has changed on your account." });
    }
  }
  items.sort((a, b) => a.at.localeCompare(b.at));
  const endRef = useRef<HTMLDivElement>(null);
  const seen = useRef(items.length);
  useEffect(() => { if (items.length > seen.current) endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); seen.current = items.length; }, [items.length]);
  const cls = app.draft.trim() ? classify(app.draft) : undefined;
  const submit = () => { if (!app.draft.trim()) return; sendParentMessage({ familyId: f.id, body: app.draft }); app.setDraft(""); };
  return (
    <Stack gap={12}>
      {!items.length && <Small>No messages yet. Say hello to the {app.place} team.</Small>}
      {items.map(it => <Bubble key={it.key} mine={it.mine} meta={it.meta} at={rel(it.at)}>{it.text}</Bubble>)}
      <div ref={endRef} />
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 20, background: "var(--surface)", border: "1px solid var(--border)" }}>
        <label htmlFor="myros-compose" style={{ fontSize: 12.5, color: "var(--dim)", fontWeight: 550 }}>Message the {app.place} team</label>
        <textarea id="myros-compose" className="ros-input" rows={3} value={app.draft} onChange={(e) => app.setDraft(e.target.value)} placeholder="Write your message" style={{ fontSize: 14, borderRadius: 14 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Small style={{ flex: 1 }}>{cls ? "Filed as: " + cls.label : "A person reads every message."} Demo, nothing is sent.</Small>
          <PBtn kind="sun" type="submit" disabled={!app.draft.trim()}><Ico d={PATH.send} size={17} />Send</PBtn>
        </div>
      </form>
    </Stack>
  );
}

function SunnyChat({ app }: { app: AppCtx }) {
  const [q, setQ] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const seen = useRef(app.chat.length);
  useEffect(() => { if (app.chat.length > seen.current) endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); seen.current = app.chat.length; }, [app.chat.length]);
  const follow = (g: NonNullable<SunnyReply["go"]>) => {
    if (g.prefill !== undefined) { app.compose(g.prefill); return; }
    if (g.view) app.setView(g.view);
    app.go(g.tab);
  };
  const intro = "Hi " + firstName(guardian(app.f)?.name) + ", I'm Sunny. I answer from your family's own records: " + app.c.firstName + "'s day and bus, bookings, invoices, NCS hours and our policies.";
  return (
    <Stack gap={12}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <SunnyAvatar size={30} />
        <Bubble mine={false}>{intro}</Bubble>
      </div>
      {app.chat.map(m => m.who === "me" ? <Bubble key={m.id} mine at={m.at}>{m.text}</Bubble> : (
        <div key={m.id} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <SunnyAvatar size={30} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Bubble mine={false} at={m.at} meta="Sunny">
              {m.text}
              {m.reply?.facts && m.reply.facts.length > 0 && (
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: "var(--body)" }}>{m.reply.facts.map((x, i) => <li key={i}>{x}</li>)}</ul>
              )}
              {m.reply?.sensitive && (
                <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 12, background: "var(--warn-soft)", fontSize: 12.5, color: "var(--ink)" }}>
                  Case {m.caseId || "opened"} for {m.reply.owner} · {m.reply.sensitive}. Sunny does not answer this topic itself.
                </div>
              )}
            </Bubble>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {m.reply?.go && <PBtn small kind="quiet" onClick={() => follow(m.reply!.go!)}>{m.reply.go.label}</PBtn>}
              {m.reply?.chips?.map(x => <Chip key={x} onClick={() => app.ask(x)}>{x}</Chip>)}
            </div>
          </div>
        </div>
      ))}
      {!app.chat.length && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SUNNY_STARTERS.map(x => { const qq = x.replace("Luca", app.c.firstName); return <Chip key={x} onClick={() => app.ask(qq)}>{qq}</Chip>; })}
        </div>
      )}
      <div ref={endRef} />
      <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) { app.ask(q); setQ(""); } }} style={{ display: "flex", gap: 8 }}>
        <label htmlFor="myros-sunny" className="myros-sr">Ask Sunny</label>
        <input id="myros-sunny" className="ros-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask Sunny" style={{ height: 46, borderRadius: 999, fontSize: 14, paddingLeft: 16 }} />
        <PBtn kind="sun" type="submit" ariaLabel="Send to Sunny" disabled={!q.trim()}><Ico d={PATH.send} size={18} /></PBtn>
      </form>
      <Small>Sunny only sees your family. Medical, safeguarding, complaints and billing disputes always go to a person.</Small>
    </Stack>
  );
}

function UpdatesFeed({ app }: { app: AppCtx }) {
  const { s } = useRos();
  const feed = s.comms.filter(x => x.familyId === app.f.id && x.direction !== "note").sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Box pad={10}>
      {!feed.length && <Small style={{ padding: 6 }}>No updates yet.</Small>}
      {feed.map(x => (
        <Row key={x.id} title={clean(x.summary)} sub={rel(x.at) + " · " + (x.direction === "in" ? "You · " : "Ray of Sunshine · ") + x.channel}
          lead={<span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 12, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", background: x.direction === "in" ? "var(--surface-2)" : SUN, color: x.direction === "in" ? "var(--dim)" : NAVY }}><Ico d={x.direction === "in" ? PATH.send : PATH.bell} size={16} /></span>} />
      ))}
    </Box>
  );
}

/* ---------------- Documents ---------------- */
const DOCS = ["registration", "terms", "ncs", "medical", "collectors"] as const;
function DocsTab({ app }: { app: AppCtx }) {
  const { s } = useRos();
  const { f, c } = app;
  const aw = idx().awardByChild.get(c.id);
  const ok = c.collectors.filter(x => x.permitted);
  const meta: Record<(typeof DOCS)[number], { title: string; sub: string; badge: string }> = {
    registration: { title: "Registration form 2026/27", sub: c.firstName + " · " + app.place + " After School", badge: f.consentsComplete ? "Complete" : "Action needed" },
    terms: { title: "Fees and payment terms 2026/27", sub: "Signed by " + (guardian(f)?.name || "parent"), badge: "Signed" },
    ncs: { title: "NCS award letter", sub: aw ? aw.type + " · CHICK " + aw.chick : "No award on file", badge: aw ? aw.status : "None" },
    medical: { title: "Medical and care form", sub: c.medical.length ? c.medical.map(m => m.kind).join(", ") : "No conditions recorded", badge: "Up to date" },
    collectors: { title: "Authorised collectors", sub: ok.map(x => firstName(x.name)).join(", "), badge: ok.length + " people" },
  };
  const pending = (k: ConsentKey) => s.messages.some(m => m.familyId === f.id && m.subject === consentSubject(k, c) && (m.status === "New" || m.status === "Escalated" || m.status === "Drafted"));
  return (
    <Stack>
      <PageTitle title="Documents" sub={"Forms and consents for " + c.firstName} />
      <Box pad={10}>
        <div style={{ padding: "6px 6px 0" }}><H right={<DemoTag>Demo documents</DemoTag>}>Your documents</H></div>
        {DOCS.map(k => (
          <Row key={k} onClick={() => app.open({ kind: k === "medical" ? "medical" : "doc", id: k })} title={meta[k].title} sub={meta[k].sub}
            lead={<span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 12, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--surface-2)", color: "var(--ink)" }}><Ico d={PATH.docs} size={17} /></span>}
            right={<StatusBadge s={meta[k].badge} />} />
        ))}
      </Box>
      <Box>
        <H sub="Changes go to the team first. Nothing changes until they confirm.">Consents for {c.firstName}</H>
        {(Object.keys(CONSENT_LABEL) as ConsentKey[]).map(k => {
          const on = c.consents[k], wait = pending(k);
          return (
            <Switch key={k} on={on} disabled={wait} label={CONSENT_LABEL[k]}
              sub={wait ? "Change requested · waiting for the team" : on ? "Given" : "Not given"}
              onChange={() => confirmThen({
                title: "Ask to " + (on ? "withdraw" : "give") + " " + CONSENT_LABEL[k].toLowerCase() + " consent?",
                body: "This sends a request to the " + app.place + " team. " + c.firstName + "'s consent stays as it is until they confirm the change with you.",
                confirmLabel: "Send request", run: () => requestConsentChange({ familyId: f.id, childId: c.id, consent: k, to: !on }),
              })} />
          );
        })}
      </Box>
    </Stack>
  );
}

/* ---------------- sheets ---------------- */
function SheetView({ sheet, app, onClose }: { sheet: SheetRef; app: AppCtx; onClose: () => void }) {
  const { s } = useRos();
  const closeRef = useRef<HTMLButtonElement>(null);
  const closer = useRef(onClose);
  closer.current = onClose;
  useEffect(() => {
    closeRef.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") closer.current(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const { f, c } = app;
  let title = "";
  let content: ReactNode = null;
  if (sheet.kind === "invoice") {
    const inv = s.invoices.find(i => i.id === sheet.id && i.familyId === f.id);
    title = "Invoice " + sheet.id;
    content = inv ? (
      <Stack gap={12}>
        <InvoicePanel id={inv.id} />
        {invoiceBalance(inv) > 0 && <PBtn kind="sun" full onClick={() => payFlow(inv.id, app.method)}>Pay {euro(invoiceBalance(inv))} with {app.method}</PBtn>}
        <Small>Demo invoice. Amounts follow the demo fee rules, not quoted fees.</Small>
      </Stack>
    ) : <Small>Invoice not found.</Small>;
  } else if (sheet.kind === "receipt") {
    const p = s.payments.find(x => x.id === sheet.id && x.familyId === f.id);
    title = "Receipt";
    content = p ? (
      <Box>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}><BrandMark size={34} /><div style={{ flex: 1 }}><div style={{ fontWeight: 650 }}>Ray of Sunshine</div><Small>Payment receipt · demo</Small></div><StatusBadge s={p.status} /></div>
        <Line strong label="Amount" value={euro(p.amount)} />
        <Line label="Date" value={fmtDateY(p.date)} />
        <Line label="Method" value={p.method} />
        {p.invoiceId && <Line label="Invoice" value={p.invoiceId} />}
        <Line label="Reference" value={p.ref} />
        <Line label="Paid by" value={guardian(f)?.name || f.surname + " family"} />
        <Small style={{ marginTop: 8 }}>Demo receipt. No real payment was taken.</Small>
      </Box>
    ) : <Small>Receipt not found.</Small>;
  } else if (sheet.kind === "medical") {
    title = "Medical and care form";
    content = <MedicalSheet app={app} onDone={onClose} />;
  } else {
    const aw = idx().awardByChild.get(c.id);
    const cfg = s.config;
    const l = locById(c.locationId);
    if (sheet.id === "registration") {
      title = "Registration form 2026/27";
      content = (
        <Box>
          <Line label="Child" value={c.firstName + " " + c.surname} />
          <Line label="Date of birth" value={fmtDateY(c.dob)} />
          <Line label="School" value={schoolName(c.schoolId) + (c.schoolClass ? ", " + c.schoolClass : "")} />
          <Line label="Service" value={(l?.short || "") + " After School"} />
          <Line label="Started" value={fmtDateY(c.started)} />
          {f.guardians.map(g => <Line key={g.name} label={g.relation} value={g.name} />)}
          <Line label="Parent ID" value={f.id} />
          <Line label="Status" value={f.consentsComplete ? "Complete" : "Action needed"} />
          <Small style={{ marginTop: 8 }}>Demo document. To change details, message the team.</Small>
        </Box>
      );
    } else if (sheet.id === "terms") {
      title = "Fees and payment terms 2026/27";
      content = (
        <Box>
          <Line label="After School" value={euro(l?.hourlyRate || 15) + " an hour"} />
          <Line label="School collection" value={euro(cfg.transportFee) + " a run"} />
          <Line label="Late booking fee" value={euro(cfg.lateFee)} />
          <Line label="Invoices" value="Weekly, in advance" />
          <Line label="Your payment method" value={methodLabel(f.id)} />
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: "var(--body)" }}>
            <li>{policies().partHours}</li><li>{policies().notice}</li><li>{policies().weekend}</li><li>{policies().locked}</li>
            <li>Leaving needs {cfg.leavingNoticeMonths} months' notice, and {cfg.ncsLeaveNoticeWeeks} weeks for NCS.</li>
          </ul>
          <div style={{ marginTop: 12 }}><Badge tone="ok">Signed by {guardian(f)?.name}</Badge></div>
          <Small style={{ marginTop: 8 }}>Demo document. Amounts are illustrative, not quoted fees.</Small>
        </Box>
      );
    } else if (sheet.id === "ncs") {
      title = "NCS award letter";
      content = aw ? (
        <Box>
          <Line label="Child" value={c.firstName + " " + c.surname} />
          <Line label="CHICK" value={aw.chick} />
          <Line label="Award type" value={aw.type} />
          <Line label="Hourly subsidy" value={euro(aw.rate)} />
          <Line label="Agreed hours a week" value={aw.agreedHours + "h"} />
          <Line label="Valid until" value={fmtDateY(aw.expires)} />
          <Line label="Next hours change from" value={fmtDateY(aw.nextChange)} />
          <Small style={{ marginTop: 8 }}>CHICK masked for privacy. Demo document, not issued by the NCS.</Small>
        </Box>
      ) : <Small>No NCS award on file.</Small>;
    } else {
      title = "Authorised collectors";
      content = (
        <Box pad={10}>
          {c.collectors.filter(x => x.permitted).map(x => <Row key={x.name} title={x.name} sub={x.relation + (x.note && /password/i.test(x.note) ? " · collection password on file" : "")} />)}
          <div style={{ padding: "8px 6px 0" }}><PBtn full onClick={() => { onClose(); app.compose("Please update " + c.firstName + "'s collectors: "); }}>Ask the team to change this</PBtn></div>
        </Box>
      );
    }
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 85, background: "var(--scrim)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="myros-sheet myros"
        style={{ width: "min(430px,100%)", maxHeight: "88vh", display: "flex", flexDirection: "column", background: "var(--bg)", borderRadius: "26px 26px 0 0", border: "1px solid var(--border-strong)", borderBottom: 0, boxShadow: "0 -20px 60px rgba(0,0,0,.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px 10px 18px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 650 }}>{title}</div>
          <button ref={closeRef} type="button" aria-label="Close" onClick={onClose} className="myros-focus"
            style={{ width: 44, height: 44, borderRadius: 22, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--ink)", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <Ico d={PATH.close} size={18} />
          </button>
        </div>
        <div style={{ overflowY: "auto", padding: "14px 16px 26px" }}>{content}</div>
      </div>
    </div>
  );
}

function MedicalSheet({ app, onDone }: { app: AppCtx; onDone: () => void }) {
  const { c } = app;
  const [text, setText] = useState("");
  const send = () => {
    openSunnyCase({ familyId: app.f.id, topic: "Medical", question: "Medical update for " + c.firstName + ": " + text.trim() });
    setText("");
    onDone();
  };
  return (
    <Stack gap={12}>
      <Box>
        <H>{c.firstName}'s medical details</H>
        {c.medical.length ? c.medical.map(m => <div key={m.kind + m.detail} style={{ padding: "5px 0" }}><div style={{ fontSize: 14, fontWeight: 600 }}>{m.kind} · {m.severity}</div><Small>{m.detail}</Small></div>) : <Small>No medical conditions recorded for {c.firstName}.</Small>}
        {c.medication && <Line label="Medication" value={c.medication.name} />}
        <Small style={{ marginTop: 8 }}>Medical information is handled by a person, never by Sunny.</Small>
      </Box>
      <Field label="Tell the team about a change">
        <textarea className="ros-input" rows={4} value={text} onChange={(e) => setText(e.target.value)} style={{ fontSize: 14, borderRadius: 14 }} />
      </Field>
      <PBtn kind="sun" full disabled={!text.trim()} onClick={send}>Send to the manager</PBtn>
      <Small>This opens a case for the {app.place} manager (demo, nothing is sent). If {c.firstName} needs urgent help, ring 112 or 999.</Small>
    </Stack>
  );
}
