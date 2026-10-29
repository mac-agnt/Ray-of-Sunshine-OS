/* Camps. Halloween camps run at Gorey and Canovee during midterm (26–30 Oct),
   so nothing here is running today. Fill, revenue forecasts, registers and
   excursion manifests all derive from camps and registrations; day rates are
   demo figures, not quoted fees. */
import { useState } from "react";
import type { Camp, CampRegistration, ISODate, LocationId } from "../types";
import { useRos, nav, openRecord, confirmThen, defineAction } from "../store";
import { idx, inScope, scopedLocations, locById, child as childOf, family as familyOf, childName, staffById, certStatus } from "../selectors";
import { TODAY, addDays, daysBetween, dow, fmtDay, fmtDate, euro0, pct } from "../time";
import {
  Page, PageHead, Card, Kpi, Grid, Table, Badge, StatusBadge, Btn, RecLink, HBars, Columns, Meter, KV, Callout, Seg,
  Search, ListRow, DemoTag, Empty, Avatar, Row, Stack, Sub, Label, Field, Toggle, type Col,
} from "../ui";

/* ---------------- shared helpers (Bookings reads these too) ---------------- */
type CampX = Camp & { consentsRequired?: string[] };
const hash = (str: string) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
/** Weekdays a camp runs. */
export function campDates(c: Camp): ISODate[] {
  const out: ISODate[] = [];
  for (let d = c.start, n = 0; d <= c.end && n < 70; d = addDays(d, 1), n++) if (dow(d) !== "Sat" && dow(d) !== "Sun") out.push(d);
  return out;
}
/** The days a registration attends: all of them for a full week, otherwise a fixed consecutive block. */
export function campAttendDays(reg: CampRegistration, c: Camp): ISODate[] {
  const dates = campDates(c);
  if (!dates.length) return [];
  if (reg.days >= dates.length) return dates;
  const start = hash(reg.id) % dates.length;
  const out: ISODate[] = [];
  for (let k = 0; k < reg.days; k++) out.push(dates[(start + k) % dates.length]);
  return out.sort();
}
const isPast = (c: Camp) => !!c.past || c.end < TODAY;
const activeRegs = (regs: CampRegistration[]) => regs.filter(r => r.status === "Confirmed" || r.status === "Pending payment");
const forecast = (c: Camp, regs: CampRegistration[]) => regs.filter(r => r.status === "Confirmed").reduce((n, r) => n + Math.min(r.days, campDates(c).length) * c.dayRate, 0);
const EXCURSION_RATIO = 8; // demo: one adult per eight children off site (illustrative)

/* ---------------- actions ---------------- */
export const createCamp = defineAction<{
  name: string; locationId: LocationId; start: string; end: string; ages: string; themes: string[]; capacity: number; dayRate: number;
  ncsEligible: boolean; consents: string[]; excursion?: { day: string; where: string };
}>("camps.create", (s, p, ctx) => {
  const camp: CampX = {
    id: ctx.id("CMP"), name: p.name, locationId: p.locationId, start: p.start, end: p.end, ages: p.ages, themes: p.themes, capacity: p.capacity,
    dayRate: p.dayRate, ncsEligible: p.ncsEligible, staffIds: [], season: (p.start.slice(5, 7) === "02" ? "February midterm " : p.start.slice(5, 7) <= "04" ? "Easter " : p.start.slice(5, 7) <= "08" ? "Summer " : "Autumn ") + p.start.slice(0, 4),
    excursion: p.excursion ? { day: p.excursion.day, where: p.excursion.where, consentNeeded: p.consents.includes("Outings") } : undefined,
    consentsRequired: p.consents,
  };
  s.camps.push(camp);
  const l = s.locations.find(x => x.id === p.locationId);
  ctx.log({ category: "Enrolment", title: "Camp created: " + p.name, detail: (l?.short || p.locationId) + " · " + fmtDate(p.start) + " to " + fmtDate(p.end) + " · " + p.capacity + " places · €" + p.dayRate + "/day (demo) · consents: " + (p.consents.join(", ") || "none"), link: { kind: "camp", id: camp.id }, locationId: p.locationId });
  ctx.agent("camps", "New camp " + camp.id + " set up by " + ctx.actor + "; registrations open in draft", "action", { kind: "camp", id: camp.id });
}, { toast: () => "Camp created. It now appears in Overview, Registrations and Performance.", undo: true });

export const markPaid = defineAction<{ regId: string }>("camps.markPaid", (s, p, ctx) => {
  const r = s.campRegs.find(x => x.id === p.regId); if (!r || r.paid) return;
  const c = s.camps.find(x => x.id === r.campId)!, k = s.children.find(x => x.id === r.childId)!;
  r.paid = true; r.status = "Confirmed";
  ctx.comm(r.familyId, "App", "in", "Camp payment received for " + k.firstName + " · " + c.name + " (simulated, no card charged)", "Payments");
  ctx.log({ category: "Financial", title: "Camp place paid: " + k.firstName + " " + k.surname, detail: c.name + " · " + r.days + " days × €" + c.dayRate + " (demo). Simulated payment; place confirmed.", link: { kind: "camp", id: c.id }, locationId: c.locationId });
}, { toast: () => "Marked paid (simulated). Place confirmed.", undo: true });

export const addReg = defineAction<{ campId: string; childId: string; days: number }>("camps.addReg", (s, p, ctx) => {
  const c = s.camps.find(x => x.id === p.campId), k = s.children.find(x => x.id === p.childId);
  if (!c || !k || s.campRegs.some(r => r.campId === c.id && r.childId === k.id)) return;
  const held = s.campRegs.filter(r => r.campId === c.id && (r.status === "Confirmed" || r.status === "Pending payment")).length;
  const f = s.families.find(x => x.id === k.familyId)!;
  const status: CampRegistration["status"] = held >= c.capacity ? "Waitlist" : "Pending payment";
  s.campRegs.push({ id: ctx.id("CR"), campId: c.id, childId: k.id, familyId: f.id, days: p.days, paid: false, ncsHours: 0, status });
  ctx.comm(f.id, "App", "out", status === "Waitlist" ? k.firstName + " added to the " + c.name + " waitlist (simulated)" : c.name + ": place held for " + k.firstName + " for 72 hours pending payment (simulated)", ctx.actor);
  ctx.log({ category: "Enrolment", title: "Camp registration: " + k.firstName + " " + k.surname, detail: c.name + " · " + p.days + " days · " + status + (f.funding === "NCS" ? " · NCS family, camp hours to be confirmed" : ""), link: { kind: "camp", id: c.id }, locationId: c.locationId });
}, { toast: () => "Registration added.", undo: true });

