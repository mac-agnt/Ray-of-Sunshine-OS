/* The agent catalogue: specific jobs with stated triggers, inputs, limits and
   approval rules. Briefing and Ops Watchdog are the familiar Pulse core
   agents; the rest are childcare specialisations. Time-saved figures are
   illustrative estimates, labelled as such wherever they appear. */
export interface AgentDef {
  id: string; name: string; shape: string; tint: string; state: "working" | "thinking" | "waiting" | "complete" | "attention" | "idle";
  purpose: string; owner: string; triggers: string[]; inputs: string[]; actions: string[]; thresholds: string[];
  approval: string; minsSavedWeek: number; page: string; tab?: string; core?: boolean;
}

export const AGENTS: AgentDef[] = [
  { id: "briefing", name: "Owner Briefing", shape: "crown-pebble", tint: "#191c3a", state: "complete", core: true, page: "Command", tab: "Decisions",
    purpose: "Reads all nine locations at 08:45 and gives Amanda the few decisions that matter, plus the Friday nine-location report.",
    owner: "Amanda Spiteri", triggers: ["Weekdays 08:45", "Fridays 16:00 (weekly report)"], inputs: ["Ratio alerts", "Approvals", "NCS claims", "Overdue invoices", "Incidents", "Camp fill"],
    actions: ["Writes the Morning Brief", "Links every item to its source record"], thresholds: ["Only items needing a decision today or a risk inside 48h"], approval: "Read only. Proposes; never acts.", minsSavedWeek: 150 },
  { id: "ops", name: "Ops Watchdog", shape: "shield", tint: "#2b1b2e", state: "attention", core: true, page: "Command", tab: "Risks & Alerts",
    purpose: "Watches ratio forecasts, late bookings, missing-child reports, failed processes and the exception queue across every site.",
    owner: "Deirdre Kinsella", triggers: ["Every 5 minutes", "Any exception event"], inputs: ["Rota", "Bookings", "Manifests", "Automation runs", "Weather feed (demo)"],
    actions: ["Raises alerts", "Opens tasks", "Proposes closure messages (owner approval)"], thresholds: ["Ratio below demo threshold", "Child not at pickup", "Process failed twice"], approval: "Child-safety events always go to a person. Cannot resolve them.", minsSavedWeek: 120 },
  { id: "sunny", name: "Sunny · Parent Assistant", shape: "low-dome", tint: "#3a3410", state: "working", page: "Comms", tab: "Unified Inbox",
    purpose: "Answers parents in MyRosKids about balances, booking status, bus status and policies. Creates cases and routes anything sensitive to staff.",
    owner: "Deirdre Kinsella", triggers: ["Parent asks a question"], inputs: ["Own family's bookings, invoices, attendance", "Published policies"], actions: ["Answers", "Creates a case", "Hands off to staff"],
    thresholds: ["Medical, safeguarding, disputes and complaints always go to a person"], approval: "No changes to records without staff.", minsSavedWeek: 210 },
  { id: "inbox", name: "Inbox", shape: "offset-pebble", tint: "#18263a", state: "working", page: "Comms", tab: "Unified Inbox",
    purpose: "Classifies every inbound message, matches the ROS Parent ID, drafts the reply and escalates what it should not answer.",
    owner: "Deirdre Kinsella", triggers: ["New message in any queue"], inputs: ["General, Accounts, NCS and regional queues", "Parent app", "Website form"], actions: ["Classify", "Match family", "Draft reply", "Escalate"],
    thresholds: ["Confidence below 75% goes to a person", "No Parent ID: ask for it"], approval: "Drafts only. A person sends.", minsSavedWeek: 300 },
  { id: "bookings", name: "Bookings", shape: "rim-capsule", tint: "#1b2430", state: "working", page: "Bookings", tab: "Late & Change Requests",
    purpose: "Runs the weekly window, sends reminders, checks capacity and ratio for late and change requests, and offers freed places to the waitlist.",
    owner: "Siobhán Keogh", triggers: ["Window open/close", "Late, change or cancellation request"], inputs: ["Bookings", "Capacity", "Rota", "Fee rules"], actions: ["Checks policy, capacity and ratio", "Prepares the fee lines", "Writes booking, invoice, register and manifest on approval"],
    thresholds: ["24h weekday notice", "No weekend processing", "Ratio must hold"], approval: "Every late booking, change and cancellation is approved by staff.", minsSavedWeek: 240 },
  { id: "collections", name: "Collections", shape: "executive-capsule", tint: "#2a2118", state: "waiting", page: "Billing", tab: "Reminder Stages",
    purpose: "Generates invoices, runs Day 0/2/5/7 reminders, suggests bank matches, monitors payment plans and prepares (never sends) debt escalations.",
    owner: "Gráinne Whelan", triggers: ["Invoice issued", "Payment failed", "Bank feed", "Plan instalment due"], inputs: ["Invoices", "Payments", "Bank lines", "Plans"], actions: ["Reminders", "Match suggestions", "Block candidates", "Debt pack drafts"],
    thresholds: ["Day 10: booking-block candidate (Accounts approval)", "Plans: max 3 revisions", "Third breach: owner decision"], approval: "Blocks and escalations need Accounts or owner approval.", minsSavedWeek: 330 },
  { id: "ncs", name: "NCS", shape: "control-cube", tint: "#16241f", state: "waiting", page: "NCS", tab: "Overview",
    purpose: "Tracks CHICK expiries, agreed vs booked hours, the 8-week change rule, Thursday deadlines and claim acceptance, and prepares (never submits) returns.",
    owner: "Lorraine Tobin", triggers: ["Daily 08:00", "Claim raised", "Window submissions"], inputs: ["Awards", "Claims", "Bookings", "Window submissions"], actions: ["Reminders (Days 2/4/6)", "Under-booked drafts", "Private-charge proposals"],
    thresholds: ["Claim lapses after 7 days", "CHICK by Thursday before the week", "8-week hours change rule"], approval: "Any change to what a family is charged needs NCS admin approval.", minsSavedWeek: 270 },
  { id: "rota", name: "Ratio & Rota", shape: "glass-visor", tint: "#1d2440", state: "attention", page: "Staff", tab: "Absence & Relief",
    purpose: "Forecasts required staff from bookings at the configured demo ratios, blocks expired certificates from the rota, and proposes qualified cover.",
    owner: "Deirdre Kinsella", triggers: ["Booking change", "Absence logged", "Daily 07:00"], inputs: ["Bookings", "Rota", "Certificates", "Absences"], actions: ["Ratio forecast", "Relief proposals", "Rota blocks"],
    thresholds: ["SAC 1:10, Crèche 1:5, Preschool 1:6 / 1:8 (illustrative)", "Garda vetting must be current"], approval: "Relief shifts need operations or location manager approval.", minsSavedWeek: 180 },
  { id: "transport", name: "Transport", shape: "wide-eyed", tint: "#20302a", state: "working", page: "Transport", tab: "Daily Manifests",
    purpose: "Builds daily manifests from accepted bookings, tracks boarding and arrivals, and raises pickup exceptions.",
    owner: "Siobhán Keogh", triggers: ["06:30 daily build", "Booking approved", "Driver event"], inputs: ["Bookings", "Routes", "Collector permissions"], actions: ["Manifests", "Parent notifications (simulated)", "Exceptions"],
    thresholds: ["A missing child is never auto-resolved"], approval: "Child-safety exceptions always go to a person.", minsSavedWeek: 150 },
  { id: "enrolment", name: "Enrolment", shape: "soft-asymmetric", tint: "#2a1f33", state: "working", page: "Enrolment", tab: "Lead Pipeline",
    purpose: "Works the enquiry pipeline, books visits, chases registration documents and offers waitlist places.",
    owner: "Siobhán Keogh", triggers: ["New enquiry", "Day 1/3/7/14 follow-ups", "Place freed"], inputs: ["Enquiries", "Waitlists", "Capacity"], actions: ["Follow-up drafts", "Visit invites", "Waitlist offers"],
    thresholds: ["Siblings first, then date added"], approval: "Offers and messages are drafts until a manager sends them.", minsSavedWeek: 120 },
  { id: "diary", name: "Daily Diary", shape: "tall-unit", tint: "#2b2a14", state: "working", page: "EarlyYears", tab: "Daily Diaries",
    purpose: "Turns practitioner notes into daily diary drafts and Aistear/Síolta-tagged observations.",
    owner: "Siobhán Keogh", triggers: ["Practitioner note", "15:30 daily"], inputs: ["Room notes", "Meals, sleep, nappies", "Photos (mock)"], actions: ["Diary drafts", "Observation tags"],
    thresholds: ["Never publishes"], approval: "A practitioner reviews and publishes every entry.", minsSavedWeek: 360 },
  { id: "compliance", name: "Compliance", shape: "precision-brow", tint: "#30201c", state: "waiting", page: "Compliance", tab: "Overview",
    purpose: "Tracks certificates, incomplete documents, incidents and inspection tasks.",
    owner: "Orla Dempsey", triggers: ["Daily 07:00", "Incident logged", "Document expiring"], inputs: ["Certificates", "Incidents", "Medication logs", "Site checks"], actions: ["Reminders", "Tasks", "Readiness checklist"],
    thresholds: ["Certificates at 60/30/7 days", "Incidents signed within 24h"], approval: "Incident outcomes and notifications need a manager.", minsSavedWeek: 140 },
  { id: "camps", name: "Camps", shape: "crown-pebble", tint: "#2e2214", state: "working", page: "Camps", tab: "Overview",
    purpose: "Watches camp fill, unpaid places, registers and excursion consents.",
    owner: "Tara Breen", triggers: ["Registration", "Place unpaid 48h", "7 days before camp"], inputs: ["Camps", "Registrations", "Consents", "Staffing"], actions: ["Unpaid place reminders", "Register build", "Consent chase"],
    thresholds: ["Release unpaid places after 72h (approval)"], approval: "Releasing a paid or unpaid place needs a manager.", minsSavedWeek: 90 },
];
export const agentById = (id: string) => AGENTS.find(a => a.id === id);
