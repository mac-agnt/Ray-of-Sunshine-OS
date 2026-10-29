/* Live numbers for the existing Pulse Dashboard (KPI band and area views),
   shaped exactly as the Pulse template expects but computed from the store. */
import { getState } from "./store";
import {
  headline, weekFinance, agedDebt, occupancy, scopedLocations, bookingsOn, ratioCheck, claimsPending, chickExpiring,
  underbooked, certAlerts, absentStaff, manifest, cached, revenueByLocation, collectionRate, family, invoiceBalance, overdueInvoices, reminderStage,
} from "./selectors";
import { THIS_WEEK, TODAY, euro0, dow } from "./time";

const pctS = (n: number) => Math.round(n * 100) + "%";
const k = (n: number) => (n >= 1000 ? "€" + (n / 1000).toFixed(1) + "k" : euro0(n));
const bars = (vals: number[]) => { const m = Math.max(1, ...vals); return vals.map(v => Math.max(0.12, v / m)); };

export function rosKpis(): Record<string, { label: string; value: string; delta: string; dir: "up" | "down"; hint: string; hero?: boolean }> {
  const h = headline(), w = weekFinance();
  return {
    revenue: { label: "Invoiced this week", value: euro0(w.invoiced), delta: w.count + " invoices", dir: "up", hint: "w/c 19 Oct", hero: true },
    cash: { label: "Collected", value: euro0(w.collected), delta: euro0(w.scheduled) + " DD Fri", dir: "up", hint: "this week" },
    overdue: { label: "Aged debt", value: euro0(h.aged), delta: h.overdue + " overdue", dir: "down", hint: "past due" },
    margin: { label: "Occupancy", value: pctS(h.occupancy), delta: h.bookedToday + " children", dir: "up", hint: "today" },
    jobs: { label: "Children booked", value: String(h.bookedToday), delta: h.onSite + " on site", dir: "up", hint: "today" },
    nps: { label: "Collection rate", value: pctS(h.mtdRate), delta: euro0(h.mtdCollected), dir: "up", hint: "month to date" },
    pipeline: { label: "Waitlist", value: String(h.waitlist), delta: getState().enquiries.length + " enquiries", dir: "up", hint: "children" },
    utilisation: { label: "NCS claims waiting", value: String(h.claims), delta: h.claimsToday + " lapse today", dir: "down", hint: "acceptance" },
  };
}

