/* Extra tabs for the Pulse Agents page: the agent directory, one agent's
   details, approvals across agents, run history and the 08:45 Morning
   Brief. Every number is read from the live records, so approving relief
   here changes Command, Staff, Work and Activity at the same moment. */
import { useState, type ReactNode } from "react";
import type { RosState, AgentAction, Tone } from "../types";
import { useRos, defineAction, confirmThen, openRecord, nav, setFocus } from "../store";
import { AGENTS, agentById, type AgentDef } from "../agents";
import { ratioCheck, pendingApprovals, staffById, child, childName, family, chickExpiring, inScope } from "../selectors";
import { approveRelief, sendClaimReminder, acceptClaim, decideRequest, decideApproval, addTask, toggleTask } from "../actions";
import { ApprovalPanel, TaskRow, requestChecks } from "../records";
import {
  Page, PageHead, Card, Kpi, Grid, Table, Badge, StatusBadge, Btn, RecLink, HBars, Callout, Seg, ListRow, Timeline, DemoTag, Empty,
  Row, Stack, Sub, Label, KV, Bar,
} from "../ui";
import { TODAY, TOMORROW, fmtDay, fmtDate, rel, euro, daysBetween } from "../time";

const WEEK_START = "2026-10-19";
const STATE_TONE: Record<AgentDef["state"], Tone> = { working: "ok", thinking: "info", waiting: "warn", complete: "ok", attention: "bad", idle: "neutral" };
const STATE_LABEL: Record<AgentDef["state"], string> = { working: "Working", thinking: "Thinking", waiting: "Waiting on people", complete: "Brief ready", attention: "Needs attention", idle: "Idle" };
const KIND_TONE: Record<AgentAction["kind"], Tone> = { run: "neutral", proposal: "warn", action: "ok", escalation: "bad" };
const short = (a: AgentDef) => a.name.split(" · ")[0];
const hoursSaved = (a: AgentDef) => "~" + Math.round(a.minsSavedWeek / 60) + "h a week";

