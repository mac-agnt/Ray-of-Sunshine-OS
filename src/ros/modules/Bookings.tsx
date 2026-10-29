/* Bookings & Attendance. Every count here is derived from bookings, the rota,
   attendance events and the booking windows, so the calendar, the registers
   and the ratio board always agree. Ratios use demo thresholds: configurable,
   illustrative, not official legal verification. */
import { useState } from "react";
import type { Session, Child, Booking, WaitlistEntry, BookingRequest, BookingWindow, Location, Issue, Tone, RosState } from "../types";
import { useRos, nav, openRecord, confirmThen, defineAction, setClock } from "../store";
import {
  idx, inScope, scopedLocations, scopeLoc, bookingsOn, register, ratioCheck, ratioAlerts, pendingRequests, locById,
  family as familyOf, childName, schoolName, staffById, underbooked,
} from "../selectors";
import { requestChecks, RequestPanel } from "../records";
import { runAutomation, signIn, signOut, advanceAfternoon } from "../actions";
import { TODAY, TOMORROW, THIS_WEEK, MIDTERM_WEEK, fmtDay, fmtDate, hm, toMin, rel, euro0, pct, PM_MIN, daysBetween } from "../time";
import {
  Page, PageHead, Card, Kpi, Grid, Table, Badge, StatusBadge, Btn, RecLink, Columns, Meter, KV, Callout, Seg, Search, ListRow,
  DemoTag, Empty, Avatar, Row, Stack, Sub, Label, Toggle, Bar, type Col,
} from "../ui";
import { campAttendDays, campDates } from "./Camps";
import { baseArrivalMin } from "./Transport";

/* ---------------- helpers ---------------- */
const TERM: Session[] = ["Morning", "After School", "Full Day"];
export function minsUntil(at: string, clockMin: number) {
  return Math.round((Date.parse(at.replace(" ", "T") + ":00Z") - Date.parse(TODAY + "T" + hm(clockMin) + ":00Z")) / 60000);
}
export function countdown(m: number) {
  if (m <= 0) return "Closed";
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return (d ? d + "d " : "") + (d || h ? h + "h " : "") + mm + "m";
}
const capFor = (s: RosState, locIds: string[], session: Session) => session === "Full Day"
  ? s.rooms.filter(r => r.kind !== "SAC" && locIds.includes(r.locationId)).reduce((n, r) => n + r.capacity, 0)
  : locIds.reduce((n, id) => n + (locById(id)?.sacCapacity || 0), 0);
const hasEY = (s: RosState, loc: string) => s.rooms.some(r => r.locationId === loc && r.kind !== "SAC");
type SessStatus = "Expected" | "Signed in" | "Signed out" | "On bus" | "Absent" | "Not present";
/** Status for one session, so a morning-club sign-out never shows on the After School register. */
function sessStatus(childId: string, date: string, session: Session): { status: SessStatus; time?: string; collector?: string; routeId?: string } {
  const ev = (idx().attendanceByChildDate.get(childId + "|" + date) || []).filter(e =>
    e.kind === "absent" ? (!e.note || e.note.startsWith(session)) : session === "Morning" ? toMin(e.time) < 12 * 60 : session === "After School" ? toMin(e.time) >= 13 * 60 || !!e.routeId : true,
  ).sort((a, b) => a.time.localeCompare(b.time));
  const last = ev[ev.length - 1];
  if (!last) return { status: "Expected" };
  const map: Record<string, SessStatus> = { in: "Signed in", out: "Signed out", boarded: "On bus", absent: "Absent", "not-present": "Not present" };
  return { status: map[last.kind], time: last.time, collector: last.collector, routeId: last.routeId };
}
const medTone = (c: Child): Tone => c.medical.some(m => m.severity === "Severe") ? "bad" : c.medical.some(m => m.severity === "Moderate") ? "warn" : "neutral";

/* ---------------- actions ---------------- */
export const markAbsent = defineAction<{ childId: string; date: string; session: Session; reason: string }>("bookings.absent", (s, p, ctx) => {
  const c = s.children.find(x => x.id === p.childId); if (!c) return;
  if (s.attendance.some(a => a.childId === c.id && a.date === p.date && a.kind === "absent" && (a.note || "").startsWith(p.session))) return;
  s.attendance.push({ id: ctx.id("AT"), childId: c.id, date: p.date, kind: "absent", time: ctx.time, by: ctx.actor, note: p.session + " · " + p.reason });
  ctx.comm(c.familyId, "App", "note", c.firstName + " marked absent for " + p.session + " (" + p.reason + ")", ctx.actor);
  ctx.log({ category: "Operations", title: c.firstName + " " + c.surname + " marked absent", detail: p.session + " · " + fmtDay(p.date) + " · " + p.reason + ". Register updated; no charge change in a locked week.", link: { kind: "child", id: c.id }, locationId: c.locationId });
}, { toast: () => "Marked absent. Register and family timeline updated.", undo: true });

export const offerWaitlist = defineAction<{ id: string; note: string }>("bookings.waitlistOffer", (s, p, ctx) => {
  const w = s.waitlist.find(x => x.id === p.id); if (!w || w.status !== "Waiting") return;
  w.status = "Offered";
  const l = s.locations.find(x => x.id === w.locationId)!;
  s.tasks.push({ id: ctx.id("TSK"), title: "Follow up place offer: " + w.childName + " (" + w.id + ")", owner: s.staff.find(x => x.id === l.managerId)?.name || ctx.actor, due: "Thu 22 Oct", dueDate: "2026-10-22", priority: "Medium", department: "Enrolment", status: "Not started", link: { kind: "waitlist", id: w.id }, source: ctx.actor, locationId: w.locationId });
  ctx.log({ category: "Enrolment", title: "Place offered: " + w.childName, detail: w.service + " · " + w.room + " · " + l.short + " · " + p.note + " Offer held 48 hours; message to " + w.parent + " simulated.", link: { kind: "waitlist", id: w.id }, locationId: w.locationId });
  ctx.agent("enrolment", "Offer to " + w.parent + " (" + w.id + ") sent on " + ctx.actor + "'s approval (simulated)", "action", { kind: "waitlist", id: w.id });
}, { toast: () => "Place offered and logged. Follow-up task created.", undo: true });

export const respondWaitlist = defineAction<{ id: string; accepted: boolean }>("bookings.waitlistRespond", (s, p, ctx) => {
  const w = s.waitlist.find(x => x.id === p.id); if (!w || w.status !== "Offered") return;
  w.status = p.accepted ? "Accepted" : "Declined";
  s.tasks.forEach(t => { if (t.link?.kind === "waitlist" && t.link.id === w.id) t.status = "Done"; });
  ctx.log({ category: "Enrolment", title: "Offer " + (p.accepted ? "accepted" : "declined") + ": " + w.childName, detail: w.parent + " · " + w.room + (p.accepted ? ". Registration pack to follow." : ". Next family in line can be offered."), link: { kind: "waitlist", id: w.id }, locationId: w.locationId });
}, { toast: (p) => p.accepted ? "Accepted. Registration is next." : "Declined. The place is free to offer again.", undo: true });

