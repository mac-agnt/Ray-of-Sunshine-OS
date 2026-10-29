/* Record detail panels. Every ID in the app opens one of these in the shared
   drawer, so ROS1042 looks the same from the inbox, a manifest, an invoice or
   the parent portal. Medical and safeguarding detail is masked for roles
   that should not see it. */
import { useState, type ReactNode } from "react";
import type { Ref, Family, Child, Invoice, Tone } from "./types";
import { useRos, closeRecord, closeAllRecords, nav, openRecord, confirmThen, getState } from "./store";
import {
  child, family, staffById, locById, schoolName, childName, guardian, idx, invoiceTotal, invoicePaid, invoiceBalance,
  invoiceStatus, reminderStage, familyDue, paymentStatus, childStatus, ratioCheck, manifest, certStatus, bookingsOn, daysOverdue,
} from "./selectors";
import { TODAY, fmtDay, fmtDate, rel, euro, daysBetween, hm, toMin, dowLong, THIS_WEEK } from "./time";
import { AGENTS, agentById } from "./agents";
import {
  decideRequest, approveRelief, decideApproval, sendClaimReminder, acceptClaim, sendDraft, escalateMessage, toggleTask,
  sendInvoiceReminder, resolveMissing, runAutomation, toggleAutomation,
} from "./actions";
import { Badge, Btn, Card, KV, Label, RecLink, Seg, Table, Timeline, StatusBadge, Callout, Avatar, Row, Stack, Sub, Bar, Empty, DemoTag, toneInk, statusTone, ListRow } from "./ui";

const H = ({ children }: { children: ReactNode }) => <div style={{ fontSize: 13.5, fontWeight: 600, margin: "18px 0 10px" }}>{children}</div>;
const Masked = ({ what }: { what: string }) => (
  <Callout tone="neutral" title="Restricted">{what} is visible to authorised roles only (owner, operations, location manager, room staff, driver for collectors). Switch role in the header to see how access changes.</Callout>
);

/* ---------------- shared derived text ---------------- */
export function familySummary(f: Family): string {
  const s = useRosState();
  const due = familyDue(f.id), plan = s.plans.find(p => p.familyId === f.id);
  const kids = f.childIds.map(child).filter(Boolean) as Child[];
  const parts: string[] = [];
  parts.push(f.surname + " family (" + f.id + "): " + kids.map(k => k.firstName + " (" + (k.programme === "EY" ? idx().room.get(k.roomId)?.kind : k.schoolClass) + ")").join(", ") + " at " + locById(f.locationId)?.short + ".");
  if (plan) {
    const missed = plan.instalments.filter(i => i.status === "Missed");
    parts.push(plan.status === "Broken" ? "Payment plan " + plan.id + " is broken (revision " + plan.revision + " of " + plan.maxRevisions + "), " + euro(due) + " outstanding. " + plan.nextAction + "."
      : euro(due) + " outstanding on plan " + plan.id + " (revision " + plan.revision + " of " + plan.maxRevisions + ")." + (missed.length ? " " + missed.length + " instalment" + (missed.length > 1 ? "s" : "") + " of " + euro(missed[0].amount) + " missed (" + fmtDate(missed[0].due) + "). " + plan.nextAction + "." : " On track."));
  } else if (due > 0) {
    const od = (idx().invoicesByFamily.get(f.id) || []).filter(i => invoiceStatus(i) === "Overdue");
    parts.push(od.length ? euro(od.reduce((n, i) => n + invoiceBalance(i), 0)) + " overdue across " + od.length + " invoice" + (od.length > 1 ? "s" : "") + " (" + reminderStage(od[0]).label + ")." : euro(due) + " due by " + f.method.toLowerCase() + ", not yet overdue.");
  } else parts.push("Account paid up. Pays by " + f.method.toLowerCase() + ".");
  if (f.funding === "NCS") {
    const aws = kids.map(k => idx().awardByChild.get(k.id)).filter(Boolean);
    const exp = aws.filter(a => a!.expires <= "2026-10-31");
    const cl = s.claims.filter(c => c.familyId === f.id && c.status === "Awaiting acceptance");
    parts.push("NCS: " + aws.map(a => a!.agreedHours + "h/wk").join(", ") + " agreed." + (exp.length ? " CHICK expires " + fmtDate(exp[0]!.expires) + "." : "") + (cl.length ? " Claim " + cl[0].id + " (" + euro(cl[0].amount) + ") awaits acceptance by " + cl[0].deadline.slice(11) + " " + fmtDay(cl[0].deadline.slice(0, 10)) + "." : ""));
  }
  const pend = s.requests.filter(r => r.familyId === f.id && r.status === "Pending");
  if (pend.length) parts.push(pend.length + " pending request" + (pend.length > 1 ? "s" : "") + ": " + pend.map(r => r.id).join(", ") + ".");
  if (f.blocked) parts.push("New bookings are restricted until the balance clears.");
  return parts.join(" ");
}
const useRosState = () => getState(); // plain read, safe outside hook order

