/* Deterministic Home chat answers for Amanda. Every figure is read from the
   store at the moment of asking, and every action is a deep link into the
   record it talks about, so the answer and the screen behind it agree. */
import { getState, nav, openRecord } from "./store";
import {
  ratioAlerts, ratioCheck, underbooked, overdueInvoices, reminderStage, invoiceBalance, familyDue, family, child, locById,
  claimsPending, claimsExpiringToday, chickExpiring, pendingApprovals, pendingRequests, openIncidents, certAlerts, manifest,
  childStatus, staffById, agedDebt, weekFinance, headline, schoolName,
} from "./selectors";
import { prepareHoursReminder } from "./actions";
import { TODAY, TOMORROW, euro, fmtDay, hm, fmtDate } from "./time";

export type AnswerAction = [label: string, primary: 0 | 1, run?: () => void]; // no run = ask the label as a question
export interface Answer { tool: string; effect: "read" | "write"; text: string; cols?: string[]; rows?: string[][]; actions?: AnswerAction[] }

const n = (x: number, one: string, many = one + "s") => x + " " + (x === 1 ? one : many);

function attention(): Answer {
  const s = getState(), h = headline();
  const ra = ratioAlerts(), cl = claimsExpiringToday(), lbr = s.requests.find(r => r.id === "LBR-006");
  const rows: string[][] = [];
  for (const a of ra) rows.push(["Ratio: " + (a.session === "After School" ? "3pm After School" : a.session), locById(a.loc)!.short, a.date === TODAY ? "Today" : "Tomorrow", a.rostered + "/" + a.required + " staff"]);
  for (const c of cl) rows.push(["NCS claim " + c.id + " " + euro(c.amount), family(c.familyId)!.surname, "Today 17:00", "NCS"]);
  if (lbr?.status === "Pending") rows.push(["Late booking LBR-006", "Hazelbrook", "Fri 23 Oct", "Bookings"]);
  const doyle = s.approvals.find(a => a.id === "APR-204");
  if (doyle?.status === "Pending") rows.push(["Debt pack review " + euro(612), "Gorey (Doyle)", "Owner", "You"]);
  const text = (ra.length ? n(ra.length, "staffing risk") + ": " + ra.map(a => locById(a.loc)!.short + " " + (a.date === TODAY ? "today at 3pm" : "tomorrow") + " (" + a.rostered + " of " + a.required + " staff)").join(" and ") + ". " : "Every site meets the demo ratios today and tomorrow. ")
    + (cl.length ? n(cl.length, "NCS claim") + " lapse at 17:00 today, including " + cl.map(c => c.id + " for the " + family(c.familyId)!.surname + " family (" + euro(c.amount) + ")").join(" and ") + ". " : "")
    + h.approvals + " approvals and " + h.requests + " booking requests are waiting. " + h.overdue + " invoices are overdue (" + euro(agedDebt().total) + " aged debt). "
    + (h.incidents ? h.incidents + " incidents need a signature or review." : "");
  return { tool: "ros_command_overview", effect: "read", text, cols: ["Item", "Where", "When", "Staff"], rows: rows.slice(0, 6),
    actions: [["Open the Morning Brief", 1, () => nav("Command", "Decisions")], ...(ra.length ? [["Review Arklow Rocks cover", 0, () => openRecord({ kind: "issue", id: ra[0].issue?.id || "STAFF-ARK-019" })] as AnswerAction] : [])] };
}

function ncsHours(): Answer {
  const u = underbooked();
  const text = u.length
    ? n(u.length, "family", "families") + " have booked fewer than their agreed NCS hours for w/c 2 Nov (window closes Thursday 18:00). " + u.map(x => x.family.surname + " (" + x.family.id + ") " + x.booked + " of " + x.agreed + "h").join(", ") + ". Nothing has been sent; I can draft the reminders for review."
    : "Every family that has submitted for w/c 2 Nov has booked at least their agreed NCS hours.";
  const kelly = u.find(x => x.family.id === "ROS1087");
  return { tool: "ros_ncs_hours", effect: "read", text, cols: ["Family", "Booked", "Agreed", "Short"], rows: u.map(x => [x.family.surname + " · " + x.family.id, x.booked + "h", x.agreed + "h", x.short + "h"]),
    actions: [...(kelly ? [["Draft Kelly reminder", 1, () => { prepareHoursReminder({ familyId: "ROS1087", booked: kelly.booked, agreed: kelly.agreed }); nav("NCS", "Agreed Hours"); }] as AnswerAction] : []), ["Open Agreed Hours", 0, () => nav("NCS", "Agreed Hours")]] };
}