/* ---------------- Overview ---------------- */
function Overview() {
  const { s } = useRos();
  const locs = scopedLocations(), ids = locs.map(l => l.id) as string[];
  const day = (d: string) => (idx().bookingsByDate.get(d) || []).filter(b => ids.includes(b.locationId));
  const today = day(TODAY);
  const kids = new Set(today.map(b => b.childId)).size;
  const pend = pendingRequests();
  const w = s.windows.find(x => x.status === "Open");
  const left = w ? minsUntil(w.closes, s.clockMin) : 0;
  const eligible = s.families.filter(f => ids.includes(f.locationId) && !f.blocked && f.childIds.length);
  const subd = new Set(w?.submissions.map(x => x.familyId));
  const subN = eligible.filter(f => subd.has(f.id)).length;
  const alerts = ratioAlerts();
  const present = (sess: Session) => today.filter(b => b.session === sess && sessStatus(b.childId, TODAY, sess).status === "Signed in").length;
  const week = THIS_WEEK.map(d => ({ d, n: day(d).length }));
  return (
    <Page>
      <PageHead eyebrow="Bookings & Attendance" title={"Today · " + fmtDay(TODAY) + " · " + hm(s.clockMin)} sub="Bookings for this week are locked. Changes come through late, change and cancellation requests; the w/c 2 Nov window is open now." />
      <Grid min={160} style={{ marginBottom: 16 }}>
        <Kpi label="Children booked today" value={kids} sub={today.length + " sessions"} />
        <Kpi label="Requests waiting" value={pend.length} tone={pend.length ? "warn" : "ok"} sub="Late, change, cancellation" onClick={() => nav("Bookings", "Late & Change Requests")} />
        <Kpi label={"Window " + (w?.label || "")} value={w ? countdown(left) : "None open"} sub={w ? "Closes Thu 22 Oct 18:00" : undefined} tone={left < 1440 ? "warn" : undefined} onClick={() => nav("Bookings", "Window Control")} />
        <Kpi label="Families submitted" value={subN + " / " + eligible.length} sub={pct(eligible.length ? subN / eligible.length : 0) + " of eligible"} onClick={() => nav("Bookings", "Window Control")} />
        <Kpi label="Ratio alerts" value={alerts.length} tone={alerts.length ? "bad" : "ok"} sub="Today and tomorrow" onClick={() => nav("Bookings", "Ratios")} />
      </Grid>
      <div className="ros-split">
        <Stack gap={14}>
          <Card title="Today by session" sub="Booked against places, and who is here right now.">
            <Stack gap={14}>
              {TERM.filter(x => x !== "Full Day" || ids.some(id => hasEY(s, id))).map(sess => {
                const n = today.filter(b => b.session === sess).length, cap = capFor(s, ids, sess);
                const ncs = today.filter(b => b.session === sess && b.funding === "NCS").length;
                return (
                  <div key={sess}>
                    <Meter label={sess + (sess === "Morning" ? " club (07:30 to school)" : sess === "After School" ? " (from 14:00)" : " · Early Years")} value={n} max={cap} hint={present(sess) + " here now"} />
                    <Row gap={6} style={{ marginTop: 6 }}><Badge tone="info">NCS {ncs}</Badge><Badge>Private {n - ncs}</Badge>{today.filter(b => b.session === sess && b.source === "Late request").length > 0 && <Badge tone="warn">{today.filter(b => b.session === sess && b.source === "Late request").length} late booked</Badge>}</Row>
                  </div>
                );
              })}
            </Stack>
          </Card>
          <Card title="Sessions this week" sub="All locations in view">
            <Columns data={week.map(x => ({ label: fmtDay(x.d).slice(0, 3), value: x.n, tone: x.d === TODAY ? "accent" : x.d < TODAY ? "neutral" : "info" }))} height={120} />
          </Card>
          <Card title="After School by location" sub="Booked vs places this week" pad={false}>
            <Table rowKey={l => l.id} rows={locs} minWidth={620} dense onRow={l => nav("Bookings", "Weekly Calendar", { calLoc: l.id })}
              cols={[{ key: "l", label: "Location", w: "1.3fr", render: l => l.short } as Col<Location>].concat(THIS_WEEK.map(d => ({
                key: d, label: fmtDay(d).slice(0, 3), w: "1fr", align: "right" as const,
                render: (l: Location) => { const n = bookingsOn(d, l.id, "After School").length; return <span style={{ color: n > l.sacCapacity ? "var(--bad)" : n >= l.sacCapacity - 2 ? "var(--warn)" : undefined }}>{n}<span style={{ color: "var(--faint)" }}>/{l.sacCapacity}</span></span>; },
              })))} />
          </Card>
        </Stack>
        <Stack gap={14}>
          <Card title="Requests waiting" right={<Btn size="sm" onClick={() => nav("Bookings", "Late & Change Requests")}>All requests</Btn>}>
            {pend.length ? pend.slice().sort((a, b) => a.id === "LBR-006" ? -1 : b.id === "LBR-006" ? 1 : a.date.localeCompare(b.date)).slice(0, 7).map(r => { const k = requestChecks(r.id); return (
              <ListRow key={r.id} onClick={() => openRecord({ kind: "request", id: r.id })} title={r.id + " · " + childName(idx().child.get(r.childId))} sub={r.kind + " · " + fmtDay(r.date) + " " + r.start + "–" + r.end + " · " + locById(r.locationId)?.short}
                right={<Badge tone={(k.noticeOk || r.kind === "Cancellation") && k.capOk && k.ratioOk ? "ok" : "warn"}>{(k.noticeOk || r.kind === "Cancellation") && k.capOk && k.ratioOk ? "Checks pass" : "Check"}</Badge>} />); }) : <Empty title="Nothing waiting" />}
          </Card>
          <Card title="Ratio health" sub="Demo thresholds, configurable; not official legal verification." right={<Btn size="sm" onClick={() => nav("Bookings", "Ratios")}>Ratios</Btn>}>
            {alerts.length ? alerts.map((a, i) => <ListRow key={i} tone="bad" onClick={a.issue ? () => openRecord({ kind: "issue", id: a.issue!.id }) : () => nav("Bookings", "Ratios")} title={locById(a.loc)?.short + " · " + (a.roomId ? idx().room.get(a.roomId)?.name : a.session) + " · " + fmtDay(a.date)} sub={a.booked + " children · " + a.rostered + " of " + a.required + " staff"} right={a.issue ? <RecLink r={{ kind: "issue", id: a.issue.id }} /> : <Badge tone="bad">Short</Badge>} />)
              : <Callout tone="ok" title="All sessions covered">Every session today and tomorrow meets the demo ratio.</Callout>}
          </Card>
        </Stack>
      </div>
    </Page>
  );
}