/* ---------------- family ---------------- */
export function FamilyPanel({ id, full }: { id: string; full?: boolean }) {
  const { s, role } = useRos();
  const f = family(id);
  const [tab, setTab] = useState("Overview");
  if (!f) return <Empty title="Family not found" />;
  const kids = f.childIds.map(child).filter(Boolean) as Child[];
  const invs = (idx().invoicesByFamily.get(f.id) || []).slice().sort((a, b) => b.weekOf.localeCompare(a.weekOf));
  const plan = s.plans.find(p => p.familyId === f.id);
  const timeline = s.comms.filter(c => c.familyId === f.id).map(c => ({ at: c.at, title: c.summary, detail: c.channel + " · " + c.by, tone: c.direction === "in" ? "info" : c.direction === "note" ? "neutral" : "accent" }))
    .concat(s.messages.filter(m => m.familyId === f.id && m.direction === "in").map(m => ({ at: m.received, title: "“" + m.subject + "”", detail: m.queue + " queue · " + m.classification + " · " + m.status, tone: "warn" })))
    .sort((a, b) => b.at.localeCompare(a.at));
  const tasks = s.tasks.filter(t => (t.link?.kind === "family" && t.link.id === f.id) || (t.link?.kind === "plan" && plan && t.link.id === plan.id) || (t.link?.kind === "request" && s.requests.some(r => r.id === t.link!.id && r.familyId === f.id)) || (t.link?.kind === "claim" && s.claims.some(c => c.id === t.link!.id && c.familyId === f.id)));
  const ps = paymentStatus(f);
  const tabs = ["Overview", "Children", "Bookings", "Invoices & Payments", ...(f.funding === "NCS" ? ["NCS"] : []), "Messages", "Documents", "Tasks"];
  return (
    <div>
      <Row wrap gap={8} style={{ marginBottom: 12 }}>
        <Badge tone="info">{f.funding === "NCS" ? "NCS family" : "Private"}</Badge>
        <StatusBadge s={ps} />
        {f.flags.map(x => <Badge key={x} tone={statusTone(x)}>{x}</Badge>)}
        <Badge>{locById(f.locationId)?.short}</Badge>
        {!f.consentsComplete && <Badge tone="warn">Consents incomplete</Badge>}
      </Row>
      <Seg size="sm" options={tabs} value={tab} onChange={setTab} />
      {tab === "Overview" && (
        <div>
          <div style={{ marginTop: 14 }}><Callout tone="info" title="Account summary (AI, from the records below)">{familySummary(f)}</Callout></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginTop: 12 }}>
            {[["Outstanding", role.finance ? euro(familyDue(f.id)) : "Restricted"], ["Children", String(kids.length)], ["Pays by", f.method], ["Prefers", f.channel + " · " + f.language]].map(([k, v]) => (
              <div key={k} style={{ padding: "10px 12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 12 }}><Label>{k}</Label><div style={{ fontSize: 14, marginTop: 5, fontWeight: 600 }}>{v}</div></div>
            ))}
          </div>
          <H>Guardians</H>
          {f.guardians.map(g => <ListRow key={g.name} lead={<Avatar name={g.name} />} title={<span>{g.name} {g.primary && <Badge tone="accent">Billing contact</Badge>}</span>} sub={g.relation + " · " + g.email + " · " + g.phone} />)}
          <H>Children</H>
          {kids.map(k => <ListRow key={k.id} onClick={() => openRecord({ kind: "child", id: k.id })} lead={<Avatar name={k.firstName + " " + k.surname} />} title={childName(k)} sub={(k.programme === "EY" ? idx().room.get(k.roomId)?.name + " · " + idx().room.get(k.roomId)?.kind : schoolName(k.schoolId) + " · " + k.schoolClass) + " · age " + k.age + (k.routeId ? " · bus " + k.routeId : "")} right={<StatusBadge s={childStatus(k.id).status} />} />)}
          {f.notes && <><H>Notes</H><div style={{ fontSize: 13, color: "var(--body)" }}>{f.notes}</div></>}
          {full && <div style={{ marginTop: 14 }}><Row wrap><Btn onClick={() => nav("Comms", "Family History", { familyId: f.id })}>Communication history</Btn>{role.finance && <Btn onClick={() => nav("Billing", "Invoices", { familyId: f.id })}>Billing</Btn>}</Row></div>}
        </div>
      )}
      {tab === "Children" && <div style={{ marginTop: 12 }}>{kids.map(k => <div key={k.id} style={{ marginBottom: 12 }}><Card title={childName(k)} right={<RecLink r={{ kind: "child", id: k.id }}>Open child file</RecLink>}><ChildOverview c={k} /></Card></div>)}</div>}
      {tab === "Bookings" && (
        <div style={{ marginTop: 12 }}>
          <Table rowKey={b => b.id} minWidth={520} dense rows={s.bookings.filter(b => b.familyId === f.id && b.date >= "2026-10-19").sort((a, b) => a.date.localeCompare(b.date))}
            cols={[{ key: "d", label: "Day", w: "1fr", render: b => fmtDay(b.date) }, { key: "c", label: "Child", w: "1fr", render: b => child(b.childId)?.firstName }, { key: "s", label: "Session", w: "1.2fr", render: b => b.session + " " + b.start + "–" + b.end },
              { key: "t", label: "Bus", w: ".7fr", render: b => b.routeId ? <RecLink r={{ kind: "route", id: b.routeId }} /> : "—" }, { key: "st", label: "Status", w: ".8fr", render: b => <StatusBadge s={b.status === "Cancelled" ? "Cancelled" : b.source === "Late request" ? "Late booking" : "Booked"} /> }]} />
          {s.requests.filter(r => r.familyId === f.id).map(r => <ListRow key={r.id} onClick={() => openRecord({ kind: "request", id: r.id })} title={r.id + " · " + r.kind + " · " + fmtDay(r.date) + " " + r.start + "–" + r.end} sub={r.note} right={<StatusBadge s={r.status} />} />)}
          {(() => { const w = s.windows.find(x => x.status === "Open"); const sub = w?.submissions.find(x => x.familyId === f.id); return <div style={{ marginTop: 10 }}><Callout tone={sub ? "ok" : f.blocked ? "bad" : "warn"} title={"Booking window " + (w?.label || "")}>{f.blocked ? "Bookings restricted by Accounts until the overdue balance is cleared." : sub ? "Submitted " + rel(sub.submittedAt) + ": " + sub.sessions + " sessions, " + sub.hours + "h." : "Not yet submitted. Window closes Thu 22 Oct at 18:00."}</Callout></div>; })()}
        </div>
      )}
      {tab === "Invoices & Payments" && (role.finance ? (
        <div style={{ marginTop: 12 }}>
          {plan && <div style={{ marginBottom: 12 }}><PlanPanel id={plan.id} compact /></div>}
          <Table rowKey={i => i.id} minWidth={520} dense rows={invs} onRow={i => openRecord({ kind: "invoice", id: i.id })}
            cols={[{ key: "i", label: "Invoice", w: "1fr", render: i => <RecLink r={{ kind: "invoice", id: i.id }} /> }, { key: "w", label: "Issued", w: ".9fr", render: i => fmtDate(i.issued) },
              { key: "t", label: "Total", w: ".8fr", align: "right", render: i => euro(invoiceTotal(i)) }, { key: "b", label: "Balance", w: ".8fr", align: "right", render: i => euro(invoiceBalance(i)) }, { key: "s", label: "Status", w: "1fr", render: i => <StatusBadge s={invoiceStatus(i)} /> }]} />
          <H>Payments</H>
          {(idx().paymentsByFamily.get(f.id) || []).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map(p => <ListRow key={p.id} title={euro(p.amount) + " · " + p.method} sub={fmtDate(p.date) + " · " + p.ref + (p.retry ? " · " + p.retry : "")} right={<StatusBadge s={p.status} />} />)}
        </div>
      ) : <div style={{ marginTop: 12 }}><Masked what="Billing detail" /></div>)}
      {tab === "NCS" && (
        <div style={{ marginTop: 12 }}>
          {kids.map(k => { const a = idx().awardByChild.get(k.id); return a ? <div key={k.id} style={{ marginBottom: 10 }}><AwardCard id={a.id} /></div> : null; })}
          {s.claims.filter(c => c.familyId === f.id).map(c => <ListRow key={c.id} onClick={() => openRecord({ kind: "claim", id: c.id })} title={c.id + " · " + euro(c.amount) + " · " + c.period} sub={"Deadline " + c.deadline + " · " + c.reminders.length + " reminder(s)"} right={<StatusBadge s={c.status} />} />)}
        </div>
      )}
      {tab === "Messages" && <div style={{ marginTop: 14 }}>{timeline.length ? <Timeline items={timeline.map(t => ({ at: rel(t.at), title: t.title, detail: t.detail, tone: t.tone as any }))} /> : <Empty title="No messages yet" />}</div>}
      {tab === "Documents" && (
        <div style={{ marginTop: 12 }}>
          {[["Registration form", "Signed " + fmtDate(f.joined), "ok"], ["Fees and payment terms 2026/27", "E-signed 25 Aug 2026", "ok"], ["Photo, outing and transport consents", f.consentsComplete ? "Complete" : "1 consent missing", f.consentsComplete ? "ok" : "warn"],
            ...kids.filter(k => k.medical.length).map(k => [k.firstName + " · medical care plan", "Reviewed Sep 2026", "ok"]), ...(f.funding === "NCS" ? [["NCS award letter(s)", "On file · CHICK masked", "ok"]] : []), ...(f.flags.some(x => /plan/i.test(x)) ? [["Payment plan agreement", "E-signed", "ok"]] : []),
            ["SEPA mandate", f.method === "SEPA direct debit" ? "Active" : "Not used", f.method === "SEPA direct debit" ? "ok" : "neutral"]].map(([n, st, t]) => <ListRow key={n as string} title={n} sub={st} right={<Badge tone={t as any}>{t === "ok" ? "On file" : t === "warn" ? "Action needed" : "n/a"}</Badge>} />)}
        </div>
      )}
      {tab === "Tasks" && <div style={{ marginTop: 12 }}>{tasks.length ? tasks.map(t => <TaskRow key={t.id} id={t.id} />) : <Empty title="No open tasks" body="Tasks raised by staff or agents for this family appear here." />}</div>}
    </div>
  );
}

