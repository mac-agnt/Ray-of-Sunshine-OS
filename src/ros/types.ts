/* Ray of Sunshine OS: one typed model for every module. Every screen derives
   from these records through selectors, so a count on one page can never
   disagree with the table behind it on another. All people are fictional. */

export type ISODate = string; // "2026-10-20"
export type HHMM = string;    // "15:04"

export type LocationId = "HAZ" | "BRK" | "ARC" | "ARR" | "BKD" | "GOR" | "CAN" | "DUN" | "BMN";
export type Service = "EY" | "SAC" | "CAMPS" | "TRANSPORT" | "ADMIN" | "TRAINING";
export type Region = "Wicklow" | "Arklow" | "Wexford" | "Cork" | "Waterford" | "Dublin";
export type RoleId = "owner" | "ops" | "accounts" | "ncs" | "locmgr" | "practitioner" | "driver" | "parent";

export type RefKind =
  | "family" | "child" | "invoice" | "staff" | "location" | "request" | "claim" | "award"
  | "route" | "plan" | "incident" | "enquiry" | "camp" | "course" | "message" | "task"
  | "approval" | "automation" | "agent" | "booking" | "issue" | "waitlist" | "school" | "payment";
export type Ref = { kind: RefKind; id: string };

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "accent" | "brand";

export interface Location {
  id: LocationId; name: string; short: string; town: string; county: string; region: Region;
  services: Service[]; isHQ: boolean; managerId: string; eircode?: string;
  sacCapacity: number; lon: number; lat: number;
  hourlyRate: number;      // SAC €/hour, demo only
  eyDayRate: number;       // EY €/day, demo only
}

export interface Room {
  id: string; locationId: LocationId; name: string;
  kind: "Crèche" | "Preschool Junior" | "Preschool Senior (ECCE)" | "SAC";
  ageBand: string; capacity: number; ratio: number; // children per adult (demo config)
}

export interface School { id: string; name: string; region: Region; locationId: LocationId }

export type CertKind = "Garda vetting" | "First aid" | "Children First" | "Manual handling" | "Safe driving" | "Food safety";
export interface Cert { kind: CertKind; expires: ISODate }

export type StaffRole =
  | "Owner" | "Operations Manager" | "Accounts" | "NCS Administrator" | "HR & Admin" | "Trainer"
  | "Location Manager" | "Room Leader" | "Practitioner" | "SAC Leader" | "SAC Practitioner"
  | "Relief Practitioner" | "Driver" | "Escort";

export interface Staff {
  id: string; name: string; initials: string; role: StaffRole; locationId: LocationId;
  contractHours: number; qualification: string; email: string; irish: boolean;
  certs: Cert[]; startDate: ISODate; hourlyCost: number; // proxy only, demo
  status: "active" | "absent" | "leave";
}

export interface Shift {
  id: string; staffId: string; locationId: LocationId; date: ISODate;
  session: "Morning" | "After School" | "Full Day";
  roomId?: string; start: HHMM; end: HHMM; status: "rostered" | "approved" | "proposed"; relief?: boolean;
}

export interface Guardian { name: string; relation: string; email: string; phone: string; primary: boolean }

export interface Family {
  id: string; surname: string; guardians: Guardian[]; childIds: string[]; locationId: LocationId;
  funding: "NCS" | "Private"; method: "Card on file" | "SEPA direct debit" | "Bank transfer" | "Card by phone";
  language: "English" | "Irish" | "Polish" | "Portuguese" | "Ukrainian";
  channel: "App" | "Email" | "SMS"; consentsComplete: boolean; blocked: boolean;
  flags: string[]; notes: string; joined: ISODate;
}

export interface Collector { name: string; relation: string; permitted: boolean; note?: string }
export interface MedicalFlag { kind: "Allergy" | "Asthma" | "Epilepsy" | "Diabetes" | "Eczema" | "Dietary"; detail: string; severity: "Info" | "Moderate" | "Severe" }