/* ---------------- Weekly Calendar ---------------- */
function Calendar() {
  const { s, ui } = useRos();
  const locs = scopedLocations();
  const [week, setWeek] = useState<"this" | "mid">("this");
  const [loc, setLoc] = useState<string>(ui.focus.calLoc || (scopeLoc() !== "ALL" ? scopeLoc() : "ALL"));
  const sel = loc === "ALL" || locs.some(l => l.id === loc) ? loc : "ALL";
  const ids = sel === "ALL" ? locs.map(l => l.id as string) : [sel];
  const days = week === "this" ? THIS_WEEK : MIDTERM_WEEK;
  const rows: (Session | "Camps")[] = ["Morning", "After School", ...(ids.some(id => hasEY(s, id)) ? ["Full Day" as Session] : []), "Camps"];
  const camps = s.camps.filter(c => ids.includes(c.locationId) && !c.past);
  const campDay = (d: string) => {
    const running = camps.filter(c => campDates(c).includes(d));
    const regs = s.campRegs.filter(r => running.some(c => c.id === r.campId) && (r.status === "Confirmed" || r.status === "Pending payment"));
    const att = regs.filter(r => campAttendDays(r, running.find(c => c.id === r.campId)!).includes(d));
    return { n: att.length, cap: running.reduce((n, c) => n + c.capacity, 0), ncs: att.filter(r => r.ncsHours > 0).length, unpaid: att.filter(r => !r.paid).length, camp: running[0] };
  };
  const cell = (row: Session | "Camps", d: string) => {
    if (row === "Camps") {
      const c = campDay(d);
      if (!c.cap) return <Sub>{week === "this" ? "School term" : "No camp"}</Sub>;
      return (
        <button className="ros-focus ros-row-hover" onClick={() => c.camp && nav("Camps", "Staff & Registers", { campId: c.camp.id })} style={cellBtn}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{c.n}<span style={{ color: "var(--faint)", fontWeight: 400 }}>/{c.cap}</span></span>
          <Bar value={c.n} max={c.cap} tone={c.n > c.cap ? "bad" : "accent"} />
          <Row wrap gap={4}><Badge tone="info">NCS {c.ncs}</Badge>{c.unpaid > 0 && <Badge tone="warn">{c.unpaid} unpaid</Badge>}</Row>
        </button>
      );
    }
    if (week === "mid") return <Sub>Midterm</Sub>;
    const bk = (idx().bookingsByDate.get(d) || []).filter(b => ids.includes(b.locationId) && b.session === row);
    const cap = capFor(s, ids, row), ncs = bk.filter(b => b.funding === "NCS").length, late = bk.filter(b => b.source === "Late request").length;
    const target = sel === "ALL" ? (locs.find(l => bk.some(b => b.locationId === l.id))?.id || locs[0]?.id) : sel;
    return (
      <button className="ros-focus ros-row-hover" onClick={() => target && nav("Bookings", "Registers", { regLoc: target, regDate: d, regSession: row })} style={{ ...cellBtn, outline: d === TODAY ? "1px solid var(--accent-line)" : undefined }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{bk.length}<span style={{ color: "var(--faint)", fontWeight: 400 }}>/{cap}</span></span>
        <Bar value={bk.length} max={cap} tone={bk.length > cap ? "bad" : bk.length >= cap * 0.92 ? "warn" : "accent"} />
        <Row wrap gap={4}><Badge tone="info">NCS {ncs}</Badge><Badge>Pvt {bk.length - ncs}</Badge>{late > 0 && <Badge tone="warn">+{late} late</Badge>}</Row>
      </button>
    );
  };
  return (
    <Page>
      <PageHead eyebrow="Bookings" title="Weekly Calendar" sub="Booked against places for each session. Tap a cell to open that register." />
      <Row wrap gap={10} style={{ marginBottom: 14 }}>
        <Seg size="sm" options={[["this", "This week · w/c 19 Oct"], ["mid", "Next week · Halloween midterm"]] as ["this" | "mid", string][]} value={week} onChange={setWeek} />
        <select aria-label="Location" className="ros-input" style={{ width: 220, height: 32 }} value={sel} onChange={e => setLoc(e.target.value)}>
          {locs.length > 1 && <option value="ALL">All locations in view</option>}
          {locs.map(l => <option key={l.id} value={l.id}>{l.short}</option>)}
        </select>
      </Row>
      {week === "mid" && <div style={{ marginBottom: 14 }}><Callout tone="info" title="Halloween midterm, 26 to 30 Oct">Schools are closed: no Morning club, After School or school runs. Camps run at Gorey and Canovee; counts come from camp registrations.</Callout></div>}
      <Card pad={false}>
        <div className="ros-scroll-x">
          <div style={{ minWidth: 820, display: "grid", gridTemplateColumns: "130px repeat(5,minmax(0,1fr))" }}>
            <div style={hd} />
            {days.map(d => <div key={d} style={{ ...hd, color: d === TODAY ? "var(--accent)" : "var(--faint)" }}>{fmtDay(d)}{d === TODAY ? " · today" : ""}</div>)}
            {rows.map(row => (
              <div key={row} style={{ display: "contents" }}>
                <div style={{ padding: "14px 16px", fontSize: 13, fontWeight: 600, borderTop: "1px solid var(--border)" }}>{row === "Full Day" ? "Full Day (EY)" : row}<div style={{ fontSize: 11, color: "var(--faint)", fontWeight: 400, marginTop: 3 }}>{row === "Morning" ? "07:30 to school" : row === "After School" ? "14:00 to 18:00" : row === "Full Day" ? "08:00 to 17:00" : "09:00 to 15:00"}</div></div>
                {days.map(d => <div key={d} style={{ padding: 8, borderTop: "1px solid var(--border)", borderLeft: "1px solid var(--border)" }}>{cell(row, d)}</div>)}
              </div>
            ))}
          </div>
        </div>
      </Card>
      <Row wrap gap={10} style={{ marginTop: 12 }}><Sub>NCS and private split by booking funding. Late = added through an approved late booking.</Sub></Row>
    </Page>
  );
}
const hd = { padding: "10px 12px", fontSize: 11.5, fontWeight: 500, color: "var(--faint)", background: "var(--surface-faint)" } as const;
const cellBtn = { width: "100%", minHeight: 78, display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch", textAlign: "left", padding: 8, borderRadius: 10, border: 0, background: "none", color: "var(--ink)", cursor: "pointer" } as const;

/* ---------------- Window Control ---------------- */
function WindowControl() {
  const { s } = useRos();
  const [sel, setSel] = useState<string>(s.windows.find(w => w.status === "Open")?.id || s.windows[0].id);
  const [q, setQ] = useState("");
  const [locF, setLocF] = useState("ALL");
  const w = s.windows.find(x => x.id === sel) || s.windows[0];
  const locs = scopedLocations(), ids = locs.map(l => l.id as string);
  const eligible = s.families.filter(f => ids.includes(f.locationId) && f.childIds.length);
  const subd = new Map(w.submissions.map(x => [x.familyId, x]));
  const byLoc = locs.map(l => { const fs = eligible.filter(f => f.locationId === l.id); const ok = fs.filter(f => !f.blocked); return { l, eligible: ok.length, sub: ok.filter(f => subd.has(f.id)).length, blocked: fs.length - ok.length }; });
  const subs = w.submissions.filter(x => ids.includes(familyOf(x.familyId)?.locationId || ""));
  const notSub = eligible.filter(f => !f.blocked && !subd.has(f.id) && (locF === "ALL" || f.locationId === locF) && (!q || f.surname.toLowerCase().includes(q.toLowerCase()) || f.id.toLowerCase().includes(q.toLowerCase())));
  const subLocs = new Set(subs.map(x => familyOf(x.familyId)!.locationId as string));
  const regCount = Array.from(subLocs).reduce((n, l) => n + 5 * (2 + s.rooms.filter(r => r.locationId === l && r.kind !== "SAC").length), 0);
  const manCount = s.routes.filter(r => subLocs.has(r.locationId)).length * 5;
  const est = subs.reduce((n, x) => { const f = familyOf(x.familyId)!, l = locById(f.locationId)!; const ey = f.childIds.some(id => idx().child.get(id)?.programme === "EY"); return n + x.hours * (ey ? l.eyDayRate / 9 : l.hourlyRate); }, 0);
  const left = minsUntil(w.closes, s.clockMin), opensIn = minsUntil(w.opens, s.clockMin);
  const au = (id: string) => s.automations.find(a => a.id === id);
  const ub = underbooked();
  const wcols: Col<BookingWindow>[] = [
    { key: "i", label: "Window", w: ".8fr", render: x => <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{x.id}</span> },
    { key: "l", label: "Week", w: "1.8fr", render: x => x.label },
    { key: "o", label: "Opens", w: "1fr", render: x => fmtDay(x.opens.slice(0, 10)) + " " + x.opens.slice(11) },
    { key: "c", label: "Closes", w: "1fr", render: x => fmtDay(x.closes.slice(0, 10)) + " " + x.closes.slice(11) },
    { key: "s", label: "Status", w: ".8fr", render: x => <Badge tone={x.status === "Open" ? "ok" : x.status === "Locked" ? "neutral" : "info"} dot={x.status === "Open"}>{x.status}</Badge> },
    { key: "n", label: "Submitted", w: ".8fr", align: "right", render: x => x.status === "Open" ? x.submissions.filter(y => ids.includes(familyOf(y.familyId)?.locationId || "")).length : x.status === "Locked" ? "Final" : "Not open" },
  ];
  return (
    <Page>
      <PageHead eyebrow="Bookings" title="Window Control" sub="Parents book the week ahead in a window that opens Monday 09:00 and closes Thursday 18:00. When it closes, bookings lock and invoices, registers and manifests are generated." />
      <Card pad={false} title="Booking windows">
        <Table rowKey={x => x.id} rows={s.windows} cols={wcols} minWidth={760} onRow={x => setSel(x.id)} rowTone={x => x.id === w.id ? "accent" : undefined} />
      </Card>
      <div style={{ marginTop: 16 }}>
        {w.status === "Open" ? (
          <>
            <Grid min={160} style={{ marginBottom: 16 }}>
              <Kpi label="Closes in" value={countdown(left)} sub={fmtDay(w.closes.slice(0, 10)) + " " + w.closes.slice(11)} tone={left < 1440 ? "warn" : undefined} big />
              <Kpi label="Families submitted" value={byLoc.reduce((n, x) => n + x.sub, 0) + " / " + byLoc.reduce((n, x) => n + x.eligible, 0)} />
              <Kpi label="Sessions submitted" value={subs.reduce((n, x) => n + x.sessions, 0)} sub={subs.reduce((n, x) => n + x.hours, 0) + " hours"} />
              <Kpi label="Booking-blocked" value={byLoc.reduce((n, x) => n + x.blocked, 0)} sub="Cannot book until cleared" tone="bad" />
              <Kpi label="NCS under-booked" value={ub.length} tone={ub.length ? "warn" : "ok"} onClick={() => nav("NCS", "Agreed Hours")} sub="Booked below agreed hours" />
            </Grid>
            <div className="ros-split">
              <Stack gap={14}>
                <Card title="Submitted by location">
                  <Stack gap={12}>{byLoc.map(x => <Meter key={x.l.id} label={x.l.short} value={x.sub} max={Math.max(1, x.eligible)} tone={x.eligible && x.sub / x.eligible < 0.5 ? "warn" : "ok"} hint={pct(x.eligible ? x.sub / x.eligible : 0)} />)}</Stack>
                </Card>
                <Card title={"Not yet submitted (" + notSub.length + ")"} pad={false}>
                  <Row wrap gap={8} style={{ padding: "0 18px 12px" }}><select className="ros-input" style={{ width: 170, height: 32 }} value={locF} onChange={e => setLocF(e.target.value)}><option value="ALL">All locations</option>{locs.map(l => <option key={l.id} value={l.id}>{l.short}</option>)}</select><Search value={q} onChange={setQ} placeholder="Family or ROS ID" width={200} /></Row>
                  <Table rowKey={f => f.id} rows={notSub} pageSize={12} minWidth={600} dense onRow={f => openRecord({ kind: "family", id: f.id })}
                    cols={[
                      { key: "f", label: "Family", w: "1.2fr", render: f => <Row gap={8}><RecLink r={{ kind: "family", id: f.id }} /><span>{f.surname}</span></Row> },
                      { key: "l", label: "Location", w: "1fr", render: f => locById(f.locationId)?.short },
                      { key: "k", label: "Children", w: ".6fr", align: "right", render: f => f.childIds.length },
                      { key: "fu", label: "Funding", w: ".7fr", render: f => <Badge tone={f.funding === "NCS" ? "info" : "neutral"}>{f.funding}</Badge> },
                      { key: "c", label: "Prefers", w: ".7fr", render: f => f.channel },
                    ]} />
                </Card>
              </Stack>
              <Stack gap={14}>
                <Card title="Reminders" sub="Sequences run by the Bookings agent. Sends are simulated.">
                  {["AU-02", "AU-03"].map(id => { const a = au(id); if (!a) return null; return (
                    <div key={id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                      <Row gap={8}><Stack><span style={{ fontSize: 13.5, fontWeight: 600 }}>{a.name}</span><Sub>{a.timing} · {a.channels.join(", ")} · {a.audience}</Sub></Stack><div style={{ flex: 1 }} /><StatusBadge s={a.on ? "Active" : "Paused"} /></Row>
                      <Row gap={8} wrap style={{ marginTop: 8 }}>
                        <Sub>Last run {a.runs[0] ? rel(a.runs[0].at) + " · " + a.runs[0].summary : "never"}</Sub>
                        <div style={{ flex: 1 }} />
                        <Btn size="sm" variant="primary" onClick={() => confirmThen({ title: "Run “" + a.name + "” now?", body: "Reminds the " + byLoc.reduce((n, x) => n + x.eligible - x.sub, 0) + " families who have not submitted, by " + a.channels.join(" and ") + ". Simulated: nobody is contacted.", confirmLabel: "Run reminder", run: () => runAutomation({ id }) })}>Run now</Btn>
                        <RecLink r={{ kind: "automation", id }} />
                      </Row>
                    </div>); })}
                </Card>
                <Card title="When the window closes" sub={"Preview only. Nothing is generated until " + fmtDay(w.closes.slice(0, 10)) + " " + w.closes.slice(11) + "."} right={<DemoTag>Preview</DemoTag>}>
                  <KV items={[["Invoices", subs.length + " families"], ["Registers", regCount + " (site × day × session)"], ["Bus manifests", manCount + " (routes × 5 days)"], ["Gross estimate", euro0(est) + " before NCS"]]} />
                  <div style={{ marginTop: 10 }}><Sub>Families who have not submitted get no bookings for that week; late requests are still possible with 24 hours' weekday notice.</Sub></div>
                </Card>
              </Stack>
            </div>
          </>
        ) : w.status === "Locked" ? (
          <Card title={w.label + " · locked"} tone="neutral">
            <Callout tone="neutral" title="Why it is locked">The window closed {fmtDay(w.closes.slice(0, 10))} at {w.closes.slice(11)}. Bookings, invoices, registers and manifests for this week are fixed. Changes now go through Late & Change Requests: at least 24 hours' notice on a weekday, checked for capacity and ratio, and approved by a person. Cancellations in a locked week are not refunded under the published fee terms.</Callout>
            <div style={{ marginTop: 12 }}>
              {w.weekOf === "2026-10-19"
                ? <KV items={[["Sessions booked", String(THIS_WEEK.reduce((n, d) => n + (idx().bookingsByDate.get(d) || []).filter(b => ids.includes(b.locationId)).length, 0))], ["Requests waiting", String(pendingRequests().length)], ["Approved since lock", String(s.requests.filter(r => r.status === "Approved" && ids.includes(r.locationId)).length)], ["Week", fmtDate(w.weekOf) + " to " + fmtDate(THIS_WEEK[4])]]} />
                : <KV items={[["Week", "Halloween midterm"], ["Term sessions", "None: schools closed"], ["Camp places held", String(s.campRegs.filter(r => r.status !== "Waitlist" && ids.includes(s.camps.find(c => c.id === r.campId)?.locationId || "")).length)], ["Bookings via", "Camps registrations"]]} />}
            </div>
            <Row style={{ marginTop: 12 }}><Btn onClick={() => nav("Bookings", "Late & Change Requests")}>Late & change requests</Btn>{w.weekOf !== "2026-10-19" && <Btn onClick={() => nav("Camps", "Registrations")}>Camp registrations</Btn>}</Row>
          </Card>
        ) : (
          <Card title={w.label + " · scheduled"}>
            <Callout tone="info" title={"Opens in " + countdown(opensIn)}>Opens {fmtDay(w.opens.slice(0, 10))} at {w.opens.slice(11)} and closes {fmtDay(w.closes.slice(0, 10))} at {w.closes.slice(11)}. “{au("AU-01")?.name}” tells every active family when it opens (simulated); reminders follow 24 hours and 2 hours before it closes.</Callout>
            <div style={{ marginTop: 12 }}><KV items={[["Families to notify", String(eligible.filter(f => !f.blocked).length)], ["Blocked from booking", String(eligible.filter(f => f.blocked).length)]]} /></div>
          </Card>
        )}
      </div>
    </Page>
  );
}

/* ---------------- Late & Change Requests ---------------- */
const KINDS: BookingRequest["kind"][] = ["Late booking", "Change", "Cancellation"];
function Requests() {
  const { s, ui } = useRos();
  const focus = ui.focus.requestId ? s.requests.find(r => r.id === ui.focus.requestId) : undefined;
  const [kind, setKind] = useState<BookingRequest["kind"]>(focus?.kind || "Late booking");
  const [show, setShow] = useState<"Pending" | "All">("Pending");
  const [selId, setSelId] = useState<string>(focus?.id || "");
  const all = s.requests.filter(r => inScope(r.locationId));
  const list = all.filter(r => r.kind === kind && (show === "All" || r.status === "Pending"))
    .sort((a, b) => (a.status === "Pending" ? 0 : 1) - (b.status === "Pending" ? 0 : 1) || (a.id === "LBR-006" ? -1 : b.id === "LBR-006" ? 1 : 0) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const sel = list.find(r => r.id === selId) || list[0];
  return (
    <Page>
      <PageHead eyebrow="Bookings" title="Late & Change Requests" sub="The Bookings agent checks notice, capacity, ratio and fees. A person approves or declines every one; approval writes the booking, invoice, register and manifest together." />
      <Row wrap gap={10} style={{ marginBottom: 14 }}>
        <Seg options={KINDS.map(k => [k, k + " · " + all.filter(r => r.kind === k && r.status === "Pending").length] as [BookingRequest["kind"], string])} value={kind} onChange={(k) => { setKind(k); setSelId(""); }} />
        <Seg size="sm" options={[["Pending", "Waiting"], ["All", "Include decided"]] as ["Pending" | "All", string][]} value={show} onChange={setShow} />
      </Row>
      <div className="ros-split-even">
        <Card title={kind === "Late booking" ? "Late bookings" : kind === "Change" ? "Changes" : "Cancellations"} sub={list.length + " shown"} pad={false}>
          <div style={{ padding: "0 6px 8px" }}>
            {list.length ? list.map(r => { const k = requestChecks(r.id); const c = idx().child.get(r.childId); const pass = (k.noticeOk || r.kind === "Cancellation") && k.capOk && k.ratioOk; return (
              <ListRow key={r.id} tone={sel?.id === r.id ? "accent" : undefined} onClick={() => setSelId(r.id)} lead={<Avatar name={childName(c)} size={30} />}
                title={<Row gap={6} wrap><span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{r.id}</span><span>{childName(c)}</span></Row>}
                sub={fmtDay(r.date) + " " + r.start + "–" + r.end + " · " + locById(r.locationId)?.short + (r.routeId ? " · " + r.routeId : "") + " · " + r.channel + " " + rel(r.received)}
                right={r.status === "Pending" ? <Badge tone={pass ? "ok" : "warn"}>{pass ? "Checks pass" : (!k.noticeOk && r.kind !== "Cancellation" ? "Short notice" : !k.capOk ? "Capacity" : "Ratio")}</Badge> : <StatusBadge s={r.status} />} />); })
              : <Empty title={"No " + kind.toLowerCase() + " requests waiting"} body="Decided requests stay in Activity. Switch to “Include decided” to see them." />}
          </div>
        </Card>
        <div>
          {sel ? <Card title={sel.id + " · " + sel.kind} sub={familyOf(sel.familyId)?.surname + " family · " + sel.familyId} right={<RecLink r={{ kind: "request", id: sel.id }}>Open in drawer</RecLink>}><RequestPanel id={sel.id} /></Card> : <Card><Empty title="Pick a request" /></Card>}
        </div>
      </div>
    </Page>
  );
}

/* ---------------- Registers (tablet kiosk) ---------------- */
function Registers() {
  const { s, ui, role } = useRos();
  const locs = scopedLocations();
  const initLoc = ui.focus.regLoc && locs.some(l => l.id === ui.focus.regLoc) ? ui.focus.regLoc : scopeLoc() !== "ALL" ? scopeLoc() : (locs.find(l => l.id === "HAZ") || locs[0])?.id || "HAZ";
  const [loc, setLoc] = useState<string>(initLoc);
  const L = locs.find(l => l.id === loc) || locs[0];
  const ey = L ? hasEY(s, L.id) : false;
  const [date, setDate] = useState<string>(ui.focus.regDate && THIS_WEEK.includes(ui.focus.regDate) ? ui.focus.regDate : TODAY);
  const [sess, setSess] = useState<Session>((ui.focus.regSession as Session) || (s.clockMin < toMin("13:45") ? "Full Day" : "After School"));
  const [q, setQ] = useState("");
  if (!L) return <Page><PageHead eyebrow="Bookings" title="Registers" /><Card><Empty title="No locations in view" /></Card></Page>;
  const session: Session = sess === "Full Day" && !ey ? "After School" : sess;
  const isToday = date === TODAY;
  const opensAt = session === "After School" ? toMin("13:45") : session === "Morning" ? toMin("07:15") : toMin("07:45");
  const open = isToday && s.clockMin >= opensAt;
  const rows = register(L.id, date, session).map(r => ({ ...r, st: sessStatus(r.child.id, date, session) }))
    .filter(r => !q || childName(r.child).toLowerCase().includes(q.toLowerCase()));
  const count = (st: SessStatus) => rows.filter(r => r.st.status === st).length;
  return (
    <Page>
      <PageHead eyebrow="Bookings · Kiosk" title={"Register · " + L.short} sub="Tablet register for the room or front door. Signing in and out updates the site dashboard and the parent app straight away. Collectors are checked against the child file." />
      <Row wrap gap={10} style={{ marginBottom: 12 }}>
        <select aria-label="Site" className="ros-input" style={{ width: 200, height: 34 }} value={L.id} onChange={e => setLoc(e.target.value)}>{locs.map(l => <option key={l.id} value={l.id}>{l.short}</option>)}</select>
        <Seg size="sm" options={THIS_WEEK.map(d => [d, fmtDay(d).slice(0, 3) + (d === TODAY ? " · today" : "")] as [string, string])} value={date} onChange={setDate} />
        <Seg size="sm" options={(ey ? TERM : TERM.filter(x => x !== "Full Day")).map(x => [x, x === "Full Day" ? "Early Years" : x] as [Session, string])} value={session} onChange={setSess} />
        <Search value={q} onChange={setQ} placeholder="Find a child" width={200} />
      </Row>
      <Grid min={130} style={{ marginBottom: 14 }}>
        <Kpi label="Booked" value={rows.length} />
        <Kpi label="Expected" value={count("Expected")} />
        <Kpi label="On the bus" value={count("On bus")} tone={count("On bus") ? "info" : undefined} />
        <Kpi label="Here now" value={count("Signed in")} tone="ok" />
        <Kpi label="Gone home" value={count("Signed out")} />
        <Kpi label="Absent / not present" value={count("Absent") + count("Not present")} tone={count("Not present") ? "bad" : undefined} />
      </Grid>
      {!isToday && <div style={{ marginBottom: 12 }}><Callout tone="neutral" title={date < TODAY ? "Past register" : "Future register"}>{date < TODAY ? "Read only. Attendance as recorded on the day." : "Read only until the day. Shows who is booked."}</Callout></div>}
      {isToday && !open && (
        <div style={{ marginBottom: 12 }}>
          <Callout tone="info" title={session + " opens at " + hm(opensAt)} right={session === "After School" ? <Btn size="sm" onClick={() => confirmThen({ title: "Advance demo to 14:45?", body: "Moves the demo clock to the afternoon so After School sign-in can be shown. Demo time only.", confirmLabel: "Advance to 14:45", run: advanceAfternoon })}>Advance to 14:45</Btn> : undefined}>
            It's {hm(s.clockMin)}. Children are in school, so nobody can be signed in yet.
          </Callout>
        </div>
      )}
      {isToday && session === "After School" && open && s.clockMin < 18 * 60 && (
        <Row style={{ marginBottom: 12 }}><Sub>Late collection is billed after 18:00 (next full hour, demo rule).</Sub><Btn size="sm" variant="subtle" onClick={() => confirmThen({ title: "Jump the demo clock to 18:10?", body: "Shows the late collection flow: anyone collected after 18:00 can be billed one extra hour. Demo time only; it cannot be moved back except by Undo or Reset.", confirmLabel: "Jump to 18:10", run: () => setClock({ min: 18 * 60 + 10 }) })}>Demo: jump to 18:10</Btn></Row>
      )}
      {rows.length ? (
        <Grid min={270} gap={12}>
          {rows.map(r => <KioskCard key={r.booking.id} b={r.booking} c={r.child} st={r.st} canAct={open} locShort={L.short} medical={role.medical} />)}
        </Grid>
      ) : <Card><Empty title="Nobody booked" body={"No " + session + " bookings at " + L.short + " on " + fmtDay(date) + "."} /></Card>}
    </Page>
  );
}

function KioskCard({ b, c, st, canAct, locShort, medical }: { b: Booking; c: Child; st: ReturnType<typeof sessStatus>; canAct: boolean; locShort: string; medical: boolean }) {
  const { s, role } = useRos();
  const [mode, setMode] = useState<"idle" | "out" | "absent">("idle");
  const [pick, setPick] = useState("");
  const [bill, setBill] = useState(true);
  const now = s.clockMin;
  const sel = c.collectors.find(x => x.name === pick);
  const late = b.session === "After School" && now > 18 * 60 ? now - 18 * 60 : 0;
  const arrive = st.status === "On bus" && b.routeId ? hm(baseArrivalMin(b.routeId, now)) : hm(now);
  const tone: Tone = st.status === "Signed in" ? "ok" : st.status === "Not present" ? "bad" : st.status === "On bus" ? "info" : st.status === "Absent" ? "neutral" : st.status === "Signed out" ? "neutral" : "warn";
  const big = { height: 46, fontSize: 14.5, flex: 1 } as const;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid " + (st.status === "Not present" ? "var(--bad)" : "var(--border)"), borderRadius: 18, padding: 14, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <Row gap={10}>
        <Avatar name={childName(c)} size={40} />
        <Stack>
          <span role="link" tabIndex={0} className="ros-link ros-focus" style={{ fontSize: 15, fontWeight: 600 }} onClick={() => openRecord({ kind: "child", id: c.id })} onKeyDown={e => { if (e.key === "Enter") openRecord({ kind: "child", id: c.id }); }}>{childName(c)}</span>
          <Sub>{c.programme === "EY" ? idx().room.get(c.roomId)?.name : c.schoolClass + " · " + schoolName(c.schoolId)} · {b.start}–{b.end}</Sub>
        </Stack>
      </Row>
      <Row wrap gap={6}>
        <Badge tone={tone} dot={st.status === "Not present"}>{st.status}{st.time ? " " + st.time : ""}</Badge>
        {b.routeId && <Badge tone="info">{b.routeId}</Badge>}
        {b.source === "Late request" && <Badge tone="warn">Late booking</Badge>}
        {medical && c.medical.length > 0 && <Badge tone={medTone(c)} title={c.medical.map(m => m.kind + ": " + m.detail).join("; ")}>{c.medical.map(m => m.kind).join(", ")}{c.medication ? " · meds" : ""}</Badge>}
        {c.collectors.some(x => !x.permitted) && <Badge tone="bad">Collector restriction</Badge>}
      </Row>
      {medical && c.medical.some(m => m.severity === "Severe") && <Callout tone="bad">{c.medical.filter(m => m.severity === "Severe").map(m => m.detail).join("; ")}</Callout>}
      {st.collector && st.status === "Signed out" && <Sub>Collected by {st.collector}</Sub>}

      {canAct && mode === "idle" && (
        <Row gap={8}>
          {(st.status === "Expected" || st.status === "On bus") && <Btn variant="primary" style={big} onClick={() => signIn({ childId: c.id, time: arrive, by: st.status === "On bus" ? locShort + " team" : role.person, routeId: st.status === "On bus" ? b.routeId : undefined })}>{st.status === "On bus" ? "Bus arrived · sign in" : "Sign in"} {arrive}</Btn>}
          {st.status === "Signed in" && <Btn variant="primary" style={big} onClick={() => { setMode("out"); setPick(""); }}>Sign out</Btn>}
          {st.status === "Expected" && <Btn style={{ ...big, flex: "none", padding: "0 14px" }} onClick={() => setMode("absent")}>Absent</Btn>}
        </Row>
      )}
      {canAct && mode === "absent" && (
        <Stack gap={8}>
          <Label>Reason</Label>
          <Row wrap gap={6}>{["Sick", "Family arrangement", "Collected from school by parent", "No reason given"].map(r => <Btn key={r} size="sm" onClick={() => { markAbsent({ childId: c.id, date: TODAY, session: b.session, reason: r }); setMode("idle"); }}>{r}</Btn>)}</Row>
          <Btn size="sm" variant="subtle" onClick={() => setMode("idle")}>Cancel</Btn>
        </Stack>
      )}
      {canAct && mode === "out" && (
        <Stack gap={8}>
          <Label>Who is collecting?</Label>
          {c.collectors.map(x => (
            <button key={x.name} className="ros-focus" onClick={() => setPick(x.name)} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 46, padding: "6px 10px", borderRadius: 12, cursor: "pointer", textAlign: "left", background: pick === x.name ? (x.permitted ? "var(--ok-soft)" : "var(--bad-soft)") : "var(--surface-2)", border: "1px solid " + (pick === x.name ? (x.permitted ? "var(--ok)" : "var(--bad)") : "var(--border)"), color: "var(--ink)" }}>
              <Avatar name={x.name} size={26} tone={x.permitted ? undefined : "var(--bad)"} />
              <Stack><span style={{ fontSize: 13.5 }}>{x.name}</span><Sub>{x.relation}{x.note && medical ? " · " + x.note : ""}</Sub></Stack>
              <div style={{ flex: 1 }} />
              <Badge tone={x.permitted ? "ok" : "bad"}>{x.permitted ? "Permitted" : "NOT permitted"}</Badge>
            </button>
          ))}
          <button className="ros-focus" onClick={() => setPick("__other")} style={{ minHeight: 40, padding: "6px 10px", borderRadius: 12, cursor: "pointer", textAlign: "left", background: pick === "__other" ? "var(--bad-soft)" : "var(--surface-2)", border: "1px solid " + (pick === "__other" ? "var(--bad)" : "var(--border)"), color: "var(--ink)", fontSize: 13 }}>Someone not on this list</button>
          {sel && !sel.permitted && <Callout tone="bad" title={"Do not release " + c.firstName}>{sel.name} is NOT permitted to collect.{sel.note ? " " + sel.note + "." : ""} Keep {c.firstName} inside and call the location manager.</Callout>}
          {pick === "__other" && <Callout tone="bad" title={"Do not release " + c.firstName}>This person is not on the authorised list. Phone a parent; they can add a collector in MyRosKids before release.</Callout>}
          {sel && sel.permitted && late > 0 && (
            <Row gap={10}><Toggle on={bill} onChange={() => setBill(!bill)} label="Bill late collection" /><span style={{ fontSize: 12.5 }}>Late collection: {late} min after 18:00. Bill one extra hour (€{locById(c.locationId)?.hourlyRate}, demo rule)</span></Row>
          )}
          <Row gap={8}>
            <Btn variant="primary" style={big} disabled={!sel || !sel.permitted} onClick={() => { if (sel) signOut({ childId: c.id, time: hm(now), by: role.person, collector: sel.name, lateMins: late && bill ? late : undefined }); setMode("idle"); }}>{sel && sel.permitted ? "Release to " + sel.name.split(" ")[0] + " · " + hm(now) : "Choose a permitted collector"}</Btn>
            <Btn variant="subtle" onClick={() => setMode("idle")}>Cancel</Btn>
          </Row>
        </Stack>
      )}
    </div>
  );
}

/* ---------------- Ratios ---------------- */
type RRow = { key: string; loc: Location; label: string; session: Session; roomId?: string; r: ReturnType<typeof ratioCheck>; issue?: Issue; finished: boolean };
function Ratios() {
  const { s } = useRos();
  const [when, setWhen] = useState<"today" | "tomorrow">("today");
  const [onlyShort, setOnlyShort] = useState(false);
  const date = when === "today" ? TODAY : TOMORROW;
  const locs = scopedLocations();
  const rows: RRow[] = [];
  for (const l of locs) {
    for (const session of ["Morning", "After School"] as Session[]) {
      const r = ratioCheck(l.id, date, session);
      if (!r.booked && !r.rostered) continue;
      rows.push({ key: l.id + session, loc: l, label: session, session, r, issue: s.issues.find(i => i.kind === "Ratio" && i.locationId === l.id && i.date === date && i.session === session), finished: date === TODAY && session === "Morning" && s.clockMin > toMin("09:15") });
    }
    for (const room of s.rooms.filter(x => x.locationId === l.id && x.kind !== "SAC")) {
      const r = ratioCheck(l.id, date, "Full Day", room.id);
      rows.push({ key: room.id, loc: l, label: room.name + " · " + room.kind, session: "Full Day", roomId: room.id, r, finished: false });
    }
  }
  const shown = rows.filter(x => !onlyShort || (!x.r.ok && !x.finished));
  const short = rows.filter(x => !x.r.ok && !x.finished);
  const alerts = ratioAlerts().filter(a => a.date === date);
  const cols: Col<RRow>[] = [
    { key: "l", label: "Site", w: "1fr", render: x => x.loc.short, sort: x => x.loc.short },
    { key: "s", label: "Session / room", w: "1.6fr", render: x => x.label },
    { key: "b", label: "Booked", w: ".6fr", align: "right", render: x => x.r.booked, sort: x => x.r.booked },
    { key: "q", label: "Ratio", w: ".6fr", align: "right", render: x => "1:" + x.r.ratio },
    { key: "r", label: "Rostered", w: ".7fr", align: "right", render: x => <span style={{ color: x.r.ok ? undefined : "var(--bad)", fontWeight: x.r.ok ? 400 : 600 }}>{x.r.rostered}</span> },
    { key: "n", label: "Required", w: ".7fr", align: "right", render: x => x.r.required },
    { key: "h", label: "Headroom", w: ".8fr", align: "right", render: x => x.r.ok ? Math.max(0, x.r.rostered * x.r.ratio - x.r.booked) + " places" : "", sort: x => x.r.rostered * x.r.ratio - x.r.booked },
    { key: "st", label: "Status", w: "1fr", render: x => x.finished ? <Badge>Finished</Badge> : x.r.ok ? <Badge tone="ok">Covered</Badge> : <Badge tone="bad" dot>Short {x.r.gap}</Badge>, sort: x => (x.r.ok ? 1 : 0) },
    { key: "a", label: "", w: "1fr", align: "right", render: x => !x.r.ok && !x.finished ? (x.issue ? <Btn size="sm" variant="danger" onClick={() => openRecord({ kind: "issue", id: x.issue!.id })}>Find cover</Btn> : <Btn size="sm" onClick={() => nav("Staff", "Absence & Relief")}>Staff rota</Btn>) : x.issue ? <RecLink r={{ kind: "issue", id: x.issue.id }} /> : null },
  ];
  return (
    <Page>
      <PageHead eyebrow="Bookings" title="Ratios" sub="Live and forecast staff-to-child ratios from bookings, the rota and absences." right={<DemoTag>Demo thresholds</DemoTag>} />
      <Callout tone="neutral" title="Demo configuration">School age 1:{s.config.sacRatio}, Crèche 1:5, Preschool junior 1:6, Preschool senior (ECCE) 1:8. Thresholds are configurable and illustrative. They are not an official legal verification of ratios or regulations.</Callout>
      <Row wrap gap={10} style={{ margin: "14px 0" }}>
        <Seg options={[["today", "Today · " + fmtDay(TODAY)], ["tomorrow", "Tomorrow · " + fmtDay(TOMORROW)]] as ["today" | "tomorrow", string][]} value={when} onChange={setWhen} />
        <Row gap={8}><Toggle on={onlyShort} onChange={() => setOnlyShort(!onlyShort)} label="Only short sessions" /><Sub>Only short sessions</Sub></Row>
      </Row>
      <Grid min={160} style={{ marginBottom: 16 }}>
        <Kpi label="Sessions checked" value={rows.length} />
        <Kpi label="Short of staff" value={short.length} tone={short.length ? "bad" : "ok"} />
        <Kpi label="Children covered" value={rows.filter(x => x.r.ok).reduce((n, x) => n + x.r.booked, 0)} sub={"of " + rows.reduce((n, x) => n + x.r.booked, 0) + " booked"} />
        <Kpi label="Staff rostered" value={rows.reduce((n, x) => n + x.r.rostered, 0)} sub={rows.reduce((n, x) => n + x.r.required, 0) + " required"} />
      </Grid>
      {alerts.filter(a => a.issue).map(a => (
        <div key={a.issue!.id} style={{ marginBottom: 12 }}>
          <Callout tone="bad" title={a.issue!.title} right={<Btn size="sm" variant="danger" onClick={() => openRecord({ kind: "issue", id: a.issue!.id })}>Open {a.issue!.id}</Btn>}>{a.issue!.detail}</Callout>
        </div>
      ))}
      <Card pad={false} title={"All sessions · " + fmtDay(date)}>
        <Table rowKey={x => x.key} rows={shown} cols={cols} minWidth={940} rowTone={x => !x.r.ok && !x.finished ? "bad" : undefined} empty="No short sessions" pageSize={40} />
      </Card>
    </Page>
  );
}

/* ---------------- Waitlists ---------------- */
function placeInfo(s: RosState, w: WaitlistEntry) {
  const offered = s.waitlist.filter(x => x.status === "Offered" && x.locationId === w.locationId && x.service === w.service && x.room === w.room).length;
  if (w.service === "SAC") {
    const l = locById(w.locationId)!;
    const peak = Math.max(0, ...THIS_WEEK.map(d => bookingsOn(d, l.id, "After School").length));
    const freed = s.requests.filter(r => r.kind === "Cancellation" && r.status === "Approved" && r.locationId === l.id).length;
    return { cap: l.sacCapacity, used: peak, free: Math.max(0, l.sacCapacity - peak - offered), freed, basis: "busiest After School day this week" };
  }
  const room = s.rooms.find(r => r.locationId === w.locationId && r.kind === w.room);
  const enrolled = room ? s.children.filter(c => c.roomId === room.id).length : 0;
  const cap = room?.capacity || 0;
  return { cap, used: enrolled, free: Math.max(0, cap - enrolled - offered), freed: 0, basis: (room?.name || w.room) + " enrolment" };
}
const PRI: Record<WaitlistEntry["priority"], number> = { Sibling: 0, Staff: 1, Standard: 2 };
function Waitlists() {
  const { s } = useRos();
  const [svc, setSvc] = useState<"All" | "Early Years" | "SAC">("All");
  const [st, setSt] = useState<"Open" | "All">("Open");
  const list = s.waitlist.filter(w => inScope(w.locationId) && (svc === "All" || w.service === svc) && (st === "All" || w.status === "Waiting" || w.status === "Offered"));
  const pool = (w: WaitlistEntry) => s.waitlist.filter(x => x.status === "Waiting" && x.locationId === w.locationId && x.service === w.service && x.room === w.room).sort((a, b) => PRI[a.priority] - PRI[b.priority] || a.added.localeCompare(b.added));
  const rows = list.slice().sort((a, b) => a.locationId.localeCompare(b.locationId) || a.room.localeCompare(b.room) || PRI[a.priority] - PRI[b.priority] || a.added.localeCompare(b.added));
  const freeNow = new Map<string, number>();
  for (const w of s.waitlist.filter(x => inScope(x.locationId))) freeNow.set(w.locationId + w.room, placeInfo(s, w).free);
  const cols: Col<WaitlistEntry>[] = [
    { key: "c", label: "Child", w: "1.3fr", render: w => <Stack><RecLink mono={false} r={{ kind: "waitlist", id: w.id }}>{w.childName}</RecLink><Sub>{w.parent}</Sub></Stack>, sort: w => w.childName },
    { key: "l", label: "Site", w: ".9fr", render: w => locById(w.locationId)?.short, sort: w => w.locationId },
    { key: "r", label: "Wants", w: "1.4fr", render: w => <Stack><span>{w.room}</span><Sub>{w.days} · from {fmtDate(w.requestedStart)}</Sub></Stack> },
    { key: "p", label: "Priority", w: ".8fr", render: w => <Badge tone={w.priority === "Sibling" ? "info" : w.priority === "Staff" ? "accent" : "neutral"}>{w.priority}</Badge>, sort: w => PRI[w.priority] },
    { key: "a", label: "Waiting", w: ".7fr", align: "right", render: w => daysBetween(w.added, TODAY) + " days", sort: w => -daysBetween(w.added, TODAY) },
    { key: "sp", label: "Space", w: "1fr", render: w => { const p = placeInfo(s, w); return <Stack><Badge tone={p.free ? "ok" : "neutral"}>{p.free ? p.free + " free" : "Full"}</Badge>{p.freed > 0 && <Sub>{p.freed} freed by cancellation</Sub>}</Stack>; } },
    { key: "s", label: "Status", w: ".8fr", render: w => <StatusBadge s={w.status} /> },
    { key: "x", label: "", w: "1.4fr", align: "right", render: w => {
      if (w.status === "Offered") return <Row gap={6}><Btn size="sm" variant="ok" onClick={() => respondWaitlist({ id: w.id, accepted: true })}>Accepted</Btn><Btn size="sm" variant="subtle" onClick={() => respondWaitlist({ id: w.id, accepted: false })}>Declined</Btn></Row>;
      if (w.status !== "Waiting") return null;
      const p = placeInfo(s, w), rank = pool(w).findIndex(x => x.id === w.id);
      const can = p.free > 0 && rank >= 0 && rank < p.free;
      return <Btn size="sm" variant={can ? "primary" : "ghost"} disabled={!can} title={!p.free ? "No space: capacity is full" : !can ? "Someone is ahead in the queue" : undefined}
        onClick={() => confirmThen({ title: "Offer a place to " + w.childName + "?", body: w.room + " at " + locById(w.locationId)?.short + ", from " + fmtDate(w.requestedStart) + ". " + p.free + " place" + (p.free === 1 ? "" : "s") + " free (" + p.basis + "). The offer is held 48 hours; the message to " + w.parent + " is simulated.", confirmLabel: "Offer place", run: () => offerWaitlist({ id: w.id, note: p.free + " free on " + p.basis + (p.freed ? "; " + p.freed + " freed by cancellation" : "") + "." }) })}>{can ? "Offer space" : p.free ? "In queue" : "No space"}</Btn>;
    } },
  ];
  return (
    <Page>
      <PageHead eyebrow="Bookings" title="Waitlists" sub="Places are offered in order: siblings, then staff, then date added. An offer is only possible where capacity exists, including places freed by an approved cancellation." />
      <Grid min={150} style={{ marginBottom: 16 }}>
        <Kpi label="Waiting" value={s.waitlist.filter(w => inScope(w.locationId) && w.status === "Waiting").length} />
        <Kpi label="Offers out" value={s.waitlist.filter(w => inScope(w.locationId) && w.status === "Offered").length} tone="warn" />
        <Kpi label="Siblings waiting" value={s.waitlist.filter(w => inScope(w.locationId) && w.status === "Waiting" && w.priority === "Sibling").length} />
        <Kpi label="Pools with space" value={Array.from(freeNow.values()).filter(n => n > 0).length + " / " + freeNow.size} tone="ok" />
      </Grid>
      <Row wrap gap={10} style={{ marginBottom: 12 }}>
        <Seg size="sm" options={["All", "Early Years", "SAC"] as ("All" | "Early Years" | "SAC")[]} value={svc} onChange={setSvc} />
        <Seg size="sm" options={[["Open", "Waiting and offered"], ["All", "Include closed"]] as ["Open" | "All", string][]} value={st} onChange={setSt} />
      </Row>
      <Card pad={false}>
        <Table rowKey={w => w.id} rows={rows} cols={cols} minWidth={1000} empty="Nobody on the waitlist here" rowTone={w => w.status === "Offered" ? "warn" : undefined} />
      </Card>
      <div style={{ marginTop: 12 }}><Sub>Early Years space = room capacity less enrolled children. School age space = places less the busiest After School day this week. Offers already out are held against the count.</Sub></div>
    </Page>
  );
}

export default function Bookings({ tab }: { tab: string }) {
  useRos();
  switch (tab) {
    case "Weekly Calendar": return <Calendar />;
    case "Window Control": return <WindowControl />;
    case "Late & Change Requests": return <Requests />;
    case "Registers": return <Registers />;
    case "Ratios": return <Ratios />;
    case "Waitlists": return <Waitlists />;
    default: return <Overview />;
  }
}
