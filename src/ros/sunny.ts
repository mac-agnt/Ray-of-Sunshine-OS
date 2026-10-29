/* Sunny: the MyRosKids parent assistant. Every answer is computed from the
   signed-in family's own records (bookings, attendance, invoices, NCS award,
   booking window) and the published demo policies, so nothing is guessed.
   Anything sensitive (medical, safeguarding, complaints, billing disputes)
   is never answered here: Sunny opens a case for a person instead. The same
   helpers (journey, pricing, window, notes) drive the parent app screens, so
   Sunny and the app can never disagree. */
import { defineAction, getState, ROLES } from "./store";
import { idx, child, family, guardian, childStatus, manifest, invoiceTotal, invoiceBalance, invoiceStatus, familyDue, schoolName, locById, staffById } from "./selectors";
import { TODAY, THIS_WEEK, MIDTERM_WEEK, NEXT_SCHOOL_WEEK, addDays, daysBetween, dowLong, fmtDate, fmtDay, fmtDateY, hm, toMin, euro, round2 } from "./time";
import type { RosState, Child, Booking, BookingWindow, WindowSubmission, Route, AttendanceEvent, NCSAward, ISODate, HHMM, Task, ActivityEvent, Message, LocationId } from "./types";

export const PARENT_FAMILY = "ROS1042";
export const SUNNY_SOURCE = "Sunny · Parent Assistant";
export const CARD_LABEL = "Card on file •••• 4242";

const norm = (q: string) => q.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim();
const firstName = (full?: string) => (full || "").split(" ")[0];
const plural = (n: number, one: string, many = one + "s") => n + " " + (n === 1 ? one : many);
const listJoin = (a: string[]) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
export const fmtAt = (at: string) => fmtDay(at.slice(0, 10)) + ", " + at.slice(11, 16);

/* ---------------- today's journey (bus → centre → home) ---------------- */
export type JourneyPhase = "none" | "scheduled" | "due" | "onbus" | "arrived" | "collected" | "absent" | "missing";
export interface JourneyStep { key: "sched" | "board" | "in" | "out"; label: string; time?: string; detail: string; done: boolean }
export interface Journey {
  phase: JourneyPhase; status: string; headline: string; short: string; detail: string; steps: JourneyStep[];
  booking?: Booking; route?: Route; driver?: string; pickup?: string; school: string; place: string; live: boolean; expectIn: string;
}
const afternoon = (e: AttendanceEvent) => e.time >= "12:00";

/** Live after-school journey for one child, read from bookings, the route manifest and attendance events. */
export function journey(childId: string, date: ISODate = TODAY): Journey {
  const s = getState();
  const c = child(childId);
  const school = schoolName(c?.schoolId);
  const place = (c && locById(c.locationId)?.short) || "the centre";
  const name = c?.firstName || "Your child";
  const status = childStatus(childId, date).status;
  const booking = (idx().bookingsByChild.get(childId) || []).find(b => b.date === date && b.session === "After School");
  if (!c || !booking) {
    return { phase: "none", status, headline: "No after-school session today", short: "Not booked", detail: name + " isn't booked for After School today.", steps: [], school, place, live: false, expectIn: "" };
  }
  const route = booking.routeId ? idx().route.get(booking.routeId) : undefined;
  const entry = route ? manifest(route.id, date).find(m => m.child.id === childId) : undefined;
  const pickup = entry?.stop?.time || route?.stops.find(st => st.schoolId === booking.schoolId)?.time;
  const driver = route ? staffById(route.driverId)?.name : undefined;
  const ev = (idx().attendanceByChildDate.get(childId + "|" + date) || []).filter(afternoon).slice().sort((a, b) => a.time.localeCompare(b.time));
  const boarded = entry?.boarded || ev.find(e => e.kind === "boarded");
  const arrived = ev.find(e => e.kind === "in");
  const out = ev.find(e => e.kind === "out");
  const missing = ev.find(e => e.kind === "not-present");
  const absent = ev.find(e => e.kind === "absent");
  const expectIn = route && pickup ? "shortly after " + hm(toMin(pickup) + 15) : "from " + booking.start;
  const dFirst = firstName(driver) || "the driver";

  const steps: JourneyStep[] = [];
  if (route) {
    steps.push({ key: "sched", label: "Pickup scheduled", time: pickup, detail: school + " · " + route.id, done: true });
    steps.push({ key: "board", label: boarded ? "On the bus" : "Boards the bus", time: boarded?.time, detail: boarded ? "Boarded at " + school : missing ? "Not at pickup " + missing.time : "Waiting for " + dFirst + " to confirm", done: !!boarded });
  }
  steps.push({ key: "in", label: arrived ? "Signed in at " + place : "Signs in at " + place, time: arrived?.time, detail: arrived ? "Arrived" + (route && boarded ? " on " + route.id : "") : "Expected " + expectIn, done: !!arrived });
  steps.push({ key: "out", label: out ? "Collected" : "Home time", time: out?.time, detail: out ? (out.collector ? "By " + out.collector : "Signed out") : "Booked until " + booking.end, done: !!out });

  let phase: JourneyPhase, headline: string, short: string, detail: string;
  if (out) {
    phase = "collected"; headline = "Collected · signed out " + out.time; short = "Collected " + out.time;
    detail = name + " was collected" + (out.collector ? " by " + out.collector : "") + " at " + out.time + ".";
  } else if (arrived) {
    phase = "arrived"; headline = "Arrived · signed in at " + place + " " + arrived.time; short = "Signed in " + arrived.time;
    detail = (route && boarded ? "Came on " + route.id + " and signed in" : "Signed in") + " at " + arrived.time + ". Booked until " + booking.end + ".";
  } else if (boarded && route) {
    phase = "onbus"; headline = "On the bus · boarded " + boarded.time + " at " + school; short = "On the bus";
    detail = route.id + " with " + (driver || "the driver") + ". Expected at " + place + " " + expectIn + ".";
  } else if (missing) {
    phase = "missing"; headline = "Not at pickup"; short = "Not at pickup";
    detail = dFirst + " couldn't find " + name + " at " + school + " at " + missing.time + ". The " + place + " team is checking now and will ring you.";
  } else if (absent) {
    phase = "absent"; headline = "Marked absent today"; short = "Absent";
    detail = name + " is marked absent for today's session" + (absent.note ? ": " + absent.note : ".");
  } else if (route && pickup) {
    if (s.clockMin < toMin(pickup)) {
      phase = "scheduled"; headline = "Pickup scheduled at " + pickup; short = "Pickup " + pickup;
      detail = name + "'s after-school pickup is scheduled at " + pickup + " on " + route.id + " from " + school + ".";
    } else {
      phase = "due"; headline = "Pickup due at " + pickup; short = "Pickup due";
      detail = "Scheduled " + pickup + " at " + school + " on " + route.id + ". This updates the moment " + dFirst + " confirms " + name + " is on board.";
    }
  } else {
    phase = "scheduled"; headline = "After School from " + booking.start; short = "From " + booking.start;
    detail = name + " is booked at " + place + " from " + booking.start + " to " + booking.end + ".";
  }
  return { phase, status, headline, short, detail, steps, booking, route, driver, pickup, school, place, live: phase === "onbus" || phase === "due", expectIn };
}

