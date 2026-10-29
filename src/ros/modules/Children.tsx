/* Children: one file per child. Directory, the child file, site-wide medical
   alerts and the collector permission matrix that sign-out and driver screens
   check, a weekly attendance grid with a kiosk, and learning journals and
   incidents. Medical and safeguarding detail is masked for roles without it. */
import { useState, type ReactNode } from "react";
import type { Child, Collector, Incident, Tone } from "../types";
import { useRos, defineAction, openRecord, nav, setFocus, confirmThen, getState } from "../store";
import {
  child, family, idx, inScope, scopedLocations, locById, cached, childStatus, childName, schoolName, staffById, onSiteNow,
  medicationReviews, paymentStatus, bookingsOn, type ChildDayStatus,
} from "../selectors";
import { TODAY, THIS_WEEK, fmtDate, fmtDay, dow, rel, hm, toMin, euro } from "../time";
import { signIn, signOut } from "../actions";
import { ChildPanel } from "../records";
import {
  Page, PageHead, Card, Kpi, Grid, Table, Badge, StatusBadge, Btn, RecLink, HBars, KV, Callout, Seg, Search, ListRow,
  Empty, Avatar, Row, Stack, Sub, Label, Field, Toggle, StackBar, type Col,
} from "../ui";

/* ---------------- actions owned by Children ---------------- */
export const markAbsent = defineAction<{ childId: string; reason: string }>("children.absent", (s, p, ctx) => {
  const c = s.children.find(x => x.id === p.childId); if (!c) return;
  if (s.attendance.some(a => a.childId === c.id && a.date === TODAY && a.kind === "absent")) return;
  s.attendance.push({ id: ctx.id("AT"), childId: c.id, date: TODAY, kind: "absent", time: ctx.time, by: ctx.actor, note: p.reason });
  ctx.comm(c.familyId, "Kiosk", "note", c.firstName + " marked absent today: " + p.reason, ctx.actor);
  ctx.log({ category: "Operations", title: c.firstName + " " + c.surname + " marked absent", detail: p.reason + " · " + (s.locations.find(l => l.id === c.locationId)?.short || "") + (c.routeId ? " · driver on " + c.routeId + " should be told" : ""), link: { kind: "child", id: c.id }, locationId: c.locationId });
}, { toast: () => "Marked absent. Register and family timeline updated.", undo: true });

/* ---------------- shared bits ---------------- */
const SEV_TONE: Record<string, Tone> = { Severe: "bad", Moderate: "warn", Info: "neutral" };
const STATUS_TONE: Record<ChildDayStatus, Tone> = { Expected: "neutral", "Signed in": "ok", "Signed out": "info", "On bus": "accent", Absent: "warn", "Not present": "bad" };
function childRows() {
  return cached("children:rows", () => getState().children.map(c => {
    const room = idx().room.get(c.roomId);
    const school = c.schoolId ? idx().school.get(c.schoolId)?.name : undefined;
    return { c, room, school, text: (c.id + " " + c.firstName + " " + c.surname + " " + (school || "") + " " + (room?.name || "") + " " + (locById(c.locationId)?.short || "") + " " + c.familyId).toLowerCase() };
  }));
}
type CRow = ReturnType<typeof childRows>[number];
const placeOf = (c: Child) => c.programme === "EY" ? (idx().room.get(c.roomId)?.name || "") + " · " + (idx().room.get(c.roomId)?.kind || "") : schoolName(c.schoolId) + (c.schoolClass ? " · " + c.schoolClass : "");

function resolveChild(focusId?: string): { id?: string; note?: string } {
  let note: string | undefined;
  if (focusId) {
    const c = child(focusId);
    if (c && inScope(c.locationId)) return { id: c.id };
    if (c) note = childName(c) + " is outside your location scope, so a child from your own location is shown instead.";
  }
  const s = getState();
  const luca = s.children.find(c => c.familyId === "ROS1042" && c.firstName === "Luca");
  if (luca && inScope(luca.locationId)) return { id: luca.id, note };
  return { id: s.children.find(c => inScope(c.locationId))?.id, note };
}

