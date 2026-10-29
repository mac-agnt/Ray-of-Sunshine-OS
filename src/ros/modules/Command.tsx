/* Group Command Centre: the operational picture across all nine sites for
   the owner and operations. Every figure is derived from the shared records
   through selectors and follows the location filter and role scope; every
   tile, row, pin and decision opens the record or filtered module behind it. */
import { useState, type ReactNode } from "react";
import type { LocationId, Location, Ref, Tone, ISODate, Approval } from "../types";
import { useRos, nav, setUi, setTab, openRecord, confirmThen, pushToast, getState, getUi, roleDef } from "../store";
import type { RoleDef } from "../store";
import {
  headline, ratioCheck, occupancy, weekOccupancy, overdueInvoices, agedDebt, weekFinance, revenueByLocation, collectionRate,
  claimsPending, chickExpiring, underbooked, certAlerts, pendingApprovals, pendingRequests, openIncidents, medicationReviews,
  missingChildAlerts, ratioAlerts, invoiceTotal, invoiceBalance, invoicePaid, invoiceStatus, daysOverdue, reminderStage, family, child,
  childName, staffById, locById, idx, cached, inScope, scopeLoc, scopedLocations, bookingsOn,
} from "../selectors";
import { approveRelief, decideApproval, decideRequest, sendClaimReminder, reconcile, addTask } from "../actions";
import { requestChecks } from "../records";
import { TODAY, TOMORROW, fmtDay, fmtDate, rel, euro, euro0, pct, hm, toMin, dow, daysBetween } from "../time";
import {
  Page, PageHead, Card, Kpi, Grid, Table, Badge, StatusBadge, Btn, RecLink, HBars, Line, StackBar, Meter, Callout, Seg, ListRow,
  Timeline, DemoTag, Empty, Avatar, Row, Stack, Sub, Label, toneInk, type Col,
} from "../ui";
import {
  IrelandMap, siteHealthAll, siteDayAll, siteNextRun, goTo, longDate, ClickCols, PairCols, approvalLoc, plural, SITE_TONE_LABEL, type SiteTone,
} from "./IrelandMap";

const TONE_OF: Record<SiteTone, Tone> = { bad: "bad", warn: "warn", ok: "ok" };
const canRelief = (r: RoleDef) => r.id === "owner" || r.id === "ops" || r.id === "locmgr";
const canApprove = (r: RoleDef, a: Approval) => a.status === "Pending" && (r.id === "owner" || r.id === "ops" || a.ownerRole === r.id);
const ROLE_WORD: Record<string, string> = { owner: "Owner", ops: "Operations", accounts: "Accounts", ncs: "NCS admin", locmgr: "Location manager", practitioner: "Room leader", driver: "Driver", parent: "Parent" };
const mask = (role: RoleDef, v: ReactNode) => (role.finance ? v : "Restricted");

export default function Command({ tab }: { tab: string }) {
  const { s, role } = useRos();
  const sc = scopeLoc();
  const where = sc === "ALL" ? "All " + s.locations.length + " locations" : locById(sc)?.name || sc;
  const head = (title: ReactNode, sub?: ReactNode, right?: ReactNode) => (
    <PageHead eyebrow={"Group Command Centre · " + tab} title={title} sub={sub} right={right} />
  );
  const strap = where + " · " + longDate(TODAY) + " · " + hm(s.clockMin);
  switch (tab) {
    case "All Locations": return <Page>{head(strap, "Ranked site performance from bookings, invoices, incidents and NCS records. Select a row to open that site.")}<AllLocations /></Page>;
    case "Cash & Debt": return <Page>{head(strap, "Cash in, cash due and who owes it. Amounts are demo data; payments and reminders are simulated.", <DemoTag>Simulated payments</DemoTag>)}{role.finance ? <CashDebt /> : <Card><Callout tone="neutral" title="Restricted">Cash and debt detail is visible to finance roles only (owner, operations, accounts, NCS). Switch role in the header to compare.</Callout></Card>}</Page>;
    case "Risks & Alerts": return <Page>{head(strap, "Everything that could hurt a child, a family or the business in the next 48 hours, ranked by severity. Each item opens its record.")}<Risks /></Page>;
    case "Today's Timeline": return <Page>{head(strap, "What has happened since the kiosks opened and what is still to come, relative to the demo clock.")}<TodayTimeline /></Page>;
    case "Decisions": return <Page>{head(strap, "Approvals and booking requests waiting on a person. Approving here writes to the same records as the source module.")}<Decisions /></Page>;
    default: return <Page>{head(strap, "Live across bookings, rota, attendance, billing, NCS and compliance. Every number opens its source.", <Btn size="sm" onClick={() => setTab("Command", "Decisions")}>Decisions ({pendingApprovals().filter(a => inScope(approvalLoc(a))).length + pendingRequests().length})</Btn>)}<Overview /></Page>;
  }
}

/* =============================== Overview =============================== */
function Overview() {
  const { s, role, ui } = useRos();
  const h = headline();
  const sites = scopedLocations();
  const alerts = ratioAlerts();
  const fin = role.finance;
  const sc = scopeLoc();
  const pick = (id: LocationId) => {
    if (role.scope === "ALL") { setUi({ loc: ui.loc === id ? "ALL" : id }); return; }
    if (id === role.scope) nav("Locations", "Overview", { locationId: id });
    else pushToast("This role covers " + (locById(role.scope)?.short || role.scope) + " only. Switch role to explore other sites.", "info");
  };
  return (
    <>
      <Grid min={148} gap={10}>
        <Kpi label="Booked today" value={h.bookedToday} sub={h.sessionsToday + " sessions · " + plural(sites.length, "site")} onClick={goTo("Bookings", "Registers")} />
        <Kpi label="On site now" value={h.onSite} sub={"Signed in at " + hm(s.clockMin)} onClick={goTo("Locations", "Attendance Status")} />
        <Kpi label="Staff scheduled" value={h.staffToday} sub="Rostered today, absences removed" onClick={goTo("Staff", "Rota")} />
        <Kpi label="Ratio alerts" value={h.ratioAlerts} tone={h.ratioAlerts ? "bad" : "ok"} sub={alerts.length ? alerts.map(a => locById(a.loc)?.short + " " + (a.date === TODAY ? "today" : dow(a.date))).join(", ") : "All sessions covered"} onClick={goTo("Bookings", "Ratios")} />
        <Kpi label="Week invoiced vs collected" value={mask(role, euro0(h.invoiced))} sub={fin ? "Collected " + euro0(h.collected) + " · DD due " + euro0(h.scheduled) : "Finance roles only"} onClick={fin ? goTo("Billing", "Invoices") : undefined} />
        <Kpi label="Collection rate MTD" value={mask(role, pct(h.mtdRate, 1))} sub={fin ? euro0(h.mtdCollected) + " received in October" : "Finance roles only"} onClick={fin ? goTo("Billing", "Overview") : undefined} />
        <Kpi label="Aged debt" value={mask(role, euro0(h.aged))} tone={fin && h.aged ? "warn" : undefined} sub={plural(h.overdue, "overdue invoice")} onClick={fin ? goTo("Billing", "Reminder Stages") : undefined} />
        <Kpi label="Occupancy today" value={pct(h.occupancy)} sub="Booked places vs capacity" onClick={goTo("Locations", "Capacity & Performance")} />
        <Kpi label="NCS claims unaccepted" value={h.claims} tone={h.claimsToday ? "warn" : undefined} sub={"+" + h.claimsToday + " lapse today at 17:00"} onClick={goTo("NCS", "Claims & Acceptances")} />
        <Kpi label="Waitlist" value={h.waitlist} sub="Children waiting for a place" onClick={goTo("Enrolment", "Waitlists")} />
        <Kpi label="Open incidents" value={h.incidents} tone={h.incidents ? "warn" : "ok"} sub="Awaiting signature or review" onClick={goTo("Compliance", "Incidents")} />
      </Grid>

      <div className="ros-split" style={{ marginTop: 16 }}>
        <MorningBrief />
        <Card title="Nine sites at a glance" sub={role.scope === "ALL" ? "Select a pin to filter the whole app to that site. Select it again to clear." : "Your role covers " + (locById(role.scope)?.short || "") + ". Select its pin to open the site dashboard."}
          right={sc !== "ALL" && role.scope === "ALL" ? <Btn size="sm" onClick={() => setUi({ loc: "ALL" })}>Show all 9</Btn> : undefined}>
          <IrelandMap compact height={300} selected={sc === "ALL" ? null : sc} onSelect={pick} />
        </Card>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "22px 0 12px", flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-.2px" }}>{sites.length === 1 ? sites[0].name : "Sites"}</div>
        <Sub>Attendance, ratio, money and transport per site. Select a card for the site dashboard.</Sub>
      </div>
      <Grid min={270} gap={12}>{sites.map(l => <SiteCard key={l.id} l={l} />)}</Grid>
    </>
  );
}

