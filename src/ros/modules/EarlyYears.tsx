/* Early Years. Rooms, diaries, learning journals, weekly plans and wellbeing
   for the Hazelbrook and Arklow Crèche rooms. The Daily Diary agent drafts;
   a practitioner reviews and publishes every entry. Ratios are demo
   thresholds: configurable, illustrative, not official legal verification. */
import { useState } from "react";
import type { Room, DiaryEntry, Child, Tone } from "../types";
import { useRos, nav, openRecord, confirmThen, defineAction } from "../store";
import { idx, inScope, bookingsOn, ratioCheck, childStatus, childName, staffById, locById } from "../selectors";
import { addTask } from "../actions";
import { TODAY, THIS_WEEK, NEXT_SCHOOL_WEEK, fmtDay, fmtDate, addDays } from "../time";
import {
  Page, PageHead, Card, Kpi, Grid, Table, Badge, StatusBadge, Btn, RecLink, HBars, Line, StackBar, Meter, Callout, Seg,
  ListRow, DemoTag, Empty, Avatar, Row, Stack, Sub, Label, Field,
} from "../ui";

/* ---------------- shared ---------------- */
type DiaryEdit = Partial<Pick<DiaryEntry, "meals" | "sleep" | "nappies" | "mood" | "activity" | "note">>;
const FIELDS: [keyof DiaryEdit, string][] = [["meals", "Meals"], ["sleep", "Sleep"], ["nappies", "Nappies / toilet"], ["mood", "Mood"], ["activity", "Activity"], ["note", "Note for home"]];
const AISTEAR = ["Aistear: Well-being", "Aistear: Identity and Belonging", "Aistear: Communicating", "Aistear: Exploring and Thinking"];
const SIOLTA = ["Síolta: Play", "Síolta: Interactions", "Síolta: Curriculum", "Síolta: Environments", "Síolta: Parents and Families"];
const TAGS = AISTEAR.concat(SIOLTA);
const RULES: [RegExp, string[]][] = [
  [/sort|count|colou?r|size|group|explain|build|tower|measure|why|how|question|pattern/i, ["Aistear: Exploring and Thinking", "Síolta: Curriculum"]],
  [/talk|told|word|song|sing|story|asked|said|name|book|chat/i, ["Aistear: Communicating"]],
  [/shar|friend|turn|help|together|kind/i, ["Aistear: Identity and Belonging", "Síolta: Interactions"]],
  [/calm|settled|climb|run|independent|wash|ate|rest|happy|confident/i, ["Aistear: Well-being"]],
  [/play|pretend|game|dress|role/i, ["Síolta: Play"]],
  [/outside|garden|tray|sand|water|walk|leaf|leaves/i, ["Síolta: Environments"]],
  [/parent|home|family|mam|dad|granny/i, ["Síolta: Parents and Families"]],
];
export function suggestTags(text: string): string[] {
  const out = new Set<string>();
  for (const [re, tags] of RULES) if (re.test(text)) tags.forEach(t => out.add(t));
  return TAGS.filter(t => out.has(t)).slice(0, 4);
}
const hash = (str: string) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
function useRooms() {
  const { s } = useRos();
  return s.rooms.filter(r => r.kind !== "SAC" && inScope(r.locationId));
}
const NoRooms = () => <Card><Empty title="No Early Years rooms in view" body="Early Years runs at Hazelbrook and Arklow Crèche. Switch the location filter to see them." /></Card>;
const Restricted = () => <Card><Callout tone="neutral" title="Staff only">Child-level Early Years records are visible to staff roles only.</Callout></Card>;
const isStaff = (id: string) => id !== "parent" && id !== "driver";
function RoomSeg({ rooms, value, onChange, all = true }: { rooms: Room[]; value: string; onChange: (v: string) => void; all?: boolean }) {
  const opts = (all ? [["ALL", "All rooms"] as [string, string]] : []).concat(rooms.map(r => [r.id, r.name + (rooms.some(x => x.locationId !== r.locationId) ? " · " + (r.locationId === "HAZ" ? "HAZ" : "ARC") : "")] as [string, string]));
  return <Seg size="sm" options={opts} value={value} onChange={onChange} />;
}

/* ---------------- actions ---------------- */
export const saveDiary = defineAction<{ id: string; edit: DiaryEdit }>("ey.diarySave", (s, p, ctx) => {
  const d = s.diary.find(x => x.id === p.id); if (!d || d.status === "Published") return;
  for (const [k] of FIELDS) { const v = p.edit[k]; if (typeof v === "string") d[k] = v; }
  d.status = "Ready for review";
  const c = s.children.find(x => x.id === d.childId)!;
  ctx.log({ category: "Operations", title: "Diary reviewed: " + c.firstName + " " + c.surname, detail: "Edited by " + ctx.actor + " and marked ready. Not yet published to the family.", link: { kind: "child", id: c.id }, locationId: c.locationId });
}, { toast: () => "Saved and marked ready. Not published yet." });