/* ---------------- today's activity notes (school age: no EY journal) ---------------- */
export interface ActivityNote { time: HHMM; title: string; detail: string; shared: boolean }
const SAC_DAY: { time: HHMM; title: string; detail: string }[] = [
  { time: "15:15", title: "Snack", detail: "Wholemeal toast, apple slices and milk." },
  { time: "15:30", title: "Homework club", detail: "Spellings and maths sheet with the homework team." },
  { time: "16:15", title: "Football", detail: "Five-a-side on the pitch. The football gear came in from school." },
];
export function activityNotes(childId: string): ActivityNote[] {
  const j = journey(childId);
  if (!j.booking) return [];
  const inAt = j.steps.find(st => st.key === "in")?.time;
  const outAt = j.steps.find(st => st.key === "out")?.time;
  const now = getState().clockMin;
  return SAC_DAY.filter(n => n.time < j.booking!.end).map(n => ({ ...n, shared: !!inAt && inAt <= n.time && now >= toMin(n.time) && (!outAt || outAt >= n.time) }));
}

/* ---------------- booking window and pricing ---------------- */
export interface DayPlan { date: ISODate; on: boolean; end: HHMM; collect: boolean }
export const END_TIMES: HHMM[] = ["16:00", "17:00", "17:30", "18:00"];
export type PlanSubmission = WindowSubmission & { plans?: Record<string, DayPlan[]> };
export const hoursBetween = (start: string, end: string) => Math.max(0, Math.ceil((toMin(end) - toMin(start)) / 60));
/** After-school start: the child's own booked start, else the school-age rule. Pure, safe inside reducers. */
export function sacStart(s: RosState, c: Child): HHMM {
  return s.bookings.find(b => b.childId === c.id && b.session === "After School")?.start || (c.age <= 6 ? "14:00" : "15:00");
}
export const openWindow = (): BookingWindow | undefined => getState().windows.find(w => w.status === "Open");
export const lockedWeek = (): BookingWindow | undefined => getState().windows.find(w => w.weekOf === THIS_WEEK[0]);
export function minsUntil(at: string): number { return daysBetween(TODAY, at.slice(0, 10)) * 1440 + toMin(at.slice(11, 16)) - getState().clockMin; }
export function countdown(mins: number): string {
  if (mins <= 0) return "closed";
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  if (d) return plural(d, "day") + " " + plural(h, "hr");
  if (h) return plural(h, "hr") + " " + m + " min";
  return m + " min";
}
export function submissionOf(w: BookingWindow | undefined, fid: string): PlanSubmission | undefined {
  return w?.submissions.find(x => x.familyId === fid) as PlanSubmission | undefined;
}
/** When the family submitted, as their timeline records it. The seeded stamp can sit later in the day than the demo clock, so the timeline wins then. */
export function submittedAt(w: BookingWindow, fid: string): string | undefined {
  const sub = submissionOf(w, fid);
  if (!sub) return undefined;
  const now = TODAY + " " + hm(getState().clockMin);
  if (sub.submittedAt <= now) return sub.submittedAt;
  const ev = getState().comms.filter(x => x.familyId === fid && x.direction === "in" && /^(Submitted|Updated) bookings for/.test(x.summary) && x.summary.includes(w.label) && x.at <= now).sort((a, b) => b.at.localeCompare(a.at))[0];
  return ev?.at || sub.submittedAt;
}
/** Staff-written text shown to parents: time ranges read "15:00 to 18:00" and long dashes become commas. */
export const clean = (t: string) => t.replace(/(\d)\s*[–—]\s*(\d)/g, "$1 to $2").replace(/\s*[—–]\s*/g, ", ");
/** The plan the parent last submitted, or this week's pattern carried forward. */
export function planFor(w: BookingWindow, fid: string, c: Child): DayPlan[] {
  const saved = submissionOf(w, fid)?.plans?.[c.id];
  if (saved) return saved.map(d => ({ ...d }));
  const mine = idx().bookingsByChild.get(c.id) || [];
  return [0, 1, 2, 3, 4].map(i => {
    const b = mine.find(x => x.date === THIS_WEEK[i] && x.session === "After School");
    return { date: addDays(w.weekOf, i), on: !!b, end: b?.end || "17:30", collect: !!b?.routeId && c.consents.transport };
  });
}
export interface PriceLine { label: string; amount: number; kind: "session" | "transport" | "subsidy" | "fee" }
export function priceWeek(c: Child, plan: DayPlan[]) {
  const s = getState();
  const rate = locById(c.locationId)?.hourlyRate || 15;
  const start = sacStart(s, c);
  const on = plan.filter(d => d.on);
  const hours = on.reduce((n, d) => n + hoursBetween(start, d.end), 0);
  const runs = on.filter(d => d.collect).length;
  const award: NCSAward | undefined = idx().awardByChild.get(c.id);
  const subH = award && award.status !== "Expired" ? Math.min(hours, award.agreedHours) : 0;
  const lines: PriceLine[] = [];
  if (hours) lines.push({ label: "After School · " + hours + "h × " + euro(rate), amount: round2(hours * rate), kind: "session" });
  if (runs) lines.push({ label: "School collection · " + runs + " × " + euro(s.config.transportFee), amount: round2(runs * s.config.transportFee), kind: "transport" });
  if (award && subH) lines.push({ label: "NCS subsidy (" + award.type + ") · " + subH + "h × " + euro(award.rate), amount: -round2(subH * award.rate), kind: "subsidy" });
  const total = round2(lines.reduce((n, x) => n + x.amount, 0));
  return { start, rate, hours, sessions: on.length, runs, lines, total, award, subH };
}
/** Fee lines for a late booking under the demo rules. Pure, safe inside reducers. */
export function lateFees(s: RosState, c: Child, hours: number, collect: boolean) {
  const rate = s.locations.find(l => l.id === c.locationId)?.hourlyRate || 15;
  const fees = [
    { label: hours + "h After School × " + euro(rate), qty: hours, rate, amount: round2(hours * rate) },
    { label: "Late booking fee", qty: 1, rate: s.config.lateFee, amount: s.config.lateFee },
  ];
  if (collect) fees.push({ label: "School collection", qty: 1, rate: s.config.transportFee, amount: s.config.transportFee });
  return fees;
}
export function noticeHoursUntil(date: ISODate, start: HHMM): number {
  return (daysBetween(TODAY, date) * 1440 + toMin(start) - getState().clockMin) / 60;
}