function ChildPicker({ value, onPick, note }: { value?: string; onPick: (id: string) => void; note?: string }) {
  const { s } = useRos();
  const [q, setQ] = useState("");
  const c = value ? child(value) : undefined;
  const t = q.trim().toLowerCase();
  const hits = t.length >= 2 ? childRows().filter(r => inScope(r.c.locationId) && r.text.includes(t)).slice(0, 7) : [];
  const story = ["ROS1042", "ROS1132", "ROS1087", "ROS1096", "ROS1198"].flatMap(fid => family(fid)?.childIds || []).map(id => child(id)).filter((x): x is Child => !!x && inScope(x.locationId));
  const ey = s.children.find(x => x.programme === "EY" && inScope(x.locationId) && s.diary.some(d => d.childId === x.id && d.observation));
  const quick = (ey ? story.concat(ey) : story).filter(x => x.id !== value).slice(0, 6);
  return (
    <Card style={{ marginBottom: 16 }}>
      <Row wrap gap={14} style={{ alignItems: "flex-start" }}>
        <Row gap={12} style={{ flex: "1 1 260px" }}>
          {c && <Avatar name={childName(c)} size={38} />}
          <Stack gap={3}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{c ? childName(c) : "No child selected"}</span>
            {c && <Row wrap gap={6}><Sub>{c.id} · {c.programme === "EY" ? "Early Years" : "School age"} · {locById(c.locationId)?.short}</Sub><RecLink r={{ kind: "family", id: c.familyId }} /></Row>}
          </Stack>
        </Row>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <Search value={q} onChange={setQ} placeholder="Find by name, child ID, school or room" width="100%" />
          {hits.length > 0 && (
            <div style={{ marginTop: 6, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-2)", padding: 4 }}>
              {hits.map(h => <ListRow key={h.c.id} onClick={() => { onPick(h.c.id); setQ(""); }} title={childName(h.c) + " · " + h.c.id} sub={placeOf(h.c) + " · " + locById(h.c.locationId)?.short} />)}
            </div>
          )}
          {t.length >= 2 && !hits.length && <div style={{ marginTop: 6 }}><Sub>No child in your scope matches “{q}”.</Sub></div>}
        </div>
      </Row>
      {quick.length > 0 && <Row wrap gap={6} style={{ marginTop: 12 }}><Sub>Quick open:</Sub>{quick.map(x => <Btn key={x.id} size="sm" variant="subtle" onClick={() => onPick(x.id)}>{childName(x)}</Btn>)}</Row>}
      {note && <div style={{ marginTop: 10 }}><Callout tone="warn">{note}</Callout></div>}
    </Card>
  );
}

const Masked = ({ what }: { what: string }) => <Callout tone="neutral" title="Restricted">{what} is visible to authorised roles only (owner, operations, location manager, room staff, drivers for collectors). Switch role in the header to see how access changes.</Callout>;

export default function Children({ tab }: { tab: string }) {
  useRos();
  switch (tab) {
    case "Child File": return <ChildFile />;
    case "Medical & Collectors": return <MedicalCollectors />;
    case "Attendance": return <Attendance />;
    case "Learning & Incidents": return <LearningIncidents />;
    default: return <Directory />;
  }
}

/* ---------------- Directory ---------------- */
function Directory() {
  const { role } = useRos();
  const [q, setQ] = useState("");
  const [prog, setProg] = useState<"All" | "EY" | "SAC">("All");
  const [loc, setLoc] = useState("ALL");
  const [medOnly, setMedOnly] = useState(false);
  const locs = scopedLocations();
  const scoped = childRows().filter(r => inScope(r.c.locationId));
  const t = q.trim().toLowerCase();
  const rows = scoped.filter(r => (prog === "All" || r.c.programme === prog) && (loc === "ALL" || r.c.locationId === loc) && (!medOnly || r.c.medical.length > 0) && (!t || r.text.includes(t)));
  const cols: Col<CRow>[] = [
    { key: "n", label: "Child", w: "1.5fr", render: r => <Row gap={10}><Avatar name={childName(r.c)} size={26} /><Stack><span style={{ fontWeight: 500 }}>{childName(r.c)}</span><Sub>{r.c.id}</Sub></Stack></Row>, sort: r => r.c.firstName + r.c.surname },
    { key: "a", label: "Age", w: ".45fr", align: "center", render: r => r.c.age, sort: r => r.c.age },
    { key: "f", label: "Family", w: ".8fr", render: r => <RecLink r={{ kind: "family", id: r.c.familyId }} />, sort: r => r.c.familyId },
    { key: "l", label: "Location", w: ".9fr", render: r => locById(r.c.locationId)?.short, sort: r => r.c.locationId },
    { key: "p", label: "Programme", w: ".6fr", render: r => <Badge tone={r.c.programme === "EY" ? "accent" : "info"}>{r.c.programme}</Badge>, sort: r => r.c.programme },
    { key: "r", label: "Room or school", w: "1.6fr", render: r => <Stack><span>{r.c.programme === "EY" ? r.room?.name : r.school}</span><Sub>{r.c.programme === "EY" ? r.room?.kind : r.c.schoolClass}</Sub></Stack>, sort: r => (r.c.programme === "EY" ? r.room?.name : r.school) || "" },
    { key: "b", label: "Bus", w: ".6fr", render: r => r.c.routeId ? <RecLink r={{ kind: "route", id: r.c.routeId }} /> : <Sub>No</Sub> },
    { key: "s", label: "Today", w: ".85fr", render: r => { const st = childStatus(r.c.id).status; return <Badge tone={STATUS_TONE[st]}>{st}</Badge>; } },
    { key: "m", label: "Medical", w: "1fr", render: r => !r.c.medical.length ? <Sub>None</Sub> : role.medical ? <Row gap={4}>{r.c.medical.map((m, i) => <Badge key={i} tone={SEV_TONE[m.severity]}>{m.kind}</Badge>)}</Row> : <Badge tone="warn">Flag</Badge> },
  ];
  return (
    <Page>
      <PageHead eyebrow="Children · Directory" title="Every child in scope"
        sub="Search by name, child ID, school, room or location. Click a row to open the child file." />
      <Grid min={150} style={{ marginBottom: 16 }}>
        <Kpi label="Children" value={scoped.length} sub={scopedLocations().length + " location" + (scopedLocations().length > 1 ? "s" : "")} />
        <Kpi label="Early Years" value={scoped.filter(r => r.c.programme === "EY").length} onClick={() => setProg("EY")} />
        <Kpi label="School age" value={scoped.filter(r => r.c.programme === "SAC").length} onClick={() => setProg("SAC")} />
        <Kpi label="On site now" value={onSiteNow()} tone="ok" sub={"Signed in at " + hm(getState().clockMin)} />
        <Kpi label="Use the school run" value={scoped.filter(r => !!r.c.routeId).length} />
        <Kpi label="Medical flags" value={scoped.filter(r => r.c.medical.length).length} tone="warn" onClick={() => setMedOnly(true)} />
      </Grid>
      <Card pad={false}>
        <Row wrap gap={10} style={{ padding: "14px 16px" }}>
          <Search value={q} onChange={setQ} placeholder="Name, ID, school, room or location" width={300} />
          <Seg size="sm" value={prog} onChange={setProg} options={[["All", "All"], ["EY", "Early Years"], ["SAC", "School age"]] as ["All" | "EY" | "SAC", ReactNode][]} />
          <select className="ros-input" style={{ width: 170 }} value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Location" disabled={locs.length === 1}>
            {locs.length > 1 && <option value="ALL">All locations in scope</option>}
            {locs.map(l => <option key={l.id} value={l.id}>{l.short}</option>)}
          </select>
          <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "var(--dim)" }}><Toggle on={medOnly} onChange={() => setMedOnly(x => !x)} label="Medical flag only" />Medical flag only</label>
          <div style={{ flex: 1 }} />
          <Sub>{rows.length} of {scoped.length}</Sub>
        </Row>
        <Table rows={rows} cols={cols} rowKey={r => r.c.id} minWidth={1000} empty="No children match" onRow={r => nav("Children", "Child File", { childId: r.c.id })} />
      </Card>
    </Page>
  );
}

