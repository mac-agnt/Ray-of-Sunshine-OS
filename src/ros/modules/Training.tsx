/* Training Courses. Ray of Sunshine runs QQI-aligned Manual Handling courses
   from the Hazelbrook training room for staff, other providers and local
   employers. Course revenue is reported here and only here: it is separate
   from childcare fees and never appears in Billing or NCS figures. Prices
   are demo values; invoices, payments and certificates are simulated. */
import { useMemo, useState, type ReactNode } from "react";
import type { RosState, Course, CourseBooking, Tone } from "../types";
import { useRos, openRecord, nav, confirmThen, defineAction, setTab } from "../store";
import { staffById, locById, inScope } from "../selectors";
import { TODAY, addDays, daysBetween, fmtDate, fmtDay, fmtDateY, rel, euro, euro0, pct, round2 } from "../time";
import { Card, Kpi, Grid, Table, Badge, StatusBadge, Btn, RecLink, HBars, Columns, StackBar, KV, Callout, Seg, ListRow, Timeline, DemoTag, Empty, Row, Stack, Sub, Label, Field, Toggle, Bar, Page, PageHead, type Col } from "../ui";

/* ---------------- constants and helpers ---------------- */
const INTERNAL = "Ray of Sunshine (staff)";
const RENEW_YEARS = 3;
type TrainExt = RosState & { trainingInvoices?: Record<string, string>; trainingCerts?: Record<string, string> };
const ext = (s: RosState) => s as TrainExt;
const isPast = (c: Course) => c.date < TODAY;
const plusYears = (d: string, n: number) => (+d.slice(0, 4) + n) + d.slice(4);
const billable = (b: CourseBooking) => b.company !== INTERNAL;
const bookingsFor = (s: RosState, courseId: string) => s.courseBookings.filter(b => b.courseId === courseId);
function nextBookingId(s: RosState) { const n = s.courseBookings.reduce((m, b) => Math.max(m, +(b.id.replace(/\D/g, "")) || 0), 0) + 1; return "CB" + n; }
function nextCertNo(s: RosState, year: string) {
  const used = new Set(s.courseBookings.map(b => b.certificate).filter(Boolean));
  let n = 301 + s.courseBookings.filter(b => b.certificate).length;
  while (used.has("MH-" + year + "-" + n)) n++;
  return "MH-" + year + "-" + n;
}
const groupRef = (company: string, courseId: string) => "TRN-" + company.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 3) + "-" + courseId.replace("CRS-", "");

/* ---------------- training actions (simulated, replayable) ---------------- */
const addBooking = defineAction<{ courseId: string; name: string; email: string; company?: string; paid: boolean; status: "Booked" | "Reserved" }>("training.add", (s, p, ctx) => {
  const c = s.courses.find(x => x.id === p.courseId); if (!c || !p.name.trim()) return;
  if (bookingsFor(s, c.id).length >= c.capacity) return;
  const id = nextBookingId(s);
  s.courseBookings.push({ id, courseId: c.id, name: p.name.trim(), company: p.company?.trim() || undefined, email: p.email.trim(), paid: p.company === INTERNAL ? false : p.paid, status: p.status });
  ctx.log({ category: "Operations", title: "Course booking added: " + p.name.trim(), detail: c.name + " · " + fmtDay(c.date) + (p.company ? " · " + p.company : "") + " · " + p.status + (p.company === INTERNAL ? " · internal, no charge" : p.paid ? " · paid (simulated)" : " · unpaid") + ". Joining details not sent (simulated).", link: { kind: "course", id: c.id } });
}, { toast: (p) => p.name.trim() + " added to the course roster." , undo: true });

const markPaid = defineAction<{ bookingId: string }>("training.paid", (s, p, ctx) => {
  const b = s.courseBookings.find(x => x.id === p.bookingId); if (!b || b.paid || !billable(b)) return;
  const c = s.courses.find(x => x.id === b.courseId)!;
  b.paid = true;
  ctx.log({ category: "Financial", title: "Course payment recorded: " + b.name, detail: euro(c.price) + " for " + c.name + " (" + fmtDate(c.date) + "). Training revenue, separate from childcare fees. Simulated payment.", link: { kind: "course", id: c.id } });
}, { toast: () => "Payment recorded (simulated). Course sales updated.", undo: true });

const confirmPlace = defineAction<{ bookingId: string }>("training.confirm", (s, p, ctx) => {
  const b = s.courseBookings.find(x => x.id === p.bookingId); if (!b || b.status !== "Reserved") return;
  b.status = "Booked";
  ctx.log({ category: "Operations", title: "Course place confirmed: " + b.name, detail: "Reserved place converted to a booking for " + b.courseId + ".", link: { kind: "course", id: b.courseId } });
}, { toast: () => "Place confirmed." });

const cancelBooking = defineAction<{ bookingId: string }>("training.cancel", (s, p, ctx) => {
  const i = s.courseBookings.findIndex(x => x.id === p.bookingId); if (i < 0) return;
  const b = s.courseBookings[i];
  if (b.status === "Certified" || b.status === "Attended") return;
  s.courseBookings.splice(i, 1);
  ctx.log({ category: "Operations", title: "Course booking cancelled: " + b.name, detail: b.courseId + (b.paid ? ". Paid place: refund to be handled by Accounts (simulated)." : ". Place released."), link: { kind: "course", id: b.courseId } });
}, { toast: () => "Booking cancelled. Place released.", undo: true });

