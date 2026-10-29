/* Transport & School Runs. Manifests are built from accepted After School
   bookings, so approving a late booking adds the child here, and every
   boarding, missing-child report and base sign-in is an attendance event the
   location and the parent app read too. A missing child is never resolved
   automatically: a person has to confirm where the child is. */
import { useState } from "react";
import type { Route, RosState, AttendanceEvent } from "../types";
import { useRos, nav, openRecord, confirmThen, defineAction, getState } from "../store";
import { idx, cached, inScope, manifest, childStatus, locById, staffById, schoolName, childName, certStatus, pendingRequests } from "../selectors";
import { board, markNotPresent, signIn, advanceAfternoon, addTask } from "../actions";
import { TODAY, THIS_WEEK, fmtDay, fmtDate, hm, toMin, rel, euro, PM_MIN } from "../time";
import {
  Page, PageHead, Card, Kpi, Grid, Table, Badge, StatusBadge, Btn, RecLink, HBars, Meter, KV, Callout, Seg, Search, ListRow,
  DemoTag, Empty, Avatar, Row, Stack, Sub, Label, Timeline, type Col,
} from "../ui";

/* ---------------- shared helpers (Bookings reads baseArrivalMin) ---------------- */
/** When a run reaches its base. Hazelbrook (WKR-02) arrives at 15:04; other bases 15 minutes after the last stop. */
export function baseArrivalMin(routeId: string, clockMin: number) {
  const rt = idx().route.get(routeId);
  if (!rt) return clockMin;
  const base = rt.locationId === "HAZ" ? toMin("15:04") : toMin(rt.stops[rt.stops.length - 1].time) + 15;
  return Math.max(clockMin, base);
}
/** Child seats: vehicle seats less the driver and escort/adult seat (demo configuration). */
const childSeats = (s: RosState, rt: Route) => (s.vehicles.find(v => v.id === rt.vehicleId)?.seats || 0) - 2;
/** Afternoon events only, so a morning-club sign-in is never mistaken for a bus arrival. */
function runEvents(childId: string, date: string, routeId: string) {
  const ev = idx().attendanceByChildDate.get(childId + "|" + date) || [];
  const pm = ev.filter(e => e.routeId === routeId || toMin(e.time) >= 13 * 60);
  const find = (k: AttendanceEvent["kind"]) => pm.find(e => e.kind === k);
  return { boarded: find("boarded"), arrived: find("in"), missing: find("not-present"), absent: ev.find(e => e.kind === "absent") };
}
function riders(routeId: string, date: string) {
  return manifest(routeId, date).map(x => ({ ...x, ev: runEvents(x.child.id, date, routeId) }));
}
type Rider = ReturnType<typeof riders>[number];
function riderStatus(x: Rider, date: string): { label: string; tone: "ok" | "bad" | "info" | "neutral" | "warn" } {
  if (x.ev.missing) return { label: "Not present " + x.ev.missing.time, tone: "bad" };
  if (x.ev.arrived) return { label: "Signed in " + x.ev.arrived.time, tone: "ok" };
  if (x.ev.boarded) return { label: "On bus · boarded " + x.ev.boarded.time, tone: "info" };
  if (x.ev.absent) return { label: "Absent", tone: "neutral" };
  if (date < TODAY) return { label: "Completed", tone: "neutral" };
  return { label: date === TODAY ? "Expected" : "Booked", tone: "neutral" };
}
function runInfo(s: RosState, routeId: string) {
  const acts = s.activity.filter(a => a.link?.kind === "route" && a.link.id === routeId && a.at.startsWith(TODAY));
  const cleared = new Set(acts.filter(a => a.title.startsWith("Delay cleared: ")).map(a => (a.title.match(/\((EV\d+)\)$/) || [])[1]));
  return {
    started: acts.some(a => a.title === "Run started: " + routeId),
    arrived: acts.find(a => a.title.startsWith("Arrived at base: " + routeId)),
    delays: acts.filter(a => a.title.startsWith("Delay reported: " + routeId)).map(a => ({ ev: a, open: !cleared.has(a.id) })),
  };
}
function routeState(s: RosState, rt: Route) {
  const m = riders(rt.id, TODAY), info = runInfo(s, rt.id);
  const onBus = m.filter(x => x.ev.boarded && !x.ev.arrived && !x.ev.missing).length;
  const inBase = m.filter(x => x.ev.arrived).length, missing = m.filter(x => x.ev.missing).length, absent = m.filter(x => x.ev.absent && !x.ev.boarded).length;
  const waiting = m.length - onBus - inBase - missing - absent;
  let label = "Due to leave", tone: "ok" | "info" | "warn" | "bad" | "neutral" = "neutral";
  if (!m.length) label = "No riders today";
  else if (inBase && waiting === 0 && onBus === 0) { label = "Complete"; tone = "ok"; }
  else if (info.arrived) { label = "At base · signing in"; tone = "info"; }
  else if (info.started || onBus) { label = "On the road"; tone = "info"; }
  else if (s.clockMin < toMin(rt.stops[0].time) - 30) label = "Leaves " + hm(toMin(rt.stops[0].time) - 30);
  if (missing) tone = "bad";
  else if (info.delays.some(d => d.open)) { tone = "warn"; label += " · delayed"; }
  return { m, info, onBus, inBase, missing, absent, waiting, label, tone };
}
const scopedRoutes = (s: RosState) => s.routes.filter(r => inScope(r.locationId));
function transportLines() {
  return cached("tp:lines", () => {
    const s = getState();
    const bk = new Map(s.bookings.map(b => [b.id, b]));
    const out: { invoiceId: string; familyId: string; childId?: string; routeId: string; date?: string; amount: number; bookingId?: string; late: boolean }[] = [];
    for (const inv of s.invoices.filter(i => i.weekOf === "2026-10-19")) for (const ln of inv.lines) {
      if (ln.kind !== "Transport") continue;
      const b = ln.bookingId ? bk.get(ln.bookingId) : undefined;
      const routeId = b?.routeId || (ln.label.match(/[A-Z]{3}-\d\d/) || [""])[0];
      out.push({ invoiceId: inv.id, familyId: inv.familyId, childId: ln.childId, routeId, date: ln.date, amount: ln.amount, bookingId: ln.bookingId, late: b?.source === "Late request" });
    }
    return out;
  });
}