function SiteCard({ l }: { l: Location }) {
  const { role } = useRos();
  const hl = siteHealthAll()[l.id], day = siteDayAll()[l.id];
  const occ = occupancy(l.id);
  const r = ratioCheck(l.id, TODAY, "After School");
  const rev = revenueByLocation().get(l.id);
  const run = siteNextRun(l.id);
  const mgr = staffById(l.managerId);
  const cell = (k: string, v: ReactNode, tone?: Tone) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, color: "var(--faint)" }}>{k}</div>
      <div style={{ fontSize: 13, marginTop: 2, color: tone ? toneInk[tone] : "var(--ink)", fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</div>
    </div>
  );
  return (
    <Card onClick={() => nav("Locations", "Overview", { locationId: l.id })} tone={hl.tone === "bad" ? "bad" : undefined}
      title={<Row gap={6}>{l.name}{l.isHQ && <Badge tone="brand">HQ</Badge>}</Row>} sub={l.town + ", Co. " + l.county + " · " + (mgr?.name || "")}
      right={<Badge tone={TONE_OF[hl.tone]} dot={hl.tone === "bad"}>{SITE_TONE_LABEL[hl.tone]}</Badge>}>
      <Meter label={"Attendance " + day.counts.in + " in · " + day.booked + " booked"} value={occ.booked} max={occ.cap} hint="places" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "10px 14px", marginTop: 12 }}>
        {cell("After School ratio", r.booked ? r.rostered + " of " + r.required + " staff · " + r.booked + " booked" : "No session today", r.ok ? undefined : "bad")}
        {cell("Week revenue", mask(role, euro0(rev?.revenue || 0)))}
        {cell("Collected, due invoices", mask(role, pct(collectionRate(l.id), 1)))}
        {cell("Open issues", hl.reasons.length ? plural(hl.reasons.length, "item") : "None", hl.reasons.length ? TONE_OF[hl.tone] : "ok")}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: "var(--dim)", display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
        <Badge tone={run.tone}>Transport</Badge>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{run.text}</span>
      </div>
      {hl.reasons.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          {hl.reasons.slice(0, 2).map((x, i) => (
            <button key={i} className="ros-focus ros-row-hover" onClick={(e) => { e.stopPropagation(); if (x.ref) openRecord(x.ref); }}
              style={{ textAlign: "left", background: "none", border: 0, padding: "3px 4px", borderRadius: 6, cursor: "pointer", fontSize: 11.5, color: x.tone === "bad" ? "var(--bad)" : "var(--warn)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {x.text}
            </button>
          ))}
          {hl.reasons.length > 2 && <Sub>+{hl.reasons.length - 2} more on the site dashboard</Sub>}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------ Morning Brief ------------------------------ */
interface BriefItem {
  key: string; tone: Tone; loc?: LocationId; title: ReactNode; doneTitle?: ReactNode; detail: ReactNode; done: boolean; doneText?: ReactNode;
  approve?: { label: string; allowed: boolean; run: () => void }; view: () => void; viewLabel?: string;
  assign?: { title: string; owner: string; priority: "High" | "Medium" | "Low"; link?: Ref };
}

function useBrief(): BriefItem[] {
  const { s, role } = useRos();
  const items: BriefItem[] = [];
  const firstName = (id: string) => (staffById(id)?.name || id).split(" ")[0];

  /* Arklow Rocks cover */
  const ark = s.issues.find(i => i.id === "STAFF-ARK-019");
  if (ark) {
    const r = ratioCheck(ark.locationId, ark.date, "After School");
    const offer = ark.offerStaffIds || [];
    const done = ark.status === "Resolved" || r.ok;
    const reliefShift = s.shifts.find(x => x.relief && x.locationId === ark.locationId && x.date === ark.date);
    items.push({
      key: "ark", tone: "bad", loc: ark.locationId, done,
      title: <>Arklow Rocks 3pm After School is {r.gap > 1 ? r.gap + " adults" : "one adult"} short · <RecLink r={{ kind: "issue", id: ark.id }} /></>,
      doneTitle: <>Arklow Rocks 3pm After School covered · <RecLink r={{ kind: "issue", id: ark.id }} /></>,
      detail: r.booked + " children booked, " + r.rostered + " rostered against " + r.required + " required at the demo 1:" + r.ratio + " ratio (one practitioner on approved leave). Qualified relief ready: " + offer.map(id => staffById(id)?.name).join(" or ") + ".",
      doneText: "Covered: " + (reliefShift ? staffById(reliefShift.staffId)?.name + " added " + reliefShift.start + "–" + reliefShift.end : "forecast meets the demo ratio") + (ark.resolvedBy ? " · approved by " + ark.resolvedBy + " " + rel(ark.resolvedAt || "") : "") + ". " + r.rostered + " of " + r.required + " staff now.",
      approve: offer[0] ? { label: "Approve " + firstName(offer[0]), allowed: canRelief(role), run: () => confirmThen({ title: "Approve " + staffById(offer[0])?.name + " for Arklow Rocks?", body: "Adds a qualified relief shift (09:00–17:30) to Arklow Rocks today. The ratio forecast, site card, risk count, approval APR-201 and Activity update together.", confirmLabel: "Approve relief", run: () => approveRelief({ issueId: ark.id, staffId: offer[0] }) }) } : undefined,
      view: () => openRecord({ kind: "issue", id: ark.id }),
      assign: { title: "Confirm Arklow Rocks 3pm cover (STAFF-ARK-019)", owner: "Deirdre Kinsella", priority: "High", link: { kind: "issue", id: ark.id } },
    });
  }

  /* NCS-0091 Kelly */
  const k = s.claims.find(c => c.id === "NCS-0091");
  if (k && role.finance) {
    const f = family(k.familyId), c = child(k.childId);
    const others = s.claims.filter(x => x.id !== k.id && x.status === "Awaiting acceptance" && x.deadline.slice(0, 10) === TODAY).length;
    const mins = toMin(k.deadline.slice(11)) - s.clockMin;
    items.push({
      key: "ncs", tone: "warn", loc: f?.locationId, done: k.status !== "Awaiting acceptance",
      title: <><RecLink r={{ kind: "claim", id: k.id }} /> lapses today at {k.deadline.slice(11)} · {f?.surname} ({f?.id}) {euro(k.amount)}</>,
      detail: childName(c) + " · " + k.hours + "h for " + k.period + ". " + plural(k.reminders.length, "reminder") + " sent so far" + (mins > 0 ? ", " + Math.floor(mins / 60) + "h " + (mins % 60) + "m left" : "") + "." + (others ? " " + plural(others, "other claim") + " also lapse" + (others === 1 ? "s" : "") + " today." : ""),
      doneText: k.id + " " + k.status.toLowerCase() + ". " + euro(k.amount) + " subsidy confirmed for " + k.period + ".",
      approve: { label: "Send reminder", allowed: role.id !== "locmgr", run: () => sendClaimReminder({ claimId: k.id }) },
      view: () => openRecord({ kind: "claim", id: k.id }),
      assign: { title: "Phone " + (f?.guardians[0]?.name || "parent") + " about " + k.id + " before 17:00", owner: "Lorraine Tobin", priority: "High", link: { kind: "claim", id: k.id } },
    });
  }

  /* LBR-006 Nolan late booking */
  const lb = s.requests.find(r => r.id === "LBR-006");
  if (lb) {
    const c = child(lb.childId), f = family(lb.familyId);
    const chk = requestChecks(lb.id);
    const before = chk.inv ? invoiceTotal(chk.inv) : 0;
    const passes = [chk.noticeOk, chk.capOk, chk.ratioOk].filter(Boolean).length;
    items.push({
      key: "lbr", tone: "info", loc: lb.locationId, done: lb.status !== "Pending",
      title: <>Late booking <RecLink r={{ kind: "request", id: lb.id }} /> · {childName(c)}, {fmtDay(lb.date)} {lb.start}–{lb.end}</>,
      detail: <>{f?.surname} ({f?.id}) · pickup at {s.schools.find(x => x.id === lb.schoolId)?.name} on {lb.routeId}. {passes} of 3 policy checks pass. {role.finance && chk.inv ? <><RecLink r={{ kind: "invoice", id: chk.inv.id }} /> {euro(before)} → {euro(before + chk.add)}.</> : null}</>,
      doneText: lb.status + " by " + lb.decidedBy + " · " + rel(lb.decidedAt || "") + (role.finance && chk.inv ? ". " + chk.inv.id + " now " + euro(invoiceTotal(chk.inv)) + "." : "."),
      approve: { label: "Approve", allowed: true, run: () => confirmThen({ title: "Approve " + lb.id + "?", body: "Creates the booking for " + c?.firstName + ", adds " + euro(chk.add) + " to " + (chk.inv?.id || "the invoice") + ", adds one to the " + fmtDay(lb.date) + " register and the " + lb.routeId + " manifest, and sends the confirmation (simulated).", confirmLabel: "Approve", run: () => decideRequest({ id: lb.id, decision: "Approved" }) }) },
      view: () => openRecord({ kind: "request", id: lb.id }),
      assign: { title: "Decide " + lb.id + " (" + f?.surname + ", " + fmtDay(lb.date) + ")", owner: "Siobhán Keogh", priority: "Medium", link: { kind: "request", id: lb.id } },
    });
  }

  /* Gorey Wednesday */
  const gor = s.issues.find(i => i.id === "STAFF-GOR-021");
  const apr202 = s.approvals.find(a => a.id === "APR-202");
  if (gor) {
    const r = ratioCheck(gor.locationId, gor.date, "After School");
    const offer = gor.offerStaffIds || [];
    items.push({
      key: "gor", tone: "bad", loc: gor.locationId, done: gor.status === "Resolved" || r.ok,
      title: <>Gorey {fmtDay(gor.date)} After School forecast one adult short · <RecLink r={{ kind: "issue", id: gor.id }} /></>,
      doneTitle: <>Gorey {fmtDay(gor.date)} After School covered · <RecLink r={{ kind: "issue", id: gor.id }} /></>,
      detail: r.booked + " booked, " + r.rostered + " available after this morning's sick call, " + r.required + " required. Proposal " + (apr202?.id || "") + ": " + offer.map(id => staffById(id)?.name).join(", ") + ", free Wednesday.",
      doneText: "Covered for " + fmtDay(gor.date) + ": " + r.rostered + " of " + r.required + " staff" + (gor.resolvedBy ? " · approved by " + gor.resolvedBy : "") + ".",
      approve: offer[0] ? { label: "Approve " + firstName(offer[0]), allowed: canRelief(role), run: () => confirmThen({ title: "Cover Gorey " + fmtDay(gor.date) + " with " + staffById(offer[0])?.name + "?", body: "Adds the relief shift to Gorey After School on " + fmtDay(gor.date) + " and resolves STAFF-GOR-021.", confirmLabel: "Approve cover", run: () => (apr202 && apr202.status === "Pending" ? decideApproval({ id: apr202.id, decision: "Approved" }) : approveRelief({ issueId: gor.id, staffId: offer[0] })) }) } : undefined,
      view: () => openRecord({ kind: "issue", id: gor.id }),
      assign: { title: "Confirm Gorey Wednesday cover (STAFF-GOR-021)", owner: "Tara Breen", priority: "High", link: { kind: "issue", id: gor.id } },
    });
  }

  /* Byrne plan */
  const byrne = s.plans.find(p => p.id === "PLN-031");
  if (byrne && role.finance) {
    const f = family(byrne.familyId);
    const missed = byrne.instalments.filter(i => i.status === "Missed");
    const bl = s.bank.find(b => b.status === "Suggested" && b.suggestion && idx().invoice.get(b.suggestion.invoiceId)?.planId === byrne.id);
    items.push({
      key: "byrne", tone: "warn", loc: f?.locationId, done: !missed.length,
      title: <>{f?.surname} ({f?.id}) missed {missed.length ? euro(missed[0].amount) : "an instalment"} on plan <RecLink r={{ kind: "plan", id: byrne.id }} /> · revision {byrne.revision} of {byrne.maxRevisions}</>,
      doneTitle: <>{f?.surname} ({f?.id}) plan <RecLink r={{ kind: "plan", id: byrne.id }} /> back on track</>,
      detail: euro(byrne.total) + " plan." + (bl ? " The bank feed has " + euro(bl.amount) + " “" + bl.ref + "” from " + bl.payer + " (" + bl.id + ", " + (bl.suggestion?.confidence || "").toLowerCase() + ": no plan reference). Confirm the match or call by Mon 26 Oct." : " " + byrne.nextAction + "."),
      doneText: byrne.nextAction + ".",
      approve: bl && bl.suggestion ? { label: "Match " + euro0(bl.amount), allowed: role.finance, run: () => confirmThen({ title: "Match " + euro(bl.amount) + " to the Byrne plan?", body: "Allocates bank line " + bl.id + " to plan " + byrne.id + ". The missed instalment is marked paid; family balance and aged debt update.", confirmLabel: "Confirm match", run: () => reconcile({ bankId: bl.id, invoiceId: bl.suggestion!.invoiceId }) }) } : undefined,
      view: () => openRecord({ kind: "plan", id: byrne.id }),
      assign: { title: "Call " + (f?.guardians[0]?.name || "parent") + " about " + byrne.id + " instalment", owner: "Gráinne Whelan", priority: "High", link: { kind: "plan", id: byrne.id } },
    });
  }

  /* Doyle debt pack */
  const apr204 = s.approvals.find(a => a.id === "APR-204");
  if (apr204 && role.finance) {
    const fid = apr204.link?.id || "";
    const f = family(fid), plan = s.plans.find(p => p.familyId === fid);
    items.push({
      key: "doyle", tone: "warn", loc: f?.locationId, done: apr204.status !== "Pending",
      title: <>Owner decision: {f?.surname} ({fid}) debt collection pack {euro0(apr204.amount || 0)} · <RecLink r={{ kind: "approval", id: apr204.id }} /></>,
      detail: "Plan " + (plan?.id || "") + " " + (plan?.status || "").toLowerCase() + " (" + plan?.instalments.filter(i => i.status === "Missed").length + " of " + plan?.instalments.length + " instalments missed). Approving records the decision only: no referral or letter is sent in the demo.",
      doneText: apr204.status + " by " + apr204.decidedBy + " · " + rel(apr204.decidedAt || "") + ".",
      approve: { label: "Approve pack", allowed: canApprove(role, apr204), run: () => confirmThen({ title: "Approve the " + f?.surname + " debt pack?", body: apr204.effect + ".", confirmLabel: "Approve", run: () => decideApproval({ id: apr204.id, decision: "Approved" }) }) },
      view: () => openRecord({ kind: "approval", id: apr204.id }),
      assign: { title: "Prepare notes for " + f?.surname + " debt pack review", owner: "Gráinne Whelan", priority: "Medium", link: { kind: "approval", id: apr204.id } },
    });
  }

  /* CHICK expiries */
  const ch = chickExpiring().slice().sort((a, b) => a.expires.localeCompare(b.expires));
  if (ch.length && role.finance) {
    items.push({
      key: "chick", tone: "warn", done: false,
      title: <>{plural(ch.length, "CHICK")} expire by 31 Oct</>,
      detail: "Soonest: " + ch.slice(0, 3).map(a => family(a.familyId)?.surname + " (" + fmtDate(a.expires) + ")").join(", ") + ". Without a renewed CHICK, subsidised hours would be charged privately after review.",
      view: () => nav("NCS", "CHICK Register"), viewLabel: "Open register",
      assign: { title: "Chase " + ch.length + " CHICK renewals before 31 Oct", owner: "Áine Mulvey", priority: "Medium" },
    });
  }

  /* Halloween camps */
  const hw = s.camps.filter(c => c.start === "2026-10-26" && inScope(c.locationId));
  if (hw.length) {
    const regs = s.campRegs.filter(r => hw.some(c => c.id === r.campId));
    const unpaid = regs.filter(r => !r.paid).length;
    const fill = hw.map(c => locById(c.locationId)?.short + " " + regs.filter(r => r.campId === c.id && r.status === "Confirmed").length + "/" + c.capacity).join(" · ");
    const exc = hw.filter(c => c.excursion?.consentNeeded).map(c => c.excursion!.where + " " + fmtDay(c.excursion!.day)).join("; ");
    items.push({
      key: "camps", tone: "info", done: unpaid === 0,
      title: <>Halloween camps next week: {fill}</>,
      detail: plural(unpaid, "place") + " unpaid. Excursion consents needed: " + exc + ". No school runs during midterm.",
      doneText: "All Halloween camp places paid. " + fill + ".",
      view: () => nav("Camps", "Registrations", { campId: hw[0].id }), viewLabel: "Registrations",
      assign: { title: "Chase " + unpaid + " unpaid Halloween camp places", owner: "Tara Breen", priority: "Medium", link: { kind: "camp", id: hw[0].id } },
    });
  }

  return items.filter(i => !i.loc || inScope(i.loc));
}

function MorningBrief() {
  const { s, role } = useRos();
  const items = useBrief();
  const open = items.filter(i => !i.done), done = items.filter(i => i.done);
  const ark = s.issues.find(i => i.id === "STAFF-ARK-019");
  const arkOk = !ark || ark.status === "Resolved" || ratioCheck(ark.locationId, ark.date, "After School").ok;
  const k = s.claims.find(c => c.id === "NCS-0091");
  const fk = k ? family(k.familyId) : undefined;
  const hello = (s.clockMin < 12 * 60 ? "Good morning, " : "Good afternoon, ") + role.person.split(" ")[0] + ".";
  const assigned = (t: string) => s.tasks.find(x => x.title === "Brief: " + t);
  const lines: ReactNode[] = [];
  if (ark && inScope(ark.locationId)) lines.push(arkOk ? <>Arklow Rocks 3pm is covered (<RecLink r={{ kind: "issue", id: ark.id }} /> resolved).</> : <>Arklow Rocks is one adult short for the 3pm After School session (<RecLink r={{ kind: "issue", id: ark.id }} />); Aisling Byrne is ready to cover.</>);
  if (k && fk && inScope(fk.locationId) && role.finance) lines.push(k.status === "Awaiting acceptance" ? <><RecLink r={{ kind: "claim", id: k.id }} /> ({fk.surname}, {fk.id}, {euro(k.amount)}) lapses at {k.deadline.slice(11)} unless the parent accepts.</> : <><RecLink r={{ kind: "claim", id: k.id }} /> is {k.status.toLowerCase()}.</>);
  return (
    <Card title="Morning Brief" sub={<>Owner Briefing agent · prepared 08:45 from live records · <RecLink r={{ kind: "agent", id: "briefing" }} mono={false}>agent log</RecLink></>}
      right={<Badge tone={open.length ? "warn" : "ok"}>{open.length ? plural(open.length, "decision") + " open" : "All clear"}</Badge>}>
      <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--body)" }}>
        <b style={{ color: "var(--ink)", fontWeight: 600 }}>{hello}</b> {open.length ? plural(open.length, "item") + " need" + (open.length === 1 ? "s" : "") + " a person today." : "Nothing is waiting on you right now."} {lines.map((l, i) => <span key={i}>{l} </span>)}
      </div>
      <div style={{ marginTop: 12 }}>
        {open.concat(done).map((it, i) => {
          const a = it.assign ? assigned(it.assign.title) : undefined;
          return (
            <div key={it.key} style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: i ? "1px solid var(--border)" : undefined, opacity: it.done ? 0.72 : 1 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, flex: "none", background: it.done ? "var(--ok)" : toneInk[it.tone] }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, lineHeight: 1.45, color: it.done ? "var(--dim)" : "var(--ink)", fontWeight: 500 }}>{it.done && it.doneTitle ? it.doneTitle : it.title}</div>
                <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 3, lineHeight: 1.5 }}>{it.done ? it.doneText || "Resolved." : it.detail}</div>
                {!it.done && (
                  <Row wrap gap={6} style={{ marginTop: 8 }}>
                    {it.approve && it.approve.allowed && <Btn size="sm" variant="primary" onClick={it.approve.run}>{it.approve.label}</Btn>}
                    {it.approve && !it.approve.allowed && <Badge>Needs another role to approve</Badge>}
                    <Btn size="sm" onClick={it.view}>{it.viewLabel || "View"}</Btn>
                    {it.assign && !a && <Btn size="sm" variant="subtle" onClick={() => addTask({ title: "Brief: " + it.assign!.title, priority: it.assign!.priority, owner: it.assign!.owner, link: it.assign!.link })}>Assign to {it.assign.owner.split(" ")[0]}</Btn>}
                    {a && <span onClick={() => openRecord({ kind: "task", id: a.id })} style={{ cursor: "pointer" }}><Badge tone="info">Assigned to {a.owner} · {a.status}</Badge></span>}
                  </Row>
                )}
              </div>
              <div style={{ flex: "none" }}>{it.done ? <Badge tone="ok">Done</Badge> : <Badge tone={it.tone}>{it.tone === "bad" ? "Today" : it.tone === "warn" ? "Due soon" : "Decide"}</Badge>}</div>
            </div>
          );
        })}
        {!items.length && <Empty title="Nothing in scope" body="The brief only shows items for the selected location." />}
      </div>
    </Card>
  );
}

