/* Families: the parent CRM. Directory of every family in scope, one profile
   per ROS Parent ID, the family's conversations, billing and documents, and
   every task that touches a family. Money is shown to finance roles only. */
import { useState, type ReactNode } from "react";
import type { Child, Family, Task, Invoice } from "../types";
import { useRos, defineAction, openRecord, nav, setFocus, confirmThen, getState } from "../store";
import {
  child, family, idx, inScope, scopedLocations, locById, cached, paymentStatus, familyDue, familyBalance, invoiceTotal,
  invoicePaid, invoiceBalance, invoiceStatus, reminderStage, daysOverdue, underbooked, childName, schoolName, guardian, staffById,
} from "../selectors";
import { TODAY, fmtDate, fmtDay, rel, euro } from "../time";
import { addTask, sendInvoiceReminder, payNow, prepareHoursReminder } from "../actions";
import { FamilyPanel, PlanPanel, TaskRow, familySummary } from "../records";
import {
  Page, PageHead, Card, Kpi, Grid, Table, Badge, StatusBadge, Btn, RecLink, Callout, Seg, Search, ListRow, Timeline,
  DemoTag, Empty, Row, Stack, Sub, Field, statusTone, type Col,
} from "../ui";
import { FamilyPicker, resolveFamily, familyTimeline, dirTone, TEMPLATES, fillVars, sendFamilyMessage } from "./Comms";

/* ---------------- actions owned by Families ---------------- */
export const sendStatement = defineAction<{ familyId: string; balance: number }>("families.statement", (s, p, ctx) => {
  const f = s.families.find(x => x.id === p.familyId); if (!f) return;
  ctx.comm(f.id, "Email", "out", "Statement of account sent: balance " + euro(p.balance) + " (simulated, not sent)", ctx.actor);
  ctx.log({ category: "Financial", title: "Statement sent: " + f.surname + " (" + f.id + ")", detail: "Balance " + euro(p.balance) + " · emailed to " + (f.guardians[0]?.name || f.surname) + ". Simulated.", link: { kind: "family", id: f.id }, locationId: f.locationId });
}, { toast: () => "Statement logged to the family timeline (simulated send)." });

export const requestDocument = defineAction<{ familyId: string; doc: string }>("families.requestDoc", (s, p, ctx) => {
  const f = s.families.find(x => x.id === p.familyId); if (!f) return;
  ctx.comm(f.id, f.channel, "out", "Requested document: " + p.doc + " (simulated, not sent)", ctx.actor);
  ctx.log({ category: "Communications", title: "Document requested: " + p.doc, detail: f.surname + " family (" + f.id + ") asked by " + f.channel + ". Simulated.", link: { kind: "family", id: f.id }, locationId: f.locationId });
}, { toast: () => "Request logged to the family timeline (simulated send)." });

/* ---------------- shared bits ---------------- */
const kidsOf = (f: Family) => f.childIds.map(child).filter((c): c is Child => !!c);
function famRows() {
  return cached("families:rows", () => getState().families.map(f => {
    const kids = kidsOf(f);
    return {
      f, kids, ps: paymentStatus(f), due: familyDue(f.id),
      text: (f.id + " " + f.surname + " " + f.guardians.map(g => g.name).join(" ") + " " + kids.map(k => k.firstName + " " + k.surname).join(" ")).toLowerCase(),
    };
  }));
}
type FamRow = ReturnType<typeof famRows>[number];

function ownersFor(f?: Family): string[] {
  const mgr = f ? staffById(locById(f.locationId)?.managerId || "")?.name : undefined;
  return Array.from(new Set([mgr, "Deirdre Kinsella", "Gráinne Whelan", "Lorraine Tobin", "Siobhán Keogh", "Orla Dempsey"].filter((x): x is string => !!x)));
}

export default function Families({ tab }: { tab: string }) {
  useRos();
  switch (tab) {
    case "Family Profile": return <Profile />;
    case "Communications": return <FamilyComms />;
    case "Billing & Documents": return <BillingDocs />;
    case "Tasks": return <FamilyTasks />;
    default: return <Directory />;
  }
}