/* ---------------- actions ---------------- */
export const startRun = defineAction<{ routeId: string }>("transport.runStart", (s, p, ctx) => {
  const rt = s.routes.find(r => r.id === p.routeId); if (!rt) return;
  if (s.activity.some(a => a.title === "Run started: " + rt.id && a.at.startsWith(TODAY))) return;
  const drv = s.staff.find(x => x.id === rt.driverId)!, l = s.locations.find(x => x.id === rt.locationId)!;
  const n = s.bookings.filter(b => b.routeId === rt.id && b.date === TODAY && b.session === "After School" && b.status === "Booked").length;
  ctx.log({ category: "Transport", title: "Run started: " + rt.id, detail: drv.name + " left " + l.short + " for " + (s.schools.find(x => x.id === rt.stops[0].schoolId)?.name || "the first stop") + " (" + rt.stops[0].time + "). " + n + " children on the manifest.", link: { kind: "route", id: rt.id }, locationId: rt.locationId, actor: drv.name });
  ctx.agent("transport", rt.id + " run started by " + drv.name + "; live manifest tracking on", "run", { kind: "route", id: rt.id });
}, { toast: () => "Run started. The location and parent app see the live manifest." });

export const arriveBase = defineAction<{ routeId: string; time: string }>("transport.arrive", (s, p, ctx) => {
  const rt = s.routes.find(r => r.id === p.routeId); if (!rt) return;
  if (s.activity.some(a => a.title.startsWith("Arrived at base: " + rt.id) && a.at.startsWith(TODAY))) return;
  s.clockMin = Math.max(s.clockMin, toMin(p.time));
  const drv = s.staff.find(x => x.id === rt.driverId)!, l = s.locations.find(x => x.id === rt.locationId)!;
  const onBoard = s.attendance.filter(a => a.date === TODAY && a.kind === "boarded" && a.routeId === rt.id).length;
  ctx.log({ category: "Transport", title: "Arrived at base: " + rt.id + " · " + p.time, detail: onBoard + " children handed to the " + l.short + " team for sign-in. Parents see the arrival once each child is signed in.", link: { kind: "route", id: rt.id }, locationId: rt.locationId, actor: drv.name });
}, { toast: () => "Arrival logged. Sign each child in at base." });

export const reportDelay = defineAction<{ routeId: string; mins: number; reason: string }>("transport.delay", (s, p, ctx) => {
  const rt = s.routes.find(r => r.id === p.routeId); if (!rt) return;
  const drv = s.staff.find(x => x.id === rt.driverId)!, l = s.locations.find(x => x.id === rt.locationId)!;
  const fams = Array.from(new Set(s.bookings.filter(b => b.routeId === rt.id && b.date === TODAY && b.session === "After School" && b.status === "Booked").map(b => b.familyId)));
  for (const f of fams) ctx.comm(f, "Push", "out", "Bus " + rt.id + " is running about " + p.mins + " minutes late: " + p.reason.toLowerCase() + " (simulated notification)", "Transport agent");
  ctx.log({ category: "Transport", title: "Delay reported: " + rt.id + " · " + p.mins + " min", detail: p.reason + ". " + fams.length + " families and the " + l.short + " team notified (simulated).", link: { kind: "route", id: rt.id }, locationId: rt.locationId, actor: drv.name });
  ctx.agent("transport", rt.id + " running " + p.mins + " min late (" + p.reason + "); families and " + l.short + " notified (simulated)", "action", { kind: "route", id: rt.id });
}, { toast: () => "Delay logged. Location and families notified (simulated)." });

export const clearDelay = defineAction<{ routeId: string; eventId: string }>("transport.delayClear", (s, p, ctx) => {
  const rt = s.routes.find(r => r.id === p.routeId); if (!rt) return;
  ctx.log({ category: "Transport", title: "Delay cleared: " + rt.id + " (" + p.eventId + ")", detail: "Run back on time, confirmed by " + ctx.actor + ".", link: { kind: "route", id: rt.id }, locationId: rt.locationId });
}, { toast: () => "Delay cleared." });