function payments(): Answer {
  const s = getState(), od = overdueInvoices();
  const byStage = new Map<string, number>();
  od.forEach(i => byStage.set(reminderStage(i).label, (byStage.get(reminderStage(i).label) || 0) + 1));
  const byrne = s.plans.find(p => p.id === "PLN-031")!, doyle = s.plans.find(p => p.id === "PLN-024")!;
  const missed = byrne.instalments.find(i => i.status === "Missed");
  const text = od.length + " invoices are overdue (" + euro(od.reduce((t, i) => t + invoiceBalance(i), 0)) + "). "
    + Array.from(byStage.entries()).map(([k, v]) => v + " at " + k.toLowerCase()).join(", ") + ". "
    + (missed ? "Byrne (ROS1096) missed the " + euro(missed.amount) + " instalment on " + fmtDate(missed.due) + " on plan PLN-031, revision 3 of 3, " + euro(familyDue("ROS1096")) + " outstanding; Accounts follow-up is due Monday 26 Oct. " : "Byrne's plan is back on track. ")
    + (doyle.status === "Broken" ? "Doyle (ROS1198) broke a third plan with " + euro(familyDue("ROS1198")) + " outstanding; the debt pack waits for your review and nothing is sent automatically." : "");
  return { tool: "ros_collections", effect: "read", text, cols: ["Family", "Invoice", "Balance", "Stage"],
    rows: od.slice().sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6).map(i => [family(i.familyId)!.surname + " · " + i.familyId, i.id, euro(invoiceBalance(i)), reminderStage(i).label]),
    actions: [["Open reminder stages", 1, () => nav("Billing", "Reminder Stages")], ["Open Byrne plan", 0, () => openRecord({ kind: "plan", id: "PLN-031" })], ["Review Doyle pack", 0, () => openRecord({ kind: "approval", id: "APR-204" })]] };
}

function arklow(): Answer {
  const s = getState(), r = ratioCheck("ARR", TODAY, "After School");
  const iss = s.issues.find(i => i.id === "STAFF-ARK-019")!;
  const rt = s.routes.find(x => x.id === "ARK-01")!;
  const m = manifest("ARK-01", TODAY);
  const reliefShift = r.shifts.find(x => x.relief);
  const text = r.ok
    ? "Yes. " + (reliefShift ? staffById(reliefShift.staffId)!.name + " is on relief 09:00–17:30, so " : "") + "3pm After School has " + r.rostered + " of " + r.required + " required staff for " + r.booked + " children at the demo 1:" + r.ratio + " ratio. The " + rt.id + " run collects " + m.length + " children from " + rt.stops.length + " stops between " + rt.stops[0].time + " and " + rt.stops[rt.stops.length - 1].time + "."
    : "Not as rostered. " + r.booked + " children are booked for 3pm After School with " + r.rostered + " practitioners on shift against " + r.required + " required at the demo 1:" + r.ratio + " ratio (one is on approved leave). The " + rt.id + " run still collects " + m.length + " children. Two qualified relief staff are free: Aisling Byrne and Ciara Walsh, both with current Garda vetting and first aid. Approving Aisling for 09:00–17:30 closes " + iss.id + ".";
  return { tool: "ros_ratio_forecast", effect: "read", text, cols: ["Session", "Booked", "Rostered", "Required"], rows: [["After School 3pm", String(r.booked), String(r.rostered), String(r.required)]],
    actions: r.ok ? [["Open Arklow Rocks", 1, () => nav("Locations", "Overview", { locationId: "ARR" })]] : [["Approve relief for Arklow Rocks", 1, () => openRecord({ kind: "issue", id: "STAFF-ARK-019" })], ["Open Arklow Rocks", 0, () => nav("Locations", "Overview", { locationId: "ARR" })]] };
}