/* ============================= All Locations ============================= */
interface SiteRow { l: Location; kids: number; booked: number; cap: number; occToday: number; occWeek: number; coll: number; rev: number; billed: number; revPerChild: number; incidents: number; ncs: number; gaps: number; tone: SiteTone; waitlist: number }
function siteRows(): SiteRow[] {
  return cached("cmd:rows:" + scopeLoc(), buildRows);
}
function buildRows(): SiteRow[] {
  const s = getState();
  const health = siteHealthAll(), day = siteDayAll(), rev = revenueByLocation();
  const ub = underbookedAll();
  return scopedLocations().map(l => {
    const occ = occupancy(l.id), re = rev.get(l.id);
    const claims = s.claims.filter(c => c.status === "Awaiting acceptance" && family(c.familyId)?.locationId === l.id).length;
    const chick = s.awards.filter(a => a.expires >= TODAY && a.expires <= "2026-10-31" && family(a.familyId)?.locationId === l.id).length;
    return {
      l, kids: day[l.id].enrolled, booked: occ.booked, cap: occ.cap, occToday: occ.rate, occWeek: weekOccupancy(l.id), coll: collectionRate(l.id),
      rev: re?.revenue || 0, billed: re?.children.size || 0, revPerChild: re && re.children.size ? re.revenue / re.children.size : 0,
      incidents: s.incidents.filter(i => i.locationId === l.id && i.status !== "Closed").length,
      ncs: claims + chick + (ub.get(l.id) || 0), gaps: health[l.id].gaps.length, tone: health[l.id].tone,
      waitlist: s.waitlist.filter(w => w.locationId === l.id && w.status === "Waiting").length,
    };
  });
}
/** Under-booked NCS families per site, unscoped (the global filter is applied by the caller). */
function underbookedAll(): Map<string, number> {
  return cached("cmd:ub", () => {
    const s = getState(), m = new Map<string, number>();
    const w = s.windows.find(x => x.status === "Open");
    if (!w) return m;
    for (const sub of w.submissions) {
      const f = family(sub.familyId); if (!f) continue;
      const agreed = f.childIds.map(id => idx().awardByChild.get(id)).filter(Boolean).reduce((n, a) => n + (a ? a.agreedHours : 0), 0);
      if (agreed && sub.hours < agreed) m.set(f.locationId, (m.get(f.locationId) || 0) + 1);
    }
    return m;
  });
}