export const offerPlace = defineAction<{ regId: string }>("camps.offer", (s, p, ctx) => {
  const r = s.campRegs.find(x => x.id === p.regId); if (!r || r.status !== "Waitlist") return;
  const c = s.camps.find(x => x.id === r.campId)!, k = s.children.find(x => x.id === r.childId)!;
  r.status = "Pending payment";
  ctx.comm(r.familyId, "App", "out", "A place opened on " + c.name + " for " + k.firstName + ". Held 72 hours pending payment (simulated)", ctx.actor);
  ctx.log({ category: "Enrolment", title: "Camp place offered: " + k.firstName + " " + k.surname, detail: c.name + " · moved from waitlist to pending payment.", link: { kind: "camp", id: c.id }, locationId: c.locationId });
}, { toast: () => "Place offered. Held pending payment.", undo: true });

export const releasePlace = defineAction<{ regId: string }>("camps.release", (s, p, ctx) => {
  const i = s.campRegs.findIndex(x => x.id === p.regId); if (i < 0) return;
  const r = s.campRegs[i], c = s.camps.find(x => x.id === r.campId)!, k = s.children.find(x => x.id === r.childId)!;
  if (r.paid) return;
  s.campRegs.splice(i, 1);
  ctx.comm(r.familyId, "App", "out", "Unpaid place on " + c.name + " for " + k.firstName + " released after the 72-hour hold (simulated)", ctx.actor);
  ctx.log({ category: "Enrolment", title: "Unpaid camp place released", detail: k.firstName + " " + k.surname + " · " + c.name + ". Released by " + ctx.actor + " (manager decision).", link: { kind: "camp", id: c.id }, locationId: c.locationId });
}, { toast: () => "Place released. Capacity freed for the waitlist.", undo: true });

export const assignStaff = defineAction<{ campId: string; staffId: string }>("camps.assignStaff", (s, p, ctx) => {
  const c = s.camps.find(x => x.id === p.campId), st = s.staff.find(x => x.id === p.staffId);
  if (!c || !st || c.staffIds.includes(st.id)) return;
  if (st.certs.some(x => x.kind === "Garda vetting" && x.expires < TODAY)) return;
  c.staffIds.push(st.id);
  ctx.log({ category: "Staffing", title: "Camp staff assigned: " + st.name, detail: c.name + " · " + fmtDate(c.start) + " to " + fmtDate(c.end) + ". Now " + c.staffIds.length + " assigned.", link: { kind: "camp", id: c.id }, locationId: c.locationId });
}, { toast: () => "Assigned to the camp.", undo: true });

export const chaseConsents = defineAction<{ campId: string }>("camps.chaseConsents", (s, p, ctx) => {
  const c = s.camps.find(x => x.id === p.campId); if (!c || !c.excursion) return;
  const ex = c.excursion;
  const missing = s.campRegs.filter(r => r.campId === c.id && (r.status === "Confirmed" || r.status === "Pending payment") && campAttendDays(r, c).includes(ex.day))
    .map(r => s.children.find(k => k.id === r.childId)!).filter(k => k && !k.consents.outings);
  if (!missing.length) return;
  const title = "Collect outing consents: " + c.name + " (" + missing.length + ")";
  if (s.tasks.some(t => t.title === title && t.status !== "Done")) return;
  for (const k of missing) ctx.comm(k.familyId, "App", "out", "Outing consent needed for " + k.firstName + ": " + ex.where + " on " + fmtDay(ex.day) + " (simulated request)", "Camps agent");
  const l = s.locations.find(x => x.id === c.locationId)!;
  s.tasks.push({ id: ctx.id("TSK"), title, owner: s.staff.find(x => x.id === l.managerId)?.name || ctx.actor, due: fmtDay(addDays(ex.day, -2)), dueDate: addDays(ex.day, -2), priority: "High", department: "Operations", status: "Not started", link: { kind: "camp", id: c.id }, source: "Camps agent", locationId: c.locationId });
  ctx.log({ category: "Safeguarding", title: "Outing consents chased: " + c.name, detail: missing.map(k => k.firstName + " " + k.surname).join(", ") + ". Families asked in MyRosKids (simulated); task raised for the location manager.", link: { kind: "camp", id: c.id }, locationId: c.locationId });
}, { toast: () => "Consent requests logged (simulated) and a task raised." });

export const consentReceived = defineAction<{ childId: string; campId: string }>("camps.consentIn", (s, p, ctx) => {
  const k = s.children.find(x => x.id === p.childId), c = s.camps.find(x => x.id === p.campId);
  if (!k || !c || k.consents.outings) return;
  k.consents.outings = true;
  ctx.comm(k.familyId, "App", "in", "Outing consent signed for " + k.firstName + " (demo e-sign)", "Parent");
  ctx.log({ category: "Safeguarding", title: "Outing consent received: " + k.firstName + " " + k.surname, detail: "For " + c.name + (c.excursion ? " · " + c.excursion.where : "") + ". Recorded by " + ctx.actor + ".", link: { kind: "child", id: k.id }, locationId: c.locationId });
}, { toast: () => "Consent recorded on the child file." });

/* ---------------- shared pieces ---------------- */
function useCamps() {
  const { s } = useRos();
  const camps = (s.camps as CampX[]).filter(c => inScope(c.locationId));
  return { upcoming: camps.filter(c => !isPast(c)).sort((a, b) => a.start.localeCompare(b.start)), past: camps.filter(isPast), all: camps };
}
function CampPicker({ camps, value, onChange }: { camps: Camp[]; value: string; onChange: (v: string) => void }) {
  if (camps.length < 2) return null;
  return <Seg size="sm" options={camps.map(c => [c.id, c.name.replace("Halloween Camp · ", "Halloween · ")] as [string, string])} value={value} onChange={onChange} />;
}
function usePicked(camps: Camp[]) {
  const { ui } = useRos();
  const [id, setId] = useState<string>(ui.focus.campId || "");
  const camp = camps.find(c => c.id === id) || camps.find(c => c.id === ui.focus.campId) || camps[0];
  return { camp, setId };
}
const NoCamps = () => <Card><Empty title="No camps at this location" body="Camps run at Gorey and Canovee. Switch the location filter, or create one in Camp Builder." action={<Btn onClick={() => nav("Camps", "Camp Builder")}>Open Camp Builder</Btn>} /></Card>;

