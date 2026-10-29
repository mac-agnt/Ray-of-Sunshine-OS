/* NCS & Funding. CHICKs, agreed hours, claim acceptance and the deadlines
   that sit around them. NCS programme rules (as configured for this demo) are
   always labelled separately from Ray of Sunshine operational policy.
   Nothing is submitted to the NCS, Pobal or the Early Years Hive: claims,
   reminders and returns are prepared and simulated. Subsidy amounts are demo
   figures. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { RosState, NCSAward, NCSClaim, Approval, Tone, Child } from "../types";
import { useRos, getState, openRecord, nav, confirmThen, defineAction, setTab } from "../store";
import { idx, cached, family, child, childName, locById, guardian, claimsPending, claimsExpiringToday, chickExpiring, underbooked, weekFinance, inScope, scopedLocations } from "../selectors";
import { TODAY, THIS_WEEK, addDays, daysBetween, fmtDate, fmtDay, fmtDateY, rel, euro, euro0, hm, round2 } from "../time";
import { Card, Kpi, Grid, Table, Badge, StatusBadge, Btn, RecLink, HBars, Columns, KV, Callout, Seg, Search, ListRow, Timeline, DemoTag, Empty, Row, Stack, Sub, Label, Field, Toggle, Meter, Page, PageHead, type Col } from "../ui";
import { ClaimPanel } from "../records";
import { prepareHoursReminder, sendDraft, decideApproval } from "../actions";

/* ---------------- constants and helpers ---------------- */
const CHICK_DEADLINE = "2026-10-22 12:00";
const CAMP_START = "2026-10-26", CAMP_END = "2026-10-30";
const MONTH_END = "2026-10-31";
type NcsExt = RosState & { ncsCampIncrease?: Record<string, number>; ncsNotices?: Record<string, string>; ncsConfirmed?: Record<string, string> };
const ext = (s: RosState) => s as NcsExt;
const minsUntil = (clockMin: number, at: string) => Math.round((Date.parse(at.replace(" ", "T") + ":00Z") - Date.parse(TODAY + "T" + hm(clockMin) + ":00Z")) / 60000);
function countdown(m: number) {
  if (m <= 0) return "Passed";
  if (m < 60) return m + "m";
  if (m < 1440) return Math.floor(m / 60) + "h " + (m % 60) + "m";
  return Math.floor(m / 1440) + "d " + Math.floor((m % 1440) / 60) + "h";
}
const awardState = (a: NCSAward): "Expired" | "Expiring" | "Active" => a.expires < TODAY ? "Expired" : a.expires <= MONTH_END ? "Expiring" : "Active";
const bookedThisWeek = (childId: string) => (idx().bookingsByChild.get(childId) || []).filter(b => THIS_WEEK.includes(b.date)).reduce((n, b) => n + b.hours, 0);
const ROLE_LABEL: Record<string, string> = { owner: "Owner", ops: "Operations", accounts: "Accounts", ncs: "NCS admin", locmgr: "Location manager", practitioner: "Room leader", driver: "Driver", parent: "Parent" };
const canDecide = (a: Approval, roleId: string) => a.status === "Pending" && (roleId === "owner" || roleId === "ops" || a.ownerRole === roleId);