function Glyph({ a, size = 38 }: { a: AgentDef; size?: number }) {
  const ini = short(a).split(/[\s&]+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return <span aria-hidden style={{ width: size, height: size, flex: "none", borderRadius: size / 2.8, background: a.tint, border: "1px solid var(--border-strong)", color: "var(--ros-yellow)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.34, fontWeight: 700, letterSpacing: ".03em" }}>{ini}</span>;
}

/* ---------------- run now (deterministic, reads the records only) ---------------- */
function runText(s: RosState, id: string): string {
  const pend = s.approvals.filter(x => x.status === "Pending");
  const ratio = s.issues.filter(i => i.kind === "Ratio" && i.status === "Open");
  const claims = s.claims.filter(c => c.status === "Awaiting acceptance");
  const today = claims.filter(c => c.deadline.slice(0, 10) === TODAY);
  const expired = s.staff.filter(x => x.certs.some(c => c.expires < TODAY));
  const soon = s.staff.filter(x => !x.certs.some(c => c.expires < TODAY) && x.certs.some(c => c.expires >= TODAY && daysBetween(TODAY, c.expires) <= 30));
  const garda = s.staff.filter(x => x.certs.some(c => c.kind === "Garda vetting" && c.expires < TODAY));
  const incOpen = s.incidents.filter(i => i.status !== "Closed");
  const reqs = s.requests.filter(r => r.status === "Pending");
  const plural = (n: number, w: string) => n + " " + w + (n === 1 ? "" : "s");
  switch (id) {
    case "briefing": return "Checked 9 locations: " + plural(pend.length, "approval") + " pending, " + plural(ratio.length, "ratio gap") + " open, " + plural(today.length, "NCS claim") + " lapsing today, " + plural(incOpen.length, "incident") + " open.";
    case "ops": return plural(s.issues.filter(i => i.status === "Open").length, "open alert") + " (" + ratio.length + " ratio, " + s.issues.filter(i => i.kind === "Missing child" && i.status === "Open").length + " missing child), " + plural(reqs.length, "booking request") + " pending, " + plural(pend.filter(a => a.agentId === "ops").length, "proposal") + " with the owner.";
    case "rota": return "Ratio forecast re-run: " + (ratio.length ? ratio.map(i => i.id).join(", ") + " still short" : "every session covered") + "; " + plural(garda.length, "person") + " blocked (Garda vetting); " + plural(s.absences.filter(a => a.date === TODAY).length, "absence") + " today.";
    case "ncs": return plural(claims.length, "claim") + " awaiting acceptance" + (today.length ? " (" + today.map(c => c.id + " " + euro(c.amount)).join(", ") + " lapse 17:00 today)" : "") + "; " + plural(s.awards.filter(a => a.expires >= TODAY && a.expires <= "2026-10-31").length, "CHICK") + " expire by 31 Oct.";
    case "collections": return plural(s.plans.filter(p => p.status === "Active").length, "plan") + " active, " + s.plans.filter(p => p.status === "Broken").length + " broken; " + plural(s.bank.filter(b => b.status === "Suggested" || b.status === "Unmatched").length, "bank line") + " awaiting a match; " + plural(pend.filter(a => a.agentId === "collections").length, "decision") + " with Accounts or the owner.";
    case "inbox": return plural(s.messages.filter(m => m.status === "New").length, "new message") + ", " + plural(s.messages.filter(m => m.status === "Drafted" || (m.status === "New" && m.draft)).length, "draft") + " waiting for a person, " + s.messages.filter(m => m.status === "Escalated").length + " escalated.";
    case "bookings": return plural(reqs.length, "request") + " pending (" + reqs.filter(r => r.kind === "Late booking").length + " late bookings); window for w/c 2 Nov has " + (s.windows.find(w => w.status === "Open")?.submissions.length || 0) + " submissions.";
    case "transport": return plural(s.routes.length, "route") + " checked; " + s.issues.filter(i => i.kind === "Missing child" && i.status === "Open").length + " missing-child alerts open; manifests rebuilt from accepted bookings.";
    case "enrolment": return plural(s.enquiries.filter(e => e.stage !== "Started" && e.stage !== "Enrolled").length, "enquiry") + " in the pipeline, " + s.waitlist.filter(w => w.status === "Waiting").length + " waiting; follow-ups drafted, not sent.";
    case "diary": return plural(s.diary.filter(d => d.status !== "Published").length, "diary draft") + " waiting for practitioner review, " + s.diary.filter(d => d.status === "Published").length + " published.";
    case "compliance": return plural(expired.length, "person") + " with an expired certificate, " + soon.length + " due inside 30 days; " + plural(s.checks.filter(c => !c.done).length, "site log") + " outstanding; " + s.incidents.filter(i => !i.parentSigned).length + " incidents awaiting signature.";
    case "camps": return s.camps.filter(c => !c.past).map(c => { const r = s.campRegs.filter(x => x.campId === c.id); return c.name.split(" · ")[1] + " " + r.filter(x => x.status === "Confirmed").length + "/" + c.capacity; }).join(", ") + " confirmed; " + plural(s.campRegs.filter(r => !r.paid).length, "place") + " unpaid.";
    case "sunny": return plural(s.messages.filter(m => m.queue === "Parent app").length, "parent app conversation") + " in the queue; medical, safeguarding and billing disputes routed to staff.";
    default: return "Checked its inputs. Nothing new.";
  }
}
const runAgentNow = defineAction<{ agentId: string }>("agents.runNow", (s, p, ctx) => {
  const a = AGENTS.find(x => x.id === p.agentId);
  if (!a) return;
  const text = runText(s, a.id);
  ctx.agent(a.id, "Run on demand: " + text, "run");
  ctx.log({ category: "System", title: short(a) + " run on demand", detail: text + " Started by " + ctx.actor + ". Demo run; nothing sent.", actor: short(a) + " agent", actorKind: "agent", link: { kind: "agent", id: a.id } });
}, { toast: (p) => (agentById(p.agentId) ? short(agentById(p.agentId)!) : "Agent") + " ran in demo mode. Its log and Activity updated." });

/* ---------------- module ---------------- */
export default function AgentsTabs({ tab }: { tab: string }) {
  useRos();
  return (
    <Page>
      {tab === "Agent Directory" && <Directory />}
      {tab === "Agent Details" && <Details />}
      {tab === "Approvals" && <Approvals />}
      {tab === "Run History" && <History />}
      {tab === "Morning Brief" && <MorningBrief />}
      {!["Agent Directory", "Agent Details", "Approvals", "Run History", "Morning Brief"].includes(tab) && <Card><Empty title={tab} body="This tab is part of the Pulse Agents page." /></Card>}
    </Page>
  );
}

/* ---------------- directory ---------------- */
function Directory() {
  const { s } = useRos();
  const week = s.agentActions.filter(x => x.at >= WEEK_START);
  const pend = s.approvals.filter(a => a.status === "Pending");
  const total = AGENTS.reduce((n, a) => n + a.minsSavedWeek, 0);
  const open = (id: string) => nav("Agents", "Agent Details", { agentId: id });
  const ordered = AGENTS.slice().sort((a, b) => Number(!!b.core) - Number(!!a.core));
  return (
    <>
      <PageHead eyebrow="Agents" title="Agent directory" sub="Thirteen agents, each with a specific job, stated triggers and limits. They read records and propose; people approve anything that changes what a family is charged, who is on the rota or what a parent is told." />
      <Grid min={160} style={{ marginBottom: 16 }}>
        <Kpi label="Agents" value={AGENTS.length} sub="2 core, 11 childcare" />
        <Kpi label="Actions this week" value={week.length} sub="from the run log" onClick={() => nav("Agents", "Run History")} />
        <Kpi label="Waiting on people" value={pend.length} tone={pend.length ? "warn" : "ok"} onClick={() => nav("Agents", "Approvals")} />
        <Kpi label="Time saved" value={"~" + Math.round(total / 60) + "h"} sub="a week · illustrative estimate" />
      </Grid>
      <Grid min={300}>
        {ordered.map(a => {
          const n = week.filter(x => x.agentId === a.id).length;
          const p = pend.filter(x => x.agentId === a.id).length;
          return (
            <Card key={a.id} onClick={() => open(a.id)} style={{ display: "flex", flexDirection: "column" }}>
              <Row gap={12} style={{ alignItems: "flex-start" }}>
                <Glyph a={a} />
                <Stack gap={4}>
                  <Row wrap gap={6}><span style={{ fontSize: 14.5, fontWeight: 600 }}>{a.name}</span>{a.core && <Badge tone="brand">Core</Badge>}</Row>
                  <Badge tone={STATE_TONE[a.state]} dot={a.state === "attention"}>{STATE_LABEL[a.state]}</Badge>
                </Stack>
              </Row>
              <div style={{ fontSize: 12.5, color: "var(--body)", lineHeight: 1.55, marginTop: 12, minHeight: 58 }}>{a.purpose}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginTop: 12 }}>
                <MiniStat label="This week" value={n + " action" + (n === 1 ? "" : "s")} />
                <MiniStat label="Pending" value={p ? p + " approval" + (p === 1 ? "" : "s") : "None"} tone={p ? "warn" : undefined} />
                <MiniStat label="Time saved" value={hoursSaved(a)} hint="illustrative estimate" />
              </div>
              <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 10, lineHeight: 1.5 }}><b style={{ fontWeight: 600, color: "var(--body)" }}>Approval policy:</b> {a.approval}</div>
              <Row style={{ marginTop: 12 }}><Sub>Owner {a.owner}</Sub><div style={{ flex: 1 }} /><Btn size="sm" onClick={() => open(a.id)}>Details</Btn></Row>
            </Card>
          );
        })}
      </Grid>
    </>
  );
}
function MiniStat({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: Tone; hint?: string }) {
  return (
    <div title={hint} style={{ padding: "8px 10px", borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)", minWidth: 0 }}>
      <div style={{ fontSize: 10.5, color: "var(--faint)" }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 3, color: tone === "warn" ? "var(--warn)" : "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      {hint && <div style={{ fontSize: 9.5, color: "var(--faint)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hint}</div>}
    </div>
  );
}