export const publishDiaries = defineAction<{ ids: string[]; edits: Record<string, DiaryEdit> }>("ey.diaryPublish", (s, p, ctx) => {
  const done: Child[] = [];
  for (const id of p.ids) {
    const d = s.diary.find(x => x.id === id); if (!d || d.status === "Published") continue;
    const e = p.edits[id] || {};
    for (const [k] of FIELDS) { const v = e[k]; if (typeof v === "string") d[k] = v; }
    d.status = "Published";
    const c = s.children.find(x => x.id === d.childId)!;
    done.push(c);
    ctx.comm(c.familyId, "App", "out", c.firstName + "'s daily diary for " + fmtDay(d.date) + " published to MyRosKids (simulated)", ctx.actor);
  }
  if (!done.length) return;
  ctx.log({ category: "Operations", title: done.length === 1 ? "Daily diary published: " + done[0].firstName + " " + done[0].surname : done.length + " daily diaries published",
    detail: "Reviewed and approved by " + ctx.actor + ". Drafted by the Daily Diary agent; nothing is published without a practitioner's review. Families notified in MyRosKids (simulated).",
    link: done.length === 1 ? { kind: "child", id: done[0].id } : undefined, locationId: done[0].locationId });
  ctx.agent("diary", done.length + " diar" + (done.length === 1 ? "y" : "ies") + " approved by " + ctx.actor + " and published", "action");
}, { toast: (p) => (p.ids.length === 1 ? "Published" : p.ids.length + " diaries published") + " to MyRosKids (simulated).", undo: true });

export const approveObs = defineAction<{ diaryId: string; tags: string[]; text?: string }>("ey.obsApprove", (s, p, ctx) => {
  const d = s.diary.find(x => x.id === p.diaryId); if (!d) return;
  if (p.text !== undefined) d.observation = { text: p.text, tags: p.tags };
  else if (d.observation) d.observation.tags = p.tags;
  else return;
  const c = s.children.find(x => x.id === d.childId)!;
  ctx.log({ category: "Operations", title: "Observation approved", detail: d.id + " · " + c.firstName + " " + c.surname + " · " + p.tags.join(", ") + ". Tags confirmed by " + ctx.actor + ".", link: { kind: "child", id: c.id }, locationId: c.locationId });
}, { toast: () => "Observation saved to the learning journal.", undo: true });

export const planDecision = defineAction<{ roomId: string; week: string; approve: boolean; summary: string }>("ey.plan", (s, p, ctx) => {
  const r = s.rooms.find(x => x.id === p.roomId); if (!r) return;
  const key = r.name + " (" + r.id + ") · w/c " + fmtDate(p.week);
  const leader = s.staff.find(x => x.locationId === r.locationId && x.role === "Room Leader" && s.children.some(c => c.roomId === r.id && c.keyWorkerId === x.id)) || s.staff.find(x => x.locationId === r.locationId && x.role === "Room Leader");
  s.tasks.forEach(t => { if (t.title.includes("weekly plan: " + key) && t.status !== "Done") t.status = "Done"; });
  if (p.approve) {
    s.tasks.push({ id: ctx.id("TSK"), title: "Approve weekly plan: " + key, owner: ctx.actor, due: "Done", dueDate: TODAY, priority: "Low", department: "Early Years", status: "Done", link: { kind: "location", id: r.locationId }, source: "Weekly planning", locationId: r.locationId });
    ctx.log({ category: "Operations", title: "Weekly plan approved: " + key, detail: p.summary, link: { kind: "location", id: r.locationId }, locationId: r.locationId });
  } else {
    s.tasks.push({ id: ctx.id("TSK"), title: "Revise weekly plan: " + key, owner: leader?.name || "Room leader", due: fmtDay(addDays(p.week, -1)), dueDate: addDays(p.week, -1), priority: "Medium", department: "Early Years", status: "Not started", link: { kind: "location", id: r.locationId }, source: ctx.actor, locationId: r.locationId });
    ctx.log({ category: "Operations", title: "Weekly plan sent back: " + key, detail: p.summary, link: { kind: "location", id: r.locationId }, locationId: r.locationId });
  }
}, { toast: (p) => p.approve ? "Plan approved. Task completed and logged." : "Sent back to the room leader with a task.", undo: true });