/* ---------------- money ---------------- */
export function familyInvoices(fid: string) {
  return (idx().invoicesByFamily.get(fid) || []).slice().sort((a, b) => b.weekOf.localeCompare(a.weekOf) || b.id.localeCompare(a.id));
}
export function familyPayments(fid: string) {
  return (idx().paymentsByFamily.get(fid) || []).slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}
export function methodLabel(fid: string) {
  const m = family(fid)?.method || "Card on file";
  return m === "Card on file" ? CARD_LABEL : m;
}
export function nextInvoice(fid: string) {
  const w = openWindow(), f = family(fid);
  if (!w || !f) return undefined;
  const kids = f.childIds.map(id => child(id)).filter((c): c is Child => !!c);
  const sub = submissionOf(w, fid);
  const estimate = round2(kids.reduce((n, c) => n + priceWeek(c, planFor(w, fid, c)).total, 0));
  return { weekOf: w.weekOf, label: w.label, issued: addDays(w.weekOf, -4), estimate, submitted: !!sub };
}
export function midtermFacts(fid: string) {
  const s = getState();
  const camps = s.camps.filter(cp => cp.start <= MIDTERM_WEEK[4] && cp.end >= MIDTERM_WEEK[0]);
  const regs = s.campRegs.filter(r => r.familyId === fid);
  const booked = s.bookings.filter(b => b.familyId === fid && b.status === "Booked" && MIDTERM_WEEK.includes(b.date));
  return { camps, regs, booked, range: MIDTERM_WEEK[0].slice(8) + "-" + fmtDate(MIDTERM_WEEK[4]) };
}

/* ---------------- policies (demo fee terms 2026/27) ---------------- */
export function policies() {
  const cfg = getState().config;
  return {
    notice: "Changes need " + cfg.noticeHours + " hours' notice on weekdays.",
    weekend: "Requests sent at the weekend are processed on Monday morning.",
    locked: "Once a week is locked, booked sessions are non-refundable.",
    partHours: "Part hours are billed to the next full hour.",
    late: "A late booking adds a " + euro(cfg.lateFee) + " late booking fee, plus " + euro(cfg.transportFee) + " if you need school collection.",
  };
}