/* ---------------- Overview ---------------- */
function Overview() {
  const { s, role } = useRos();
  const { upcoming } = useCamps();
  const regsOf = (c: Camp) => s.campRegs.filter(r => r.campId === c.id);
  const totals = upcoming.reduce((a, c) => { const r = regsOf(c); return { cap: a.cap + c.capacity, conf: a.conf + r.filter(x => x.status === "Confirmed").length, unpaid: a.unpaid + r.filter(x => x.status === "Pending payment").length, wait: a.wait + r.filter(x => x.status === "Waitlist").length, rev: a.rev + forecast(c, r) }; }, { cap: 0, conf: 0, unpaid: 0, wait: 0, rev: 0 });
  const ncsEx = upcoming.flatMap(c => regsOf(c).filter(r => r.status !== "Waitlist").map(r => {
    const f = familyOf(r.familyId)!, aw = idx().awardByChild.get(r.childId);
    if (f.funding !== "NCS") return null;
    if (r.ncsHours > 0 && (!aw || aw.expires < c.end)) return { r, c, tone: "bad" as const, why: aw ? "CHICK expires " + fmtDate(aw.expires) + ", before the camp ends. Hours would be charged privately unless renewed." : "No award on file for this child." };
    if (r.ncsHours === 0) return { r, c, tone: "warn" as const, why: "NCS family with no camp hours set. Confirm whether agreed hours should cover camp days." };
    return null;
  }).filter(Boolean)) as { r: CampRegistration; c: Camp; tone: "bad" | "warn"; why: string }[];
  const start = upcoming[0]?.start;
  if (!upcoming.length) return <Page><PageHead eyebrow="Camps" title="Overview" /><NoCamps /></Page>;
  return (
    <Page>
      <PageHead eyebrow="Camps" title="Halloween camps next week" sub={"Not running today. Camps run Mon 26 to Fri 30 Oct during the Halloween midterm; there are no school runs that week. " + (start ? daysBetween(TODAY, start) + " days to go." : "")} right={<DemoTag>Demo day rates</DemoTag>} />
      <Grid min={160} style={{ marginBottom: 16 }}>
        <Kpi label="Confirmed places" value={totals.conf + " / " + totals.cap} sub={pct(totals.cap ? totals.conf / totals.cap : 0) + " full"} onClick={() => nav("Camps", "Registrations")} />
        <Kpi label="Pending payment" value={totals.unpaid} tone={totals.unpaid ? "warn" : "ok"} sub="Held 72h, then released" onClick={() => nav("Camps", "Registrations")} />
        <Kpi label="Waitlist" value={totals.wait} sub="Offered as places free up" />
        <Kpi label="Revenue forecast" value={role.finance ? euro0(totals.rev) : "Restricted"} sub="Confirmed × days × day rate (demo)" />
        <Kpi label="NCS camp-hour checks" value={ncsEx.length} tone={ncsEx.some(x => x.tone === "bad") ? "bad" : ncsEx.length ? "warn" : "ok"} sub="Need NCS team review" />
      </Grid>
      <div className="ros-split">
        <Stack gap={14}>
          {upcoming.map(c => {
            const r = regsOf(c), conf = r.filter(x => x.status === "Confirmed").length, pend = r.filter(x => x.status === "Pending payment").length;
            const req = Math.ceil(Math.max(0, ...campDates(c).map(d => activeRegs(r).filter(x => campAttendDays(x, c).includes(d)).length)) / s.config.sacRatio);
            return (
              <Card key={c.id} title={c.name} sub={locById(c.locationId)?.name + " · " + fmtDay(c.start) + " to " + fmtDay(c.end) + " · ages " + c.ages}
                right={<><Badge tone="info">Starts in {daysBetween(TODAY, c.start)} days</Badge><RecLink r={{ kind: "camp", id: c.id }} /></>}>
                <Meter label="Confirmed" value={conf} max={c.capacity} hint={pend ? "+" + pend + " pending" : undefined} />
                <div style={{ marginTop: 12 }}>
                  <KV cols={3} items={[["Unpaid", String(pend)], ["Waitlist", String(r.filter(x => x.status === "Waitlist").length)], ["Forecast", role.finance ? euro0(forecast(c, r)) : "Restricted"], ["Day rate", "€" + c.dayRate + " (demo)"], ["Staff", c.staffIds.length + " of " + req + " needed"], ["NCS", c.ncsEligible ? "Eligible hours apply" : "Private only"]]} />
                </div>
                <Row wrap style={{ marginTop: 12 }}>{c.themes.map(t => <Badge key={t}>{t}</Badge>)}{c.excursion && <Badge tone="warn">Outing {fmtDay(c.excursion.day)} · {c.excursion.where}</Badge>}</Row>
                <Row wrap style={{ marginTop: 12 }}>
                  <Btn size="sm" variant="primary" onClick={() => nav("Camps", "Registrations", { campId: c.id })}>Registrations</Btn>
                  <Btn size="sm" onClick={() => nav("Camps", "Staff & Registers", { campId: c.id })}>Staff and registers</Btn>
                  {c.excursion && <Btn size="sm" onClick={() => nav("Camps", "Excursions", { campId: c.id })}>Excursion</Btn>}
                </Row>
              </Card>
            );
          })}
        </Stack>
        <Stack gap={14}>
          <Card title="NCS camp-hour exceptions" sub="Programme rules and Ray of Sunshine policy are separate. A person decides any private charge.">
            {ncsEx.length ? ncsEx.slice(0, 10).map(x => { const k = childOf(x.r.childId)!; return <ListRow key={x.r.id} tone={x.tone} onClick={() => openRecord({ kind: "family", id: x.r.familyId })} title={childName(k) + " · " + x.c.name.replace("Halloween Camp · ", "")} sub={x.why} right={<RecLink r={{ kind: "family", id: x.r.familyId }} />} />; }) : <Empty title="No NCS exceptions" />}
            {ncsEx.length > 10 && <Sub>+{ncsEx.length - 10} more in Registrations.</Sub>}
            <div style={{ marginTop: 10 }}><Btn size="sm" onClick={() => nav("NCS", "Agreed Hours")}>Open NCS agreed hours</Btn></div>
          </Card>
          <Card title="Camps agent" sub="Watches fill, unpaid places, registers and consents. Releasing a place needs a manager.">
            {s.agentActions.filter(a => a.agentId === "camps").slice(-4).reverse().map(a => <ListRow key={a.id} title={a.text} sub={a.at.slice(11) + " · " + fmtDay(a.at.slice(0, 10))} />)}
          </Card>
        </Stack>
      </div>
    </Page>
  );
}

