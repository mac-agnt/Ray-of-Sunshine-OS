/* Reports: owner and location-filtered views over the same records every
   other module reads. Each chart has a site filter (the header location) and
   a period filter, and every bar opens the module or record behind it.
   Exports are generated in the browser from the rows on screen. Nothing here
   claims savings or makes regulatory determinations. */
import { useState, Fragment } from "react";
import type { LocationId, Tone, CertKind, ISODate, Session, EnquiryStage } from "../types";
import { useRos, nav, setUi, openRecord, defineAction, getState } from "../store";
import {
  occupancy, weekOccupancy, collectionRate, revenueByLocation, agedDebt, weekFinance, overdueInvoices, invoiceTotal, invoicePaid,
  invoiceBalance, invoiceStatus, reminderStage, daysOverdue, family, child, childName, locById, staffById, idx, cached, inScope, scopeLoc,
  scopedLocations, bookingsOn, ratioCheck, manifest, register, claimsPending, claimsExpiringToday, chickExpiring, underbooked, certStatus,
  openIncidents, absentStaff, pendingRequests,
} from "../selectors";
import { prepareHoursReminder } from "../actions";
import { TODAY, THIS_WEEK, fmtDay, fmtDate, euro, euro0, pct, toMin, dow, daysBetween, addDays } from "../time";
import { Page, PageHead, Card, Kpi, Grid, Table, Badge, StatusBadge, Btn, RecLink, HBars, StackBar, Callout, Seg, ListRow, DemoTag, Empty, Row, Sub, toneInk, type Col } from "../ui";
import { ClickCols, PairCols, goTo, longDate, plural, siteTag } from "./IrelandMap";

/* ---------------- export logging (new action) ---------------- */
/** Records a CSV export in Activity. The file itself is built in the browser; nothing is uploaded. */
export const logExport = defineAction<{ file: string; rows: number; scope: string }>("report.export", (_s, p, ctx) => {
  ctx.log({ category: "System", title: "Export generated: " + p.file, detail: p.rows + " rows · " + p.scope + ". Built in the browser from demo data; nothing was uploaded or sent." });
}, { toast: (p) => p.file + " downloaded (" + p.rows + " rows). Logged to Activity." });