type RankKey = "occ" | "coll" | "rpc" | "risk";
function AllLocations() {
  const { role } = useRos();
  const [rank, setRank] = useState<RankKey>("occ");
  const rows = siteRows();
  const key: Record<RankKey, (r: SiteRow) => number> = { occ: r => r.occWeek, coll: r => r.coll, rpc: r => r.revPerChild, risk: r => (r.tone === "bad" ? 100 : r.tone === "warn" ? 10 : 0) + r.gaps * 5 + r.incidents + r.ncs };
  const ranked = rows.slice().sort((a, b) => key[rank](b) - key[rank](a));
  const pos = new Map(ranked.map((r, i) => [r.l.id, i + 1]));
  const fin = role.finance;
  const cols: Col<SiteRow>[] = [
    { key: "rank", label: "#", w: "44px", render: r => <span style={{ color: "var(--faint)" }}>{pos.get(r.l.id)}</span>, sort: r => pos.get(r.l.id) || 0 },
    { key: "site", label: "Site", w: "1.5fr", render: r => <Stack><Row gap={6}><span style={{ fontWeight: 500 }}>{r.l.short}</span>{r.l.isHQ && <Badge tone="brand">HQ</Badge>}</Row><Sub>{r.l.county} · {r.kids} children</Sub></Stack>, sort: r => r.l.short },
    { key: "occ", label: "Occupancy (week)", w: "1.3fr", render: r => <div style={{ width: "100%" }}><Row gap={8}><span style={{ width: 42 }}>{pct(r.occWeek)}</span><div style={{ flex: 1 }}><Meter label="" value={r.booked} max={r.cap} /></div></Row></div>, sort: r => r.occWeek },
    { key: "coll", label: "Collected (due)", w: "1fr", align: "right", render: r => fin ? <span style={{ color: r.coll < 0.97 ? "var(--warn)" : undefined }}>{pct(r.coll, 1)}</span> : <Sub>Restricted</Sub>, sort: r => r.coll },
    { key: "rpc", label: "Revenue / child (wk)", w: "1fr", align: "right", render: r => fin ? euro(r.revPerChild) : <Sub>Restricted</Sub>, sort: r => r.revPerChild },
    { key: "inc", label: "Incidents open", w: ".8fr", align: "right", render: r => r.incidents ? <Badge tone="warn">{r.incidents}</Badge> : <Sub>0</Sub>, sort: r => r.incidents },
    { key: "ncs", label: "NCS exceptions", w: ".9fr", align: "right", render: r => r.ncs ? <Badge tone="warn">{r.ncs}</Badge> : <Sub>0</Sub>, sort: r => r.ncs },
    { key: "ratio", label: "Ratio", w: "1fr", render: r => r.gaps ? <Badge tone="bad" dot>{plural(r.gaps, "gap")}</Badge> : <Badge tone="ok">Covered</Badge>, sort: r => r.gaps },
    { key: "health", label: "Status", w: "1fr", render: r => <Badge tone={TONE_OF[r.tone]}>{SITE_TONE_LABEL[r.tone]}</Badge>, sort: r => (r.tone === "bad" ? 2 : r.tone === "warn" ? 1 : 0) },
  ];
  const best = ranked[0], worst = ranked[ranked.length - 1];
  const RANK_LABEL: Record<RankKey, string> = { occ: "Occupancy", coll: "Collection", rpc: "Revenue per child", risk: "Risk" };
  const metric = (r: SiteRow) => rank === "occ" ? pct(r.occWeek) : rank === "coll" ? (fin ? pct(r.coll, 1) : "Restricted") : rank === "rpc" ? (fin ? euro(r.revPerChild) : "Restricted") : plural(r.gaps + r.incidents + r.ncs, "item");
  return (
    <>
      <Row wrap gap={10} style={{ marginBottom: 14 }}>
        <Label>Rank by</Label>
        <Seg size="sm" value={rank} onChange={setRank} options={[["occ", "Occupancy"], ["coll", "Collection"], ["rpc", "Revenue per child"], ["risk", "Risk"]] as [RankKey, string][]} />
      </Row>
      {rows.length > 1 && (
        <Grid min={200} gap={10} style={{ marginBottom: 14 }}>
          <Kpi label={"Top on " + RANK_LABEL[rank].toLowerCase()} value={best.l.short} sub={metric(best)} tone="ok" onClick={() => nav("Locations", "Overview", { locationId: best.l.id })} />
          <Kpi label={"Bottom on " + RANK_LABEL[rank].toLowerCase()} value={worst.l.short} sub={metric(worst)} tone="warn" onClick={() => nav("Locations", "Overview", { locationId: worst.l.id })} />
          <Kpi label="Sites needing action" value={rows.filter(r => r.tone === "bad").length} sub="Ratio gap or child not at pickup" tone={rows.some(r => r.tone === "bad") ? "bad" : "ok"} onClick={() => setTab("Command", "Risks & Alerts")} />
          <Kpi label="Waitlist across sites" value={rows.reduce((n, r) => n + r.waitlist, 0)} sub={"Most at " + rows.slice().sort((a, b) => b.waitlist - a.waitlist)[0].l.short} onClick={goTo("Enrolment", "Waitlists")} />
        </Grid>
      )}
      <Card pad={false} title="Site performance" sub="Week occupancy averages Mon–Fri bookings against places. Collected (due) is the share of October invoices already due that has been paid. Select a column heading to re-sort.">
        <Table rows={ranked} cols={cols} rowKey={r => r.l.id} onRow={r => nav("Locations", "Overview", { locationId: r.l.id })} rowTone={r => r.tone === "bad" ? "bad" : undefined} minWidth={900} />
      </Card>
      <div className="ros-split-even" style={{ marginTop: 16 }}>
        <Card title="Week occupancy by site" sub="Select a site for its capacity view.">
          <HBars format={n => pct(n)} max={1} items={ranked.slice().sort((a, b) => b.occWeek - a.occWeek).map(r => ({ label: r.l.short, value: r.occWeek, tone: r.occWeek >= 0.95 ? "warn" : "accent", sub: r.booked + "/" + r.cap + " today", onClick: () => nav("Locations", "Capacity & Performance", { locationId: r.l.id }) }))} />
        </Card>
        <Card title={fin ? "Revenue per child this week" : "Children enrolled"} sub={fin ? "Gross session, transport and fee lines on the w/c 19 Oct invoices, before NCS subsidy." : "Finance detail is hidden for this role."}>
          <HBars format={n => fin ? euro0(n) : String(n)} items={ranked.slice().sort((a, b) => (fin ? b.revPerChild - a.revPerChild : b.kids - a.kids)).map(r => ({ label: r.l.short, value: fin ? r.revPerChild : r.kids, sub: fin ? euro0(r.rev) + " total" : undefined, onClick: () => nav("Locations", "Overview", { locationId: r.l.id }) }))} />
        </Card>
      </div>
    </>
  );
}

