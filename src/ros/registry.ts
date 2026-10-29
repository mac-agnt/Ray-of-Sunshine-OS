/* Navigation map for Ray of Sunshine OS. Pulse core pages (Home, Agents, Work,
   Records, Activity, Settings, Dashboard) keep their own screens; the modules
   below are added beside them. Role preview decides what each person sees. */
import type { RoleId } from "./types";

export interface ModuleDef { page: string; label: string; group: string; icon: string; tabs: string[]; roles: RoleId[]; hint?: string }

const STAFF: RoleId[] = ["owner", "ops", "accounts", "ncs", "locmgr", "practitioner"];
export const MODULES: ModuleDef[] = [
  { page: "Command", label: "Group Command Centre", group: "PULSE", icon: "navDash", tabs: ["Overview", "All Locations", "Cash & Debt", "Risks & Alerts", "Today's Timeline", "Decisions"], roles: ["owner", "ops", "accounts", "locmgr"] },
  { page: "Locations", label: "Locations", group: "CHILDCARE DELIVERY", icon: "locations", tabs: ["Overview", "Site Directory", "Rooms & Groups", "Attendance Status", "Capacity & Performance", "Map"], roles: ["owner", "ops", "locmgr", "practitioner"] },
  { page: "Families", label: "Families", group: "CHILDCARE DELIVERY", icon: "teams", tabs: ["Directory", "Family Profile", "Communications", "Billing & Documents", "Tasks"], roles: ["owner", "ops", "accounts", "ncs", "locmgr"] },
  { page: "Children", label: "Children", group: "CHILDCARE DELIVERY", icon: "people", tabs: ["Directory", "Child File", "Medical & Collectors", "Attendance", "Learning & Incidents"], roles: ["owner", "ops", "locmgr", "practitioner"] },
  { page: "Bookings", label: "Bookings & Attendance", group: "CHILDCARE DELIVERY", icon: "visits", tabs: ["Overview", "Weekly Calendar", "Window Control", "Late & Change Requests", "Registers", "Ratios", "Waitlists"], roles: ["owner", "ops", "accounts", "locmgr", "practitioner"] },
  { page: "Transport", label: "Transport & School Runs", group: "CHILDCARE DELIVERY", icon: "bus", tabs: ["Overview", "Routes & Vehicles", "Daily Manifests", "Driver Run", "Exceptions", "Fees"], roles: ["owner", "ops", "locmgr", "driver"] },
  { page: "EarlyYears", label: "Early Years", group: "CHILDCARE DELIVERY", icon: "sprout", tabs: ["Rooms", "Daily Diaries", "Learning Journals", "Weekly Planning", "Wellbeing Logs"], roles: ["owner", "ops", "locmgr", "practitioner"] },
  { page: "Camps", label: "Camps", group: "CHILDCARE DELIVERY", icon: "tent", tabs: ["Overview", "Camp Builder", "Registrations", "Staff & Registers", "Excursions", "Performance"], roles: ["owner", "ops", "accounts", "locmgr"] },
  { page: "Billing", label: "Billing & Collections", group: "COMMERCIAL & ADMIN", icon: "insights", tabs: ["Overview", "Invoices", "Payments & Reconciliation", "Reminder Stages", "Payment Plans", "Fee Rules", "Statements & Exports"], roles: ["owner", "ops", "accounts"] },
  { page: "NCS", label: "NCS & Funding", group: "COMMERCIAL & ADMIN", icon: "approvals", tabs: ["Overview", "CHICK Register", "Agreed Hours", "Claims & Acceptances", "Deadlines & Returns", "ECCE & AIM"], roles: ["owner", "ops", "accounts", "ncs"] },
  { page: "Enrolment", label: "Enrolment", group: "COMMERCIAL & ADMIN", icon: "enrol", tabs: ["Lead Pipeline", "Enquiries", "Waitlists", "Digital Registration", "Leavers"], roles: ["owner", "ops", "locmgr", "accounts"] },
  { page: "Comms", label: "Communications", group: "COMMERCIAL & ADMIN", icon: "inbox", tabs: ["Unified Inbox", "AI Drafts", "Broadcasts", "Templates", "Family History"], roles: ["owner", "ops", "accounts", "ncs", "locmgr"] },
  { page: "Automations", label: "Automations & Follow-ups", group: "COMMERCIAL & ADMIN", icon: "autos", tabs: ["Overview", "Sequences", "Scheduled Runs", "Exceptions", "Templates", "Results"], roles: ["owner", "ops", "accounts", "ncs"] },
  { page: "Training", label: "Training Courses", group: "COMMERCIAL & ADMIN", icon: "cert", tabs: ["Calendar", "Bookings", "Corporate Groups", "Certificates", "Sales"], roles: ["owner", "ops", "accounts"] },
  { page: "Staff", label: "Staff & HR", group: "PEOPLE, COMPLIANCE & INTELLIGENCE", icon: "staff", tabs: ["Directory", "Rota", "Absence & Relief", "Certifications", "Timesheets", "Recruitment", "Training"], roles: ["owner", "ops", "locmgr"] },
  { page: "Compliance", label: "Compliance & Safeguarding", group: "PEOPLE, COMPLIANCE & INTELLIGENCE", icon: "shield", tabs: ["Overview", "Incidents", "Medication", "Site Logs", "Policies", "Safeguarding", "Audit Access"], roles: ["owner", "ops", "locmgr", "practitioner"] },
  { page: "Reports", label: "Reports", group: "PEOPLE, COMPLIANCE & INTELLIGENCE", icon: "reports", tabs: ["Executive", "Operations", "Finance", "NCS", "Staff & Compliance", "Exports"], roles: ["owner", "ops", "accounts", "ncs"] },
  { page: "Parent", label: "MyRosKids", group: "PARENT", icon: "heart", tabs: ["Home", "Book", "Payments", "Child Updates", "Messages", "Documents"], roles: ["parent"] },
];

/* Pulse core pages and who may open them in role preview. */
export const CORE_ROLES: Record<string, RoleId[]> = {
  Home: STAFF, Agents: ["owner", "ops", "accounts", "ncs", "locmgr"], Dashboard: ["owner", "ops", "accounts"],
  Work: STAFF, Records: ["owner", "ops", "locmgr"], Activity: ["owner", "ops", "accounts", "ncs", "locmgr"], Settings: ["owner", "ops"],
};
/* Extra top-bar tabs for the adapted Pulse pages (the page keeps its own first view). */
export const CORE_TABS: Record<string, string[]> = {
  Agents: ["Conversations", "Agent Directory", "Agent Details", "Approvals", "Run History", "Morning Brief"],
};

export const moduleOf = (page: string) => MODULES.find(m => m.page === page);
export const isRosPage = (page: string) => !!moduleOf(page);
export function canSee(page: string, role: RoleId) {
  const m = moduleOf(page);
  if (m) return m.roles.includes(role);
  return (CORE_ROLES[page] || STAFF).includes(role);
}
/** Where each role lands when it is switched to. */
export const ROLE_HOME: Record<RoleId, { page: string; tab?: string }> = {
  owner: { page: "Home" }, ops: { page: "Command" }, accounts: { page: "Billing", tab: "Overview" }, ncs: { page: "NCS", tab: "Overview" },
  locmgr: { page: "Locations", tab: "Overview" }, practitioner: { page: "EarlyYears", tab: "Rooms" }, driver: { page: "Transport", tab: "Driver Run" }, parent: { page: "Parent", tab: "Home" },
};