const reserveGroup = defineAction<{ courseId: string; company: string; places: number; contact: string }>("training.reserveGroup", (s, p, ctx) => {
  const c = s.courses.find(x => x.id === p.courseId); if (!c || p.places < 1) return;
  const free = c.capacity - bookingsFor(s, c.id).length;
  if (p.places > free) return;
  for (let k = 1; k <= p.places; k++) s.courseBookings.push({ id: nextBookingId(s), courseId: c.id, name: p.company + " place " + k + " (name to follow)", company: p.company, email: p.contact, paid: false, status: "Reserved" });
  ctx.log({ category: "Operations", title: "Group places reserved: " + p.company, detail: p.places + " places on " + c.name + " (" + fmtDay(c.date) + "). Names to follow. Contact " + p.contact + ".", link: { kind: "course", id: c.id } });
}, { toast: (p) => p.places + " places reserved for " + p.company + "." , undo: true });

const sendGroupInvoice = defineAction<{ company: string; courseId: string; amount: number }>("training.groupInvoice", (s, p, ctx) => {
  const e = ext(s); const ref = groupRef(p.company, p.courseId);
  e.trainingInvoices = { ...(e.trainingInvoices || {}), [ref]: ctx.now };
  ctx.log({ category: "Financial", title: "Group invoice sent (simulated): " + ref, detail: p.company + " · " + euro(p.amount) + " · training revenue, separate from childcare fees. Nothing was emailed.", link: { kind: "course", id: p.courseId } });
}, { toast: () => "Group invoice logged as sent (simulated)." });

const markGroupPaid = defineAction<{ company: string; courseId: string }>("training.groupPaid", (s, p, ctx) => {
  const list = s.courseBookings.filter(b => b.courseId === p.courseId && b.company === p.company && !b.paid);
  if (!list.length) return;
  const c = s.courses.find(x => x.id === p.courseId)!;
  list.forEach(b => { b.paid = true; });
  ctx.log({ category: "Financial", title: "Group payment recorded: " + p.company, detail: list.length + " places × " + euro(c.price) + " = " + euro(list.length * c.price) + " for " + c.name + ". Simulated bank transfer.", link: { kind: "course", id: c.id } });
}, { toast: () => "Group payment recorded (simulated)." });

const issueCert = defineAction<{ bookingId: string }>("training.cert", (s, p, ctx) => {
  const b = s.courseBookings.find(x => x.id === p.bookingId); if (!b) return;
  const c = s.courses.find(x => x.id === b.courseId)!;
  if (c.date > TODAY) return;
  if (!b.certificate) { b.certificate = nextCertNo(s, c.date.slice(0, 4)); b.status = "Certified"; }
  const e = ext(s); e.trainingCerts = { ...(e.trainingCerts || {}), [b.id]: ctx.now };
  ctx.log({ category: "Operations", title: "Certificate generated (simulated): " + b.certificate, detail: b.name + " · " + c.name + " · " + fmtDate(c.date) + ". Renewal due " + fmtDateY(plusYears(c.date, RENEW_YEARS)) + ". Emailed in the demo only.", link: { kind: "course", id: c.id } });
}, { toast: () => "Certificate generated and logged (simulated)." });

const proposePrivate = defineAction<{ company: string; places: number; contact: string }>("training.private", (s, p, ctx) => {
  if (s.tasks.some(t => t.title.startsWith("Private Manual Handling session: " + p.company) && t.status !== "Done")) return;
  s.tasks.push({ id: ctx.id("TSK"), title: "Private Manual Handling session: " + p.company + " (" + p.places + " places)", owner: "Kevin Lawless", due: "Fri 23 Oct", dueDate: "2026-10-23", priority: "Low", department: "Operations", status: "Not started", source: ctx.actor });
  ctx.log({ category: "Operations", title: "Private session proposed: " + p.company, detail: p.places + " places, on site. Quote and dates to follow from the trainer. Contact " + p.contact + ".", });
}, { toast: () => "Task added for the trainer to quote a private session." });

/* ---------------- demo enquiries (not yet bookings) ---------------- */
const ENQUIRIES = [
  { id: "TEQ-07", company: "Arklow Marine Supplies", contact: "Eamon Furlong · eamon.furlong@arklowmarine.demo.example", places: 3, wanted: "CRS-1118", note: "Warehouse team. Afternoon suits better.", received: "2026-10-19 11:20" },
  { id: "TEQ-08", company: "Glenealy Care Home", contact: "Bríd Healy · bhealy@glenealycare.demo.example", places: 6, wanted: "", note: "Would like the course run on site for night staff.", received: "2026-10-20 08:12" },
];

/* ---------------- page ---------------- */
const SUBS: Record<string, string> = {
  Calendar: "Manual Handling sessions at Hazelbrook, with places booked, reserved and free.",
  Bookings: "Who is on each course, who has paid, and places held. Add bookings for individuals or staff.",
  "Corporate Groups": "Employer bookings and enquiries, with a group invoice for each.",
  Certificates: "Certificates for completed courses, and renewals due three years on.",
  Sales: "Course revenue and fill rate. Reported separately from childcare fees.",
};
export default function Training({ tab }: { tab: string }) {
  let body: ReactNode;
  if (tab === "Bookings") body = <Bookings />;
  else if (tab === "Corporate Groups") body = <Groups />;
  else if (tab === "Certificates") body = <Certificates />;
  else if (tab === "Sales") body = <Sales />;
  else body = <Calendar />;
  return (
    <Page>
      <PageHead eyebrow="Training Courses" title={tab} sub={SUBS[tab] || SUBS.Calendar} right={<DemoTag title="Course prices are demo values. Payments, invoices, emails and certificates are simulated.">Demo prices · simulated</DemoTag>} />
      {body}
    </Page>
  );
}

function availability(s: RosState, c: Course) {
  const b = bookingsFor(s, c.id);
  const paid = b.filter(x => x.status !== "Reserved" && (x.paid || !billable(x))).length;
  const unpaid = b.filter(x => x.status !== "Reserved" && !x.paid && billable(x)).length;
  const reserved = b.filter(x => x.status === "Reserved").length;
  return { b, paid, unpaid, reserved, free: Math.max(0, c.capacity - b.length), fill: b.length / c.capacity };
}
function CourseBar({ c }: { c: Course }) {
  const { s } = useRos();
  const a = availability(s, c);
  return <StackBar height={10} parts={[{ label: "Booked and paid " + a.paid, value: a.paid, tone: "ok" }, { label: "Booked, unpaid " + a.unpaid, value: a.unpaid, tone: "warn" }, { label: "Reserved " + a.reserved, value: a.reserved, tone: "info" }, { label: "Free " + a.free, value: a.free, tone: "neutral" }]} />;
}