/* ============================== Cash & Debt ============================== */
type Bucket = "0–7" | "8–30" | "31–60" | "60+";
function CashDebt() {
  const { s } = useRos();
  const wf = weekFinance(), aged = agedDebt();
  const [bucket, setBucket] = useState<Bucket | "all">("all");
  const od = overdueInvoices();
  const inBucket = (d: number): Bucket => (d <= 7 ? "0–7" : d <= 30 ? "8–30" : d <= 60 ? "31–60" : "60+");
  const debts = s.invoices.filter(i => invoiceBalance(i) > 0 && i.due <= TODAY && invoiceStatus(i) !== "Nil" && invoiceStatus(i) !== "Scheduled DD" && inScope(family(i.familyId)?.locationId));
  const shown = debts.filter(i => bucket === "all" || inBucket(daysOverdue(i)) === bucket).sort((a, b) => invoiceBalance(b) - invoiceBalance(a));
  const byFam = new Map<string, { fid: string; bal: number; n: number; oldest: number }>();
  for (const i of od) { const e = byFam.get(i.familyId) || { fid: i.familyId, bal: 0, n: 0, oldest: 0 }; e.bal += invoiceBalance(i); e.n++; e.oldest = Math.max(e.oldest, daysOverdue(i)); byFam.set(i.familyId, e); }
  const top = [...byFam.values()].sort((a, b) => b.bal - a.bal).slice(0, 8);
  const plans = s.plans.filter(p => inScope(family(p.familyId)?.locationId));
  const weeks = ["2026-10-05", "2026-10-12", "2026-10-19"];
  const wk = weeks.map(w => {
    const inv = s.invoices.filter(i => i.weekOf === w && inScope(family(i.familyId)?.locationId));
    return { w, invoiced: inv.reduce((n, i) => n + Math.max(0, invoiceTotal(i)), 0), collected: inv.reduce((n, i) => n + Math.min(invoicePaid(i), Math.max(0, invoiceTotal(i))), 0) };
  });
  const rev = revenueByLocation();
  const sites = scopedLocations();
  const B: Bucket[] = ["0–7", "8–30", "31–60", "60+"];
  return (
    <>
      <Grid min={150} gap={10}>
        <Kpi label="Invoiced this week" value={euro0(wf.invoiced)} sub={wf.count + " invoices · w/c 19 Oct"} onClick={goTo("Billing", "Invoices")} />
        <Kpi label="Collected this week" value={euro0(wf.collected)} tone="ok" sub={pct(wf.invoiced ? wf.collected / wf.invoiced : 0) + " of invoiced"} onClick={goTo("Billing", "Payments & Reconciliation")} />
        <Kpi label="Scheduled direct debit" value={euro0(wf.scheduled)} tone="info" sub="Collects Fri 23 Oct (simulated)" onClick={goTo("Billing", "Invoices")} />
        <Kpi label="Still outstanding" value={euro0(wf.outstanding)} tone={wf.outstanding > 0 ? "warn" : "ok"} sub="This week, not on DD" onClick={goTo("Billing", "Reminder Stages")} />
        <Kpi label="Billed MTD" value={euro0(wf.mtdBilled)} sub="Invoices issued in October" onClick={goTo("Billing", "Statements & Exports")} />
        <Kpi label="Collected MTD" value={euro0(wf.mtdCollected)} sub={pct(wf.mtdRate, 1) + " collection rate"} onClick={goTo("Billing", "Overview")} />
        <Kpi label="NCS subsidy this week" value={euro0(wf.subsidy)} sub="Deducted on invoices" onClick={goTo("NCS", "Overview")} />
        <Kpi label="Aged debt" value={euro0(aged.total)} tone="warn" sub={plural(od.length, "overdue invoice")} onClick={() => setBucket("all")} />
      </Grid>

      <div className="ros-split" style={{ marginTop: 16 }}>
        <Card title="Aged debt" sub="Unpaid balances past their due date, by days overdue. Select a bucket to list its invoices." right={<Btn size="sm" onClick={() => nav("Billing", "Reminder Stages")}>Reminder stages</Btn>}>
          <ClickCols height={110} format={euro0} data={B.map(b => ({ label: b + " days · " + aged.counts[b], value: aged.buckets[b], tone: (b === "0–7" ? "accent" : b === "8–30" ? "warn" : "bad") as Tone, onClick: () => setBucket(bucket === b ? "all" : b) }))} />
          <div style={{ marginTop: 10 }}>
            <StackBar parts={B.map(b => ({ label: b + " · " + euro0(aged.buckets[b]), value: aged.buckets[b], tone: (b === "0–7" ? "info" : b === "8–30" ? "warn" : "bad") as Tone }))} />
          </div>
          <div style={{ marginTop: 14 }}>
            <Row style={{ marginBottom: 8 }}><Label>{bucket === "all" ? "All overdue balances" : bucket + " days overdue"}</Label><div style={{ flex: 1 }} />{bucket !== "all" && <Btn size="sm" variant="subtle" onClick={() => setBucket("all")}>Clear</Btn>}</Row>
            <Table dense pageSize={8} minWidth={560} rows={shown} rowKey={i => i.id} onRow={i => openRecord({ kind: "invoice", id: i.id })}
              cols={[
                { key: "id", label: "Invoice", w: "1fr", render: i => <RecLink r={{ kind: "invoice", id: i.id }} /> },
                { key: "f", label: "Family", w: "1.3fr", render: i => <Stack><span>{family(i.familyId)?.surname}</span><Sub>{i.familyId} · {locById(family(i.familyId)?.locationId || "")?.short}</Sub></Stack>, sort: i => family(i.familyId)?.surname || "" },
                { key: "d", label: "Days", w: ".6fr", align: "right", render: i => daysOverdue(i), sort: i => daysOverdue(i) },
                { key: "st", label: "Stage", w: "1.4fr", render: i => <Sub>{reminderStage(i).label}</Sub> },
                { key: "b", label: "Balance", w: ".9fr", align: "right", render: i => euro(invoiceBalance(i)), sort: i => invoiceBalance(i) },
              ]} />
          </div>
        </Card>
        <Stack gap={16}>
          <Card title="Top debtors" sub="Overdue balance by family. Select to open the family.">
            {top.map(t => { const f = family(t.fid); return (
              <ListRow key={t.fid} onClick={() => openRecord({ kind: "family", id: t.fid })} lead={<Avatar name={f?.surname || t.fid} size={26} />}
                title={<Row gap={6}>{f?.surname} <Sub>{t.fid}</Sub>{f?.blocked && <Badge tone="bad">Blocked</Badge>}</Row>}
                sub={plural(t.n, "invoice") + " · oldest " + t.oldest + " days · " + locById(f?.locationId || "")?.short}
                right={<span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{euro(t.bal)}</span>} />
            ); })}
            {!top.length && <Empty title="No overdue balances in scope" />}
          </Card>
          <Card title="Payment plans" sub={plural(plans.filter(p => p.status === "Active").length, "active plan") + " · " + plural(plans.filter(p => p.status === "Broken").length, "broken plan")} right={<Btn size="sm" onClick={() => nav("Billing", "Payment Plans")}>All plans</Btn>}>
            {plans.slice().sort((a, b) => (a.status === "Broken" ? -1 : 0) - (b.status === "Broken" ? -1 : 0) || b.instalments.filter(i => i.status === "Missed").length - a.instalments.filter(i => i.status === "Missed").length).map(p => {
              const missed = p.instalments.filter(i => i.status === "Missed").length;
              const paid = p.instalments.filter(i => i.status === "Paid").length;
              return <ListRow key={p.id} onClick={() => openRecord({ kind: "plan", id: p.id })} title={<Row gap={6}><RecLink r={{ kind: "plan", id: p.id }} />{family(p.familyId)?.surname}</Row>}
                sub={euro0(p.total) + " · " + paid + "/" + p.instalments.length + " paid · revision " + p.revision + " of " + p.maxRevisions + (missed ? " · " + missed + " missed" : "")}
                right={<StatusBadge s={p.status === "Active" && missed ? "Missed instalment" : p.status} />} tone={p.status === "Broken" ? "bad" : missed ? "warn" : undefined} />;
            })}
          </Card>
        </Stack>
      </div>

      <div className="ros-split-even" style={{ marginTop: 16 }}>
        <Card title="Weekly invoiced vs collected" sub="October weeks. Direct debits for w/c 19 Oct collect on Friday, so that week reads low until then.">
          <PairCols names={["Invoiced", "Collected"]} format={euro0} data={wk.map(w => ({ label: "w/c " + fmtDate(w.w), a: w.invoiced, b: w.collected, onClick: () => nav("Billing", "Invoices") }))} />
        </Card>
        <Card title="Revenue by site this week" sub="Gross lines on w/c 19 Oct invoices. Select a site to filter the app to it.">
          <HBars format={euro0} items={sites.map(l => ({ label: l.short, value: rev.get(l.id)?.revenue || 0, sub: pct(collectionRate(l.id), 1) + " of due collected", onClick: () => (getStateRole().scope === "ALL" ? setUi({ loc: l.id }) : nav("Locations", "Overview", { locationId: l.id })) })).sort((a, b) => b.value - a.value)} />
        </Card>
      </div>
      <Row wrap gap={8} style={{ marginTop: 16 }}>
        <Label>Open in Billing</Label>
        {["Invoices", "Payments & Reconciliation", "Reminder Stages", "Payment Plans", "Statements & Exports"].map(t => <Btn key={t} size="sm" onClick={() => nav("Billing", t)}>{t}</Btn>)}
      </Row>
    </>
  );
}
const getStateRole = () => roleDef(getUi().role);

/* ============================ Risks & Alerts ============================ */
type Sev = "Critical" | "High" | "Medium" | "Low";
const SEV_TONE: Record<Sev, Tone> = { Critical: "bad", High: "warn", Medium: "info", Low: "neutral" };
interface Risk { id: string; sev: Sev; cat: string; loc?: LocationId; title: ReactNode; detail: ReactNode; ref?: Ref; actions: ReactNode }