/* ---------------- Child File ---------------- */
function ChildFile() {
  const { s, ui, role } = useRos();
  const r = resolveChild(ui.focus.childId);
  if (!r.id) return <Page><Card><Empty title="No children in your scope" /></Card></Page>;
  const c = child(r.id)!, f = family(c.familyId)!;
  const room = idx().room.get(c.roomId);
  const kw = staffById(c.keyWorkerId);
  const week = THIS_WEEK.map(d => ({ d, b: (idx().bookingsByChild.get(c.id) || []).filter(x => x.date === d) }));
  const st = childStatus(c.id);
  return (
    <Page>
      <PageHead eyebrow="Children · Child file" title={childName(c)}
        sub={(c.programme === "EY" ? "Early Years · " + room?.name + " (" + room?.kind + ")" : "School age · " + schoolName(c.schoolId) + ", " + c.schoolClass) + " · " + locById(c.locationId)?.name + " · age " + c.age + " · started " + fmtDate(c.started) + " " + c.started.slice(0, 4)} />
      <ChildPicker value={c.id} note={r.note} onPick={(id) => setFocus({ childId: id })} />
      <div className="ros-split">
        <Card><ChildPanel key={c.id} id={c.id} /></Card>
        <Stack gap={14}>
          <Card title="Today" right={<Badge tone={STATUS_TONE[st.status]}>{st.status}{st.time ? " · " + st.time : ""}</Badge>}>
            <Row wrap gap={6}>
              {week.map(({ d, b }) => <Badge key={d} tone={!b.length ? "neutral" : d === TODAY ? "accent" : d < TODAY ? "ok" : "info"}>{dow(d)} {b.length ? b.map(x => x.start + "–" + x.end).join(", ") : "off"}</Badge>)}
            </Row>
            <Row wrap style={{ marginTop: 12 }}>
              <Btn size="sm" variant="primary" onClick={() => nav("Children", "Attendance", { childId: c.id, locationId: c.locationId })}>Open kiosk</Btn>
              <Btn size="sm" onClick={() => nav("Children", "Medical & Collectors", { childId: c.id })}>Collectors</Btn>
            </Row>
          </Card>
          {c.programme === "EY" ? <EyCard c={c} /> : <SacCard c={c} />}
          <Card title="Family" sub={f.guardians.map(g => g.name).join(" and ")} right={<RecLink r={{ kind: "family", id: f.id }} />}>
            <KV items={[["Funding", f.funding + (idx().awardByChild.get(c.id) ? " · " + idx().awardByChild.get(c.id)!.agreedHours + "h/wk" : "")], ["Account", role.finance ? paymentStatus(f) : "Restricted"], ["Prefers", f.channel + " · " + f.language], ["Siblings", f.childIds.filter(x => x !== c.id).map(x => child(x)?.firstName).join(", ") || "None"]]} />
            <Row wrap style={{ marginTop: 12 }}>
              <Btn size="sm" onClick={() => nav("Families", "Family Profile", { familyId: f.id })}>Family profile</Btn>
              <Btn size="sm" variant="subtle" onClick={() => nav("Families", "Communications", { familyId: f.id })}>Message family</Btn>
            </Row>
          </Card>
          <Card title="Key worker"><ListRow lead={<Avatar name={kw?.name || "?"} />} title={kw?.name || "Not assigned"} sub={kw ? kw.role + " · " + kw.qualification : undefined} onClick={kw ? () => openRecord({ kind: "staff", id: kw.id }) : undefined} /></Card>
          {s.incidents.some(i => i.childId === c.id && i.status !== "Closed") && (role.safeguarding || role.medical) && <Callout tone="warn" title="Open incident">See Learning and incidents for the record awaiting signature or review.</Callout>}
        </Stack>
      </div>
    </Page>
  );
}

function EyCard({ c }: { c: Child }) {
  const { s } = useRos();
  const room = idx().room.get(c.roomId)!;
  const enrolled = s.children.filter(x => x.roomId === room.id).length;
  const booked = bookingsOn(TODAY, c.locationId, "Full Day").filter(b => b.roomId === room.id).length;
  const d = s.diary.find(x => x.childId === c.id && x.date === TODAY);
  return (
    <Card title={"Room · " + room.name} sub={room.kind + " · " + room.ageBand} right={<Btn size="sm" onClick={() => nav("EarlyYears", "Daily Diaries", { childId: c.id })}>Daily diaries</Btn>}>
      <KV items={[["Enrolled", enrolled + " of " + room.capacity], ["In today", booked + " booked"], ["Ratio (demo config)", "1:" + room.ratio], ["Key worker", staffById(c.keyWorkerId)?.name || "Not set"]]} />
      <Label style={{ marginTop: 14, marginBottom: 6 }}>Today's diary</Label>
      {d ? (
        <div>
          <KV cols={2} items={[["Meals", d.meals], ["Sleep", d.sleep], ["Nappies / toilet", d.nappies], ["Mood", d.mood]]} />
          <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--body)", lineHeight: 1.6 }}>{d.activity}. {d.note}</div>
          {d.observation && <div style={{ marginTop: 8 }}><Callout tone="info" title="Observation">{d.observation.text}<div style={{ marginTop: 6 }}><Row wrap gap={4}>{d.observation.tags.map(t => <Badge key={t}>{t}</Badge>)}</Row></div></Callout></div>}
          <Row style={{ marginTop: 8 }}><StatusBadge s={d.status} /><Sub>by {d.author} · AI drafted, practitioner publishes</Sub></Row>
        </div>
      ) : <Sub>No diary started yet today.</Sub>}
    </Card>
  );
}

function SacCard({ c }: { c: Child }) {
  const { s } = useRos();
  const rt = c.routeId ? s.routes.find(x => x.id === c.routeId) : undefined;
  const stop = rt?.stops.find(x => x.schoolId === c.schoolId);
  const today = (idx().bookingsByChild.get(c.id) || []).filter(b => b.date === TODAY);
  const ev = (idx().attendanceByChildDate.get(c.id + "|" + TODAY) || []).slice().sort((a, b) => a.time.localeCompare(b.time));
  return (
    <Card title={"School · " + schoolName(c.schoolId)} sub={c.schoolClass} right={rt ? <Btn size="sm" onClick={() => openRecord({ kind: "route", id: rt.id })}>Open {rt.id}</Btn> : undefined}>
      <KV items={[["Bus route", rt ? rt.id + " · " + rt.name : "Walks or collected by parent"], ["Pickup", stop ? stop.time + " at " + schoolName(stop.schoolId) : "n/a"], ["Driver", rt ? staffById(rt.driverId)?.name || "" : "n/a"], ["Transport consent", c.consents.transport ? "Given" : "Not given"]]} />
      <Label style={{ marginTop: 14, marginBottom: 6 }}>Today's journey</Label>
      {today.length ? today.map(b => <ListRow key={b.id} title={b.session + " " + b.start + "–" + b.end} sub={b.routeId ? "Collected by " + b.routeId : "No transport"} />) : <Sub>Not booked today.</Sub>}
      {ev.length > 0 && <div style={{ marginTop: 6 }}>{ev.map(e => <Row key={e.id} gap={8} style={{ padding: "3px 0" }}><Sub>{e.time}</Sub><span style={{ fontSize: 12.5 }}>{{ in: "Signed in", out: "Signed out", boarded: "Boarded " + (e.routeId || "bus"), absent: "Absent", "not-present": "Not at pickup" }[e.kind]}{e.collector ? " · " + e.collector : ""}{e.note ? " · " + e.note : ""}</span></Row>)}</div>}
    </Card>
  );
}