/* ================= Calendar ================= */
function Calendar() {
  const { s } = useRos();
  const courses = s.courses.slice().sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = courses.filter(c => !isPast(c));
  const [sel, setSel] = useState<string>(upcoming[0]?.id || courses[0]?.id || "");
  const months = ["2026-10", "2026-11"];
  const booked = upcoming.reduce((n, c) => n + bookingsFor(s, c.id).length, 0), cap = upcoming.reduce((n, c) => n + c.capacity, 0);
  const course = s.courses.find(c => c.id === sel);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Grid min={170} gap={12}>
        <Kpi label="Upcoming sessions" value={upcoming.length} sub={upcoming.map(c => fmtDate(c.date)).join(" and ")} />
        <Kpi label="Places taken" value={booked + " / " + cap} sub={pct(cap ? booked / cap : 0) + " full across upcoming"} tone="info" onClick={() => setTab("Training", "Bookings")} />
        <Kpi label="Free places" value={cap - booked} sub="to sell before the dates" tone={cap - booked > 8 ? "warn" : "ok"} />
        <Kpi label="Unpaid places" value={upcoming.reduce((n, c) => n + availability(s, c).unpaid, 0)} sub="booked but not paid" tone="warn" onClick={() => setTab("Training", "Bookings")} />
      </Grid>
      <div className="ros-split">
        <Card title="Course calendar" sub="Click a course day to see it.">
          <div className="ros-split-even">
            {months.map(m => <MonthGrid key={m} month={m} courses={courses} sel={sel} onPick={setSel} />)}
          </div>
        </Card>
        {course ? (
          <Card title={course.name} sub={fmtDay(course.date) + " " + course.start + " · " + course.venue} right={<><StatusBadge s={isPast(course) ? "Completed" : "Scheduled"} /><RecLink r={{ kind: "course", id: course.id }} /></>}>
            <KV items={[["Trainer", staffById(course.trainerId)?.name || ""], ["Price", euro(course.price) + " per person (demo)"], ["Capacity", course.capacity + " places"], [isPast(course) ? "Ran" : "Starts in", isPast(course) ? daysBetween(course.date, TODAY) + " days ago" : daysBetween(TODAY, course.date) + " days"]]} />
            <div style={{ marginTop: 14 }}><CourseBar c={course} /></div>
            <Row wrap gap={8} style={{ marginTop: 14 }}>
              <Btn variant="primary" onClick={() => nav("Training", "Bookings", { courseId: course.id })}>Open roster</Btn>
              {isPast(course) && <Btn onClick={() => setTab("Training", "Certificates")}>Certificates</Btn>}
            </Row>
          </Card>
        ) : <Card><Empty title="No course selected" /></Card>}
      </div>
      <Grid min={300} gap={14}>
        {courses.map(c => {
          const a = availability(s, c);
          return (
            <Card key={c.id} onClick={() => setSel(c.id)} tone={c.id === sel ? "accent" : undefined} title={fmtDay(c.date) + " · " + c.start} sub={c.name} right={<StatusBadge s={isPast(c) ? "Completed" : a.free === 0 ? "Full" : a.free <= 3 ? "Few places" : "Open"} />}>
              <Row gap={8} style={{ marginBottom: 10 }}><span style={{ fontSize: 22, fontWeight: 600 }}>{a.b.length}</span><Sub>of {c.capacity} places · {a.free} free</Sub><span style={{ flex: 1 }} /><span style={{ fontSize: 12.5 }}>{euro0(c.price)} each</span></Row>
              <CourseBar c={c} />
            </Card>
          );
        })}
      </Grid>
    </div>
  );
}
function MonthGrid({ month, courses, sel, onPick }: { month: string; courses: Course[]; sel: string; onPick: (id: string) => void }) {
  const first = month + "-01";
  const offset = (new Date(first + "T00:00:00Z").getUTCDay() + 6) % 7;
  const daysIn = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: offset }, (): string | null => null).concat(Array.from({ length: daysIn }, (_, i) => month + "-" + String(i + 1).padStart(2, "0")));
  const label = new Date(first + "T00:00:00Z").toLocaleDateString("en-IE", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 3 }}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} style={{ fontSize: 10.5, color: "var(--faint)", textAlign: "center" }}>{d}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const c = courses.find(x => x.date === d);
          const today = d === TODAY;
          return (
            <button key={i} className="ros-focus" disabled={!c} onClick={() => c && onPick(c.id)} title={c ? c.name + " · " + c.start : undefined}
              style={{ aspectRatio: "1", minWidth: 0, borderRadius: 8, border: today ? "1px solid var(--accent-line)" : "1px solid transparent", cursor: c ? "pointer" : "default", fontSize: 11.5, fontVariantNumeric: "tabular-nums",
                background: c ? (c.id === sel ? "var(--accent-fill,var(--accent))" : "var(--accent-soft)") : "transparent", color: c && c.id === sel ? "var(--on-accent)" : c ? "var(--accent)" : d < TODAY ? "var(--faint)" : "var(--body)", fontWeight: c ? 700 : 400 }}>
              {+d.slice(8)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ================= Bookings ================= */
let consumedCourseFocus = "";
function Bookings() {
  const { s, ui, role } = useRos();
  const focus = ui.focus.courseId && ui.focus.courseId !== consumedCourseFocus && s.courses.some(c => c.id === ui.focus.courseId) ? ui.focus.courseId : "";
  const [cid, setCid] = useState<string>(() => { if (focus) consumedCourseFocus = focus; return focus || "CRS-1104"; });
  const c = s.courses.find(x => x.id === cid) || s.courses[0];
  const a = availability(s, c);
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [company, setCompany] = useState("");
  const [paid, setPaid] = useState(false), [status, setStatus] = useState<"Booked" | "Reserved">("Booked");
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const canAdd = !isPast(c) && a.free > 0 && name.trim().length > 1 && emailOk && role.id !== "parent";
  const staffDue = useMemo(() => s.staff.filter(x => inScope(x.locationId)).map(x => ({ x, cert: x.certs.find(k => k.kind === "Manual handling") }))
    .filter(r => r.cert && r.cert.expires <= addDays(TODAY, 183)).sort((p, q) => p.cert!.expires.localeCompare(q.cert!.expires)), [s.staff]);
  const onCourse = (staffName: string) => s.courseBookings.some(b => b.company === INTERNAL && b.name === staffName && s.courses.some(k => k.id === b.courseId && !isPast(k)));
  const cols: Col<CourseBooking>[] = [
    { key: "n", label: "Attendee", w: "1.5fr", sort: b => b.name, render: b => <Stack><span>{b.name}</span><Sub>{b.email}</Sub></Stack> },
    { key: "c", label: "Company", w: "1.2fr", sort: b => b.company || "", render: b => b.company ? <Badge tone={b.company === INTERNAL ? "brand" : "info"}>{b.company}</Badge> : <Sub>Individual</Sub> },
    { key: "p", label: "Payment", w: ".8fr", sort: b => (b.paid ? 1 : 0), render: b => !billable(b) ? <Badge>Internal</Badge> : <StatusBadge s={b.paid ? "Paid" : "Unpaid"} /> },
    { key: "s", label: "Status", w: ".8fr", sort: b => b.status, render: b => <StatusBadge s={b.status} /> },
    { key: "a", label: "", w: "1.6fr", align: "right", render: b => (
      <Row gap={6} wrap style={{ justifyContent: "flex-end" }}>
        {billable(b) && !b.paid && <Btn size="sm" variant="ok" onClick={() => markPaid({ bookingId: b.id })}>Mark paid</Btn>}
        {b.status === "Reserved" && <Btn size="sm" onClick={() => confirmPlace({ bookingId: b.id })}>Confirm</Btn>}
        {!isPast(c) && <Btn size="sm" variant="subtle" onClick={() => confirmThen({ title: "Cancel " + b.name + "'s place?", body: "Releases the place on " + c.name + " (" + fmtDay(c.date) + ")." + (b.paid ? " This place is paid; Accounts handles any refund (simulated)." : ""), confirmLabel: "Cancel booking", danger: true, run: () => cancelBooking({ bookingId: b.id }) })}>Cancel</Btn>}
        {b.certificate && <Badge tone="ok">{b.certificate}</Badge>}
      </Row>
    ) },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Seg value={cid} onChange={setCid} options={s.courses.slice().sort((x, y) => x.date.localeCompare(y.date)).map(k => [k.id, fmtDate(k.date) + " · " + bookingsFor(s, k.id).length + "/" + k.capacity] as [string, string])} />
      <Grid min={150} gap={12}>
        <Kpi label="On the roster" value={a.b.length + " / " + c.capacity} sub={a.free + " free"} />
        <Kpi label="Paid" value={a.b.filter(b => b.paid).length} tone="ok" />
        <Kpi label="Unpaid" value={a.unpaid} sub={euro(a.unpaid * c.price) + " to collect"} tone={a.unpaid ? "warn" : "ok"} />
        <Kpi label="Reserved" value={a.reserved} sub="held, not confirmed" tone="info" />
      </Grid>
      <div className="ros-split">
        <Card pad={false} title={c.name} sub={fmtDay(c.date) + " " + c.start + " · " + c.venue + " · trainer " + (staffById(c.trainerId)?.name || "")} right={<RecLink r={{ kind: "course", id: c.id }} />}>
          <div style={{ padding: "0 16px 12px" }}><CourseBar c={c} /></div>
          <Table rows={a.b} cols={cols} rowKey={b => b.id} minWidth={820} empty="No bookings yet" rowTone={b => b.status === "Reserved" ? "info" : billable(b) && !b.paid ? "warn" : undefined} />
        </Card>
        <Stack gap={16}>
          <Card title="Add a booking" sub={isPast(c) ? "This course has run. Bookings are closed." : a.free ? a.free + " places left on " + fmtDate(c.date) + "." : "This course is full."}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Field label="Name"><input className="ros-input" value={name} onChange={(e) => setName(e.target.value)} disabled={isPast(c)} /></Field>
              <Field label="Email" hint={email && !emailOk ? "Enter a valid email address" : undefined}><input className="ros-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isPast(c)} /></Field>
              <Field label="Company (optional)"><input className="ros-input" value={company} onChange={(e) => setCompany(e.target.value)} disabled={isPast(c)} placeholder="Leave blank for an individual" /></Field>
              <Row wrap gap={14}>
                <Seg size="sm" value={status} onChange={setStatus} options={[["Booked", "Book"], ["Reserved", "Reserve"]]} />
                <Row gap={8}><Toggle on={paid} onChange={() => setPaid(x => !x)} label="Paid" /><span style={{ fontSize: 12.5, color: "var(--body)" }}>{paid ? "Paid now (simulated)" : "Pay later"}</span></Row>
              </Row>
              <Btn variant="primary" disabled={!canAdd} onClick={() => { addBooking({ courseId: c.id, name, email, company: company || undefined, paid, status }); setName(""); setEmail(""); setCompany(""); setPaid(false); }}>Add to {fmtDate(c.date)} course</Btn>
            </div>
          </Card>
          <Card title="Staff due a refresher" sub="Ray of Sunshine staff whose manual handling certificate ends within six months. Internal places are not charged.">
            {staffDue.length ? staffDue.slice(0, 8).map(({ x, cert }) => (
              <ListRow key={x.id} title={<Row wrap gap={8}><RecLink r={{ kind: "staff", id: x.id }} mono={false}>{x.name}</RecLink><Sub>{x.role} · {locById(x.locationId)?.short}</Sub></Row>}
                sub={"Manual handling ends " + fmtDay(cert!.expires) + " (" + daysBetween(TODAY, cert!.expires) + " days)"}
                right={onCourse(x.name) ? <Badge tone="ok">Booked</Badge> : <Btn size="sm" disabled={isPast(c) || a.free <= 0 || role.id === "parent"} onClick={() => addBooking({ courseId: c.id, name: x.name, email: x.email, company: INTERNAL, paid: false, status: "Booked" })}>Book on {fmtDate(c.date)}</Btn>} />
            )) : <Empty title="No staff due in the next six months" />}
          </Card>
        </Stack>
      </div>
    </div>
  );
}

/* ================= Corporate Groups ================= */
function Groups() {
  const { s, role } = useRos();
  const groups = useMemo(() => {
    const m = new Map<string, CourseBooking[]>();
    for (const b of s.courseBookings) if (b.company && b.company !== INTERNAL) { if (!m.has(b.company)) m.set(b.company, []); m.get(b.company)!.push(b); }
    return Array.from(m.entries()).map(([company, list]) => ({ company, list })).sort((a, b) => b.list.length - a.list.length);
  }, [s.courseBookings, s.courseBookings.length]);
  const [sel, setSel] = useState<string>("Wicklow Packaging Ltd");
  const g = groups.find(x => x.company === sel) || groups[0];
  const courseIds = g ? Array.from(new Set(g.list.map(b => b.courseId))).sort().reverse() : [];
  const [cid, setCid] = useState<string>("");
  const courseId = courseIds.includes(cid) ? cid : courseIds.find(id => !isPast(s.courses.find(c => c.id === id)!)) || courseIds[0] || "";
  const course = s.courses.find(c => c.id === courseId);
  const lines = g && course ? g.list.filter(b => b.courseId === course.id) : [];
  const total = course ? round2(lines.length * course.price) : 0;
  const paidN = lines.filter(b => b.paid).length;
  const ref = g && course ? groupRef(g.company, course.id) : "";
  const sentAt = ref ? (ext(s).trainingInvoices || {})[ref] : undefined;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Grid min={170} gap={12}>
        <Kpi label="Employer groups" value={groups.length} sub={groups.map(x => x.company).join(", ")} />
        <Kpi label="Group places" value={groups.reduce((n, x) => n + x.list.length, 0)} sub="all courses" tone="info" />
        <Kpi label="Group revenue paid" value={euro0(groups.reduce((n, x) => n + x.list.filter(b => b.paid).reduce((a, b) => a + (s.courses.find(c => c.id === b.courseId)?.price || 0), 0), 0))} sub="training only" tone="ok" />
        <Kpi label="Open enquiries" value={ENQUIRIES.filter(e => !s.courseBookings.some(b => b.company === e.company)).length} tone="warn" />
      </Grid>
      <div className="ros-split">
        <Stack gap={16}>
          <Card pad={false} title="Employer groups">
            {groups.map(x => {
              const up = x.list.filter(b => !isPast(s.courses.find(c => c.id === b.courseId)!));
              return <ListRow key={x.company} onClick={() => { setSel(x.company); setCid(""); }} tone={g?.company === x.company ? "accent" : undefined}
                title={x.company} sub={x.list.length + " places · " + up.length + " upcoming · " + x.list.filter(b => b.paid).length + " paid"}
                right={<Row gap={6}>{Array.from(new Set(x.list.map(b => b.courseId))).map(id => <Badge key={id}>{fmtDate(s.courses.find(c => c.id === id)!.date)}</Badge>)}</Row>} />;
            })}
          </Card>
          <Card title="Enquiries" sub="Employer requests not yet booked. Demo enquiries.">
            {ENQUIRIES.map(e => {
              const want = s.courses.find(c => c.id === e.wanted);
              const free = want ? want.capacity - bookingsFor(s, want.id).length : 0;
              const done = s.courseBookings.some(b => b.company === e.company);
              const task = s.tasks.find(t => t.title.startsWith("Private Manual Handling session: " + e.company));
              return (
                <div key={e.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                  <Row wrap gap={8}><span style={{ fontWeight: 600, fontSize: 13.5 }}>{e.company}</span><Sub>{e.id} · {rel(e.received)}</Sub><span style={{ flex: 1 }} /><StatusBadge s={done ? "Reserved" : task ? "Proposed" : "New"} /></Row>
                  <div style={{ fontSize: 12.5, color: "var(--dim)", margin: "5px 0 8px" }}>{e.places} places · {want ? "wants " + fmtDay(want.date) : "no date yet"} · {e.note} · {e.contact}</div>
                  {!done && (
                    <Row wrap gap={8}>
                      {want && <Btn size="sm" variant="primary" disabled={free < e.places || role.id === "parent"} title={free < e.places ? "Only " + free + " places free" : undefined} onClick={() => confirmThen({ title: "Reserve " + e.places + " places for " + e.company + "?", body: "Holds " + e.places + " places on " + fmtDay(want.date) + ". Names to follow. A group invoice can be sent from here.", confirmLabel: "Reserve places", run: () => { reserveGroup({ courseId: want.id, company: e.company, places: e.places, contact: e.contact }); setSel(e.company); setCid(want.id); } })}>Reserve {e.places} on {fmtDate(want.date)}</Btn>}
                      {!want && (() => { const opt = s.courses.filter(c => !isPast(c) && c.capacity - bookingsFor(s, c.id).length >= e.places)[0]; return opt ? <Btn size="sm" onClick={() => reserveGroup({ courseId: opt.id, company: e.company, places: e.places, contact: e.contact })}>Reserve {e.places} on {fmtDate(opt.date)}</Btn> : <Sub>No public date has {e.places} places free.</Sub>; })()}
                      {!task && <Btn size="sm" variant="subtle" onClick={() => proposePrivate({ company: e.company, places: e.places, contact: e.contact })}>Propose a private session</Btn>}
                      {task && <RecLink r={{ kind: "task", id: task.id }}>Trainer task</RecLink>}
                    </Row>
                  )}
                </div>
              );
            })}
          </Card>
        </Stack>
        {g && course ? (
          <Card title={"Group invoice · " + g.company} sub="Training invoice. Separate from childcare fees and not shown in Billing." right={courseIds.length > 1 ? <Seg size="sm" value={courseId} onChange={setCid} options={courseIds.map(id => [id, fmtDate(s.courses.find(c => c.id === id)!.date)] as [string, string])} /> : undefined}>
            <div style={{ background: "#fff", color: "#1d2433", borderRadius: 14, padding: "20px 20px 16px", boxShadow: "0 10px 30px rgba(0,0,0,.25)" }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 200px", fontSize: 11.5, lineHeight: 1.5, color: "#4b5468" }}><div style={{ fontWeight: 700, color: "#060068", fontSize: 13 }}>Ray of Sunshine Training</div>Hazelbrook Rise, Rathnew, Co. Wicklow, A67 HX39</div>
                <div style={{ textAlign: "right" }}><div style={{ fontSize: 16, fontWeight: 700, color: "#060068" }}>{ref}</div><div style={{ fontSize: 11, color: "#6b7280" }}>Issued {fmtDate(TODAY)} · Due {fmtDate(addDays(TODAY, 14))}</div></div>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: "#4b5468" }}>Bill to <b style={{ color: "#1d2433" }}>{g.company}</b> · {course.name} · {fmtDay(course.date)} {course.start}</div>
              <div style={{ marginTop: 10, borderTop: "1px solid #e5e7eb" }}>
                {lines.map(b => <div key={b.id} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: "1px solid #f0f1f4", fontSize: 12 }}><span style={{ flex: 1 }}>{b.name}{b.status === "Reserved" ? " (reserved)" : ""}</span><span style={{ color: b.paid ? "#4f7a28" : "#a5660b" }}>{b.paid ? "paid" : "unpaid"}</span><span style={{ width: 70, textAlign: "right" }}>{euro(course.price)}</span></div>)}
              </div>
              <div style={{ display: "flex", padding: "8px 0 0", marginTop: 6, borderTop: "2px solid #060068", fontWeight: 700, color: "#060068", fontSize: 14 }}><span style={{ flex: 1 }}>Total ({lines.length} places)</span><span>{euro(total)}</span></div>
              <div style={{ display: "flex", padding: "3px 0", fontSize: 12.5, color: "#4b5468" }}><span style={{ flex: 1 }}>Paid</span><span>{euro(paidN * course.price)}</span></div>
              <div style={{ display: "flex", padding: "3px 0", fontSize: 12.5, fontWeight: 600 }}><span style={{ flex: 1 }}>Balance</span><span>{euro(total - paidN * course.price)}</span></div>
              <div style={{ marginTop: 10, fontSize: 10.5, color: "#6b7280", lineHeight: 1.5 }}>Demo price per place. VAT treatment to be confirmed. Pay by bank transfer quoting {ref}.</div>
            </div>
            <Row wrap gap={8} style={{ marginTop: 12 }}>
              <Btn variant="primary" disabled={role.id === "parent"} onClick={() => sendGroupInvoice({ company: g.company, courseId: course.id, amount: total })}>{sentAt ? "Resend" : "Send"} group invoice (simulated)</Btn>
              {paidN < lines.length && <Btn variant="ok" onClick={() => confirmThen({ title: "Record " + g.company + "'s payment?", body: (lines.length - paidN) + " places × " + euro(course.price) + " = " + euro((lines.length - paidN) * course.price) + ". Simulated bank transfer, training revenue only.", confirmLabel: "Record payment", run: () => markGroupPaid({ company: g.company, courseId: course.id }) })}>Record group payment</Btn>}
              <Btn variant="subtle" onClick={() => nav("Training", "Bookings", { courseId: course.id })}>Open roster</Btn>
            </Row>
            {sentAt && <div style={{ marginTop: 8 }}><Sub>Sent {rel(sentAt)} (simulated)</Sub></div>}
          </Card>
        ) : <Card><Empty title="No employer groups yet" /></Card>}
      </div>
    </div>
  );
}