function useRisks(): Risk[] {
  const { s, role } = useRos();
  const out: Risk[] = [];
  for (const a of ratioAlerts()) {
    const iss = a.issue;
    const r = ratioCheck(a.loc, a.date, a.session, a.roomId);
    const offer = iss?.offerStaffIds?.[0];
    out.push({
      id: "ratio-" + a.loc + a.date + a.session + (a.roomId || ""), sev: a.date === TODAY ? "Critical" : "High", cat: "Ratio", loc: a.loc,
      title: <>{locById(a.loc)?.short} · {a.date === TODAY ? "today" : fmtDay(a.date)} {a.session}{a.roomId ? " (" + idx().room.get(a.roomId)?.name + ")" : ""}: {r.rostered} of {r.required} staff {iss && <RecLink r={{ kind: "issue", id: iss.id }} />}</>,
      detail: r.booked + " booked at the demo 1:" + r.ratio + " ratio (illustrative configuration, not a regulatory determination)." + (iss?.offerStaffIds?.length ? " Relief offered: " + iss.offerStaffIds.map(id => staffById(id)?.name).join(", ") + "." : ""),
      ref: iss ? { kind: "issue", id: iss.id } : undefined,
      actions: <>{iss && offer && canRelief(role) && <Btn size="sm" variant="primary" onClick={() => confirmThen({ title: "Approve " + staffById(offer)?.name + "?", body: "Adds a qualified relief shift to " + locById(a.loc)?.short + " on " + fmtDay(a.date) + " and resolves " + iss.id + ".", confirmLabel: "Approve relief", run: () => approveRelief({ issueId: iss.id, staffId: offer }) })}>Approve {staffById(offer)?.name.split(" ")[0]}</Btn>}
        <Btn size="sm" onClick={() => (iss ? openRecord({ kind: "issue", id: iss.id }) : nav("Bookings", "Ratios"))}>Resolve</Btn></>,
    });
  }
  for (const m of missingChildAlerts()) out.push({ id: m.id, sev: "Critical", cat: "Safeguarding", loc: m.locationId, title: <>{m.title} <RecLink r={{ kind: "issue", id: m.id }} /></>, detail: "A person must confirm the child's whereabouts. This alert cannot be closed by an agent.", ref: { kind: "issue", id: m.id }, actions: <Btn size="sm" variant="danger" onClick={() => openRecord({ kind: "issue", id: m.id })}>Open alert</Btn> });
  const ca = certAlerts();
  for (const st of ca.expired) out.push({ id: "cert-x-" + st.id, sev: "High", cat: "Compliance", loc: st.locationId, title: <>Garda vetting expired: {st.name} · blocked from rota</>, detail: "Expired " + fmtDate(st.certs.find(c => c.kind === "Garda vetting")?.expires || TODAY) + ". The rota agent will not place this person on any session until renewal.", ref: { kind: "staff", id: st.id }, actions: <><Btn size="sm" onClick={() => openRecord({ kind: "staff", id: st.id })}>Open</Btn>{goTo("Staff", "Certifications") && <Btn size="sm" variant="subtle" onClick={goTo("Staff", "Certifications")}>Certifications</Btn>}</> });
  for (const st of ca.soon) {
    const c = st.certs.filter(x => x.expires >= TODAY && daysBetween(TODAY, x.expires) <= 30).sort((a, b) => a.expires.localeCompare(b.expires))[0];
    out.push({ id: "cert-s-" + st.id, sev: daysBetween(TODAY, c.expires) <= 14 ? "Medium" : "Low", cat: "Compliance", loc: st.locationId, title: <>{c.kind} expires {fmtDate(c.expires)}: {st.name}</>, detail: daysBetween(TODAY, c.expires) + " days left · " + st.role + " · " + locById(st.locationId)?.short, ref: { kind: "staff", id: st.id }, actions: <Btn size="sm" onClick={() => openRecord({ kind: "staff", id: st.id })}>Open</Btn> });
  }
  for (const c of medicationReviews()) out.push({ id: "med-" + c.id, sev: "High", cat: "Medical", loc: c.locationId, title: role.medical ? <>Medication expires {fmtDate(c.medication!.expires)}: {childName(c)}</> : <>Medication review due · 1 child at {locById(c.locationId)?.short}</>, detail: role.medical ? c.medication!.name + " · stored in " + c.medication!.stored + ". Parent to supply a replacement before expiry." : "Medical detail is visible to authorised roles only.", ref: role.medical ? { kind: "child", id: c.id } : undefined, actions: role.medical ? <Btn size="sm" onClick={() => openRecord({ kind: "child", id: c.id })}>Open child</Btn> : <Badge>Restricted</Badge> });
  for (const i of openIncidents()) out.push({ id: "inc-" + i.id, sev: i.severity === "Notifiable" ? "Critical" : "Medium", cat: "Safeguarding", loc: i.locationId, title: role.safeguarding ? <>{i.kind} · {i.status.toLowerCase()} <RecLink r={{ kind: "incident", id: i.id }} /></> : <>Incident {i.id} · {i.status.toLowerCase()}</>, detail: role.safeguarding ? locById(i.locationId)?.short + " · " + fmtDay(i.date) + " " + i.time + " · parent signature " + (i.parentSigned ? "received" : "awaited") + " · manager review " + (i.managerReviewed ? "done" : "pending") : "Safeguarding detail is visible to authorised roles only.", ref: role.safeguarding ? { kind: "incident", id: i.id } : undefined, actions: role.safeguarding ? <Btn size="sm" onClick={() => openRecord({ kind: "incident", id: i.id })}>Open</Btn> : <Badge>Restricted</Badge> });
  const chick = chickExpiring();
  if (chick.length) out.push({ id: "chick", sev: "Medium", cat: "NCS", title: <>{plural(chick.length, "CHICK")} expire before 31 Oct</>, detail: "Earliest " + fmtDate(chick.slice().sort((a, b) => a.expires.localeCompare(b.expires))[0].expires) + ". Renewal reminders go out from NCS & Funding.", actions: <Btn size="sm" onClick={() => nav("NCS", "CHICK Register")}>Open register</Btn> });
  for (const c of claimsPending().filter(c => c.deadline <= TOMORROW + " 23:59")) {
    const f = family(c.familyId);
    out.push({ id: "claim-" + c.id, sev: c.deadline.slice(0, 10) === TODAY ? "High" : "Medium", cat: "NCS", loc: f?.locationId, title: <><RecLink r={{ kind: "claim", id: c.id }} /> lapses {c.deadline.slice(0, 10) === TODAY ? "today" : fmtDay(c.deadline.slice(0, 10))} {c.deadline.slice(11)} · {f?.surname} {role.finance ? euro(c.amount) : ""}</>, detail: c.hours + "h for " + c.period + " · " + plural(c.reminders.length, "reminder") + " sent", ref: { kind: "claim", id: c.id }, actions: <><Btn size="sm" variant="primary" onClick={() => sendClaimReminder({ claimId: c.id })}>Send reminder</Btn><Btn size="sm" onClick={() => openRecord({ kind: "claim", id: c.id })}>Open</Btn></> });
  }
  for (const camp of s.camps.filter(c => c.start >= TODAY && inScope(c.locationId))) {
    const unpaid = s.campRegs.filter(r => r.campId === camp.id && !r.paid).length;
    if (unpaid) out.push({ id: "camp-" + camp.id, sev: "Low", cat: "Camps", loc: camp.locationId, title: <>{camp.name}: {plural(unpaid, "place")} unpaid</>, detail: "Starts " + fmtDay(camp.start) + ". Unpaid places are held until Friday under the demo camp policy.", ref: { kind: "camp", id: camp.id }, actions: <Btn size="sm" onClick={() => nav("Camps", "Registrations", { campId: camp.id })}>Registrations</Btn> });
  }
  if (role.finance) {
    for (const p of s.plans.filter(p => p.status === "Broken" && inScope(family(p.familyId)?.locationId))) out.push({ id: "plan-" + p.id, sev: "High", cat: "Money", loc: family(p.familyId)?.locationId, title: <>Payment plan <RecLink r={{ kind: "plan", id: p.id }} /> broken · {family(p.familyId)?.surname} {euro0(p.total)}</>, detail: p.nextAction + ".", ref: { kind: "plan", id: p.id }, actions: <Btn size="sm" onClick={() => openRecord({ kind: "plan", id: p.id })}>Open plan</Btn> });
    const blocked = s.families.filter(f => f.blocked && inScope(f.locationId));
    if (blocked.length) out.push({ id: "blocked", sev: "Low", cat: "Money", title: <>{plural(blocked.length, "family", "families")} booking-blocked for overdue balances</>, detail: blocked.map(f => f.surname + " (" + f.id + ")").join(", ") + ". Current-week bookings are unaffected.", actions: <Btn size="sm" onClick={() => nav("Billing", "Reminder Stages")}>Reminder stages</Btn> });
  }
  for (const ck of s.checks.filter(c => !c.done && c.due <= "2026-10-23" && inScope(c.locationId))) out.push({ id: "chk-" + ck.id, sev: "Low", cat: "Compliance", loc: ck.locationId, title: <>{ck.kind} not signed off · {locById(ck.locationId)?.short}</>, detail: "Due " + fmtDay(ck.due) + ".", actions: goTo("Compliance", "Site Logs") ? <Btn size="sm" onClick={goTo("Compliance", "Site Logs")}>Site logs</Btn> : <Badge>Location manager</Badge> });
  const order: Sev[] = ["Critical", "High", "Medium", "Low"];
  return out.filter(r => !r.loc || inScope(r.loc)).sort((a, b) => order.indexOf(a.sev) - order.indexOf(b.sev));
}