/* ---------------- Directory ---------------- */
function Directory() {
  const { role } = useRos();
  const [q, setQ] = useState("");
  const [funding, setFunding] = useState<"All" | "NCS" | "Private">("All");
  const [pay, setPay] = useState<string>("All");
  const [loc, setLoc] = useState<string>("ALL");
  const locs = scopedLocations();
  const scoped = famRows().filter(r => inScope(r.f.locationId));
  const t = q.trim().toLowerCase();
  const rows = scoped.filter(r => (funding === "All" || r.f.funding === funding) && (pay === "All" || r.ps === pay) && (loc === "ALL" || r.f.locationId === loc) && (!t || r.text.includes(t)));
  const count = (k: string) => scoped.filter(r => r.ps === k).length;
  const cols: Col<FamRow>[] = [
    { key: "id", label: "Parent ID", w: ".8fr", render: r => <RecLink r={{ kind: "family", id: r.f.id }} />, sort: r => r.f.id },
    { key: "fam", label: "Family", w: "1.7fr", render: r => <Stack><span style={{ fontWeight: 500 }}>{r.f.surname}</span><Sub>{r.f.guardians.map(g => g.name).join(", ")}</Sub></Stack>, sort: r => r.f.surname },
    { key: "kids", label: "Children", w: ".6fr", align: "center", render: r => <span title={r.kids.map(childName).join(", ")}>{r.kids.length}</span>, sort: r => r.kids.length },
    { key: "loc", label: "Location", w: "1fr", render: r => locById(r.f.locationId)?.short, sort: r => r.f.locationId },
    { key: "fund", label: "Funding", w: ".7fr", render: r => <Badge tone={r.f.funding === "NCS" ? "info" : "neutral"}>{r.f.funding}</Badge>, sort: r => r.f.funding },
    { key: "ps", label: "Payment", w: ".8fr", render: r => <StatusBadge s={r.ps} />, sort: r => r.ps },
    ...(role.finance ? [{ key: "bal", label: "Balance", w: ".8fr", align: "right" as const, render: (r: FamRow) => r.due > 0 ? euro(r.due) : <Sub>€0.00</Sub>, sort: (r: FamRow) => r.due }] : []),
    { key: "flags", label: "Flags", w: "1.3fr", render: r => <Row gap={4}>{r.f.flags.slice(0, 2).map(x => <Badge key={x} tone={statusTone(x)}>{x}</Badge>)}{!r.f.consentsComplete && <Badge tone="warn">Consents</Badge>}{!r.f.flags.length && r.f.consentsComplete && <Sub>None</Sub>}</Row> },
  ];
  const totalDue = scoped.reduce((n, r) => n + r.due, 0);
  return (
    <Page>
      <PageHead eyebrow="Families · Directory" title="Parent CRM"
        sub="Every family has one ROS Parent ID. Search it here, or anywhere in the app, and the same record opens." />
      <Grid min={150} style={{ marginBottom: 16 }}>
        <Kpi label="Families in scope" value={scoped.length} sub={scoped.reduce((n, r) => n + r.kids.length, 0) + " children"} />
        <Kpi label="NCS-funded" value={scoped.filter(r => r.f.funding === "NCS").length} tone="info" onClick={() => setFunding("NCS")} />
        <Kpi label="Overdue" value={count("Overdue")} tone={count("Overdue") ? "bad" : "ok"} onClick={() => setPay("Overdue")} />
        <Kpi label="On a payment plan" value={count("Plan")} tone="warn" onClick={() => setPay("Plan")} />
        <Kpi label="Booking blocked" value={count("Blocked")} tone={count("Blocked") ? "bad" : "ok"} onClick={() => setPay("Blocked")} />
        {role.finance ? <Kpi label="Outstanding" value={euro(totalDue, 0)} sub="Includes scheduled DD" /> : <Kpi label="Consents incomplete" value={scoped.filter(r => !r.f.consentsComplete).length} tone="warn" />}
      </Grid>
      <Card pad={false}>
        <Row wrap gap={10} style={{ padding: "14px 16px" }}>
          <Search value={q} onChange={setQ} placeholder="Parent ID, surname, guardian or child" width={300} />
          <Seg size="sm" value={funding} onChange={setFunding} options={["All", "NCS", "Private"]} />
          <select className="ros-input" style={{ width: 170 }} value={pay} onChange={(e) => setPay(e.target.value)} aria-label="Payment status">
            {["All", "Paid up", "Due", "Overdue", "Plan", "Blocked"].map(x => <option key={x} value={x}>{x === "All" ? "Any payment status" : x}</option>)}
          </select>
          <select className="ros-input" style={{ width: 170 }} value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Location" disabled={locs.length === 1}>
            {locs.length > 1 && <option value="ALL">All locations in scope</option>}
            {locs.map(l => <option key={l.id} value={l.id}>{l.short}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          <Sub>{rows.length} of {scoped.length}</Sub>
          {(q || funding !== "All" || pay !== "All" || loc !== "ALL") && <Btn size="sm" variant="subtle" onClick={() => { setQ(""); setFunding("All"); setPay("All"); setLoc("ALL"); }}>Clear filters</Btn>}
        </Row>
        <Table rows={rows} cols={cols} rowKey={r => r.f.id} minWidth={860} empty="No families match these filters"
          rowTone={r => r.ps === "Blocked" || r.ps === "Overdue" ? "bad" : r.ps === "Plan" ? "warn" : undefined}
          onRow={r => nav("Families", "Family Profile", { familyId: r.f.id })} />
      </Card>
    </Page>
  );
}

/* ---------------- Family Profile ---------------- */
function opsSummary(f: Family): string {
  const s = getState(), kids = kidsOf(f);
  const parts = [f.surname + " family (" + f.id + "): " + kids.map(k => k.firstName + " (" + (k.programme === "EY" ? idx().room.get(k.roomId)?.name : k.schoolClass + ", " + schoolName(k.schoolId)) + ")").join(", ") + " at " + locById(f.locationId)?.short + "."];
  if (f.funding === "NCS") parts.push("NCS-funded: " + kids.map(k => idx().awardByChild.get(k.id)?.agreedHours).filter(Boolean).map(h => h + "h/wk").join(", ") + " agreed.");
  const pend = s.requests.filter(r => r.familyId === f.id && r.status === "Pending");
  if (pend.length) parts.push(pend.length + " booking request" + (pend.length > 1 ? "s" : "") + " pending (" + pend.map(r => r.id).join(", ") + ").");
  const open = s.messages.filter(m => m.familyId === f.id && m.direction === "in" && (m.status === "New" || m.status === "Drafted"));
  if (open.length) parts.push("Waiting on a reply to “" + open[0].subject + "”.");
  if (!f.consentsComplete) parts.push("One consent form is incomplete.");
  if (f.blocked) parts.push("New bookings are restricted by Accounts.");
  parts.push("Billing detail is restricted to finance roles.");
  return parts.join(" ");
}

interface NextAction { key: string; title: string; sub: string; tone: "bad" | "warn" | "info"; act: ReactNode }
function nextActions(f: Family, finance: boolean, medical: boolean): NextAction[] {
  const s = getState(), out: NextAction[] = [];
  for (const m of s.messages.filter(x => x.familyId === f.id && x.direction === "in" && (x.status === "New" || x.status === "Drafted")))
    out.push({ key: m.id, title: "Reply to “" + m.subject + "”", sub: m.channel + " · " + rel(m.received) + (m.draft ? " · AI draft ready" : ""), tone: "warn", act: <Btn size="sm" variant="primary" onClick={() => nav("Comms", "Unified Inbox", { messageId: m.id, familyId: f.id })}>Open in inbox</Btn> });
  for (const r of s.requests.filter(x => x.familyId === f.id && x.status === "Pending"))
    out.push({ key: r.id, title: r.kind + " " + r.id + " to decide", sub: fmtDay(r.date) + " " + r.start + "–" + r.end + " · received " + rel(r.received), tone: "warn", act: <Btn size="sm" onClick={() => openRecord({ kind: "request", id: r.id })}>Review</Btn> });
  for (const c of s.claims.filter(x => x.familyId === f.id && x.status === "Awaiting acceptance"))
    out.push({ key: c.id, title: "NCS claim " + c.id + " awaiting acceptance", sub: euro(c.amount) + " · lapses " + c.deadline.slice(11) + " " + fmtDay(c.deadline.slice(0, 10)), tone: c.deadline.slice(0, 10) === TODAY ? "bad" : "warn", act: <Btn size="sm" onClick={() => openRecord({ kind: "claim", id: c.id })}>Open claim</Btn> });
  const ub = underbooked().find(u => u.family.id === f.id);
  if (ub && finance) {
    const drafted = s.messages.some(m => m.familyId === f.id && m.classification === "NCS hours reminder" && m.status === "Drafted");
    out.push({ key: "ub", title: "Under-booked NCS hours for w/c 2 Nov", sub: ub.booked + " of " + ub.agreed + "h booked", tone: "warn", act: drafted ? <Btn size="sm" onClick={() => nav("Comms", "AI Drafts")}>Review draft</Btn> : <Btn size="sm" onClick={() => prepareHoursReminder({ familyId: f.id, booked: ub.booked, agreed: ub.agreed })}>Prepare reminder</Btn> });
  }
  if (finance) {
    const plan = s.plans.find(p => p.familyId === f.id);
    if (plan && plan.instalments.some(i => i.status === "Missed")) out.push({ key: plan.id, title: "Payment plan " + plan.id + (plan.status === "Broken" ? " is broken" : ": instalment missed"), sub: plan.nextAction, tone: plan.status === "Broken" ? "bad" : "warn", act: <Btn size="sm" onClick={() => openRecord({ kind: "plan", id: plan.id })}>Open plan</Btn> });
    const od = (idx().invoicesByFamily.get(f.id) || []).filter(i => invoiceStatus(i) === "Overdue");
    for (const i of od.slice(0, 2)) out.push({ key: i.id, title: i.id + " overdue " + daysOverdue(i) + " days", sub: euro(invoiceBalance(i)) + " · " + reminderStage(i).label, tone: "bad", act: <Btn size="sm" onClick={() => openRecord({ kind: "invoice", id: i.id })}>Open invoice</Btn> });
  }
  if (!f.consentsComplete) out.push({ key: "consent", title: "Consent form incomplete", sub: "Photo, outing and transport consents", tone: "info", act: <Btn size="sm" onClick={() => requestDocument({ familyId: f.id, doc: "Photo, outing and transport consents" })}>Request (simulated)</Btn> });
  if (medical) for (const k of kidsOf(f).filter(k => k.medication && k.medication.expires <= "2026-11-03"))
    out.push({ key: "med" + k.id, title: k.firstName + "'s medication expires " + fmtDate(k.medication!.expires), sub: k.medication!.name, tone: "warn", act: <Btn size="sm" onClick={() => openRecord({ kind: "child", id: k.id })}>Open child</Btn> });
  return out;
}

function NewTaskForm({ f, compact }: { f: Family; compact?: boolean }) {
  const owners = ownersFor(f);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"High" | "Medium" | "Low">("Medium");
  const [owner, setOwner] = useState(owners[0]);
  return (
    <Stack gap={10}>
      <Field label={"New task for the " + f.surname + " family"}>
        <input className="ros-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={"e.g. Call " + (guardian(f)?.name.split(" ")[0] || "parent") + " about collection times"} />
      </Field>
      <div className={compact ? "ros-split-even" : "ros-split-even"}>
        <Field label="Owner"><select className="ros-input" value={owner} onChange={(e) => setOwner(e.target.value)}>{owners.map(o => <option key={o} value={o}>{o}</option>)}</select></Field>
        <Field label="Priority"><select className="ros-input" value={priority} onChange={(e) => setPriority(e.target.value as "High" | "Medium" | "Low")}>{["High", "Medium", "Low"].map(o => <option key={o} value={o}>{o}</option>)}</select></Field>
      </div>
      <Row><Btn variant="primary" disabled={!title.trim()} onClick={() => { addTask({ title: title.trim() + " (" + f.surname + ", " + f.id + ")", priority, owner, link: { kind: "family", id: f.id } }); setTitle(""); }}>Create task</Btn></Row>
    </Stack>
  );
}

function Profile() {
  const { ui, role } = useRos();
  const r = resolveFamily(ui.focus.familyId);
  if (!r.id) return <Page><Card><Empty title="No families in your scope" /></Card></Page>;
  const f = family(r.id)!;
  const acts = nextActions(f, role.finance, role.medical);
  const openMsg = getState().messages.find(m => m.familyId === f.id && m.direction === "in" && (m.status === "New" || m.status === "Drafted"));
  return (
    <Page>
      <PageHead eyebrow="Families · Family profile" title={f.surname + " family · " + f.id}
        sub={f.guardians.map(g => g.name + " (" + g.relation.toLowerCase() + ")").join(" and ") + " · " + locById(f.locationId)?.name + " · joined " + fmtDate(f.joined) + " " + f.joined.slice(0, 4)} />
      <FamilyPicker value={f.id} note={r.note} onPick={(id) => setFocus({ familyId: id })} />
      <div className="ros-split">
        <Card><FamilyPanel key={f.id} id={f.id} full /></Card>
        <Stack gap={14}>
          <Card title="AI account summary" sub="Written from the records on this page, refreshed on every change" right={<Badge tone="info">AI</Badge>}>
            <div style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--body)" }}>{role.finance ? familySummary(f) : opsSummary(f)}</div>
          </Card>
          <Card title="Needs attention" sub={acts.length ? acts.length + " item" + (acts.length > 1 ? "s" : "") + " for this family" : undefined}>
            {acts.length ? acts.map(a => <ListRow key={a.key} tone={a.tone} title={a.title} sub={a.sub} right={a.act} />) : <Empty title="Nothing outstanding" body="No open messages, requests, claims or overdue invoices for this family." />}
          </Card>
          <Card title="Quick actions">
            <Row wrap gap={8}>
              {openMsg ? <Btn variant="primary" onClick={() => nav("Comms", "Unified Inbox", { messageId: openMsg.id, familyId: f.id })}>Reply in inbox</Btn> : null}
              <Btn onClick={() => nav("Families", "Communications", { familyId: f.id })}>Message family</Btn>
              <Btn onClick={() => nav("Comms", "Family History", { familyId: f.id })}>Open in Comms</Btn>
              {role.finance && <Btn onClick={() => nav("Billing", "Invoices", { familyId: f.id })}>Open Billing</Btn>}
              <Btn variant="subtle" onClick={() => nav("Families", "Billing & Documents", { familyId: f.id })}>Documents</Btn>
            </Row>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}><NewTaskForm key={f.id} f={f} compact /></div>
          </Card>
        </Stack>
      </div>
    </Page>
  );
}