export function rosAspects(): any[] {
  return cached("aspects", () => {
    const s = getState(), locs = scopedLocations();
    const occByDay = THIS_WEEK.map(d => { const o = locs.map(l => occupancy(l.id, d)); const b = o.reduce((t, x) => t + x.booked, 0), c = o.reduce((t, x) => t + x.cap, 0); return c ? b / c : 0; });
    const occLoc = locs.map(l => ({ l, o: occupancy(l.id) })).sort((a, b) => b.o.rate - a.o.rate);
    const h = headline(), w = weekFinance(), ad = agedDebt(), rev = revenueByLocation();
    const pend = claimsPending(), ub = underbooked(), ce = certAlerts();
    const enq = (stage: string) => s.enquiries.filter(e => e.stage === stage).length;
    const funnelStages = ["New enquiry", "Contacted", "Visit booked", "Offered", "Registration sent", "Enrolled", "Started"];
    const cum = funnelStages.map((_, i) => s.enquiries.filter(e => funnelStages.indexOf(e.stage) >= i).length);
    const away = absentStaff(TODAY);
    const revLoc = locs.map(l => ({ l, r: rev.get(l.id)?.revenue || 0 })).sort((a, b) => b.r - a.r);
    const totalRev = revLoc.reduce((t, x) => t + x.r, 0) || 1;
    return [
      { id: "occupancy", label: "Occupancy", color: "var(--accent)", owner: "OPERATIONS", description: "Booked places against room and school-age capacity, by day and site.",
        kind: "columns", chartTitle: "Occupancy this week", chartUnit: "% OF PLACES",
        chart: THIS_WEEK.map((d, i) => [dow(d), Math.round(occByDay[i] * 100), pctS(occByDay[i])]),
        splitTitle: "Today by location", split: occLoc.slice(0, 5).map((x, i) => [x.l.short, String(x.o.booked), pctS(x.o.rate), i === 0 ? 1 : 0]),
        tableCols: ["Location", "Booked today", "Free places", "Capacity"], table: occLoc.slice(0, 6).map(x => [x.l.short, String(x.o.booked), String(Math.max(0, x.o.cap - x.o.booked)), String(x.o.cap)]),
        metrics: [["Occupancy today", pctS(h.occupancy), h.bookedToday + " children", "up", "all sessions", bars(occByDay)],
          ["Children booked", String(h.bookedToday), h.sessionsToday + " sessions", "up", "today", bars(THIS_WEEK.map(d => bookingsOn(d).length))],
          ["Waitlist", String(h.waitlist), s.waitlist.filter(x => x.priority === "Sibling").length + " siblings", "up", "children waiting", bars([18, 19, 20, 21, 21, 22, 22, 22, h.waitlist])],
          ["Enquiries", String(s.enquiries.length), enq("New enquiry") + " new", "up", "open pipeline", bars(cum)]] },
      { id: "finance", label: "Finance", color: "#8DB35E", owner: "ACCOUNTS", description: "Invoiced, collected and owed. Amounts are demo values derived from invoice lines.",
        kind: "columns", chartTitle: "Revenue by location this week", chartUnit: "EUR",
        chart: revLoc.map(x => [x.l.short.split(" ")[0], Math.round(x.r), k(x.r)]),
        splitTitle: "Aged debt", split: Object.entries(ad.buckets).map(([b, v], i) => [b + " days", k(v), Math.round((v / (ad.total || 1)) * 100) + "%", i === 3 ? 1 : 0]),
        tableCols: ["Family", "Balance", "Days", "Stage"], table: overdueInvoices().slice(0, 5).map(i => [family(i.familyId)!.surname + " · " + i.familyId, euro0(invoiceBalance(i)), "−" + Math.max(0, Math.round((Date.parse(TODAY) - Date.parse(i.due)) / 86400000)) + "d", reminderStage(i).label]),
        metrics: [["Invoiced this week", euro0(w.invoiced), w.count + " invoices", "up", "w/c 19 Oct", bars(revLoc.map(x => x.r))],
          ["Collected", euro0(w.collected), pctS(w.invoiced ? w.collected / w.invoiced : 0), "up", "this week", bars([0.6, 0.7, 0.75, 0.8, w.invoiced ? w.collected / w.invoiced : 0])],
          ["Aged debt", euro0(ad.total), h.overdue + " overdue", "down", "past due", bars(Object.values(ad.buckets))],
          ["Collection rate", pctS(w.mtdRate), "month to date", w.mtdRate > 0.9 ? "up" : "down", "October", bars(locs.map(l => collectionRate(l.id)))]] },
      { id: "ncs", label: "NCS", color: "#5fe0a8", owner: "NCS TEAM", description: "Awards, claims and agreed hours. NCS programme rules are labelled separately from our own policies.",
        kind: "funnel", chartTitle: "Claims this cycle", chartUnit: "CLAIMS",
        funnel: [["Claims raised", String(s.claims.length), "Sep–Oct", s.claims.length], ["Accepted", String(s.claims.filter(c => c.status === "Accepted").length), "by parents", s.claims.filter(c => c.status === "Accepted").length], ["Awaiting acceptance", String(pend.length), pend.filter(c => c.deadline.startsWith(TODAY)).length + " lapse today", pend.length]],
        chart: [["a", 1, "1"], ["b", 1, "1"]],
        splitTitle: "Awards by type", split: [["Income assessed", String(s.awards.filter(a => a.type === "Income assessed").length), "", 1], ["Universal", String(s.awards.filter(a => a.type === "Universal").length), "", 0]],
        tableCols: ["Family", "Booked", "Short", "Agreed"], table: ub.map(x => [x.family.surname + " · " + x.family.id, x.booked + "h", "−" + x.short + "h", x.agreed + "h"]),
        metrics: [["NCS families", String(s.families.filter(f => f.funding === "NCS").length), s.awards.length + " awards", "up", "60% of families", bars([1, 1, 1, 1])],
          ["Claims waiting", String(pend.length), pend.filter(c => c.deadline.startsWith(TODAY)).length + " today", "down", "acceptance", bars(pend.map(c => c.amount))],
          ["CHICKs expiring", String(chickExpiring().length), "this month", "down", "October", bars([3, 5, 6, 9, 14])],
          ["Under-booked", String(ub.length), "w/c 2 Nov", "down", "families", bars(ub.map(x => x.short))]] },
      { id: "staffing", label: "Staffing", color: "#6cb4ec", owner: "OPERATIONS", description: "Rostered against required at the demo ratios, with certificates that gate the rota.",
        kind: "rows", chartTitle: "Staff on shift today by site", chartUnit: "STAFF",
        rows: locs.map(l => { const r = ratioCheck(l.id, TODAY, "After School"); return [l.short + (r.ok ? "" : " · short"), r.rostered + " of " + r.required + " at 3pm", Math.max(1, r.rostered)]; }),
        chart: [["a", 1, "1"], ["b", 1, "1"]],
        splitTitle: "Today", split: [["On shift", String(h.staffToday), "", 1], ["Absent", String(away.size), "", 0], ["Blocked (vetting)", String(ce.expired.length), "", 0]],
        tableCols: ["Staff", "Certificate", "Days", "Site"], table: ce.soon.slice(0, 5).map(x => { const c = x.certs.slice().sort((a, b) => a.expires.localeCompare(b.expires))[0]; return [x.name, c.kind, "−" + Math.round((Date.parse(c.expires) - Date.parse(TODAY)) / 86400000) + "d", s.locations.find(l => l.id === x.locationId)!.short]; }),
        metrics: [["Staff on shift", String(h.staffToday), "today", "up", "all sites", bars([1, 1, 1])],
          ["Ratio alerts", String(h.ratioAlerts), "today and tomorrow", h.ratioAlerts ? "down" : "up", "demo thresholds", bars([1, 2, h.ratioAlerts || 0.2])],
          ["Certificates due", String(ce.soon.length), "within 30 days", "down", "renewals", bars([2, 3, 4, ce.soon.length])],
          ["Vetting lapsed", String(ce.expired.length), "blocked from rota", "down", "Garda", bars([0.2, 1])]] },
      { id: "enrolment", label: "Enrolment", color: "#C6D22F", owner: "LOCATION MANAGERS", description: "From first enquiry to a child starting, plus waitlists by site.",
        kind: "funnel", chartTitle: "Enquiry to start", chartUnit: "FAMILIES",
        funnel: [["Enquiries", String(cum[0]), "open and closed", cum[0]], ["Visit booked or later", String(cum[2]), Math.round((cum[2] / (cum[0] || 1)) * 100) + "% of enquiries", cum[2]], ["Offered or later", String(cum[3]), "", cum[3]], ["Enrolled or started", String(cum[5]), "", cum[5]]],
        chart: [["a", 1, "1"], ["b", 1, "1"]],
        splitTitle: "Enquiries by source", split: ["Website", "Facebook", "Phone", "Walk-in", "Referral"].map((src, i) => [src, String(s.enquiries.filter(e => e.source === src).length), "", i === 0 ? 1 : 0]),
        tableCols: ["Location", "Waiting", "Siblings", "Next start"], table: locs.map(l => ({ l, w: s.waitlist.filter(x => x.locationId === l.id) })).filter(x => x.w.length).map(x => [x.l.short, String(x.w.length), "+" + x.w.filter(y => y.priority === "Sibling").length, x.w.map(y => y.requestedStart).sort()[0].slice(5)]),
        metrics: [["Enquiries", String(s.enquiries.length), enq("New enquiry") + " new", "up", "pipeline", bars(cum)],
          ["Visits booked", String(enq("Visit booked")), "this fortnight", "up", "tours", bars([1, 2, enq("Visit booked")])],
          ["Waitlist", String(h.waitlist), "children", "up", "all sites", bars([20, 21, h.waitlist])],
          ["Registrations out", String(enq("Registration sent")), "awaiting forms", "up", "digital", bars([1, enq("Registration sent")])]] },
      { id: "transport", label: "Transport", color: "#9d8cf5", owner: "TRANSPORT", description: "School runs built from accepted bookings, by route and day. No runs during the Halloween midterm.",
        kind: "stacked", chartTitle: "Riders by day", chartUnit: "CHILDREN", legend: ["Wicklow", "Arklow", "Gorey and Cork"],
        stacked: THIS_WEEK.map(d => [dow(d), [manifest("WKR-01", d).length + manifest("WKR-02", d).length, manifest("ARK-01", d).length + manifest("ARK-02", d).length, manifest("GOR-01", d).length + manifest("CRK-01", d).length]]),
        chart: [["a", 1, "1"], ["b", 1, "1"]],
        splitTitle: "Today by route", split: s.routes.map((r, i) => [r.id, String(manifest(r.id, TODAY).length), "", i === 1 ? 1 : 0]),
        tableCols: ["Route", "Riders", "Stops", "First pickup"], table: s.routes.map(r => [r.id + " · " + r.name, String(manifest(r.id, TODAY).length), "+" + r.stops.length, r.stops[0].time]),
        metrics: [["Riders today", String(s.routes.reduce((t, r) => t + manifest(r.id, TODAY).length, 0)), "6 routes", "up", "after school", bars(THIS_WEEK.map(d => s.routes.reduce((t, r) => t + manifest(r.id, d).length, 0)))],
          ["Routes", String(s.routes.length), s.vehicles.length + " vehicles", "up", "running", bars([1, 1])],
          ["Stops", String(s.routes.reduce((t, r) => t + r.stops.length, 0)), "schools", "up", "collection points", bars([1, 1])],
          ["Fee per run", "€3.00", "demo rule", "up", "transport", bars([1])]] },
    ].map(a => ({ ...a, revShare: totalRev }));
  });
}