/* ---------------- Rooms ---------------- */
function roomInfo(r: Room) {
  const booked = bookingsOn(TODAY, r.locationId, "Full Day").filter(b => b.roomId === r.id);
  const st = booked.map(b => ({ b, st: childStatus(b.childId) }));
  const present = st.filter(x => x.st.status === "Signed in");
  const rc = ratioCheck(r.locationId, TODAY, "Full Day", r.id);
  const needNow = Math.ceil(present.length / r.ratio);
  return { booked, st, present, rc, needNow, okNow: rc.rostered >= needNow, expected: st.filter(x => x.st.status === "Expected").length, gone: st.filter(x => x.st.status === "Signed out").length };
}
function Rooms() {
  const { s, ui, role } = useRos();
  const rooms = useRooms();
  const [sel, setSel] = useState<string>(ui.focus.roomId || "");
  if (!isStaff(role.id)) return <Page><Restricted /></Page>;
  if (!rooms.length) return <Page><PageHead eyebrow="Early Years" title="Rooms" /><NoRooms /></Page>;
  const room = rooms.find(r => r.id === sel) || rooms[0];
  const all = rooms.map(r => ({ r, i: roomInfo(r) }));
  const tot = all.reduce((a, x) => ({ present: a.present + x.i.present.length, booked: a.booked + x.i.booked.length, cap: a.cap + x.r.capacity, staff: a.staff + x.i.rc.rostered }), { present: 0, booked: 0, cap: 0, staff: 0 });
  const info = roomInfo(room);
  const enrolled = s.children.filter(c => c.roomId === room.id);
  const diary = new Map(s.diary.filter(d => d.date === TODAY && d.roomId === room.id).map(d => [d.childId, d]));
  return (
    <Page>
      <PageHead eyebrow="Early Years" title="Rooms" sub={"Live occupancy and ratio for each room at " + fmtDay(TODAY) + ". Ratios: Crèche 1:5, Preschool junior 1:6, ECCE 1:8 (demo thresholds, configurable, not official legal verification)."} right={<DemoTag>Demo thresholds</DemoTag>} />
      <Grid min={150} style={{ marginBottom: 16 }}>
        <Kpi label="Children here now" value={tot.present} sub={tot.booked + " booked today"} tone="ok" />
        <Kpi label="Places" value={tot.cap} sub={Math.round((tot.booked / Math.max(1, tot.cap)) * 100) + "% booked today"} />
        <Kpi label="Staff rostered" value={tot.staff} />
        <Kpi label="Rooms short now" value={all.filter(x => !x.i.okNow).length} tone={all.some(x => !x.i.okNow) ? "bad" : "ok"} />
        <Kpi label="Diaries to review" value={s.diary.filter(d => d.date === TODAY && d.status !== "Published" && rooms.some(r => r.id === d.roomId)).length} tone="warn" onClick={() => nav("EarlyYears", "Daily Diaries")} />
      </Grid>
      <Grid min={260} style={{ marginBottom: 16 }}>
        {all.map(({ r, i }) => (
          <Card key={r.id} onClick={() => setSel(r.id)} tone={r.id === room.id ? "accent" : !i.okNow ? "bad" : undefined} title={r.name} sub={r.kind + " · " + r.ageBand + " · " + locById(r.locationId)?.short}
            right={<Badge tone={i.okNow ? "ok" : "bad"} dot={!i.okNow}>{i.okNow ? "Ratio OK" : "Short now"}</Badge>}>
            <Meter label="Booked today vs places" value={i.booked.length} max={r.capacity} />
            <Row wrap gap={6} style={{ marginTop: 10 }}>
              <Badge tone="ok">{i.present.length} here</Badge><Badge>{i.expected} expected</Badge>{i.gone > 0 && <Badge>{i.gone} gone home</Badge>}
            </Row>
            <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--body)" }}>Live 1:{r.ratio}: {i.present.length} children need {i.needNow}, {i.rc.rostered} on shift. Day forecast {i.rc.booked} booked, {i.rc.required} required.</div>
            <Row gap={4} style={{ marginTop: 10 }}>{i.rc.shifts.slice(0, 6).map(x => <span key={x.id} title={staffById(x.staffId)?.name}><Avatar name={staffById(x.staffId)?.name || "?"} size={24} /></span>)}</Row>
          </Card>
        ))}
      </Grid>
      <div className="ros-split">
        <Card title={room.name + " · today"} sub={enrolled.length + " enrolled · " + info.booked.length + " booked · " + info.present.length + " here now"} pad={false}
          right={<Btn size="sm" onClick={() => nav("EarlyYears", "Daily Diaries", { roomId: room.id })}>Diaries</Btn>}>
          <Table rowKey={x => x.b.id} rows={info.st.slice().sort((a, b) => childName(idx().child.get(a.b.childId)).localeCompare(childName(idx().child.get(b.b.childId))))} minWidth={620} dense onRow={x => openRecord({ kind: "child", id: x.b.childId })}
            cols={[
              { key: "c", label: "Child", w: "1.4fr", render: x => { const c = idx().child.get(x.b.childId)!; return <Row gap={8}><Avatar name={childName(c)} size={24} /><span>{childName(c)}</span>{c.supports && <Badge tone="info">AIM</Badge>}</Row>; } },
              { key: "t", label: "Booked", w: ".9fr", render: x => x.b.start + "–" + x.b.end },
              { key: "s", label: "Status", w: "1fr", render: x => <StatusBadge s={x.st.status + (x.st.time ? " " + x.st.time : "")} /> },
              { key: "k", label: "Key worker", w: "1.1fr", render: x => staffById(idx().child.get(x.b.childId)!.keyWorkerId)?.name.split(" ")[0] || "" },
              { key: "m", label: "Medical", w: ".9fr", render: x => { const c = idx().child.get(x.b.childId)!; return !c.medical.length ? "" : role.medical ? <Badge tone={c.medical.some(m => m.severity === "Severe") ? "bad" : c.medical.some(m => m.severity === "Moderate") ? "warn" : "neutral"} title={c.medical.map(m => m.detail).join("; ")}>{c.medical.map(m => m.kind).join(", ")}</Badge> : <Badge tone="warn">Restricted</Badge>; } },
              { key: "d", label: "Diary", w: ".9fr", render: x => { const d = diary.get(x.b.childId); return d ? <StatusBadge s={d.status} /> : <Sub>Not started</Sub>; } },
            ]} />
        </Card>
        <Stack gap={14}>
          <Card title="Ratio now" tone={info.okNow ? undefined : "bad"}>
            <Meter label={"Staff on shift vs needed now (1:" + room.ratio + ")"} value={info.rc.rostered} max={Math.max(1, info.needNow)} tone={info.okNow ? "ok" : "bad"} />
            <div style={{ marginTop: 10 }}><Meter label="Staff vs needed for the day's bookings" value={info.rc.rostered} max={Math.max(1, info.rc.required)} tone={info.rc.ok ? "ok" : "bad"} /></div>
            {!info.rc.ok && <div style={{ marginTop: 10 }}><Btn size="sm" variant="danger" onClick={() => nav("Staff", "Absence & Relief")}>Find cover</Btn></div>}
          </Card>
          <Card title="Key workers">
            {Array.from(new Set(enrolled.map(c => c.keyWorkerId))).map(id => staffById(id)!).filter(Boolean).map(st => {
              const kids = enrolled.filter(c => c.keyWorkerId === st.id); const on = info.rc.shifts.some(x => x.staffId === st.id);
              return <ListRow key={st.id} onClick={() => openRecord({ kind: "staff", id: st.id })} lead={<Avatar name={st.name} size={28} />} title={st.name} sub={st.role + " · key worker for " + kids.length} right={<Badge tone={on ? "ok" : "neutral"}>{on ? "On shift" : "Off today"}</Badge>} />;
            })}
          </Card>
        </Stack>
      </div>
    </Page>
  );
}

