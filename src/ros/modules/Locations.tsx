/* Locations: one site's operational dashboard plus the group views of sites,
   rooms, attendance, capacity and the map. Site choice follows role scope,
   then the header location filter, then the site picked here. */
import { useState, type ReactNode } from "react";
import type { LocationId, Location, Room, Tone, Booking, Session } from "../types";
import { useRos, nav, setUi, setTab, setFocus, openRecord, confirmThen, pushToast } from "../store";
import {
  ratioCheck, occupancy, weekOccupancy, collectionRate, revenueByLocation, invoiceTotal, invoicePaid, invoiceStatus, invoiceBalance,
  family, child, childName, staffById, locById, idx, cached, inScope, scopeLoc, scopedLocations, bookingsOn, register, manifest, childStatus,
  certStatus, absentStaff,
} from "../selectors";
import { approveRelief, decideApproval, advanceAfternoon } from "../actions";
import { TODAY, TOMORROW, THIS_WEEK, PM_MIN, fmtDay, fmtDate, euro, euro0, pct, hm, toMin, dow, daysBetween } from "../time";
import {
  Page, PageHead, Card, Kpi, Grid, Table, Badge, StatusBadge, Btn, RecLink, HBars, StackBar, Meter, KV, Callout, Seg, ListRow,
  Empty, Avatar, Row, Stack, Sub, Label, Search, toneInk, type Col,
} from "../ui";
import { TaskRow } from "../records";
import {
  IrelandMap, siteHealthAll, siteDayAll, siteNextRun, goTo, longDate, ClickCols, plural, SITE_TONE_LABEL, DAY_STATE_LABEL, DAY_STATE_TONE,
  type SiteTone, type DayState,
} from "./IrelandMap";

const TONE_OF: Record<SiteTone, Tone> = { bad: "bad", warn: "warn", ok: "ok" };
const SERVICE: Record<string, string> = { EY: "Early Years", SAC: "School Age", CAMPS: "Camps", TRANSPORT: "Transport", ADMIN: "Admin office", TRAINING: "Training centre" };

/** Per-booking state for today, relative to that booking's own start time. */
function bookingState(b: Booking, clock: number): DayState {
  const st = childStatus(b.childId);
  if (st.status === "Signed in") return "in";
  if (st.status === "On bus") return "bus";
  if (st.status === "Absent" || st.status === "Not present") return "absent";
  if (st.status === "Signed out" && st.time && st.time >= b.start) return "out";
  return toMin(b.start) <= clock ? "due" : "later";
}