/* ---------------- Overview ---------------- */
function Overview() {
  const { s } = useRos();
  const routes = scopedRoutes(s);
  const states = routes.map(rt => ({ rt, st: routeState(s, rt) }));
  const tot = states.reduce((a, x) => ({ riders: a.riders + x.st.m.length, stops: a.stops + x.rt.stops.length, bus: a.bus + x.st.onBus, base: a.base + x.st.inBase }), { riders: 0, stops: 0, bus: 0, base: 0 });
  const missing = s.issues.filter(i => i.kind === "Missing child" && i.status === "Open" && inScope(i.locationId));
  const delays = states.flatMap(x => x.st.info.delays.filter(d => d.open));
  const log = s.activity.filter(a => a.category === "Transport" && a.at.startsWith(TODAY) && inScope(a.locationId)).sort((a, b) => b.seq - a.seq).slice(0, 8);
  const pm = s.clockMin >= PM_MIN;
  return (
    <Page>
      <PageHead eyebrow="Transport & School Runs" title={"Today's school runs · " + fmtDay(TODAY)} sub="Manifests come from accepted After School bookings. Boarding, missing-child reports and base sign-ins are shared with the location and the parent app." />
      {!pm && (
        <div style={{ marginBottom: 14 }}>
          <Callout tone="info" title={"School time · " + hm(s.clockMin)} right={<Btn size="sm" onClick={() => confirmThen({ title: "Advance demo to 14:45?", body: "Moves the demo clock to the afternoon so runs can be shown: boarding, arrival and sign-in. Demo time only.", confirmLabel: "Advance to 14:45", run: advanceAfternoon })}>Advance to 14:45</Btn>}>
            Children are in school. Runs leave from 13:15 and the last pickups are around 15:00. Nobody has boarded yet, so no arrivals are shown.
          </Callout>
        </div>
      )}
      <Grid min={150} style={{ marginBottom: 16 }}>
        <Kpi label="Routes today" value={routes.length} sub="Midterm next week: none" />
        <Kpi label="Riders today" value={tot.riders} onClick={() => nav("Transport", "Daily Manifests")} />
        <Kpi label="School stops" value={tot.stops} />
        <Kpi label="On a bus now" value={tot.bus} tone={tot.bus ? "info" : undefined} />
        <Kpi label="Signed in at base" value={tot.base} tone={tot.base ? "ok" : undefined} />
        <Kpi label="Open exceptions" value={missing.length + delays.length} tone={missing.length ? "bad" : delays.length ? "warn" : "ok"} onClick={() => nav("Transport", "Exceptions")} />
      </Grid>
      {missing.map(i => <div key={i.id} style={{ marginBottom: 12 }}><Callout tone="bad" title={i.title} right={<Btn size="sm" variant="danger" onClick={() => openRecord({ kind: "issue", id: i.id })}>Open alert</Btn>}>{i.detail}</Callout></div>)}
      <div className="ros-split">
        <Grid min={290}>
          {states.map(({ rt, st }) => {
            const v = s.vehicles.find(x => x.id === rt.vehicleId)!;
            return (
              <Card key={rt.id} title={rt.id + " · " + rt.name} sub={locById(rt.locationId)?.short + " · " + staffById(rt.driverId)?.name + (rt.escortId ? " + " + staffById(rt.escortId)?.name : "") + " · " + v.reg} right={<Badge tone={st.tone} dot={st.tone === "bad"}>{st.label}</Badge>}>
                <Meter label="Riders vs child seats" value={st.m.length} max={childSeats(s, rt)} />
                <Row wrap gap={6} style={{ marginTop: 10 }}>{rt.stops.map(x => <Badge key={x.schoolId}>{x.time} {schoolName(x.schoolId)}</Badge>)}</Row>
                <Row wrap gap={6} style={{ marginTop: 10 }}>
                  <Badge tone="neutral">{st.waiting} waiting</Badge><Badge tone="info">{st.onBus} on bus</Badge><Badge tone="ok">{st.inBase} signed in</Badge>{st.missing > 0 && <Badge tone="bad" dot>{st.missing} not present</Badge>}
                </Row>
                <Row wrap style={{ marginTop: 12 }}>
                  <Btn size="sm" variant="primary" onClick={() => nav("Transport", "Daily Manifests", { routeId: rt.id })}>Manifest</Btn>
                  <Btn size="sm" onClick={() => nav("Transport", "Driver Run", { routeId: rt.id })}>Driver view</Btn>
                </Row>
              </Card>
            );
          })}
          {!routes.length && <Card><Empty title="No routes at this location" body="Bus routes run from Hazelbrook, Brookfield, both Arklow sites, Gorey and Canovee." /></Card>}
        </Grid>
        <Stack gap={14}>
          <Card title="Transport log today">
            {log.length ? <Timeline items={log.map(a => ({ at: a.at.slice(11), title: a.title, detail: a.detail, tone: /Not at pickup|not present/i.test(a.title) ? "bad" : /Delay/.test(a.title) ? "warn" : a.actorKind === "agent" ? "info" : "ok" }))} /> : <Empty title="Nothing yet today" />}
          </Card>
          <Callout tone="neutral" title="Halloween midterm">No school runs Mon 26 to Fri 30 Oct. Camps at Gorey and Canovee arrange their own outings.</Callout>
        </Stack>
      </div>
    </Page>
  );
}

/* ---------------- Routes & Vehicles ---------------- */
function RoutesVehicles() {
  const { s, ui } = useRos();
  const routes = scopedRoutes(s);
  const [sel, setSel] = useState<string>(ui.focus.routeId || "");
  const rt = routes.find(r => r.id === sel) || routes[0];
  const load = (r: Route, d: string) => manifest(r.id, d).length;
  const peak = (r: Route) => Math.max(0, ...THIS_WEEK.map(d => load(r, d)));
  const cols: Col<Route>[] = [
    { key: "id", label: "Route", w: ".8fr", render: r => <RecLink r={{ kind: "route", id: r.id }} /> },
    { key: "n", label: "Name", w: "1.4fr", render: r => r.name },
    { key: "b", label: "Base", w: "1fr", render: r => locById(r.locationId)?.short },
    { key: "v", label: "Vehicle", w: "1.1fr", render: r => s.vehicles.find(v => v.id === r.vehicleId)?.reg },
    { key: "d", label: "Driver", w: "1.1fr", render: r => staffById(r.driverId)?.name },
    { key: "e", label: "Escort", w: "1fr", render: r => r.escortId ? staffById(r.escortId)?.name : <Sub>None</Sub> },
    { key: "st", label: "Stops", w: ".5fr", align: "right", render: r => r.stops.length },
    { key: "pk", label: "Peak load", w: ".8fr", align: "right", render: r => peak(r) + " / " + childSeats(s, r), sort: r => peak(r) },
  ];
  if (!rt) return <Page><PageHead eyebrow="Transport" title="Routes & Vehicles" /><Card><Empty title="No routes at this location" /></Card></Page>;
  const v = s.vehicles.find(x => x.id === rt.vehicleId)!;
  const crew = [rt.driverId, rt.escortId].filter(Boolean).map(id => staffById(id!)!);
  return (
    <Page>
      <PageHead eyebrow="Transport" title="Routes & Vehicles" sub="Six minibus routes collect from schools after class. Seat counts leave two adult seats (driver and escort) on every vehicle." />
      <Card pad={false} title="Routes" sub="Tap a route to see stops, crew and load by day.">
        <Table rowKey={r => r.id} rows={routes} cols={cols} minWidth={860} onRow={r => setSel(r.id)} rowTone={r => r.id === rt.id ? "accent" : undefined} />
      </Card>
      <div className="ros-split" style={{ marginTop: 16 }}>
        <Card title={rt.id + " · " + rt.name} sub={locById(rt.locationId)?.name + " · €" + rt.feePerRun.toFixed(2) + " per run (demo)"} right={<Btn size="sm" onClick={() => nav("Transport", "Daily Manifests", { routeId: rt.id })}>Manifest</Btn>}>
          <Label style={{ marginBottom: 10 }}>Stops</Label>
          <Timeline items={rt.stops.map(x => ({ at: x.time, title: schoolName(x.schoolId), detail: manifest(rt.id, TODAY).filter(m => m.booking.schoolId === x.schoolId).length + " children today", right: <RecLink r={{ kind: "school", id: x.schoolId }}>School</RecLink> })).concat([{ at: hm(baseArrivalMin(rt.id, 0)), title: "Arrive " + locById(rt.locationId)?.short, detail: "Children signed in at base", right: <Sub>Base</Sub> }])} />
          <Label style={{ margin: "6px 0 10px" }}>Seats vs load this week</Label>
          <Stack gap={10}>{THIS_WEEK.map(d => <Meter key={d} label={fmtDay(d) + (d === TODAY ? " · today" : "")} value={load(rt, d)} max={childSeats(s, rt)} />)}</Stack>
        </Card>
        <Stack gap={14}>
          <Card title="Vehicle">
            <KV items={[["Registration", v.reg], ["Type", v.kind], ["Seats", v.seats + " (" + childSeats(s, rt) + " for children)"], ["Peak this week", peak(rt) + " children"]]} />
          </Card>
          <Card title="Crew">
            {crew.map(st => { const cs = certStatus(st); return (
              <div key={st.id} style={{ marginBottom: 10 }}>
                <ListRow onClick={() => openRecord({ kind: "staff", id: st.id })} lead={<Avatar name={st.name} />} title={st.name} sub={st.role + " · " + st.qualification} right={<Badge tone={cs.expired.length ? "bad" : cs.soon.length ? "warn" : "ok"}>{cs.expired.length ? "Expired cert" : cs.soon.length ? "Cert due" : "Current"}</Badge>} />
                <Row wrap gap={6} style={{ paddingLeft: 14 }}>{st.certs.map(c => <Badge key={c.kind} tone={c.expires < TODAY ? "bad" : "neutral"}>{c.kind} · {fmtDate(c.expires)}</Badge>)}</Row>
              </div>); })}
          </Card>
        </Stack>
      </div>
      <div style={{ marginTop: 16 }}>
        <Card title="Fleet" pad={false}>
          <Table rowKey={x => x.id} rows={s.vehicles.filter(x => routes.some(r => r.vehicleId === x.id))} minWidth={560} dense
            cols={[
              { key: "r", label: "Registration", w: "1fr", render: x => x.reg },
              { key: "k", label: "Type", w: "1.2fr", render: x => x.kind },
              { key: "s", label: "Seats", w: ".5fr", align: "right", render: x => x.seats },
              { key: "a", label: "Route", w: ".8fr", render: x => { const r = routes.find(y => y.vehicleId === x.id)!; return <RecLink r={{ kind: "route", id: r.id }} />; } },
              { key: "p", label: "Peak load", w: ".8fr", align: "right", render: x => { const r = routes.find(y => y.vehicleId === x.id)!; const p = peak(r), c = childSeats(s, r); return <Badge tone={p > c ? "bad" : p >= c - 1 ? "warn" : "ok"}>{p} / {c}</Badge>; } },
            ]} />
        </Card>
      </div>
    </Page>
  );
}