export interface Child {
  id: string; firstName: string; surname: string; familyId: string; dob: ISODate; age: number;
  locationId: LocationId; programme: "EY" | "SAC"; roomId: string; schoolId?: string; schoolClass?: string;
  keyWorkerId: string; medical: MedicalFlag[]; medication?: { name: string; expires: ISODate; stored: string };
  collectors: Collector[]; consents: { photos: boolean; transport: boolean; outings: boolean; sunscreen: boolean };
  supports?: string; awardId?: string; routeId?: string; started: ISODate;
}

export interface NCSAward {
  id: string; childId: string; familyId: string; chick: string; type: "Income assessed" | "Universal";
  agreedHours: number; rate: number; lastChange: ISODate; nextChange: ISODate; expires: ISODate;
  status: "Active" | "Expiring" | "Expired";
}

export interface NCSClaim {
  id: string; awardId: string; familyId: string; childId: string; period: string; hours: number; amount: number;
  status: "Awaiting acceptance" | "Accepted" | "Lapsed"; deadline: string; // "2026-10-20 17:00"
  raised: ISODate; reminders: { day: number; at: string; channel: string }[];
}

export type Session = "Morning" | "After School" | "Full Day" | "Camp";
export interface Booking {
  id: string; childId: string; familyId: string; locationId: LocationId; date: ISODate; session: Session;
  start: HHMM; end: HHMM; hours: number; funding: "NCS" | "Private"; routeId?: string; schoolId?: string;
  roomId?: string; status: "Booked" | "Cancelled"; source: "Parent app" | "Late request" | "Change request" | "Staff" | "Camp";
}

export interface WindowSubmission { familyId: string; submittedAt: string; sessions: number; hours: number }
export interface BookingWindow {
  id: string; weekOf: ISODate; label: string; opens: string; closes: string;
  status: "Locked" | "Open" | "Scheduled"; submissions: WindowSubmission[];
}

export interface FeeLine { label: string; qty: number; rate: number; amount: number }
export interface BookingRequest {
  id: string; kind: "Late booking" | "Change" | "Cancellation"; familyId: string; childId: string;
  locationId: LocationId; date: ISODate; session: Session; start: HHMM; end: HHMM;
  schoolId?: string; routeId?: string; bookingId?: string; // existing booking for change/cancel
  received: string; channel: "Parent app" | "Email" | "Website form" | "Phone";
  status: "Pending" | "Approved" | "Declined"; note: string; fees: FeeLine[];
  decidedBy?: string; decidedAt?: string; messageId?: string;
}

export type AttendanceKind = "in" | "out" | "boarded" | "absent" | "not-present";
export interface AttendanceEvent {
  id: string; childId: string; date: ISODate; kind: AttendanceKind; time: HHMM; by: string;
  collector?: string; routeId?: string; note?: string;
}

export interface Vehicle { id: string; reg: string; seats: number; kind: string }
export interface RouteStop { schoolId: string; time: HHMM }
export interface Route {
  id: string; name: string; locationId: LocationId; vehicleId: string; driverId: string; escortId?: string;
  stops: RouteStop[]; feePerRun: number;
}

export type InvoiceLineKind = "Session" | "Transport" | "Late booking fee" | "Late collection" | "Camp" | "NCS subsidy" | "Credit" | "Re-enrolment";
export interface InvoiceLine {
  id: string; kind: InvoiceLineKind; label: string; childId?: string; date?: ISODate;
  qty: number; rate: number; amount: number; bookingId?: string; addedBy?: string;
}
export interface Invoice {
  id: string; familyId: string; weekOf: ISODate; issued: ISODate; due: ISODate;
  lines: InvoiceLine[]; planId?: string; note?: string;
}

export interface Payment {
  id: string; familyId: string; invoiceId?: string; planId?: string; date: ISODate; amount: number;
  method: string; status: "Succeeded" | "Failed" | "Pending"; ref: string; retry?: string;
}