type Cell = string | number;
function downloadCsv(file: string, header: string[], rows: Cell[][], scope: string) {
  const esc = (v: Cell) => { const t = String(v ?? ""); return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const text = [header, ...rows].map(r => r.map(esc).join(",")).join("\r\n");
  try {
    const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch { /* the log still records the attempt */ }
  logExport({ file, rows: rows.length, scope });
}

const kfmt = (n: number) => (Math.abs(n) >= 1000 ? "€" + (n / 1000).toFixed(1) + "k" : euro0(n));
const STAGES: EnquiryStage[] = ["New enquiry", "Contacted", "Visit booked", "Offered", "Registration sent", "Enrolled", "Started"];
const CERTS: CertKind[] = ["Garda vetting", "First aid", "Children First", "Manual handling", "Safe driving", "Food safety"];
const shiftHours = (start: string, end: string) => (toMin(end) - toMin(start)) / 60;

/** Gross positive invoice lines on the w/c 19 Oct invoices, by the child's site, optionally for one date. */
function revenueOn(date?: ISODate): Map<string, number> {
  return cached("rpt:rev:" + (date || "week"), () => {
    if (!date) { const m = new Map<string, number>(); for (const [k, v] of revenueByLocation()) m.set(k, v.revenue); return m; }
    const m = new Map<string, number>();
    for (const inv of getRows().invWeek) for (const ln of inv.lines) {
      if (ln.amount <= 0 || !ln.childId || ln.date !== date) continue;
      const c = child(ln.childId); if (!c) continue;
      m.set(c.locationId, (m.get(c.locationId) || 0) + ln.amount);
    }
    return m;
  });
}
/** Gross positive lines on invoices issued in October, by site. */
function revenueMonth(): Map<string, number> {
  return cached("rpt:revm", () => {
    const m = new Map<string, number>();
    for (const inv of getRows().invMonth) for (const ln of inv.lines) {
      if (ln.amount <= 0) continue;
      const loc = ln.childId ? child(ln.childId)?.locationId : family(inv.familyId)?.locationId;
      if (loc) m.set(loc, (m.get(loc) || 0) + ln.amount);
    }
    return m;
  });
}
/** Staff-cost proxy: hourly cost × rostered hours, absences removed. */
function staffCost(dates: ISODate[]): Map<string, number> {
  return cached("rpt:cost:" + dates.join(","), () => {
    const m = new Map<string, number>();
    for (const d of dates) {
      const away = absentStaff(d);
      for (const x of getRows().shifts.filter(x => x.date === d && !away.has(x.staffId))) {
        const st = staffById(x.staffId); if (!st) continue;
        m.set(x.locationId, (m.get(x.locationId) || 0) + st.hourlyCost * shiftHours(x.start, x.end));
      }
    }
    return m;
  });
}
function getRows() {
  return cached("rpt:rows", () => {
    const s = getState();
    return {
      invWeek: s.invoices.filter(i => i.weekOf === "2026-10-19"),
      invMonth: s.invoices.filter(i => i.issued >= "2026-10-01"),
      shifts: s.shifts.filter(x => x.status !== "proposed"),
    };
  });
}

type Period = string;
export default function Reports({ tab }: { tab: string }) {
  const { s, ui, role } = useRos();
  const [per, setPer] = useState<Record<string, Period>>({});
  const sc = scopeLoc();
  const where = sc === "ALL" ? "All " + s.locations.length + " locations" : locById(sc)?.name || sc;
  const periodFor = (opts: [string, string][]) => {
    const v = per[tab] && opts.some(o => o[0] === per[tab]) ? per[tab] : opts[0][0];
    return { value: v, seg: <Seg size="sm" value={v} onChange={(x: string) => setPer({ ...per, [tab]: x })} options={opts} /> };
  };
  const siteSel = role.scope === "ALL"
    ? <select aria-label="Report site" className="ros-input" value={ui.loc} onChange={(e) => setUi({ loc: e.target.value as LocationId | "ALL" })} style={{ width: 190, height: 30, borderRadius: 999 }}>
        <option value="ALL">All 9 locations</option>
        {s.locations.map(l => <option key={l.id} value={l.id}>{l.short}</option>)}
      </select>
    : <Badge tone="info">{where}</Badge>;
  const P: Record<string, [string, string][]> = {
    Executive: [["week", "This week"], ["today", "Today"]],
    Operations: [["today", "Today"], ["mon", "Mon 19 Oct"]],
    Finance: [["week", "This week"], ["month", "October to date"]],
    NCS: [["week", "This week"], ["month", "October to date"]],
    "Staff & Compliance": [["30", "Next 30 days"], ["90", "Next 90 days"]],
    Exports: [["week", "This week"], ["month", "October"], ["overdue", "Overdue only"]],
  };
  const p = periodFor(P[tab] || P.Executive);
  const head = (title: string, sub: string) => (
    <PageHead eyebrow={"Reports · " + tab + " · " + where} title={title} sub={sub}
      right={<>{siteSel}{p.seg}<Btn size="sm" variant="subtle" onClick={() => window.print()}>Print</Btn></>} />
  );
  switch (tab) {
    case "Operations": return <Page>{head("Operations", "Attendance against bookings, ratio cover for the week and school-run loads. Demo ratios are illustrative configuration.")}<Ops period={p.value} /></Page>;
    case "Finance": return <Page>{head("Finance", "Revenue, collections, aged debt and how families pay. Payments in this demo are simulated.")}{role.finance ? <Finance period={p.value} /> : <Restricted what="Finance reports" />}</Page>;
    case "NCS": return <Page>{head("NCS", "Awards, claims, subsidy and under-booked hours. Rates are demo configuration, not programme determinations.")}<Ncs period={p.value} /></Page>;
    case "Staff & Compliance": return <Page>{head("Staff and compliance", "Certificate status, incidents, policies and site checks.")}<StaffCompliance period={p.value} /></Page>;
    case "Exports": return <Page>{head("Exports", "CSV files built in your browser from the rows on screen, following the site filter above.")}<Exports period={p.value} /></Page>;
    default: return <Page>{head("Executive summary", "The group on one page: occupancy, cash, demand, safety and a staff-cost proxy.")}<Executive period={p.value} /></Page>;
  }
}
const Restricted = ({ what }: { what: string }) => <Card><Callout tone="neutral" title="Restricted">{what} are visible to authorised roles only. Switch role in the header to compare.</Callout></Card>;

/* ================================ Executive ================================ */
function Executive({ period }: { period: Period }) {
  const { s, role } = useRos();
  const sites = scopedLocations();
  const ids = sites.map(l => l.id) as string[];
  const days = period === "today" ? [TODAY] : THIS_WEEK;
  const occ = sites.map(l => {
    const o = days.map(d => occupancy(l.id, d)).reduce((a, x) => ({ b: a.b + x.booked, c: a.c + x.cap }), { b: 0, c: 0 });
    return { l, rate: o.c ? o.b / o.c : 0, b: o.b, c: o.c };
  });
  const occAll = occ.reduce((a, x) => ({ b: a.b + x.b, c: a.c + x.c }), { b: 0, c: 0 });
  const rev = revenueOn(period === "today" ? TODAY : undefined), cost = staffCost(days);
  const revT = ids.reduce((n, id) => n + (rev.get(id) || 0), 0), costT = ids.reduce((n, id) => n + (cost.get(id) || 0), 0);
  const enq = s.enquiries.filter(e => inScope(e.locationId));
  const conv = enq.filter(e => e.stage === "Enrolled" || e.stage === "Started").length;
  const incMonth = s.incidents.filter(i => inScope(i.locationId) && i.date >= "2026-10-01");
  const coll = weekFinance().mtdRate;
  const aged = agedDebt();
  const drillBilling = (id: LocationId) => () => { if (role.scope === "ALL") setUi({ loc: id }); nav("Billing", "Invoices"); };
  const fin = role.finance;
  return (
    <>
      <Grid min={160} gap={10}>
        <Kpi label={"Occupancy " + (period === "today" ? "today" : "this week")} value={pct(occAll.c ? occAll.b / occAll.c : 0)} sub={occAll.b + " of " + occAll.c + " place-days"} onClick={goTo("Locations", "Capacity & Performance")} />
        <Kpi label="Collection rate MTD" value={fin ? pct(coll, 1) : "Restricted"} sub="Received vs billed in October" onClick={fin ? goTo("Billing", "Overview") : undefined} />
        <Kpi label="Aged debt" value={fin ? euro0(aged.total) : "Restricted"} tone={fin ? "warn" : undefined} sub={plural(overdueInvoices().length, "overdue invoice")} onClick={fin ? goTo("Billing", "Reminder Stages") : undefined} />
        <Kpi label="Enquiry to enrolment" value={pct(enq.length ? conv / enq.length : 0)} sub={conv + " of " + enq.length + " enquiries this term"} onClick={goTo("Enrolment", "Lead Pipeline")} />
        <Kpi label="Incidents in October" value={incMonth.length} tone={openIncidents().length ? "warn" : "ok"} sub={openIncidents().length + " still open"} onClick={goTo("Compliance", "Incidents")} />
        <Kpi label="Staff-cost proxy vs revenue" value={revT ? pct(costT / revT) : "n/a"} sub={role.payroll ? euro0(costT) + " vs " + euro0(revT) + " (proxy)" : "Proxy · € detail payroll only"} tone="info" />
      </Grid>
      <div className="ros-split-even" style={{ marginTop: 16 }}>
        <Card title={"Occupancy by site · " + (period === "today" ? "today" : "this week")} sub="Booked places against capacity. Select a site for its capacity view.">
          <HBars format={n => pct(n)} max={1} items={occ.slice().sort((a, b) => b.rate - a.rate).map(x => ({ label: x.l.short, value: x.rate, sub: x.b + "/" + x.c, tone: (x.rate >= 0.97 ? "warn" : "accent") as Tone, onClick: goTo("Locations", "Capacity & Performance", { locationId: x.l.id }) || (() => openRecord({ kind: "location", id: x.l.id })) }))} />
        </Card>
        <Card title="Revenue vs staff-cost proxy" sub={"Gross invoice lines (before NCS subsidy) against hourly cost × rostered hours, " + (period === "today" ? "today" : "Mon to Fri") + ". Figures above the bars are cost as a share of revenue. A proxy only: excludes HQ salaries, rent and overheads."}>
          {fin ? <PairCols names={["Revenue", "Staff-cost proxy"]} tones={["accent", "warn"]} format={kfmt} top={d => (d.a ? pct(d.b / d.a) : "n/a")} data={sites.map(l => ({ label: siteTag(l.id), a: rev.get(l.id) || 0, b: cost.get(l.id) || 0, hint: l.short + " · revenue " + euro0(rev.get(l.id) || 0) + " · cost proxy " + (role.payroll ? euro0(cost.get(l.id) || 0) : pct((cost.get(l.id) || 0) / Math.max(1, rev.get(l.id) || 0)) + " of revenue"), onClick: goTo("Locations", "Overview", { locationId: l.id }) || (() => openRecord({ kind: "location", id: l.id })) }))} /> : <Callout tone="neutral" title="Restricted">Revenue detail is visible to finance roles only.</Callout>}
        </Card>
        <Card title="Enquiry funnel" sub="Current stage of every enquiry in scope. Select a stage for the pipeline.">
          <HBars items={STAGES.map(st => ({ label: st, value: enq.filter(e => e.stage === st).length, tone: (st === "Enrolled" || st === "Started" ? "ok" : "accent") as Tone, onClick: goTo("Enrolment", "Lead Pipeline") || (() => openRecord({ kind: "enquiry", id: enq.find(e => e.stage === st)?.id || "" })) }))} />
        </Card>
        <Card title="Collected on due invoices, by site" sub="October invoices already due (direct debits not yet due are excluded). Select a site to open its invoices.">
          {fin ? <HBars format={n => pct(n, 1)} max={1} items={sites.map(l => ({ label: l.short, value: collectionRate(l.id), tone: (collectionRate(l.id) < 0.97 ? "warn" : "ok") as Tone, sub: overdueInvoices().filter(i => family(i.familyId)?.locationId === l.id).length + " overdue", onClick: drillBilling(l.id) })).sort((a, b) => a.value - b.value)} /> : <Callout tone="neutral" title="Restricted">Collection detail is visible to finance roles only.</Callout>}
        </Card>
      </div>
    </>
  );
}

/* =============================== Operations =============================== */
function Ops({ period }: { period: Period }) {
  const { s } = useRos();
  const [sess, setSess] = useState<"After School" | "Morning" | "Early Years">("After School");
  const day: ISODate = period === "mon" ? "2026-10-19" : TODAY;
  const sites = scopedLocations();
  const att = sites.map(l => {
    const bk = bookingsOn(day, l.id);
    const kids = new Set(bk.map(b => b.childId));
    let seen = 0;
    for (const id of kids) if ((idx().attendanceByChildDate.get(id + "|" + day) || []).some(e => e.kind === "in" || e.kind === "boarded")) seen++;
    return { l, booked: kids.size, seen };
  });
  const booked = att.reduce((n, x) => n + x.booked, 0), seen = att.reduce((n, x) => n + x.seen, 0);
  const cell = (loc: LocationId, d: ISODate) => {
    if (sess === "Early Years") {
      const rooms = s.rooms.filter(r => r.locationId === loc && r.kind !== "SAC");
      if (!rooms.length) return null;
      const rs = rooms.map(rm => ratioCheck(loc, d, "Full Day", rm.id));
      return { booked: rs.reduce((n, r) => n + r.booked, 0), rostered: rs.reduce((n, r) => n + r.rostered, 0), required: rs.reduce((n, r) => n + r.required, 0), ok: rs.every(r => r.ok), issue: undefined as string | undefined };
    }
    const r = ratioCheck(loc, d, sess as Session);
    return { booked: r.booked, rostered: r.rostered, required: r.required, ok: r.ok, issue: s.issues.find(i => i.locationId === loc && i.date === d && i.session === sess)?.id };
  };
  const gaps = sites.reduce((n, l) => n + THIS_WEEK.filter(d => { const c = cell(l.id, d); return c && !c.ok; }).length, 0);
  const routes = s.routes.filter(r => inScope(r.locationId));
  const loads = cached("rpt:loads", () => { const m = new Map<string, number>(); for (const r of s.routes) for (const d of THIS_WEEK) m.set(r.id + d, manifest(r.id, d).length); return m; });
  const ridersToday = routes.reduce((n, r) => n + (loads.get(r.id + TODAY) || 0), 0);
  return (
    <>
      <Grid min={150} gap={10}>
        <Kpi label={"Booked · " + (day === TODAY ? "today" : fmtDay(day))} value={booked} sub="Children with a session" onClick={goTo("Bookings", "Registers")} />
        <Kpi label="Attended so far" value={seen} tone="ok" sub={day === TODAY ? "Signed in or boarded by now" : "Signed in at some point"} onClick={goTo("Locations", "Attendance Status")} />
        <Kpi label="Attendance rate" value={pct(booked ? seen / booked : 0)} sub={day === TODAY ? "Rises through the day" : "Complete day"} />
        <Kpi label="Ratio gaps this week" value={gaps} tone={gaps ? "bad" : "ok"} sub={sess + " sessions"} onClick={goTo("Bookings", "Ratios")} />
        <Kpi label="School-run riders today" value={ridersToday} sub={plural(routes.length, "route")} onClick={goTo("Transport", "Daily Manifests")} />
        <Kpi label="Requests pending" value={pendingRequests().length} sub="Late, change and cancel" onClick={goTo("Bookings", "Late & Change Requests")} />
      </Grid>
      <Card title={"Attendance by site · " + longDate(day)} sub={day === TODAY ? "In progress: most school-age children arrive after 14:00. Select a site for its register." : "Monday is complete: every booked child came and went. Select a site for its register."} style={{ marginTop: 16 }}>
        <PairCols names={["Booked", "Attended"]} data={att.map(x => ({ label: siteTag(x.l.id), a: x.booked, b: x.seen, hint: x.l.short + ": " + x.seen + " of " + x.booked, onClick: goTo("Locations", "Attendance Status", { locationId: x.l.id }) || (() => openRecord({ kind: "location", id: x.l.id })) }))} />
      </Card>
      <div className="ros-split-even" style={{ marginTop: 16 }}>
        <Card pad={false} title="Ratio cover this week" sub="Staff assigned of required, by site and day. Select a short cell to open its cover options.">
          <div style={{ padding: "0 12px 10px" }}><Seg size="sm" value={sess} onChange={setSess} options={["After School", "Morning", "Early Years"] as ("After School" | "Morning" | "Early Years")[]} /></div>
          <Matrix rows={sites.map(l => ({ id: l.id, label: l.short }))} cols={THIS_WEEK.map(d => ({ id: d, label: dow(d) }))} render={(r, c) => {
            const x = cell(r as LocationId, c);
            if (!x || !x.booked) return { text: x ? "·" : "n/a", tone: "neutral" as Tone };
            return { text: x.rostered + "/" + x.required, tone: (x.ok ? "ok" : "bad") as Tone, title: x.booked + " booked", onClick: x.issue ? () => openRecord({ kind: "issue", id: x.issue! }) : goTo("Bookings", "Ratios") };
          }} />
        </Card>
        <Card pad={false} title="School-run loads" sub="Riders on each route by day against seats. Midterm week has no school runs. Select a cell for the route.">
          <Matrix rows={routes.map(r => ({ id: r.id, label: r.id }))} cols={THIS_WEEK.map(d => ({ id: d, label: dow(d) }))} render={(r, c) => {
            const rt = s.routes.find(x => x.id === r)!; const seats = s.vehicles.find(v => v.id === rt.vehicleId)?.seats || 0;
            const n = loads.get(r + c) || 0;
            return { text: n + "/" + seats, tone: (n >= seats - 2 ? "warn" : n ? "accent" : "neutral") as Tone, title: rt.name, onClick: () => openRecord({ kind: "route", id: r }) };
          }} />
        </Card>
      </div>
    </>
  );
}

function Matrix({ rows, cols, render }: { rows: { id: string; label: string }[]; cols: { id: string; label: string }[]; render: (r: string, c: string) => { text: string; tone: Tone; title?: string; onClick?: () => void } }) {
  return (
    <div className="ros-scroll-x" style={{ padding: "0 12px 12px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(96px,1.3fr) repeat(" + cols.length + ",minmax(54px,1fr))", gap: 4, minWidth: 96 + cols.length * 58 }}>
        <span />
        {cols.map(c => <span key={c.id} style={{ fontSize: 11, color: "var(--faint)", textAlign: "center", padding: "4px 0" }}>{c.label}</span>)}
        {rows.map(r => (
          <Fragment key={r.id}>
            <span style={{ fontSize: 12.5, color: "var(--body)", alignSelf: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
            {cols.map(c => {
              const v = render(r.id, c.id);
              const bg = v.tone === "neutral" ? "var(--surface-2)" : "color-mix(in srgb, " + toneInk[v.tone] + " 18%, transparent)";
              return (
                <button key={r.id + c.id} className="ros-focus" disabled={!v.onClick} onClick={v.onClick} title={v.title}
                  style={{ height: 30, border: 0, borderRadius: 8, background: bg, color: v.tone === "neutral" ? "var(--faint)" : toneInk[v.tone], fontSize: 12, fontVariantNumeric: "tabular-nums", cursor: v.onClick ? "pointer" : "default", fontWeight: v.tone === "bad" ? 600 : 500 }}>
                  {v.text}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/* ================================= Finance ================================= */
function Finance({ period }: { period: Period }) {
  const { s, role } = useRos();
  const sites = scopedLocations();
  const month = period === "month";
  const invs = (month ? getRows().invMonth : getRows().invWeek).filter(i => inScope(family(i.familyId)?.locationId));
  const invoiced = invs.reduce((n, i) => n + Math.max(0, invoiceTotal(i)), 0);
  const collected = invs.reduce((n, i) => n + Math.min(invoicePaid(i), Math.max(0, invoiceTotal(i))), 0);
  const dd = invs.filter(i => invoiceStatus(i) === "Scheduled DD").reduce((n, i) => n + invoiceBalance(i), 0);
  const rev = month ? revenueMonth() : revenueOn();
  const aged = agedDebt();
  const from = month ? "2026-10-01" : "2026-10-19";
  const pays = s.payments.filter(p => p.date >= from && inScope(family(p.familyId)?.locationId));
  const ok = pays.filter(p => p.status === "Succeeded"), failed = pays.filter(p => p.status === "Failed");
  const methods = new Map<string, number>();
  for (const p of ok) { const k = p.method.replace(" (simulated)", ""); methods.set(k, (methods.get(k) || 0) + p.amount); }
  const mTone: Tone[] = ["accent", "info", "ok", "warn", "neutral"];
  const mList = [...methods.entries()].sort((a, b) => b[1] - a[1]);
  const weeks = ["2026-10-05", "2026-10-12", "2026-10-19"].map(w => {
    const inv = s.invoices.filter(i => i.weekOf === w && inScope(family(i.familyId)?.locationId));
    return { w, a: inv.reduce((n, i) => n + Math.max(0, invoiceTotal(i)), 0), b: inv.reduce((n, i) => n + Math.min(invoicePaid(i), Math.max(0, invoiceTotal(i))), 0) };
  });
  const B = ["0–7", "8–30", "31–60", "60+"];
  const site = (id: LocationId) => () => { if (role.scope === "ALL") setUi({ loc: id }); nav("Billing", "Invoices"); };
  return (
    <>
      <Grid min={150} gap={10}>
        <Kpi label={"Invoiced · " + (month ? "October" : "w/c 19 Oct")} value={euro0(invoiced)} sub={plural(invs.length, "invoice")} onClick={goTo("Billing", "Invoices")} />
        <Kpi label="Collected on those invoices" value={euro0(collected)} tone="ok" sub={pct(invoiced ? collected / invoiced : 0, 1) + " of invoiced"} onClick={goTo("Billing", "Payments & Reconciliation")} />
        <Kpi label="Direct debit scheduled" value={euro0(dd)} tone="info" sub="Collects on due date (simulated)" />
        <Kpi label="Aged debt" value={euro0(aged.total)} tone="warn" sub={plural(overdueInvoices().length, "overdue invoice")} onClick={goTo("Billing", "Reminder Stages")} />
        <Kpi label="Failed payments" value={failed.length} tone={failed.length ? "bad" : "ok"} sub={failed.length ? euro0(failed.reduce((n, p) => n + p.amount, 0)) + " to retry" : "None in period"} onClick={goTo("Billing", "Payments & Reconciliation")} />
      </Grid>
      <div className="ros-split-even" style={{ marginTop: 16 }}>
        <Card title={"Revenue by site · " + (month ? "October to date" : "this week")} sub="Gross session, transport, camp and fee lines before NCS subsidy. Select a site to open its invoices.">
          <HBars format={euro0} items={sites.map(l => ({ label: l.short, value: rev.get(l.id) || 0, onClick: site(l.id) })).sort((a, b) => b.value - a.value)} />
        </Card>
        <Card title="Collections by week" sub="Invoiced vs collected for each October week. Direct debits for w/c 19 Oct collect on Friday.">
          <PairCols names={["Invoiced", "Collected"]} format={kfmt} data={weeks.map(w => ({ label: "w/c " + fmtDate(w.w), a: w.a, b: w.b, onClick: goTo("Billing", "Invoices") }))} />
        </Card>
        <Card title="Aged debt" sub="Unpaid balances past due by days overdue. Select a bucket for the reminder stages.">
          <ClickCols format={euro0} data={B.map((b, i) => ({ label: b + " days", value: aged.buckets[b], hint: aged.counts[b] + " invoices · " + euro(aged.buckets[b]), tone: (["accent", "warn", "bad", "bad"] as Tone[])[i], onClick: goTo("Billing", "Reminder Stages") }))} />
        </Card>
        <Card title={"Payment methods · " + (month ? "October" : "this week")} sub={"Succeeded payments by method. " + (failed.length ? plural(failed.length, "payment") + " failed and will retry." : "No failures.")}>
          <StackBar parts={mList.map(([k, v], i) => ({ label: k + " " + pct(v / Math.max(1, ok.reduce((n, p) => n + p.amount, 0))), value: v, tone: mTone[i % mTone.length] }))} />
          <div style={{ marginTop: 14 }}><HBars format={euro0} items={mList.map(([k, v], i) => ({ label: k, value: v, tone: mTone[i % mTone.length], sub: ok.filter(p => p.method.replace(" (simulated)", "") === k).length + " payments", onClick: goTo("Billing", "Payments & Reconciliation") }))} /></div>
        </Card>
      </div>
    </>
  );
}

/* =================================== NCS =================================== */
function Ncs({ period }: { period: Period }) {
  const { s, role } = useRos();
  const sites = scopedLocations();
  const month = period === "month";
  const aws = s.awards.filter(a => inScope(family(a.familyId)?.locationId));
  const pend = claimsPending(), today = claimsExpiringToday();
  const accepted = s.claims.filter(c => c.status === "Accepted" && inScope(family(c.familyId)?.locationId) && c.raised >= (month ? "2026-10-01" : "2026-10-13"));
  const subsidyBy = new Map<string, number>();
  for (const inv of (month ? getRows().invMonth : getRows().invWeek)) for (const ln of inv.lines) {
    if (ln.kind !== "NCS subsidy" || !ln.childId) continue;
    const c = child(ln.childId); if (!c || !inScope(c.locationId)) continue;
    subsidyBy.set(c.locationId, (subsidyBy.get(c.locationId) || 0) - ln.amount);
  }
  const subsidy = [...subsidyBy.values()].reduce((n, v) => n + v, 0);
  const ub = underbooked();
  const byDeadline = new Map<string, number>();
  for (const c of pend) byDeadline.set(c.deadline.slice(0, 10), (byDeadline.get(c.deadline.slice(0, 10)) || 0) + 1);
  const deadlineDays = Array.from({ length: 7 }, (_, i) => addDays(TODAY, i));
  const drafted = (fid: string) => s.messages.some(m => m.familyId === fid && m.classification === "NCS hours reminder");
  return (
    <>
      <Grid min={150} gap={10}>
        <Kpi label="Active awards" value={aws.filter(a => a.expires >= TODAY).length} sub={aws.filter(a => a.type === "Universal").length + " universal · " + aws.filter(a => a.type === "Income assessed").length + " income assessed"} onClick={goTo("NCS", "CHICK Register")} />
        <Kpi label="CHICKs expiring by 31 Oct" value={chickExpiring().length} tone="warn" sub="Renewal needed to keep subsidy" onClick={goTo("NCS", "CHICK Register")} />
        <Kpi label="Claims awaiting acceptance" value={pend.length} tone={today.length ? "warn" : undefined} sub={"+" + today.length + " lapse today at 17:00"} onClick={goTo("NCS", "Claims & Acceptances")} />
        <Kpi label={"Accepted · " + (month ? "October" : "this week")} value={accepted.length} tone="ok" sub={role.finance ? euro0(accepted.reduce((n, c) => n + c.amount, 0)) + " confirmed" : "Raised in period"} onClick={goTo("NCS", "Claims & Acceptances")} />
        <Kpi label={"Subsidy on invoices · " + (month ? "October" : "this week")} value={role.finance ? euro0(subsidy) : "Restricted"} sub="Demo rates × subsidised hours" onClick={goTo("NCS", "Overview")} />
        <Kpi label="Under-booked families" value={ub.length} tone={ub.length ? "warn" : "ok"} sub="Booked below agreed hours, w/c 2 Nov" onClick={goTo("NCS", "Agreed Hours")} />
      </Grid>
      <div className="ros-split-even" style={{ marginTop: 16 }}>
        <Card title={"Subsidy by site · " + (month ? "October" : "this week")} sub="NCS subsidy lines on invoices, by the child's site. Select a site for NCS & Funding.">
          {role.finance ? <HBars format={euro0} items={sites.map(l => ({ label: l.short, value: subsidyBy.get(l.id) || 0, onClick: () => { if (role.scope === "ALL") setUi({ loc: l.id }); nav("NCS", "Overview"); } })).sort((a, b) => b.value - a.value)} /> : <Callout tone="neutral" title="Restricted">Subsidy amounts are visible to finance roles only.</Callout>}
        </Card>
        <Card title="Claims by acceptance deadline" sub="Unaccepted claims over the next seven days. Select a day for the claims list.">
          <ClickCols data={deadlineDays.map(d => ({ label: d === TODAY ? "Today" : dow(d) + " " + +d.slice(8), value: byDeadline.get(d) || 0, tone: (d === TODAY ? "bad" : "warn") as Tone, onClick: goTo("NCS", "Claims & Acceptances") }))} />
          <div style={{ marginTop: 10 }}>
            {pend.slice().sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 5).map(c => <ListRow key={c.id} onClick={() => openRecord({ kind: "claim", id: c.id })} title={<Row gap={6}><RecLink r={{ kind: "claim", id: c.id }} />{family(c.familyId)?.surname}</Row>} sub={"Lapses " + fmtDay(c.deadline.slice(0, 10)) + " " + c.deadline.slice(11) + " · " + c.hours + "h"} right={role.finance ? <span style={{ fontVariantNumeric: "tabular-nums" }}>{euro(c.amount)}</span> : undefined} />)}
          </div>
        </Card>
        <Card title="Awards by type and status" sub="Select a group for the CHICK register.">
          <StackBar parts={[{ label: "Universal " + aws.filter(a => a.type === "Universal").length, value: aws.filter(a => a.type === "Universal").length, tone: "info" }, { label: "Income assessed " + aws.filter(a => a.type === "Income assessed").length, value: aws.filter(a => a.type === "Income assessed").length, tone: "accent" }]} />
          <div style={{ marginTop: 14 }}>
            <HBars items={(["Active", "Expiring", "Expired"] as const).map(st => ({ label: st, value: aws.filter(a => a.status === st).length, tone: (st === "Active" ? "ok" : st === "Expiring" ? "warn" : "bad") as Tone, onClick: goTo("NCS", "CHICK Register") }))} />
          </div>
        </Card>
        <Card title="Under-booked on agreed hours" sub="Families who booked fewer hours than their award for w/c 2 Nov. Drafts wait for NCS review; nothing is sent.">
          {ub.map(x => (
            <ListRow key={x.family.id} onClick={() => openRecord({ kind: "family", id: x.family.id })} title={<Row gap={6}>{x.family.surname}<Sub>{x.family.id}</Sub></Row>} sub={x.booked + " of " + x.agreed + "h booked · " + locById(x.family.locationId)?.short}
              right={drafted(x.family.id) ? <Badge tone="info">Draft ready</Badge> : <Btn size="sm" onClick={() => prepareHoursReminder({ familyId: x.family.id, booked: x.booked, agreed: x.agreed })}>Draft reminder</Btn>} />
          ))}
          {!ub.length && <Empty title="Nobody under-booked" />}
        </Card>
      </div>
    </>
  );
}

/* ============================ Staff & Compliance ============================ */
function StaffCompliance({ period }: { period: Period }) {
  const { s, role } = useRos();
  const win = +period || 30;
  const sites = scopedLocations();
  const staff = s.staff.filter(x => inScope(x.locationId));
  type Row3 = { kind: CertKind; held: number; current: number; soon: number; expired: number; firstSoon?: string; firstExp?: string };
  const matrix: Row3[] = CERTS.map(kind => {
    const r: Row3 = { kind, held: 0, current: 0, soon: 0, expired: 0 };
    for (const st of staff) for (const c of st.certs.filter(c => c.kind === kind)) {
      r.held++;
      if (c.expires < TODAY) { r.expired++; r.firstExp = r.firstExp || st.id; }
      else if (daysBetween(TODAY, c.expires) <= win) { r.soon++; r.firstSoon = r.firstSoon || st.id; }
      else r.current++;
    }
    return r;
  }).filter(r => r.held);
  const tot = matrix.reduce((a, r) => ({ c: a.c + r.current, s: a.s + r.soon, e: a.e + r.expired }), { c: 0, s: 0, e: 0 });
  const certsGo = goTo("Staff", "Certifications");
  const inc = s.incidents.filter(i => inScope(i.locationId) && i.date >= "2026-10-01");
  const checks = s.checks.filter(c => inScope(c.locationId));
  const pols = s.policies;
  const cols: Col<Row3>[] = [
    { key: "k", label: "Certificate", w: "1.4fr", render: r => <span style={{ fontWeight: 500 }}>{r.kind}</span>, sort: r => r.kind },
    { key: "h", label: "Held", w: ".6fr", align: "right", render: r => r.held, sort: r => r.held },
    { key: "c", label: "Current", w: ".7fr", align: "right", render: r => <span style={{ color: "var(--ok)" }}>{r.current}</span>, sort: r => r.current },
    { key: "s", label: "Within " + win + " days", w: ".9fr", align: "right", render: r => r.soon ? <Badge tone="warn">{r.soon}</Badge> : <Sub>0</Sub>, sort: r => r.soon },
    { key: "e", label: "Expired", w: ".7fr", align: "right", render: r => r.expired ? <Badge tone="bad">{r.expired}</Badge> : <Sub>0</Sub>, sort: r => r.expired },
    { key: "b", label: "Current share", w: "1.2fr", render: r => <div title={r.current + " current · " + r.soon + " expiring · " + r.expired + " expired"} style={{ width: "100%", display: "flex", height: 7, borderRadius: 7, overflow: "hidden", background: "var(--track)" }}>{([[r.current, "ok"], [r.soon, "warn"], [r.expired, "bad"]] as [number, Tone][]).map(([v, tn], i) => <span key={i} style={{ width: (v / Math.max(1, r.held)) * 100 + "%", background: toneInk[tn] }} />)}</div> },
  ];
  return (
    <>
      <Grid min={150} gap={10}>
        <Kpi label="Staff in scope" value={staff.length} sub={plural(sites.length, "site")} onClick={goTo("Staff", "Directory")} />
        <Kpi label="Certificates current" value={tot.c} tone="ok" sub={"Beyond " + win + " days"} onClick={certsGo} />
        <Kpi label={"Expiring within " + win + " days"} value={tot.s} tone={tot.s ? "warn" : "ok"} sub="Renewal to book" onClick={certsGo} />
        <Kpi label="Expired" value={tot.e} tone={tot.e ? "bad" : "ok"} sub={tot.e ? "Blocked from rota until renewed" : "None"} onClick={certsGo} />
        <Kpi label="Policies fully acknowledged" value={pols.filter(p => p.acknowledged >= p.required).length + "/" + pols.length} sub="Staff sign-off on current versions" onClick={goTo("Compliance", "Policies")} />
        <Kpi label="Site checks outstanding" value={checks.filter(c => !c.done).length} tone={checks.some(c => !c.done) ? "warn" : "ok"} sub="This week's logs" onClick={goTo("Compliance", "Site Logs")} />
      </Grid>
      <Card pad={false} title="Certificate status" sub={"Every certificate held by staff in scope, by type. Select a row for " + (certsGo ? "Staff certifications." : "the first person affected.")} style={{ marginTop: 16 }}>
        <Table rows={matrix} cols={cols} rowKey={r => r.kind} minWidth={640} rowTone={r => (r.expired ? "bad" : r.soon ? "warn" : undefined)}
          onRow={r => { if (certsGo) certsGo(); else { const id = r.firstExp || r.firstSoon; if (id) openRecord({ kind: "staff", id }); } }} />
      </Card>
      <div className="ros-split-even" style={{ marginTop: 16 }}>
        <Card title="Staff and expiries by site" sub="Headcount per site; the note shows certificates expiring in the window.">
          <HBars items={sites.map(l => { const st = staff.filter(x => x.locationId === l.id); const exp = st.filter(x => x.certs.some(c => c.expires < TODAY || daysBetween(TODAY, c.expires) <= win)).length; return { label: l.short, value: st.length, sub: exp ? exp + " expiring" : undefined, tone: (exp ? "warn" : "accent") as Tone, onClick: goTo("Staff", "Directory") || (() => openRecord({ kind: "location", id: l.id })) }; }).sort((a, b) => b.value - a.value)} />
        </Card>
        <Card title="Incidents by site · October" sub={role.safeguarding ? "All severities. Select a site for Compliance incidents." : "Counts only for this role."}>
          <ClickCols data={sites.map(l => ({ label: siteTag(l.id), value: inc.filter(i => i.locationId === l.id).length, tone: (inc.some(i => i.locationId === l.id && i.status !== "Closed") ? "warn" : "accent") as Tone, onClick: role.safeguarding ? goTo("Compliance", "Incidents") : undefined }))} />
          {role.safeguarding
            ? <div style={{ marginTop: 10 }}>{inc.filter(i => i.status !== "Closed").map(i => <ListRow key={i.id} onClick={() => openRecord({ kind: "incident", id: i.id })} title={<Row gap={6}><RecLink r={{ kind: "incident", id: i.id }} />{i.kind}</Row>} sub={locById(i.locationId)?.short + " · " + fmtDay(i.date) + " · " + i.severity} right={<StatusBadge s={i.status} />} />)}</div>
            : <div style={{ marginTop: 10 }}><Callout tone="neutral" title="Restricted">Incident detail is visible to safeguarding roles only (owner, operations, location manager).</Callout></div>}
        </Card>
        <Card title="Policy acknowledgements" sub="Staff who have signed the current version.">
          <HBars format={n => pct(n)} max={1} items={pols.map(p => ({ label: p.name + " " + p.version, value: p.acknowledged / p.required, sub: p.acknowledged + "/" + p.required, tone: (p.acknowledged >= p.required ? "ok" : "warn") as Tone, onClick: goTo("Compliance", "Policies") }))} />
        </Card>
        <Card title="Site checks outstanding" sub="Fire drills, fridge logs, cleaning, first aid boxes and outdoor checks not yet signed off.">
          <ClickCols data={sites.map(l => ({ label: siteTag(l.id), value: checks.filter(c => c.locationId === l.id && !c.done).length, tone: "warn" as Tone, hint: checks.filter(c => c.locationId === l.id && !c.done).map(c => c.kind).join(", ") || "All done", onClick: goTo("Compliance", "Site Logs") || (() => openRecord({ kind: "location", id: l.id })) }))} />
        </Card>
      </div>
    </>
  );
}

/* ================================= Exports ================================= */
interface Dataset { key: string; title: string; sub: string; file: string; header: string[]; rows: Cell[][]; source?: () => void; restricted?: boolean }
function Exports({ period }: { period: Period }) {
  const { s, role } = useRos();
  const sc = scopeLoc();
  const scopeText = (sc === "ALL" ? "All locations" : locById(sc)?.short || sc);
  const stamp = TODAY;
  const invs = s.invoices.filter(i => inScope(family(i.familyId)?.locationId) && (period === "overdue" ? overdueInvoices().includes(i) : period === "month" ? i.issued >= "2026-10-01" : i.weekOf === "2026-10-19"))
    .sort((a, b) => a.id.localeCompare(b.id));
  const reg = scopedLocations().flatMap(l => register(l.id, TODAY).map(x => ({ l, ...x })));
  const claims = s.claims.filter(c => inScope(family(c.familyId)?.locationId) && (period === "week" ? c.status === "Awaiting acceptance" || c.raised >= "2026-10-13" : true));
  const certRows = s.staff.filter(x => inScope(x.locationId)).flatMap(st => st.certs.map(c => ({ st, c })));
  const sets: Dataset[] = [
    {
      key: "inv", title: "Invoices", restricted: !role.finance,
      sub: (period === "overdue" ? "Overdue invoices" : period === "month" ? "Invoices issued in October" : "Invoices for w/c 19 Oct") + " · " + scopeText,
      file: "ros-invoices-" + period + "-" + stamp + ".csv",
      header: ["Invoice", "Family ID", "Family", "Site", "Week of", "Issued", "Due", "Total", "Paid", "Balance", "Status", "Reminder stage"],
      rows: invs.map(i => { const f = family(i.familyId); return [i.id, i.familyId, f?.surname || "", locById(f?.locationId || "")?.short || "", i.weekOf, i.issued, i.due, invoiceTotal(i).toFixed(2), invoicePaid(i).toFixed(2), invoiceBalance(i).toFixed(2), invoiceStatus(i), invoiceStatus(i) === "Overdue" || invoiceStatus(i) === "Debt review" ? reminderStage(i).label : ""]; }),
      source: goTo("Billing", "Invoices"),
    },
    {
      key: "att", title: "Attendance register · today",
      sub: "Every booking for " + longDate(TODAY) + " with its latest kiosk, room or bus record · " + scopeText,
      file: "ros-register-" + stamp + ".csv",
      header: ["Site", "Child ID", "Child", "Session", "Start", "End", "Room or school", "Route", "Status", "Time", "Recorded by", "Collector"],
      rows: reg.map(x => [x.l.short, x.child.id, childName(x.child), x.booking.session, x.booking.start, x.booking.end, x.child.programme === "EY" ? idx().room.get(x.child.roomId)?.name || "" : s.schools.find(sc2 => sc2.id === x.booking.schoolId)?.name || "", x.booking.routeId || "", x.status, x.time || "", x.by || "", x.collector || ""]),
      source: goTo("Bookings", "Registers") || goTo("Locations", "Attendance Status"),
    },
    {
      key: "ncs", title: "NCS claims", restricted: !role.finance,
      sub: (period === "week" ? "Open claims and claims raised this week" : "All claims on file") + " · " + scopeText,
      file: "ros-ncs-claims-" + stamp + ".csv",
      header: ["Claim", "Family ID", "Family", "Child", "Site", "Period", "Hours", "Amount (demo)", "Status", "Deadline", "Reminders sent"],
      rows: claims.map(c => { const f = family(c.familyId), ch = child(c.childId); return [c.id, c.familyId, f?.surname || "", childName(ch), locById(ch?.locationId || "")?.short || "", c.period, c.hours, c.amount.toFixed(2), c.status, c.deadline, c.reminders.length]; }),
      source: goTo("NCS", "Claims & Acceptances"),
    },
    {
      key: "cert", title: "Staff certificates",
      sub: "Every certificate held, with days to expiry · " + scopeText,
      file: "ros-certificates-" + stamp + ".csv",
      header: ["Staff ID", "Name", "Role", "Site", "Certificate", "Expires", "Days left", "Status"],
      rows: certRows.map(({ st, c }) => [st.id, st.name, st.role, locById(st.locationId)?.short || "", c.kind, c.expires, daysBetween(TODAY, c.expires), c.expires < TODAY ? "Expired" : daysBetween(TODAY, c.expires) <= 30 ? "Expiring" : "Current"]),
      source: goTo("Staff", "Certifications"),
    },
    {
      key: "site", title: "Site summary",
      sub: "One row per site: places, bookings, occupancy and open items · " + scopeText,
      file: "ros-sites-" + stamp + ".csv",
      header: ["Site", "County", "Places", "Booked today", "Occupancy today", "Week occupancy", "Children enrolled", "Waitlist", "Open incidents"].concat(role.finance ? ["Week revenue", "Collected on due invoices (Oct)"] : []),
      rows: scopedLocations().map(l => { const o = occupancy(l.id); return ([l.name, l.county, o.cap, o.booked, pct(o.rate), pct(weekOccupancy(l.id)), s.children.filter(c => c.locationId === l.id).length, s.waitlist.filter(w => w.locationId === l.id && w.status === "Waiting").length, s.incidents.filter(i => i.locationId === l.id && i.status !== "Closed").length] as Cell[]).concat(role.finance ? [(revenueByLocation().get(l.id)?.revenue || 0).toFixed(2), pct(collectionRate(l.id), 1)] : []); }),
      source: goTo("Locations", "Capacity & Performance"),
    },
  ];
  const logs = s.activity.filter(a => a.title.startsWith("Export generated")).slice().reverse();
  return (
    <>
      <Callout tone="info" title="How exports work" right={<Btn size="sm" onClick={() => window.print()}>Printable view</Btn>}>
        Each file is built in your browser from the rows below, using the site filter in the header and the period chosen. Nothing is uploaded or sent. Downloads are logged to Activity. <DemoTag>Demo data</DemoTag>
      </Callout>
      <Grid min={340} gap={14} style={{ marginTop: 16 }}>
        {sets.map(d => (
          <Card key={d.key} title={d.title} sub={d.sub} right={<Badge tone="info">{plural(d.rows.length, "row")}</Badge>}>
            {d.restricted ? <Callout tone="neutral" title="Restricted">This dataset is available to finance roles only.</Callout> : (
              <>
                <div className="ros-scroll-x" style={{ border: "1px solid var(--border)", borderRadius: 10 }}>
                  <table style={{ borderCollapse: "collapse", fontSize: 11.5, minWidth: "100%" }}>
                    <thead><tr>{d.header.slice(0, 6).map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--faint)", fontWeight: 500, background: "var(--surface-faint)", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                    <tbody>{d.rows.slice(0, 5).map((r, i) => <tr key={i}>{r.slice(0, 6).map((c, j) => <td key={j} style={{ padding: "6px 8px", borderTop: "1px solid var(--border)", whiteSpace: "nowrap", color: "var(--body)" }}>{String(c)}</td>)}</tr>)}</tbody>
                  </table>
                </div>
                <Sub>Preview: first {Math.min(5, d.rows.length)} rows and 6 of {d.header.length} columns.</Sub>
                <Row wrap gap={6} style={{ marginTop: 12 }}>
                  <Btn size="sm" variant="primary" disabled={!d.rows.length} onClick={() => downloadCsv(d.file, d.header, d.rows, scopeText)}>Download CSV</Btn>
                  {d.source && <Btn size="sm" onClick={d.source}>Open source</Btn>}
                  <Sub>{d.file}</Sub>
                </Row>
              </>
            )}
          </Card>
        ))}
      </Grid>
      <Card title="Export log" sub="From Activity. Undo in the header removes the latest entry." style={{ marginTop: 16 }}>
        {logs.length ? logs.slice(0, 8).map(a => <ListRow key={a.id} title={a.title} sub={a.actor + " · " + a.at.slice(11) + " · " + a.detail} />) : <Empty title="No exports yet" body="Download a CSV above and it is recorded here." />}
      </Card>
    </>
  );
}