/* ---------------- Communications ---------------- */
function FamilyComms() {
  const { ui } = useRos();
  const r = resolveFamily(ui.focus.familyId);
  const [chan, setChan] = useState("All");
  if (!r.id) return <Page><Card><Empty title="No families in your scope" /></Card></Page>;
  const f = family(r.id)!;
  const all = familyTimeline(f.id);
  const chans = ["All", ...Array.from(new Set(all.map(x => x.channel)))];
  const items = all.filter(x => chan === "All" || x.channel === chan);
  const openMsgs = getState().messages.filter(m => m.familyId === f.id && m.direction === "in" && (m.status === "New" || m.status === "Drafted" || m.status === "Escalated"));
  const tpl = ui.focus.templateId || "";
  return (
    <Page>
      <PageHead eyebrow="Families · Communications" title={"Talking to the " + f.surname + " family"}
        sub="One timeline across the parent app, email, SMS, phone notes and push notifications. Messages you send here are simulated and logged." />
      <FamilyPicker value={f.id} note={r.note} onPick={(id) => setFocus({ familyId: id })} />
      <div className="ros-split">
        <Card title="Timeline" sub={items.length + " of " + all.length + " entries"} right={<Btn size="sm" variant="subtle" onClick={() => nav("Comms", "Family History", { familyId: f.id })}>Full history</Btn>}>
          <div style={{ marginBottom: 12 }}><Seg size="sm" value={chan} onChange={setChan} options={chans} /></div>
          {items.length ? <Timeline items={items.map(x => ({ at: rel(x.at), title: x.title, detail: x.channel + " · " + x.by + (x.status ? " · " + x.status : ""), tone: dirTone(x.dir), right: x.ref ? <RecLink r={x.ref} /> : undefined }))} /> : <Empty title="No entries on this channel" />}
        </Card>
        <Stack gap={14}>
          {openMsgs.length > 0 && (
            <Card title="Waiting on us" sub="Inbound messages not yet answered">
              {openMsgs.map(m => <ListRow key={m.id} title={m.subject} sub={m.channel + " · " + rel(m.received) + " · " + m.classification} right={<Btn size="sm" variant="primary" onClick={() => nav("Comms", "Unified Inbox", { messageId: m.id, familyId: f.id })}>Reply</Btn>} />)}
            </Card>
          )}
          <Composer key={f.id + "|" + tpl} f={f} tplId={tpl} />
        </Stack>
      </div>
    </Page>
  );
}