/* ---------------- Camp Builder ---------------- */
const THEMES = ["Six Bricks LEGO", "LEGO coding", "Sports", "Outings", "Arts and crafts", "Nature trail", "Spooky science", "Drama and music"];
const CONSENTS = ["Outings", "Photos", "Sunscreen", "Transport"];
function Builder() {
  const { s, role } = useRos();
  const locs = scopedLocations();
  const def = (locs.find(l => l.id === "GOR") || locs[0]);
  const [f, setF] = useState({ name: "February Midterm Camp · " + (def?.short || ""), loc: (def?.id || "GOR") as LocationId, start: "2027-02-15", end: "2027-02-19", ages: "5–12", capacity: 24, dayRate: 38, ncs: true });
  const [themes, setThemes] = useState<string[]>(["Six Bricks LEGO", "Sports"]);
  const [consents, setConsents] = useState<string[]>(["Outings", "Photos"]);
  const [exOn, setExOn] = useState(true);
  const [ex, setEx] = useState({ day: "2027-02-17", where: "Courtown Woods nature walk" });
  const set = (patch: Partial<typeof f>) => setF(x => ({ ...x, ...patch }));
  const tog = (list: string[], v: string, fn: (x: string[]) => void) => fn(list.includes(v) ? list.filter(x => x !== v) : list.concat(v));
  const draft: Camp = { id: "preview", name: f.name, locationId: f.loc, start: f.start, end: f.end, ages: f.ages, themes, capacity: f.capacity, dayRate: f.dayRate, ncsEligible: f.ncs, staffIds: [], season: "" };
  const days = f.start && f.end && f.start <= f.end ? campDates(draft).length : 0;
  const errors = [
    !f.name.trim() && "Give the camp a name.",
    (!f.start || !f.end || f.start > f.end) && "End date must be on or after the start date.",
    f.start && f.start <= TODAY && "Start date must be in the future.",
    !days && "The dates must include at least one weekday.",
    (f.capacity < 1 || f.capacity > 80) && "Capacity must be between 1 and 80.",
    (f.dayRate < 10 || f.dayRate > 90) && "Day rate must be between €10 and €90 (demo).",
    exOn && (!ex.where.trim() || ex.day < f.start || ex.day > f.end) && "The outing day must fall within the camp dates.",
    !themes.length && "Pick at least one theme.",
  ].filter(Boolean) as string[];
  const created = (s.camps as CampX[]).filter(c => /^CMP-\d+$/.test(c.id) && inScope(c.locationId));
  const create = () => confirmThen({
    title: "Create " + f.name + "?", body: "Adds the camp to " + locById(f.loc)?.short + " with " + f.capacity + " places over " + days + " days at €" + f.dayRate + "/day (demo). It appears in every camp list straight away; no families are contacted.", confirmLabel: "Create camp",
    run: () => createCamp({ name: f.name.trim(), locationId: f.loc, start: f.start, end: f.end, ages: f.ages, themes, capacity: f.capacity, dayRate: f.dayRate, ncsEligible: f.ncs, consents, excursion: exOn ? ex : undefined }),
  });
  if (!locs.length) return <Page><PageHead eyebrow="Camps" title="Camp Builder" /><NoCamps /></Page>;
  return (
    <Page>
      <PageHead eyebrow="Camps" title="Camp Builder" sub="Set up a camp once: dates, themes, capacity, demo day rate, NCS label and the consents parents must give. Registers, excursion manifests and the revenue forecast follow from it." />
      <div className="ros-split">
        <Card title="New camp">
          <div style={{ display: "grid", gap: 14 }}>
            <Field label="Camp name"><input className="ros-input" value={f.name} onChange={e => set({ name: e.target.value })} /></Field>
            <Grid min={160} gap={12}>
              <Field label="Site"><select className="ros-input" value={f.loc} onChange={e => set({ loc: e.target.value as LocationId })}>{locs.map(l => <option key={l.id} value={l.id}>{l.short}</option>)}</select></Field>
              <Field label="Ages"><input className="ros-input" value={f.ages} onChange={e => set({ ages: e.target.value })} /></Field>
              <Field label="Starts"><input type="date" className="ros-input" value={f.start} onChange={e => set({ start: e.target.value })} /></Field>
              <Field label="Ends"><input type="date" className="ros-input" value={f.end} onChange={e => set({ end: e.target.value })} /></Field>
              <Field label="Capacity (places per day)"><input type="number" min={1} max={80} className="ros-input" value={f.capacity} onChange={e => set({ capacity: +e.target.value })} /></Field>
              <Field label="Day rate (€, demo)" hint="Illustrative, not a quoted fee"><input type="number" min={10} max={90} className="ros-input" value={f.dayRate} onChange={e => set({ dayRate: +e.target.value })} /></Field>
            </Grid>
            <div>
              <Label style={{ marginBottom: 8 }}>Themes</Label>
              <Row wrap>{THEMES.map(t => <Btn key={t} size="sm" variant={themes.includes(t) ? "primary" : "ghost"} onClick={() => tog(themes, t, setThemes)}>{t}</Btn>)}</Row>
            </div>
            <div>
              <Label style={{ marginBottom: 8 }}>Consents parents must give</Label>
              <Row wrap>{CONSENTS.map(t => <Btn key={t} size="sm" variant={consents.includes(t) ? "primary" : "ghost"} onClick={() => tog(consents, t, setConsents)}>{t}</Btn>)}</Row>
            </div>
            <Row gap={10}><Toggle on={f.ncs} onChange={() => set({ ncs: !f.ncs })} label="NCS eligible" /><span style={{ fontSize: 13 }}>NCS eligible hours apply</span><Sub>(label only; NCS rules are checked per family)</Sub></Row>
            <Row gap={10}><Toggle on={exOn} onChange={() => setExOn(!exOn)} label="Outing" /><span style={{ fontSize: 13 }}>Includes an outing</span></Row>
            {exOn && (
              <Grid min={160} gap={12}>
                <Field label="Outing day"><input type="date" className="ros-input" value={ex.day} onChange={e => setEx({ ...ex, day: e.target.value })} /></Field>
                <Field label="Where"><input className="ros-input" value={ex.where} onChange={e => setEx({ ...ex, where: e.target.value })} /></Field>
              </Grid>
            )}
            {errors.length > 0 && <Callout tone="warn" title="Before you create">{errors.join(" ")}</Callout>}
            <Row><Btn variant="primary" disabled={errors.length > 0} onClick={create}>Create camp</Btn><DemoTag /></Row>
          </div>
        </Card>
        <Stack gap={14}>
          <Card title="Preview" sub="How it will look to families and staff">
            <div style={{ fontSize: 16, fontWeight: 600 }}>{f.name || "Untitled camp"}</div>
            <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 4 }}>{locById(f.loc)?.name} · {f.start ? fmtDay(f.start) : "?"} to {f.end ? fmtDay(f.end) : "?"} · ages {f.ages}</div>
            <div style={{ marginTop: 12 }}><KV items={[["Days", String(days)], ["Places", String(f.capacity)], ["Full-camp price", "€" + (f.dayRate * days) + " (demo)"], ["Full-camp revenue", role.finance ? euro0(f.dayRate * days * f.capacity) : "Restricted"], ["Staff at 1:" + s.config.sacRatio, String(Math.ceil(f.capacity / s.config.sacRatio))], ["NCS", f.ncs ? "Eligible hours apply" : "Private only"]]} /></div>
            <Row wrap style={{ marginTop: 12 }}>{themes.map(t => <Badge key={t}>{t}</Badge>)}{consents.map(t => <Badge key={t} tone="warn">{t} consent</Badge>)}</Row>
            {exOn && <div style={{ marginTop: 10 }}><Callout tone="info" title={"Outing · " + (ex.day ? fmtDay(ex.day) : "")}>{ex.where}. Children without outing consent stay on site with a practitioner; demo excursion ratio 1:{EXCURSION_RATIO}.</Callout></div>}
          </Card>
          <Card title="Created in this demo">
            {created.length ? created.map(c => <ListRow key={c.id} onClick={() => nav("Camps", "Registrations", { campId: c.id })} title={c.name} sub={c.id + " · " + locById(c.locationId)?.short + " · " + fmtDate(c.start) + " to " + fmtDate(c.end) + (c.consentsRequired?.length ? " · consents: " + c.consentsRequired.join(", ") : "")} right={<Badge tone="ok">Open</Badge>} />) : <Empty title="No new camps yet" body="Camps you create appear here and in every camp list." />}
          </Card>
        </Stack>
      </div>
    </Page>
  );
}