/* ================= Certificates ================= */
function Certificates() {
  const { s, role } = useRos();
  const past = s.courses.filter(isPast).sort((a, b) => b.date.localeCompare(a.date));
  const certs = s.courseBookings.filter(b => past.some(c => c.id === b.courseId));
  const [sel, setSel] = useState<string>(certs.find(b => b.certificate)?.id || "");
  const b = s.courseBookings.find(x => x.id === sel);
  const bc = b ? s.courses.find(c => c.id === b.courseId) : undefined;
  const issued = ext(s).trainingCerts || {};
  const upcoming = s.courses.filter(c => !isPast(c));
  const staffMh = useMemo(() => s.staff.filter(x => inScope(x.locationId)).map(x => ({ x, cert: x.certs.find(k => k.kind === "Manual handling") })).filter(r => r.cert).sort((p, q) => p.cert!.expires.localeCompare(q.cert!.expires)), [s.staff]);
  const cols: Col<CourseBooking>[] = [
    { key: "n", label: "Attendee", w: "1.4fr", sort: x => x.name, render: x => <Stack><span>{x.name}</span><Sub>{x.company || "Individual"}</Sub></Stack> },
    { key: "c", label: "Certificate", w: "1fr", sort: x => x.certificate || "", render: x => x.certificate ? <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{x.certificate}</span> : <Badge tone="warn">Not issued</Badge> },
    { key: "d", label: "Completed", w: ".8fr", render: x => fmtDate(s.courses.find(c => c.id === x.courseId)!.date) },
    { key: "r", label: "Renewal due", w: "1fr", render: x => { const d = plusYears(s.courses.find(c => c.id === x.courseId)!.date, RENEW_YEARS); return <Stack><span>{fmtDateY(d)}</span><Sub>reminder {fmtDateY(addDays(d, -90))}</Sub></Stack>; } },
    { key: "e", label: "", w: "1.2fr", align: "right", render: x => <Row gap={6} style={{ justifyContent: "flex-end" }}>{issued[x.id] && <Badge tone="ok">Sent {rel(issued[x.id])}</Badge>}<Btn size="sm" onClick={() => setSel(x.id)}>Preview</Btn></Row> },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{"@media print{body *{visibility:hidden !important}.ros-print,.ros-print *{visibility:visible !important}.ros-print{position:absolute;left:0;top:0;width:100%;box-shadow:none !important}}"}</style>
      <Grid min={170} gap={12}>
        <Kpi label="Certified attendees" value={certs.filter(x => x.certificate).length} sub={past.map(c => fmtDate(c.date)).join(", ")} tone="ok" />
        <Kpi label="Awaiting certificate" value={certs.filter(x => !x.certificate).length} tone={certs.some(x => !x.certificate) ? "warn" : "ok"} />
        <Kpi label="Renewals due" value={past.length ? fmtDateY(plusYears(past[0].date, RENEW_YEARS)) : "n/a"} sub={"every " + RENEW_YEARS + " years"} />
        <Kpi label="Certificates after upcoming courses" value={upcoming.reduce((n, c) => n + bookingsFor(s, c.id).length, 0)} sub="issued once each course has run" tone="info" />
      </Grid>
      <div className="ros-split">
        <Card pad={false} title="Completed courses" sub="Certificates are generated after the course has run. Generating one here is simulated.">
          <Table rows={certs} cols={cols} rowKey={x => x.id} onRow={x => setSel(x.id)} minWidth={760} rowTone={x => x.id === sel ? "accent" : undefined} empty="No completed courses yet" />
        </Card>
        <Stack gap={16}>
          {b && bc ? (
            <Card title="Certificate preview" right={<RecLink r={{ kind: "course", id: bc.id }} />}>
              <div className="ros-print" style={{ background: "#fff", color: "#1d2433", borderRadius: 14, padding: "26px 22px", boxShadow: "0 10px 30px rgba(0,0,0,.25)", textAlign: "center", border: "6px double #1B75BB" }}>
                <div style={{ fontSize: 11, letterSpacing: ".18em", color: "#1B75BB", fontWeight: 700 }}>RAY OF SUNSHINE TRAINING</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#060068", marginTop: 10 }}>Certificate of completion</div>
                <div style={{ fontSize: 12, color: "#4b5468", marginTop: 12 }}>This is to certify that</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: "#1d2433" }}>{b.name}</div>
                <div style={{ fontSize: 12.5, color: "#4b5468", marginTop: 8, lineHeight: 1.6 }}>completed {bc.name}<br />on {fmtDateY(bc.date)} at {bc.venue}</div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 20, fontSize: 11, color: "#4b5468", flexWrap: "wrap" }}>
                  <span>Trainer: {staffById(bc.trainerId)?.name}</span><span>No. {b.certificate || "to be issued"}</span><span>Renew by {fmtDateY(plusYears(bc.date, RENEW_YEARS))}</span>
                </div>
                <div style={{ fontSize: 9.5, color: "#6b7280", marginTop: 12 }}>Demo certificate. Not a QQI award.</div>
              </div>
              <Row wrap gap={8} style={{ marginTop: 12 }}>
                <Btn variant="primary" disabled={role.id === "parent"} onClick={() => issueCert({ bookingId: b.id })}>{b.certificate ? "Generate and email (simulated)" : "Issue certificate (simulated)"}</Btn>
                <Btn onClick={() => window.print()}>Print</Btn>
              </Row>
              {issued[b.id] && <div style={{ marginTop: 8 }}><Sub>Generated {rel(issued[b.id])} (simulated)</Sub></div>}
            </Card>
          ) : <Card><Empty title="Pick an attendee" body="Preview and generate their certificate." /></Card>}
          <Card title="Our own staff" sub="Manual handling certificates on staff records, soonest first. Book refreshers from the Bookings tab.">
            {staffMh.slice(0, 6).map(({ x, cert }) => {
              const d = daysBetween(TODAY, cert!.expires);
              return <ListRow key={x.id} onClick={() => openRecord({ kind: "staff", id: x.id })} title={x.name} sub={x.role + " · " + locById(x.locationId)?.short} right={<Badge tone={d < 0 ? "bad" : d <= 183 ? "warn" : "ok"}>{d < 0 ? "Expired" : "Ends " + fmtDate(cert!.expires) + " " + cert!.expires.slice(0, 4)}</Badge>} />;
            })}
            <Row style={{ marginTop: 8 }}><Btn size="sm" onClick={() => setTab("Training", "Bookings")}>Book refreshers</Btn></Row>
          </Card>
        </Stack>
      </div>
      <Card title="Renewal timeline" sub={"Manual handling is renewed every " + RENEW_YEARS + " years. Reminders go out 90 days before (simulated)."}>
        <Timeline items={past.map(c => ({ at: fmtDateY(c.date), title: c.name + " · " + bookingsFor(s, c.id).length + " attendees", detail: "Renewal reminders " + fmtDateY(addDays(plusYears(c.date, RENEW_YEARS), -90)) + " · renewals due " + fmtDateY(plusYears(c.date, RENEW_YEARS)), tone: "ok" as Tone }))
          .concat(upcoming.map(c => ({ at: fmtDateY(c.date), title: c.name + " · " + bookingsFor(s, c.id).length + " booked", detail: "Certificates issue after the course · renewals due " + fmtDateY(plusYears(c.date, RENEW_YEARS)), tone: "accent" as Tone })))} />
      </Card>
    </div>
  );
}