function Composer({ f, tplId }: { f: Family; tplId: string }) {
  const tpl = TEMPLATES.find(t => t.id === tplId);
  const [mode, setMode] = useState<"Message" | "Note">("Message");
  const [channel, setChannel] = useState<string>(f.channel === "App" ? "App" : f.channel);
  const [noteCh, setNoteCh] = useState("Phone");
  const [subject, setSubject] = useState(tpl ? fillVars(tpl.subject, f.id) : "");
  const [body, setBody] = useState(tpl ? fillVars(tpl.body, f.id) : "");
  const g = guardian(f);
  const apply = (id: string) => { const t = TEMPLATES.find(x => x.id === id); if (t) { setSubject(fillVars(t.subject, f.id)); setBody(fillVars(t.body, f.id)); setMode("Message"); } };
  const send = () => {
    if (mode === "Note") { sendFamilyMessage({ familyId: f.id, channel: noteCh, subject, body, note: true }); setSubject(""); setBody(""); return; }
    confirmThen({ title: "Send to " + (g?.name || f.surname) + "?", body: "“" + subject + "” by " + channel + ". Simulated: nothing leaves the demo, and the message is written to the family timeline and Activity.", confirmLabel: "Send (simulated)",
      run: () => { sendFamilyMessage({ familyId: f.id, channel, subject, body }); setSubject(""); setBody(""); } });
  };
  return (
    <Card title={mode === "Message" ? "New message" : "Log a call or note"} sub={mode === "Message" ? "To " + (g?.name || f.surname) + " · prefers " + f.channel + " · " + f.language : "Internal: not sent to the family"} right={<DemoTag />}>
      <Stack gap={12}>
        <Seg size="sm" value={mode} onChange={setMode} options={[["Message", "Message"], ["Note", "Call or note"]] as ["Message" | "Note", ReactNode][]} />
        {mode === "Message" ? (
          <div className="ros-split-even">
            <Field label="Channel"><select className="ros-input" value={channel} onChange={(e) => setChannel(e.target.value)}>{["App", "Email", "SMS", "WhatsApp"].map(c => <option key={c} value={c}>{c === "App" ? "MyRosKids app" : c}</option>)}</select></Field>
            <Field label="Start from template"><select className="ros-input" value="" onChange={(e) => apply(e.target.value)}><option value="">Choose…</option>{TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          </div>
        ) : (
          <Field label="Type"><select className="ros-input" value={noteCh} onChange={(e) => setNoteCh(e.target.value)}>{["Phone", "In person", "Note"].map(c => <option key={c} value={c}>{c}</option>)}</select></Field>
        )}
        <Field label={mode === "Message" ? "Subject" : "Summary"}><input className="ros-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={mode === "Message" ? "Short and specific" : "e.g. Rang Sinéad about Friday pickup"} /></Field>
        <Field label={mode === "Message" ? "Message" : "Detail"}><textarea className="ros-input" rows={6} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <Row wrap>
          <Btn variant="primary" disabled={!subject.trim() || (mode === "Message" && !body.trim())} onClick={send}>{mode === "Message" ? "Send (simulated)" : "Add note"}</Btn>
          {tpl && <Btn variant="subtle" onClick={() => { setFocus({ templateId: "" }); }}>Clear template</Btn>}
        </Row>
      </Stack>
    </Card>
  );
}

/* ---------------- Billing & Documents ---------------- */
type DocStatus = "On file" | "Missing" | "Expiring" | "Requested" | "Not needed";
interface DocItem { name: string; detail: string; status: DocStatus }
function docList(f: Family, medical: boolean): DocItem[] {
  const s = getState(), kids = kidsOf(f);
  const requested = new Set((s.comms.filter(c => c.familyId === f.id && c.summary.startsWith("Requested document: ")).map(c => c.summary.slice(20).replace(" (simulated, not sent)", ""))));
  const declined = kids.flatMap(k => Object.entries(k.consents).filter(([, v]) => !v).map(([n]) => k.firstName + " " + n));
  const out: DocItem[] = [
    { name: "Registration form", detail: "Signed " + fmtDate(f.joined) + " " + f.joined.slice(0, 4), status: "On file" },
    { name: "Fees and payment terms 2026/27", detail: f.joined > "2026-08-25" ? "E-signed " + fmtDate(f.joined) : "E-signed 25 Aug 2026", status: "On file" },
    { name: "Photo, outing and transport consents", detail: f.consentsComplete ? (declined.length ? "Complete · parent declined: " + declined.join(", ") : "Complete for every child") : "Form incomplete", status: f.consentsComplete ? "On file" : "Missing" },
  ];
  for (const k of kids) {
    out.push({ name: "Authorised collectors · " + k.firstName, detail: k.collectors.filter(c => c.permitted).length + " authorised" + (k.collectors.some(c => !c.permitted) ? (medical ? " · restriction on file" : " · restricted detail") : ""), status: "On file" });
    if (k.medical.length) {
      const exp = k.medication && k.medication.expires <= "2026-11-03";
      out.push({ name: "Medical care plan · " + k.firstName, detail: medical ? k.medical.map(m => m.kind).join(", ") + (k.medication ? " · " + k.medication.name + " to " + fmtDate(k.medication.expires) : "") : "Restricted", status: exp ? "Expiring" : "On file" });
    }
    if (k.programme === "EY") out.push({ name: "Immunisation record and All About Me · " + k.firstName, detail: "Collected at registration", status: "On file" });
    const aw = idx().awardByChild.get(k.id);
    if (aw) out.push({ name: "NCS award letter · " + k.firstName, detail: "CHICK " + aw.chick + " · expires " + fmtDate(aw.expires) + " " + aw.expires.slice(0, 4), status: aw.expires <= "2026-10-31" ? "Expiring" : "On file" });
  }
  out.push({ name: "SEPA direct debit mandate", detail: f.method === "SEPA direct debit" ? "Active · IE•• •••• •••• •••• (masked)" : "Pays by " + f.method.toLowerCase(), status: f.method === "SEPA direct debit" ? "On file" : "Not needed" });
  const plan = s.plans.find(p => p.familyId === f.id);
  if (plan) out.push({ name: "Payment plan agreement " + plan.id, detail: "Revision " + plan.revision + " of " + plan.maxRevisions + " · e-sign " + plan.esign.toLowerCase(), status: plan.esign === "Signed" ? "On file" : plan.esign === "Sent" ? "Requested" : "Missing" });
  return out.map(d => (d.status === "Missing" || d.status === "Expiring") && requested.has(d.name) ? { ...d, status: "Requested" as DocStatus } : d);
}
const docTone = (s: DocStatus) => (s === "On file" ? "ok" : s === "Missing" ? "bad" : s === "Expiring" || s === "Requested" ? "warn" : "neutral") as "ok" | "bad" | "warn" | "neutral";

function BillingDocs() {
  const { s, ui, role } = useRos();
  const r = resolveFamily(ui.focus.familyId);
  if (!r.id) return <Page><Card><Empty title="No families in your scope" /></Card></Page>;
  const f = family(r.id)!;
  const docs = docList(f, role.medical);
  const gaps = docs.filter(d => d.status === "Missing" || d.status === "Expiring");
  return (
    <Page>
      <PageHead eyebrow="Families · Billing and documents" title={"Account and paperwork · " + f.surname}
        sub="Invoices, payments, any payment plan and a statement preview for finance roles. The document checklist is shared with every staff role." />
      <FamilyPicker value={f.id} note={r.note} onPick={(id) => setFocus({ familyId: id })}
        right={role.finance ? <Btn size="sm" onClick={() => nav("Billing", "Invoices", { familyId: f.id })}>Open in Billing</Btn> : undefined} />
      <div className="ros-split">
        {role.finance ? <FinancePane f={f} /> : (
          <Card title="Billing"><Callout tone="neutral" title="Restricted">Invoices, payments and balances are visible to Owner, Operations, Accounts and NCS roles only. Switch role in the header to see how access changes.</Callout></Card>
        )}
        <Card title="Document checklist" sub={gaps.length ? gaps.length + " need action" : "Everything on file"} right={<Badge tone={gaps.length ? "warn" : "ok"}>{docs.filter(d => d.status === "On file").length}/{docs.filter(d => d.status !== "Not needed").length} on file</Badge>}>
          {docs.map(d => (
            <ListRow key={d.name} title={d.name} sub={d.detail} tone={d.status === "Missing" ? "bad" : d.status === "Expiring" ? "warn" : undefined}
              right={<>
                <Badge tone={docTone(d.status)}>{d.status}</Badge>
                {(d.status === "Missing" || d.status === "Expiring") && <Btn size="sm" onClick={() => confirmThen({ title: "Request “" + d.name + "”?", body: "Sends a request to " + (guardian(f)?.name || f.surname) + " by " + f.channel + " (simulated) and logs it on the family timeline.", confirmLabel: "Request", run: () => requestDocument({ familyId: f.id, doc: d.name }) })}>Request</Btn>}
              </>} />
          ))}
          {s.comms.some(c => c.familyId === f.id && c.summary.startsWith("Requested document")) && <div style={{ marginTop: 8 }}><Sub>Requests sent from here show as Requested until the document is received.</Sub></div>}
        </Card>
      </div>
    </Page>
  );
}

function FinancePane({ f }: { f: Family }) {
  const { s } = useRos();
  const invs = (idx().invoicesByFamily.get(f.id) || []).slice().sort((a, b) => b.weekOf.localeCompare(a.weekOf));
  const pays = (idx().paymentsByFamily.get(f.id) || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const plan = s.plans.find(p => p.familyId === f.id);
  const due = familyDue(f.id), overdue = familyBalance(f.id);
  const lastPaid = pays.find(p => p.status === "Succeeded");
  const cols: Col<Invoice>[] = [
    { key: "id", label: "Invoice", w: "1fr", render: i => <RecLink r={{ kind: "invoice", id: i.id }} /> },
    { key: "wk", label: "Week of", w: ".8fr", render: i => fmtDate(i.weekOf), sort: i => i.weekOf },
    { key: "t", label: "Total", w: ".7fr", align: "right", render: i => euro(invoiceTotal(i)), sort: i => invoiceTotal(i) },
    { key: "b", label: "Balance", w: ".7fr", align: "right", render: i => euro(invoiceBalance(i)), sort: i => invoiceBalance(i) },
    { key: "s", label: "Status", w: "1fr", render: i => <Stack gap={2}><StatusBadge s={invoiceStatus(i)} />{invoiceStatus(i) === "Overdue" && <Sub>{reminderStage(i).label}</Sub>}</Stack> },
    { key: "a", label: "", w: "1.1fr", align: "right", render: i => {
      const st = invoiceStatus(i);
      if (st === "Overdue") return <Btn size="sm" onClick={() => sendInvoiceReminder({ invoiceId: i.id, stage: reminderStage(i).label })}>Send reminder</Btn>;
      if (invoiceBalance(i) > 0 && st !== "On plan" && st !== "Debt review") return <Btn size="sm" variant="subtle" onClick={() => confirmThen({ title: "Take " + euro(invoiceBalance(i)) + " by card over the phone?", body: "Simulated payment against " + i.id + ". No card is charged; the invoice, family balance and aged debt update.", confirmLabel: "Record payment", run: () => payNow({ invoiceId: i.id, method: "Card by phone" }) })}>Take payment</Btn>;
      return null;
    } },
  ];
  const stmt = invs.filter(i => invoiceBalance(i) > 0 || i.weekOf >= "2026-10-05").slice(0, 6);
  return (
    <Stack gap={14}>
      <Grid min={130}>
        <Kpi label="Outstanding" value={euro(due)} tone={due > 0 ? "warn" : "ok"} sub={"Pays by " + f.method.toLowerCase()} />
        <Kpi label="Overdue or on plan" value={euro(overdue)} tone={overdue > 0 ? "bad" : "ok"} />
        <Kpi label="Invoices" value={invs.length} sub={invs.filter(i => invoiceBalance(i) > 0).length + " open"} />
        <Kpi label="Last payment" value={lastPaid ? euro(lastPaid.amount) : "None"} sub={lastPaid ? fmtDate(lastPaid.date) + " · " + lastPaid.method : undefined} />
      </Grid>
      {plan && <PlanPanel id={plan.id} compact />}
      <Card title="Invoices" pad={false}><Table rows={invs} cols={cols} rowKey={i => i.id} minWidth={640} dense pageSize={8} /></Card>
      <Card title="Payments" sub={pays.length + " on record"}>
        {pays.slice(0, 6).map(p => <ListRow key={p.id} title={euro(p.amount) + " · " + p.method} sub={fmtDate(p.date) + " · ref " + p.ref + (p.retry ? " · " + p.retry : "")} right={<>{p.invoiceId && <RecLink r={{ kind: "invoice", id: p.invoiceId }} />}<StatusBadge s={p.status} /></>} />)}
        {!pays.length && <Empty title="No payments yet" />}
      </Card>
      <Card title="Statement preview" sub="What the family receives" right={<><DemoTag /><Btn size="sm" variant="primary" onClick={() => confirmThen({ title: "Email statement to " + (guardian(f)?.name || f.surname) + "?", body: "Statement with a closing balance of " + euro(due) + ". Simulated: logged on the family timeline and in Activity.", confirmLabel: "Send statement", run: () => sendStatement({ familyId: f.id, balance: due }) })}>Email statement</Btn></>}>
        <div style={{ background: "#fff", color: "#1d2433", borderRadius: 12, padding: 18, boxShadow: "0 8px 24px rgba(0,0,0,.18)" }}>
          <Row style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1, fontSize: 11.5, color: "#4b5468", lineHeight: 1.5 }}><div style={{ fontWeight: 700, color: "#060068", fontSize: 13 }}>Statement of account</div>Ray of Sunshine · Hazelbrook Rise, Rathnew, Co. Wicklow</div>
            <div style={{ textAlign: "right", fontSize: 11.5, color: "#4b5468" }}>{fmtDate(TODAY)} {TODAY.slice(0, 4)}<br />Parent ID <b style={{ color: "#1d2433" }}>{f.id}</b></div>
          </Row>
          <div style={{ marginTop: 10, fontSize: 12, color: "#4b5468" }}>To <b style={{ color: "#1d2433" }}>{guardian(f)?.name}</b></div>
          <div style={{ marginTop: 10, borderTop: "1px solid #e5e7eb" }}>
            {stmt.map(i => (
              <div key={i.id} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: "1px solid #f0f1f4", fontSize: 12 }}>
                <span style={{ width: 86, fontFamily: "var(--mono)" }}>{i.id}</span>
                <span style={{ flex: 1, color: "#4b5468" }}>w/c {fmtDate(i.weekOf)} · {invoiceStatus(i)}</span>
                <span style={{ width: 74, textAlign: "right" }}>{euro(invoiceTotal(i))}</span>
                <span style={{ width: 74, textAlign: "right", color: "#4f7a28" }}>{euro(-invoicePaid(i))}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", marginTop: 10, paddingTop: 8, borderTop: "2px solid #060068", fontWeight: 700, color: "#060068", fontSize: 13.5 }}><span style={{ flex: 1 }}>Balance due</span><span>{euro(due)}</span></div>
          <div style={{ marginTop: 8, fontSize: 10.5, color: "#6b7280" }}>Demo statement: amounts are illustrative. Older paid invoices are summarised in the app.</div>
        </div>
      </Card>
    </Stack>
  );
}

/* ---------------- Tasks ---------------- */
function taskFamily(t: Task): string | undefined {
  const s = getState(), l = t.link;
  if (!l) return undefined;
  switch (l.kind) {
    case "family": return l.id;
    case "request": return s.requests.find(x => x.id === l.id)?.familyId;
    case "claim": return s.claims.find(x => x.id === l.id)?.familyId;
    case "plan": return s.plans.find(x => x.id === l.id)?.familyId;
    case "invoice": return s.invoices.find(x => x.id === l.id)?.familyId;
    case "message": return s.messages.find(x => x.id === l.id)?.familyId;
    case "approval": { const a = s.approvals.find(x => x.id === l.id); return a?.link?.kind === "family" ? a.link.id : undefined; }
    default: return undefined;
  }
}

function FamilyTasks() {
  const { s, ui } = useRos();
  const r = resolveFamily(ui.focus.familyId);
  const [status, setStatus] = useState<"Open" | "Done" | "All">("Open");
  const [dept, setDept] = useState("All");
  const [prio, setPrio] = useState("All");
  const [mine, setMine] = useState<"All" | "Focused">("All");
  const [q, setQ] = useState("");
  const linked = s.tasks.map(t => ({ t, fid: taskFamily(t) })).filter((x): x is { t: Task; fid: string } => !!x.fid && inScope(family(x.fid)?.locationId));
  const depts = ["All", ...Array.from(new Set(linked.map(x => x.t.department)))];
  const tq = q.trim().toLowerCase();
  const rows = linked.filter(({ t, fid }) => (status === "All" || (status === "Open" ? t.status !== "Done" : t.status === "Done")) && (dept === "All" || t.department === dept) && (prio === "All" || t.priority === prio)
    && (mine === "All" || fid === r.id) && (!tq || (t.title + " " + t.owner + " " + fid + " " + (family(fid)?.surname || "")).toLowerCase().includes(tq)))
    .sort((a, b) => (a.t.status === "Done" ? 1 : 0) - (b.t.status === "Done" ? 1 : 0) || ({ High: 0, Medium: 1, Low: 2 }[a.t.priority] - { High: 0, Medium: 1, Low: 2 }[b.t.priority]) || a.t.dueDate.localeCompare(b.t.dueDate));
  const open = linked.filter(x => x.t.status !== "Done");
  const f = r.id ? family(r.id) : undefined;
  return (
    <Page>
      <PageHead eyebrow="Families · Tasks" title="Work that touches a family"
        sub="Every task linked to a family, directly or through its requests, claims, plans, invoices or messages. Tick to complete; it updates Work and Activity too." />
      <Grid min={150} style={{ marginBottom: 16 }}>
        <Kpi label="Open family tasks" value={open.length} />
        <Kpi label="High priority" value={open.filter(x => x.t.priority === "High").length} tone="warn" onClick={() => { setPrio("High"); setStatus("Open"); }} />
        <Kpi label="Overdue" value={open.filter(x => x.t.dueDate < TODAY).length} tone={open.some(x => x.t.dueDate < TODAY) ? "bad" : "ok"} />
        <Kpi label="Due today" value={open.filter(x => x.t.dueDate === TODAY).length} />
        <Kpi label="Done" value={linked.length - open.length} tone="ok" onClick={() => setStatus("Done")} />
      </Grid>
      <div className="ros-split">
        <Card pad={false} title={rows.length + " task" + (rows.length === 1 ? "" : "s")}>
          <Row wrap gap={8} style={{ padding: "0 16px 12px" }}>
            <Seg size="sm" value={status} onChange={setStatus} options={["Open", "Done", "All"]} />
            <Seg size="sm" value={mine} onChange={setMine} options={[["All", "All families"], ["Focused", f ? f.surname + " only" : "Focused"]] as ["All" | "Focused", ReactNode][]} />
            <select className="ros-input" style={{ width: 150 }} value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">{depts.map(d => <option key={d} value={d}>{d === "All" ? "Any department" : d}</option>)}</select>
            <select className="ros-input" style={{ width: 130 }} value={prio} onChange={(e) => setPrio(e.target.value)} aria-label="Priority">{["All", "High", "Medium", "Low"].map(d => <option key={d} value={d}>{d === "All" ? "Any priority" : d}</option>)}</select>
            <Search value={q} onChange={setQ} placeholder="Search tasks" width={180} />
          </Row>
          <div style={{ padding: "0 4px 8px" }}>
            {rows.map(({ t, fid }) => (
              <div key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                <Row gap={8} style={{ padding: "8px 14px 0" }}>
                  <RecLink r={{ kind: "family", id: fid }}>{fid} · {family(fid)?.surname}</RecLink>
                  {t.dueDate < TODAY && t.status !== "Done" && <Badge tone="bad">Overdue</Badge>}
                  <Badge>{t.priority}</Badge>
                </Row>
                <TaskRow id={t.id} />
              </div>
            ))}
            {!rows.length && <Empty title="No tasks match" body="Change the filters, or add a task for the selected family." />}
          </div>
        </Card>
        <Stack gap={14}>
          <FamilyPicker value={r.id} note={r.note} onPick={(id) => setFocus({ familyId: id })} />
          {f ? <Card title="Add a task"><NewTaskForm key={f.id} f={f} /></Card> : null}
          {f && <Card title={"Open for " + f.surname}>
            {open.filter(x => x.fid === f.id).map(x => <TaskRow key={x.t.id} id={x.t.id} />)}
            {!open.some(x => x.fid === f.id) && <Empty title="Nothing open for this family" />}
          </Card>}
        </Stack>
      </div>
    </Page>
  );
}