/* ---------------- details ---------------- */
function Details() {
  const { s, ui } = useRos();
  const id = ui.focus.agentId && agentById(ui.focus.agentId) ? ui.focus.agentId : "briefing";
  const a = agentById(id)!;
  const [kind, setKind] = useState<"all" | AgentAction["kind"]>("all");
  const log = s.agentActions.filter(x => x.agentId === a.id && (kind === "all" || x.kind === kind)).sort((x, y) => y.at.localeCompare(x.at));
  const pend = s.approvals.filter(x => x.agentId === a.id && x.status === "Pending");
  const decided = s.approvals.filter(x => x.agentId === a.id && x.status !== "Pending");
  const tasks = s.tasks.filter(t => t.source === short(a) + " agent" && t.status !== "Done");
  const preview = runText(s, a.id);
  return (
    <>
      <PageHead eyebrow="Agents · details" title={a.name} sub={a.purpose}
        right={<>
          <select aria-label="Agent" className="ros-input" style={{ width: "auto", maxWidth: "100%", height: 34, borderRadius: 999 }} value={a.id} onChange={(e) => setFocus({ agentId: e.target.value })}>
            {AGENTS.map(x => <option key={x.id} value={x.id}>{x.name}{x.core ? " (core)" : ""}</option>)}
          </select>
          <Btn variant="primary" onClick={() => runAgentNow({ agentId: a.id })}>Run now (demo)</Btn>
        </>} />
      <div className="ros-split">
        <Stack gap={16}>
          <Card title="How it works" right={<><Glyph a={a} size={30} />{a.core && <Badge tone="brand">Core</Badge>}<Badge tone={STATE_TONE[a.state]}>{STATE_LABEL[a.state]}</Badge></>}>
            <KV items={[
              ["Triggers", a.triggers.join(" · ")],
              ["Input records", a.inputs.join(", ")],
              ["Proposed actions", a.actions.join(" · ")],
              ["Thresholds", a.thresholds.join(" · ")],
              ["Human approval mode", a.approval],
              ["Owner", a.owner],
            ]} />
            <div style={{ marginTop: 12 }}>
              <Callout tone="info" title="If it ran now" right={<DemoTag />}>{preview}</Callout>
            </div>
            <Row wrap style={{ marginTop: 12 }}>
              <Btn onClick={() => nav(a.page, a.tab)}>Open {a.page === "Command" ? "Command Centre" : a.page}{a.tab ? " · " + a.tab : ""}</Btn>
              <Sub>Time saved {hoursSaved(a)} (illustrative estimate)</Sub>
            </Row>
          </Card>
          <Card title="Run log" sub="Most recent first. Records link to their source." right={<Seg size="sm" value={kind} onChange={setKind} options={[["all", "All"], ["run", "Runs"], ["proposal", "Proposals"], ["action", "Actions"], ["escalation", "Escalations"]]} />}>
            {log.length ? <Timeline items={log.slice(0, 30).map(x => ({ at: rel(x.at), title: x.text, tone: KIND_TONE[x.kind], right: <><Badge tone={KIND_TONE[x.kind]}>{x.kind}</Badge>{x.link && <RecLink r={x.link} />}</> }))} />
              : <Empty title="No log entries for this filter" />}
          </Card>
        </Stack>
        <Stack gap={16}>
          <Card title="Waiting on a person" sub={pend.length ? pend.length + " proposal" + (pend.length === 1 ? "" : "s") + " from this agent" : "Nothing pending from this agent."}>
            {pend.length ? <Stack gap={14}>{pend.map(x => <div key={x.id} style={{ paddingBottom: 12, borderBottom: "1px solid var(--border)" }}><Row style={{ marginBottom: 8 }}><RecLink r={{ kind: "approval", id: x.id }} /><span style={{ fontSize: 13, fontWeight: 500 }}>{x.title}</span></Row><ApprovalPanel id={x.id} /></div>)}</Stack> : <Sub>All proposals decided.</Sub>}
          </Card>
          {decided.length > 0 && (
            <Card title="Decided">
              {decided.map(x => <ListRow key={x.id} onClick={() => openRecord({ kind: "approval", id: x.id })} title={x.title} sub={x.decidedBy + " · " + rel(x.decidedAt || "")} right={<StatusBadge s={x.status} />} />)}
            </Card>
          )}
          <Card title="Open tasks it raised">
            {tasks.length ? tasks.map(t => <TaskRow key={t.id} id={t.id} />) : <Sub>No open tasks from this agent.</Sub>}
          </Card>
        </Stack>
      </div>
    </>
  );
}