/* ---------------- Daily Diaries ---------------- */
function Diaries() {
  const { s, ui, role } = useRos();
  const rooms = useRooms();
  const [room, setRoom] = useState<string>(ui.focus.roomId || "ALL");
  const [st, setSt] = useState<"All" | DiaryEntry["status"]>("All");
  const [edits, setEdits] = useState<Record<string, DiaryEdit>>({});
  if (!isStaff(role.id)) return <Page><Restricted /></Page>;
  if (!rooms.length) return <Page><PageHead eyebrow="Early Years" title="Daily Diaries" /><NoRooms /></Page>;
  const R = room === "ALL" || rooms.some(r => r.id === room) ? room : "ALL";
  const entries = s.diary.filter(d => d.date === TODAY && rooms.some(r => r.id === d.roomId) && (R === "ALL" || d.roomId === R));
  const shown = entries.filter(d => st === "All" || d.status === st).sort((a, b) => ({ "Ready for review": 0, Draft: 1, Published: 2 }[a.status] - { "Ready for review": 0, Draft: 1, Published: 2 }[b.status]) || a.id.localeCompare(b.id));
  const ready = entries.filter(d => d.status === "Ready for review");
  const setField = (id: string, k: keyof DiaryEdit, v: string) => setEdits(e => ({ ...e, [id]: { ...e[id], [k]: v } }));
  return (
    <Page>
      <PageHead eyebrow="Early Years" title="Daily Diaries" sub="Drafted by the Daily Diary agent from practitioner notes. Nothing reaches a family until a practitioner reviews it and presses publish." right={<DemoTag>AI drafts</DemoTag>} />
      <Grid min={150} style={{ marginBottom: 14 }}>
        <Kpi label="Drafts" value={entries.filter(d => d.status === "Draft").length} tone="warn" />
        <Kpi label="Ready for review" value={ready.length} tone={ready.length ? "info" : undefined} />
        <Kpi label="Published today" value={entries.filter(d => d.status === "Published").length} tone="ok" />
        <Kpi label="Children with a diary" value={entries.length} sub="Signed-in children" />
      </Grid>
      <Row wrap gap={10} style={{ marginBottom: 14 }}>
        <RoomSeg rooms={rooms} value={R} onChange={setRoom} />
        <Seg size="sm" options={["All", "Draft", "Ready for review", "Published"] as ("All" | DiaryEntry["status"])[]} value={st} onChange={setSt} />
        <div style={{ flex: 1 }} />
        <Btn variant="primary" disabled={!ready.length} onClick={() => confirmThen({ title: "Publish " + ready.length + " ready diar" + (ready.length === 1 ? "y" : "ies") + "?", body: "You confirm you have read each one. They go to each family's MyRosKids timeline (simulated). Drafts that are not marked ready stay unpublished.", confirmLabel: "Approve and publish", run: () => publishDiaries({ ids: ready.map(d => d.id), edits }) })}>Approve all ready ({ready.length})</Btn>
      </Row>
      {shown.length ? (
        <Grid min={320} gap={12}>
          {shown.map(d => {
            const c = idx().child.get(d.childId)!, e = edits[d.id] || {}, pub = d.status === "Published";
            return (
              <Card key={d.id} title={<Row gap={8}><Avatar name={childName(c)} size={30} /><span>{childName(c)}</span></Row>} sub={idx().room.get(d.roomId)?.name + " · key worker " + d.author} right={<StatusBadge s={d.status} />}>
                <div style={{ display: "grid", gap: 8 }}>
                  {FIELDS.filter(([k]) => k !== "sleep" && k !== "nappies" || d[k] !== "n/a").map(([k, label]) => (
                    <Field key={k} label={label}>
                      {pub ? <div style={{ fontSize: 13, color: "var(--body)" }}>{d[k]}</div>
                        : <input className="ros-input" style={{ height: 40, fontSize: 13.5 }} value={e[k] ?? d[k]} onChange={ev => setField(d.id, k, ev.target.value)} />}
                    </Field>
                  ))}
                </div>
                {d.observation && <div style={{ marginTop: 10 }}><Callout tone="info" title="Observation" right={<Btn size="sm" variant="subtle" onClick={() => nav("EarlyYears", "Learning Journals", { roomId: d.roomId })}>Journal</Btn>}>{d.observation.text}</Callout></div>}
                {!pub && (
                  <Row gap={8} style={{ marginTop: 12 }}>
                    <Btn variant="primary" style={{ height: 42, flex: 1 }} onClick={() => publishDiaries({ ids: [d.id], edits: { [d.id]: e } })}>Approve and publish</Btn>
                    {d.status === "Draft" && <Btn style={{ height: 42 }} onClick={() => saveDiary({ id: d.id, edit: e })}>Mark ready</Btn>}
                  </Row>
                )}
                {pub && <div style={{ marginTop: 10 }}><Sub>On the family's MyRosKids timeline (simulated).</Sub></div>}
              </Card>
            );
          })}
        </Grid>
      ) : <Card><Empty title="No diaries match" body="Diaries are drafted for children once they are signed in." /></Card>}
    </Page>
  );
}

/* ---------------- Learning Journals ---------------- */
function Journals() {
  const { s, ui, role } = useRos();
  const rooms = useRooms();
  const [room, setRoom] = useState<string>(ui.focus.roomId || "ALL");
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [newChild, setNewChild] = useState("");
  const [newText, setNewText] = useState("");
  const [newTags, setNewTags] = useState<string[] | null>(null);
  if (!isStaff(role.id)) return <Page><Restricted /></Page>;
  if (!rooms.length) return <Page><PageHead eyebrow="Early Years" title="Learning Journals" /><NoRooms /></Page>;
  const R = room === "ALL" || rooms.some(r => r.id === room) ? room : "ALL";
  const approved = new Map<string, string>();
  for (const a of s.activity) if (a.title === "Observation approved") approved.set(a.detail.split(" ")[0], a.actor);
  const today = s.diary.filter(d => d.date === TODAY && rooms.some(r => r.id === d.roomId) && (R === "ALL" || d.roomId === R));
  const obs = today.filter(d => d.observation);
  const noObs = today.filter(d => !d.observation);
  const suggested = suggestTags(newText);
  const tagsNew = newTags ?? suggested;
  const coverage = AISTEAR.map(t => ({ label: t.replace("Aistear: ", ""), value: obs.filter(d => d.observation!.tags.includes(t)).length }));
  const tog = (list: string[], t: string) => list.includes(t) ? list.filter(x => x !== t) : list.concat(t);
  return (
    <Page>
      <PageHead eyebrow="Early Years" title="Learning Journals" sub="Observations linked to Aistear themes and Síolta standards. Tags suggested by AI are labelled until a practitioner confirms them." right={<DemoTag>AI-suggested tags</DemoTag>} />
      <Row wrap gap={10} style={{ marginBottom: 14 }}><RoomSeg rooms={rooms} value={R} onChange={setRoom} /></Row>
      <div className="ros-split">
        <Stack gap={12}>
          {obs.length ? obs.map(d => {
            const c = idx().child.get(d.childId)!, ok = approved.has(d.id);
            const tags = picked[d.id] ?? d.observation!.tags;
            return (
              <Card key={d.id} title={childName(c)} sub={idx().room.get(d.roomId)?.name + " · " + d.author + " · " + fmtDay(d.date)} right={ok ? <Badge tone="ok">Approved by {approved.get(d.id)}</Badge> : <Badge tone="info">AI-suggested tags</Badge>}>
                <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--body)" }}>{d.observation!.text}</div>
                <Row wrap gap={6} style={{ marginTop: 10 }}>
                  {(ok ? d.observation!.tags : TAGS).map(t => {
                    const on = tags.includes(t);
                    return ok ? <Badge key={t} tone="accent">{t}</Badge> : (
                      <button key={t} className="ros-focus" onClick={() => setPicked(p => ({ ...p, [d.id]: tog(tags, t) }))}
                        style={{ height: 26, padding: "0 10px", borderRadius: 999, fontSize: 11.5, cursor: "pointer", border: "1px solid " + (on ? "var(--accent-line)" : "var(--border)"), background: on ? "var(--accent-soft)" : "none", color: on ? "var(--accent)" : "var(--dim)" }}>
                        {t}{on && d.observation!.tags.includes(t) ? " · AI" : ""}
                      </button>
                    );
                  })}
                </Row>
                {!ok && <Row style={{ marginTop: 12 }}><Btn variant="primary" disabled={!tags.length} onClick={() => approveObs({ diaryId: d.id, tags })}>Approve tags</Btn><Sub>{tags.length} selected</Sub></Row>}
              </Card>
            );
          }) : <Card><Empty title="No observations yet today" body="Add one on the right, or wait for the Daily Diary agent to draft them from room notes." /></Card>}
        </Stack>
        <Stack gap={14}>
          <Card title="New observation" sub="Write what you saw. Tags are suggested from your words; you choose what is saved.">
            <div style={{ display: "grid", gap: 10 }}>
              <Field label="Child"><select className="ros-input" value={newChild} onChange={e => setNewChild(e.target.value)}><option value="">Choose a child ({noObs.length})</option>{noObs.map(d => { const c = idx().child.get(d.childId)!; return <option key={d.id} value={d.id}>{childName(c)} · {idx().room.get(d.roomId)?.name}</option>; })}</select></Field>
              <Field label="Observation"><textarea className="ros-input" rows={4} value={newText} onChange={e => { setNewText(e.target.value); setNewTags(null); }} placeholder="For example: built a tower of eight blocks and counted them out loud with a friend." /></Field>
              <div>
                <Label style={{ marginBottom: 6 }}>{newTags ? "Your tags" : "AI-suggested tags"}</Label>
                <Row wrap gap={6}>{TAGS.map(t => { const on = tagsNew.includes(t); return <button key={t} className="ros-focus" onClick={() => setNewTags(tog(tagsNew, t))} style={{ height: 26, padding: "0 10px", borderRadius: 999, fontSize: 11.5, cursor: "pointer", border: "1px solid " + (on ? "var(--accent-line)" : "var(--border)"), background: on ? "var(--accent-soft)" : "none", color: on ? "var(--accent)" : "var(--dim)" }}>{t}</button>; })}</Row>
              </div>
              <Btn variant="primary" disabled={!newChild || newText.trim().length < 12 || !tagsNew.length} onClick={() => { approveObs({ diaryId: newChild, tags: tagsNew, text: newText.trim() }); setNewChild(""); setNewText(""); setNewTags(null); }}>Save to journal</Btn>
            </div>
          </Card>
          <Card title="Aistear coverage today" sub="Across observations in view">
            <HBars items={coverage} />
          </Card>
        </Stack>
      </div>
    </Page>
  );
}