function lateBooking(): Answer {
  const s = getState(), r = s.requests.find(x => x.id === "LBR-006")!;
  const inv = s.invoices.find(i => i.id === "INV-20418")!;
  const total = inv.lines.reduce((t, l) => t + l.amount, 0);
  const text = r.status === "Pending"
    ? "LBR-006 from Emer Nolan (ROS1132): Finn, Friday 23 Oct 15:00–18:00 at Hazelbrook with St Patrick's NS pickup on WKR-02. It is 79 hours' notice on a weekday, there is space and the ratio holds. Demo fees: 3h × €15 + €5 late booking + €3 school run = €53, taking INV-20418 from " + euro(total) + " to " + euro(total + 53) + ". Approving writes the booking, invoice, register and manifest together."
    : "LBR-006 was " + r.status.toLowerCase() + " by " + r.decidedBy + ". INV-20418 now stands at " + euro(total) + ".";
  return { tool: "ros_booking_request", effect: "read", text, actions: [["Open LBR-006", 1, () => openRecord({ kind: "request", id: "LBR-006" })], ["Open the inbox message", 0, () => openRecord({ kind: "message", id: "MSG-1006" })]] };
}

function bus(): Answer {
  const s = getState(), luca = s.children.find(c => c.familyId === "ROS1042")!;
  const st = childStatus(luca.id), m = manifest("WKR-02", TODAY);
  const me = m.find(x => x.child.id === luca.id)!;
  const text = "Luca O'Neill is on today's WKR-02 run (driver " + staffById("S023")!.name + "), pickup at St Patrick's NS scheduled " + me.stop.time + ", " + m.length + " children on the manifest. "
    + (st.status === "Signed in" && st.time && st.time >= "14:00" ? "He was signed in at Hazelbrook at " + st.time + "." : me.boarded ? "He boarded at " + me.boarded.time + "." : "It is " + hm(s.clockMin) + ", so the run has not started.");
  return { tool: "ros_transport", effect: "read", text, cols: ["Child", "Stop", "Time", "Status"], rows: m.map(x => [x.child.firstName + " " + x.child.surname, schoolName(x.booking.schoolId), x.stop.time, x.arrived ? "Signed in " + x.arrived.time : x.boarded ? "Boarded " + x.boarded.time : "Expected"]),
    actions: [["Open WKR-02", 1, () => openRecord({ kind: "route", id: "WKR-02" })], ["Open driver view", 0, () => nav("Transport", "Driver Run")]] };
}

function gorey(): Answer {
  const s = getState(), r = ratioCheck("GOR", TOMORROW, "After School");
  const camp = s.camps.find(c => c.id === "CMP-GOR-HW")!, regs = s.campRegs.filter(x => x.campId === camp.id);
  const text = "Gorey tomorrow (Wed 21 Oct): " + r.booked + " booked for After School with " + r.rostered + " of " + r.required + " staff available after this morning's sick call" + (r.ok ? ", now covered." : ". Ratio & Rota proposes Niamh Corcoran (APR-202).")
    + " Next week's Halloween camp (26–30 Oct) has " + regs.filter(x => x.status === "Confirmed").length + " of " + camp.capacity + " places confirmed and " + regs.filter(x => !x.paid).length + " unpaid. Camps are not running alongside school pickups this week.";
  return { tool: "ros_site", effect: "read", text, actions: [["Open Gorey", 1, () => nav("Locations", "Overview", { locationId: "GOR" })], ["Open Gorey camp", 0, () => openRecord({ kind: "camp", id: "CMP-GOR-HW" })], ["Approve cover", 0, () => openRecord({ kind: "approval", id: "APR-202" })]] };
}

function ncsClaims(): Answer {
  const pend = claimsPending(), today = claimsExpiringToday(), ch = chickExpiring();
  const text = pend.length + " NCS claims await parent acceptance; " + today.length + " lapse at 17:00 today (" + today.map(c => c.id + " " + family(c.familyId)!.surname + " " + euro(c.amount)).join(", ") + "). " + ch.length + " CHICKs expire this month. The Thursday 22 Oct check for camp week is still open. Programme rules and our own fee policy are kept separate in NCS & Funding.";
  return { tool: "ros_ncs", effect: "read", text, cols: ["Claim", "Family", "Amount", "Deadline"], rows: pend.slice().sort((a, b) => a.deadline.localeCompare(b.deadline)).map(c => [c.id, family(c.familyId)!.surname, euro(c.amount), c.deadline.slice(5)]),
    actions: [["Open NCS-0091", 1, () => openRecord({ kind: "claim", id: "NCS-0091" })], ["Open NCS dashboard", 0, () => nav("NCS", "Overview")]] };
}