/* ---------------- Registrations ---------------- */
function Registrations() {
  const { s, role } = useRos();
  const { upcoming } = useCamps();
  const { camp, setId } = usePicked(upcoming);
  const [q, setQ] = useState("");
  const [addChild, setAddChild] = useState("");
  const [regDays, setRegDays] = useState(5);
  if (!camp) return <Page><PageHead eyebrow="Camps" title="Registrations" /><NoCamps /></Page>;
  const regs = s.campRegs.filter(r => r.campId === camp.id);
  const held = activeRegs(regs).length, conf = regs.filter(r => r.status === "Confirmed").length;
  const rows = regs.filter(r => { const k = childOf(r.childId); return !q || (k && childName(k).toLowerCase().includes(q.toLowerCase())) || r.familyId.toLowerCase().includes(q.toLowerCase()); })
    .sort((a, b) => ({ "Pending payment": 0, Waitlist: 1, Confirmed: 2 }[a.status] - { "Pending payment": 0, Waitlist: 1, Confirmed: 2 }[b.status]) || a.id.localeCompare(b.id));
  const regIds = new Set(regs.map(r => r.childId));
  const eligible = s.children.filter(k => k.locationId === camp.locationId && k.programme === "SAC" && !regIds.has(k.id) && !familyOf(k.familyId)?.blocked).sort((a, b) => childName(a).localeCompare(childName(b)));
  const max = campDates(camp).length;
  const cols: Col<CampRegistration>[] = [
    { key: "c", label: "Child", w: "1.4fr", render: r => <Row gap={8}><Avatar name={childName(childOf(r.childId))} size={24} /><RecLink mono={false} r={{ kind: "child", id: r.childId }}>{childName(childOf(r.childId))}</RecLink></Row>, sort: r => childName(childOf(r.childId)) },
    { key: "f", label: "Family", w: "1fr", render: r => <RecLink r={{ kind: "family", id: r.familyId }} /> },
    { key: "a", label: "Class", w: ".9fr", render: r => childOf(r.childId)?.schoolClass || "" },
    { key: "d", label: "Days", w: ".5fr", align: "right", render: r => r.days, sort: r => r.days },
    { key: "n", label: "NCS hours", w: ".7fr", align: "right", render: r => familyOf(r.familyId)?.funding === "NCS" ? r.ncsHours + "h" : "Private" },
    { key: "v", label: "Value", w: ".7fr", align: "right", render: r => role.finance ? euro0(Math.min(r.days, max) * camp.dayRate) : "·" },
    { key: "s", label: "Status", w: "1fr", render: r => <StatusBadge s={r.status} />, sort: r => r.status },
    { key: "x", label: "", w: "1.5fr", align: "right", render: r => (
      r.status === "Pending payment" ? <Row gap={6}><Btn size="sm" variant="ok" onClick={() => markPaid({ regId: r.id })}>Mark paid</Btn><Btn size="sm" variant="subtle" onClick={() => confirmThen({ title: "Release this unpaid place?", body: "Removes " + childName(childOf(r.childId)) + " from " + camp.name + " and frees the place for the waitlist. The family is told (simulated).", confirmLabel: "Release place", danger: true, run: () => releasePlace({ regId: r.id }) })}>Release</Btn></Row>
        : r.status === "Waitlist" ? <Btn size="sm" disabled={held >= camp.capacity} title={held >= camp.capacity ? "Camp is full" : undefined} onClick={() => offerPlace({ regId: r.id })}>Offer place</Btn>
          : <Sub>Paid</Sub>) },
  ];
  return (
    <Page>
      <PageHead eyebrow="Camps" title="Registrations" sub={camp.name + " · " + fmtDay(camp.start) + " to " + fmtDay(camp.end) + ". Payments here are simulated: nothing is charged."} right={<CampPicker camps={upcoming} value={camp.id} onChange={setId} />} />
      <Grid min={150} style={{ marginBottom: 16 }}>
        <Kpi label="Confirmed" value={conf + " / " + camp.capacity} tone={conf >= camp.capacity ? "warn" : undefined} />
        <Kpi label="Pending payment" value={regs.filter(r => r.status === "Pending payment").length} tone="warn" />
        <Kpi label="Waitlist" value={regs.filter(r => r.status === "Waitlist").length} />
        <Kpi label="Paid revenue" value={role.finance ? euro0(forecast(camp, regs)) : "Restricted"} sub="Confirmed places (demo rate)" />
        <Kpi label="Places left" value={Math.max(0, camp.capacity - held)} tone={camp.capacity - held <= 2 ? "warn" : "ok"} />
      </Grid>
      <div className="ros-split">
        <Card title={"Registered children (" + regs.length + ")"} right={<Search value={q} onChange={setQ} placeholder="Child or family" width={200} />} pad={false}>
          <Table rowKey={r => r.id} rows={rows} cols={cols} minWidth={860} empty="No registrations yet" rowTone={r => r.status === "Pending payment" ? "warn" : undefined} />
        </Card>
        <Stack gap={14}>
          <Card title="Add a registration" sub={"Children at " + locById(camp.locationId)?.short + " not already on this camp. Booking-blocked families are excluded."}>
            <div style={{ display: "grid", gap: 12 }}>
              <Field label="Child"><select className="ros-input" value={addChild} onChange={e => setAddChild(e.target.value)}><option value="">Choose a child ({eligible.length})</option>{eligible.map(k => <option key={k.id} value={k.id}>{childName(k)} · {k.schoolClass} · {k.familyId}</option>)}</select></Field>
              <Field label="Days"><Seg size="sm" options={Array.from({ length: max }, (_, i) => String(i + 1))} value={String(Math.min(regDays, max))} onChange={v => setRegDays(+v)} /></Field>
              <Callout tone={held >= camp.capacity ? "warn" : "info"}>{held >= camp.capacity ? "Camp is full: the child joins the waitlist." : "Place is held for 72 hours pending payment."}</Callout>
              <Btn variant="primary" disabled={!addChild} onClick={() => { addReg({ campId: camp.id, childId: addChild, days: Math.min(regDays, max) }); setAddChild(""); }}>Add registration</Btn>
            </div>
          </Card>
          <Card title="Payment status">
            <HBars items={[{ label: "Confirmed and paid", value: conf, tone: "ok" }, { label: "Pending payment", value: regs.filter(r => r.status === "Pending payment").length, tone: "warn" }, { label: "Waitlist", value: regs.filter(r => r.status === "Waitlist").length, tone: "info" }]} max={camp.capacity} />
          </Card>
        </Stack>
      </div>
    </Page>
  );
}