export interface Instalment { n: number; due: ISODate; amount: number; status: "Paid" | "Missed" | "Due" | "Scheduled" }
export interface PaymentPlan {
  id: string; familyId: string; total: number; revision: number; maxRevisions: number;
  status: "Active" | "Broken" | "Completed"; esign: "Signed" | "Sent" | "Not sent";
  instalments: Instalment[]; started: ISODate; nextAction: string; owner: string;
}

export interface BankLine {
  id: string; date: ISODate; amount: number; ref: string; payer: string;
  suggestion?: { invoiceId: string; confidence: "Exact" | "Ambiguous"; reason: string; alternatives?: string[] };
  status: "Suggested" | "Matched" | "Unmatched" | "Ignored";
}

export type EnquiryStage = "New enquiry" | "Contacted" | "Visit booked" | "Offered" | "Registration sent" | "Enrolled" | "Started";
export interface Enquiry {
  id: string; parent: string; children: string; service: "Early Years" | "SAC" | "Camps"; locationId: LocationId;
  source: "Website" | "Facebook" | "Phone" | "Walk-in" | "Referral"; stage: EnquiryStage; owner: string;
  received: ISODate; nextFollowUp: ISODate; note: string; startWanted: string; sibling: boolean;
}

export interface WaitlistEntry {
  id: string; childName: string; parent: string; locationId: LocationId; service: "Early Years" | "SAC";
  room: string; requestedStart: ISODate; added: ISODate; priority: "Sibling" | "Staff" | "Standard";
  status: "Waiting" | "Offered" | "Accepted" | "Declined"; days: string;
}

export interface Message {
  id: string; queue: "General" | "Accounts" | "NCS" | "Wicklow" | "Arklow" | "Wexford" | "Cork" | "Waterford" | "Dublin" | "Parent app" | "Website form";
  familyId?: string; from: string; subject: string; body: string; received: string;
  classification: string; confidence: number; status: "New" | "Drafted" | "Replied" | "Escalated" | "Closed";
  draft?: string; tone?: string; link?: Ref; direction: "in" | "out"; channel: "Email" | "App" | "SMS" | "Web form" | "WhatsApp" | "Phone";
}

export interface CommEvent { id: string; familyId: string; at: string; channel: string; direction: "in" | "out" | "note"; summary: string; by: string }

export interface AutomationRun { at: string; result: "ok" | "partial" | "failed"; summary: string }
export interface AutomationRule {
  id: string; name: string; group: string; trigger: string; timing: string; audience: string; channels: string[];
  owner: string; approval: "Automatic" | "Approval required" | "Draft only"; on: boolean;
  delivered: number; opened: number; actioned: number; runs: AutomationRun[];
}

export interface Task {
  id: string; title: string; owner: string; due: string; dueDate: ISODate; priority: "High" | "Medium" | "Low";
  department: "Operations" | "Accounts" | "NCS" | "Transport" | "HR" | "Compliance" | "Enrolment" | "Early Years" | "Owner";
  status: "Not started" | "In progress" | "Review" | "Done"; link?: Ref; source: string; locationId?: LocationId;
}

export type ApprovalKind =
  | "Relief shift" | "Booking block" | "Debt collection pack" | "NCS private-charge proposal" | "Credit adjustment"
  | "Incident notification" | "Ratio cover" | "Payment plan revision" | "Closure broadcast" | "Late booking";
export interface Approval {
  id: string; kind: ApprovalKind; title: string; summary: string; requestedBy: string; requestedAt: string;
  ownerRole: RoleId; status: "Pending" | "Approved" | "Declined"; link?: Ref; amount?: number;
  decidedBy?: string; decidedAt?: string; effect: string; agentId?: string;
}

export interface Incident {
  id: string; childId: string; locationId: LocationId; date: ISODate; time: HHMM; kind: string;
  severity: "Minor" | "Moderate" | "Notifiable"; summary: string; witnesses: string[];
  parentNotified: boolean; parentSigned: boolean; managerReviewed: boolean; status: "Open" | "Awaiting signature" | "Closed";
}