/* ---------------- child ---------------- */
function ChildOverview({ c }: { c: Child }) {
  const { role } = useRos();
  const st = childStatus(c.id);
  const kw = staffById(c.keyWorkerId);
  return (
    <div>
      <KV items={[["Location", locById(c.locationId)?.short], [c.programme === "EY" ? "Room" : "School", c.programme === "EY" ? idx().room.get(c.roomId)?.name + " (" + idx().room.get(c.roomId)?.kind + ")" : schoolName(c.schoolId)],
        ["Date of birth", role.medical ? fmtDate(c.dob) + " " + c.dob.slice(0, 4) : "Restricted"], ["Key worker", kw?.name || "—"], ["Today", st.status + (st.time ? " · " + st.time : "")], ["Transport", c.routeId ? c.routeId + " · consent " + (c.consents.transport ? "given" : "missing") : "Walks / collected"]]} />
      {role.medical && c.medical.some(m => m.severity !== "Info") && <div style={{ marginTop: 10 }}><Callout tone={c.medical.some(m => m.severity === "Severe") ? "bad" : "warn"} title="Medical alert">{c.medical.map(m => m.kind + ": " + m.detail).join(" · ")}</Callout></div>}
      {!role.medical && c.medical.length > 0 && <div style={{ marginTop: 10 }}><Badge tone="warn">Medical flag on file · restricted</Badge></div>}
    </div>
  );
}
export function ChildPanel({ id }: { id: string }) {
  const { s, role } = useRos();
  const c = child(id);
  const [tab, setTab] = useState("Overview");
  if (!c) return <Empty title="Child not found" />;
  const f = family(c.familyId)!;
  const ev = s.attendance.filter(a => a.childId === c.id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).slice(0, 14);
  const inc = s.incidents.filter(i => i.childId === c.id);
  const dy = s.diary.filter(d => d.childId === c.id);
  return (
    <div>
      <Row wrap gap={8} style={{ marginBottom: 12 }}>
        <Badge tone="info">{c.programme === "EY" ? "Early Years" : "School Age"}</Badge>
        <RecLink r={{ kind: "family", id: f.id }}>{f.id} · {f.surname} family</RecLink>
        {c.supports && <Badge tone="info">AIM support</Badge>}
      </Row>
      <Seg size="sm" options={["Overview", "Medical & Collectors", "Attendance", "Learning & Incidents"]} value={tab} onChange={setTab} />
      <div style={{ marginTop: 14 }}>
        {tab === "Overview" && (
          <div>
            <ChildOverview c={c} />
            <H>Consents</H>
            <Row wrap>{Object.entries(c.consents).map(([k, v]) => <Badge key={k} tone={v ? "ok" : "warn"}>{k[0].toUpperCase() + k.slice(1)}: {v ? "yes" : "no"}</Badge>)}</Row>
            <H>This week</H>
            {THIS_WEEK.map(d => { const b = (idx().bookingsByChild.get(c.id) || []).filter(x => x.date === d); return <ListRow key={d} title={fmtDay(d)} sub={b.length ? b.map(x => x.session + " " + x.start + "–" + x.end + (x.routeId ? " · " + x.routeId : "")).join(" · ") : "Not booked"} right={b.length ? <StatusBadge s={d < TODAY ? "Attended" : d === TODAY ? childStatus(c.id).status : "Booked"} /> : undefined} />; })}
            {c.supports && <><H>Additional supports</H><div style={{ fontSize: 13, color: "var(--body)" }}>{c.supports}</div></>}
          </div>
        )}
        {tab === "Medical & Collectors" && (
          <div>
            {role.medical ? (
              <>
                {c.medical.length ? c.medical.map((m, i) => <Callout key={i} tone={m.severity === "Severe" ? "bad" : m.severity === "Moderate" ? "warn" : "neutral"} title={m.kind + " · " + m.severity}>{m.detail}</Callout>) : <Callout tone="ok" title="No medical alerts on file">Parent confirmed at registration and September review.</Callout>}
                {c.medication && <div style={{ marginTop: 10 }}><KV items={[["Medication", c.medication.name], ["Stored", c.medication.stored], ["Expires", fmtDate(c.medication.expires) + " " + c.medication.expires.slice(0, 4)], ["Review", c.medication.expires <= "2026-11-03" ? "Due now: ask parent for replacement" : "In date"]]} /></div>}
              </>
            ) : <Masked what="Medical information" />}
            <H>Authorised collectors</H>
            {c.collectors.map(x => <ListRow key={x.name} lead={<Avatar name={x.name} tone={x.permitted ? undefined : "var(--bad)"} />} title={x.name} sub={x.relation + (x.note && (role.medical || role.id === "driver") ? " · " + x.note : "")} right={<Badge tone={x.permitted ? "ok" : "bad"}>{x.permitted ? "Permitted" : "NOT permitted"}</Badge>} />)}
          </div>
        )}
        {tab === "Attendance" && (
          <Timeline items={ev.map(a => ({ at: fmtDay(a.date) + " " + a.time, title: { in: "Signed in", out: "Signed out", boarded: "Boarded " + (a.routeId || "bus"), absent: "Absent", "not-present": "Not present at pickup" }[a.kind], detail: a.by + (a.collector ? " · " + a.collector : "") + (a.note ? " · " + a.note : ""), tone: (a.kind === "not-present" ? "bad" : a.kind === "in" ? "ok" : "neutral") as Tone }))} />
        )}
        {tab === "Learning & Incidents" && (
          <div>
            {c.programme === "EY" ? (dy.length ? dy.map(d => <Card key={d.id} title={"Daily diary · " + fmtDay(d.date)} right={<StatusBadge s={d.status} />}><div style={{ fontSize: 12.5, color: "var(--body)", lineHeight: 1.6 }}>{d.meals} · {d.mood} · {d.activity}. {d.note}</div>{d.observation && <div style={{ marginTop: 8 }}><Callout tone="info" title="Observation">{d.observation.text} <span style={{ color: "var(--faint)" }}>{d.observation.tags.join(" · ")}</span></Callout></div>}</Card>) : <Empty title="No diary today yet" />) : <Callout tone="neutral">School-age children have activity notes rather than learning journals.</Callout>}
            <H>Incidents</H>
            {role.safeguarding || role.medical ? (inc.length ? inc.map(i => <ListRow key={i.id} onClick={() => openRecord({ kind: "incident", id: i.id })} title={i.id + " · " + i.kind} sub={fmtDay(i.date) + " " + i.time + " · " + i.severity} right={<StatusBadge s={i.status} />} />) : <Empty title="No incidents recorded" />) : <Masked what="Incident detail" />}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- invoice ---------------- */
export function InvoicePanel({ id }: { id: string }) {
  const { s, role } = useRos();
  const inv = s.invoices.find(i => i.id === id);
  if (!inv) return <Empty title="Invoice not found" />;
  if (!role.finance && role.id !== "parent") return <Masked what="Invoice detail" />;
  const f = family(inv.familyId)!, st = invoiceStatus(inv);
  const charges = inv.lines.filter(l => l.amount > 0), subsidy = inv.lines.filter(l => l.kind === "NCS subsidy"), credits = inv.lines.filter(l => l.amount < 0 && l.kind !== "NCS subsidy");
  const gross = charges.reduce((n, l) => n + l.amount, 0), sub = subsidy.reduce((n, l) => n + l.amount, 0), cr = credits.reduce((n, l) => n + l.amount, 0);
  const pays = (idx().paymentsByInvoice.get(inv.id) || []);
  return (
    <div>
      <Row wrap style={{ marginBottom: 12 }}><StatusBadge s={st} />{st === "Overdue" && <Badge tone="warn">{reminderStage(inv).label} · {daysOverdue(inv)} days</Badge>}{inv.planId && <RecLink r={{ kind: "plan", id: inv.planId }} />}<DemoTag>Demo fee rules</DemoTag></Row>
      <div style={{ background: "#fff", color: "#1d2433", borderRadius: 14, padding: "22px 22px 18px", boxShadow: "0 10px 30px rgba(0,0,0,.25)" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <img src="https://www.roskids.ie/wp-content/uploads/2022/03/Ros-Circle-Logo.png" alt="" width={46} height={46} style={{ borderRadius: 23, background: "#FFF100" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
          <div style={{ flex: 1, fontSize: 11.5, lineHeight: 1.5, color: "#4b5468" }}><div style={{ fontWeight: 700, color: "#060068", fontSize: 13 }}>Ray of Sunshine Morning, After School and Early Years Services</div>Hazelbrook Rise, Rathnew, Co. Wicklow, A67 HX39</div>
          <div style={{ textAlign: "right" }}><div style={{ fontSize: 18, fontWeight: 700, color: "#060068" }}>{inv.id}</div><div style={{ fontSize: 11, color: "#6b7280" }}>Issued {fmtDate(inv.issued)} · Due {fmtDate(inv.due)}</div></div>
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: "#4b5468" }}>Bill to <b style={{ color: "#1d2433" }}>{guardian(f)?.name}</b> · Parent ID <b style={{ color: "#1d2433" }}>{f.id}</b> · Week of {fmtDate(inv.weekOf)}</div>
        <div style={{ marginTop: 12, borderTop: "1px solid #e5e7eb" }}>
          {charges.map(l => <div key={l.id} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: "1px solid #f0f1f4", fontSize: 12 }}><span style={{ flex: 1 }}>{l.label}{l.addedBy && <span style={{ color: "#1B75BB" }}> · added by {l.addedBy}</span>}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{euro(l.amount)}</span></div>)}
        </div>
        <div style={{ marginTop: 10, fontSize: 12.5 }}>
          <div style={{ display: "flex", padding: "3px 0" }}><span style={{ flex: 1, color: "#4b5468" }}>Charges</span><span>{euro(gross)}</span></div>
          {subsidy.map(l => <div key={l.id} style={{ display: "flex", padding: "3px 0", color: "#0F5A94" }}><span style={{ flex: 1 }}>{l.label}</span><span>{euro(l.amount)}</span></div>)}
          {credits.map(l => <div key={l.id} style={{ display: "flex", padding: "3px 0", color: "#4f7a28" }}><span style={{ flex: 1 }}>{l.label}</span><span>{euro(l.amount)}</span></div>)}
          <div style={{ display: "flex", padding: "8px 0 0", marginTop: 6, borderTop: "2px solid #060068", fontWeight: 700, color: "#060068", fontSize: 14 }}><span style={{ flex: 1 }}>Parent net due</span><span>{euro(gross + sub + cr)}</span></div>
          <div style={{ display: "flex", padding: "3px 0", color: "#4b5468" }}><span style={{ flex: 1 }}>Paid</span><span>{euro(invoicePaid(inv))}</span></div>
          <div style={{ display: "flex", padding: "3px 0", fontWeight: 600 }}><span style={{ flex: 1 }}>Balance</span><span>{euro(invoiceBalance(inv))}</span></div>
        </div>
        <div style={{ marginTop: 12, fontSize: 10.5, color: "#6b7280", lineHeight: 1.5 }}>Fees are due on receipt. Part hours are billed to the next full hour. NCS subsidy shown separately where an award applies. Demo invoice: amounts are illustrative, not quoted fees.</div>
      </div>
      <H>Payments</H>
      {pays.length ? pays.map(p => <ListRow key={p.id} title={euro(p.amount) + " · " + p.method} sub={fmtDate(p.date) + " · " + p.ref} right={<StatusBadge s={p.status} />} />) : <Sub>No payments against this invoice yet{inv.planId ? " (plan payments are allocated oldest invoice first)" : ""}.</Sub>}
      {s.payments.filter(p => p.invoiceId === inv.id && p.status === "Failed").map(p => <ListRow key={p.id} title={"Failed: " + euro(p.amount) + " · " + p.method} sub={p.ref + (p.retry ? " · " + p.retry : "")} right={<StatusBadge s="Failed" />} />)}
      {role.finance && st === "Overdue" && <div style={{ marginTop: 12 }}><Btn variant="primary" onClick={() => sendInvoiceReminder({ invoiceId: inv.id, stage: reminderStage(inv).label })}>Send {reminderStage(inv).label.split("·")[1]?.trim().toLowerCase() || "reminder"} (simulated)</Btn></div>}
    </div>
  );
}

/* ---------------- booking requests ---------------- */
export function requestChecks(rid: string) {
  const s = useRosState();
  const r = s.requests.find(x => x.id === rid)!;
  const l = locById(r.locationId)!;
  const received = r.received;
  const startAt = r.date + " " + r.start;
  const noticeH = Math.round((Date.parse(startAt.replace(" ", "T")) - Date.parse(received.replace(" ", "T"))) / 3600000);
  const recDay = new Date(received.slice(0, 10) + "T00:00:00Z").getUTCDay();
  const weekend = recDay === 0 || recDay === 6;
  const ratio = ratioCheck(r.locationId, r.date, r.session);
  const capOk = r.kind !== "Late booking" || ratio.booked + 1 <= l.sacCapacity;
  const after = ratio.booked + (r.kind === "Late booking" ? 1 : r.kind === "Cancellation" ? -1 : 0);
  const ratioOk = Math.ceil(after / ratio.ratio) <= ratio.rostered || r.kind === "Cancellation";
  const inv = s.invoices.find(i => i.familyId === r.familyId && i.weekOf === "2026-10-19");
  const add = r.fees.reduce((n, f) => n + f.amount, 0);
  return { r, l, noticeH, noticeOk: noticeH >= s.config.noticeHours && !weekend, weekend, ratio, capOk, ratioOk, after, inv, add, manifestN: r.routeId ? manifest(r.routeId, r.date).length : 0 };
}
export function RequestPanel({ id }: { id: string }) {
  const { s, role } = useRos();
  const r = s.requests.find(x => x.id === id);
  if (!r) return <Empty title="Request not found" />;
  const k = requestChecks(id);
  const c = child(r.childId)!, f = family(r.familyId)!;
  const before = k.inv ? invoiceTotal(k.inv) : 0;
  const msg = r.messageId ? s.messages.find(m => m.id === r.messageId) : undefined;
  const decide = (d: "Approved" | "Declined") => confirmThen({
    title: (d === "Approved" ? "Approve " : "Decline ") + r.id + "?",
    body: d === "Approved" ? (r.kind === "Late booking" ? "Creates the booking for " + c.firstName + ", adds " + euro(k.add) + " to " + (k.inv?.id || "the invoice") + ", adds one to the " + fmtDay(r.date) + " register" + (r.routeId ? " and the " + r.routeId + " manifest" : "") + ", and sends the confirmation (simulated)." : r.kind === "Change" ? "Updates the booking times and the invoice line." : "Removes the booking from the register. The week is locked so no refund applies.") : "Nothing changes downstream. The family is told the request could not be accommodated (simulated).",
    confirmLabel: d === "Approved" ? "Approve" : "Decline", danger: d === "Declined", run: () => decideRequest({ id: r.id, decision: d }),
  });
  return (
    <div>
      <Row wrap style={{ marginBottom: 12 }}><StatusBadge s={r.status} /><Badge tone="info">{r.kind}</Badge><RecLink r={{ kind: "family", id: f.id }}>{f.id} · {f.surname}</RecLink><Sub>Received {rel(r.received)} via {r.channel}</Sub></Row>
      <Card title={childName(c) + " · " + fmtDay(r.date) + " · " + r.start + "–" + r.end} sub={l(k.l.short) + (r.schoolId ? " · collect from " + schoolName(r.schoolId) : "") + (r.routeId ? " on " + r.routeId : "")}>
        <div style={{ fontSize: 13, color: "var(--body)", fontStyle: "italic", lineHeight: 1.55 }}>“{r.note}”</div>
      </Card>
      <H>Checks (demo policy rules)</H>
      <div style={{ display: "grid", gap: 8 }}>
        {[
          [k.noticeOk || r.kind === "Cancellation", "Notice", k.noticeH + "h before the session" + (k.weekend ? " · received at the weekend" : "") + " · policy: at least " + s.config.noticeHours + "h on a weekday"],
          [k.capOk, "Capacity", k.ratio.booked + " booked of " + k.l.sacCapacity + " places on " + fmtDay(r.date) + (r.kind === "Late booking" ? " → " + (k.ratio.booked + 1) : "")],
          [k.ratioOk, "Ratio", k.after + " children vs " + k.ratio.rostered + " rostered at 1:" + k.ratio.ratio + " (illustrative, not a legal determination)"],
          [true, "Fees", r.kind === "Late booking" ? r.fees.map(x => x.label + " " + euro(x.amount)).join(" + ") + " = " + euro(k.add) : r.kind === "Cancellation" ? "Locked week: no refund under the published fee terms" : "Invoice line re-priced to the new hours"],
        ].map(([ok, h, d], i) => <Row key={i} gap={10}><Badge tone={ok ? "ok" : "warn"}>{ok ? "Pass" : "Check"}</Badge><Stack><span style={{ fontSize: 13, fontWeight: 500 }}>{h as string}</span><Sub>{d as string}</Sub></Stack></Row>)}
      </div>
      {r.kind === "Late booking" && (
        <>
          <H>What approval changes</H>
          <KV items={[["Booking", "New · " + fmtDay(r.date) + " " + r.start + "–" + r.end], k.inv && invoiceBalance(k.inv) > 0 ? ["Invoice " + k.inv.id, euro(before) + " → " + euro(before + k.add)] : ["Invoice", "New supplementary invoice · " + euro(k.add) + " (week already paid)"], ["Register", locById(r.locationId)?.short + " After School +1"], ["Manifest", r.routeId ? r.routeId + " · " + k.manifestN + " → " + (k.manifestN + 1) : "No transport"]]} />
          {f.funding === "NCS" && <div style={{ marginTop: 10 }}><Callout tone="info" title="NCS">Agreed NCS hours for this week are already used, so the extra session is charged privately. Programme rules and Ray of Sunshine policy are shown separately in NCS & Funding.</Callout></div>}
        </>
      )}
      {msg?.draft && <><H>Draft reply (AI, edit before sending)</H><div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--body)", padding: 12, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-2)" }}>{msg.draft}</div></>}
      {r.status === "Pending" && role.id !== "parent" && role.id !== "driver" && (
        <Row style={{ marginTop: 16 }}><Btn variant="primary" onClick={() => decide("Approved")}>Approve {r.kind.toLowerCase()}</Btn><Btn variant="danger" onClick={() => decide("Declined")}>Decline</Btn></Row>
      )}
      {r.status !== "Pending" && <div style={{ marginTop: 14 }}><Callout tone={r.status === "Approved" ? "ok" : "neutral"} title={r.status + " by " + r.decidedBy + " · " + rel(r.decidedAt || "")}>{r.status === "Approved" && r.kind === "Late booking" ? "Booking, invoice, register and manifest were written together. See Activity for the trail." : "Recorded in Activity."}</Callout></div>}
    </div>
  );
}
const l = (x?: string) => x || "";

/* ---------------- staffing issue ---------------- */
export function IssuePanel({ id }: { id: string }) {
  const { s, role } = useRos();
  const iss = s.issues.find(i => i.id === id);
  if (!iss) return <Empty title="Issue not found" />;
  if (iss.kind === "Missing child") {
    return (
      <div>
        <Row style={{ marginBottom: 12 }}><StatusBadge s={iss.status === "Open" ? "Urgent" : "Resolved"} dot /><Badge>{locById(iss.locationId)?.short}</Badge></Row>
        <Callout tone={iss.status === "Open" ? "bad" : "ok"} title={iss.title}>{iss.detail}</Callout>
        {iss.status === "Open" && role.id !== "parent" && (
          <div style={{ marginTop: 12 }}>
            <Label>Resolve after confirming with a person</Label>
            <Row wrap style={{ marginTop: 8 }}>
              <Btn variant="primary" onClick={() => resolveMissing({ issueId: iss.id, note: "Parent confirmed by phone: collected early from school." })}>Parent confirms early collection</Btn>
              <Btn onClick={() => resolveMissing({ issueId: iss.id, note: "School confirmed child on a school trip; parent informed." })}>School confirms whereabouts</Btn>
            </Row>
          </div>
        )}
      </div>
    );
  }
  const r = ratioCheck(iss.locationId, iss.date, iss.session as any);
  return (
    <div>
      <Row wrap style={{ marginBottom: 12 }}><StatusBadge s={iss.status === "Open" ? (r.ok ? "Resolved" : "Open") : "Resolved"} dot={iss.status === "Open"} /><Badge>{locById(iss.locationId)?.short}</Badge><Sub>{fmtDay(iss.date)} · {iss.session}</Sub></Row>
      <div style={{ fontSize: 13.5, color: "var(--body)", lineHeight: 1.6 }}>{iss.detail}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 14 }}>
        {[["Booked", r.booked], ["Rostered", r.rostered], ["Required", r.required]].map(([k, v]) => <div key={k as string} style={{ padding: 12, borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border)" }}><Label>{k}</Label><div style={{ fontSize: 24, fontWeight: 600, marginTop: 4, color: k === "Rostered" && !r.ok ? "var(--bad)" : "var(--ink)" }}>{v}</div></div>)}
      </div>
      <Sub>Demo ratio 1:{r.ratio} for school age. Configurable in Settings; not a regulatory determination.</Sub>
      <H>On the rota</H>
      {r.shifts.map(x => { const st = staffById(x.staffId)!; const away = s.absences.find(a => a.staffId === st.id && a.date === iss.date); return <ListRow key={x.id} lead={<Avatar name={st.name} />} title={st.name} sub={st.role + " · " + x.start + "–" + x.end + (x.relief ? " · relief" : "")} right={away ? <Badge tone="bad">{away.reason}</Badge> : <Badge tone="ok">On shift</Badge>} />; })}
      {iss.status === "Open" && !r.ok && (
        <>
          <H>Qualified relief (proposed by Ratio & Rota)</H>
          {(iss.offerStaffIds || []).map(sid => { const st = staffById(sid)!; const cs = certStatus(st); return (
            <Card key={sid} style={{ marginBottom: 10 }} title={st.name} sub={st.role + " · " + st.qualification + " · based " + locById(st.locationId)?.short}
              right={role.id === "owner" || role.id === "ops" || role.id === "locmgr" ? <Btn variant="primary" size="sm" onClick={() => confirmThen({ title: "Approve " + st.name + "?", body: "Adds a qualified relief shift (" + (iss.locationId === "ARR" ? "09:00–17:30" : "13:45–18:15") + ") to " + locById(iss.locationId)?.short + " on " + fmtDay(iss.date) + ". The ratio forecast, location card, risk count, Work approval and Activity update together.", confirmLabel: "Approve relief", run: () => approveRelief({ issueId: iss.id, staffId: sid }) })}>Approve {st.name.split(" ")[0]}</Btn> : <Badge>Needs ops approval</Badge>}>
              <Row wrap>{st.certs.map(c => <Badge key={c.kind} tone={c.expires < TODAY ? "bad" : daysBetween(TODAY, c.expires) <= 30 ? "warn" : "ok"}>{c.kind} · {fmtDate(c.expires)}</Badge>)}{cs.ok && <Badge tone="ok">Eligible</Badge>}</Row>
            </Card>); })}
        </>
      )}
      {(iss.status === "Resolved" || r.ok) && <div style={{ marginTop: 12 }}><Callout tone="ok" title="Ratio restored">{iss.resolvedBy ? "Approved by " + iss.resolvedBy + " · " + rel(iss.resolvedAt || "") + "." : "Forecast now meets the demo ratio."}</Callout></div>}
    </div>
  );
}

/* ---------------- NCS ---------------- */
export function AwardCard({ id }: { id: string }) {
  const { s } = useRos();
  const a = s.awards.find(x => x.id === id)!;
  const c = child(a.childId)!;
  const w = s.windows.find(x => x.status === "Open");
  const sub = w?.submissions.find(x => x.familyId === a.familyId);
  return (
    <Card title={c.firstName + " · " + a.type} sub={"CHICK " + a.chick + " (masked)"} right={<StatusBadge s={a.expires <= "2026-10-31" ? "Expiring " + fmtDate(a.expires) : "Active"} />}>
      <KV cols={3} items={[["Agreed hours", a.agreedHours + "h/wk"], ["Demo rate", "€" + a.rate.toFixed(2) + "/h"], ["Expires", fmtDate(a.expires) + " " + a.expires.slice(0, 4)], ["Last change", fmtDate(a.lastChange)], ["Next change allowed", fmtDate(a.nextChange) + " (8-week rule)"], ["w/c 2 Nov booked", sub ? sub.hours + "h submitted" : "Not submitted"]]} />
    </Card>
  );
}
export function ClaimPanel({ id }: { id: string }) {
  const { s, role } = useRos();
  const cl = s.claims.find(x => x.id === id);
  if (!cl) return <Empty title="Claim not found" />;
  const c = child(cl.childId)!, f = family(cl.familyId)!;
  const mins = Math.round((Date.parse(cl.deadline.replace(" ", "T")) - Date.parse(TODAY + "T" + hm(s.clockMin))) / 60000);
  const left = mins <= 0 ? "Lapsed" : mins < 1440 ? Math.floor(mins / 60) + "h " + (mins % 60) + "m left" : Math.floor(mins / 1440) + " days left";
  return (
    <div>
      <Row wrap style={{ marginBottom: 12 }}><StatusBadge s={cl.status} /><Badge tone={mins < 1440 && cl.status === "Awaiting acceptance" ? "bad" : "neutral"}>{cl.status === "Awaiting acceptance" ? left : "Closed"}</Badge><RecLink r={{ kind: "family", id: f.id }}>{f.id} · {f.surname}</RecLink></Row>
      <KV items={[["Child", childName(c)], ["Period", cl.period], ["Subsidised hours", cl.hours + "h"], ["Demo subsidy", euro(cl.amount)], ["Raised", fmtDate(cl.raised)], ["Acceptance deadline", cl.deadline]]} />
      <H>Reminder schedule (Days 2, 4, 6)</H>
      <Timeline items={[2, 4, 6].map(d => { const sent = cl.reminders.find(x => x.day === d); return { at: sent ? rel(sent.at) : "planned", title: "Day " + d + " reminder", detail: sent ? "Sent by " + sent.channel + " (simulated)" : "Not sent yet", tone: (sent ? "ok" : "neutral") as Tone }; }).concat(cl.reminders.filter(x => ![2, 4, 6].includes(x.day)).map(x => ({ at: rel(x.at), title: "Manual reminder", detail: x.channel + " (simulated)", tone: "accent" as any })))} />
      <Callout tone="neutral" title="Programme rule vs our policy">NCS rule (labelled separately): parents accept a claim within the acceptance window. Ray of Sunshine policy: if it lapses, those hours may be charged privately after a human review.</Callout>
      {cl.status === "Awaiting acceptance" && role.id !== "parent" && (
        <Row wrap style={{ marginTop: 14 }}>
          <Btn variant="primary" onClick={() => sendClaimReminder({ claimId: cl.id })}>Send reminder now (simulated)</Btn>
          <Btn onClick={() => acceptClaim({ claimId: cl.id })}>Mark accepted (parent did it)</Btn>
        </Row>
      )}
      {role.id === "parent" && cl.status === "Awaiting acceptance" && <Row style={{ marginTop: 14 }}><Btn variant="primary" onClick={() => acceptClaim({ claimId: cl.id })}>Accept claim (demo portal)</Btn></Row>}
    </div>
  );
}

/* ---------------- transport ---------------- */
export function RoutePanel({ id }: { id: string }) {
  const { s } = useRos();
  const rt = s.routes.find(r => r.id === id);
  const [day, setDay] = useState(TODAY);
  if (!rt) return <Empty title="Route not found" />;
  const v = s.vehicles.find(x => x.id === rt.vehicleId)!;
  const m = manifest(rt.id, day);
  return (
    <div>
      <KV items={[["Base", locById(rt.locationId)?.name], ["Vehicle", v.kind + " · " + v.reg], ["Driver", staffById(rt.driverId)?.name], ["Escort", rt.escortId ? staffById(rt.escortId)?.name : "None"], ["Fee", "€" + rt.feePerRun.toFixed(2) + " per run (demo)"], ["Stops", rt.stops.length + " schools"]]} />
      <H>Stops</H>
      <Row wrap>{rt.stops.map(st => <Badge key={st.schoolId}>{st.time} · {schoolName(st.schoolId)}</Badge>)}</Row>
      <H>Manifest (from accepted bookings)</H>
      <Seg size="sm" options={THIS_WEEK.map(d => [d, fmtDay(d)] as [string, string])} value={day} onChange={setDay} />
      <div style={{ marginTop: 10 }}>
        {m.length ? m.map(x => <ListRow key={x.booking.id} onClick={() => openRecord({ kind: "child", id: x.child.id })} lead={<Avatar name={childName(x.child)} />} title={childName(x.child)} sub={x.stop.time + " · " + schoolName(x.booking.schoolId) + (x.booking.source === "Late request" ? " · late booking" : "")}
          right={x.missing ? <Badge tone="bad">Not present</Badge> : x.arrived ? <Badge tone="ok">Signed in {x.arrived.time}</Badge> : x.boarded ? <Badge tone="info">Boarded {x.boarded.time}</Badge> : <Badge>{day < TODAY ? "Completed" : "Expected"}</Badge>} />) : <Empty title="No riders this day" body={day >= "2026-10-26" ? "Halloween midterm: no school runs." : undefined} />}
      </div>
    </div>
  );
}

/* ---------------- plans ---------------- */
export function PlanPanel({ id, compact }: { id: string; compact?: boolean }) {
  const { s, role } = useRos();
  const p = s.plans.find(x => x.id === id);
  if (!p) return <Empty title="Plan not found" />;
  if (!role.finance) return <Masked what="Payment plan detail" />;
  const f = family(p.familyId)!;
  const pays = s.payments.filter(x => x.planId === p.id && x.status === "Succeeded").reduce((n, x) => n + x.amount, 0);
  return (
    <Card title={"Payment plan " + p.id + " · " + f.surname} sub={"Revision " + p.revision + " of " + p.maxRevisions + " · e-sign " + p.esign + " · owner " + p.owner} right={<StatusBadge s={p.status} />}>
      <Row wrap gap={14} style={{ marginBottom: 10 }}><Stack><Label>Plan total</Label><b>{euro(p.total)}</b></Stack><Stack><Label>Paid</Label><b>{euro(pays)}</b></Stack><Stack><Label>Outstanding</Label><b>{euro(familyDue(f.id))}</b></Stack></Row>
      <Bar value={pays} max={p.total} tone={p.status === "Broken" ? "bad" : "ok"} />
      <div style={{ marginTop: 12 }}>
        {p.instalments.map(i => <Row key={i.n} gap={10} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}><span style={{ width: 22, fontSize: 12, color: "var(--faint)" }}>#{i.n}</span><span style={{ flex: 1, fontSize: 12.5 }}>{fmtDay(i.due)}</span><span style={{ fontSize: 12.5 }}>{euro(i.amount)}</span><StatusBadge s={i.status} /></Row>)}
      </div>
      <div style={{ marginTop: 12 }}><Callout tone={p.status === "Broken" ? "bad" : p.instalments.some(i => i.status === "Missed") ? "warn" : "ok"} title="Next action">{p.nextAction}. Policy: missed instalments are raised within a week; at most {p.maxRevisions} revisions; a third breach goes to the owner. No automatic penalties.</Callout></div>
      {!compact && <Row style={{ marginTop: 12 }}><Btn onClick={() => openRecord({ kind: "family", id: f.id })}>Open family</Btn></Row>}
    </Card>
  );
}

/* ---------------- approvals, tasks, messages ---------------- */
export function ApprovalPanel({ id }: { id: string }) {
  const { s, role } = useRos();
  const a = s.approvals.find(x => x.id === id);
  if (!a) return <Empty title="Approval not found" />;
  const canDecide = a.status === "Pending" && (role.id === "owner" || role.id === "ops" || a.ownerRole === role.id);
  return (
    <div>
      <Row wrap style={{ marginBottom: 12 }}><StatusBadge s={a.status} /><Badge tone="info">{a.kind}</Badge>{a.amount ? <Badge>{euro(a.amount)}</Badge> : null}{a.link && <RecLink r={a.link} />}</Row>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--body)" }}>{a.summary}</div>
      <div style={{ marginTop: 12 }}><KV items={[["Requested by", a.requestedBy], ["When", rel(a.requestedAt)], ["Decides", { owner: "Owner", ops: "Operations", accounts: "Accounts", ncs: "NCS admin", locmgr: "Location manager", practitioner: "Room leader", driver: "Driver", parent: "Parent" }[a.ownerRole]], ["On approval", a.effect]]} /></div>
      {a.kind === "Debt collection pack" && <div style={{ marginTop: 12 }}><Callout tone="warn" title="Demo safeguard">Approving records the decision only. No referral, letter or third-party contact happens in this demo; production would need legal and business validation.</Callout></div>}
      {canDecide && <Row style={{ marginTop: 14 }}><Btn variant="primary" onClick={() => confirmThen({ title: "Approve: " + a.title + "?", body: a.effect + ".", confirmLabel: "Approve", run: () => decideApproval({ id: a.id, decision: "Approved" }) })}>Approve</Btn><Btn variant="danger" onClick={() => decideApproval({ id: a.id, decision: "Declined" })}>Decline</Btn></Row>}
      {!canDecide && a.status === "Pending" && <div style={{ marginTop: 12 }}><Sub>Waiting on the {a.ownerRole} role. Switch role in the header to decide.</Sub></div>}
      {a.status !== "Pending" && <div style={{ marginTop: 12 }}><Callout tone={a.status === "Approved" ? "ok" : "neutral"} title={a.status + " by " + a.decidedBy}>{rel(a.decidedAt || "")}</Callout></div>}
    </div>
  );
}
export function TaskRow({ id }: { id: string }) {
  const { s } = useRos();
  const t = s.tasks.find(x => x.id === id)!;
  const done = t.status === "Done";
  return (
    <ListRow tone={t.priority === "High" && !done ? "warn" : undefined}
      lead={<button aria-label="Toggle task" className="ros-focus" onClick={(e) => { e.stopPropagation(); toggleTask({ id: t.id }); }} style={{ width: 20, height: 20, flex: "none", borderRadius: 7, border: "1.5px solid " + (done ? "var(--ok)" : "var(--border-strong)"), background: done ? "var(--ok)" : "none", color: "var(--bg)", cursor: "pointer", fontSize: 12, lineHeight: 1 }}>{done ? "✓" : ""}</button>}
      title={<span style={{ textDecoration: done ? "line-through" : "none", color: done ? "var(--faint)" : "var(--ink)" }}>{t.title}</span>}
      sub={t.owner + " · " + t.due + " · " + t.department + " · from " + t.source}
      right={<>{t.link && <RecLink r={t.link} />}<StatusBadge s={t.status} /></>} />
  );
}
export function MessagePanel({ id }: { id: string }) {
  const { s, role } = useRos();
  const m = s.messages.find(x => x.id === id);
  const [draft, setDraft] = useState<string | null>(null);
  if (!m) return <Empty title="Message not found" />;
  const text = draft ?? m.draft ?? "";
  return (
    <div>
      <Row wrap style={{ marginBottom: 12 }}><StatusBadge s={m.status} /><Badge tone="info">{m.queue}</Badge><Badge>{m.channel}</Badge>{m.familyId ? <RecLink r={{ kind: "family", id: m.familyId }} /> : <Badge tone="warn">No Parent ID matched</Badge>}{m.link && <RecLink r={m.link} />}</Row>
      <Card title={m.subject} sub={(m.direction === "in" ? "From " : "To ") + m.from + " · " + rel(m.received)}>{m.body ? <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{m.body}</div> : <Sub>Outbound draft</Sub>}</Card>
      <div style={{ marginTop: 12 }}><KV cols={3} items={[["AI classification", m.classification], ["Confidence", Math.round(m.confidence * 100) + "%"], ["Tone", m.tone || "Plain"]]} /></div>
      {m.confidence < 0.75 && <div style={{ marginTop: 10 }}><Callout tone="warn" title="Low confidence">Routed for a person to read before anything is drafted.</Callout></div>}
      {(m.draft !== undefined) && role.id !== "parent" && (
        <>
          <H>Draft reply · human review required</H>
          <textarea className="ros-input" rows={6} value={text} onChange={(e) => setDraft(e.target.value)} disabled={m.status === "Replied" || m.status === "Closed"} />
          {m.status !== "Replied" && m.status !== "Closed" && <Row style={{ marginTop: 10 }}><Btn variant="primary" onClick={() => sendDraft({ messageId: m.id, text })}>Send (simulated)</Btn><Btn onClick={() => escalateMessage({ messageId: m.id })}>Escalate to a person</Btn>{m.link?.kind === "request" && <Btn onClick={() => openRecord(m.link!)}>Open {m.link.id}</Btn>}</Row>}
        </>
      )}
    </div>
  );
}

/* ---------------- people and places ---------------- */
export function StaffPanel({ id }: { id: string }) {
  const { s, role } = useRos();
  const st = staffById(id);
  if (!st) return <Empty title="Staff member not found" />;
  const cs = certStatus(st);
  const shifts = s.shifts.filter(x => x.staffId === st.id).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return (
    <div>
      <Row wrap style={{ marginBottom: 12 }}><Badge tone="info">{st.role}</Badge><Badge>{locById(st.locationId)?.short}</Badge>{cs.gardaExpired && <Badge tone="bad" dot>Rota blocked · Garda vetting expired</Badge>}{st.irish && <Badge>Gaeilge</Badge>}</Row>
      <KV items={[["Qualification", st.qualification], ["Contract", st.contractHours + "h / week"], ["Email", st.email], ["Started", fmtDate(st.startDate) + " " + st.startDate.slice(0, 4)], ...(role.payroll ? [["Hourly cost (proxy)", "€" + st.hourlyCost.toFixed(2)] as [string, string]] : []), ["Absences", s.absences.filter(a => a.staffId === st.id).map(a => fmtDay(a.date) + " " + a.reason).join("; ") || "None this week"]]} />
      <H>Certificates</H>
      {st.certs.map(c => <ListRow key={c.kind} title={c.kind} sub={"Expires " + fmtDate(c.expires) + " " + c.expires.slice(0, 4)} right={<Badge tone={c.expires < TODAY ? "bad" : daysBetween(TODAY, c.expires) <= 30 ? "warn" : "ok"}>{c.expires < TODAY ? "Expired" : daysBetween(TODAY, c.expires) <= 30 ? daysBetween(TODAY, c.expires) + " days" : "Current"}</Badge>} />)}
      <H>This week</H>
      {shifts.length ? shifts.map(x => <ListRow key={x.id} title={fmtDay(x.date) + " · " + x.session} sub={x.start + "–" + x.end + " · " + (idx().room.get(x.roomId || "")?.name || locById(x.locationId)?.short) + (x.relief ? " · relief" : "")} right={<StatusBadge s={x.status === "approved" ? "Approved" : "Rostered"} />} />) : <Sub>No shifts this week.</Sub>}
      {!role.payroll && <div style={{ marginTop: 10 }}><Sub>Payroll detail is hidden for this role.</Sub></div>}
    </div>
  );
}
export function LocationPanel({ id }: { id: string }) {
  const { s } = useRos();
  const lc = locById(id);
  if (!lc) return <Empty title="Location not found" />;
  const mgr = staffById(lc.managerId);
  const al = s.issues.filter(i => i.locationId === lc.id && i.status === "Open");
  const r = ratioCheck(lc.id, TODAY, "After School");
  return (
    <div>
      <Row wrap style={{ marginBottom: 12 }}>{lc.services.map(x => <Badge key={x} tone="info">{x}</Badge>)}{lc.isHQ && <Badge tone="brand">HQ</Badge>}</Row>
      <KV items={[["Manager", mgr?.name], ["Town", lc.town + ", Co. " + lc.county], ["After School today", r.booked + " booked · " + r.rostered + "/" + r.required + " staff"], ["School-age places", String(lc.sacCapacity)], ["Rooms", s.rooms.filter(x => x.locationId === lc.id).map(x => x.name).join(", ")], ["Schools served", s.schools.filter(x => x.locationId === lc.id).length + " collection points"]]} />
      {al.map(i => <div key={i.id} style={{ marginTop: 10 }}><Callout tone="bad" title={i.title} right={<Btn size="sm" onClick={() => openRecord({ kind: "issue", id: i.id })}>Open</Btn>}>{i.detail}</Callout></div>)}
      <Row style={{ marginTop: 14 }}><Btn variant="primary" onClick={() => nav("Locations", "Overview", { locationId: lc.id })}>Open {lc.short} dashboard</Btn></Row>
    </div>
  );
}
export function GenericPanel({ r }: { r: Ref }) {
  const { s } = useRos();
  if (r.kind === "incident") {
    const i = s.incidents.find(x => x.id === r.id)!;
    return <div><Row wrap style={{ marginBottom: 12 }}><StatusBadge s={i.status} /><Badge>{i.severity}</Badge><RecLink r={{ kind: "child", id: i.childId }}>{childName(child(i.childId))}</RecLink></Row>
      <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{i.summary}</div>
      <div style={{ marginTop: 12 }}><KV items={[["When", fmtDay(i.date) + " " + i.time], ["Where", locById(i.locationId)?.short], ["Witnesses", i.witnesses.join(", ")], ["Parent notified", i.parentNotified ? "Yes" : "No"], ["Parent signature", i.parentSigned ? "Signed" : "Awaiting"], ["Manager review", i.managerReviewed ? "Done" : "Pending"]]} /></div>
      <div style={{ marginTop: 12 }}><Callout tone="neutral" title="Body map">Placeholder in the demo. Chronology and body map are completed by the room leader and reviewed by the manager; nothing is finalised by AI.</Callout></div></div>;
  }
  if (r.kind === "enquiry") {
    const e = s.enquiries.find(x => x.id === r.id)!;
    return <div><Row wrap style={{ marginBottom: 12 }}><StatusBadge s={e.stage} /><Badge>{e.source}</Badge>{e.sibling && <Badge tone="info">Sibling</Badge>}</Row><KV items={[["Parent", e.parent], ["Children", e.children], ["Service", e.service + " · " + locById(e.locationId)?.short], ["Owner", e.owner], ["Received", fmtDate(e.received)], ["Next follow-up", fmtDay(e.nextFollowUp)], ["Start wanted", e.startWanted]]} /><div style={{ marginTop: 10, fontSize: 13, color: "var(--body)" }}>{e.note}</div><Row style={{ marginTop: 12 }}><Btn onClick={() => nav("Enrolment", "Lead Pipeline")}>Open pipeline</Btn></Row></div>;
  }
  if (r.kind === "camp") {
    const c = s.camps.find(x => x.id === r.id)!;
    const regs = s.campRegs.filter(x => x.campId === c.id);
    return <div><KV items={[["Dates", fmtDate(c.start) + " – " + fmtDate(c.end)], ["Ages", c.ages], ["Confirmed", regs.filter(x => x.status === "Confirmed").length + " of " + c.capacity], ["Unpaid", String(regs.filter(x => !x.paid).length)], ["Day rate", "€" + c.dayRate + " (demo)"], ["NCS", c.ncsEligible ? "Eligible arrangements (label)" : "No"]]} /><Row wrap style={{ marginTop: 10 }}>{c.themes.map(t => <Badge key={t}>{t}</Badge>)}</Row><Row style={{ marginTop: 12 }}><Btn variant="primary" onClick={() => nav("Camps", "Registrations", { campId: c.id })}>Open registrations</Btn></Row></div>;
  }
  if (r.kind === "course") {
    const c = s.courses.find(x => x.id === r.id)!;
    const b = s.courseBookings.filter(x => x.courseId === c.id);
    return <div><KV items={[["Course", c.name], ["When", fmtDay(c.date) + " " + c.start], ["Venue", c.venue], ["Booked", b.length + " of " + c.capacity], ["Paid", String(b.filter(x => x.paid).length)], ["Trainer", staffById(c.trainerId)?.name]]} /><Row style={{ marginTop: 12 }}><Btn variant="primary" onClick={() => nav("Training", "Bookings", { courseId: c.id })}>Open bookings</Btn></Row></div>;
  }
  if (r.kind === "automation") {
    const a = s.automations.find(x => x.id === r.id)!;
    return <div><Row wrap style={{ marginBottom: 12 }}><StatusBadge s={a.on ? "Active" : "Paused"} /><Badge>{a.approval}</Badge><DemoTag /></Row><KV items={[["Trigger", a.trigger], ["Timing", a.timing], ["Audience", a.audience], ["Channels", a.channels.join(", ")], ["Owner", a.owner], ["Delivered · opened · actioned", a.delivered + " · " + a.opened + " · " + a.actioned]]} /><H>Runs</H><Timeline items={a.runs.slice(0, 6).map(x => ({ at: rel(x.at), title: x.summary, tone: x.result === "ok" ? "ok" : x.result === "partial" ? "warn" : "bad" }))} /><Row style={{ marginTop: 10 }}><Btn variant="primary" onClick={() => runAutomation({ id: a.id })}>Run sequence (demo)</Btn><Btn onClick={() => toggleAutomation({ id: a.id })}>{a.on ? "Pause" : "Resume"}</Btn></Row></div>;
  }
  if (r.kind === "agent") {
    const a = agentById(r.id)!;
    const log = s.agentActions.filter(x => x.agentId === a.id).sort((x, y) => y.at.localeCompare(x.at));
    return <div><div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--body)" }}>{a.purpose}</div><div style={{ marginTop: 12 }}><KV items={[["Triggers", a.triggers.join(" · ")], ["Reads", a.inputs.join(", ")], ["Can do", a.actions.join(" · ")], ["Limits", a.thresholds.join(" · ")], ["Approval", a.approval], ["Time saved", "~" + Math.round(a.minsSavedWeek / 60) + "h/week (illustrative)"]]} /></div><H>Log</H><Timeline items={log.slice(0, 10).map(x => ({ at: rel(x.at), title: x.text, tone: x.kind === "escalation" ? "bad" : x.kind === "proposal" ? "warn" : "neutral", right: x.link ? <RecLink r={x.link} /> : undefined }))} /><Row style={{ marginTop: 10 }}><Btn variant="primary" onClick={() => nav("Agents", "Agent Details", { agentId: a.id })}>Open agent</Btn></Row></div>;
  }
  if (r.kind === "school") {
    const sc = s.schools.find(x => x.id === r.id)!;
    const kids = s.children.filter(c => c.schoolId === sc.id);
    const routes = s.routes.filter(rt => rt.stops.some(st => st.schoolId === sc.id));
    return <div><KV items={[["Region", sc.region], ["Served by", locById(sc.locationId)?.name], ["Children", String(kids.length)], ["Routes", routes.map(x => x.id + " at " + x.stops.find(st => st.schoolId === sc.id)!.time).join(", ") || "Escort walk"]]} /></div>;
  }
  if (r.kind === "booking") {
    const b = s.bookings.find(x => x.id === r.id)!;
    return <div><KV items={[["Child", childName(child(b.childId))], ["Day", fmtDay(b.date)], ["Session", b.session + " " + b.start + "–" + b.end], ["Hours billed", b.hours + "h"], ["Funding", b.funding], ["Source", b.source]]} /></div>;
  }
  if (r.kind === "award") return <AwardCard id={r.id} />;
  if (r.kind === "waitlist") {
    const w = s.waitlist.find(x => x.id === r.id)!;
    return <KV items={[["Child", w.childName], ["Parent", w.parent], ["Wants", w.service + " · " + w.room + " · " + w.days], ["Location", locById(w.locationId)?.short], ["From", fmtDate(w.requestedStart)], ["Priority", w.priority], ["Added", fmtDate(w.added)], ["Status", w.status]]} />;
  }
  return <Empty title={r.kind + " " + r.id} body="No detail view for this record type yet." />;
}

const KIND_LABEL: Record<string, string> = { family: "FAMILY", child: "CHILD FILE", invoice: "INVOICE", staff: "STAFF", location: "LOCATION", request: "BOOKING REQUEST", claim: "NCS CLAIM", award: "NCS AWARD", route: "ROUTE", plan: "PAYMENT PLAN", incident: "INCIDENT", enquiry: "ENQUIRY", camp: "CAMP", course: "COURSE", message: "MESSAGE", task: "TASK", approval: "APPROVAL", automation: "AUTOMATION", agent: "AGENT", booking: "BOOKING", issue: "ALERT", waitlist: "WAITLIST", school: "SCHOOL", payment: "PAYMENT" };
function titleFor(r: Ref): string {
  const s = useRosState();
  switch (r.kind) {
    case "family": { const f = family(r.id); return f ? f.surname + " family · " + f.id : r.id; }
    case "child": return childName(child(r.id));
    case "staff": return staffById(r.id)?.name || r.id;
    case "location": return locById(r.id)?.name || r.id;
    case "route": return r.id + " · " + (s.routes.find(x => x.id === r.id)?.name || "");
    case "issue": return s.issues.find(x => x.id === r.id)?.title || r.id;
    case "approval": return s.approvals.find(x => x.id === r.id)?.title || r.id;
    case "task": return s.tasks.find(x => x.id === r.id)?.title || r.id;
    case "agent": return agentById(r.id)?.name || r.id;
    case "camp": return s.camps.find(x => x.id === r.id)?.name || r.id;
    case "school": return s.schools.find(x => x.id === r.id)?.name || r.id;
    case "enquiry": return r.id + " · " + (s.enquiries.find(x => x.id === r.id)?.parent || "");
    case "automation": return s.automations.find(x => x.id === r.id)?.name || r.id;
    default: return r.id;
  }
}
function Body({ r }: { r: Ref }) {
  switch (r.kind) {
    case "family": return <FamilyPanel id={r.id} />;
    case "child": return <ChildPanel id={r.id} />;
    case "invoice": return <InvoicePanel id={r.id} />;
    case "request": return <RequestPanel id={r.id} />;
    case "issue": return <IssuePanel id={r.id} />;
    case "claim": return <ClaimPanel id={r.id} />;
    case "route": return <RoutePanel id={r.id} />;
    case "plan": return <PlanPanel id={r.id} />;
    case "approval": return <ApprovalPanel id={r.id} />;
    case "task": return <TaskRow id={r.id} />;
    case "message": return <MessagePanel id={r.id} />;
    case "staff": return <StaffPanel id={r.id} />;
    case "location": return <LocationPanel id={r.id} />;
    default: return <GenericPanel r={r} />;
  }
}

export function RecordDrawer() {
  const { ui } = useRos();
  const r = ui.drawer[ui.drawer.length - 1];
  if (!r) return null;
  return (
    <div onClick={closeAllRecords} style={{ position: "fixed", inset: 0, zIndex: 80, background: "var(--scrim)", backdropFilter: "blur(5px)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} className="ros-drawer" role="dialog" aria-label={titleFor(r)}
        style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--overlay)", borderLeft: "1px solid var(--border)", boxShadow: "-30px 0 80px rgba(0,0,0,.45)", animation: "slideInRight .32s var(--ease) both" }}>
        <div style={{ flex: "none", display: "flex", alignItems: "flex-start", gap: 10, padding: "18px 20px 14px", borderBottom: "1px solid var(--border)" }}>
          {ui.drawer.length > 1 && <Btn size="sm" variant="subtle" onClick={closeRecord}>← Back</Btn>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Label>{KIND_LABEL[r.kind] || r.kind}</Label>
            <div style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-.4px", marginTop: 6, lineHeight: 1.25 }}>{titleFor(r)}</div>
          </div>
          <button className="ros-focus" aria-label="Close" onClick={closeAllRecords} style={{ width: 30, height: 30, flex: "none", border: "1px solid var(--border)", borderRadius: 10, background: "none", color: "var(--dim)", cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 20px 40px" }}><Body r={r} /></div>
      </div>
    </div>
  );
}

// re-export for modules
export { toneInk, bookingsOn, dowLong, toMin };
export type { Invoice };