/* ---------------- Staff & Registers ---------------- */
function StaffRegisters() {
  const { s, role } = useRos();
  const { upcoming } = useCamps();
  const { camp, setId } = usePicked(upcoming);
  const dates = camp ? campDates(camp) : [];
  const [day, setDay] = useState<string>("");
  if (!camp) return <Page><PageHead eyebrow="Camps" title="Staff & Registers" /><NoCamps /></Page>;
  const d = dates.includes(day) ? day : dates[0];
  const regs = activeRegs(s.campRegs.filter(r => r.campId === camp.id));
  const perDay = dates.map(x => regs.filter(r => campAttendDays(r, camp).includes(x)));
  const reqFor = (n: number, dt: string) => Math.ceil(n / (camp.excursion?.day === dt ? EXCURSION_RATIO : s.config.sacRatio));
  const peakReq = Math.max(0, ...dates.map((x, i) => reqFor(perDay[i].length, x)));
  const assigned = camp.staffIds.map(id => staffById(id)!).filter(Boolean);
  const pool = s.staff.filter(x => x.locationId === camp.locationId && /SAC|Relief/.test(x.role) && !camp.staffIds.includes(x.id));
  const today = perDay[Math.max(0, dates.indexOf(d))] || [];
  return (
    <Page>
      <PageHead eyebrow="Camps" title="Staff & Registers" sub={camp.name + ". Ratios use demo thresholds (1:" + s.config.sacRatio + " on site, 1:" + EXCURSION_RATIO + " on the outing day); configurable, illustrative, not official legal verification."} right={<CampPicker camps={upcoming} value={camp.id} onChange={setId} />} />
      <div className="ros-split-even">
        <Card title="Assigned staff" sub={assigned.length + " assigned · " + peakReq + " needed on the busiest day"} right={<Badge tone={assigned.length >= peakReq ? "ok" : "bad"}>{assigned.length >= peakReq ? "Covered" : "Short by " + (peakReq - assigned.length)}</Badge>}>
          <Meter label="Staff vs required (peak day)" value={assigned.length} max={Math.max(1, peakReq)} tone={assigned.length >= peakReq ? "ok" : "bad"} />
          <div style={{ marginTop: 10 }}>
            {assigned.length ? assigned.map(st => { const cs = certStatus(st); return <ListRow key={st.id} onClick={() => openRecord({ kind: "staff", id: st.id })} lead={<Avatar name={st.name} />} title={st.name} sub={st.role + " · " + st.qualification} right={<Badge tone={cs.expired.length ? "bad" : cs.soon.length ? "warn" : "ok"}>{cs.expired.length ? "Cert expired" : cs.soon.length ? "Cert due soon" : "Certs current"}</Badge>} />; }) : <Empty title="Nobody assigned yet" />}
          </div>
          {pool.length > 0 && (
            <>
              <Label style={{ margin: "14px 0 8px" }}>Available at {locById(camp.locationId)?.short}</Label>
              {pool.slice(0, 6).map(st => { const blocked = certStatus(st).gardaExpired; return <ListRow key={st.id} lead={<Avatar name={st.name} size={24} />} title={st.name} sub={st.role} right={blocked ? <Badge tone="bad">Garda vetting expired</Badge> : <Btn size="sm" onClick={() => assignStaff({ campId: camp.id, staffId: st.id })}>Assign</Btn>} />; })}
            </>
          )}
        </Card>
        <Card title="Children per day" sub="From registrations: full-week places attend every day; part-week places attend a fixed block.">
          <Columns data={dates.map((x, i) => ({ label: fmtDay(x).slice(0, 3), value: perDay[i].length, tone: perDay[i].length > camp.capacity ? "bad" : camp.excursion?.day === x ? "warn" : "accent", hint: fmtDay(x) + ": " + perDay[i].length + " children, " + reqFor(perDay[i].length, x) + " staff needed" }))} height={120} />
          <Row wrap style={{ marginTop: 8 }}>{dates.map((x, i) => <Badge key={x} tone={assigned.length >= reqFor(perDay[i].length, x) ? "ok" : "bad"}>{fmtDay(x).slice(0, 3)} {reqFor(perDay[i].length, x)} staff</Badge>)}</Row>
        </Card>
      </div>
      <div style={{ marginTop: 16 }}>
        <Card title={"Register preview · " + (d ? fmtDay(d) : "")} sub="Live sign-in opens on the day on the location kiosk. Medical alerts show for roles cleared to see them." right={<DemoTag>Preview</DemoTag>} pad={false}>
          <div style={{ padding: "0 18px 12px" }}><Seg size="sm" options={dates.map(x => [x, fmtDay(x).slice(0, 3)] as [string, string])} value={d} onChange={setDay} /></div>
          <Table rowKey={r => r.id} rows={today.slice().sort((a, b) => childName(childOf(a.childId)).localeCompare(childName(childOf(b.childId))))} minWidth={760} dense empty="No children on this day"
            cols={[
              { key: "c", label: "Child", w: "1.4fr", render: r => <RecLink mono={false} r={{ kind: "child", id: r.childId }}>{childName(childOf(r.childId))}</RecLink> },
              { key: "a", label: "Class", w: ".9fr", render: r => childOf(r.childId)?.schoolClass || "" },
              { key: "m", label: "Medical", w: "1.2fr", render: r => { const k = childOf(r.childId)!; return !k.medical.length ? <Sub>None on file</Sub> : role.medical ? <Badge tone={k.medical.some(m => m.severity === "Severe") ? "bad" : "warn"} title={k.medical.map(m => m.detail).join("; ")}>{k.medical.map(m => m.kind).join(", ")}</Badge> : <Badge tone="warn">Restricted</Badge>; } },
              { key: "o", label: "Outing consent", w: ".9fr", render: r => <Badge tone={childOf(r.childId)?.consents.outings ? "ok" : "warn"}>{childOf(r.childId)?.consents.outings ? "Yes" : "Missing"}</Badge> },
              { key: "p", label: "Paid", w: ".6fr", render: r => <Badge tone={r.paid ? "ok" : "warn"}>{r.paid ? "Paid" : "Unpaid"}</Badge> },
              { key: "i", label: "In", w: ".6fr", render: () => <Sub>On the day</Sub> },
              { key: "x", label: "Collectors", w: ".7fr", align: "right", render: r => childOf(r.childId)!.collectors.filter(c => c.permitted).length + " on file" },
            ]} />
        </Card>
      </div>
    </Page>
  );
}