/* ================= Sales ================= */
function Sales() {
  const { s } = useRos();
  const rows = s.courses.slice().sort((a, b) => a.date.localeCompare(b.date)).map(c => {
    const b = bookingsFor(s, c.id);
    const paid = b.filter(x => x.paid && billable(x)).length, unpaid = b.filter(x => !x.paid && billable(x)).length, internal = b.filter(x => !billable(x)).length;
    return { c, booked: b.length, paid, unpaid, internal, revenue: round2(paid * c.price), outstanding: round2(unpaid * c.price), fill: b.length / c.capacity, corp: b.filter(x => x.company && billable(x)).length };
  });
  const rev = rows.reduce((n, r) => n + r.revenue, 0), out = rows.reduce((n, r) => n + r.outstanding, 0);
  const seats = rows.reduce((n, r) => n + r.booked, 0), cap = rows.reduce((n, r) => n + r.c.capacity, 0);
  const corpRev = s.courseBookings.filter(b => b.paid && b.company && billable(b)).reduce((n, b) => n + (s.courses.find(c => c.id === b.courseId)?.price || 0), 0);
  const indRev = rev - corpRev;
  type R = typeof rows[number];
  const cols: Col<R>[] = [
    { key: "c", label: "Course", w: "1.6fr", render: r => <Stack><RecLink r={{ kind: "course", id: r.c.id }} mono={false}>{fmtDay(r.c.date)} · {r.c.start}</RecLink><Sub>{r.c.name}</Sub></Stack> },
    { key: "f", label: "Fill", w: "1.2fr", sort: r => r.fill, render: r => <div style={{ width: "100%" }}><Row gap={6}><span style={{ fontSize: 12.5 }}>{r.booked}/{r.c.capacity}</span><Sub>{pct(r.fill)}</Sub></Row><Bar value={r.fill} max={1} tone={r.fill >= 0.8 ? "ok" : r.fill >= 0.5 ? "warn" : "bad"} /></div> },
    { key: "p", label: "Paid", w: ".6fr", align: "right", sort: r => r.paid, render: r => String(r.paid) },
    { key: "u", label: "Unpaid", w: ".6fr", align: "right", sort: r => r.unpaid, render: r => String(r.unpaid) },
    { key: "r", label: "Revenue", w: ".9fr", align: "right", sort: r => r.revenue, render: r => euro(r.revenue) },
    { key: "o", label: "To collect", w: ".9fr", align: "right", sort: r => r.outstanding, render: r => <span style={{ color: r.outstanding ? "var(--warn)" : "var(--ink)" }}>{euro(r.outstanding)}</span> },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Callout tone="info" title="Training revenue is its own line of business">Course revenue (paid places × course price) is reported here only. It is not included in childcare invoicing, collection rates, aged debt or NCS figures in Billing & Collections. Internal staff places are not charged.</Callout>
      <Grid min={170} gap={12}>
        <Kpi label="Course revenue (paid)" value={euro0(rev)} sub={rows.reduce((n, r) => n + r.paid, 0) + " paid places"} tone="ok" />
        <Kpi label="To collect" value={euro0(out)} sub={rows.reduce((n, r) => n + r.unpaid, 0) + " unpaid places"} tone={out ? "warn" : "ok"} onClick={() => setTab("Training", "Bookings")} />
        <Kpi label="Fill rate" value={pct(cap ? seats / cap : 0)} sub={seats + " of " + cap + " places, all sessions"} />
        <Kpi label="From employers" value={pct(rev ? corpRev / rev : 0)} sub={euro0(corpRev) + " of paid revenue"} tone="info" onClick={() => setTab("Training", "Corporate Groups")} />
      </Grid>
      <div className="ros-split-even">
        <Card title="Revenue by session" sub="Paid, with what is still to collect shown alongside.">
          <Columns height={130} format={euro0} data={rows.flatMap(r => [{ label: fmtDate(r.c.date), value: r.revenue, tone: "ok" as Tone, hint: "Paid " + euro(r.revenue) }, { label: "to collect", value: r.outstanding, tone: "warn" as Tone, hint: "To collect " + euro(r.outstanding) }])} />
        </Card>
        <Card title="Who pays" sub="Paid revenue by customer type.">
          <HBars format={euro0} items={[{ label: "Employers (group bookings)", value: corpRev, tone: "info" }, { label: "Individuals", value: indRev, tone: "ok" }, { label: "Our staff (internal, no charge)", value: 0, tone: "neutral", sub: rows.reduce((n, r) => n + r.internal, 0) + " places" }]} />
          <div style={{ marginTop: 12 }}><Label style={{ marginBottom: 8 }}>Fill rate by session</Label>
            <HBars format={(n) => pct(n)} max={1} items={rows.map(r => ({ label: fmtDay(r.c.date), value: r.fill, tone: (r.fill >= 0.8 ? "ok" : r.fill >= 0.5 ? "warn" : "bad") as Tone, onClick: () => nav("Training", "Bookings", { courseId: r.c.id }) }))} />
          </div>
        </Card>
      </div>
      <Card pad={false} title="By session">
        <Table rows={rows} cols={cols} rowKey={r => r.c.id} onRow={r => nav("Training", "Bookings", { courseId: r.c.id })} minWidth={760} />
        <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--faint)" }}>Demo prices. {euro(rev)} paid and {euro(out)} to collect across {rows.length} sessions.</div>
      </Card>
    </div>
  );
}