export default function Locations({ tab }: { tab: string }) {
  const { s, ui, role } = useRos();
  const sc = scopeLoc();
  const focus = ui.focus.locationId && locById(ui.focus.locationId) ? (ui.focus.locationId as LocationId) : undefined;
  const siteId: LocationId = sc !== "ALL" ? sc : focus || "HAZ";
  const l = locById(siteId)!;
  const picker = sc === "ALL"
    ? <select aria-label="Site" className="ros-input" value={siteId} onChange={(e) => setFocus({ locationId: e.target.value })} style={{ width: 200, height: 32, borderRadius: 999 }}>
        {s.locations.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
    : <Badge tone="info">{role.scope === "ALL" ? "Header filter: " + l.short : "Your site: " + l.short}</Badge>;
  const strap = longDate(TODAY) + " · " + hm(s.clockMin);
  switch (tab) {
    case "Site Directory": return <Page><PageHead eyebrow="Locations · Site Directory" title="Nine sites, one group" sub="Services, managers, places and collection points for every Ray of Sunshine site. Contact runs through HQ admin." /><Directory /></Page>;
    case "Rooms & Groups": return <Page><PageHead eyebrow="Locations · Rooms & Groups" title="Rooms and groups" sub={"Every room with its demo ratio, capacity and today's bookings. " + strap + "."} /><Rooms /></Page>;
    case "Attendance Status": return <Page><PageHead eyebrow="Locations · Attendance Status" title="Who is where right now" sub={"Booked children by site against kiosk, room and bus records. " + strap + "."} /><Attendance initial={siteId} /></Page>;
    case "Capacity & Performance": return <Page><PageHead eyebrow="Locations · Capacity & Performance" title="Capacity and demand" sub="Occupancy by day this week, waitlist pressure and free places by site." /><Capacity initial={focus || (sc !== "ALL" ? sc : undefined)} /></Page>;
    case "Map": return <Page><PageHead eyebrow="Locations · Map" title="Site map" sub="Schematic map of all nine sites. Pin colour comes from live ratio, safeguarding, NCS, debt and compliance records." right={picker} /><MapView siteId={siteId} /></Page>;
    default: return (
      <Page>
        <PageHead eyebrow={"Locations · Overview · " + strap} title={<Row gap={8} wrap>{l.name}{l.isHQ && <Badge tone="brand">HQ</Badge>}<Badge tone={TONE_OF[siteHealthAll()[l.id].tone]} dot={siteHealthAll()[l.id].tone === "bad"}>{SITE_TONE_LABEL[siteHealthAll()[l.id].tone]}</Badge></Row>}
          sub={l.town + ", Co. " + l.county + " · Manager " + (staffById(l.managerId)?.name || "") + " · " + l.services.map(x => SERVICE[x]).join(", ")}
          right={<>{picker}<Btn size="sm" onClick={() => openRecord({ kind: "location", id: l.id })}>Site record</Btn><Btn size="sm" variant="subtle" onClick={() => setTab("Locations", "Map")}>On the map</Btn></>} />
        <SiteOverview l={l} />
      </Page>
    );
  }
}

/* =============================== Overview =============================== */
function SiteOverview({ l }: { l: Location }) {
  const { s } = useRos();
  const day = siteDayAll()[l.id], hl = siteHealthAll()[l.id];
  const occ = occupancy(l.id);
  const away = absentStaff(TODAY);
  const shifts = s.shifts.filter(x => x.locationId === l.id && x.date === TODAY).sort((a, b) => a.start.localeCompare(b.start));
  const onDuty = new Set(shifts.filter(x => !away.has(x.staffId)).map(x => x.staffId)).size;
  const rooms = s.rooms.filter(r => r.locationId === l.id);
  return (
    <>
      <Grid min={140} gap={10}>
        <Kpi label="Children enrolled" value={day.enrolled} sub={rooms.length + " room" + (rooms.length > 1 ? "s" : "")} onClick={goTo("Children", "Directory", { locationId: l.id })} />
        <Kpi label="Booked today" value={day.booked} sub={day.sessions + " sessions"} onClick={() => setTab("Locations", "Attendance Status")} />
        <Kpi label="Signed in now" value={day.counts.in} tone={day.counts.in ? "ok" : undefined} sub={"At " + hm(s.clockMin)} onClick={() => setTab("Locations", "Attendance Status")} />
        <Kpi label="Due, not signed in" value={day.counts.due} tone={day.counts.due ? "warn" : "ok"} sub="Session started, no record" onClick={() => setTab("Locations", "Attendance Status")} />
        <Kpi label="Expected later" value={day.counts.later} sub="Session not started yet" />
        <Kpi label="Staff on duty" value={onDuty} sub={shifts.filter(x => away.has(x.staffId)).length ? shifts.filter(x => away.has(x.staffId)).length + " absent" : "No absences"} onClick={goTo("Staff", "Rota")} />
        <Kpi label="Occupancy today" value={pct(occ.rate)} sub={occ.booked + " of " + occ.cap + " places"} onClick={() => setTab("Locations", "Capacity & Performance")} />
        <Kpi label="Open alerts" value={hl.reasons.length} tone={TONE_OF[hl.tone]} sub={SITE_TONE_LABEL[hl.tone]} />
      </Grid>

      <div style={{ marginTop: 16 }}><SiteAlerts l={l} /></div>

      <div className="ros-split" style={{ marginTop: 16 }}>
        <Stack gap={16}>
          <SessionsToday l={l} />
          <StaffVsRequired l={l} />
          <Card title="Rooms and groups" sub="Today's bookings against room capacity. Ratios are demo configuration.">
            <Stack gap={14}>
              {rooms.map(rm => {
                const sess: Session = rm.kind === "SAC" ? "After School" : "Full Day";
                const r = ratioCheck(l.id, TODAY, sess, rm.kind === "SAC" ? undefined : rm.id);
                return <div key={rm.id}><Meter label={<>{rm.name} <Sub>· {rm.kind} · {rm.ageBand} · 1:{rm.ratio}</Sub></>} value={r.booked} max={rm.capacity} hint={r.rostered + "/" + r.required + " staff"} /></div>;
              })}
            </Stack>
          </Card>
        </Stack>
        <Stack gap={16}>
          <Card title="Staff on duty today" sub={plural(new Set(shifts.map(x => x.staffId)).size, "person", "people") + " rostered · " + onDuty + " in"} right={goTo("Staff", "Rota") ? <Btn size="sm" onClick={goTo("Staff", "Rota")}>Rota</Btn> : undefined}>
            {shifts.map(x => { const st = staffById(x.staffId)!; const off = away.has(x.staffId); return (
              <ListRow key={x.id} onClick={() => openRecord({ kind: "staff", id: st.id })} lead={<Avatar name={st.name} size={26} />} title={st.name}
                sub={st.role + " · " + x.session + " " + x.start + "–" + x.end + (x.roomId ? " · " + (idx().room.get(x.roomId)?.name || "") : "")}
                right={off ? <Badge tone="bad">Absent</Badge> : x.relief ? <Badge tone="info">Relief</Badge> : certStatus(st).gardaExpired ? <Badge tone="bad">Blocked</Badge> : <Badge tone="ok">On shift</Badge>} />
            ); })}
            {!shifts.length && <Empty title="No shifts today" />}
          </Card>
          <Pickups l={l} />
          <LocalFinance l={l} />
          <Safeguarding l={l} />
        </Stack>
      </div>
    </>
  );
}

function SiteAlerts({ l }: { l: Location }) {
  const { s, role } = useRos();
  const hl = siteHealthAll()[l.id];
  const issues = s.issues.filter(i => i.locationId === l.id && i.status === "Open");
  const canAct = role.id === "owner" || role.id === "ops" || role.id === "locmgr";
  const other = hl.reasons.filter(r => !(r.ref && r.ref.kind === "issue" && issues.some(i => i.id === r.ref!.id)));
  if (!issues.length && !other.length) return <Callout tone="ok" title="No open alerts">Ratios are covered today and tomorrow, and nothing is waiting on safeguarding, NCS deadlines or old debt at {l.short}.</Callout>;
  return (
    <Card title="Alerts" sub="Live from ratio forecasts, transport, incidents, NCS deadlines, debt and certificates." tone={hl.tone === "bad" ? "bad" : undefined}>
      <Stack gap={10}>
        {issues.map(iss => {
          if (iss.kind === "Missing child") return (
            <Callout key={iss.id} tone="bad" title={iss.title} right={<Btn size="sm" variant="danger" onClick={() => openRecord({ kind: "issue", id: iss.id })}>Open alert</Btn>}>{iss.detail}</Callout>
          );
          const r = ratioCheck(iss.locationId, iss.date, iss.session as Session);
          const apr = s.approvals.find(a => a.link?.kind === "issue" && a.link.id === iss.id && a.status === "Pending");
          return (
            <div key={iss.id} style={{ padding: 14, borderRadius: "var(--r-md,14px)", background: r.ok ? "var(--ok-soft)" : "var(--bad-soft)" }}>
              <Row wrap gap={8}><Badge tone={r.ok ? "ok" : "bad"} dot={!r.ok}>{r.ok ? "Covered" : fmtDay(iss.date) + " · " + iss.session}</Badge><RecLink r={{ kind: "issue", id: iss.id }} />{apr && <RecLink r={{ kind: "approval", id: apr.id }} />}</Row>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>{iss.title}</div>
              <div style={{ fontSize: 12.5, color: "var(--body)", marginTop: 4, lineHeight: 1.55 }}>{r.booked} booked · {r.rostered} rostered · {r.required} required at the demo 1:{r.ratio} ratio (illustrative, not a regulatory determination).</div>
              {!r.ok && (
                <Row wrap gap={8} style={{ marginTop: 10 }}>
                  {(iss.offerStaffIds || []).map(sid => { const st = staffById(sid)!; return canAct
                    ? <Btn key={sid} size="sm" variant="primary" onClick={() => confirmThen({ title: "Approve " + st.name + " for " + l.short + "?", body: "Adds a qualified relief shift to " + l.short + " " + iss.session + " on " + fmtDay(iss.date) + ". The ratio forecast, site status, approvals and Activity update together.", confirmLabel: "Approve relief", run: () => (apr && apr.status === "Pending" && (iss.offerStaffIds || [])[0] === sid ? decideApproval({ id: apr.id, decision: "Approved" }) : approveRelief({ issueId: iss.id, staffId: sid })) })}>Approve {st.name}</Btn>
                    : <Badge key={sid}>{st.name} proposed · ops approval</Badge>; })}
                  <Btn size="sm" onClick={() => openRecord({ kind: "issue", id: iss.id })}>Rota detail</Btn>
                </Row>
              )}
            </div>
          );
        })}
        {other.map((r, i) => (
          <ListRow key={i} tone={r.tone} onClick={r.ref ? () => openRecord(r.ref!) : undefined} title={r.text} right={r.ref ? <Btn size="sm" onClick={() => openRecord(r.ref!)}>Open</Btn> : undefined} />
        ))}
      </Stack>
    </Card>
  );
}

function SessionsToday({ l }: { l: Location }) {
  const { s } = useRos();
  const sessions: Session[] = ["Morning", "Full Day", "After School"];
  const rows = sessions.map(se => {
    const reg = register(l.id, TODAY, se);
    const c: Record<DayState, number> = { in: 0, out: 0, bus: 0, absent: 0, due: 0, later: 0 };
    for (const x of reg) c[bookingState(x.booking, s.clockMin)]++;
    const starts = Array.from(new Set(reg.map(x => x.booking.start))).sort();
    const ends = reg.map(x => x.booking.end).sort();
    return { se, n: reg.length, c, span: reg.length ? starts.join(" / ") + " to " + ends[ends.length - 1] : "" };
  }).filter(r => r.n);
  const order: DayState[] = ["in", "out", "bus", "due", "later", "absent"];
  return (
    <Card title="Booked vs present today" sub="Each booking against the kiosk, room register and bus log." right={<Btn size="sm" onClick={() => setTab("Locations", "Attendance Status")}>Registers</Btn>}>
      <Stack gap={16}>
        {rows.map(r => (
          <div key={r.se}>
            <Row gap={8} style={{ marginBottom: 6 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{r.se}</span><Sub>{r.span} · {r.n} booked</Sub></Row>
            <StackBar parts={order.filter(k => r.c[k]).map(k => ({ label: DAY_STATE_LABEL[k] + " " + r.c[k], value: r.c[k], tone: DAY_STATE_TONE[k] }))} />
          </div>
        ))}
        {!rows.length && <Empty title="No bookings today" />}
      </Stack>
    </Card>
  );
}

function StaffVsRequired({ l }: { l: Location }) {
  const { s } = useRos();
  type R = { key: string; label: string; date: string; session: Session; roomId?: string };
  const lines: R[] = [];
  if (bookingsOn(TODAY, l.id, "Morning").length) lines.push({ key: "am", label: "Morning club", date: TODAY, session: "Morning" });
  for (const rm of s.rooms.filter(r => r.locationId === l.id && r.kind !== "SAC")) lines.push({ key: rm.id, label: rm.name + " · " + rm.kind, date: TODAY, session: "Full Day", roomId: rm.id });
  lines.push({ key: "as", label: "After School", date: TODAY, session: "After School" });
  lines.push({ key: "as2", label: "After School · " + fmtDay(TOMORROW), date: TOMORROW, session: "After School" });
  const rows = lines.map(x => ({ ...x, r: ratioCheck(l.id, x.date, x.session, x.roomId), issue: s.issues.find(i => i.locationId === l.id && i.date === x.date && i.session === x.session && i.kind === "Ratio") }));
  const cols: Col<typeof rows[number]>[] = [
    { key: "s", label: "Session", w: "1.6fr", render: x => <Stack><span>{x.label}</span><Sub>{x.date === TODAY ? "Today" : fmtDay(x.date)}</Sub></Stack> },
    { key: "b", label: "Booked", w: ".7fr", align: "right", render: x => x.r.booked },
    { key: "q", label: "Ratio", w: ".7fr", align: "right", render: x => "1:" + x.r.ratio },
    { key: "n", label: "Required", w: ".8fr", align: "right", render: x => x.r.required },
    { key: "a", label: "Assigned", w: ".8fr", align: "right", render: x => <span style={{ color: x.r.ok ? undefined : "var(--bad)", fontWeight: x.r.ok ? 400 : 600 }}>{x.r.rostered}</span> },
    { key: "st", label: "Status", w: "1fr", render: x => x.r.ok ? <Badge tone="ok">Covered</Badge> : <Badge tone="bad" dot>{x.r.gap} short</Badge> },
  ];
  return (
    <Card pad={false} title="Staff required vs assigned" sub="From bookings, the rota and today's absences, at the demo ratios. Select a short session to open the cover options.">
      <Table dense rows={rows} cols={cols} rowKey={x => x.key} onRow={x => (x.issue ? openRecord({ kind: "issue", id: x.issue.id }) : undefined)} rowTone={x => (x.r.ok ? undefined : "bad")} minWidth={520} />
    </Card>
  );
}

function Pickups({ l }: { l: Location }) {
  const { s } = useRos();
  const routes = s.routes.filter(r => r.locationId === l.id);
  const schools = s.schools.filter(x => x.locationId === l.id && x.name !== "Hazelbrook");
  const asToday = bookingsOn(TODAY, l.id, "After School");
  const run = siteNextRun(l.id);
  return (
    <Card title="School pickups today" sub={run.text} right={goTo("Transport", "Daily Manifests") ? <Btn size="sm" onClick={goTo("Transport", "Daily Manifests")}>Manifests</Btn> : undefined}>
      {routes.map(rt => {
        const m = manifest(rt.id, TODAY);
        const v = s.vehicles.find(x => x.id === rt.vehicleId);
        return (
          <div key={rt.id} style={{ marginBottom: 12 }}>
            <Row wrap gap={6} style={{ marginBottom: 6 }}><RecLink r={{ kind: "route", id: rt.id }} /><Sub>{rt.name} · {v?.kind} · driver {staffById(rt.driverId)?.name}{rt.escortId ? " · escort " + staffById(rt.escortId)?.name : ""}</Sub></Row>
            {rt.stops.map(st => {
              const n = m.filter(x => x.booking.schoolId === st.schoolId).length;
              const passed = toMin(st.time) <= s.clockMin;
              return <ListRow key={st.schoolId} onClick={() => openRecord({ kind: "school", id: st.schoolId })} lead={<span style={{ width: 44, fontVariantNumeric: "tabular-nums", fontSize: 12.5, color: passed ? "var(--faint)" : "var(--ink)" }}>{st.time}</span>}
                title={s.schools.find(x => x.id === st.schoolId)?.name} sub={plural(n, "child", "children") + " on the manifest"} right={<Badge tone={passed ? "neutral" : "accent"}>{passed ? "Passed" : "Upcoming"}</Badge>} />;
            })}
          </div>
        );
      })}
      <Label style={{ margin: "6px 0 8px" }}>Collection points</Label>
      {schools.map(sc => {
        const rt = routes.find(r => r.stops.some(x => x.schoolId === sc.id));
        const n = asToday.filter(b => b.schoolId === sc.id).length;
        return <ListRow key={sc.id} onClick={() => openRecord({ kind: "school", id: sc.id })} title={sc.name} sub={rt ? rt.id + " at " + rt.stops.find(x => x.schoolId === sc.id)!.time : "Escort walk or parent drop-off"} right={<Sub>{n} booked today</Sub>} />;
      })}
      {!schools.length && <Sub>No school collection points.</Sub>}
    </Card>
  );
}

function LocalFinance({ l }: { l: Location }) {
  const { s, role } = useRos();
  if (!role.finance) return <Card title="Local finance this week"><Callout tone="neutral" title="Restricted">Site revenue and balances are visible to finance roles only (owner, operations, accounts, NCS).</Callout></Card>;
  const inv = s.invoices.filter(i => i.weekOf === "2026-10-19" && family(i.familyId)?.locationId === l.id);
  const invoiced = inv.reduce((n, i) => n + Math.max(0, invoiceTotal(i)), 0);
  const collected = inv.reduce((n, i) => n + Math.min(invoicePaid(i), Math.max(0, invoiceTotal(i))), 0);
  const dd = inv.filter(i => invoiceStatus(i) === "Scheduled DD").reduce((n, i) => n + invoiceBalance(i), 0);
  const od = s.invoices.filter(i => { const st = invoiceStatus(i); return (st === "Overdue" || st === "Debt review") && family(i.familyId)?.locationId === l.id; });
  const odBal = od.reduce((n, i) => n + invoiceBalance(i), 0);
  const rev = revenueByLocation().get(l.id);
  const drill = () => { if (role.scope === "ALL") setUi({ loc: l.id }); nav("Billing", "Invoices"); };
  return (
    <Card title="Local finance this week" sub="w/c 19 Oct invoices for families at this site. Payments are simulated." right={<Btn size="sm" onClick={drill}>Billing</Btn>}>
      <KV cols={2} items={[["Invoiced", euro0(invoiced)], ["Collected", euro0(collected)], ["Direct debit scheduled", euro0(dd)], ["Gross revenue (pre-subsidy)", euro0(rev?.revenue || 0)], ["Overdue", od.length + " · " + euro0(odBal)], ["Collected on due invoices (Oct)", pct(collectionRate(l.id), 1)]]} />
      {od.length > 0 && <div style={{ marginTop: 10 }}>{od.slice(0, 3).map(i => <ListRow key={i.id} onClick={() => openRecord({ kind: "invoice", id: i.id })} title={<Row gap={6}><RecLink r={{ kind: "invoice", id: i.id }} />{family(i.familyId)?.surname}</Row>} sub={plural(daysBetween(i.due, TODAY), "day") + " overdue"} right={<span style={{ fontVariantNumeric: "tabular-nums" }}>{euro(invoiceBalance(i))}</span>} />)}</div>}
    </Card>
  );
}

function Safeguarding({ l }: { l: Location }) {
  const { s, role } = useRos();
  const tasks = s.tasks.filter(t => t.status !== "Done" && t.locationId === l.id);
  const inc = s.incidents.filter(i => i.locationId === l.id && i.status !== "Closed");
  const checks = s.checks.filter(c => c.locationId === l.id && !c.done);
  const meds = s.children.filter(c => c.locationId === l.id && c.medication && c.medication.expires <= "2026-11-03");
  return (
    <Card title="Safeguarding, checks and tasks" sub="Open items for this site. Detail follows role access.">
      {inc.map(i => role.safeguarding
        ? <ListRow key={i.id} tone="warn" onClick={() => openRecord({ kind: "incident", id: i.id })} title={<Row gap={6}><RecLink r={{ kind: "incident", id: i.id }} />{i.kind}</Row>} sub={fmtDay(i.date) + " " + i.time + " · " + i.status} right={<StatusBadge s={i.status} />} />
        : <ListRow key={i.id} title={"Incident " + i.id + " · " + i.status.toLowerCase()} sub="Detail visible to safeguarding roles only" right={<Badge>Restricted</Badge>} />)}
      {meds.map(c => <ListRow key={c.id} tone="warn" onClick={role.medical ? () => openRecord({ kind: "child", id: c.id }) : undefined} title={role.medical ? "Medication expires " + fmtDate(c.medication!.expires) + ": " + childName(c) : "Medication review due (1 child)"} sub={role.medical ? c.medication!.name : "Medical detail restricted"} />)}
      {checks.map(c => <ListRow key={c.id} onClick={goTo("Compliance", "Site Logs")} title={c.kind} sub={"Due " + fmtDay(c.due) + " · not signed off"} right={<Badge tone={c.due <= TODAY ? "warn" : "neutral"}>{c.due <= TODAY ? "Due" : "This week"}</Badge>} />)}
      {tasks.map(t => <TaskRow key={t.id} id={t.id} />)}
      {!inc.length && !meds.length && !checks.length && !tasks.length && <Empty title="Nothing open" body="No incidents, checks or tasks waiting at this site." />}
    </Card>
  );
}

/* ============================ Site Directory ============================ */
function Directory() {
  const { s } = useRos();
  const [q, setQ] = useState("");
  const t = q.trim().toLowerCase();
  const list = s.locations.filter(l => !t || (l.name + " " + l.town + " " + l.county + " " + s.schools.filter(x => x.locationId === l.id).map(x => x.name).join(" ")).toLowerCase().includes(t));
  return (
    <>
      <Row wrap gap={10} style={{ marginBottom: 14 }}>
        <Search value={q} onChange={setQ} placeholder="Site, town or school" width={280} />
        <Sub>{list.length} of {s.locations.length} sites</Sub>
      </Row>
      <Grid min={290} gap={12}>
        {list.map(l => {
          const mgr = staffById(l.managerId);
          const rooms = s.rooms.filter(r => r.locationId === l.id);
          const ey = rooms.filter(r => r.kind !== "SAC").reduce((n, r) => n + r.capacity, 0);
          const schools = s.schools.filter(x => x.locationId === l.id && x.name !== "Hazelbrook");
          const routes = s.routes.filter(r => r.locationId === l.id);
          const hl = siteHealthAll()[l.id];
          const open = inScope(l.id);
          return (
            <Card key={l.id} title={<Row gap={6}>{l.name}{l.isHQ && <Badge tone="brand">HQ</Badge>}</Row>} sub={l.town + ", Co. " + l.county + (l.eircode && l.isHQ ? " · " + l.eircode : "") + " · " + l.region + " region"} right={<Badge tone={TONE_OF[hl.tone]}>{SITE_TONE_LABEL[hl.tone]}</Badge>}>
              <Row wrap gap={6}>{l.services.map(x => <Badge key={x} tone="info">{SERVICE[x]}</Badge>)}</Row>
              <div style={{ marginTop: 12 }}>
                <KV cols={2} items={[
                  ["Manager", mgr ? <RecLink r={{ kind: "staff", id: mgr.id }} mono={false}>{mgr.name}</RecLink> : "Vacant"],
                  ["Places", l.sacCapacity + " school age" + (ey ? " · " + ey + " early years" : "")],
                  ["Rooms", rooms.map(r => r.name.replace(" (" + l.short + ")", "")).join(", ")],
                  ["Collection", plural(schools.length, "school") + (routes.length ? " · " + routes.map(r => r.id).join(", ") : " · walking")],
                  ["Contact", l.isHQ ? "Admin hours Mon–Fri 08:30–16:00" : "Through HQ admin at Hazelbrook"],
                  ["Children enrolled", String(siteDayAll()[l.id].enrolled)],
                ]} />
              </div>
              <Row wrap gap={6} style={{ marginTop: 12 }}>
                <Btn size="sm" variant="primary" disabled={!open} title={open ? undefined : "Outside this role's scope"} onClick={() => { setFocus({ locationId: l.id }); setTab("Locations", "Overview"); }}>Open dashboard</Btn>
                <Btn size="sm" onClick={() => openRecord({ kind: "location", id: l.id })}>Site record</Btn>
              </Row>
            </Card>
          );
        })}
      </Grid>
      {!list.length && <Card><Empty title="No site matches" body="Try a town such as Arklow, or a school name." /></Card>}
    </>
  );
}

/* ============================ Rooms & Groups ============================ */
type RoomRow = { rm: Room; l: Location; booked: number; required: number; rostered: number; ok: boolean; session: Session };
function Rooms() {
  const { s } = useRos();
  const [kind, setKind] = useState<"All" | "Early Years" | "School Age">("All");
  const rows: RoomRow[] = s.rooms.filter(r => inScope(r.locationId) && (kind === "All" || (kind === "School Age" ? r.kind === "SAC" : r.kind !== "SAC"))).map(rm => {
    const session: Session = rm.kind === "SAC" ? "After School" : "Full Day";
    const r = ratioCheck(rm.locationId, TODAY, session, rm.kind === "SAC" ? undefined : rm.id);
    return { rm, l: locById(rm.locationId)!, booked: r.booked, required: r.required, rostered: r.rostered, ok: r.ok, session };
  });
  const ey = rows.filter(r => r.rm.kind !== "SAC");
  const cols: Col<RoomRow>[] = [
    { key: "n", label: "Room", w: "1.5fr", render: r => <Stack><span style={{ fontWeight: 500 }}>{r.rm.name}</span><Sub>{r.rm.kind}</Sub></Stack>, sort: r => r.rm.name },
    { key: "l", label: "Site", w: "1fr", render: r => r.l.short, sort: r => r.l.short },
    { key: "a", label: "Ages", w: ".9fr", render: r => r.rm.ageBand },
    { key: "c", label: "Capacity", w: ".7fr", align: "right", render: r => r.rm.capacity, sort: r => r.rm.capacity },
    { key: "q", label: "Ratio (demo)", w: ".8fr", align: "right", render: r => "1:" + r.rm.ratio },
    { key: "b", label: "Booked today", w: "1.4fr", render: r => <div style={{ width: "100%" }}><Meter label={r.session} value={r.booked} max={r.rm.capacity} /></div>, sort: r => r.booked / r.rm.capacity },
    { key: "s", label: "Staff", w: ".8fr", align: "right", render: r => <span style={{ color: r.ok ? undefined : "var(--bad)" }}>{r.rostered}/{r.required}</span>, sort: r => r.rostered - r.required },
    { key: "o", label: "Status", w: ".9fr", render: r => r.ok ? <Badge tone="ok">Covered</Badge> : <Badge tone="bad" dot>Short</Badge>, sort: r => (r.ok ? 0 : 1) },
  ];
  return (
    <>
      <Row wrap gap={10} style={{ marginBottom: 14 }}>
        <Seg size="sm" value={kind} onChange={setKind} options={["All", "Early Years", "School Age"] as ("All" | "Early Years" | "School Age")[]} />
        <Sub>{rows.length} rooms · {rows.reduce((n, r) => n + r.rm.capacity, 0)} places · {rows.reduce((n, r) => n + r.booked, 0)} booked today</Sub>
      </Row>
      <Grid min={150} gap={10} style={{ marginBottom: 14 }}>
        <Kpi label="Rooms" value={rows.length} sub={ey.length + " early years · " + (rows.length - ey.length) + " school age"} />
        <Kpi label="Booked today" value={rows.reduce((n, r) => n + r.booked, 0)} sub={pct(rows.reduce((n, r) => n + r.booked, 0) / Math.max(1, rows.reduce((n, r) => n + r.rm.capacity, 0))) + " of places"} />
        <Kpi label="Staff required" value={rows.reduce((n, r) => n + r.required, 0)} sub={rows.reduce((n, r) => n + r.rostered, 0) + " assigned"} />
        <Kpi label="Rooms short" value={rows.filter(r => !r.ok).length} tone={rows.some(r => !r.ok) ? "bad" : "ok"} sub="Below the demo ratio today" onClick={goTo("Bookings", "Ratios")} />
      </Grid>
      <Card pad={false} title="All rooms" sub="School-age rooms use the After School session; early years rooms use full-day bookings. Ratios are illustrative demo configuration, not regulatory determinations. Select a room to open its site.">
        <Table rows={rows} cols={cols} rowKey={r => r.rm.id} onRow={r => { setFocus({ locationId: r.l.id }); setTab("Locations", "Overview"); }} rowTone={r => (r.ok ? undefined : "bad")} minWidth={860} />
      </Card>
      {ey.length > 0 && (
        <Card title="Early years rooms" sub="Booked today against capacity. Select a room for the Early Years module." style={{ marginTop: 16 }}>
          <HBars format={n => pct(n)} max={1} items={ey.map(r => ({ label: r.rm.name + " · " + r.l.short, value: r.booked / r.rm.capacity, sub: r.booked + "/" + r.rm.capacity, tone: (r.ok ? "accent" : "bad") as Tone, onClick: goTo("EarlyYears", "Rooms", { locationId: r.l.id, roomId: r.rm.id }) || (() => { setFocus({ locationId: r.l.id }); setTab("Locations", "Overview"); }) }))} />
        </Card>
      )}
    </>
  );
}

/* =========================== Attendance Status =========================== */
function Attendance({ initial }: { initial: LocationId }) {
  const { s } = useRos();
  const [site, setSite] = useState<LocationId>(initial);
  const [sess, setSess] = useState<"All" | Session>("All");
  const [state, setState] = useState<"All" | DayState>("All");
  const sites = scopedLocations();
  const day = siteDayAll();
  const cur = inScope(site) ? site : (sites[0]?.id as LocationId);
  const tot = (k: DayState) => sites.reduce((n, l) => n + day[l.id].counts[k], 0);
  const booked = sites.reduce((n, l) => n + day[l.id].booked, 0);
  const pm = s.clockMin >= PM_MIN;
  type SRow = { l: Location; d: typeof day[string] };
  const order: DayState[] = ["in", "due", "later", "bus", "out", "absent"];
  const cols: Col<SRow>[] = [
    { key: "l", label: "Site", w: "1.3fr", render: r => <Row gap={6}><span style={{ fontWeight: r.l.id === cur ? 600 : 400 }}>{r.l.short}</span>{r.l.id === cur && <Badge tone="accent">Selected</Badge>}</Row>, sort: r => r.l.short },
    { key: "b", label: "Booked", w: ".7fr", align: "right", render: r => r.d.booked, sort: r => r.d.booked },
    ...order.map(k => ({ key: k, label: DAY_STATE_LABEL[k], w: ".9fr", align: "right" as const, render: (r: SRow) => r.d.counts[k] ? <span style={{ color: k === "due" || k === "absent" ? toneInk[DAY_STATE_TONE[k]] : undefined, fontWeight: k === "due" ? 600 : 400 }}>{r.d.counts[k]}</span> : <Sub>0</Sub>, sort: (r: SRow) => r.d.counts[k] })),
  ];
  const reg = register(cur, TODAY).filter(x => sess === "All" || x.booking.session === sess).map(x => ({ ...x, st: bookingState(x.booking, s.clockMin) })).filter(x => state === "All" || x.st === state);
  return (
    <>
      {!pm && <div style={{ marginBottom: 14 }}><Callout tone="info" title={"Demo clock " + hm(s.clockMin)} right={<Btn size="sm" onClick={() => confirmThen({ title: "Advance the demo to 14:45?", body: "Moves the demo clock to the afternoon so After School arrivals fall due and the school runs can be worked. Demo time only.", confirmLabel: "Advance to 14:45", run: () => advanceAfternoon() })}>Advance to 14:45</Btn>}>Morning club children have walked to school and early years rooms are filling. After School children become due from 14:00.</Callout></div>}
      <Grid min={140} gap={10}>
        <Kpi label="Booked today" value={booked} sub={plural(sites.length, "site")} onClick={() => setState("All")} />
        {order.map(k => <Kpi key={k} label={DAY_STATE_LABEL[k]} value={tot(k)} tone={k === "due" && tot(k) ? "warn" : k === "absent" && tot(k) ? "bad" : k === "in" ? "ok" : undefined} onClick={() => setState(state === k ? "All" : k)} />)}
      </Grid>
      <Card pad={false} title="By site" sub="Select a site to see its register below." style={{ marginTop: 16 }}>
        <Table rows={sites.map(l => ({ l, d: day[l.id] }))} cols={cols} rowKey={r => r.l.id} onRow={r => setSite(r.l.id)} rowTone={r => (r.d.counts.due ? "warn" : undefined)} minWidth={820} />
      </Card>
      <Card pad={false} style={{ marginTop: 16 }} title={"Register · " + (locById(cur)?.name || "")} sub={reg.length + " bookings shown · " + longDate(TODAY)}
        >
        <Row wrap gap={6} style={{ padding: "0 16px 10px" }}><Seg size="sm" value={sess} onChange={setSess} options={["All", "Morning", "Full Day", "After School"] as ("All" | Session)[]} />{state !== "All" && <Btn size="sm" variant="subtle" onClick={() => setState("All")}>Clear: {DAY_STATE_LABEL[state]}</Btn>}</Row>
        <Table dense pageSize={20} rows={reg} rowKey={x => x.booking.id} onRow={x => openRecord({ kind: "child", id: x.child.id })} minWidth={720}
          cols={[
            { key: "c", label: "Child", w: "1.4fr", render: x => <Row gap={8}><Avatar name={childName(x.child)} size={24} /><RecLink r={{ kind: "child", id: x.child.id }} mono={false}>{childName(x.child)}</RecLink></Row>, sort: x => x.child.firstName },
            { key: "s", label: "Session", w: "1.1fr", render: x => <Stack><span>{x.booking.session}</span><Sub>{x.booking.start}–{x.booking.end}</Sub></Stack>, sort: x => x.booking.start },
            { key: "w", label: "Room or school", w: "1.4fr", render: x => <Sub>{x.child.programme === "EY" ? idx().room.get(x.child.roomId)?.name : s.schools.find(sc => sc.id === x.booking.schoolId)?.name || "School"}{x.booking.routeId ? " · " + x.booking.routeId : ""}</Sub> },
            { key: "t", label: "Status", w: "1.2fr", render: x => <Badge tone={DAY_STATE_TONE[x.st]}>{DAY_STATE_LABEL[x.st]}</Badge>, sort: x => order.indexOf(x.st) },
            { key: "r", label: "Last record", w: "1.3fr", render: x => x.time ? <Sub>{x.time} · {x.by}{x.collector ? " · " + x.collector : ""}</Sub> : <Sub>None yet</Sub> },
          ]} />
      </Card>
    </>
  );
}

/* ========================= Capacity & Performance ========================= */
function Capacity({ initial }: { initial?: LocationId }) {
  const { s } = useRos();
  const sites = scopedLocations();
  const [pick, setPick] = useState<LocationId | "ALL">(initial && inScope(initial) ? initial : sites.length === 1 ? sites[0].id : "ALL");
  const chosen = pick === "ALL" ? sites : sites.filter(l => l.id === pick);
  const byDay = THIS_WEEK.map(d => {
    const o = chosen.map(l => occupancy(l.id, d)).reduce((a, x) => ({ b: a.b + x.booked, c: a.c + x.cap }), { b: 0, c: 0 });
    return { d, rate: o.c ? o.b / o.c : 0, b: o.b, c: o.c };
  });
  const pressure = sites.map(l => {
    const o = occupancy(l.id);
    const free = Math.max(0, o.cap - o.booked);
    const wl = s.waitlist.filter(w => w.locationId === l.id && w.status === "Waiting").length;
    const enq = s.enquiries.filter(e => e.locationId === l.id && e.stage !== "Enrolled" && e.stage !== "Started").length;
    const peak = THIS_WEEK.map(d => occupancy(l.id, d).rate);
    return { l, cap: o.cap, booked: o.booked, free, wl, enq, week: weekOccupancy(l.id), peak: Math.max(...peak), peakDay: THIS_WEEK[peak.indexOf(Math.max(...peak))], pressure: wl / Math.max(1, free) };
  });
  type PRow = typeof pressure[number];
  const heat = (r: number): Tone => (r >= 1 ? "bad" : r >= 0.9 ? "warn" : r >= 0.7 ? "accent" : "neutral");
  return (
    <>
      <Row wrap gap={10} style={{ marginBottom: 14 }}>
        <Label>Site</Label>
        <Seg size="sm" value={pick} onChange={setPick} options={[...(sites.length > 1 ? [["ALL", "All in scope"] as [LocationId | "ALL", string]] : []), ...sites.map(l => [l.id, l.short] as [LocationId | "ALL", string])]} />
      </Row>
      <div className="ros-split-even">
        <Card title={"Occupancy by day · " + (pick === "ALL" ? "all sites in scope" : locById(pick)?.short)} sub="Booked places against capacity, Monday to Friday this week. Select a day for the weekly calendar.">
          <ClickCols format={n => pct(n)} data={byDay.map(x => ({ label: dow(x.d) + " " + fmtDate(x.d).split(" ")[0], value: x.rate, hint: fmtDay(x.d) + ": " + x.b + " of " + x.c + " places", tone: heat(x.rate) === "neutral" ? "accent" : heat(x.rate), onClick: goTo("Bookings", "Weekly Calendar", pick === "ALL" ? undefined : { locationId: pick }) }))} />
        </Card>
        <Card title="Week occupancy by site" sub="Average of Monday to Friday. Select a site to chart it.">
          <HBars format={n => pct(n)} max={1} items={pressure.slice().sort((a, b) => b.week - a.week).map(r => ({ label: r.l.short, value: r.week, tone: heat(r.week) === "neutral" ? "accent" : heat(r.week), sub: "peak " + pct(r.peak) + " " + dow(r.peakDay), onClick: () => setPick(r.l.id) }))} />
        </Card>
      </div>
      <Card pad={false} style={{ marginTop: 16 }} title="Waitlist pressure" sub="Children waiting and open enquiries against free places today. Select a site for its waitlist in Enrolment.">
        <Table rows={pressure.slice().sort((a, b) => b.pressure - a.pressure)} rowKey={r => r.l.id} onRow={r => { const go = goTo("Enrolment", "Waitlists", { locationId: r.l.id }); if (go) go(); else setPick(r.l.id); }} minWidth={760}
          cols={[
            { key: "l", label: "Site", w: "1.2fr", render: (r: PRow) => r.l.short, sort: (r: PRow) => r.l.short },
            { key: "c", label: "Places", w: ".7fr", align: "right", render: (r: PRow) => r.cap },
            { key: "f", label: "Free today", w: ".8fr", align: "right", render: (r: PRow) => r.free, sort: (r: PRow) => r.free },
            ...THIS_WEEK.map(d => ({ key: d, label: dow(d), w: ".6fr", align: "center" as const, render: (r: PRow) => { const o = occupancy(r.l.id, d); const t = heat(o.rate); return <span title={o.booked + "/" + o.cap} style={{ fontSize: 12, padding: "2px 6px", borderRadius: 6, background: t === "neutral" ? "var(--track)" : "color-mix(in srgb, " + toneInk[t] + " 22%, transparent)", color: t === "neutral" ? "var(--dim)" : toneInk[t] }}>{pct(o.rate)}</span>; } })),
            { key: "w", label: "Waitlist", w: ".7fr", align: "right", render: (r: PRow) => r.wl ? <Badge tone="warn">{r.wl}</Badge> : <Sub>0</Sub>, sort: (r: PRow) => r.wl },
            { key: "e", label: "Enquiries", w: ".7fr", align: "right", render: (r: PRow) => r.enq, sort: (r: PRow) => r.enq },
            { key: "p", label: "Pressure", w: ".8fr", align: "right", render: (r: PRow) => r.wl ? (r.free ? (r.wl / r.free).toFixed(1) + "×" : "Full") : <Sub>None</Sub>, sort: (r: PRow) => r.pressure },
          ]} />
      </Card>
      <Grid min={220} gap={10} style={{ marginTop: 16 }}>
        <Kpi label="Waiting for a place" value={pressure.reduce((n, r) => n + r.wl, 0)} sub={pressure.filter(r => r.wl).length + " sites with a list"} onClick={goTo("Enrolment", "Waitlists")} />
        <Kpi label="Open enquiries" value={pressure.reduce((n, r) => n + r.enq, 0)} sub="Not yet enrolled" onClick={goTo("Enrolment", "Lead Pipeline")} />
        <Kpi label="Full today" value={pressure.filter(r => !r.free).length} tone={pressure.some(r => !r.free) ? "warn" : "ok"} sub={pressure.filter(r => !r.free).map(r => r.l.short).join(", ") || "Space everywhere"} />
        <Kpi label="Free places today" value={pressure.reduce((n, r) => n + r.free, 0)} sub="Across sites in scope" />
      </Grid>
    </>
  );
}

/* ================================== Map ================================== */
function MapView({ siteId }: { siteId: LocationId }) {
  const { role } = useRos();
  const l = locById(siteId)!;
  const hl = siteHealthAll()[l.id], day = siteDayAll()[l.id];
  const occ = occupancy(l.id);
  const r = ratioCheck(l.id, TODAY, "After School");
  const run = siteNextRun(l.id);
  const select = (id: LocationId) => {
    if (inScope(id) || role.scope === "ALL") { if (role.scope === "ALL" && scopeLoc() !== "ALL" && scopeLoc() !== id) setUi({ loc: "ALL" }); setFocus({ locationId: id }); }
    else pushToast("This role covers " + (locById(role.scope)?.short || "") + " only.", "info");
  };
  return (
    <div className="ros-split">
      <Card title="Ireland" sub="Select a pin for that site's summary. Wicklow and north Wexford are enlarged so every site can be selected.">
        <IrelandMap height={460} selected={siteId} onSelect={select} />
      </Card>
      <Stack gap={16}>
        <Card title={<Row gap={6} wrap>{l.name}{l.isHQ && <Badge tone="brand">HQ</Badge>}</Row>} sub={l.town + ", Co. " + l.county + " · Manager " + (staffById(l.managerId)?.name || "")} right={<Badge tone={TONE_OF[hl.tone]} dot={hl.tone === "bad"}>{SITE_TONE_LABEL[hl.tone]}</Badge>}>
          <KV cols={2} items={[
            ["Children enrolled", String(day.enrolled)], ["Booked today", day.booked + " · " + day.counts.in + " signed in"],
            ["Places used", occ.booked + " of " + occ.cap + " (" + pct(occ.rate) + ")"], ["After School staff", r.booked ? r.rostered + " of " + r.required + " for " + r.booked : "No session"],
            ["Transport", run.text], ["Services", l.services.map(x => SERVICE[x]).join(", ")],
          ]} />
          <Row wrap gap={6} style={{ marginTop: 12 }}>
            <Btn size="sm" variant="primary" disabled={!inScope(l.id) && role.scope !== "ALL"} onClick={() => { setFocus({ locationId: l.id }); setTab("Locations", "Overview"); }}>Open dashboard</Btn>
            {role.scope === "ALL" && <Btn size="sm" onClick={() => setUi({ loc: l.id })}>Filter app to {l.short}</Btn>}
            <Btn size="sm" variant="subtle" onClick={() => openRecord({ kind: "location", id: l.id })}>Site record</Btn>
          </Row>
        </Card>
        <Card title="Why this colour" sub={hl.reasons.length ? plural(hl.reasons.length, "open item") : "Nothing open"}>
          {hl.reasons.map((x, i) => <ListRow key={i} tone={x.tone} onClick={x.ref ? () => openRecord(x.ref!) : undefined} title={x.text} />)}
          {!hl.reasons.length && <Callout tone="ok" title="Clear">Ratios covered today and tomorrow; no incidents, near NCS deadlines, old debt or compliance items.</Callout>}
        </Card>
      </Stack>
    </div>
  );
}