/* ---------------- Medical & Collectors ---------------- */
function MedicalCollectors() {
  const { s, role, ui } = useRos();
  const [sev, setSev] = useState<"All" | "Severe" | "Moderate" | "Info">("All");
  const [kind, setKind] = useState("All");
  const [loc, setLoc] = useState("ALL");
  const [restrOnly, setRestrOnly] = useState(true);
  const [cq, setCq] = useState("");
  const locs = scopedLocations();
  const kids = s.children.filter(c => inScope(c.locationId) && (loc === "ALL" || c.locationId === loc));
  const flagged = kids.filter(c => c.medical.length);
  const alerts = flagged.flatMap(c => c.medical.map((m, i) => ({ key: c.id + i, c, m })))
    .filter(a => (sev === "All" || a.m.severity === sev) && (kind === "All" || a.m.kind === kind))
    .sort((a, b) => ({ Severe: 0, Moderate: 1, Info: 2 }[a.m.severity] - { Severe: 0, Moderate: 1, Info: 2 }[b.m.severity]) || a.c.locationId.localeCompare(b.c.locationId) || a.c.roomId.localeCompare(b.c.roomId));
  const meds = medicationReviews().filter(c => loc === "ALL" || c.locationId === loc);
  const seeNotes = role.medical || role.id === "driver";
  const t = cq.trim().toLowerCase();
  const collRows = kids.filter(c => (!restrOnly || c.collectors.some(x => !x.permitted || x.note)) && (!t || (childName(c) + " " + c.collectors.map(x => x.name).join(" ")).toLowerCase().includes(t)));
  const byLoc = locs.map(l => ({ label: l.short, value: flagged.filter(c => c.locationId === l.id).length })).filter(x => x.value > 0);
  const alertCols: Col<typeof alerts[number]>[] = [
    { key: "c", label: "Child", w: "1.3fr", render: a => <RecLink mono={false} r={{ kind: "child", id: a.c.id }}>{childName(a.c)}</RecLink>, sort: a => a.c.firstName },
    { key: "w", label: "Site and room", w: "1.4fr", render: a => <Stack><span>{locById(a.c.locationId)?.short}</span><Sub>{a.c.programme === "EY" ? idx().room.get(a.c.roomId)?.name : "School age · " + a.c.schoolClass}</Sub></Stack>, sort: a => a.c.locationId + a.c.roomId },
    { key: "k", label: "Alert", w: ".8fr", render: a => <Badge tone={SEV_TONE[a.m.severity]}>{a.m.kind}</Badge>, sort: a => a.m.kind },
    { key: "d", label: "Detail", w: "2.2fr", render: a => <span style={{ whiteSpace: "normal", lineHeight: 1.45 }}>{a.m.detail}</span> },
    { key: "s", label: "Severity", w: ".7fr", render: a => <StatusBadge s={a.m.severity === "Severe" ? "Severe" : a.m.severity} /> },
    { key: "x", label: "Medication", w: "1.5fr", render: a => a.c.medication ? <Stack><span style={{ whiteSpace: "normal" }}>{a.c.medication.name}</span><Sub>{a.c.medication.stored} · to {fmtDate(a.c.medication.expires)} {a.c.medication.expires <= "2026-11-03" ? "· review now" : ""}</Sub></Stack> : <Sub>None held</Sub> },
  ];
  const collCols: Col<Child>[] = [
    { key: "c", label: "Child", w: "1.2fr", render: c => <RecLink mono={false} r={{ kind: "child", id: c.id }}>{childName(c)}</RecLink>, sort: c => c.firstName },
    { key: "l", label: "Site", w: ".8fr", render: c => locById(c.locationId)?.short, sort: c => c.locationId },
    { key: "a", label: "Authorised to collect", w: "2.4fr", render: c => <Row wrap gap={4}>{c.collectors.filter(x => x.permitted).map(x => <Badge key={x.name} tone="ok" title={x.relation}>{x.name}</Badge>)}</Row> },
    { key: "n", label: "Not permitted", w: "1.4fr", render: c => c.collectors.some(x => !x.permitted) ? <Row wrap gap={4}>{c.collectors.filter(x => !x.permitted).map(x => <Badge key={x.name} tone="bad">{x.name}</Badge>)}</Row> : <Sub>None</Sub> },
    { key: "o", label: "Notes", w: "1.6fr", render: c => { const n = c.collectors.filter(x => x.note); return n.length ? (seeNotes ? <span style={{ whiteSpace: "normal", fontSize: 12 }}>{n.map(x => x.name.split(" ")[0] + ": " + x.note).join(" · ")}</span> : <Sub>Restricted</Sub>) : <Sub>None</Sub>; } },
  ];
  return (
    <Page>
      <PageHead eyebrow="Children · Medical and collectors" title="Alerts and who may collect"
        sub="The medical register by site and room, and the collector permission list that kiosk sign-out and driver screens check before a child is released." />
      <Grid min={150} style={{ marginBottom: 16 }}>
        <Kpi label="Children with alerts" value={role.medical ? flagged.length : "Restricted"} />
        <Kpi label="Severe" value={role.medical ? flagged.filter(c => c.medical.some(m => m.severity === "Severe")).length : "Restricted"} tone="bad" onClick={role.medical ? () => setSev("Severe") : undefined} />
        <Kpi label="Allergies" value={role.medical ? flagged.filter(c => c.medical.some(m => m.kind === "Allergy")).length : "Restricted"} tone="warn" onClick={role.medical ? () => setKind("Allergy") : undefined} />
        <Kpi label="Medication to review" value={role.medical ? meds.length : "Restricted"} tone={meds.length ? "warn" : "ok"} sub="Expires by 3 Nov" />
        <Kpi label="Collector restrictions" value={kids.filter(c => c.collectors.some(x => !x.permitted)).length} tone="bad" sub="Not permitted on file" />
      </Grid>
      <Row wrap gap={10} style={{ marginBottom: 12 }}>
        <select className="ros-input" style={{ width: 190 }} value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Location" disabled={locs.length === 1}>
          {locs.length > 1 && <option value="ALL">All locations in scope</option>}
          {locs.map(l => <option key={l.id} value={l.id}>{l.short}</option>)}
        </select>
        {role.medical && <Seg size="sm" value={sev} onChange={setSev} options={["All", "Severe", "Moderate", "Info"]} />}
        {role.medical && <select className="ros-input" style={{ width: 150 }} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Alert type">{["All", "Allergy", "Asthma", "Epilepsy", "Diabetes", "Eczema", "Dietary"].map(k => <option key={k} value={k}>{k === "All" ? "Any alert" : k}</option>)}</select>}
      </Row>
      {role.medical ? (
        <div className="ros-split" style={{ marginBottom: 16 }}>
          <Card title="Medical register" sub={alerts.length + " alert" + (alerts.length === 1 ? "" : "s") + ", most severe first"} pad={false}>
            <Table rows={alerts} cols={alertCols} rowKey={a => a.key} minWidth={900} dense rowTone={a => a.m.severity === "Severe" ? "bad" : undefined} />
          </Card>
          <Stack gap={14}>
            <Card title="By site"><HBars items={byLoc} /></Card>
            <Card title="Medication review" sub="Ask the parent for a replacement before expiry">
              {meds.length ? meds.map(c => <ListRow key={c.id} onClick={() => openRecord({ kind: "child", id: c.id })} title={childName(c) + " · " + c.medication!.name} sub={locById(c.locationId)?.short + " · expires " + fmtDay(c.medication!.expires)} right={<Badge tone="warn">Review</Badge>} />) : <Empty title="Nothing due" />}
            </Card>
          </Stack>
        </div>
      ) : <div style={{ marginBottom: 16 }}><Masked what="Medical information" /></div>}
      <div className="ros-split">
        <Card title="Collector permission matrix" sub="What kiosk sign-out and the driver app check before release" pad={false}
          right={<label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--dim)" }}><Toggle on={restrOnly} onChange={() => setRestrOnly(x => !x)} label="Restrictions and notes only" />Restrictions only</label>}>
          <div style={{ padding: "0 16px 12px" }}><Search value={cq} onChange={setCq} placeholder="Search child or collector" width="100%" /></div>
          <Table rows={collRows} cols={collCols} rowKey={c => c.id} minWidth={860} dense pageSize={15} empty="No children match" rowTone={c => c.collectors.some(x => !x.permitted) ? "bad" : undefined} />
        </Card>
        <CollectorCheck initial={ui.focus.childId} />
      </div>
    </Page>
  );
}

function CollectorCheck({ initial }: { initial?: string }) {
  const { role } = useRos();
  const start = initial && child(initial) && inScope(child(initial)!.locationId) ? initial : resolveChild().id;
  const [cid, setCid] = useState<string | undefined>(start);
  const [who, setWho] = useState("");
  const [q, setQ] = useState("");
  const c = cid ? child(cid) : undefined;
  const t = q.trim().toLowerCase();
  const hits = t.length >= 2 ? childRows().filter(r => inScope(r.c.locationId) && r.text.includes(t)).slice(0, 5) : [];
  const w = who.trim().toLowerCase();
  const match: Collector | undefined = c && w.length >= 3 ? c.collectors.find(x => x.name.toLowerCase().includes(w) || w.includes(x.name.toLowerCase())) : undefined;
  return (
    <Card title="Check a collector" sub="The same check the kiosk and driver screens run">
      <Stack gap={10}>
        <Field label="Child">
          <Search value={q} onChange={setQ} placeholder={c ? childName(c) + " (search to change)" : "Search child"} width="100%" />
        </Field>
        {hits.map(h => <ListRow key={h.c.id} onClick={() => { setCid(h.c.id); setQ(""); }} title={childName(h.c)} sub={placeOf(h.c)} />)}
        {c && <Sub>Checking for {childName(c)} · {locById(c.locationId)?.short}</Sub>}
        <Field label="Person at the door"><input className="ros-input" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Full name as on photo ID" /></Field>
        {c && <Row wrap gap={6}><Sub>On file:</Sub>{c.collectors.map(x => <Btn key={x.name} size="sm" variant="subtle" onClick={() => setWho(x.name)}>{x.name}</Btn>)}</Row>}
        {c && w.length >= 3 && (match ? (
          match.permitted
            ? <Callout tone="ok" title={"Release to " + match.name}>{match.relation} · authorised collector.{match.note ? (role.medical || role.id === "driver" ? " " + match.note + "." : " A note is on file; ask the manager.") : " Check photo ID if you don't know them."}</Callout>
            : <Callout tone="bad" title={"Do not release to " + match.name}>{role.medical || role.id === "driver" ? (match.note || "Not permitted") : "Not permitted"}. Keep {c.firstName} inside, call the location manager, then the primary guardian.</Callout>
        ) : <Callout tone="warn" title="Not on the authorised list">Do not release. Phone {family(c.familyId)?.guardians[0]?.name || "the guardian"} to confirm, and add the person in MyRosKids only if the guardian agrees.</Callout>)}
      </Stack>
    </Card>
  );
}

/* ---------------- Attendance ---------------- */
function Attendance() {
  const { s, ui } = useRos();
  const locs = scopedLocations();
  const fc = ui.focus.childId ? child(ui.focus.childId) : undefined;
  const pref = ui.focus.locationId && locs.some(l => l.id === ui.focus.locationId) ? ui.focus.locationId : fc && locs.some(l => l.id === fc.locationId) ? fc.locationId : locs[0]?.id;
  const [loc, setLoc] = useState<string>(pref || "");
  const [prog, setProg] = useState<"All" | "EY" | "SAC">("All");
  const [q, setQ] = useState("");
  const l = locs.find(x => x.id === loc) || locs[0];
  if (!l) return <Page><Card><Empty title="No locations in scope" /></Card></Page>;
  const weekB = THIS_WEEK.flatMap(d => bookingsOn(d, l.id));
  const byChild = new Map<string, typeof weekB>();
  for (const b of weekB) { if (!byChild.has(b.childId)) byChild.set(b.childId, []); byChild.get(b.childId)!.push(b); }
  const t = q.trim().toLowerCase();
  const rows = [...byChild.keys()].map(id => child(id)!).filter(c => c && (prog === "All" || c.programme === prog) && (!t || (childName(c) + " " + c.id).toLowerCase().includes(t)))
    .sort((a, b) => a.firstName.localeCompare(b.firstName));
  const todayKids = [...new Set(bookingsOn(TODAY, l.id).map(b => b.childId))];
  const stCount = (k: ChildDayStatus) => todayKids.filter(id => childStatus(id).status === k).length;
  const cell = (c: Child, d: string): ReactNode => {
    const bs = (byChild.get(c.id) || []).filter(b => b.date === d);
    if (!bs.length) return <Sub>off</Sub>;
    const times = bs.map(b => b.start + "–" + b.end).join(", ");
    if (d > TODAY) return <Stack gap={2}><Badge tone="info">Booked</Badge><Sub>{times}</Sub></Stack>;
    if (d === TODAY) { const st = childStatus(c.id); return <Stack gap={2}><Badge tone={STATUS_TONE[st.status]}>{st.status}</Badge><Sub>{st.time || times}</Sub></Stack>; }
    const ev = idx().attendanceByChildDate.get(c.id + "|" + d) || [];
    if (ev.some(e => e.kind === "absent")) return <Badge tone="warn">Absent</Badge>;
    const i = ev.filter(e => e.kind === "in").map(e => e.time).sort()[0], o = ev.filter(e => e.kind === "out").map(e => e.time).sort().slice(-1)[0];
    return i ? <Stack gap={2}><Badge tone="ok">Attended</Badge><Sub>{i}{o ? "–" + o : ""}</Sub></Stack> : <Badge tone="bad">No record</Badge>;
  };
  const cols: Col<Child>[] = [
    { key: "n", label: "Child", w: "1.4fr", render: c => <Stack><RecLink mono={false} r={{ kind: "child", id: c.id }}>{childName(c)}</RecLink><Sub>{c.programme === "EY" ? idx().room.get(c.roomId)?.name : c.schoolClass}{c.routeId ? " · " + c.routeId : ""}</Sub></Stack>, sort: c => c.firstName },
    ...THIS_WEEK.map(d => ({ key: d, label: (d === TODAY ? "Today · " : "") + fmtDay(d), w: "1fr", render: (c: Child) => cell(c, d) })),
    { key: "h", label: "Hours", w: ".5fr", align: "right", render: c => (byChild.get(c.id) || []).reduce((n, b) => n + b.hours, 0), sort: c => (byChild.get(c.id) || []).reduce((n, b) => n + b.hours, 0) },
  ];
  return (
    <Page>
      <PageHead eyebrow="Children · Attendance" title={"Attendance · " + l.short}
        sub={"Week of " + fmtDate(THIS_WEEK[0]) + ". Past days come from the kiosk log, today is live and later days show bookings. The kiosk signs children in and out with a collector check."}
        right={<select className="ros-input" style={{ width: 190 }} value={l.id} onChange={(e) => { setLoc(e.target.value); setFocus({ locationId: e.target.value }); }} aria-label="Location" disabled={locs.length === 1}>{locs.map(x => <option key={x.id} value={x.id}>{x.short}</option>)}</select>} />
      <Grid min={140} style={{ marginBottom: 16 }}>
        <Kpi label="Booked today" value={todayKids.length} />
        <Kpi label="Signed in" value={stCount("Signed in")} tone="ok" />
        <Kpi label="Expected" value={stCount("Expected")} />
        <Kpi label="Signed out" value={stCount("Signed out")} sub="Incl. walked to school" />
        <Kpi label="On the bus" value={stCount("On bus")} />
        <Kpi label="Absent or missing" value={stCount("Absent") + stCount("Not present")} tone={stCount("Not present") ? "bad" : stCount("Absent") ? "warn" : "ok"} />
      </Grid>
      <div className="ros-split">
        <Card pad={false} title="Week grid" sub={rows.length + " children booked this week"}
          right={<Row wrap gap={8}><Seg size="sm" value={prog} onChange={setProg} options={[["All", "All"], ["EY", "EY"], ["SAC", "SAC"]] as ["All" | "EY" | "SAC", ReactNode][]} /><Search value={q} onChange={setQ} placeholder="Child" width={150} /></Row>}>
          <Table rows={rows} cols={cols} rowKey={c => c.id} minWidth={860} dense pageSize={20} empty="Nobody booked this week" onRow={c => setFocus({ childId: c.id })} />
        </Card>
        <Kiosk key={l.id + "|" + (fc && fc.locationId === l.id ? fc.id : "")} locId={l.id} initial={fc && fc.locationId === l.id ? fc.id : undefined} />
      </div>
      <div style={{ marginTop: 10 }}><Sub>Demo clock {hm(s.clockMin)}. Recording a later time on the kiosk moves the demo clock forward.</Sub></div>
    </Page>
  );
}

function Kiosk({ locId, initial }: { locId: string; initial?: string }) {
  const { s, role } = useRos();
  const today = bookingsOn(TODAY, locId);
  const ids = [...new Set(today.map(b => b.childId))];
  const [cid, setCid] = useState<string | undefined>(initial && ids.includes(initial) ? initial : ids.find(id => childStatus(id).status === "Expected") || ids[0]);
  const [q, setQ] = useState("");
  const [time, setTime] = useState(hm(s.clockMin));
  const [who, setWho] = useState<string>("");
  const [reason, setReason] = useState("Unwell");
  const c = cid ? child(cid) : undefined;
  const t = q.trim().toLowerCase();
  const list = ids.map(id => child(id)!).filter(x => x && (!t || childName(x).toLowerCase().includes(t))).sort((a, b) => a.firstName.localeCompare(b.firstName)).slice(0, t ? 8 : 6);
  if (!c) return <Card title="Kiosk"><Empty title="Nobody booked here today" /></Card>;
  const st = childStatus(c.id);
  const bks = today.filter(b => b.childId === c.id);
  const collectors = c.collectors;
  const chosen = collectors.find(x => x.name === who);
  const other = who === "__other";
  const lateMins = Math.max(0, toMin(time || "00:00") - toMin("18:00"));
  const rate = locById(c.locationId)?.hourlyRate || 0;
  const by = role.person;
  const canIn = st.status !== "Signed in" && st.status !== "Absent";
  const canOut = st.status === "Signed in";
  const outOk = !!chosen && chosen.permitted;
  const doOut = () => {
    if (!chosen) return;
    if (lateMins > 0) confirmThen({ title: "Late collection: " + lateMins + " min after 18:00", body: c.firstName + " collected at " + time + " by " + chosen.name + ". Under the next-full-hour rule one extra hour (" + euro(rate) + ") is added to this week's invoice for the " + family(c.familyId)?.surname + " family.", confirmLabel: "Sign out and bill", run: () => signOut({ childId: c.id, time, by, collector: chosen.name, lateMins }) });
    else signOut({ childId: c.id, time, by, collector: chosen.name });
  };
  return (
    <Card title="Kiosk · today" sub={"Signing in and out at " + locById(locId)?.short + " as " + by}>
      <Search value={q} onChange={setQ} placeholder="Find a child booked today" width="100%" />
      <div style={{ margin: "8px 0 12px" }}>
        {list.map(x => { const xs = childStatus(x.id).status; return <ListRow key={x.id} onClick={() => { setCid(x.id); setWho(""); setQ(""); }} tone={x.id === c.id ? "accent" : undefined} lead={<Avatar name={childName(x)} size={26} />} title={childName(x)} sub={bookingsOn(TODAY, locId).filter(b => b.childId === x.id).map(b => b.session + " " + b.start + "–" + b.end).join(" · ")} right={<Badge tone={STATUS_TONE[xs]}>{xs}</Badge>} />; })}
      </div>
      <div style={{ padding: 14, borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <Row gap={10} style={{ marginBottom: 10 }}>
          <Avatar name={childName(c)} size={36} />
          <Stack gap={2}><span style={{ fontSize: 15, fontWeight: 600 }}>{childName(c)}</span><Sub>{bks.map(b => b.session + " " + b.start + "–" + b.end).join(" · ")}</Sub></Stack>
          <div style={{ flex: 1 }} />
          <Badge tone={STATUS_TONE[st.status]}>{st.status}{st.time ? " " + st.time : ""}</Badge>
        </Row>
        {role.medical && c.medical.some(m => m.severity !== "Info") && <div style={{ marginBottom: 10 }}><Callout tone={c.medical.some(m => m.severity === "Severe") ? "bad" : "warn"} title="Medical alert">{c.medical.map(m => m.kind + ": " + m.detail).join(" · ")}</Callout></div>}
        {!role.medical && c.medical.length > 0 && <div style={{ marginBottom: 10 }}><Badge tone="warn">Medical flag on file</Badge></div>}
        <Stack gap={10}>
          <div className="ros-split-even">
            <Field label="Time"><input type="time" className="ros-input" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
            <Field label={canOut ? "Collected by" : "Dropped off by"}>
              <select className="ros-input" value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="">Choose…</option>
                {collectors.map(x => <option key={x.name} value={x.name}>{x.name} · {x.permitted ? x.relation : "NOT permitted"}</option>)}
                <option value="__other">Someone not on the list</option>
              </select>
            </Field>
          </div>
          {time !== hm(s.clockMin) && <Row gap={8}><Sub>Kiosk time differs from the demo clock ({hm(s.clockMin)}).</Sub><Btn size="sm" variant="subtle" onClick={() => setTime(hm(s.clockMin))}>Use now</Btn></Row>}
          {canOut && chosen && !chosen.permitted && <Callout tone="bad" title={"Do not release to " + chosen.name}>{role.medical || role.id === "driver" ? chosen.note || "Not permitted" : "Not permitted"}. Keep {c.firstName} inside and call the location manager.</Callout>}
          {canOut && other && <Callout tone="bad" title="Not on the authorised list">Do not release. Phone {family(c.familyId)?.guardians[0]?.name} first; they can add a collector in MyRosKids.</Callout>}
          {canOut && chosen?.permitted && chosen.note && (role.medical || role.id === "driver") && <Callout tone="info" title="Note on file">{chosen.note}</Callout>}
          {canOut && lateMins > 0 && outOk && <Callout tone="warn" title={"Late collection · " + lateMins + " min"}>One extra hour ({euro(rate)}) will be added to this week's invoice.</Callout>}
          {c.programme === "SAC" && st.status === "Expected" && toMin(time) < toMin("13:30") && <Sub>After-school sign-in usually happens from 14:00. Use “Advance to afternoon” in the header for the school run.</Sub>}
          <Row wrap>
            <Btn variant="primary" disabled={!canIn} onClick={() => signIn({ childId: c.id, time, by, collector: chosen?.name, routeId: st.status === "On bus" ? c.routeId : undefined })}>{st.status === "On bus" ? "Arrived on " + c.routeId : "Sign in"}</Btn>
            <Btn variant="ok" disabled={!canOut || !outOk} onClick={doOut}>Sign out</Btn>
            {st.status === "Expected" && <Btn variant="subtle" onClick={() => confirmThen({ title: "Mark " + c.firstName + " absent today?", body: "Reason: " + reason + ". The register, site dashboard and family timeline update." + (c.routeId ? " Tell the " + c.routeId + " driver." : ""), confirmLabel: "Mark absent", run: () => markAbsent({ childId: c.id, reason }) })}>Mark absent</Btn>}
          </Row>
          {st.status === "Expected" && <Field label="Absence reason"><select className="ros-input" value={reason} onChange={(e) => setReason(e.target.value)}>{["Unwell", "Family holiday", "Appointment", "Parent called, no reason given"].map(x => <option key={x} value={x}>{x}</option>)}</select></Field>}
        </Stack>
      </div>
      <div style={{ marginTop: 10 }}><Sub>Last change: {st.by ? st.by + (st.collector ? " · " + st.collector : "") : "none today"}</Sub></div>
    </Card>
  );
}

/* ---------------- Learning & Incidents ---------------- */
const AISTEAR = ["Aistear: Wellbeing", "Aistear: Identity and Belonging", "Aistear: Communicating", "Aistear: Exploring and Thinking"];
function LearningIncidents() {
  const { s, role } = useRos();
  const eyRooms = s.rooms.filter(r => r.kind !== "SAC" && inScope(r.locationId));
  const [room, setRoom] = useState("All");
  const [tag, setTag] = useState("All");
  const [status, setStatus] = useState("All");
  const entries = s.diary.filter(d => inScope(child(d.childId)?.locationId) && (room === "All" || d.roomId === room));
  const obs = entries.filter(d => d.observation && (tag === "All" || d.observation.tags.includes(tag)) && (status === "All" || d.status === status));
  const tagCount = new Map<string, number>();
  for (const d of entries) for (const t of d.observation?.tags || []) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  for (const a of AISTEAR) if (!tagCount.has(a)) tagCount.set(a, 0);
  const tags = ["All", ...[...tagCount.keys()].sort()];
  const gaps = AISTEAR.filter(a => !tagCount.get(a));
  const canInc = role.safeguarding || role.medical;
  const inc = s.incidents.filter(i => inScope(i.locationId)).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const incCols: Col<Incident>[] = [
    { key: "id", label: "Incident", w: ".8fr", render: i => <RecLink r={{ kind: "incident", id: i.id }} /> },
    { key: "c", label: "Child", w: "1.2fr", render: i => <RecLink mono={false} r={{ kind: "child", id: i.childId }}>{childName(child(i.childId))}</RecLink> },
    { key: "w", label: "When and where", w: "1.3fr", render: i => <Stack><span>{fmtDay(i.date)} {i.time}</span><Sub>{locById(i.locationId)?.short}</Sub></Stack>, sort: i => i.date + i.time },
    { key: "k", label: "What happened", w: "1.5fr", render: i => i.kind },
    { key: "s", label: "Severity", w: ".8fr", render: i => <Badge tone={i.severity === "Notifiable" ? "bad" : i.severity === "Moderate" ? "warn" : "neutral"}>{i.severity}</Badge> },
    { key: "p", label: "Parent", w: "1fr", render: i => <Stack gap={2}><Sub>{i.parentNotified ? "Notified" : "Not yet notified"}</Sub><Sub>{i.parentSigned ? "Signed" : "Signature pending"}</Sub></Stack> },
    { key: "m", label: "Manager", w: ".8fr", render: i => <Badge tone={i.managerReviewed ? "ok" : "warn"}>{i.managerReviewed ? "Reviewed" : "To review"}</Badge> },
    { key: "st", label: "Status", w: "1fr", render: i => <StatusBadge s={i.status} /> },
  ];
  const sum = (k: string) => entries.filter(d => d.status === k).length;
  return (
    <Page>
      <PageHead eyebrow="Children · Learning and incidents" title="Learning journals and incident records"
        sub="Observations from the Early Years rooms tagged to Aistear themes and Síolta standards, then every accident and incident with its sign-off trail." />
      <Grid min={150} style={{ marginBottom: 16 }}>
        <Kpi label="Diary entries today" value={entries.length} sub={eyRooms.length + " EY room" + (eyRooms.length === 1 ? "" : "s") + " in scope"} />
        <Kpi label="Tagged observations" value={entries.filter(d => d.observation).length} tone="info" />
        <Kpi label="Ready for review" value={sum("Ready for review")} tone="warn" />
        <Kpi label="Open incidents" value={canInc ? inc.filter(i => i.status !== "Closed").length : "Restricted"} tone="warn" />
        <Kpi label="Awaiting parent signature" value={canInc ? inc.filter(i => i.status === "Awaiting signature").length : "Restricted"} />
      </Grid>
      {eyRooms.length ? (
        <div className="ros-split" style={{ marginBottom: 16 }}>
          <Card title="Learning journal" sub={obs.length + " observation" + (obs.length === 1 ? "" : "s")}
            right={<Row wrap gap={8}>
              <select className="ros-input" style={{ width: 170 }} value={room} onChange={(e) => setRoom(e.target.value)} aria-label="Room"><option value="All">All EY rooms</option>{eyRooms.map(r => <option key={r.id} value={r.id}>{r.name} · {locById(r.locationId)?.short}</option>)}</select>
              <select className="ros-input" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">{["All", "Draft", "Ready for review", "Published"].map(x => <option key={x} value={x}>{x === "All" ? "Any status" : x}</option>)}</select>
            </Row>}>
            <div style={{ marginBottom: 12 }}><Seg size="sm" value={tag} onChange={setTag} options={tags.map(x => [x, x === "All" ? "All tags" : x.replace("Aistear: ", "").replace("Síolta: ", "Síolta · ")] as [string, ReactNode])} /></div>
            {obs.map(d => { const c = child(d.childId)!; return (
              <div key={d.id} style={{ padding: "12px 0", borderTop: "1px solid var(--border)" }}>
                <Row wrap gap={8}>
                  <Avatar name={childName(c)} size={26} />
                  <RecLink mono={false} r={{ kind: "child", id: c.id }}>{childName(c)}</RecLink>
                  <Sub>{idx().room.get(d.roomId)?.name} · {rel(d.date + " 00:00").replace(" 00:00", "")} · {d.author}</Sub>
                  <div style={{ flex: 1 }} />
                  <StatusBadge s={d.status} />
                </Row>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--body)", margin: "8px 0 8px 34px" }}>{d.observation!.text}</div>
                <Row wrap gap={6} style={{ marginLeft: 34 }}>
                  {d.observation!.tags.map(t => <Badge key={t} tone={t.startsWith("Aistear") ? "accent" : "info"}>{t}</Badge>)}
                  <Btn size="sm" variant="subtle" onClick={() => nav("EarlyYears", "Learning Journals", { childId: c.id })}>Open journal</Btn>
                </Row>
              </div>
            ); })}
            {!obs.length && <Empty title="No observations match" body="Observations come from the Daily Diary agent's drafts; a practitioner reviews and publishes them." />}
          </Card>
          <Stack gap={14}>
            <Card title="Framework coverage today" sub="Aistear themes and Síolta standards tagged">
              <HBars items={[...tagCount.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, tone: v ? "accent" as const : "neutral" as const, onClick: () => setTag(k) }))} />
              {gaps.length > 0 && <div style={{ marginTop: 12 }}><Callout tone="info" title="Plan next">{gaps.map(g => g.replace("Aistear: ", "")).join(", ")} {gaps.length === 1 ? "has" : "have"} no observations today. Suggest a focus in tomorrow's room plan.</Callout></div>}
            </Card>
            <Card title="Diary progress">
              <StackBar parts={[{ label: "Draft " + sum("Draft"), value: sum("Draft"), tone: "neutral" }, { label: "Ready " + sum("Ready for review"), value: sum("Ready for review"), tone: "warn" }, { label: "Published " + sum("Published"), value: sum("Published"), tone: "ok" }]} />
              <Row style={{ marginTop: 12 }}><Btn size="sm" onClick={() => nav("EarlyYears", "Daily Diaries")}>Review diaries</Btn></Row>
            </Card>
          </Stack>
        </div>
      ) : <div style={{ marginBottom: 16 }}><Card title="Learning journal"><Empty title="No Early Years rooms in scope" body="School-age children have activity notes rather than learning journals." /></Card></div>}
      <Card title="Incidents" sub="Accidents and incidents with notification, signature and review status" pad={!canInc}>
        {canInc ? <Table rows={inc} cols={incCols} rowKey={i => i.id} minWidth={940} empty="No incidents recorded in scope" rowTone={i => i.status === "Open" ? "warn" : undefined} onRow={i => openRecord({ kind: "incident", id: i.id })} />
          : <Masked what="Incident detail" />}
      </Card>
    </Page>
  );
}