/* ---------------- Excursions ---------------- */
function Excursions() {
  const { s } = useRos();
  const { upcoming } = useCamps();
  const withEx = upcoming.filter(c => c.excursion);
  const { camp, setId } = usePicked(withEx);
  if (!camp || !camp.excursion) return <Page><PageHead eyebrow="Camps" title="Excursions" /><Card><Empty title="No outings planned" body="Add an outing to a camp in Camp Builder." /></Card></Page>;
  const ex = camp.excursion;
  const regs = activeRegs(s.campRegs.filter(r => r.campId === camp.id)).filter(r => campAttendDays(r, camp).includes(ex.day));
  const rows = regs.map(r => ({ r, k: childOf(r.childId)! })).sort((a, b) => Number(a.k.consents.outings) - Number(b.k.consents.outings) || childName(a.k).localeCompare(childName(b.k)));
  const missing = rows.filter(x => !x.k.consents.outings);
  const going = rows.length - missing.length;
  const staffNeed = Math.ceil(going / EXCURSION_RATIO) + (missing.length ? 1 : 0);
  const task = s.tasks.find(t => t.link?.kind === "camp" && t.link.id === camp.id && t.title.startsWith("Collect outing consents") && t.status !== "Done");
  return (
    <Page>
      <PageHead eyebrow="Camps" title="Excursions" sub={camp.name + " · " + ex.where + " on " + fmtDay(ex.day) + ". Children without outing consent stay on site with a practitioner."} right={<CampPicker camps={withEx} value={camp.id} onChange={setId} />} />
      <Grid min={160} style={{ marginBottom: 16 }}>
        <Kpi label="On the outing day" value={rows.length} />
        <Kpi label="Consent given" value={going} tone="ok" />
        <Kpi label="Consent missing" value={missing.length} tone={missing.length ? "bad" : "ok"} />
        <Kpi label="Staff needed" value={staffNeed} sub={"1:" + EXCURSION_RATIO + " off site + 1 on site if needed (demo)"} />
      </Grid>
      <div className="ros-split">
        <Card title="Excursion manifest" sub="Built from registrations attending that day. Consent comes from the child file." pad={false}>
          <Table rowKey={x => x.r.id} rows={rows} minWidth={620} dense rowTone={x => x.k.consents.outings ? undefined : "bad"}
            cols={[
              { key: "c", label: "Child", w: "1.4fr", render: x => <RecLink mono={false} r={{ kind: "child", id: x.k.id }}>{childName(x.k)}</RecLink> },
              { key: "f", label: "Family", w: "1fr", render: x => <RecLink r={{ kind: "family", id: x.r.familyId }} /> },
              { key: "o", label: "Outing consent", w: "1fr", render: x => <Badge tone={x.k.consents.outings ? "ok" : "bad"}>{x.k.consents.outings ? "Given" : "Missing"}</Badge> },
              { key: "p", label: "Photos", w: ".7fr", render: x => <Badge tone={x.k.consents.photos ? "ok" : "warn"}>{x.k.consents.photos ? "Yes" : "No photos"}</Badge> },
              { key: "a", label: "", w: "1.2fr", align: "right", render: x => x.k.consents.outings ? <Sub>Going</Sub> : <Btn size="sm" onClick={() => consentReceived({ childId: x.k.id, campId: camp.id })}>Parent signed</Btn> },
            ]} />
        </Card>
        <Stack gap={14}>
          <Card title="Chase missing consents" tone={missing.length ? "warn" : undefined}>
            {missing.length ? (
              <>
                <div style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.55 }}>{missing.length} famil{missing.length === 1 ? "y has" : "ies have"} not given outing consent: {missing.map(x => x.k.firstName + " " + x.k.surname).join(", ")}.</div>
                <Row wrap style={{ marginTop: 12 }}>
                  <Btn variant="primary" disabled={!!task} onClick={() => confirmThen({ title: "Chase " + missing.length + " consents?", body: "Sends a consent request to each family in MyRosKids (simulated) and raises a task for the location manager, due two days before the outing.", confirmLabel: "Chase consents", run: () => chaseConsents({ campId: camp.id }) })}>{task ? "Already chased" : "Chase consents"}</Btn>
                  {task && <RecLink r={{ kind: "task", id: task.id }} />}
                </Row>
              </>
            ) : <Callout tone="ok" title="All consents in">Every child attending that day can go.</Callout>}
          </Card>
          <Card title="Outing plan">
            <KV items={[["Where", ex.where], ["Day", fmtDay(ex.day)], ["Leaving", "10:00 (demo)"], ["Back", "14:30 (demo)"], ["Transport", "Coach booked (demo)"], ["Ratio", "1:" + EXCURSION_RATIO + " illustrative, not official"]]} />
          </Card>
        </Stack>
      </div>
    </Page>
  );
}