function Risks() {
  const { s } = useRos();
  const risks = useRisks();
  const [sev, setSev] = useState<Sev | "All">("All");
  const [cat, setCat] = useState("All");
  const cats = ["All", ...Array.from(new Set(risks.map(r => r.cat)))];
  const shown = risks.filter(r => (sev === "All" || r.sev === sev) && (cat === "All" || r.cat === cat));
  const n = (v: Sev) => risks.filter(r => r.sev === v).length;
  const resolved = s.issues.filter(i => i.status === "Resolved" && inScope(i.locationId));
  return (
    <>
      <Grid min={150} gap={10}>
        {(["Critical", "High", "Medium", "Low"] as Sev[]).map(v => <Kpi key={v} label={v} value={n(v)} tone={n(v) ? SEV_TONE[v] : "ok"} sub={v === "Critical" ? "Child safety or ratio today" : v === "High" ? "Inside 24 hours" : v === "Medium" ? "This week" : "Housekeeping"} onClick={() => setSev(sev === v ? "All" : v)} />)}
      </Grid>
      <div className="ros-split" style={{ marginTop: 16 }}>
        <Card title="Live risk feed" sub={shown.length + " of " + risks.length + " shown. Items leave this list as soon as their record is resolved."} pad={false}>
          <Row wrap gap={8} style={{ padding: "0 18px 10px" }}>
            <Seg size="sm" value={sev} onChange={setSev} options={["All", "Critical", "High", "Medium", "Low"] as (Sev | "All")[]} />
            <Seg size="sm" value={cat} onChange={setCat} options={cats} />
          </Row>
          <div style={{ padding: "0 6px 8px" }}>
            {shown.map(r => (
              <div key={r.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "11px 12px", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
                <div style={{ width: 72, flex: "none" }}><Badge tone={SEV_TONE[r.sev]} dot={r.sev === "Critical"}>{r.sev}</Badge></div>
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 3, lineHeight: 1.5 }}>{r.detail}</div>
                  <Row gap={6} style={{ marginTop: 6 }}><Badge>{r.cat}</Badge>{r.loc && <Badge tone="neutral">{locById(r.loc)?.short}</Badge>}</Row>
                </div>
                <Row gap={6} wrap style={{ flex: "none" }}>{r.actions}</Row>
              </div>
            ))}
            {!shown.length && <Empty title="No risks match" body="Change the severity or category filter." />}
          </div>
        </Card>
        <Stack gap={16}>
          <Card title="By category">
            <HBars items={cats.filter(c => c !== "All").map(c => ({ label: c, value: risks.filter(r => r.cat === c).length, tone: risks.some(r => r.cat === c && r.sev === "Critical") ? "bad" : "accent", onClick: () => setCat(cat === c ? "All" : c) }))} />
          </Card>
          <Card title="Resolved today" sub="Ratio and safeguarding alerts closed by a person.">
            {resolved.length ? resolved.map(i => <ListRow key={i.id} onClick={() => openRecord({ kind: "issue", id: i.id })} title={i.title} sub={(i.resolvedBy || "") + " · " + rel(i.resolvedAt || "")} right={<Badge tone="ok">Resolved</Badge>} />) : <Empty title="Nothing resolved yet" body="Approve the Arklow Rocks relief to see it move here." />}
          </Card>
        </Stack>
      </div>
    </>
  );
}

/* =========================== Today's Timeline =========================== */
interface TItem { date: ISODate; min: number; title: ReactNode; detail?: ReactNode; tone: Tone; kind: string; ref?: Ref }
function useTimeline(): { today: TItem[]; later: TItem[] } {
  const { s, role } = useRos();
  const today: TItem[] = [], later: TItem[] = [];
  for (const e of s.activity) {
    if (e.at.slice(0, 10) !== TODAY || !inScope(e.locationId)) continue;
    if (!role.finance && e.category === "Financial") continue;
    today.push({ date: TODAY, min: toMin(e.at.slice(11, 16)), title: <>{e.title}{e.link && <> <RecLink r={e.link} /></>}</>, detail: e.actor + " · " + e.detail, tone: e.actorKind === "agent" ? "info" : e.category === "Safeguarding" ? "bad" : "neutral", kind: "Logged" });
  }
  const sites = scopedLocations().map(l => l.id) as string[];
  const tb = bookingsOn(TODAY).filter(b => sites.includes(b.locationId));
  const partDay = tb.filter(b => b.session === "Full Day" && b.start === "09:00").length;
  if (partDay) today.push({ date: TODAY, min: toMin("09:00"), title: "Part-day Early Years arrivals", detail: partDay + " children booked from 09:00", tone: "accent", kind: "Scheduled" });
  for (const t of s.tasks) {
    if (t.status === "Done" || t.dueDate !== TODAY || (t.locationId && !inScope(t.locationId))) continue;
    const m = t.due.match(/(\d\d:\d\d)/);
    if (m) today.push({ date: TODAY, min: toMin(m[1]), title: <>Task due: {t.title}</>, detail: t.owner + " · " + t.department, tone: t.priority === "High" ? "warn" : "neutral", kind: "Scheduled", ref: { kind: "task", id: t.id } });
  }
  for (const rt of s.routes.filter(r => sites.includes(r.locationId))) {
    const n = manifestCount(rt.id);
    today.push({ date: TODAY, min: toMin(rt.stops[0].time), title: <>School run <RecLink r={{ kind: "route", id: rt.id }} /> · {rt.name}</>, detail: rt.stops.map(st => st.time + " " + (s.schools.find(x => x.id === st.schoolId)?.name || "")).join(" · ") + " · " + plural(n, "rider"), tone: "info", kind: "Scheduled", ref: { kind: "route", id: rt.id } });
  }
  const jun = tb.filter(b => b.session === "After School" && b.start === "14:00").length;
  if (jun) today.push({ date: TODAY, min: toMin("14:00"), title: "Infant After School starts", detail: jun + " junior children booked from 14:00", tone: "accent", kind: "Scheduled" });
  if (inScope("ARR")) { const r = ratioCheck("ARR", TODAY, "After School"); today.push({ date: TODAY, min: toMin("15:00"), title: <>Arklow Rocks 3pm After School {!r.ok && <RecLink r={{ kind: "issue", id: "STAFF-ARK-019" }} />}</>, detail: r.booked + " booked · " + r.rostered + " of " + r.required + " staff " + (r.ok ? "(covered)" : "(one short)"), tone: r.ok ? "ok" : "bad", kind: "Scheduled", ref: r.ok ? undefined : { kind: "issue", id: "STAFF-ARK-019" } }); }
  const sen = tb.filter(b => b.session === "After School" && b.start === "15:00").length;
  if (sen) today.push({ date: TODAY, min: toMin("15:00"), title: "After School main session", detail: sen + " children booked from 15:00 across " + plural(new Set(tb.filter(b => b.session === "After School").map(b => b.locationId)).size, "site"), tone: "accent", kind: "Scheduled" });
  for (const c of s.claims.filter(c => c.deadline.slice(0, 10) === TODAY && inScope(family(c.familyId)?.locationId))) {
    const f = family(c.familyId);
    today.push({ date: TODAY, min: toMin(c.deadline.slice(11)), title: <>NCS claim <RecLink r={{ kind: "claim", id: c.id }} /> {c.status === "Awaiting acceptance" ? "lapses" : c.status.toLowerCase()} · {f?.surname} ({f?.id}){role.finance ? " " + euro(c.amount) : ""}</>, detail: c.status === "Awaiting acceptance" ? "Acceptance deadline. Hours may be charged privately after review if it lapses." : "Accepted before the deadline.", tone: c.status === "Awaiting acceptance" ? "warn" : "ok", kind: "Deadline", ref: { kind: "claim", id: c.id } });
  }
  const lastEnd = tb.filter(b => b.session === "After School").reduce((m, b) => (b.end > m ? b.end : m), "");
  if (lastEnd) today.push({ date: TODAY, min: toMin(lastEnd), title: "Last booked After School collections", detail: tb.filter(b => b.session === "After School" && b.end === lastEnd).length + " children booked until " + lastEnd + ". Late collection is billed to the next full hour (demo fee rule).", tone: "neutral", kind: "Scheduled" });

  /* later this week */
  const iss = s.issues.filter(i => i.date > TODAY && inScope(i.locationId));
  for (const i of iss) { const r = ratioCheck(i.locationId, i.date, i.session as "After School"); later.push({ date: i.date, min: toMin("15:00"), title: <>{locById(i.locationId)?.short} After School <RecLink r={{ kind: "issue", id: i.id }} /></>, detail: r.booked + " booked · " + r.rostered + " of " + r.required + " staff " + (r.ok ? "(covered)" : "(one short)"), tone: r.ok ? "ok" : "bad", kind: "Forecast", ref: { kind: "issue", id: i.id } }); }
  const byDay = new Map<string, number>();
  for (const c of claimsPending().filter(c => c.deadline.slice(0, 10) > TODAY)) byDay.set(c.deadline, (byDay.get(c.deadline) || 0) + 1);
  for (const [d, n] of byDay) later.push({ date: d.slice(0, 10), min: toMin(d.slice(11)), title: plural(n, "NCS claim") + " lapse unless accepted", detail: "Day 2, 4 and 6 reminders run automatically (simulated).", tone: "warn", kind: "Deadline" });
  const w = s.windows.find(x => x.status === "Open");
  if (w) later.push({ date: w.closes.slice(0, 10), min: toMin(w.closes.slice(11)), title: "Booking window closes for " + w.label, detail: w.submissions.filter(x => inScope(family(x.familyId)?.locationId)).length + " families have submitted so far", tone: "accent", kind: "Deadline" });
  const pc = s.approvals.find(a => a.kind === "NCS private-charge proposal" && a.status === "Pending");
  if (pc && role.finance) later.push({ date: "2026-10-22", min: toMin("12:00"), title: <>CHICK deadline for camp week <RecLink r={{ kind: "approval", id: pc.id }} /></>, detail: "If the CHICK has not arrived, camp hours move to private (" + euro(pc.amount || 0) + ") on approval.", tone: "warn", kind: "Deadline" });
  for (const t of s.tasks) {
    if (t.status === "Done" || t.dueDate <= TODAY || t.dueDate > "2026-10-26" || (t.locationId && !inScope(t.locationId))) continue;
    const m = t.due.match(/(\d\d:\d\d)/);
    later.push({ date: t.dueDate, min: m ? toMin(m[1]) : toMin("17:00"), title: <>Task due: {t.title}</>, detail: t.owner + " · " + t.department, tone: t.priority === "High" ? "warn" : "neutral", kind: "Task", ref: { kind: "task", id: t.id } });
  }
  const hw = s.camps.filter(c => c.start === "2026-10-26" && inScope(c.locationId));
  if (hw.length) later.push({ date: "2026-10-26", min: toMin("08:30"), title: "Halloween camps start · no school runs during midterm", detail: hw.map(c => c.name + " " + s.campRegs.filter(r => r.campId === c.id && r.status === "Confirmed").length + "/" + c.capacity).join(" · "), tone: "accent", kind: "Scheduled" });
  today.sort((a, b) => a.min - b.min);
  later.sort((a, b) => (a.date + hm(a.min)).localeCompare(b.date + hm(b.min)));
  return { today, later };
}
const manifestCount = (routeId: string) => cached("cmd:man:" + routeId, () => bookingsOn(TODAY).filter(b => b.routeId === routeId && b.session === "After School").length);