/* ---------------- Daily Manifests ---------------- */
function Manifests() {
  const { s, ui, role } = useRos();
  const routes = scopedRoutes(s);
  const [rid, setRid] = useState<string>(ui.focus.routeId || "");
  const [day, setDay] = useState<string>(TODAY);
  const rt = routes.find(r => r.id === rid) || routes.find(r => r.id === "WKR-02") || routes[0];
  if (!rt) return <Page><PageHead eyebrow="Transport" title="Daily Manifests" /><Card><Empty title="No routes at this location" /></Card></Page>;
  const midterm = day === "MIDTERM";
  const m = midterm ? [] : riders(rt.id, day);
  const pend = pendingRequests().filter(r => r.routeId === rt.id && !midterm && r.date === day && r.kind === "Late booking");
  const late = m.filter(x => x.booking.source === "Late request").length;
  return (
    <Page>
      <PageHead eyebrow="Transport" title="Daily Manifests" sub="Built by the Transport agent from accepted bookings. Approving a late booking adds the child here, tagged; declining changes nothing." />
      <Row wrap gap={10} style={{ marginBottom: 14 }}>
        <Seg size="sm" options={routes.map(r => r.id)} value={rt.id} onChange={setRid} />
        <Seg size="sm" options={[...THIS_WEEK.map(d => [d, fmtDay(d).slice(0, 3) + " " + d.slice(8)] as [string, string]), ["MIDTERM", "Next week"] as [string, string]]} value={day} onChange={setDay} />
      </Row>
      {midterm ? <Card><Empty title="Halloween midterm: no school runs" body="Schools are closed 26 to 30 Oct. Camps run at Gorey and Canovee; see Camps for registers and outings." action={<Btn onClick={() => nav("Camps", "Overview")}>Open Camps</Btn>} /></Card> : (
        <div className="ros-split">
          <Card title={rt.id + " · " + fmtDay(day)} sub={rt.name + " · " + staffById(rt.driverId)?.name + (rt.escortId ? " with " + staffById(rt.escortId)?.name : "")} right={<><Badge>{m.length} / {childSeats(s, rt)} seats</Badge>{late > 0 && <Badge tone="warn">{late} late booked</Badge>}</>}>
            {rt.stops.map(stop => {
              const at = m.filter(x => x.stop.schoolId === stop.schoolId);
              return (
                <div key={stop.schoolId} style={{ marginBottom: 14 }}>
                  <Row gap={8} style={{ marginBottom: 6 }}><Badge tone="info">{stop.time}</Badge><span style={{ fontSize: 13.5, fontWeight: 600 }}>{schoolName(stop.schoolId)}</span><Sub>{at.length} child{at.length === 1 ? "" : "ren"}</Sub></Row>
                  {at.length ? at.map(x => { const st = riderStatus(x, day); return (
                    <ListRow key={x.booking.id} tone={st.tone === "bad" ? "bad" : undefined} onClick={() => openRecord({ kind: "child", id: x.child.id })} lead={<Avatar name={childName(x.child)} size={26} />}
                      title={<Row wrap gap={6}><span>{childName(x.child)}</span>{x.booking.source === "Late request" && <Badge tone="warn">Late booking</Badge>}{role.medical && x.child.medical.some(md => md.severity !== "Info") && <Badge tone={x.child.medical.some(md => md.severity === "Severe") ? "bad" : "warn"} title={x.child.medical.map(md => md.detail).join("; ")}>{x.child.medical.map(md => md.kind).join(", ")}</Badge>}</Row>}
                      sub={x.child.schoolClass + " · until " + x.booking.end + " · " + x.child.familyId}
                      right={<Badge tone={st.tone} dot={st.tone === "bad"}>{st.label}</Badge>} />); }) : <Sub>No children from this school.</Sub>}
                </div>
              );
            })}
            {!m.length && <Empty title="No riders this day" />}
          </Card>
          <Stack gap={14}>
            <Card title="Summary">
              <KV items={[["Riders", String(m.length)], ["Child seats", String(childSeats(s, rt))], ["Boarded", String(m.filter(x => x.ev.boarded).length)], ["Signed in at base", String(m.filter(x => x.ev.arrived).length)], ["Not present", String(m.filter(x => x.ev.missing).length)], ["Late booked", String(late)]]} />
            </Card>
            {pend.length > 0 && <Card title="Waiting on a decision" sub="Not on the manifest until approved.">
              {pend.map(r => <ListRow key={r.id} onClick={() => openRecord({ kind: "request", id: r.id })} title={r.id + " · " + childName(idx().child.get(r.childId))} sub={"Would add 1 at " + schoolName(r.schoolId) + " · " + (m.length + 1) + " of " + childSeats(s, rt) + " seats"} right={<StatusBadge s={r.status} />} />)}
            </Card>}
            <Card title="Driver view"><Sub>Drivers work from a phone: stop by stop, tick each child, report anyone not present.</Sub><div style={{ marginTop: 10 }}><Btn size="sm" variant="primary" onClick={() => nav("Transport", "Driver Run", { routeId: rt.id })}>Open driver run</Btn></div></Card>
          </Stack>
        </div>
      )}
    </Page>
  );
}