/* ---------------- sensitive topics and case routing ---------------- */
export type SensitiveTopic = "Medical" | "Safeguarding" | "Complaint" | "Billing dispute";
export function sensitiveTopic(text: string): SensitiveTopic | undefined {
  const t = norm(text);
  if (/safeguard|abus|neglect|bull(y|ied|ying)|\bhit (me|him|her)\b|hurt by|inappropriate|touched|unsafe|not safe|custody|court order|barring order|tusla|social worker|scared of|afraid of|frightened/.test(t)) return "Safeguarding";
  if (/medic|allerg|inhaler|epi ?pen|asthma|seizure|epilep|diabet|injur|hospital|doctor|\bgp\b|temperature|fever|vomit|\brash\b|\bsick\b(?! of)|\bill\b|illness|concussion|bump(ed)? (his|her) head|prescription|\bmeds\b/.test(t)) return "Medical";
  if (/dispute|overcharg|charged twice|double charg|wrong(ly)? charg|incorrect(ly)? (charg|invoic|bill)|charge (is|was) wrong|shouldn'?t (have been|be) charged|challenge (the|this|my) (charge|invoice|bill)/.test(t)) return "Billing dispute";
  if (/complain|complaint|not happy|unhappy|disappointed|upset|angry|furious|\brude\b|unacceptable|poor service|let (us|me) down|fed up|sick of/.test(t)) return "Complaint";
  return undefined;
}
export function caseRoute(topic: SensitiveTopic, s: RosState, locId: LocationId) {
  const l = s.locations.find(x => x.id === locId);
  const mgr = s.staff.find(x => x.id === l?.managerId)?.name || "the location manager";
  const ops = ROLES.find(r => r.id === "ops")?.person || "the operations manager";
  const accounts = ROLES.find(r => r.id === "accounts")?.person || "the accounts team";
  const where = l?.short || "the centre";
  switch (topic) {
    case "Medical": return { owner: mgr, who: mgr + ", manager at " + where, department: "Compliance" as Task["department"], priority: "High" as Task["priority"], category: "Safeguarding" as ActivityEvent["category"], queue: "Parent app" as Message["queue"] };
    case "Safeguarding": return { owner: ops, who: ops + ", our Operations Manager", department: "Compliance" as Task["department"], priority: "High" as Task["priority"], category: "Safeguarding" as ActivityEvent["category"], queue: "Parent app" as Message["queue"] };
    case "Billing dispute": return { owner: accounts, who: accounts + " in Accounts", department: "Accounts" as Task["department"], priority: "Medium" as Task["priority"], category: "Financial" as ActivityEvent["category"], queue: "Accounts" as Message["queue"] };
    default: return { owner: mgr, who: mgr + ", manager at " + where, department: "Operations" as Task["department"], priority: "Medium" as Task["priority"], category: "Communications" as ActivityEvent["category"], queue: "Parent app" as Message["queue"] };
  }
}

/** Sunny hands a sensitive question to a person: a staff task plus an inbound message in the Unified Inbox. */
export const openSunnyCase = defineAction<{ familyId: string; topic: SensitiveTopic; question: string }>("sunny.case", (s, p, ctx) => {
  const f = s.families.find(x => x.id === p.familyId);
  if (!f) return;
  const r = caseRoute(p.topic, s, f.locationId);
  const msgId = ctx.id("MSG");
  s.messages.push({
    id: msgId, queue: r.queue, familyId: f.id, from: ctx.actor, subject: "Sunny case · " + p.topic, body: p.question, received: ctx.now,
    classification: "Sunny case · " + p.topic, confidence: 1, status: "Escalated", direction: "in", channel: "App", link: { kind: "family", id: f.id },
  });
  const taskId = ctx.id("TSK");
  s.tasks.push({
    id: taskId, title: "Sunny case (" + p.topic + "): reply to " + ctx.actor + " · " + f.surname + " (" + f.id + ")", owner: r.owner, due: "Today", dueDate: TODAY,
    priority: r.priority, department: r.department, status: "Not started", link: { kind: "message", id: msgId }, source: SUNNY_SOURCE, locationId: f.locationId,
  });
  ctx.agent("sunny", "Routed a " + p.topic.toLowerCase() + " question from " + ctx.actor + " to " + r.owner + " (" + taskId + "). Sunny did not answer it.", "escalation", { kind: "message", id: msgId });
  ctx.log({ category: r.category, title: "Parent case opened by Sunny: " + p.topic, detail: ctx.actor + " (" + f.id + ") asked in MyRosKids. Routed to " + r.owner + " as " + taskId + ". Sunny never answers " + p.topic.toLowerCase() + " questions itself.", link: { kind: "message", id: msgId }, locationId: f.locationId });
  ctx.comm(f.id, "App", "in", "Asked Sunny about a " + p.topic.toLowerCase() + " matter; passed to " + r.owner);
}, { toast: () => "Case opened. A person on the team will reply (demo, nothing sent)." });

/** Simple keyword classification for messages a parent writes in the app. */
export function classify(text: string): { label: string; confidence: number } {
  const t = norm(text);
  const topic = sensitiveTopic(t);
  if (topic) return { label: topic === "Billing dispute" ? "Invoice dispute" : topic, confidence: 0.86 };
  const rules: [RegExp, string, number][] = [
    [/\bbus\b|pick ?up|school run|collect(ion)? from school|driver/, "Transport query", 0.93],
    [/absent|won'?t be in|not (be )?in (today|tomorrow)|off (school|today|tomorrow)|staying (at )?home|day off/, "Absence notice", 0.9],
    [/collector|collect(ing)? (him|her|luca)|grand(mother|father|ma|da)|granny|nana/, "Collector change", 0.84],
    [/invoice|\bbill|balance|\bpay|payment|\bcard\b|direct debit|receipt|\bfee/, "Billing query", 0.88],
    [/\bncs\b|subsid|chick|agreed hours/, "NCS query", 0.9],
    [/book|session|cancel|change|extra day|late booking|window/, "Booking request", 0.86],
    [/consent|photo/, "Consent change", 0.85],
    [/camp|halloween|midterm|mid-term|christmas|closed|closure/, "Closures and camps", 0.82],
  ];
  for (const [re, label, confidence] of rules) if (re.test(t)) return { label, confidence };
  return { label: "General enquiry", confidence: 0.7 };
}

/* ---------------- Sunny's answers ---------------- */
export interface SunnyReply {
  text: string; facts?: string[]; chips?: string[];
  go?: { label: string; tab: string; view?: "team" | "sunny" | "updates"; prefill?: string };
  sensitive?: SensitiveTopic; owner?: string;
}
export const SUNNY_STARTERS = ["Is Luca on the bus?", "What's my balance?", "When does booking close?", "What's booked this week?", "How many NCS hours do we have?", "What if I'm late collecting?", "Are you closed at midterm?"];

const PRIVACY = /other (famil|child|kid|parent|people)|another (famil|child|kid|parent)|someone else'?s|staff (pay|wage|salar|rota)|payroll|\bratio|how many (children|kids)|who else/;
const COMMON_WORDS = new Set(["may", "will", "grace", "hope", "faith", "rose", "holly", "summer", "sky", "bill", "mark", "art", "ruby", "amber", "ivy", "lily"]);
function otherChildNamed(t: string, fid: string): string | undefined {
  const s = getState(), f = family(fid);
  const own = new Set<string>();
  s.children.filter(c => c.familyId === fid).forEach(c => own.add(c.firstName.toLowerCase()));
  f?.guardians.forEach(g => own.add(firstName(g.name).toLowerCase()));
  const names = new Map<string, string>();
  for (const c of s.children) { const k = c.firstName.toLowerCase(); if (!own.has(k) && !COMMON_WORDS.has(k) && k.length >= 3) names.set(k, c.firstName); }
  for (const w of t.split(/[^\p{L}']+/u)) { const k = w.replace(/'s$/, ""); if (names.has(k)) return names.get(k); }
  return undefined;
}

/** Deterministic, grounded answer for a parent question about their own family. */
export function askSunny(question: string, fid: string = PARENT_FAMILY): SunnyReply {
  const t = norm(question);
  const s = getState();
  const f = family(fid);
  if (!f) return { text: "I can't find your family record in this demo." };
  const kids = f.childIds.map(id => child(id)).filter((c): c is Child => !!c);
  const c = kids[0];
  const name = c?.firstName || "your child";
  const parent = firstName(guardian(f)?.name);
  const place = locById(f.locationId)?.short || "the centre";

  if (!t) return help(name);
  const other = otherChildNamed(t, fid);
  if (other || PRIVACY.test(t)) {
    return { text: "I can only see your own family's records, so I can't share anything about " + (other || "other children, families or staff") + ". Ask me anything about " + name + ", your bookings or your account.", chips: ["Is " + name + " on the bus?", "What's my balance?"] };
  }
  const topic = sensitiveTopic(t);
  if (topic) {
    const r = caseRoute(topic, s, f.locationId);
    const urgent = topic === "Medical" ? " If " + name + " needs urgent medical help, ring 112 or 999." : topic === "Safeguarding" ? " If a child is in immediate danger, ring 112 or 999." : "";
    return {
      text: "Thanks for telling me, " + parent + ". This is one for a person, not me, so I've passed it to " + r.who + " and opened a case. They'll be in touch directly." + urgent,
      sensitive: topic, owner: r.owner, go: { label: "See the team thread", tab: "Messages", view: "team" },
    };
  }
  if (/^(hi|hello|hey|hiya|dia dhuit|good (morning|afternoon|evening))\b/.test(t) && t.length < 28) return { text: "Hi " + parent + ". I can tell you where " + name + " is right now, what's booked, what you owe and how our policies work.", chips: SUNNY_STARTERS.slice(0, 4).map(q => q.replace("Luca", name)) };
  if (/thank|thanks|go raibh|cheers/.test(t)) return { text: "You're welcome, " + parent + ". I'm here any time.", chips: ["Is " + name + " on the bus?", "When does booking close?"] };
  if (!c) return help(name);

  if (/who can collect|collector|collection password|authori[sz]ed|grandmother|granny|nana|grandad|who('s| is) allowed/.test(t)) return collectorsReply(c);
  if (/late (collect|pick)|running late|collect(ing)? late|pick(ing)? (him|her|.{2,10}) up late|after (6|six|18)|stuck in traffic|delayed/.test(t)) return lateReply(c);
  if (/absent|won'?t be in|not (be )?in (today|tomorrow)|off (school|today|tomorrow)|staying (at )?home|day off/.test(t)) {
    return { text: "Thanks for letting us know. Send the " + place + " team a quick message and they'll update the register and the bus list. " + policies().locked, go: { label: "Tell the team", tab: "Messages", view: "team", prefill: name + " won't be in on " }, chips: ["What's booked this week?"] };
  }
  if (/\bbus\b|pick ?up|picked up|school run|where('s| is)|arriv|on (his|her|the) way|board|journey|signed in|is (he|she|.{2,10}) (there|in|ok|safe|at)|has (he|she|.{2,10}) (arrived|got)|get there/.test(t)) return busReply(c);
  if (/what did|activit|homework|football|snack|photo|how was|(his|her) day|today at/.test(t)) return dayReply(c);
  if (/window|deadline|book(ing)? (close|for)|clos(e|es|ing) .*book|book.*clos|submit|november|2 nov/.test(t)) return windowReply(fid, place);
  if (/closed|closure|midterm|mid-term|halloween|bank holiday|christmas|easter|open on|next week|weather/.test(t)) return closuresReply(fid, place);
  if (/\bncs\b|subsid|chick|agreed hours|funding|scheme/.test(t)) return ncsReply(c, fid);
  if (/cancel|change|swap|notice|refund|extra (day|session)|add (a )?(day|session)|late booking|friday/.test(t)) return changeReply(c, fid, place);
  if (/next (invoice|bill)|balance|owe|due|\bpay|paid|invoice|\bbill|how much|cost|fee|charge|receipt|card|direct debit/.test(t)) return moneyReply(fid, name);
  if (/this week|booked|bookings|sessions|what days|which days|schedule|tomorrow|today/.test(t)) return weekReply(c, fid);
  if (/consent|document|form|registration|terms|letter/.test(t)) return { text: "Your documents are in the Documents tab: registration, fees and payment terms 2026/27 (signed), consents, the NCS award letter and medical forms.", go: { label: "Open Documents", tab: "Documents" } };
  if (/phone|ring|call|email|contact|talk to|speak to|manager|person|human/.test(t)) return { text: "The " + place + " team reads every message in the Messages tab, and a person replies. For anything urgent about " + name + " today, ring the centre directly.", go: { label: "Message the team", tab: "Messages", view: "team" } };
  return { ...help(name), text: "I'm not sure about that one, so I won't guess. I can help with " + name + "'s bus and day, bookings, invoices, NCS hours and our policies. Or send it to the " + place + " team and a person will reply." , go: { label: "Ask the team instead", tab: "Messages", view: "team", prefill: question } };
}

function help(name: string): SunnyReply {
  return { text: "Ask me about " + name + "'s bus, this week's bookings, your balance, the booking window, NCS hours or our policies.", chips: SUNNY_STARTERS.slice(0, 4).map(q => q.replace("Luca", name)) };
}

function busReply(c: Child): SunnyReply {
  const j = journey(c.id);
  if (j.phase === "none") return { text: c.firstName + " isn't booked for After School today, so there's no school run for " + c.firstName + " today.", chips: ["What's booked this week?"] };
  const facts = j.steps.map(st => (st.done ? "Done · " : "Next · ") + st.label + (st.time ? " " + st.time : "") + " · " + st.detail);
  const lead: Record<JourneyPhase, string> = {
    none: "", scheduled: "Not yet. ", due: "Not confirmed yet. ", onbus: "Yes. ", arrived: "Yes, " + c.firstName + " has arrived. ", collected: "", absent: "", missing: "",
  };
  const tail = j.phase === "scheduled" ? " I'll show it live in the app once " + (firstName(j.driver) || "the driver") + " confirms boarding." : j.phase === "missing" ? " If you know where " + c.firstName + " is, please ring " + j.place + " straight away." : "";
  return { text: lead[j.phase] + j.detail + tail, facts, go: { label: "See today's journey", tab: "Home" }, chips: ["What did " + c.firstName + " do today?", "What if I'm late collecting?"] };
}

function dayReply(c: Child): SunnyReply {
  const j = journey(c.id), notes = activityNotes(c.id);
  if (!j.booking) return { text: c.firstName + " isn't booked for After School today.", chips: ["What's booked this week?"] };
  const shared = notes.filter(n => n.shared), planned = notes.filter(n => !n.shared);
  if (j.phase !== "arrived" && j.phase !== "collected") {
    return { text: c.firstName + " isn't at " + j.place + " yet today. This afternoon's plan is " + listJoin(notes.map(n => n.title.toLowerCase())) + ". Notes appear in Child Updates as the team adds them.", go: { label: "Open Child Updates", tab: "Child Updates" } };
  }
  return {
    text: shared.length ? "Here's what the team has shared so far today." : c.firstName + " is signed in. Nothing shared yet; next up is " + (planned[0]?.title.toLowerCase() || "home time") + " at " + (planned[0]?.time || j.booking.end) + ".",
    facts: shared.map(n => n.time + " · " + n.title + ": " + n.detail), go: { label: "Open Child Updates", tab: "Child Updates" },
  };
}

function weekReply(c: Child, fid: string): SunnyReply {
  const s = getState();
  const mine = (idx().bookingsByChild.get(c.id) || []).filter(b => THIS_WEEK.includes(b.date)).sort((a, b) => a.date.localeCompare(b.date));
  if (!mine.length) return { text: c.firstName + " has no sessions booked this week.", go: { label: "Request a session", tab: "Book" } };
  const facts = mine.map(b => {
    const ev = (idx().attendanceByChildDate.get(c.id + "|" + b.date) || []).filter(afternoon);
    const inn = ev.find(e => e.kind === "in"), out = ev.find(e => e.kind === "out");
    const state = b.date < TODAY ? (inn ? " · attended" + (out ? " " + inn.time + "-" + out.time : "") : "") : b.date === TODAY ? " · today" : "";
    return dowLong(b.date) + " · " + b.session + " " + b.start + "-" + b.end + (b.routeId ? " · school collection " + b.routeId : "") + state;
  });
  const free = THIS_WEEK.filter(d => d > TODAY && !mine.some(b => b.date === d));
  const pending = s.requests.filter(r => r.familyId === fid && r.status === "Pending");
  pending.forEach(r => facts.push("Waiting for staff: " + r.kind.toLowerCase() + " " + r.id + " for " + fmtDay(r.date)));
  return {
    text: c.firstName + " is booked for " + plural(mine.length, "session") + " this week." + (free.length ? " " + listJoin(free.map(d => dowLong(d))) + (free.length === 1 ? " isn't" : " aren't") + " booked; you can ask for a late booking in Book, and staff approve it." : ""),
    facts, go: { label: "Open Book", tab: "Book" }, chips: ["What does a late booking cost?"],
  };
}

function windowReply(fid: string, place: string): SunnyReply {
  const s = getState(), w = openWindow();
  const nextW = s.windows.find(x => x.status === "Scheduled");
  if (!w) return { text: "There's no booking window open right now." + (nextW ? " The next one, " + nextW.label + ", opens " + fmtAt(nextW.opens) + "." : "") };
  const sub = submissionOf(w, fid);
  const left = countdown(minsUntil(w.closes));
  const facts: string[] = [];
  if (nextW) facts.push("Next window: " + nextW.label + ", opens " + fmtAt(nextW.opens));
  facts.push(policies().notice + " " + policies().weekend);
  return {
    text: "The booking window for " + w.label + " is open until " + fmtAt(w.closes) + " (" + left + " left). " + (sub ? "You submitted on " + fmtAt(submittedAt(w, fid) || sub.submittedAt) + ": " + plural(sub.sessions, "session") + ", " + sub.hours + " hours. You can change it until the window closes." : "You haven't submitted yet. After it closes, any booking is a late request for the " + place + " team."),
    facts, go: { label: sub ? "Review my booking" : "Book now", tab: "Book" },
  };
}

function moneyReply(fid: string, name: string): SunnyReply {
  const due = familyDue(fid);
  const invs = familyInvoices(fid);
  const unpaid = invs.filter(i => invoiceBalance(i) > 0);
  const pays = familyPayments(fid).filter(p => p.status === "Succeeded");
  const last = invs[0];
  const nx = nextInvoice(fid);
  const mid = midtermFacts(fid);
  const facts: string[] = unpaid.map(i => i.id + " · w/c " + fmtDate(i.weekOf) + " · " + euro(invoiceBalance(i)) + " to pay, due " + fmtDate(i.due));
  if (last) {
    const paid = pays.find(p => p.invoiceId === last.id);
    facts.push("Latest invoice " + last.id + " (w/c " + fmtDate(last.weekOf) + "): " + euro(invoiceTotal(last)) + (invoiceBalance(last) <= 0 && paid ? ", paid " + fmtDate(paid.date) : ", " + invoiceStatus(last).toLowerCase()));
  }
  if (nx) facts.push(nx.submitted ? "Next invoice: " + nx.label + ", issued " + fmtDay(nx.issued) + ", about " + euro(nx.estimate) + " after NCS subsidy" : "Next invoice: nothing booked for " + nx.label + " yet");
  if (!mid.booked.length && !mid.regs.length) facts.push("No invoice for midterm week (" + mid.range + "): nothing is booked");
  return {
    text: (due > 0 ? "You have " + euro(due) + " to pay across " + plural(unpaid.length, "invoice") + ". You can pay it in the app." : "You're all paid up. Your balance is " + euro(0) + ".") + " Weekly invoices are paid by your " + methodLabel(fid).replace("Card on file", "card on file") + ".",
    facts, go: { label: due > 0 ? "Pay now" : "Open Payments", tab: "Payments" }, chips: ["How many NCS hours do we have?", "What's booked this week?"].map(q => q.replace("Luca", name)),
  };
}

function ncsReply(c: Child, fid: string): SunnyReply {
  const s = getState();
  const aw = idx().awardByChild.get(c.id);
  if (!aw) return { text: "There's no NCS award on file for " + c.firstName + ". The NCS team can help you apply.", go: { label: "Message the team", tab: "Messages", view: "team" } };
  const week = (idx().bookingsByChild.get(c.id) || []).filter(b => THIS_WEEK.includes(b.date)).reduce((n, b) => n + b.hours, 0);
  const w = openWindow(), sub = submissionOf(w, fid);
  const facts = ["This week: " + week + "h booked, " + Math.min(week, aw.agreedHours) + "h subsidised"];
  if (w && sub) facts.push(w.label + ": " + sub.hours + "h submitted" + (sub.hours < aw.agreedHours ? ", " + (aw.agreedHours - sub.hours) + "h under your agreed hours" : sub.hours > aw.agreedHours ? ", " + (sub.hours - aw.agreedHours) + "h above them (charged privately)" : ", matches your agreed hours"));
  facts.push("Award runs until " + fmtDateY(aw.expires) + " · CHICK " + aw.chick);
  facts.push("Agreed hours can change once every " + s.config.ncsChangeWeeks + " weeks" + (aw.nextChange > TODAY ? " (next from " + fmtDate(aw.nextChange) + ")" : "; you can ask the NCS team for a change now"));
  const claims = s.claims.filter(cl => cl.familyId === fid && cl.status === "Awaiting acceptance");
  facts.push(claims.length ? claims.map(cl => "Claim " + cl.id + " needs your acceptance on the NCS portal by " + cl.deadline.slice(11) + " " + fmtDay(cl.deadline.slice(0, 10))).join("; ") : "No NCS claims waiting for you to accept");
  return { text: c.firstName + " has a " + aw.type + " NCS award: " + euro(aw.rate) + " an hour off your fees for up to " + aw.agreedHours + " agreed hours a week. The subsidy shows as its own line on every invoice.", facts, go: { label: "See it on Payments", tab: "Payments" } };
}

function changeReply(c: Child, fid: string, place: string): SunnyReply {
  const s = getState(), p = policies(), lw = lockedWeek();
  const rate = locById(c.locationId)?.hourlyRate || 15;
  const pending = s.requests.filter(r => r.familyId === fid && r.status === "Pending");
  const facts = [
    "Late booking: hours at " + euro(rate) + ", plus " + euro(s.config.lateFee) + " late fee, plus " + euro(s.config.transportFee) + " for school collection",
    "Example: Friday 15:00-18:00 with collection is " + euro(3 * rate + s.config.lateFee + s.config.transportFee),
    p.partHours,
  ];
  pending.forEach(r => facts.push("Waiting for staff: " + r.kind.toLowerCase() + " " + r.id + " for " + fmtDay(r.date)));
  return {
    text: "The week of " + (lw ? fmtDate(lw.weekOf) : "this week") + " is locked, so late bookings and changes go to the " + place + " team for approval. " + p.notice + " " + p.weekend + " " + p.locked,
    facts, go: { label: "Request a change", tab: "Book" },
  };
}

function lateReply(c: Child): SunnyReply {
  const j = journey(c.id), l = locById(c.locationId);
  const rate = l?.hourlyRate || 15;
  return {
    text: "If you collect after your booked end time, it's billed as an extra hour at " + euro(rate) + ", because part hours are billed to the next full hour. If you're running late, message the " + (l?.short || "centre") + " team so they can let " + c.firstName + " know.",
    facts: j.booking ? [c.firstName + " is booked until " + j.booking.end + " today"] : undefined,
    go: { label: "Message the team", tab: "Messages", view: "team", prefill: "Running a bit late today, I'll be there by " },
  };
}

function closuresReply(fid: string, place: string): SunnyReply {
  const mid = midtermFacts(fid);
  const campLocs = Array.from(new Set(mid.camps.map(cp => locById(cp.locationId)?.short || cp.locationId)));
  const facts = [mid.regs.length ? "You have " + plural(mid.regs.length, "camp booking") : "You have no camp bookings for midterm"];
  facts.push("Booking window for " + (openWindow()?.label || "the next school week") + " closes " + (openWindow() ? fmtAt(openWindow()!.closes) : "soon"));
  return {
    text: "Monday " + fmtDate(MIDTERM_WEEK[0]) + " is the October bank holiday, and " + mid.range + " is the Halloween midterm, so there are no school runs that week." + (campLocs.length ? " Halloween camps run at " + listJoin(campLocs) + "." : "") + " After School at " + place + " is back on " + fmtDay(NEXT_SCHOOL_WEEK) + ".",
    facts, go: { label: "Book w/c 2 Nov", tab: "Book" },
  };
}

function collectorsReply(c: Child): SunnyReply {
  const ok = c.collectors.filter(x => x.permitted);
  const pw = ok.filter(x => x.note && /password/i.test(x.note));
  return {
    text: "These people can collect " + c.firstName + ": " + listJoin(ok.map(x => x.name + " (" + x.relation.toLowerCase() + ")")) + "." + (pw.length ? " A collection password is on file for " + listJoin(pw.map(x => x.name)) + "." : "") + " To add or remove someone, send the team a message and they'll update it.",
    go: { label: "Message the team", tab: "Messages", view: "team", prefill: "Please update " + c.firstName + "'s collectors: " },
  };
}