function TodayTimeline() {
  const { s } = useRos();
  const { today, later } = useTimeline();
  const [show, setShow] = useState<"All" | "Done" | "Coming up">("All");
  const now = s.clockMin;
  const past = today.filter(t => t.min <= now), next = today.filter(t => t.min > now);
  const list = show === "Done" ? past : show === "Coming up" ? next : today;
  const items = list.map(t => ({
    at: hm(t.min) + (t.min <= now ? "" : " · upcoming"),
    title: <span style={{ color: t.min <= now ? "var(--body)" : "var(--ink)" }}>{t.title}</span>,
    detail: t.detail, tone: (t.min <= now ? (t.tone === "neutral" ? "ok" : t.tone) : t.tone === "neutral" ? "accent" : t.tone) as Tone,
    right: <Badge tone={t.min <= now ? "neutral" : "accent"}>{t.min <= now ? (t.kind === "Logged" ? "Done" : "Passed") : t.kind}</Badge>,
  }));
  if (show === "All") {
    const at = items.findIndex((_, i) => list[i].min > now);
    const marker = { at: "Now", title: <b>Demo clock {hm(now)}</b>, detail: past.length + " events so far · " + next.length + " still to come today", tone: "accent" as Tone, right: <Badge tone="brand">Now</Badge> };
    if (at === -1) items.push(marker); else items.splice(at, 0, marker);
  }
  return (
    <>
      <Grid min={170} gap={10}>
        <Kpi label="Logged today" value={past.length} sub={"Up to " + hm(now)} onClick={() => setShow("Done")} />
        <Kpi label="Still to come" value={next.length} tone="info" sub="Runs, sessions and deadlines" onClick={() => setShow("Coming up")} />
        <Kpi label="Deadlines today" value={today.filter(t => t.kind === "Deadline" && t.min > now).length} tone="warn" sub="NCS claim cut-offs at 17:00" onClick={goTo("NCS", "Claims & Acceptances")} />
        <Kpi label="Later this week" value={later.length} sub="Forecasts, window close, camps" onClick={() => document.getElementById("cmd-later")?.scrollIntoView({ behavior: "smooth" })} />
      </Grid>
      <div className="ros-split" style={{ marginTop: 16 }}>
        <Card title={longDate(TODAY)} sub="Logged events come from Activity; scheduled items come from routes, bookings, tasks and claim deadlines.">
          <div style={{ marginBottom: 14 }}><Seg size="sm" value={show} onChange={setShow} options={["All", "Done", "Coming up"] as ("All" | "Done" | "Coming up")[]} /></div>
          {items.length ? <Timeline items={items} /> : <Empty title="Nothing here" />}
        </Card>
        <Card id="cmd-later" title="Later this week" sub="Wednesday to Monday, including the Halloween midterm.">
          <Timeline items={later.map(t => ({ at: fmtDay(t.date) + " " + hm(t.min), title: t.title, detail: t.detail, tone: t.tone, right: <Badge tone="neutral">{t.kind}</Badge> }))} />
        </Card>
      </div>
    </>
  );
}

/* =============================== Decisions =============================== */
function Decisions() {
  const { s, role } = useRos();
  const pend = pendingApprovals().filter(a => inScope(approvalLoc(a)));
  const others = s.approvals.filter(a => a.status === "Pending" && !pend.includes(a) && inScope(approvalLoc(a)));
  const reqs = pendingRequests();
  const decided = [
    ...s.approvals.filter(a => a.status !== "Pending" && inScope(approvalLoc(a))).map(a => ({ at: a.decidedAt || "", title: a.kind + " " + a.status.toLowerCase() + ": " + a.title, by: a.decidedBy || "", ref: { kind: "approval", id: a.id } as Ref, st: a.status })),
    ...s.requests.filter(r => r.status !== "Pending" && inScope(r.locationId)).map(r => ({ at: r.decidedAt || "", title: r.kind + " " + r.id + " " + r.status.toLowerCase() + " · " + childName(child(r.childId)), by: r.decidedBy || "", ref: { kind: "request", id: r.id } as Ref, st: r.status })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const decideReq = (id: string, d: "Approved" | "Declined") => {
    const r = s.requests.find(x => x.id === id)!;
    const k = requestChecks(id);
    confirmThen({
      title: (d === "Approved" ? "Approve " : "Decline ") + r.id + "?",
      body: d === "Declined" ? "Nothing changes downstream. The family is told the request could not be accommodated (simulated)." : r.kind === "Late booking" ? "Creates the booking, adds " + euro(k.add) + " to " + (k.inv?.id || "the invoice") + ", updates the register" + (r.routeId ? " and the " + r.routeId + " manifest" : "") + "." : r.kind === "Change" ? "Updates the booking times and re-prices the invoice line." : "Removes the booking from the register. The week is locked, so no refund applies.",
      confirmLabel: d === "Approved" ? "Approve" : "Decline", danger: d === "Declined", run: () => decideRequest({ id, decision: d }),
    });
  };
  return (
    <>
      <Grid min={170} gap={10}>
        <Kpi label="Approvals for you" value={pend.length} tone={pend.length ? "warn" : "ok"} sub={"As " + role.label} />
        <Kpi label="Waiting on other roles" value={others.length} sub="Visible, not yours to decide" />
        <Kpi label="Booking requests" value={reqs.length} tone={reqs.length ? "info" : "ok"} sub={["Late booking", "Change", "Cancellation"].map(k => reqs.filter(r => r.kind === k).length + " " + (k === "Late booking" ? "late" : k.toLowerCase())).join(" · ")} onClick={goTo("Bookings", "Late & Change Requests")} />
        <Kpi label="Decided" value={decided.length} tone="ok" sub="Since the demo started" />
      </Grid>
      <div className="ros-split" style={{ marginTop: 16 }}>
        <Stack gap={16}>
          <Card title="Approvals" sub="Agents propose; people decide. Approving applies the change to every linked record.">
            {pend.concat(others).map(a => {
              const can = canApprove(role, a);
              return (
                <div key={a.id} style={{ padding: "12px 0", borderTop: "1px solid var(--border)" }}>
                  <Row wrap gap={6}><Badge tone="info">{a.kind}</Badge><RecLink r={{ kind: "approval", id: a.id }} />{a.link && <RecLink r={a.link} />}{a.amount ? <Badge>{mask(role, euro(a.amount))}</Badge> : null}{approvalLoc(a) && <Badge tone="neutral">{locById(approvalLoc(a) || "")?.short}</Badge>}</Row>
                  <div style={{ fontSize: 13.5, fontWeight: 500, marginTop: 8 }}>{a.title}</div>
                  <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 4, lineHeight: 1.5 }}>{a.summary}</div>
                  <div style={{ fontSize: 12, color: "var(--faint)", marginTop: 4 }}>On approval: {a.effect}. Requested by {a.requestedBy} · {rel(a.requestedAt)}</div>
                  <Row wrap gap={6} style={{ marginTop: 8 }}>
                    {can ? <>
                      <Btn size="sm" variant="primary" onClick={() => confirmThen({ title: "Approve: " + a.title + "?", body: a.effect + ".", confirmLabel: "Approve", run: () => decideApproval({ id: a.id, decision: "Approved" }) })}>Approve</Btn>
                      <Btn size="sm" variant="danger" onClick={() => confirmThen({ title: "Decline " + a.id + "?", body: "Nothing changes downstream. The decline is recorded in Activity.", confirmLabel: "Decline", danger: true, run: () => decideApproval({ id: a.id, decision: "Declined" }) })}>Decline</Btn>
                    </> : <Badge>Waiting on {ROLE_WORD[a.ownerRole]}</Badge>}
                    <Btn size="sm" variant="subtle" onClick={() => openRecord({ kind: "approval", id: a.id })}>Details</Btn>
                  </Row>
                </div>
              );
            })}
            {!pend.length && !others.length && <Empty title="No approvals waiting" body="Everything proposed by the agents has been decided." />}
          </Card>
        </Stack>
        <Stack gap={16}>
          <Card title="Booking requests" sub="Late, change and cancellation requests with the demo policy checks." pad={false}>
            <div style={{ padding: "0 6px 8px" }}>
              {reqs.map(r => {
                const k = requestChecks(r.id);
                const ok = [r.kind === "Cancellation" || k.noticeOk, k.capOk, k.ratioOk];
                return (
                  <div key={r.id} style={{ padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
                    <Row wrap gap={6}><RecLink r={{ kind: "request", id: r.id }} /><Badge tone="info">{r.kind}</Badge><Badge tone="neutral">{locById(r.locationId)?.short}</Badge>{ok.every(Boolean) ? <Badge tone="ok">Checks pass</Badge> : <Badge tone="warn">{ok.filter(x => !x).length} to check</Badge>}</Row>
                    <div style={{ fontSize: 13, marginTop: 6 }}>{childName(child(r.childId))} · {fmtDay(r.date)} {r.start}–{r.end}</div>
                    <Sub>{family(r.familyId)?.surname} ({r.familyId}) · received {rel(r.received)}{r.kind === "Late booking" && role.finance ? " · adds " + euro(k.add) : ""}</Sub>
                    {role.id !== "driver" && <Row gap={6} style={{ marginTop: 8 }}><Btn size="sm" variant="primary" onClick={() => decideReq(r.id, "Approved")}>Approve</Btn><Btn size="sm" variant="danger" onClick={() => decideReq(r.id, "Declined")}>Decline</Btn><Btn size="sm" variant="subtle" onClick={() => openRecord({ kind: "request", id: r.id })}>Checks</Btn></Row>}
                  </div>
                );
              })}
              {!reqs.length && <Empty title="No pending requests" />}
            </div>
          </Card>
          <Card title="Recently decided">
            {decided.length ? decided.slice(0, 12).map((d, i) => <ListRow key={i} onClick={() => openRecord(d.ref)} title={d.title} sub={d.by + " · " + rel(d.at)} right={<StatusBadge s={d.st} />} />) : <Empty title="Nothing decided yet" body="Approve or decline an item and it appears here with who decided and when." />}
          </Card>
        </Stack>
      </div>
    </>
  );
}