/* ---------------- Driver Run (phone-first) ---------------- */
const DELAY_REASONS = ["Traffic on the N11", "School released late", "Roadworks at Ashford", "Vehicle check", "Weather"];
function DriverRun() {
  const { s, ui, role } = useRos();
  const routes = scopedRoutes(s);
  const def = routes.find(r => r.id === ui.focus.routeId) || routes.find(r => r.id === "WKR-02") || routes[0];
  const [rid, setRid] = useState<string>(def?.id || "");
  const [open, setOpen] = useState<string>("");
  const [delayOn, setDelayOn] = useState(false);
  const [delay, setDelay] = useState({ mins: "15", reason: DELAY_REASONS[0] });
  const rt = routes.find(r => r.id === rid) || def;
  if (!rt) return <Page><PageHead eyebrow="Transport" title="Driver Run" /><Card><Empty title="No route assigned at this location" /></Card></Page>;
  const st = routeState(s, rt);
  const pm = s.clockMin >= PM_MIN;
  const started = st.info.started || st.m.some(x => x.ev.boarded);
  const atBase = !!st.info.arrived || st.m.some(x => x.ev.arrived);
  const base = locById(rt.locationId)!;
  const arriveAt = hm(baseArrivalMin(rt.id, s.clockMin));
  const toSignIn = st.m.filter(x => x.ev.boarded && !x.ev.arrived && !x.ev.missing);
  const done = st.m.filter(x => x.ev.boarded || x.ev.missing || x.ev.arrived || x.ev.absent).length;
  const boardTime = (x: Rider) => x.child.familyId === "ROS1042" && rt.id === "WKR-02" ? hm(Math.max(s.clockMin, toMin("14:49"))) : hm(Math.max(s.clockMin, toMin(x.stop.time)));
  const issueFor = (x: Rider) => s.issues.find(i => i.kind === "Missing child" && i.title.includes(childName(x.child)));
  const big = { height: 44, fontSize: 14, flex: 1 } as const;
  return (
    <Page>
      <PageHead eyebrow="Transport · Driver" title="Driver Run" sub="Phone view for the driver and escort. Every tap is an attendance event the location and the parent app see straight away." />
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <div style={{ border: "1px solid var(--border-strong)", borderRadius: 30, background: "var(--surface)", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,.28)" }}>
          <div style={{ padding: "18px 18px 14px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
            <Row gap={10}>
              <Avatar name={staffById(rt.driverId)?.name || "Driver"} size={36} />
              <Stack><span style={{ fontSize: 14.5, fontWeight: 600 }}>{rt.id} · {rt.name}</span><Sub>{staffById(rt.driverId)?.name}{rt.escortId ? " · escort " + staffById(rt.escortId)?.name : ""} · {s.vehicles.find(v => v.id === rt.vehicleId)?.reg}</Sub></Stack>
            </Row>
            {routes.length > 1 && role.id !== "driver" && <div style={{ marginTop: 12 }}><Seg size="sm" options={routes.map(r => r.id)} value={rt.id} onChange={setRid} /></div>}
            <Row gap={8} wrap style={{ marginTop: 12 }}>
              <Badge tone={st.tone} dot={st.tone === "bad"}>{st.label}</Badge>
              <Badge>{fmtDay(TODAY)} · {hm(s.clockMin)}</Badge>
              <Badge>{done} of {st.m.length} accounted for</Badge>
            </Row>
          </div>
          <div style={{ padding: 16 }}>
            {!pm ? (
              <Callout tone="info" title={"It's " + hm(s.clockMin) + ". Children are in school."}>
                Runs start in the afternoon; the first pickup on this route is {rt.stops[0].time}. Move the demo clock to show the run.
                <div style={{ marginTop: 10 }}><Btn variant="primary" full style={{ height: 44 }} onClick={() => confirmThen({ title: "Advance demo to 14:45?", body: "Moves the demo clock to 14:45 so the run can be shown. Demo time only.", confirmLabel: "Advance to 14:45", run: advanceAfternoon })}>Advance demo to 14:45</Btn></div>
              </Callout>
            ) : !started ? (
              <Stack gap={10}>
                <Callout tone="neutral" title={st.m.length + " children on today's manifest"}>Check the vehicle, seat belts and the escort before leaving {base.short}.</Callout>
                <Btn variant="primary" full style={{ height: 48, fontSize: 15 }} onClick={() => startRun({ routeId: rt.id })} disabled={!st.m.length}>Start run</Btn>
              </Stack>
            ) : null}
            {st.info.delays.filter(d => d.open).map(d => <div key={d.ev.id} style={{ marginTop: 10 }}><Callout tone="warn" title={d.ev.title.replace("Delay reported: ", "Delay · ")}>{d.ev.detail}</Callout></div>)}

            <div style={{ marginTop: 14 }}>
              {rt.stops.map((stop, si) => {
                const at = st.m.filter(x => x.stop.schoolId === stop.schoolId);
                const left = at.filter(x => !x.ev.boarded && !x.ev.missing && !x.ev.arrived && !x.ev.absent).length;
                return (
                  <div key={stop.schoolId} style={{ marginBottom: 16 }}>
                    <Row gap={10} style={{ marginBottom: 8 }}>
                      <span style={{ width: 26, height: 26, borderRadius: 13, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, background: left ? "var(--accent-soft)" : "var(--ok-soft)", color: left ? "var(--accent)" : "var(--ok)" }}>{si + 1}</span>
                      <Stack><span style={{ fontSize: 14, fontWeight: 600 }}>{schoolName(stop.schoolId)}</span><Sub>{stop.time} · {at.length} child{at.length === 1 ? "" : "ren"}{left ? " · " + left + " to collect" : at.length ? " · done" : ""}</Sub></Stack>
                    </Row>
                    {at.map(x => {
                      const rs = riderStatus(x, TODAY), iss = issueFor(x), expanded = open === x.child.id;
                      const waiting = !x.ev.boarded && !x.ev.missing && !x.ev.arrived && !x.ev.absent;
                      return (
                        <div key={x.booking.id} style={{ border: "1px solid " + (x.ev.missing ? "var(--bad)" : "var(--border)"), background: x.ev.missing ? "var(--bad-soft)" : "var(--surface-2)", borderRadius: 16, padding: 12, marginBottom: 8 }}>
                          <Row gap={10}>
                            <Avatar name={childName(x.child)} size={34} />
                            <Stack><span style={{ fontSize: 14.5, fontWeight: 600 }}>{childName(x.child)}</span><Sub>{x.child.schoolClass}{x.booking.source === "Late request" ? " · late booking" : ""}</Sub></Stack>
                            <div style={{ flex: 1 }} />
                            <Badge tone={rs.tone} dot={rs.tone === "bad"}>{rs.label}</Badge>
                          </Row>
                          {role.medical && x.child.medical.length > 0 && <Row wrap gap={6} style={{ marginTop: 8 }}>{x.child.medical.map((md, i) => <Badge key={i} tone={md.severity === "Severe" ? "bad" : md.severity === "Moderate" ? "warn" : "neutral"} title={md.detail}>{md.kind}: {md.detail.split("·")[0].trim()}</Badge>)}</Row>}
                          {waiting && started && (
                            <Row gap={8} style={{ marginTop: 10 }}>
                              <Btn variant="primary" style={big} onClick={() => board({ routeId: rt.id, childId: x.child.id, time: boardTime(x) })}>Boarded · {boardTime(x)}</Btn>
                              <Btn variant="danger" style={{ ...big, flex: "none", padding: "0 14px" }} onClick={() => confirmThen({ title: "Report " + x.child.firstName + " not present?", body: "Raises an urgent missing-child alert to the " + base.short + " manager and logs it for safeguarding. A person must confirm where " + x.child.firstName + " is; the alert cannot close itself. Stay at the stop until told to move on.", confirmLabel: "Report not present", danger: true, run: () => markNotPresent({ routeId: rt.id, childId: x.child.id, time: hm(Math.max(s.clockMin, toMin(stop.time))) }) })}>Not present</Btn>
                            </Row>
                          )}
                          {x.ev.missing && (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ fontSize: 12.5, color: "var(--bad)", fontWeight: 600, lineHeight: 1.5 }}>{iss && iss.status === "Resolved" ? "Resolved by " + iss.resolvedBy + ". Whereabouts confirmed." : "URGENT · alert open. Wait for the " + base.short + " manager before leaving the stop."}</div>
                              {iss && <div style={{ marginTop: 8 }}><Btn size="sm" variant="danger" onClick={() => openRecord({ kind: "issue", id: iss.id })}>Open alert {iss.id}</Btn></div>}
                            </div>
                          )}
                          <button className="ros-focus" onClick={() => setOpen(expanded ? "" : x.child.id)} style={{ marginTop: 10, background: "none", border: 0, padding: 0, color: "var(--dim)", fontSize: 12, cursor: "pointer" }}>{expanded ? "Hide checks" : "Collector and consent checks"}</button>
                          {expanded && (
                            <div style={{ marginTop: 8 }}>
                              <Row wrap gap={6} style={{ marginBottom: 6 }}><Badge tone={x.child.consents.transport ? "ok" : "bad"}>Transport consent {x.child.consents.transport ? "on file" : "missing"}</Badge></Row>
                              {x.child.collectors.map(c => <ListRow key={c.name} lead={<Avatar name={c.name} size={22} tone={c.permitted ? undefined : "var(--bad)"} />} title={c.name} sub={c.relation + (c.note ? " · " + c.note : "")} right={<Badge tone={c.permitted ? "ok" : "bad"}>{c.permitted ? "Permitted" : "NOT permitted"}</Badge>} />)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {started && left > 1 && <Btn full onClick={() => at.filter(x => !x.ev.boarded && !x.ev.missing && !x.ev.arrived && !x.ev.absent).forEach(x => board({ routeId: rt.id, childId: x.child.id, time: boardTime(x) }))}>Board all {left} at {schoolName(stop.schoolId)}</Btn>}
                    {!at.length && <Sub>No children at this stop today.</Sub>}
                  </div>
                );
              })}
            </div>

            {started && !atBase && (
              <Stack gap={8}>
                <Btn variant="primary" full style={{ height: 48, fontSize: 15 }} disabled={st.waiting > 0} title={st.waiting ? "Board or report every child first" : undefined}
                  onClick={() => confirmThen({ title: "Arrived at " + base.short + "?", body: "Logs the arrival at " + arriveAt + ". The " + base.short + " team then signs each child in; parents see the arrival when that happens.", confirmLabel: "Arrived at base", run: () => arriveBase({ routeId: rt.id, time: arriveAt }) })}>Arrived at base · {arriveAt}</Btn>
                {st.waiting > 0 && <Sub>{st.waiting} child{st.waiting === 1 ? "" : "ren"} still to board or report before arriving.</Sub>}
              </Stack>
            )}
            {atBase && (
              <Card title={"Hand over at " + base.short} sub="Location staff sign each child in. This is what the parent app shows.">
                {toSignIn.length ? (
                  <>
                    {toSignIn.map(x => <ListRow key={x.child.id} lead={<Avatar name={childName(x.child)} size={26} />} title={childName(x.child)} sub={"Boarded " + x.ev.boarded!.time} right={<Btn size="sm" variant="ok" onClick={() => signIn({ childId: x.child.id, time: arriveAt, by: base.short + " team", routeId: rt.id })}>Sign in {arriveAt}</Btn>} />)}
                    {toSignIn.length > 1 && <div style={{ marginTop: 8 }}><Btn variant="primary" full style={{ height: 44 }} onClick={() => toSignIn.forEach(x => signIn({ childId: x.child.id, time: arriveAt, by: base.short + " team", routeId: rt.id }))}>Sign in all {toSignIn.length} at {arriveAt}</Btn></div>}
                  </>
                ) : <Callout tone="ok" title="Everyone signed in">{st.inBase} child{st.inBase === 1 ? "" : "ren"} signed in at {base.short}.{st.missing ? " " + st.missing + " not present: alert stays open until a person resolves it." : ""}</Callout>}
              </Card>
            )}

            {started && (
              <div style={{ marginTop: 14 }}>
                {!delayOn ? <Btn full onClick={() => setDelayOn(true)}>Report a delay</Btn> : (
                  <Card title="Report a delay">
                    <Stack gap={10}>
                      <Seg size="sm" options={["10", "15", "20", "30"].map(v => [v, v + " min"] as [string, string])} value={delay.mins} onChange={v => setDelay({ ...delay, mins: v })} />
                      <select className="ros-input" value={delay.reason} onChange={e => setDelay({ ...delay, reason: e.target.value })}>{DELAY_REASONS.map(r => <option key={r}>{r}</option>)}</select>
                      <Row><Btn variant="primary" onClick={() => { reportDelay({ routeId: rt.id, mins: +delay.mins, reason: delay.reason }); setDelayOn(false); }}>Notify location and parents</Btn><Btn variant="subtle" onClick={() => setDelayOn(false)}>Cancel</Btn></Row>
                      <Sub>Notifications are simulated.</Sub>
                    </Stack>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}

/* ---------------- Exceptions ---------------- */
function Exceptions() {
  const { s } = useRos();
  const routes = scopedRoutes(s);
  const missing = s.issues.filter(i => i.kind === "Missing child" && inScope(i.locationId)).sort((a, b) => (a.status === "Open" ? 0 : 1) - (b.status === "Open" ? 0 : 1));
  const delays = routes.flatMap(rt => runInfo(s, rt.id).delays.map(d => ({ rt, ...d })));
  const stopSchools = new Map<string, Route>();
  for (const rt of routes) for (const st of rt.stops) stopSchools.set(st.schoolId, rt);
  const noConsent = s.children.filter(c => c.programme === "SAC" && inScope(c.locationId) && !c.consents.transport && c.schoolId && stopSchools.get(c.schoolId)?.locationId === c.locationId
    && (idx().bookingsByChild.get(c.id) || []).some(b => b.session === "After School" && b.date >= TODAY));
  const cap: { rt: Route; d: string; load: number; seats: number; pending: number }[] = [];
  for (const rt of routes) for (const d of THIS_WEEK.filter(x => x >= TODAY)) {
    const load = manifest(rt.id, d).length, seats = childSeats(s, rt);
    const pending = pendingRequests().filter(r => r.routeId === rt.id && r.date === d && r.kind === "Late booking").length;
    if (load + pending >= seats - 1) cap.push({ rt, d, load, seats, pending });
  }
  const taskOpen = (title: string) => s.tasks.some(t => t.title === title && t.status !== "Done");
  return (
    <Page>
      <PageHead eyebrow="Transport" title="Exceptions" sub="Anything that needs a person. Child-safety exceptions are never closed by an agent." />
      <Grid min={160} style={{ marginBottom: 16 }}>
        <Kpi label="Missing child alerts open" value={missing.filter(i => i.status === "Open").length} tone={missing.some(i => i.status === "Open") ? "bad" : "ok"} />
        <Kpi label="Delays open" value={delays.filter(d => d.open).length} tone={delays.some(d => d.open) ? "warn" : "ok"} />
        <Kpi label="No transport consent" value={noConsent.length} tone={noConsent.length ? "warn" : "ok"} />
        <Kpi label="Seat pressure (rest of week)" value={cap.length} tone={cap.some(x => x.load + x.pending > x.seats) ? "bad" : cap.length ? "warn" : "ok"} />
      </Grid>
      <div className="ros-split-even">
        <Stack gap={14}>
          <Card title="Missing child alerts" sub="Raised by a driver. A location manager must confirm the child's whereabouts with the parent or school.">
            {missing.length ? missing.map(i => <ListRow key={i.id} tone={i.status === "Open" ? "bad" : "ok"} onClick={() => openRecord({ kind: "issue", id: i.id })} title={i.title} sub={i.status === "Open" ? i.detail : "Resolved by " + i.resolvedBy + " · " + rel(i.resolvedAt || "")} right={<StatusBadge s={i.status === "Open" ? "Urgent" : "Resolved"} dot={i.status === "Open"} />} />)
              : <Empty title="No missing-child alerts today" body="If a driver reports a child not at pickup, it lands here and with the location manager." />}
          </Card>
          <Card title="Delays">
            {delays.length ? delays.map(d => <ListRow key={d.ev.id} tone={d.open ? "warn" : undefined} title={d.ev.title.replace("Delay reported: ", "")} sub={d.ev.at.slice(11) + " · " + d.ev.detail} right={d.open ? <Btn size="sm" onClick={() => clearDelay({ routeId: d.rt.id, eventId: d.ev.id })}>Mark cleared</Btn> : <Badge tone="ok">Cleared</Badge>} />)
              : <Empty title="No delays reported" body="Drivers report delays from the Driver Run screen." />}
          </Card>
        </Stack>
        <Stack gap={14}>
          <Card title="Booked but no transport consent" sub="These children attend a school on a route but cannot ride without consent. They need an escort walk or a parent drop-off.">
            {noConsent.length ? noConsent.slice(0, 12).map(c => { const title = "Transport consent missing: " + childName(c); return <ListRow key={c.id} onClick={() => openRecord({ kind: "child", id: c.id })} title={childName(c)} sub={schoolName(c.schoolId) + " · " + locById(c.locationId)?.short + " · " + c.familyId} right={<Btn size="sm" disabled={taskOpen(title)} onClick={() => addTask({ title, priority: "Medium", owner: staffById(locById(c.locationId)!.managerId)?.name || "Location manager", link: { kind: "child", id: c.id } })}>{taskOpen(title) ? "Task open" : "Chase consent"}</Btn>} />; })
              : <Empty title="Every rider has consent" />}
            {noConsent.length > 12 && <Sub>+{noConsent.length - 12} more.</Sub>}
          </Card>
          <Card title="Seat pressure" sub="Days at or near the child-seat limit, including late bookings waiting on a decision.">
            {cap.length ? cap.map(x => <ListRow key={x.rt.id + x.d} tone={x.load + x.pending > x.seats ? "bad" : "warn"} onClick={() => nav("Transport", "Daily Manifests", { routeId: x.rt.id })} title={x.rt.id + " · " + fmtDay(x.d)} sub={x.load + " booked" + (x.pending ? " + " + x.pending + " pending" : "") + " of " + x.seats + " child seats"} right={<Badge tone={x.load + x.pending > x.seats ? "bad" : "warn"}>{x.load + x.pending > x.seats ? "Over" : "Near limit"}</Badge>} />)
              : <Empty title="No over-capacity days" body="Every run this week has spare child seats." />}
          </Card>
        </Stack>
      </div>
    </Page>
  );
}

/* ---------------- Fees ---------------- */
function Fees() {
  const { s, role } = useRos();
  const [q, setQ] = useState("");
  const routes = scopedRoutes(s);
  const lines = transportLines().filter(l => routes.some(r => r.id === l.routeId));
  const byRoute = routes.map(rt => { const x = lines.filter(l => l.routeId === rt.id); return { rt, runs: x.length, amount: x.reduce((n, l) => n + l.amount, 0), expected: THIS_WEEK.reduce((n, d) => n + manifest(rt.id, d).length, 0) }; });
  const famMap = new Map<string, { familyId: string; runs: number; amount: number; late: number; invoiceId: string }>();
  for (const l of lines) { const e = famMap.get(l.familyId) || { familyId: l.familyId, runs: 0, amount: 0, late: 0, invoiceId: l.invoiceId }; e.runs++; e.amount += l.amount; if (l.late) e.late++; famMap.set(l.familyId, e); }
  const fams = Array.from(famMap.values()).filter(f => !q || f.familyId.toLowerCase().includes(q.toLowerCase()) || (idx().family.get(f.familyId)?.surname || "").toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.amount - a.amount);
  const total = lines.reduce((n, l) => n + l.amount, 0);
  const expected = byRoute.reduce((n, r) => n + r.expected, 0);
  return (
    <Page>
      <PageHead eyebrow="Transport" title="Fees" sub={"Demo fee rule: €" + s.config.transportFee.toFixed(2) + " per school collection, added to the weekly invoice for every After School booking on a route. No charge in midterm."} right={<DemoTag>Demo fee rules</DemoTag>} />
      <Grid min={160} style={{ marginBottom: 16 }}>
        <Kpi label="Runs billed this week" value={lines.length} />
        <Kpi label="Transport billed" value={role.finance ? euro(total) : "Restricted"} />
        <Kpi label="Runs on manifests" value={expected} sub={expected === lines.length ? "Matches billing" : Math.abs(expected - lines.length) + (expected > lines.length ? " not yet billed" : " billed but cancelled")} tone={expected === lines.length ? "ok" : "warn"} />
        <Kpi label="Late-booked runs" value={lines.filter(l => l.late).length} sub="From approved late bookings" />
      </Grid>
      <div className="ros-split">
        <Card title="By route · w/c 19 Oct">
          <HBars items={byRoute.map(r => ({ label: r.rt.id + " · " + r.rt.name, value: role.finance ? r.amount : r.runs, sub: r.runs + " runs" }))} format={n => role.finance ? euro(n) : n + " runs"} />
          <div style={{ marginTop: 12 }}><Sub>Cancellations in a locked week keep their transport charge under the published fee terms, so billed runs can exceed manifest runs.</Sub></div>
        </Card>
        <Card title="Fee rules">
          <KV items={[["School collection", "€" + s.config.transportFee.toFixed(2) + " per run"], ["Applies to", "After School bookings on a route"], ["Late booking", "Run fee + €" + s.config.lateFee + " late fee"], ["Midterm", "No runs, no charge"]]} />
        </Card>
      </div>
      <div style={{ marginTop: 16 }}>
        {role.finance ? (
          <Card title="By family" right={<Search value={q} onChange={setQ} placeholder="Family or ROS ID" width={210} />} pad={false}>
            <Table rowKey={f => f.familyId} rows={fams} minWidth={620} pageSize={15} onRow={f => openRecord({ kind: "family", id: f.familyId })}
              cols={[
                { key: "f", label: "Family", w: "1.4fr", render: f => <Row gap={8}><RecLink r={{ kind: "family", id: f.familyId }} /><span>{idx().family.get(f.familyId)?.surname}</span></Row> },
                { key: "r", label: "Runs", w: ".6fr", align: "right", render: f => f.runs, sort: f => f.runs },
                { key: "l", label: "Late booked", w: ".7fr", align: "right", render: f => f.late ? <Badge tone="warn">{f.late}</Badge> : "" },
                { key: "a", label: "Amount", w: ".8fr", align: "right", render: f => euro(f.amount), sort: f => f.amount },
                { key: "i", label: "Invoice", w: "1fr", render: f => <RecLink r={{ kind: "invoice", id: f.invoiceId }} /> },
              ]} />
          </Card>
        ) : <Callout tone="neutral" title="Family billing is restricted">Per-family transport charges are visible to the owner, operations and accounts roles. Switch role in the header to see them.</Callout>}
      </div>
    </Page>
  );
}

export default function Transport({ tab }: { tab: string }) {
  useRos();
  switch (tab) {
    case "Routes & Vehicles": return <RoutesVehicles />;
    case "Daily Manifests": return <Manifests />;
    case "Driver Run": return <DriverRun />;
    case "Exceptions": return <Exceptions />;
    case "Fees": return <Fees />;
    default: return <Overview />;
  }
}