export interface SiteCheck { id: string; locationId: LocationId; kind: string; due: ISODate; done: boolean; by?: string }
export interface Policy { id: string; name: string; version: string; updated: ISODate; acknowledged: number; required: number }

export interface Camp {
  id: string; name: string; locationId: LocationId; start: ISODate; end: ISODate; ages: string;
  themes: string[]; capacity: number; dayRate: number; ncsEligible: boolean; staffIds: string[];
  excursion?: { day: ISODate; where: string; consentNeeded: boolean };
  season: string; past?: { booked: number; revenue: number }; // completed camps keep their totals
}
export interface CampRegistration {
  id: string; campId: string; childId: string; familyId: string; days: number;
  paid: boolean; ncsHours: number; status: "Confirmed" | "Waitlist" | "Pending payment";
}

export interface Course {
  id: string; name: string; date: ISODate; start: HHMM; venue: string; capacity: number; trainerId: string; price: number;
}
export interface CourseBooking {
  id: string; courseId: string; name: string; company?: string; email: string; paid: boolean;
  status: "Booked" | "Reserved" | "Attended" | "Certified"; certificate?: string;
}

export interface DiaryEntry {
  id: string; childId: string; date: ISODate; roomId: string; meals: string; sleep: string; nappies: string;
  mood: string; activity: string; note: string; observation?: { text: string; tags: string[] };
  status: "Draft" | "Ready for review" | "Published"; author: string;
}

export interface Issue {
  id: string; kind: "Ratio" | "Missing child" | "Transport delay"; locationId: LocationId; date: ISODate;
  session: Session | "Room"; title: string; detail: string; status: "Open" | "Resolved";
  booked?: number; rostered?: number; required?: number; offerStaffIds?: string[]; resolvedBy?: string; resolvedAt?: string;
}

export interface AgentAction { id: string; agentId: string; at: string; text: string; link?: Ref; kind: "run" | "proposal" | "action" | "escalation" }

export interface ActivityEvent {
  id: string; seq: number; at: string; actor: string; actorKind: "person" | "agent" | "system";
  category: "Operations" | "Financial" | "NCS" | "Transport" | "Safeguarding" | "Communications" | "Staffing" | "Enrolment" | "System";
  title: string; detail: string; link?: Ref; locationId?: LocationId;
}

export interface RosState {
  seq: number;
  clockMin: number;
  locations: Location[]; rooms: Room[]; schools: School[];
  staff: Staff[]; shifts: Shift[]; absences: { staffId: string; date: ISODate; reason: string; reported: string }[];
  families: Family[]; children: Child[];
  awards: NCSAward[]; claims: NCSClaim[];
  bookings: Booking[]; windows: BookingWindow[]; requests: BookingRequest[];
  attendance: AttendanceEvent[];
  vehicles: Vehicle[]; routes: Route[];
  invoices: Invoice[]; payments: Payment[]; plans: PaymentPlan[]; bank: BankLine[];
  enquiries: Enquiry[]; waitlist: WaitlistEntry[];
  messages: Message[]; comms: CommEvent[];
  automations: AutomationRule[];
  tasks: Task[]; approvals: Approval[];
  incidents: Incident[]; checks: SiteCheck[]; policies: Policy[];
  camps: Camp[]; campRegs: CampRegistration[];
  courses: Course[]; courseBookings: CourseBooking[];
  diary: DiaryEntry[];
  issues: Issue[];
  agentActions: AgentAction[];
  activity: ActivityEvent[];
  config: {
    sacRatio: number; lateFee: number; transportFee: number; noticeHours: number; lateCollectionPer15: number;
    reminderDays: number[]; blockDay: number; phoneDay: number; planMaxRevisions: number;
    ncsChangeWeeks: number; claimDays: number; leavingNoticeMonths: number; ncsLeaveNoticeWeeks: number;
  };
}