/* ---------------- Performance ---------------- */
function Performance() {
  const { s, role } = useRos();
  const { all } = useCamps();
  const rows = all.map(c => {
    const regs = s.campRegs.filter(r => r.campId === c.id);
    const booked = c.past ? c.past.booked : regs.filter(r => r.status === "Confirmed").length;
    const revenue = c.past ? c.past.revenue : forecast(c, regs);
    return { c, booked, fill: c.capacity ? booked / c.capacity : 0, revenue, actual: !!c.past };
  }).sort((a, b) => a.c.start.localeCompare(b.c.start));
  const seasons = Array.from(new Set(rows.map(r => r.c.season)));
  const bySeason = seasons.map(se => ({ se, rev: rows.filter(r => r.c.season === se).reduce((n, r) => n + r.revenue, 0), fill: (() => { const x = rows.filter(r => r.c.season === se); const cap = x.reduce((n, r) => n + r.c.capacity, 0); return cap ? x.reduce((n, r) => n + r.booked, 0) / cap : 0; })() }));
  if (!rows.length) return <Page><PageHead eyebrow="Camps" title="Performance" /><NoCamps /></Page>;
  return (
    <Page>
      <PageHead eyebrow="Camps" title="Performance" sub="Completed camps keep their final totals; upcoming camps show the current forecast (confirmed places at the demo day rate)." right={<DemoTag>Demo figures</DemoTag>} />
      <div className="ros-split-even">
        <Card title="Fill rate by camp">
          <Columns data={rows.map(r => ({ label: r.c.name.split(" · ")[0].replace(" Camp", "") + " " + (locById(r.c.locationId)?.short || "").slice(0, 3), value: Math.round(r.fill * 100), tone: r.actual ? "neutral" : "accent", hint: r.c.name + " · " + r.booked + " of " + r.c.capacity }))} format={n => n + "%"} height={130} />
          <Sub>Grey: completed. Colour: upcoming forecast.</Sub>
        </Card>
        <Card title="Revenue by season">
          {role.finance ? <HBars items={bySeason.map(x => ({ label: x.se, value: x.rev, sub: pct(x.fill) + " full" }))} format={euro0} /> : <Callout tone="neutral" title="Restricted">Revenue is visible to finance roles.</Callout>}
        </Card>
      </div>
      <div style={{ marginTop: 16 }}>
        <Card title="All camps" pad={false}>
          <Table rowKey={r => r.c.id} rows={rows} minWidth={760} onRow={r => openRecord({ kind: "camp", id: r.c.id })}
            cols={[
              { key: "n", label: "Camp", w: "1.6fr", render: r => r.c.name },
              { key: "se", label: "Season", w: "1fr", render: r => r.c.season, sort: r => r.c.start },
              { key: "cap", label: "Places", w: ".6fr", align: "right", render: r => r.c.capacity },
              { key: "b", label: "Booked", w: ".6fr", align: "right", render: r => r.booked },
              { key: "f", label: "Fill", w: ".6fr", align: "right", render: r => pct(r.fill), sort: r => r.fill },
              { key: "r", label: "Revenue", w: ".8fr", align: "right", render: r => role.finance ? euro0(r.revenue) : "·", sort: r => r.revenue },
              { key: "s", label: "Status", w: ".9fr", render: r => <Badge tone={r.actual ? "neutral" : "info"}>{r.actual ? "Completed" : "Forecast"}</Badge> },
            ]} />
        </Card>
      </div>
    </Page>
  );
}

export default function Camps({ tab }: { tab: string }) {
  useRos();
  switch (tab) {
    case "Camp Builder": return <Builder />;
    case "Registrations": return <Registrations />;
    case "Staff & Registers": return <StaffRegisters />;
    case "Excursions": return <Excursions />;
    case "Performance": return <Performance />;
    default: return <Overview />;
  }
}