/* ---------------- approvals ---------------- */
function Approvals() {
  const { s, role } = useRos();
  const [agent, setAgent] = useState("all");
  const mine = new Set(pendingApprovals().map(a => a.id));
  const all = s.approvals.filter(a => agent === "all" || a.agentId === agent);
  const pending = all.filter(a => a.status === "Pending");
  const yours = pending.filter(a => mine.has(a.id));
  const others = pending.filter(a => !mine.has(a.id));
  const done = all.filter(a => a.status !== "Pending").sort((a, b) => (b.decidedAt || "").localeCompare(a.decidedAt || ""));
  const block = (a: (typeof s.approvals)[number]) => {
    const ag = a.agentId ? agentById(a.agentId) : undefined;
    return (
      <Card key={a.id} title={a.title} sub={(ag ? "Proposed by " + ag.name : "Requested by " + a.requestedBy) + " · " + rel(a.requestedAt)} right={<RecLink r={{ kind: "approval", id: a.id }} />}>
        <ApprovalPanel id={a.id} />
      </Card>
    );
  };
  return (
    <>
      <PageHead eyebrow="Agents" title="Approvals across agents" sub={"Every proposal that needs a person. You are previewing as " + role.label + "; decisions you cannot make show who they are waiting on."}
        right={<select aria-label="Agent" className="ros-input" style={{ width: "auto", maxWidth: "100%", height: 34, borderRadius: 999 }} value={agent} onChange={(e) => setAgent(e.target.value)}>
          <option value="all">All agents</option>
          {AGENTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>} />
      <Grid min={160} style={{ marginBottom: 16 }}>
        <Kpi label="Yours to decide" value={yours.length} tone={yours.length ? "warn" : "ok"} />
        <Kpi label="Waiting on other roles" value={others.length} />
        <Kpi label="Decided" value={done.length} tone={done.length ? "ok" : undefined} />
        <Kpi label="Value awaiting decision" value={euro(pending.reduce((n, a) => n + (a.amount || 0), 0))} sub="where an amount applies" />
      </Grid>
      <div className="ros-split">
        <Stack gap={14}>
          <Label>Yours to decide</Label>
          {yours.length ? yours.map(block) : <Card><Empty title="Nothing waiting on you" body="Switch role in the header to see other queues." /></Card>}
          {others.length > 0 && <><Label style={{ marginTop: 6 }}>Waiting on other roles</Label>{others.map(block)}</>}
        </Stack>
        <Card title="Recently decided">
          {done.length ? done.map(a => <ListRow key={a.id} onClick={() => openRecord({ kind: "approval", id: a.id })} title={a.title} sub={a.kind + " · " + a.decidedBy + " · " + rel(a.decidedAt || "")} right={<StatusBadge s={a.status} />} />) : <Empty title="No decisions yet today" body="Approve or decline a proposal and it lands here, in Activity and in the agent's log." />}
        </Card>
      </div>
    </>
  );
}

/* ---------------- run history ---------------- */
function History() {
  const { s } = useRos();
  const [agent, setAgent] = useState("all");
  const [kind, setKind] = useState<"all" | AgentAction["kind"]>("all");
  const [when, setWhen] = useState<"today" | "week">("week");
  const rows = s.agentActions.filter(x => (agent === "all" || x.agentId === agent) && (kind === "all" || x.kind === kind) && (when === "week" ? x.at >= WEEK_START : x.at.startsWith(TODAY)))
    .sort((a, b) => b.at.localeCompare(a.at));
  const counts = AGENTS.map(a => ({ a, n: rows.filter(x => x.agentId === a.id).length })).filter(x => x.n).sort((x, y) => y.n - x.n);
  return (
    <>
      <PageHead eyebrow="Agents" title="Run history" sub="Every run, proposal, action and escalation across the agents, in time order. Records open in the drawer." />
      <Row wrap gap={8} style={{ marginBottom: 14 }}>
        <select aria-label="Agent" className="ros-input" style={{ width: "auto", maxWidth: "100%", height: 34, borderRadius: 999 }} value={agent} onChange={(e) => setAgent(e.target.value)}>
          <option value="all">All agents</option>
          {AGENTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <Seg size="sm" value={kind} onChange={setKind} options={[["all", "All kinds"], ["run", "Runs"], ["proposal", "Proposals"], ["action", "Actions"], ["escalation", "Escalations"]]} />
        <Seg size="sm" value={when} onChange={setWhen} options={[["today", "Today"], ["week", "This week"]]} />
      </Row>
      <div className="ros-split">
        <Card pad={false}>
          <Table rows={rows} rowKey={x => x.id} minWidth={720} pageSize={30} empty="No agent activity for these filters"
            onRow={x => (x.link ? openRecord(x.link) : nav("Agents", "Agent Details", { agentId: x.agentId }))}
            cols={[
              { key: "at", label: "When", w: ".8fr", sort: x => x.at, render: x => <Sub>{rel(x.at)}</Sub> },
              { key: "ag", label: "Agent", w: "1fr", render: x => { const a = agentById(x.agentId); return a ? <Row gap={8}><Glyph a={a} size={22} /><span style={{ fontSize: 12.5 }}>{short(a)}</span></Row> : x.agentId; } },
              { key: "k", label: "Kind", w: ".7fr", render: x => <Badge tone={KIND_TONE[x.kind]}>{x.kind}</Badge> },
              { key: "t", label: "What happened", w: "2.6fr", render: x => <span style={{ fontSize: 12.5, lineHeight: 1.45, whiteSpace: "normal" }}>{x.text}</span> },
              { key: "r", label: "Record", w: ".9fr", render: x => (x.link ? <RecLink r={x.link} /> : <Sub>None</Sub>) },
            ]} />
        </Card>
        <Card title="By agent" sub={rows.length + " entries in view"}>
          {counts.length ? <HBars items={counts.map(c => ({ label: c.a.name, value: c.n, onClick: () => setAgent(c.a.id) }))} /> : <Sub>No entries.</Sub>}
        </Card>
      </div>
    </>
  );
}

/* ---------------- morning brief ---------------- */
interface BriefItem { key: string; title: ReactNode; detail: ReactNode; done: boolean; doneText?: ReactNode; refs: ReactNode; actions: ReactNode; tone: Tone }
function MorningBrief() {
  const { s, role } = useRos();
  const staffRole = role.id !== "parent" && role.id !== "driver";
  const canRota = role.id === "owner" || role.id === "ops" || role.id === "locmgr";
  const items: BriefItem[] = [];
  const briefRun = s.agentActions.filter(x => x.agentId === "briefing").sort((a, b) => b.at.localeCompare(a.at))[0];

  /* 1 · Arklow Rocks cover */
  const relief = (issueId: string, loc: string, date: string, key: string) => {
    const iss = s.issues.find(i => i.id === issueId);
    if (!iss || !inScope(iss.locationId)) return;
    const r = ratioCheck(loc, date, "After School");
    const appr = s.approvals.find(a => a.link?.kind === "issue" && a.link.id === iss.id);
    const shift = s.shifts.find(t => t.relief && t.locationId === loc && t.date === date && t.session === "After School");
    const offers = (iss.offerStaffIds || []).map(id => staffById(id)!).filter(Boolean);
    const hours = loc === "ARR" ? "09:00–17:30" : "13:45–18:15";
    const done = iss.status === "Resolved" || r.ok;
    items.push({
      key, tone: "bad", done,
      title: loc === "ARR" ? "Arklow Rocks 3pm After School is one adult short" : "Gorey Wednesday After School forecast is one adult short",
      detail: <>{r.booked} children booked for {fmtDay(date)}, {r.rostered} of {r.required} required on the rota{loc === "ARR" ? " (one practitioner on approved annual leave)" : " after a sick call this morning"}. Qualified relief: {offers.map(o => o.name).join(" or ")}.</>,
      doneText: <>{shift ? "Covered by " + staffById(shift.staffId)?.name + " " + shift.start + "–" + shift.end : "Covered from the rota"}{iss.resolvedBy ? " · approved by " + iss.resolvedBy + " " + rel(iss.resolvedAt || "") : ""}. Rota now {r.rostered}/{r.required}.</>,
      refs: <><RecLink r={{ kind: "issue", id: iss.id }} />{appr && <RecLink r={{ kind: "approval", id: appr.id }} />}</>,
      actions: <>
        {offers.map(o => <Btn key={o.id} size="sm" variant="primary" disabled={!canRota} onClick={() => confirmThen({ title: "Approve " + o.name + "?", body: "Adds a qualified relief shift (" + hours + ") at " + (loc === "ARR" ? "Arklow Rocks" : "Gorey") + " on " + fmtDay(date) + " and resolves " + iss.id + ". Rota, ratio forecast, Command, Work and Activity update together.", confirmLabel: "Approve relief", run: () => approveRelief({ issueId: iss.id, staffId: o.id }) })}>Approve {o.name.split(" ")[0]}</Btn>)}
        <Btn size="sm" onClick={() => openRecord({ kind: "issue", id: iss.id })}>View</Btn>
        <Btn size="sm" variant="subtle" onClick={() => nav("Staff", "Absence & Relief")}>Assign in rota</Btn>
      </>,
    });
  };
  relief("STAFF-ARK-019", "ARR", TODAY, "ark");

  /* 2 · NCS claim lapsing today */
  const cl = s.claims.find(c => c.id === "NCS-0091");
  if (cl && inScope(family(cl.familyId)?.locationId)) {
    const f = family(cl.familyId)!, c = child(cl.childId);
    const last = cl.reminders[cl.reminders.length - 1];
    const ask = s.messages.find(m => m.direction === "in" && m.link?.kind === "claim" && m.link.id === cl.id);
    items.push({
      key: "ncs", tone: "bad", done: cl.status !== "Awaiting acceptance",
      title: <>NCS claim {cl.id} ({euro(cl.amount)}) lapses at {cl.deadline.slice(11)} today</>,
      detail: <>{f.surname} family, {childName(c)} · {cl.hours}h for {cl.period}. {cl.reminders.length} reminders sent{last ? ", last " + rel(last.at) + " by " + last.channel : ""}. {ask ? ask.from + " asked " + rel(ask.received).toLowerCase() + " how to accept it. " : ""}If it lapses, the hours may be charged privately after a human review.</>,
      doneText: <>{cl.status} · {euro(cl.amount)} subsidy confirmed for {cl.period}.</>,
      refs: <><RecLink r={{ kind: "claim", id: cl.id }} /><RecLink r={{ kind: "family", id: f.id }} /></>,
      actions: <>
        <Btn size="sm" variant="primary" disabled={!staffRole} onClick={() => sendClaimReminder({ claimId: cl.id })}>Send reminder</Btn>
        <Btn size="sm" disabled={!staffRole} onClick={() => acceptClaim({ claimId: cl.id })}>Mark accepted</Btn>
        <Btn size="sm" onClick={() => openRecord({ kind: "claim", id: cl.id })}>View</Btn>
      </>,
    });
  }

  /* 3 · Late booking */
  const rq = s.requests.find(r => r.id === "LBR-006");
  if (rq && inScope(rq.locationId)) {
    const k = requestChecks(rq.id), c = child(rq.childId), f = family(rq.familyId)!;
    const fee = rq.fees.reduce((n, x) => n + x.amount, 0);
    const pass = k.noticeOk && k.capOk && k.ratioOk;
    items.push({
      key: "lbr", tone: "warn", done: rq.status !== "Pending",
      title: <>Late booking {rq.id}: {childName(c)}, {fmtDay(rq.date)} {rq.start}–{rq.end}</>,
      detail: <>{f.guardians[0]?.name} asked at {rq.received.slice(11)} by {rq.channel.toLowerCase()}. Adds {euro(fee)} ({rq.fees.map(x => x.label).join(", ")}). {pass ? "Notice, capacity and ratio checks pass." : "One check needs a look before approving."}</>,
      doneText: <>{rq.status} by {rq.decidedBy} {rel(rq.decidedAt || "")}. Booking, invoice, register and manifest updated together.</>,
      refs: <><RecLink r={{ kind: "request", id: rq.id }} /><RecLink r={{ kind: "family", id: f.id }} /></>,
      actions: <>
        <Btn size="sm" variant="primary" disabled={!staffRole} onClick={() => confirmThen({ title: "Approve " + rq.id + "?", body: "Creates the booking for " + (c?.firstName || "the child") + ", adds " + euro(fee) + " to the invoice, the register and the " + (rq.routeId || "") + " manifest, and sends the confirmation (simulated).", confirmLabel: "Approve", run: () => decideRequest({ id: rq.id, decision: "Approved" }) })}>Approve</Btn>
        <Btn size="sm" onClick={() => openRecord({ kind: "request", id: rq.id })}>View</Btn>
      </>,
    });
  }

  /* 4 · Byrne plan */
  const pl = s.plans.find(p => p.id === "PLN-031");
  if (pl && inScope(family(pl.familyId)?.locationId)) {
    const f = family(pl.familyId)!;
    const missed = pl.instalments.filter(i => i.status === "Missed");
    const bank = s.bank.find(b => b.payer.includes(f.surname.toUpperCase()));
    const task = s.tasks.find(t => t.link?.kind === "plan" && t.link.id === pl.id);
    const msg = s.messages.find(m => m.direction === "in" && m.link?.kind === "plan" && m.link.id === pl.id);
    items.push({
      key: "plan", tone: "warn", done: !missed.length || task?.status === "Done" || bank?.status === "Matched",
      title: <>{f.surname} payment plan {pl.id}: {euro(missed.reduce((n, i) => n + i.amount, 0))} instalment missed {missed[0] ? fmtDate(missed[0].due) : ""}</>,
      detail: <>Revision {pl.revision} of {pl.maxRevisions}, so no further revision is possible under policy.{msg ? " " + msg.from + " wrote " + rel(msg.received).toLowerCase() + ": \u201c" + msg.body + "\u201d" : ""}{bank ? " A " + euro(bank.amount) + " bank line (" + bank.id + ") arrived without the plan reference; confirm before allocating." : ""}</>,
      doneText: <>{task?.status === "Done" ? "Follow-up call done by " + task.owner + "." : bank?.status === "Matched" ? bank.id + " matched." : "Instalment received."}</>,
      refs: <><RecLink r={{ kind: "plan", id: pl.id }} /><RecLink r={{ kind: "family", id: f.id }} />{task && <RecLink r={{ kind: "task", id: task.id }} />}</>,
      actions: <>
        {task && task.status !== "Done" ? <Btn size="sm" variant="primary" onClick={() => toggleTask({ id: task.id })}>Mark call done</Btn>
          : !task ? <Btn size="sm" variant="primary" onClick={() => addTask({ title: "Accounts follow-up call: " + f.surname + " plan (missed instalment)", priority: "High", owner: "Gráinne Whelan", link: { kind: "plan", id: pl.id } })}>Assign to Accounts</Btn> : null}
        {task && task.status !== "Done" && <Badge>Assigned · {task.owner}</Badge>}
        <Btn size="sm" onClick={() => openRecord({ kind: "plan", id: pl.id })}>View</Btn>
        {bank && bank.status === "Suggested" && <Btn size="sm" variant="subtle" onClick={() => nav("Billing", "Payments & Reconciliation")}>Bank match</Btn>}
      </>,
    });
  }

  /* 5 · Doyle debt pack */
  const ap = s.approvals.find(a => a.id === "APR-204");
  if (ap) {
    const canDecide = role.id === "owner" || role.id === "ops" || ap.ownerRole === role.id;
    items.push({
      key: "doyle", tone: "warn", done: ap.status !== "Pending",
      title: ap.title,
      detail: <>{ap.summary} Approving records the decision only; no referral or letter is sent in this demo.</>,
      doneText: <>{ap.status} by {ap.decidedBy} {rel(ap.decidedAt || "")}.</>,
      refs: <><RecLink r={{ kind: "approval", id: ap.id }} />{ap.link && <RecLink r={ap.link} />}</>,
      actions: <>
        <Btn size="sm" variant="primary" disabled={!canDecide} onClick={() => confirmThen({ title: "Approve: " + ap.title + "?", body: ap.effect + ".", confirmLabel: "Approve", run: () => decideApproval({ id: ap.id, decision: "Approved" }) })}>Approve</Btn>
        <Btn size="sm" variant="danger" disabled={!canDecide} onClick={() => decideApproval({ id: ap.id, decision: "Declined" })}>Decline</Btn>
        <Btn size="sm" onClick={() => openRecord({ kind: "approval", id: ap.id })}>View</Btn>
      </>,
    });
  }

  /* 6 · Gorey forecast */
  relief("STAFF-GOR-021", "GOR", TOMORROW, "gor");

  /* 7 · CHICKs expiring */
  const ch = chickExpiring();
  if (ch.length) {
    const task = s.tasks.find(t => t.department === "NCS" && /CHICKs expiring/.test(t.title));
    const first = ch.map(a => a.expires).sort()[0];
    items.push({
      key: "chick", tone: "info", done: task?.status === "Done",
      title: <>{ch.length} CHICKs expire by 31 Oct</>,
      detail: <>First one on {fmtDay(first)}. Families need a renewed CHICK by the Thursday deadline before each week, or those hours move to private charges after review.</>,
      doneText: <>Review done by {task?.owner}.</>,
      refs: <>{task && <RecLink r={{ kind: "task", id: task.id }} />}</>,
      actions: <>
        <Btn size="sm" onClick={() => nav("NCS", "CHICK Register")}>View register</Btn>
        {task ? (task.status !== "Done" ? <><Badge>Assigned · {task.owner}</Badge><Btn size="sm" variant="primary" onClick={() => toggleTask({ id: task.id })}>Mark reviewed</Btn></> : null)
          : <Btn size="sm" variant="primary" onClick={() => addTask({ title: "Review " + ch.length + " CHICKs expiring in October", priority: "Medium", owner: "Áine Mulvey" })}>Assign to NCS</Btn>}
      </>,
    });
  }

  /* 8 · Camps fill */
  const camps = s.camps.filter(c => !c.past && c.start > TODAY && inScope(c.locationId));
  if (camps.length) {
    const regs = s.campRegs.filter(r => camps.some(c => c.id === r.campId));
    const unpaid = regs.filter(r => !r.paid);
    const chase = s.tasks.find(t => t.title.startsWith("Chase unpaid Halloween camp places"));
    const consent = s.tasks.find(t => /excursion consents/.test(t.title) && t.status !== "Done");
    items.push({
      key: "camps", tone: "info", done: !unpaid.length || chase?.status === "Done",
      title: <>Halloween camps: {camps.map(c => c.name.split(" · ")[1] + " " + regs.filter(r => r.campId === c.id && r.status === "Confirmed").length + "/" + c.capacity).join(", ")} confirmed</>,
      detail: <>{unpaid.length} place{unpaid.length === 1 ? "" : "s"} unpaid; {camps.reduce((n, c) => n + c.capacity - regs.filter(r => r.campId === c.id).length, 0)} places still free for w/c 26 Oct.{consent ? " Excursion consents are still being chased." : ""}</>,
      doneText: <>{chase ? "Unpaid places chased by " + chase.owner + "." : "All places paid."}</>,
      refs: <>{camps.map(c => <RecLink key={c.id} r={{ kind: "camp", id: c.id }} />)}</>,
      actions: <>
        <Btn size="sm" onClick={() => nav("Camps", "Overview")}>View camps</Btn>
        {chase ? (chase.status !== "Done" ? <><Badge>Assigned · {chase.owner}</Badge><Btn size="sm" variant="primary" onClick={() => toggleTask({ id: chase.id })}>Mark chased</Btn></> : null)
          : <Btn size="sm" variant="primary" onClick={() => addTask({ title: "Chase unpaid Halloween camp places (" + unpaid.length + ")", priority: "Medium", owner: "Tara Breen" })}>Assign chase</Btn>}
      </>,
    });
  }

  const done = items.filter(i => i.done).length;
  return (
    <>
      <PageHead eyebrow={"Owner Briefing · " + fmtDay(TODAY) + " · 08:45"} title="Morning Brief"
        sub="The few things that need a decision today, read from all nine locations. Every figure comes from the source record and links back to it. The agent proposes; you decide."
        right={<><Badge tone="brand">Core agent</Badge><Btn size="sm" onClick={() => nav("Agents", "Agent Details", { agentId: "briefing" })}>About this agent</Btn></>} />
      <Card style={{ marginBottom: 16 }}>
        <Row wrap gap={14}>
          <Stack gap={4}>
            <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-.5px" }}>{done} of {items.length} handled</span>
            <Sub>{briefRun ? "Prepared " + rel(briefRun.at) + " · " + briefRun.text : "Prepared at 08:45"}</Sub>
          </Stack>
          <div style={{ flex: "1 1 200px", minWidth: 160 }}><Bar value={done} max={Math.max(1, items.length)} tone={done === items.length ? "ok" : "accent"} height={8} /></div>
        </Row>
      </Card>
      <Stack gap={12}>
        {items.map((it, i) => (
          <Card key={it.key} tone={it.done ? undefined : it.tone === "bad" ? "bad" : undefined} style={{ opacity: it.done ? 0.78 : 1 }}>
            <Row gap={14} style={{ alignItems: "flex-start" }}>
              <span style={{ flex: "none", width: 30, height: 30, borderRadius: 10, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, background: it.done ? "var(--ok-soft)" : "var(--surface-2)", color: it.done ? "var(--ok)" : "var(--ink)", border: "1px solid var(--border)" }}>{it.done ? "✓" : i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Row wrap gap={8}>
                  <span style={{ fontSize: 14.5, fontWeight: 600, textDecoration: it.done ? "line-through" : "none", color: it.done ? "var(--dim)" : "var(--ink)" }}>{it.title}</span>
                  {it.done ? <Badge tone="ok">Done</Badge> : <Badge tone={it.tone}>{it.tone === "bad" ? "Today" : it.tone === "warn" ? "Decide" : "Watch"}</Badge>}
                </Row>
                <div style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.6, marginTop: 6 }}>{it.done ? it.doneText : it.detail}</div>
                <Row wrap gap={8} style={{ marginTop: 10 }}>
                  {it.refs}
                  <div style={{ flex: 1 }} />
                  {it.done ? null : it.actions}
                </Row>
              </div>
            </Row>
          </Card>
        ))}
        {!items.length && <Card><Empty title="Nothing in scope for this role" body="Switch to the Owner view to see the full brief." /></Card>}
      </Stack>
      <div style={{ marginTop: 14 }}><Callout tone="neutral" title="How this brief is built">The Owner Briefing agent reads ratio alerts, approvals, NCS claims, overdue invoices, incidents and camp fill at 08:45 and keeps only items that need a decision today or carry a risk inside 48 hours. It never acts on its own.</Callout></div>
    </>
  );
}