function csvCell(v: unknown) { const t = v === undefined || v === null ? "" : String(v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }
function downloadCsv(name: string, rows: (string | number | undefined)[][]) {
  const blob = new Blob([rows.map(r => r.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const Rule = () => <Badge tone="info" title="NCS programme rule, as configured for this demo. Check current Pobal guidance before relying on it.">NCS programme rule</Badge>;
const Policy = () => <Badge tone="brand" title="Ray of Sunshine operational policy. Set by the business, not by the NCS.">Ray of Sunshine policy</Badge>;

/* ---------------- NCS actions (simulated, replayable) ---------------- */
const chickReminder = defineAction<{ awardIds: string[] }>("ncs.chickReminder", (s, p, ctx) => {
  const aws = p.awardIds.map(id => s.awards.find(a => a.id === id)).filter((a): a is NCSAward => !!a);
  if (!aws.length) return;
  for (const a of aws) {
    const c = s.children.find(x => x.id === a.childId)!;
    ctx.comm(a.familyId, "App + Email", "out", "CHICK renewal reminder for " + c.firstName + ": award ends " + fmtDay(a.expires) + ". Please renew and share the new CHICK (simulated, not sent)", "NCS agent");
  }
  ctx.agent("ncs", "CHICK renewal reminder" + (aws.length > 1 ? "s" : "") + " for " + aws.length + " child" + (aws.length > 1 ? "ren" : "") + " logged on " + ctx.actor + "'s say-so", "action", aws.length === 1 ? { kind: "award", id: aws[0].id } : undefined);
  ctx.log({ category: "NCS", title: "CHICK renewal reminder" + (aws.length > 1 ? "s" : "") + " sent (simulated): " + aws.length, detail: aws.map(a => a.id).join(", ") + ". Logged to each family timeline. Nothing left the demo.", link: aws.length === 1 ? { kind: "award", id: aws[0].id } : undefined });
}, { toast: (p) => p.awardIds.length + " CHICK reminder" + (p.awardIds.length > 1 ? "s" : "") + " logged (simulated)." });

const chickRenewed = defineAction<{ awardId: string }>("ncs.chickRenewed", (s, p, ctx) => {
  const a = s.awards.find(x => x.id === p.awardId); if (!a) return;
  const c = s.children.find(x => x.id === a.childId)!;
  const old = a.expires;
  a.expires = addDays(TODAY, 364); a.status = "Active";
  const e = ext(s); e.ncsConfirmed = { ...(e.ncsConfirmed || {}), [a.id]: ctx.now };
  ctx.comm(a.familyId, "Portal", "in", "Renewed CHICK shared for " + c.firstName + " (demo portal)", "Parent");
  ctx.agent("ncs", "Renewed CHICK recorded for " + c.firstName + " " + c.surname + " (" + a.id + "); camp-week check updated", "action", { kind: "award", id: a.id });
  ctx.log({ category: "NCS", title: "CHICK renewed: " + c.firstName + " " + c.surname, detail: a.id + " valid to " + fmtDateY(a.expires) + " (was " + fmtDate(old) + "). Recorded in the demo; nothing registered with the NCS.", link: { kind: "award", id: a.id }, locationId: c.locationId });
}, { toast: () => "Renewed CHICK recorded (demo). Expiry list and camp-week check updated.", undo: true });

const changeHours = defineAction<{ awardId: string; hours: number; campException: boolean }>("ncs.changeHours", (s, p, ctx) => {
  const a = s.awards.find(x => x.id === p.awardId); if (!a || !(p.hours > 0) || p.hours === a.agreedHours) return;
  const c = s.children.find(x => x.id === a.childId)!;
  if (p.campException) {
    if (p.hours < a.agreedHours || a.expires < CAMP_END) return;
    const e = ext(s); e.ncsCampIncrease = { ...(e.ncsCampIncrease || {}), [a.id]: p.hours };
    ctx.comm(a.familyId, "App", "out", c.firstName + "'s NCS hours for camp week (w/c 26 Oct) recorded as " + p.hours + "h; back to " + a.agreedHours + "h after (simulated)", "NCS team");
    ctx.log({ category: "NCS", title: "Camp-week hours increase: " + c.firstName + " " + c.surname, detail: a.agreedHours + "h to " + p.hours + "h for w/c 26 Oct only, under the holiday-week exception. The 8-week clock is unchanged (next change " + fmtDate(a.nextChange) + ").", link: { kind: "award", id: a.id }, locationId: c.locationId });
    return;
  }
  if (TODAY < a.nextChange) return;
  const old = a.agreedHours;
  a.agreedHours = p.hours; a.lastChange = TODAY; a.nextChange = addDays(TODAY, s.config.ncsChangeWeeks * 7);
  ctx.comm(a.familyId, "App", "out", c.firstName + "'s agreed NCS hours changed " + old + "h to " + p.hours + "h a week (simulated)", "NCS team");
  ctx.log({ category: "NCS", title: "Agreed hours changed: " + c.firstName + " " + c.surname, detail: old + "h to " + p.hours + "h a week from " + fmtDay(TODAY) + ". Next change allowed " + fmtDay(a.nextChange) + ". Recorded in the demo only.", link: { kind: "award", id: a.id }, locationId: c.locationId });
}, { toast: () => "Hours change recorded (demo). Register and checker updated.", undo: true });

const leaveNotice = defineAction<{ familyId: string }>("ncs.leaveNotice", (s, p, ctx) => {
  const f = s.families.find(x => x.id === p.familyId); if (!f || f.funding !== "NCS") return;
  const e = ext(s);
  if (e.ncsNotices && e.ncsNotices[f.id]) return;
  const end = addDays(TODAY, s.config.ncsLeaveNoticeWeeks * 7);
  e.ncsNotices = { ...(e.ncsNotices || {}), [f.id]: end };
  f.flags = Array.from(new Set(f.flags.concat("NCS ending " + fmtDate(end))));
  s.tasks.push({ id: ctx.id("TSK"), title: "Stop NCS claims for " + f.surname + " after " + fmtDay(end), owner: "Lorraine Tobin", due: fmtDay(end), dueDate: end, priority: "Medium", department: "NCS", status: "Not started", link: { kind: "family", id: f.id }, source: ctx.actor, locationId: f.locationId });
  ctx.comm(f.id, "Email", "out", "NCS notice received. Subsidy continues to " + fmtDay(end) + ", then hours are charged privately (simulated)", "NCS team");
  ctx.log({ category: "NCS", title: "Notice to stop NCS: " + f.surname, detail: s.config.ncsLeaveNoticeWeeks + " weeks' notice from " + fmtDay(TODAY) + ". Last NCS-funded day " + fmtDay(end) + ". Task added for the NCS team.", link: { kind: "family", id: f.id }, locationId: f.locationId });
}, { toast: () => "Notice recorded, family flagged and a task added for the NCS team." });

const remindClaims = defineAction<{ claimIds: string[] }>("ncs.remindClaims", (s, p, ctx) => {
  const cls = p.claimIds.map(id => s.claims.find(c => c.id === id)).filter((c): c is NCSClaim => !!c && c.status === "Awaiting acceptance");
  if (!cls.length) return;
  for (const cl of cls) {
    const day = Math.min(7, Math.max(1, Math.round((Date.parse(ctx.now.replace(" ", "T")) - Date.parse(cl.raised + "T09:00")) / 86400000)));
    cl.reminders.push({ day, at: ctx.now, channel: "App + SMS" });
    ctx.comm(cl.familyId, "App + SMS", "out", "Reminder: accept NCS claim " + cl.id + " (" + euro(cl.amount) + ") before " + cl.deadline.slice(11) + " " + fmtDay(cl.deadline.slice(0, 10)) + " (simulated, not sent)", "NCS agent");
  }
  ctx.agent("ncs", "Claim reminders for " + cls.map(c => c.id).join(", ") + " sent on " + ctx.actor + "'s say-so", "action");
  ctx.log({ category: "NCS", title: "Claim reminders sent (simulated): " + cls.length, detail: cls.map(c => c.id + " lapses " + c.deadline.slice(11) + " " + fmtDay(c.deadline.slice(0, 10))).join(" · "), link: cls.length === 1 ? { kind: "claim", id: cls[0].id } : undefined });
}, { toast: (p) => p.claimIds.length + " claim reminder" + (p.claimIds.length > 1 ? "s" : "") + " logged to family timelines and the NCS agent log (simulated)." });

const logPrepared = defineAction<{ what: string; rows: number }>("ncs.prepared", (_s, p, ctx) => {
  ctx.log({ category: "NCS", title: p.what + " prepared, not submitted", detail: p.rows + " rows downloaded as CSV. Nothing was submitted to the NCS, Pobal or the Early Years Hive." });
}, { toast: (p) => p.what + " downloaded. Prepared, not submitted." });

/* ---------------- page ---------------- */
const SUBS: Record<string, string> = {
  Overview: "Awards, claims and deadlines in one place, with every countdown running from the demo clock.",
  "CHICK Register": "Every NCS award: masked CHICK, agreed and booked hours, the 8-week change clock and expiry.",
  "Agreed Hours": "Families who booked fewer hours than their award for w/c 2 Nov, the reminder to send them, and the hours-change checker.",
  "Claims & Acceptances": "Claims awaiting parent acceptance, their deadlines and the Day 2, 4 and 6 reminders.",
  "Deadlines & Returns": "Thursday's CHICK deadline before camp week, private-charge proposals, notice to stop NCS and prepared returns.",
  "ECCE & AIM": "Free preschool (ECCE) and Access and Inclusion Model supports. Placeholders in this demo.",
};
export default function NCS({ tab }: { tab: string }) {
  let body: ReactNode;
  if (tab === "CHICK Register") body = <Register />;
  else if (tab === "Agreed Hours") body = <AgreedHours />;
  else if (tab === "Claims & Acceptances") body = <Claims />;
  else if (tab === "Deadlines & Returns") body = <Deadlines />;
  else if (tab === "ECCE & AIM") body = <EcceAim />;
  else body = <Overview />;
  return (
    <Page>
      <PageHead eyebrow="NCS & Funding" title={tab} sub={SUBS[tab] || SUBS.Overview} right={<DemoTag title="Nothing is submitted to the NCS, Pobal or the Early Years Hive. Subsidy amounts are demo figures.">Not connected to NCS · demo subsidy</DemoTag>} />
      {body}
    </Page>
  );
}

function ApprovalInline({ a, extra }: { a: Approval; extra?: ReactNode }) {
  const { role } = useRos();
  const can = canDecide(a, role.id);
  return (
    <Card tone={a.status === "Pending" ? "warn" : a.status === "Approved" ? "ok" : undefined} title={a.title} sub={a.summary} right={<><RecLink r={{ kind: "approval", id: a.id }} /><StatusBadge s={a.status} /></>}>
      <KV items={[["Requested by", a.requestedBy + " · " + rel(a.requestedAt)], ["Decides", ROLE_LABEL[a.ownerRole]], ["On approval", a.effect], ["Amount", a.amount ? euro(a.amount) : "n/a"]]} />
      {extra}
      {a.status === "Pending" && (can ? (
        <Row wrap style={{ marginTop: 12 }}>
          <Btn variant="primary" onClick={() => confirmThen({ title: "Approve " + a.id + "?", body: a.effect + ". The family is told by app (simulated). A person made this decision; the agent only proposed it.", confirmLabel: "Approve", run: () => decideApproval({ id: a.id, decision: "Approved" }) })}>Approve</Btn>
          <Btn variant="danger" onClick={() => confirmThen({ title: "Decline " + a.id + "?", body: "Nothing changes for the family. The decision is logged.", confirmLabel: "Decline", danger: true, run: () => decideApproval({ id: a.id, decision: "Declined" }) })}>Decline</Btn>
        </Row>
      ) : <div style={{ marginTop: 12 }}><Sub>Waiting on the {ROLE_LABEL[a.ownerRole]} role. Switch role preview in the header to decide.</Sub></div>)}
      {a.status !== "Pending" && <div style={{ marginTop: 12 }}><Callout tone={a.status === "Approved" ? "ok" : "neutral"} title={a.status + " by " + (a.decidedBy || "")}>{rel(a.decidedAt || "")}</Callout></div>}
    </Card>
  );
}

/* ================= Overview ================= */
function Overview() {
  const { s } = useRos();
  const awards = s.awards.filter(a => inScope(family(a.familyId)?.locationId));
  const ncsFams = s.families.filter(f => f.funding === "NCS" && inScope(f.locationId)).length;
  const wf = weekFinance();
  const pend = claimsPending(), today = claimsExpiringToday(), exp = chickExpiring(), ub = underbooked();
  const toFive = minsUntil(s.clockMin, TODAY + " 17:00");
  const toThu = minsUntil(s.clockMin, CHICK_DEADLINE);
  const win = s.windows.find(w => w.status === "Open");
  const toWin = win ? minsUntil(s.clockMin, win.closes) : 0;
  const expByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (let d = TODAY; d <= MONTH_END; d = addDays(d, 1)) m.set(d, 0);
    for (const a of exp) m.set(a.expires, (m.get(a.expires) || 0) + 1);
    return Array.from(m.entries()).map(([d, n]) => ({ label: d.slice(8), value: n, hint: fmtDay(d) + ": " + n + " CHICK" + (n === 1 ? "" : "s"), tone: (d <= "2026-10-25" ? "warn" : "accent") as Tone }));
  }, [exp]);
  const subByLoc = cached("ncs:subLoc", () => {
    const m = new Map<string, number>();
    for (const inv of getState().invoices) if (inv.weekOf === "2026-10-19") for (const l of inv.lines) if (l.kind === "NCS subsidy" && l.childId) { const c = child(l.childId); if (c) m.set(c.locationId, round2((m.get(c.locationId) || 0) - l.amount)); }
    return m;
  });
  const agentLog = s.agentActions.filter(a => a.agentId === "ncs").sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  const apr = s.approvals.find(a => a.kind === "NCS private-charge proposal");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Grid min={165} gap={12}>
        <Kpi label="NCS awards" value={awards.length} sub={ncsFams + " NCS families"} onClick={() => setTab("NCS", "CHICK Register")} />
        <Kpi label="Subsidy this week" value={euro0(wf.subsidy)} sub="netted on w/c 19 Oct invoices (demo)" tone="info" onClick={() => nav("Billing", "Invoices")} />
        <Kpi label="Claims awaiting acceptance" value={pend.length} sub={euro(pend.reduce((n, c) => n + c.amount, 0)) + " demo subsidy at stake"} tone={pend.length ? "warn" : "ok"} onClick={() => setTab("NCS", "Claims & Acceptances")} />
        <Kpi label="Lapse today at 17:00" value={today.length} sub={today.length ? countdown(toFive) + " left · " + today.map(c => c.id).join(", ") : "None lapsing today"} tone={today.length ? "bad" : "ok"} onClick={() => setTab("NCS", "Claims & Acceptances")} />
        <Kpi label="CHICKs expiring this month" value={exp.length} sub={"by " + fmtDate(MONTH_END)} tone={exp.length ? "warn" : "ok"} onClick={() => setTab("NCS", "CHICK Register")} />
        <Kpi label="Under-booked for w/c 2 Nov" value={ub.length} sub={ub.reduce((n, u) => n + u.short, 0) + "h below agreed"} tone={ub.length ? "warn" : "ok"} onClick={() => setTab("NCS", "Agreed Hours")} />
        <Kpi label="Thursday CHICK deadline" value={countdown(toThu)} sub="Thu 22 Oct 12:00 · before camp week" tone={toThu < 2880 ? "warn" : undefined} onClick={() => setTab("NCS", "Deadlines & Returns")} />
      </Grid>

      <Card title="Two kinds of rule" sub="Every rule on these screens is tagged so nobody mistakes a business policy for a programme requirement.">
        <div className="ros-split-even">
          <div>
            <Row gap={8} style={{ marginBottom: 8 }}><Rule /><Sub>as configured for this demo</Sub></Row>
            <Timeline items={[
              { at: s.config.claimDays + " days", title: "Parents accept each claim within the acceptance window", tone: "info" },
              { at: s.config.ncsChangeWeeks + " weeks", title: "Agreed hours change at most once every " + s.config.ncsChangeWeeks + " weeks", detail: "Exception: increases for school holiday (camp) weeks.", tone: "info" },
              { at: "CHICK", title: "Subsidy needs a valid CHICK for the week it covers", tone: "info" },
              { at: s.config.ncsLeaveNoticeWeeks + " weeks", title: "Notice to stop NCS registration", tone: "info" },
            ]} />
          </div>
          <div>
            <Row gap={8} style={{ marginBottom: 8 }}><Policy /><Sub>set by the business</Sub></Row>
            <Timeline items={[
              { at: "Days 2, 4, 6", title: "Claim reminders by app and SMS", tone: "accent" },
              { at: "Thu 12:00", title: "CHICK needed by Thursday noon before camp week", detail: "So the NCS team can register it in time.", tone: "accent" },
              { at: "Review", title: "Hours without a valid CHICK may be charged privately", detail: "Only after an NCS admin approves the proposal.", tone: "accent" },
              { at: s.config.leavingNoticeMonths + " months", title: "Notice to leave the service altogether", tone: "accent" },
            ]} />
          </div>
        </div>
      </Card>

      <div className="ros-split">
        <Card title="Lapsing today" sub={"Claims with a 17:00 deadline today. " + countdown(toFive) + " left on the demo clock."} tone={today.length ? "bad" : undefined}
          right={today.length > 0 ? <Btn size="sm" variant="primary" onClick={() => confirmThen({ title: "Remind " + today.length + " families now?", body: "Logs an app and SMS reminder to each family and to the NCS agent log. Simulated: nothing is sent.", confirmLabel: "Send reminders (simulated)", run: () => remindClaims({ claimIds: today.map(c => c.id) }) })}>Remind all {today.length}</Btn> : undefined}>
          {today.length ? today.map(c => <ClaimRow key={c.id} c={c} />) : <Empty title="Nothing lapses today" body="Every claim due today has been accepted." />}
        </Card>
        <Card title="This week's deadlines">
          <Timeline items={[
            { at: "Today 17:00", title: today.length + " claim" + (today.length === 1 ? "" : "s") + " lapse", detail: countdown(toFive) + " left", tone: today.length ? "bad" : "ok" },
            { at: "Wed 21 Oct 17:00", title: pend.filter(c => c.deadline.startsWith("2026-10-21")).length + " claim(s) lapse", tone: "warn" },
            { at: "Thu 22 Oct 12:00", title: "CHICK deadline before camp week", detail: countdown(toThu) + " left", tone: "warn", right: <Policy /> },
            { at: "Thu 22 Oct 18:00", title: "Booking window closes (" + (win?.label || "w/c 2 Nov") + ")", detail: countdown(toWin) + " left · " + ub.length + " under-booked families", tone: "warn" },
            { at: "Mon 26 Oct", title: "Halloween camp week starts", detail: "Holiday-week hours increases allowed", tone: "neutral", right: <Rule /> },
            { at: "Mon 2 Nov", title: "Next permissible hours change for the Kelly and Nolan awards", tone: "neutral" },
          ]} />
        </Card>
      </div>

      <div className="ros-split-even">
        <Card title="CHICK expiries this month" sub="Awards ending between today and 31 October. Click through to chase them.">
          <Columns data={expByDay} height={110} />
          <Row style={{ marginTop: 4 }}><span style={{ flex: 1 }} /><Btn size="sm" onClick={() => setTab("NCS", "CHICK Register")}>Open register</Btn></Row>
        </Card>
        <Card title="Subsidy this week by location" sub="NCS subsidy netted on w/c 19 Oct invoices (demo rates).">
          <HBars format={euro0} items={scopedLocations().map(l => ({ label: l.short, value: subByLoc.get(l.id) || 0 })).filter(x => x.value > 0)} />
        </Card>
      </div>

      <div className="ros-split">
        <Card title="Under-booked families" sub="Booked fewer hours than their award for w/c 2 Nov." right={<Btn size="sm" onClick={() => setTab("NCS", "Agreed Hours")}>Work these</Btn>}>
          {ub.map(u => <div key={u.family.id} style={{ padding: "6px 4px" }}><Meter label={<span><RecLink r={{ kind: "family", id: u.family.id }} mono={false}>{u.family.surname}</RecLink> <Sub>{u.family.id} · {locById(u.family.locationId)?.short}</Sub></span>} value={u.booked} max={u.agreed} tone="warn" hint={u.short + "h short"} /></div>)}
          {!ub.length && <Empty title="Everyone has booked their agreed hours" />}
          {apr && apr.status === "Pending" && <div style={{ marginTop: 12 }}><Callout tone="warn" title={apr.id + " waiting on an NCS admin"} right={<Btn size="sm" onClick={() => setTab("NCS", "Deadlines & Returns")}>Review</Btn>}>{apr.title}. {euro(apr.amount || 0)} proposed.</Callout></div>}
        </Card>
        <Card title="NCS agent log" right={<Btn size="sm" variant="subtle" onClick={() => nav("Agents", "Agent Details", { agentId: "ncs" })}>Agent</Btn>}>
          {agentLog.length ? <Timeline items={agentLog.map(a => ({ at: rel(a.at), title: a.text, tone: (a.kind === "escalation" ? "bad" : a.kind === "proposal" ? "warn" : "info") as Tone, right: a.link ? <RecLink r={a.link} /> : undefined }))} /> : <Empty title="No agent activity yet" />}
        </Card>
      </div>
    </div>
  );
}

function ClaimRow({ c, onSelect, selected }: { c: NCSClaim; onSelect?: () => void; selected?: boolean }) {
  const { s, role } = useRos();
  const ch = child(c.childId), f = family(c.familyId);
  const m = minsUntil(s.clockMin, c.deadline);
  return (
    <ListRow onClick={onSelect || (() => openRecord({ kind: "claim", id: c.id }))} tone={selected ? "accent" : m < 1440 && c.status === "Awaiting acceptance" ? "bad" : undefined}
      title={<Row wrap gap={8}><RecLink r={{ kind: "claim", id: c.id }} /><span>{childName(ch)}</span><Sub>{f?.surname} · {f?.id}</Sub></Row>}
      sub={euro(c.amount) + " · " + c.hours + "h · " + c.period + " · " + c.reminders.length + " reminder" + (c.reminders.length === 1 ? "" : "s") + (c.reminders.length ? " (last " + rel(c.reminders[c.reminders.length - 1].at) + ")" : "")}
      right={<>{c.status === "Awaiting acceptance" ? <Badge tone={m < 1440 ? "bad" : m < 2880 ? "warn" : "neutral"}>{countdown(m)}</Badge> : <StatusBadge s={c.status} />}
        {c.status === "Awaiting acceptance" && role.id !== "parent" && <Btn size="sm" onClick={() => remindClaims({ claimIds: [c.id] })}>Remind</Btn>}</>} />
  );
}

/* ================= CHICK Register ================= */
function Register() {
  const { s, v } = useRos();
  const [filter, setFilter] = useState<string>("All");
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState("ALL");
  const camp = ext(s).ncsCampIncrease || {};
  const all = useMemo(() => s.awards.filter(a => inScope(family(a.familyId)?.locationId)), [v]);
  const counts = useMemo(() => { const m: Record<string, number> = { All: all.length, Expiring: 0, Active: 0, Expired: 0, "Change due": 0 }; for (const a of all) { m[awardState(a)]++; if (a.nextChange <= TODAY) m["Change due"]++; } return m; }, [all]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter(a => (filter === "All" || (filter === "Change due" ? a.nextChange <= TODAY : awardState(a) === filter)) && (loc === "ALL" || family(a.familyId)?.locationId === loc)
      && (!t || childName(child(a.childId)).toLowerCase().includes(t) || a.familyId.toLowerCase().includes(t) || (family(a.familyId)?.surname || "").toLowerCase().includes(t)))
      .sort((a, b) => a.expires.localeCompare(b.expires));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, filter, q, loc]);
  const expiring = all.filter(a => awardState(a) === "Expiring");
  const cols: Col<NCSAward>[] = [
    { key: "c", label: "Child", w: "1.3fr", sort: a => childName(child(a.childId)), render: a => <Stack><RecLink r={{ kind: "child", id: a.childId }} mono={false}>{childName(child(a.childId))}</RecLink><Sub>{child(a.childId)?.programme === "EY" ? "Early Years" : "School age"} · {locById(child(a.childId)?.locationId || "")?.short}</Sub></Stack> },
    { key: "f", label: "Family", w: "1fr", sort: a => family(a.familyId)?.surname || "", render: a => <Stack><span>{family(a.familyId)?.surname}</span><Sub>{a.familyId}</Sub></Stack> },
    { key: "k", label: "CHICK", w: "1fr", render: a => <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--dim)" }}>{a.chick}</span> },
    { key: "t", label: "Award", w: ".9fr", sort: a => a.type, render: a => <Badge tone={a.type === "Universal" ? "neutral" : "info"}>{a.type === "Universal" ? "Universal" : "Income"}</Badge> },
    { key: "h", label: "Agreed / booked", w: "1fr", sort: a => a.agreedHours, render: a => { const b = bookedThisWeek(a.childId); return <Stack><span>{a.agreedHours}h / {b}h</span><Sub>{camp[a.id] ? "camp week " + camp[a.id] + "h" : b < a.agreedHours ? "under this week" : b > a.agreedHours ? "extra is private" : "matches"}</Sub></Stack>; } },
    { key: "r", label: "Demo rate", w: ".7fr", align: "right", sort: a => a.rate, render: a => "€" + a.rate.toFixed(2) + "/h" },
    { key: "l", label: "Last change", w: ".8fr", sort: a => a.lastChange, render: a => fmtDate(a.lastChange) },
    { key: "n", label: "Next change", w: ".9fr", sort: a => a.nextChange, render: a => a.nextChange <= TODAY ? <Badge tone="ok">Allowed now</Badge> : <Stack><span>{fmtDate(a.nextChange)}</span><Sub>{daysBetween(TODAY, a.nextChange)} days</Sub></Stack> },
    { key: "e", label: "Expires", w: "1fr", sort: a => a.expires, render: a => { const st = awardState(a); const d = daysBetween(TODAY, a.expires); return st === "Active" ? <Stack><span>{fmtDate(a.expires)} {a.expires.slice(0, 4)}</span><Sub>{d} days</Sub></Stack> : <Badge tone={st === "Expired" ? "bad" : d <= 5 ? "bad" : "warn"}>{st === "Expired" ? "Expired" : d === 0 ? "Today" : d === 1 ? "Tomorrow" : "In " + d + " days"} · {fmtDate(a.expires)}</Badge>; } },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {expiring.length > 0 && (
        <Callout tone="warn" title={expiring.length + " CHICK" + (expiring.length === 1 ? "" : "s") + " end by " + fmtDate(MONTH_END)}
          right={<Btn size="sm" variant="primary" onClick={() => confirmThen({ title: "Send renewal reminders to " + expiring.length + " families?", body: "Logs an app and email reminder to renew the CHICK. Simulated: nothing is sent, and nothing is registered with the NCS.", confirmLabel: "Send (simulated)", run: () => chickReminder({ awardIds: expiring.map(a => a.id) }) })}>Remind all {expiring.length}</Btn>}>
          Families renew on the NCS parent portal and share the new CHICK. Without it, subsidy stops for weeks after the expiry. <Rule />
        </Callout>
      )}
      <Card pad={false}>
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <Seg size="sm" value={filter} onChange={setFilter} options={(["All", "Expiring", "Active", "Expired", "Change due"] as string[]).map(x => [x, (x === "Expiring" ? "Expiring this month" : x === "Change due" ? "Hours change allowed" : x) + " " + (counts[x] || 0)] as [string, string])} />
          <Row wrap gap={8}>
            <Search value={q} onChange={setQ} placeholder="Child, surname or Parent ID" width={260} />
            <select aria-label="Location" className="ros-input" value={loc} onChange={(e) => setLoc(e.target.value)} style={{ width: "auto", height: 34 }}>
              <option value="ALL">All locations</option>
              {scopedLocations().map(l => <option key={l.id} value={l.id}>{l.short}</option>)}
            </select>
            <Sub>CHICKs are masked. Full codes are visible only in the NCS portal.</Sub>
          </Row>
        </div>
        <Table rows={rows} cols={cols} rowKey={a => a.id} onRow={a => openRecord({ kind: "award", id: a.id })} minWidth={1060}
          rowTone={a => awardState(a) === "Expired" ? "bad" : awardState(a) === "Expiring" ? "warn" : undefined} empty="No awards match" />
        <div style={{ padding: "10px 16px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Sub>{rows.length} awards · {rows.reduce((n, a) => n + a.agreedHours, 0).toLocaleString("en-IE")} agreed hours a week</Sub>
          <span style={{ flex: 1 }} />
          {filter === "Expiring" && rows.length > 0 && <Btn size="sm" onClick={() => chickReminder({ awardIds: rows.map(a => a.id) })}>Remind these {rows.length}</Btn>}
        </div>
      </Card>
    </div>
  );
}

/* ================= Agreed Hours ================= */
function AgreedHours() {
  const { s } = useRos();
  const ub = underbooked();
  const win = s.windows.find(w => w.status === "Open");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Callout tone="info" title={"Booking window " + (win?.label || "") + " closes " + (win ? fmtDay(win.closes.slice(0, 10)) + " " + win.closes.slice(11) : "")}>
        Booking fewer hours than the award reduces the family's subsidy for that week. The NCS agent drafts a reminder; a person reviews and sends it. <Policy />
      </Callout>
      <div className="ros-split">
        <Card title={"Under-booked for w/c 2 Nov (" + ub.length + ")"} sub="Submitted hours against agreed award hours, from the open booking window.">
          {ub.length ? ub.map(u => <UnderBooked key={u.family.id} familyId={u.family.id} booked={u.booked} agreed={u.agreed} />) : <Empty title="No under-booked families" body="Every NCS family in the window has booked their agreed hours." />}
        </Card>
        <ChangeChecker />
      </div>
    </div>
  );
}

function UnderBooked({ familyId, booked, agreed }: { familyId: string; booked: number; agreed: number }) {
  const { s, role } = useRos();
  const f = family(familyId)!;
  const g = guardian(f);
  const msg = s.messages.filter(m => m.familyId === f.id && m.classification === "NCS hours reminder").slice(-1)[0];
  const fallback = "Hi " + (g?.name.split(" ")[0] || "there") + ", you've booked " + booked + " of your " + agreed + " agreed NCS hours for the week of 2 November. Booking your full agreed hours keeps your subsidy in line with your award. The booking window closes Thursday 22 Oct at 6pm. Reply here if you'd like a hand. NCS team";
  const [text, setText] = useState<string | null>(null);
  const value = text ?? (msg?.draft || fallback);
  const kids = f.childIds.map(id => child(id)).filter((c): c is Child => !!c);
  const sent = msg && (msg.status === "Closed" || msg.status === "Replied");
  return (
    <div style={{ padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
      <Row wrap gap={8}>
        <RecLink r={{ kind: "family", id: f.id }}>{f.surname} · {f.id}</RecLink>
        <Sub>{locById(f.locationId)?.short} · prefers {f.channel}</Sub>
        <span style={{ flex: 1 }} />
        <Badge tone="warn">{agreed - booked}h short</Badge>
        {msg && <StatusBadge s={sent ? "Sent" : "Draft"} />}
      </Row>
      <div style={{ marginTop: 10 }}><Meter label="Booked vs agreed, w/c 2 Nov" value={booked} max={agreed} tone="warn" /></div>
      <Row wrap gap={6} style={{ marginTop: 8 }}>
        {kids.map(c => { const a = idx().awardByChild.get(c.id); return a ? <Badge key={c.id} tone="info">{c.firstName}: {a.agreedHours}h agreed · next change {fmtDate(a.nextChange)}</Badge> : null; })}
      </Row>
      <div style={{ marginTop: 10 }}>
        <Label style={{ marginBottom: 6 }}>Reminder preview · edit before sending</Label>
        <textarea className="ros-input" rows={4} value={value} disabled={!!sent} onChange={(e) => setText(e.target.value)} />
      </div>
      <Row wrap gap={8} style={{ marginTop: 8 }}>
        {!msg && <Btn size="sm" variant="primary" disabled={role.id === "parent"} onClick={() => prepareHoursReminder({ familyId: f.id, booked, agreed })}>Prepare hours reminder</Btn>}
        {msg && !sent && <Btn size="sm" variant="primary" onClick={() => confirmThen({ title: "Send to the " + f.surname + " family?", body: "Sends the reminder by " + msg.channel + " (simulated) and logs it to the family timeline. The NCS task closes.", confirmLabel: "Send (simulated)", run: () => sendDraft({ messageId: msg.id, text: value }) })}>Send (simulated)</Btn>}
        {msg && <RecLink r={{ kind: "message", id: msg.id }}>Open message</RecLink>}
        {sent && <Sub>Sent {rel(s.comms.filter(c => c.familyId === f.id).slice(-1)[0]?.at || "")} (simulated)</Sub>}
        {text !== null && !sent && <Btn size="sm" variant="subtle" onClick={() => setText(null)}>Reset text</Btn>}
      </Row>
    </div>
  );
}

function ChangeChecker() {
  const { s, role } = useRos();
  const ub = underbooked();
  const quick = ub.flatMap(u => u.awards);
  const [awardId, setAwardId] = useState<string>(quick[0]?.id || s.awards[0]?.id || "");
  const [q, setQ] = useState("");
  const a = s.awards.find(x => x.id === awardId);
  const [hours, setHours] = useState<string>(a ? String(a.agreedHours + 3) : "");
  const [campEx, setCampEx] = useState(false);
  useEffect(() => { const x = s.awards.find(y => y.id === awardId); if (x) setHours(String(x.agreedHours + 3)); }, [awardId]); // eslint-disable-line react-hooks/exhaustive-deps
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase(); if (t.length < 2) return [];
    return s.awards.filter(x => inScope(family(x.familyId)?.locationId) && (childName(child(x.childId)).toLowerCase().includes(t) || x.familyId.toLowerCase().includes(t))).slice(0, 6);
  }, [q, s.awards]);
  if (!a) return <Card title="8-week change checker"><Empty title="No awards in scope" /></Card>;
  const c = child(a.childId)!;
  const h = Math.round(Number(hours));
  const valid = isFinite(h) && h > 0 && h <= 60;
  const weeksLeft = Math.ceil(daysBetween(TODAY, a.nextChange) / 7);
  let verdict: { ok: boolean; title: string; body: string };
  if (!valid) verdict = { ok: false, title: "Enter proposed weekly hours", body: "Between 1 and 60." };
  else if (h === a.agreedHours) verdict = { ok: false, title: "No change", body: "That matches the current award." };
  else if (campEx) {
    if (h < a.agreedHours) verdict = { ok: false, title: "Blocked: the exception covers increases only", body: "Reductions follow the normal " + s.config.ncsChangeWeeks + "-week rule (next change " + fmtDay(a.nextChange) + ")." };
    else if (a.expires < CAMP_END) verdict = { ok: false, title: "Blocked: CHICK ends before camp week does", body: "The award ends " + fmtDay(a.expires) + ". A renewed CHICK is needed by Thu 22 Oct 12:00 first." };
    else verdict = { ok: true, title: "Allowed for camp week only: " + a.agreedHours + "h to " + h + "h", body: "Applies to w/c 26 Oct, then returns to " + a.agreedHours + "h. The " + s.config.ncsChangeWeeks + "-week clock does not reset." };
  } else if (TODAY >= a.nextChange) verdict = { ok: true, title: "Allowed: " + a.agreedHours + "h to " + h + "h a week", body: "Last change " + fmtDay(a.lastChange) + ". After this, the next change is allowed from " + fmtDay(addDays(TODAY, s.config.ncsChangeWeeks * 7)) + "." };
  else verdict = { ok: false, title: "Blocked until " + fmtDay(a.nextChange), body: "Last change " + fmtDay(a.lastChange) + ". Hours can change once every " + s.config.ncsChangeWeeks + " weeks; " + daysBetween(TODAY, a.nextChange) + " days (" + weeksLeft + " week" + (weeksLeft === 1 ? "" : "s") + ") to go." + (h > a.agreedHours ? " If this is for camp week, turn on the holiday-week exception." : "") };
  const camp = (ext(s).ncsCampIncrease || {})[a.id];
  return (
    <Card title="8-week change checker" sub="Test a proposed change to a child's agreed hours before promising anything to a parent." right={<Rule />}>
      <Field label="Child">
        <select className="ros-input" value={awardId} onChange={(e) => setAwardId(e.target.value)}>
          {(quick.some(x => x.id === awardId) ? quick : [a, ...quick]).map(x => <option key={x.id} value={x.id}>{childName(child(x.childId))} · {family(x.familyId)?.surname} · {x.agreedHours}h</option>)}
        </select>
      </Field>
      <div style={{ marginTop: 8 }}>
        <Search value={q} onChange={setQ} placeholder="Find another child" width="100%" />
        {matches.length > 0 && <div style={{ marginTop: 6, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>{matches.map(m => <ListRow key={m.id} onClick={() => { setAwardId(m.id); setQ(""); }} title={childName(child(m.childId))} sub={family(m.familyId)?.surname + " · " + m.agreedHours + "h · next change " + fmtDate(m.nextChange)} />)}</div>}
      </div>
      <div style={{ marginTop: 12 }}>
        <KV cols={2} items={[["Agreed now", a.agreedHours + "h a week"], ["Last change", fmtDay(a.lastChange)], ["Next change allowed", a.nextChange <= TODAY ? "Now" : fmtDay(a.nextChange)], ["CHICK valid to", fmtDay(a.expires)]]} />
      </div>
      <Grid min={150} gap={10} style={{ marginTop: 12 }}>
        <Field label="Proposed hours a week"><input type="number" min={1} max={60} className="ros-input" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
        <Field label="Holiday-week exception" hint="Increase for camp week (w/c 26 Oct) only">
          <Row gap={10} style={{ height: 36 }}><Toggle on={campEx} onChange={() => setCampEx(x => !x)} label="Camp-week increase exception" /><span style={{ fontSize: 12.5, color: "var(--body)" }}>{campEx ? "On" : "Off"}</span></Row>
        </Field>
      </Grid>
      <div style={{ marginTop: 12 }}><Callout tone={verdict.ok ? "ok" : valid && h !== a.agreedHours ? "bad" : "neutral"} title={verdict.title}>{verdict.body}</Callout></div>
      {camp && <div style={{ marginTop: 8 }}><Badge tone="info">Camp week already recorded at {camp}h</Badge></div>}
      <Row wrap gap={8} style={{ marginTop: 12 }}>
        <Btn variant="primary" disabled={!verdict.ok || role.id === "parent"} onClick={() => confirmThen({ title: "Record the change for " + c.firstName + "?", body: verdict.title + ". " + verdict.body + " Recorded in the demo only; nothing is sent to the NCS.", confirmLabel: "Record change", run: () => changeHours({ awardId: a.id, hours: h, campException: campEx }) })}>Record change (demo)</Btn>
        <Btn variant="subtle" onClick={() => openRecord({ kind: "award", id: a.id })}>Open award</Btn>
      </Row>
    </Card>
  );
}

/* ================= Claims & Acceptances ================= */
function Claims() {
  const { s, v } = useRos();
  const [filter, setFilter] = useState<string>("Awaiting acceptance");
  const [sel, setSel] = useState<string>("NCS-0091");
  const all = useMemo(() => s.claims.filter(c => inScope(family(c.familyId)?.locationId)), [v]);
  const rows = useMemo(() => all.filter(c => filter === "All" || c.status === filter).sort((a, b) => a.deadline.localeCompare(b.deadline)), [all, filter]);
  const pend = all.filter(c => c.status === "Awaiting acceptance");
  const soon = pend.filter(c => minsUntil(s.clockMin, c.deadline) < 2880);
  const days = Array.from({ length: 7 }, (_, i) => addDays(TODAY, i));
  const cl = all.find(c => c.id === sel) || pend[0];
  const comms = cl ? s.comms.filter(x => x.familyId === cl.familyId).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5) : [];
  const agentLog = s.agentActions.filter(a => a.agentId === "ncs").sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  const cols: Col<NCSClaim>[] = [
    { key: "id", label: "Claim", w: ".8fr", sort: c => c.id, render: c => <RecLink r={{ kind: "claim", id: c.id }} /> },
    { key: "c", label: "Child", w: "1.3fr", sort: c => childName(child(c.childId)), render: c => <Stack><span>{childName(child(c.childId))}</span><Sub>{family(c.familyId)?.surname} · {c.familyId}</Sub></Stack> },
    { key: "p", label: "Period", w: "1fr", render: c => c.period },
    { key: "h", label: "Hours", w: ".5fr", align: "right", sort: c => c.hours, render: c => c.hours + "h" },
    { key: "a", label: "Demo subsidy", w: ".8fr", align: "right", sort: c => c.amount, render: c => euro(c.amount) },
    { key: "d", label: "Deadline", w: "1.1fr", sort: c => c.deadline, render: c => { const m = minsUntil(s.clockMin, c.deadline); return <Stack><span>{fmtDay(c.deadline.slice(0, 10))} {c.deadline.slice(11)}</span>{c.status === "Awaiting acceptance" && <Sub>{countdown(m)} left</Sub>}</Stack>; } },
    { key: "r", label: "Reminders", w: ".7fr", align: "center", sort: c => c.reminders.length, render: c => <Badge tone={c.reminders.length ? "info" : "neutral"}>{c.reminders.length}</Badge> },
    { key: "s", label: "Status", w: "1fr", sort: c => c.status, render: c => <StatusBadge s={c.status} /> },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card title="Acceptance calendar" sub={"Claims awaiting acceptance by deadline day. Window is " + s.config.claimDays + " days from the claim being raised."} right={soon.length > 0 ? <Btn size="sm" variant="primary" onClick={() => confirmThen({ title: "Remind " + soon.length + " families with under 48 hours left?", body: "Logs an app and SMS reminder for each claim. Simulated: nothing is sent.", confirmLabel: "Send reminders (simulated)", run: () => remindClaims({ claimIds: soon.map(c => c.id) }) })}>Remind all due within 48h ({soon.length})</Btn> : undefined}>
        <div className="ros-scroll-x">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(118px,1fr))", gap: 8, minWidth: 860 }}>
            {days.map(d => {
              const list = pend.filter(c => c.deadline.slice(0, 10) === d);
              return (
                <div key={d} style={{ borderRadius: 14, padding: "10px 10px 12px", background: d === TODAY ? "var(--bad-soft)" : "var(--surface-2)", border: "1px solid var(--border)", minHeight: 110 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: d === TODAY ? "var(--bad)" : "var(--dim)" }}>{d === TODAY ? "Today" : fmtDay(d)}</div>
                  <div style={{ fontSize: 20, fontWeight: 600, margin: "4px 0 6px" }}>{list.length}</div>
                  {list.map(c => <button key={c.id} className="ros-focus" onClick={() => setSel(c.id)} style={{ display: "block", width: "100%", textAlign: "left", border: 0, cursor: "pointer", background: sel === c.id ? "var(--accent-soft)" : "transparent", borderRadius: 8, padding: "3px 6px", color: "var(--ink)", fontSize: 11.5 }}>{c.id} · {euro(c.amount)}</button>)}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
      <div className="ros-split">
        <Card pad={false} title="Claims" right={<Seg size="sm" value={filter} onChange={setFilter} options={["Awaiting acceptance", "Accepted", "Lapsed", "All"]} />}>
          <Table rows={rows} cols={cols} rowKey={c => c.id} onRow={c => setSel(c.id)} minWidth={860} rowTone={c => c.id === cl?.id ? "accent" : c.status === "Awaiting acceptance" && minsUntil(s.clockMin, c.deadline) < 1440 ? "bad" : undefined} empty="No claims in this view" />
        </Card>
        <Stack gap={16}>
          {cl ? (
            <Card title={cl.id + " · " + childName(child(cl.childId))} sub={family(cl.familyId)?.surname + " family · " + cl.familyId} right={<><Rule /><Policy /></>}>
              <ClaimPanel id={cl.id} />
            </Card>
          ) : <Card><Empty title="No claim selected" /></Card>}
          {cl && (
            <Card title="Family communications" sub="Updates as reminders are sent and accepted." right={<RecLink r={{ kind: "family", id: cl.familyId }} />}>
              {comms.length ? <Timeline items={comms.map(c => ({ at: rel(c.at), title: c.summary, detail: c.channel + " · " + c.by, tone: (c.direction === "in" ? "info" : "accent") as Tone }))} /> : <Empty title="No messages yet" />}
            </Card>
          )}
          <Card title="NCS agent log">
            {agentLog.length ? <Timeline items={agentLog.map(a => ({ at: rel(a.at), title: a.text, tone: (a.kind === "proposal" ? "warn" : "info") as Tone }))} /> : <Empty title="No agent activity yet" />}
          </Card>
        </Stack>
      </div>
    </div>
  );
}

/* ================= Deadlines & Returns ================= */
function Deadlines() {
  const { s, role, v } = useRos();
  const toThu = minsUntil(s.clockMin, CHICK_DEADLINE);
  const apr = s.approvals.find(a => a.kind === "NCS private-charge proposal");
  const campRows = useMemo(() => {
    const camps = s.camps.filter(c => c.start === CAMP_START);
    const out: { childId: string; familyId: string; camp: string; hours: number; award?: NCSAward; source: string }[] = [];
    for (const r of s.campRegs) {
      const cp = camps.find(c => c.id === r.campId); if (!cp || r.ncsHours <= 0 || !inScope(cp.locationId)) continue;
      out.push({ childId: r.childId, familyId: r.familyId, camp: cp.name, hours: r.ncsHours, award: idx().awardByChild.get(r.childId), source: "Camp registration" });
    }
    if (apr?.link?.kind === "family") {
      const f = family(apr.link.id);
      const cid = (f?.childIds || []).find(id => idx().awardByChild.get(id)) || f?.childIds[0];
      if (f && cid && !out.some(o => o.childId === cid)) out.push({ childId: cid, familyId: f.id, camp: "Camp-week hours (" + locById(f.locationId)?.short + ")", hours: 12, award: idx().awardByChild.get(cid), source: "Flagged by NCS agent (" + apr.id + ")" });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  const confirmed = ext(s).ncsConfirmed || {};
  /* Camp registrations are judged on the award's end date. The agent-flagged
     child (APR-205) stays unconfirmed until a renewed CHICK is recorded. */
  const valid = (r: { award?: NCSAward; source: string }) => !!r.award && r.award.expires >= CAMP_END && (!r.source.startsWith("Flagged") || !!confirmed[r.award.id]);
  const flagLabel = (r: { award?: NCSAward; source: string }) => r.source.startsWith("Flagged") ? (apr?.status === "Approved" ? "Charged privately (" + apr.id + ")" : "CHICK not on file") : r.award && r.award.expires < CAMP_END ? "Ends " + fmtDate(r.award.expires) : "Not valid";
  const missing = campRows.filter(r => !valid(r));
  const notices = ext(s).ncsNotices || {};
  const ncsFams = useMemo(() => s.families.filter(f => f.funding === "NCS" && inScope(f.locationId)).sort((a, b) => a.surname.localeCompare(b.surname)), [s.families]);
  const [nfid, setNfid] = useState<string>("");
  const nf = family(nfid);
  const endDate = addDays(TODAY, s.config.ncsLeaveNoticeWeeks * 7);
  const [ret, setRet] = useState<"claims" | "attendance">("claims");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const claimRows = useMemo(() => [["Claim", "Award", "CHICK (masked)", "Child", "Parent ID", "Service", "Period", "Hours", "Demo subsidy", "Status"] as (string | number)[]].concat(
    s.claims.filter(c => inScope(family(c.familyId)?.locationId)).sort((a, b) => a.id.localeCompare(b.id)).map(c => { const a = s.awards.find(x => x.id === c.awardId); const ch = child(c.childId); return [c.id, c.awardId, a?.chick || "", childName(ch), c.familyId, locById(ch?.locationId || "")?.short || "", c.period, c.hours, c.amount.toFixed(2), c.status]; })), [v]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const attRows = useMemo(() => [["Award", "CHICK (masked)", "Child", "Parent ID", "Service", "Agreed hours", "Booked w/c 19 Oct", "Variance", "Award ends"] as (string | number)[]].concat(
    s.awards.filter(a => inScope(family(a.familyId)?.locationId)).map(a => { const ch = child(a.childId); const b = bookedThisWeek(a.childId); return [a.id, a.chick, childName(ch), a.familyId, locById(ch?.locationId || "")?.short || "", a.agreedHours, b, b - a.agreedHours, a.expires]; })), [v]);
  const retRows = ret === "claims" ? claimRows : attRows;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="ros-split">
        <Card title="CHICK deadline for camp week" sub={"Thu 22 Oct 12:00 · " + countdown(toThu) + " left on the demo clock. Camp week is w/c 26 Oct."} tone={missing.length ? "warn" : "ok"} right={<Policy />}>
          <Grid min={140} gap={10}>
            <Kpi label="Children with NCS camp hours" value={campRows.length} />
            <Kpi label="Missing a valid CHICK" value={missing.length} tone={missing.length ? "bad" : "ok"} />
            <Kpi label="Time left" value={countdown(toThu)} tone={toThu < 1440 ? "bad" : "warn"} />
          </Grid>
          <div style={{ marginTop: 12 }}>
            {campRows.map(r => {
              const ok = valid(r);
              const ch = child(r.childId);
              return (
                <ListRow key={r.childId} tone={ok ? undefined : "bad"}
                  title={<Row wrap gap={8}><RecLink r={{ kind: "child", id: r.childId }} mono={false}>{childName(ch)}</RecLink><Sub>{family(r.familyId)?.surname} · {r.familyId}</Sub></Row>}
                  sub={r.camp + " · " + r.hours + "h NCS · " + (r.source.startsWith("Flagged") && !ok ? "no renewed CHICK received for camp week" : r.award ? "CHICK ends " + fmtDay(r.award.expires) : "no award on file") + " · " + r.source}
                  right={ok ? <Badge tone="ok">Valid for camp week</Badge> : <>
                    <Badge tone="bad">{flagLabel(r)}</Badge>
                    {r.award && role.id !== "parent" && <Btn size="sm" onClick={() => chickReminder({ awardIds: [r.award!.id] })}>Remind</Btn>}
                    {r.award && role.id !== "parent" && <Btn size="sm" variant="ok" onClick={() => confirmThen({ title: "Record renewed CHICK for " + ch?.firstName + "?", body: "Marks a renewed award as received (demo) and clears this child from the missing list. Nothing is registered with the NCS.", confirmLabel: "Record renewal", run: () => chickRenewed({ awardId: r.award!.id }) })}>CHICK received</Btn>}
                  </>} />
              );
            })}
            {!campRows.length && <Empty title="No NCS hours booked for camp week" />}
          </div>
        </Card>
        <Stack gap={16}>
          {apr ? <ApprovalInline a={apr} extra={<div style={{ marginTop: 10 }}><Callout tone="info" title="Human-reviewed proposal">The NCS agent proposed this charge because no valid CHICK is on file for camp week. It changes nothing until an NCS admin approves it, and the family can still send the CHICK before Thursday noon.</Callout></div>} /> : null}
          <Card title="Notice to stop NCS" sub={"A family stopping NCS gives " + s.config.ncsLeaveNoticeWeeks + " weeks' notice. Leaving the service altogether needs " + s.config.leavingNoticeMonths + " months'."} right={<Rule />}>
            <Field label="NCS family">
              <select className="ros-input" value={nfid} onChange={(e) => setNfid(e.target.value)}>
                <option value="">Choose a family…</option>
                {ncsFams.map(f => <option key={f.id} value={f.id}>{f.surname} · {f.id} · {locById(f.locationId)?.short}{notices[f.id] ? " · notice given" : ""}</option>)}
              </select>
            </Field>
            {nf && (notices[nf.id] ? <div style={{ marginTop: 10 }}><Callout tone="ok" title={"Notice recorded: NCS ends " + fmtDay(notices[nf.id])}>Claims stop after that date. Hours after it are charged privately at the site rate.</Callout></div> : (
              <div style={{ marginTop: 10 }}>
                <KV items={[["Notice from", fmtDay(TODAY)], ["Last NCS-funded day", fmtDay(endDate)], ["After that", "Private rate (" + euro(locById(nf.locationId)?.hourlyRate || 0) + "/h, demo)"], ["Children on NCS", String(nf.childIds.filter(id => idx().awardByChild.get(id)).length)]]} />
                <Btn variant="primary" style={{ marginTop: 10 }} disabled={role.id === "parent"} onClick={() => confirmThen({ title: "Record NCS notice for the " + nf.surname + " family?", body: "Flags the family, adds a task to stop claims after " + fmtDay(endDate) + ", and logs a confirmation to the family (simulated).", confirmLabel: "Record notice", run: () => leaveNotice({ familyId: nf.id }) })}>Record notice</Btn>
              </div>
            ))}
            {Object.keys(notices).length > 0 && <div style={{ marginTop: 12 }}><Label style={{ marginBottom: 6 }}>Notices on file</Label>{Object.entries(notices).map(([fid, end]) => <ListRow key={fid} onClick={() => openRecord({ kind: "family", id: fid })} title={family(fid)?.surname + " · " + fid} sub={"NCS ends " + fmtDay(end)} right={<Badge tone="warn">{daysBetween(TODAY, end)} days</Badge>} />)}</div>}
          </Card>
        </Stack>
      </div>
      <Card title="Prepared returns" sub="Built from the live claims and awards for the NCS team to check. Prepared, not submitted: nothing goes to Pobal or the Early Years Hive."
        right={<><Seg size="sm" value={ret} onChange={setRet} options={[["claims", "Claims return"], ["attendance", "Hours and attendance"]]} />
          <Btn size="sm" variant="primary" onClick={() => { downloadCsv(ret === "claims" ? "ros-ncs-claims-prepared.csv" : "ros-ncs-hours-prepared.csv", retRows); logPrepared({ what: ret === "claims" ? "NCS claims return" : "NCS hours and attendance return", rows: retRows.length - 1 }); }}>Download CSV (prepared, not submitted)</Btn></>}>
        <Row wrap gap={8} style={{ marginBottom: 10 }}><DemoTag>Prepared, not submitted</DemoTag><Sub>{(retRows.length - 1).toLocaleString("en-IE")} rows · first eight shown · CHICKs masked</Sub></Row>
        <div className="ros-scroll-x">
          <table style={{ borderCollapse: "collapse", fontSize: 11.5, minWidth: 760, width: "100%" }}>
            <thead><tr>{retRows[0].map((h, k) => <th key={k} style={{ textAlign: "left", padding: "6px 8px", color: "var(--faint)", fontWeight: 500, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
            <tbody>{retRows.slice(1, 9).map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", color: "var(--body)" }}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ================= ECCE & AIM ================= */
function EcceAim() {
  const { s, role } = useRos();
  const ecceRooms = s.rooms.filter(r => r.kind === "Preschool Senior (ECCE)" && inScope(r.locationId));
  const ecce = s.children.filter(c => ecceRooms.some(r => r.id === c.roomId)).sort((a, b) => a.firstName.localeCompare(b.firstName));
  const aim = s.children.filter(c => c.supports && inScope(c.locationId));
  const cols: Col<Child>[] = [
    { key: "n", label: "Child", w: "1.3fr", sort: c => c.firstName, render: c => <RecLink r={{ kind: "child", id: c.id }} mono={false}>{childName(c)}</RecLink> },
    { key: "r", label: "Room", w: "1.2fr", render: c => idx().room.get(c.roomId)?.name + " · " + locById(c.locationId)?.short },
    { key: "a", label: "Age", w: ".5fr", align: "right", sort: c => c.age, render: c => String(c.age) },
    { key: "e", label: "ECCE free hours", w: "1.3fr", render: () => <Badge tone="neutral">Placeholder: 15h/wk, 38 weeks</Badge> },
    { key: "w", label: "Wraparound NCS", w: "1fr", render: c => { const a = idx().awardByChild.get(c.id); return a ? <Badge tone="info">{a.agreedHours}h award</Badge> : <Sub>None</Sub>; } },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Callout tone="neutral" title="Placeholders">ECCE and AIM are shown so the shape of the screen is clear. Free-hours tracking, ECCE registrations and AIM applications are not modelled in this demo, and nothing here is submitted to the Early Years Hive.</Callout>
      <Grid min={180} gap={12}>
        <Kpi label="ECCE rooms" value={ecceRooms.length} sub={ecceRooms.map(r => locById(r.locationId)?.short).join(", ")} />
        <Kpi label="Children in ECCE rooms" value={ecce.length} sub="preschool senior" />
        <Kpi label="With a wraparound NCS award" value={ecce.filter(c => idx().awardByChild.get(c.id)).length} tone="info" />
        <Kpi label="AIM-supported children" value={aim.length} sub="support plan on file" tone="info" />
      </Grid>
      <div className="ros-split">
        <Card pad={false} title="ECCE preschool (senior)" sub="Free preschool hours sit alongside NCS wraparound hours. Hours shown are a placeholder.">
          <Table rows={ecce} cols={cols} rowKey={c => c.id} onRow={c => openRecord({ kind: "child", id: c.id })} minWidth={720} empty="No ECCE children in scope" />
        </Card>
        <Card title="Access and Inclusion Model (AIM)" sub="Children with a recorded support. Detail is restricted to roles with access to care information.">
          {aim.length ? aim.map(c => <ListRow key={c.id} onClick={() => openRecord({ kind: "child", id: c.id })} title={childName(c)} sub={(idx().room.get(c.roomId)?.name || "") + " · " + locById(c.locationId)?.short + " · " + (role.medical ? c.supports : "Support plan on file (restricted)")} right={<Badge tone="neutral">AIM placeholder</Badge>} />) : <Empty title="No AIM supports recorded" />}
        </Card>
      </div>
    </div>
  );
}