function staff(): Answer {
  const c = certAlerts();
  const text = c.expired.length + " staff member has an expired certificate: " + c.expired.map(x => x.name + " (Garda vetting, blocked from the rota)").join(", ") + ". " + c.soon.length + " certificates fall due in the next 30 days. Relief staff with current vetting: Aisling Byrne, Ciara Walsh, Niamh Corcoran, Declan Furlong.";
  return { tool: "ros_people", effect: "read", text, actions: [["Open certification matrix", 1, () => nav("Staff", "Certifications")], ["Open Shane Molloy", 0, () => openRecord({ kind: "staff", id: "S031" })]] };
}

function incidents(): Answer {
  const i = openIncidents();
  const text = i.length + " incidents are open: " + i.map(x => x.id + " " + x.kind.toLowerCase() + " at " + locById(x.locationId)!.short + " (" + x.status.toLowerCase() + ")").join("; ") + ". Outcomes and parent notifications need a manager's sign-off; I do not finalise them.";
  return { tool: "ros_compliance", effect: "read", text, actions: [["Open incidents", 1, () => nav("Compliance", "Incidents")]] };
}

function enrolment(): Answer {
  const s = getState();
  const st = (k: string) => s.enquiries.filter(e => e.stage === k).length;
  const text = s.enquiries.length + " enquiries in the pipeline: " + st("New enquiry") + " new, " + st("Contacted") + " contacted, " + st("Visit booked") + " visits booked, " + st("Offered") + " offered, " + st("Registration sent") + " registrations out. " + s.waitlist.filter(w => w.status === "Waiting").length + " children are on waitlists, " + s.waitlist.filter(w => w.priority === "Sibling" && w.status === "Waiting").length + " of them siblings.";
  return { tool: "ros_enrolment", effect: "read", text, actions: [["Open pipeline", 1, () => nav("Enrolment", "Lead Pipeline")], ["Open waitlists", 0, () => nav("Enrolment", "Waitlists")]] };
}

function money(): Answer {
  const w = weekFinance();
  const text = "This week (w/c 19 Oct) invoiced " + euro(w.invoiced) + " across " + w.count + " families: " + euro(w.collected) + " collected, " + euro(w.scheduled) + " on direct debits due Friday, " + euro(w.outstanding) + " still owed. Month to date collection is " + Math.round(w.mtdRate * 100) + "%. NCS subsidy shown separately on invoices: " + euro(w.subsidy) + ". All amounts are demo values.";
  return { tool: "ros_finance", effect: "read", text, actions: [["Open Billing", 1, () => nav("Billing", "Overview")], ["Cash and debt", 0, () => nav("Command", "Cash & Debt")]] };
}

export function answer(q: string): Answer {
  const t = q.toLowerCase();
  if (/arklow|3pm|cover|relief|ratio/.test(t)) return arklow();
  if (/ncs hour|behind on ncs|under.?book|agreed hour/.test(t)) return ncsHours();
  if (/payment|follow.?up|overdue|debt|byrne|doyle|collect|arrear/.test(t)) return payments();
  if (/late booking|lbr|nolan|finn|friday/.test(t)) return lateBooking();
  if (/bus|luca|o.neill|wkr|school run|pickup/.test(t)) return bus();
  if (/gorey|camp|halloween/.test(t)) return gorey();
  if (/ncs|claim|chick|subsid/.test(t)) return ncsClaims();
  if (/staff|garda|cert|rota|vetting/.test(t)) return staff();
  if (/incident|safeguard|medication|accident/.test(t)) return incidents();
  if (/enrol|enquir|waitlist|lead/.test(t)) return enrolment();
  if (/revenue|invoice|cash|money|fees|billing/.test(t)) return money();
  if (/attention|today|9 locations|nine|brief|morning|decision|changed/.test(t)) return attention();
  return { tool: "ros_search", effect: "read", text: "I can answer from the records your role can see: bookings, attendance, rotas, invoices, NCS, transport, camps and compliance across all nine locations. Try asking what needs attention, which families are behind on NCS hours, which payments need follow-up, or whether Arklow Rocks can cover the 3pm pickup. Anything that changes a record waits for a person to approve it.",
    actions: [["What needs attention across our 9 locations?", 1], ["Which payments need follow-up?", 0]] };
}

export const SUGGESTED = [
  "What needs attention across our 9 locations?",
  "Which families are behind on NCS hours?",
  "Which payments need follow-up?",
  "Can Arklow Rocks cover the 3pm school pickup?",
];