/* ---------------- Weekly Planning ---------------- */
type PlanDay = [string, string, string, string]; // focus, activity, Aistear theme, cúpla focal
const PLANS: Record<string, { theme: string; kinds: Record<Exclude<Room["kind"], "SAC">, PlanDay[]> }> = {
  "2026-10-19": { theme: "Samhain and autumn", kinds: {
    "Crèche": [["Autumn senses", "Crunching leaves in the sensory tray", "Well-being", "duilleog · leaf"], ["Pumpkin play", "Pumpkin printing with sponges", "Exploring and Thinking", "puimcín · pumpkin"], ["Songs and rhymes", "Five Little Pumpkins with actions", "Communicating", "amhrán · song"], ["Outdoor walk", "Buggy walk to collect conkers and leaves", "Well-being", "crann · tree"], ["Dress-up", "Gentle costume play with mirrors", "Identity and Belonging", "hata · hat"]],
    "Preschool Junior": [["What is Samhain?", "Story time: Room on the Broom", "Communicating", "Oíche Shamhna"], ["Colour sorting", "Sorting leaves by colour and size", "Exploring and Thinking", "oráiste · orange"], ["Messy play", "Scooping pumpkin seeds in the tray", "Exploring and Thinking", "síol · seed"], ["Making lanterns", "Paper lanterns for Friday's parade", "Identity and Belonging", "solas · light"], ["Costume parade", "Lantern parade around the garden", "Well-being", "paráid · parade"]],
    "Preschool Senior (ECCE)": [["Samhain long ago", "How Samhain marked the start of winter", "Identity and Belonging", "geimhreadh · winter"], ["Counting conkers", "Counting and grouping conkers to ten", "Exploring and Thinking", "a haon go deich"], ["Barmbrack baking", "Measuring and mixing a barmbrack", "Exploring and Thinking", "bairín breac"], ["Story building", "A spooky but not scary group story", "Communicating", "scéal · story"], ["Parade and party", "Costume parade and apple bobbing", "Well-being", "úll · apple"]],
  } },
  "2026-11-02": { theme: "Hedgehogs and hibernation", kinds: {
    "Crèche": [["Hedgehog textures", "Feeling spiky and soft textures", "Well-being", "gráinneog · hedgehog"], ["Sleepy animals", "Lullabies in the quiet corner", "Well-being", "codladh · sleep"], ["Leaf piles", "Hiding toys under leaves", "Exploring and Thinking", "i bhfolach · hidden"], ["Board books", "Lift-the-flap animal books", "Communicating", "leabhar · book"], ["Garden play", "Wrapped up for garden play", "Well-being", "fuar · cold"]],
    "Preschool Junior": [["Who hibernates?", "Picture cards of sleeping animals", "Communicating", "ainmhí · animal"], ["Hedgehog homes", "Building a leaf house in the garden", "Exploring and Thinking", "teach · house"], ["Clay hedgehogs", "Clay and lollipop-stick hedgehogs", "Exploring and Thinking", "cré · clay"], ["Night and day", "Torch play in a dark tent", "Exploring and Thinking", "oíche · night"], ["Family visit", "A parent shares a nature story", "Identity and Belonging", "tuismitheoir · parent"]],
    "Preschool Senior (ECCE)": [["Hibernation facts", "Why some animals sleep through winter", "Exploring and Thinking", "codladh geimhridh"], ["Measuring", "How long is a hedgehog? Measuring with blocks", "Exploring and Thinking", "fad · length"], ["Writing names", "Labelling our hedgehog pictures", "Communicating", "ainm · name"], ["Kindness", "Making a food box for garden birds", "Identity and Belonging", "cineáltas · kindness"], ["Show and tell", "Something found on an autumn walk", "Communicating", "taispeáin · show"]],
  } },
};
function Planning() {
  const { s, role } = useRos();
  const rooms = useRooms();
  const [roomId, setRoomId] = useState<string>("");
  const [week, setWeek] = useState<string>(THIS_WEEK[0]);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  if (!isStaff(role.id)) return <Page><Restricted /></Page>;
  if (!rooms.length) return <Page><PageHead eyebrow="Early Years" title="Weekly Planning" /><NoRooms /></Page>;
  const room = rooms.find(r => r.id === roomId) || rooms[0];
  const plan = PLANS[week], days = (plan.kinds[room.kind as Exclude<Room["kind"], "SAC">] || []);
  const dates = [0, 1, 2, 3, 4].map(i => addDays(week, i));
  const key = room.name + " (" + room.id + ") · w/c " + fmtDate(week);
  const last = s.activity.filter(a => a.title === "Weekly plan approved: " + key || a.title === "Weekly plan sent back: " + key).sort((a, b) => b.seq - a.seq)[0];
  const status = !last ? "Draft" : last.title.startsWith("Weekly plan approved") ? "Approved" : "Sent back";
  const act = (i: number) => edit[room.id + week + i] ?? days[i][1];
  const summary = plan.theme + ": " + days.map((d, i) => fmtDay(dates[i]).slice(0, 3) + " " + act(i)).join("; ") + ".";
  const tasks = s.tasks.filter(t => t.title.endsWith("weekly plan: " + key));
  const canApprove = role.id === "owner" || role.id === "ops" || role.id === "locmgr" || role.id === "practitioner";
  return (
    <Page>
      <PageHead eyebrow="Early Years" title="Weekly Planning" sub="Each room plans its week around a theme, linked to Aistear. The room leader drafts; the manager approves. Edits stay as a draft until approved." />
      <Row wrap gap={10} style={{ marginBottom: 14 }}>
        <RoomSeg rooms={rooms} value={room.id} onChange={setRoomId} all={false} />
        <Seg size="sm" options={[[THIS_WEEK[0], "This week · w/c 19 Oct"], [NEXT_SCHOOL_WEEK, "w/c 2 Nov"]] as [string, string][]} value={week} onChange={setWeek} />
      </Row>
      <Card title={room.name + " · " + plan.theme} sub={room.kind + " · " + room.ageBand + " · w/c " + fmtDate(week) + (week === NEXT_SCHOOL_WEEK ? " (after the Halloween midterm)" : "")} right={<StatusBadge s={status} />}>
        <div className="ros-scroll-x">
          <div style={{ minWidth: 760, display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 10 }}>
            {days.map((d, i) => (
              <div key={i} style={{ background: "var(--surface-2)", border: "1px solid " + (dates[i] === TODAY ? "var(--accent-line)" : "var(--border)"), borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <Label>{fmtDay(dates[i])}{dates[i] === TODAY ? " · today" : ""}</Label>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{d[0]}</div>
                {status === "Approved" ? <div style={{ fontSize: 12.5, color: "var(--body)", lineHeight: 1.5 }}>{act(i)}</div>
                  : <textarea className="ros-input" rows={3} style={{ fontSize: 12.5 }} value={act(i)} onChange={e => setEdit(x => ({ ...x, [room.id + week + i]: e.target.value }))} />}
                <Badge tone="info">Aistear: {d[2]}</Badge>
                <Sub>Cúpla focal: {d[3]}</Sub>
              </div>
            ))}
          </div>
        </div>
        {status !== "Approved" && canApprove && (
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <input className="ros-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Note for the room leader if sending back (optional)" />
            <Row wrap>
              <Btn variant="primary" onClick={() => confirmThen({ title: "Approve the " + room.name + " plan?", body: "Approves " + plan.theme + " for w/c " + fmtDate(week) + ", completes the approval task and logs it to Activity.", confirmLabel: "Approve plan", run: () => planDecision({ roomId: room.id, week, approve: true, summary }) })}>Approve plan</Btn>
              <Btn onClick={() => { planDecision({ roomId: room.id, week, approve: false, summary: note.trim() || "Please review the activities before approval." }); setNote(""); }}>Send back</Btn>
            </Row>
          </div>
        )}
        {status === "Approved" && last && <div style={{ marginTop: 12 }}><Callout tone="ok" title={"Approved by " + last.actor}>{last.at.slice(11)} {fmtDay(last.at.slice(0, 10))}. Shared with the room team.</Callout></div>}
        {status === "Sent back" && last && <div style={{ marginTop: 12 }}><Callout tone="warn" title={"Sent back by " + last.actor}>{last.detail}</Callout></div>}
      </Card>
      <div className="ros-split-even" style={{ marginTop: 16 }}>
        <Card title="Plan status across rooms">
          {rooms.map(r => { const k = r.name + " (" + r.id + ") · w/c " + fmtDate(week); const l = s.activity.filter(a => a.title.endsWith(": " + k) && a.title.startsWith("Weekly plan")).sort((a, b) => b.seq - a.seq)[0]; const stt = !l ? "Draft" : l.title.startsWith("Weekly plan approved") ? "Approved" : "Sent back"; return <ListRow key={r.id} onClick={() => setRoomId(r.id)} title={r.name + " · " + locById(r.locationId)?.short} sub={r.kind} right={<StatusBadge s={stt} />} />; })}
        </Card>
        <Card title="Tasks for this plan">
          {tasks.length ? tasks.map(t => <ListRow key={t.id} onClick={() => openRecord({ kind: "task", id: t.id })} title={t.title} sub={t.owner + " · " + t.due} right={<StatusBadge s={t.status} />} />) : <Empty title="No tasks yet" body="Approving completes the approval task; sending back creates one for the room leader." />}
        </Card>
      </div>
    </Page>
  );
}

/* ---------------- Wellbeing Logs ---------------- */
const MOOD: Record<string, number> = { "Happy and chatty": 5, "Energetic": 4, "Calm, focused": 4, "Settled after a quiet start": 3 };
const HIST = ["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19"];
const histMood = (id: string, d: string) => { const v = hash(id + d) % 10; return v < 1 ? 2 : v < 3 ? 3 : v < 7 ? 4 : 5; };
const histSleep = (id: string, d: string) => 40 + (hash(id + "s" + d) % 9) * 10;
function Wellbeing() {
  const { s, role } = useRos();
  const rooms = useRooms();
  const locIds: string[] = Array.from(new Set(rooms.map(r => r.locationId as string)));
  const [loc, setLoc] = useState<string>("");
  if (!isStaff(role.id)) return <Page><Restricted /></Page>;
  if (!rooms.length) return <Page><PageHead eyebrow="Early Years" title="Wellbeing Logs" /><NoRooms /></Page>;
  const L = locIds.includes(loc) ? loc : locIds[0];
  const lr = rooms.filter(r => r.locationId === L);
  const today = s.diary.filter(d => d.date === TODAY && lr.some(r => r.id === d.roomId));
  const labels = HIST.concat(TODAY).map(d => fmtDay(d).slice(0, 3) + " " + d.slice(8));
  const series = lr.map((r, i) => {
    const ds = today.filter(d => d.roomId === r.id);
    const vals = HIST.map(h => ds.length ? ds.reduce((n, d) => n + histMood(d.childId, h), 0) / ds.length : 0)
      .concat(ds.length ? ds.reduce((n, d) => n + (MOOD[d.mood] || 3), 0) / ds.length : 0);
    return { name: r.name, values: vals.map(v => Math.round(v * 100) / 100), tone: (["accent", "info", "ok"] as Tone[])[i % 3] };
  });
  const creche = lr.find(r => r.kind === "Crèche");
  const crDiary = creche ? today.filter(d => d.roomId === creche.id) : [];
  const sleepSeries = creche ? [{ name: creche.name + " · average nap (min)", values: HIST.map(h => crDiary.length ? Math.round(crDiary.reduce((n, d) => n + histSleep(d.childId, h), 0) / crDiary.length) : 0), tone: "info" as Tone }] : [];
  const moods = Object.keys(MOOD).map(m => ({ label: m, value: today.filter(d => d.mood === m).length, tone: (MOOD[m] >= 5 ? "ok" : MOOD[m] === 4 ? "info" : "warn") as Tone }));
  const attention = today.map(d => {
    const c = idx().child.get(d.childId)!;
    const hist = HIST.map(h => histMood(c.id, h)), low = hist.filter(v => v <= 2).length, avg = hist.reduce((a, b) => a + b, 0) / hist.length, now = MOOD[d.mood] || 3;
    const reasons: string[] = [];
    if (low >= 2) reasons.push(low + " low-mood days in the last four");
    if (now <= 3 && avg < 3.6) reasons.push("quiet start today after a mixed week");
    if (d.sleep === "Not yet" && avg < 3.6) reasons.push("no nap yet today");
    if (c.supports) reasons.push("AIM support plan in place");
    return { d, c, reasons, avg };
  }).filter(x => x.reasons.length).sort((a, b) => b.reasons.length - a.reasons.length || a.avg - b.avg);
  return (
    <Page>
      <PageHead eyebrow="Early Years" title="Wellbeing Logs" sub="Mood and sleep trends from daily diaries, and the children a key worker should check in with. Earlier days are demo history." right={<DemoTag>Demo history</DemoTag>} />
      {locIds.length > 1 && <Row style={{ marginBottom: 14 }}><Seg size="sm" options={locIds.map(id => [id, locById(id)?.short || id] as [string, string])} value={L} onChange={setLoc} /></Row>}
      <Grid min={160} style={{ marginBottom: 16 }}>
        <Kpi label="Diaries logged today" value={today.length} />
        <Kpi label="Happy or energetic" value={today.filter(d => (MOOD[d.mood] || 0) >= 4).length} tone="ok" />
        <Kpi label="Quiet start" value={today.filter(d => (MOOD[d.mood] || 0) <= 3).length} tone="warn" />
        <Kpi label="Check-ins suggested" value={attention.length} tone={attention.length ? "warn" : "ok"} />
      </Grid>
      <div className="ros-split-even">
        <Card title="Average mood by room" sub="5 happy · 4 settled · 3 quiet start · 2 unsettled">
          {series.length ? <Line series={series} labels={labels} format={n => n.toFixed(2)} /> : <Empty title="No diaries yet" />}
        </Card>
        <Card title={creche ? "Crèche naps" : "Moods today"} sub={creche ? "Average nap length, last four days" : undefined}>
          {creche && sleepSeries[0].values.some(v => v) ? <Line series={sleepSeries} labels={HIST.map(d => fmtDay(d).slice(0, 3) + " " + d.slice(8))} format={n => n + " min"} /> : <StackBar parts={moods} />}
          {creche && <div style={{ marginTop: 14 }}><Label style={{ marginBottom: 8 }}>Moods today</Label><StackBar parts={moods} /></div>}
        </Card>
      </div>
      <div style={{ marginTop: 16 }}>
        <Card title="Children to check in with" sub="Suggestions only. The key worker decides what, if anything, to do." pad={false}>
          <Table rowKey={x => x.d.id} rows={attention} minWidth={720} empty="Nobody flagged today" onRow={x => openRecord({ kind: "child", id: x.c.id })}
            cols={[
              { key: "c", label: "Child", w: "1.3fr", render: x => <Row gap={8}><Avatar name={childName(x.c)} size={24} /><span>{childName(x.c)}</span></Row> },
              { key: "r", label: "Room", w: ".9fr", render: x => idx().room.get(x.d.roomId)?.name },
              { key: "m", label: "Today", w: "1.2fr", render: x => x.d.mood },
              { key: "w", label: "Why", w: "2fr", render: x => <span style={{ fontSize: 12.5, color: "var(--body)", whiteSpace: "normal" }}>{x.reasons.join("; ")}</span> },
              { key: "a", label: "", w: "1.3fr", align: "right", render: x => { const title = "Key worker check-in: " + childName(x.c) + " (wellbeing)"; const open = s.tasks.some(t => t.title === title && t.status !== "Done"); return <Btn size="sm" disabled={open} onClick={() => addTask({ title, priority: "Medium", owner: staffById(x.c.keyWorkerId)?.name || "Key worker", link: { kind: "child", id: x.c.id } })}>{open ? "Check-in planned" : "Plan check-in"}</Btn>; } },
            ]} />
        </Card>
      </div>
      <div style={{ marginTop: 12 }}><RecLink mono={false} r={{ kind: "agent", id: "diary" }}>Daily Diary agent log</RecLink></div>
    </Page>
  );
}

export default function EarlyYears({ tab }: { tab: string }) {
  useRos();
  switch (tab) {
    case "Daily Diaries": return <Diaries />;
    case "Learning Journals": return <Journals />;
    case "Weekly Planning": return <Planning />;
    case "Wellbeing Logs": return <Wellbeing />;
    default: return <Rooms />;
  }
}
