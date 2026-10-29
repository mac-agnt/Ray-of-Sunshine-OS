/* Deterministic seed for the Ray of Sunshine demo. The same seed always
   produces the same 650 children, 480 families and 100 staff, so story
   fixtures, counts and amounts agree on every screen and every reload.
   Everyone here is fictional; no real child or family data is used. */
import type {
  RosState, Location, Room, School, Staff, Shift, Family, Child, NCSAward, NCSClaim, Booking, BookingWindow,
  BookingRequest, AttendanceEvent, Vehicle, Route, Invoice, InvoiceLine, Payment, PaymentPlan, BankLine, Enquiry,
  WaitlistEntry, Message, CommEvent, AutomationRule, Task, Approval, Incident, SiteCheck, Policy, Camp,
  CampRegistration, Course, CourseBooking, DiaryEntry, Issue, AgentAction, ActivityEvent, LocationId, Cert,
  StaffRole, Session, MedicalFlag, Collector, Region, EnquiryStage, CertKind
} from "./types";
import { TODAY, THIS_WEEK, addDays, round2 } from "./time";

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_F = ["Aoife","Saoirse","Ella","Grace","Emily","Fiadh","Caoimhe","Sadhbh","Sophie","Ava","Mia","Isla","Ruby","Lily","Hannah","Róisín","Clodagh","Éabha","Molly","Zoe","Kate","Erin","Holly","Chloe","Amelia","Ciara","Orla","Ailbhe","Bláthnaid","Nora","Lucy","Freya","Anna","Evie","Ellie","Robyn","Leah","Alannah","Maeve","Niamh","Aisling","Síofra","Muireann","Lauren","Julia","Zofia","Maja","Olena","Beatriz","Rosie"];
const FIRST_M = ["Luca","Finn","Oisín","Cian","Jack","Noah","Conor","Liam","Darragh","Tadhg","Seán","James","Daniel","Rían","Oliver","Charlie","Cillian","Ronan","Eoin","Harry","Alex","Leo","Max","Tom","Jamie","Evan","Adam","Ben","Luke","Fionn","Senan","Odhrán","Patrick","Michael","Dylan","Aaron","Shane","Kian","Rory","Mason","Jakub","Oskar","Mateo","Bohdan","Thomas","Ethan","Cathal","Colm","Donnacha","Ruairí"];
const ADULT_F = ["Sinéad","Rachel","Emer","Lisa","Siobhán","Niamh","Deirdre","Claire","Louise","Gillian","Michelle","Karen","Sarah","Laura","Aoibheann","Jennifer","Orla","Fiona","Catherine","Marie","Tríona","Aine","Paula","Yvonne","Gemma","Edel","Sharon","Nicola","Anna","Katarzyna","Olga","Ana"];
const ADULT_M = ["Mark","Ciarán","Stephen","Brian","Declan","David","Kevin","Paul","John","Alan","Colm","Eoin","Barry","Gavin","Niall","Darren","Shane","Gary","Richard","Tomasz","Andrii","Rui","Peter","Damien","Ronan","Enda","Fergal","Keith","Noel","Sean"];
const SURNAMES = ["Murphy","O'Sullivan","Walsh","Smith","O'Brien","Ryan","O'Connor","O'Reilly","McCarthy","Gallagher","Doherty","Kennedy","Lynch","Murray","Quinn","Moore","McLoughlin","Carroll","Connolly","Daly","Wilson","Dunne","Brennan","Burke","Collins","Campbell","Clarke","Hughes","Farrell","Fitzgerald","Martin","Maguire","Flynn","Callaghan","O'Donnell","Duffy","Boyle","Healy","Sweeney","Hayes","Kavanagh","Power","McGrath","Moran","Brady","Casey","Foley","Fitzpatrick","O'Leary","Donnelly","Regan","Donovan","Flanagan","Barry","Kane","Cunningham","Griffin","Kenny","Sheehan","Ward","Whelan","Lyons","Reid","Higgins","Cullen","Keane","King","Maher","McKenna","Scott","Hogan","O'Keeffe","Magee","McNamara","Tierney","Kinsella","Furlong","Redmond","Kehoe","Doran","Mulligan","Nowak","Kowalski","Silva","Shevchenko","Molloy","Lawless","Breen","Cash","Devlin","Keogh","Tobin","Hennessy","Mulvey","Dempsey","Corcoran","Quirke","Murtagh","Rooney"];

const LOCS: Location[] = [
  { id: "HAZ", name: "Hazelbrook (HQ)", short: "Hazelbrook", town: "Rathnew", county: "Wicklow", region: "Wicklow", services: ["EY", "SAC", "TRANSPORT", "ADMIN", "TRAINING"], isHQ: true, managerId: "S010", eircode: "A67 HX39", sacCapacity: 64, lon: -6.07, lat: 53.0, hourlyRate: 15, eyDayRate: 58 },
  { id: "BRK", name: "Brookfield", short: "Brookfield", town: "Wicklow Town", county: "Wicklow", region: "Wicklow", services: ["SAC", "TRANSPORT"], isHQ: false, managerId: "S011", sacCapacity: 45, lon: -6.04, lat: 52.97, hourlyRate: 15, eyDayRate: 0 },
  { id: "ARC", name: "Arklow Crèche", short: "Arklow Crèche", town: "Arklow", county: "Wicklow", region: "Arklow", services: ["EY", "SAC", "TRANSPORT"], isHQ: false, managerId: "S012", sacCapacity: 30, lon: -6.17, lat: 52.81, hourlyRate: 15, eyDayRate: 56 },
  { id: "ARR", name: "Arklow Rocks", short: "Arklow Rocks", town: "Arklow", county: "Wicklow", region: "Arklow", services: ["SAC", "TRANSPORT"], isHQ: false, managerId: "S013", sacCapacity: 30, lon: -6.13, lat: 52.785, hourlyRate: 15, eyDayRate: 0 },
  { id: "BKD", name: "Burkeen Dales", short: "Burkeen Dales", town: "Arklow", county: "Wicklow", region: "Arklow", services: ["SAC"], isHQ: false, managerId: "S014", sacCapacity: 32, lon: -6.19, lat: 52.795, hourlyRate: 15, eyDayRate: 0 },
  { id: "GOR", name: "Gorey", short: "Gorey", town: "Gorey", county: "Wexford", region: "Wexford", services: ["SAC", "CAMPS", "TRANSPORT"], isHQ: false, managerId: "S015", sacCapacity: 48, lon: -6.29, lat: 52.675, hourlyRate: 14, eyDayRate: 0 },
  { id: "CAN", name: "Canovee", short: "Canovee", town: "Canovee", county: "Cork", region: "Cork", services: ["SAC", "CAMPS", "TRANSPORT"], isHQ: false, managerId: "S016", sacCapacity: 40, lon: -8.85, lat: 51.89, hourlyRate: 13.5, eyDayRate: 0 },
  { id: "DUN", name: "Dungarvan", short: "Dungarvan", town: "Dungarvan", county: "Waterford", region: "Waterford", services: ["SAC"], isHQ: false, managerId: "S017", sacCapacity: 42, lon: -7.62, lat: 52.09, hourlyRate: 13, eyDayRate: 0 },
  { id: "BMN", name: "Ballymun", short: "Ballymun", town: "Ballymun", county: "Dublin", region: "Dublin", services: ["SAC"], isHQ: false, managerId: "S018", sacCapacity: 42, lon: -6.27, lat: 53.4, hourlyRate: 15.5, eyDayRate: 0 },
];

const SCHOOL_DEFS: [string, Region, LocationId][] = [
  ["St Patrick's NS", "Wicklow", "HAZ"], ["Holy Rosary and Bethlehem", "Wicklow", "HAZ"], ["The Glebe NS Church Hill", "Wicklow", "BRK"],
  ["Gaelscoil Chill Mhantáin", "Wicklow", "BRK"], ["St Coen's NS", "Wicklow", "HAZ"], ["Wicklow Educate Together", "Wicklow", "BRK"],
  ["Wicklow Montessori", "Wicklow", "BRK"], ["Scoil na Coróine Mhuire Ashford", "Wicklow", "HAZ"], ["Nuns Cross Ashford", "Wicklow", "HAZ"],
  ["Hazelbrook", "Wicklow", "HAZ"], ["The Cave", "Wicklow", "BRK"],
  ["St Michael's and Peter's Junior", "Arklow", "ARR"], ["St John's Senior", "Arklow", "ARR"], ["Gaelscoil an Inbhir", "Arklow", "ARC"],
  ["St Joseph's NS", "Arklow", "BKD"], ["Carysfort NS", "Arklow", "BKD"], ["Avoca NS", "Arklow", "ARC"],
  ["Jellybeans Playschool", "Arklow", "ARC"], ["Kangakare Preschool", "Arklow", "ARR"], ["Twinklers Montessori", "Arklow", "BKD"],
  ["Dripsey NS", "Cork", "CAN"], ["Gaelscoil Mhainistir na Corann", "Cork", "CAN"], ["Vicarstown NS", "Cork", "CAN"], ["Canovee NS", "Cork", "CAN"],
  ["Garranbane NS", "Waterford", "DUN"], ["St Mary's NS Dungarvan", "Waterford", "DUN"], ["St Joseph's NS Dungarvan", "Waterford", "DUN"], ["Scoil Mhuire Tallow", "Waterford", "DUN"],
  ["Gorey Central School", "Wexford", "GOR"], ["St Joseph's NS Gorey", "Wexford", "GOR"], ["Gorey Educate Together", "Wexford", "GOR"],
  ["Bunscoil Loreto", "Wexford", "GOR"], ["Gaelscoil Moshíológ", "Wexford", "GOR"],
  ["Virgin Mary Girls NS", "Dublin", "BMN"], ["Virgin Mary Boys NS", "Dublin", "BMN"],
];
const slug = (s: string) => "SCH-" + s.replace(/[^A-Za-z]/g, "").slice(0, 10).toUpperCase();

const SAC_SLOTS: Record<LocationId, number> = { HAZ: 90, BRK: 70, ARC: 40, ARR: 40, BKD: 45, GOR: 70, CAN: 55, DUN: 60, BMN: 60 };
const EY_ROOMS: Record<string, [string, Room["kind"], string, number, number, number][]> = {
  // id, kind, name, capacity, ratio, enrolled
  HAZ: [["HAZ-CR", "Crèche", "Sunbeams", 15, 5, 14], ["HAZ-PJ", "Preschool Junior", "Rainbows", 22, 6, 20], ["HAZ-PS", "Preschool Senior (ECCE)", "Sunflowers", 30, 8, 28]],
  ARC: [["ARC-CR", "Crèche", "Seashells", 14, 5, 12], ["ARC-PJ", "Preschool Junior", "Starfish", 20, 6, 18], ["ARC-PS", "Preschool Senior (ECCE)", "Lighthouse", 30, 8, 28]],
};

export function buildSeed(): RosState {
  const r = mulberry(20261020);
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const chance = (p: number) => r() < p;
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const dateIn = (from: string, days: number) => addDays(from, int(0, days));
  const email = (name: string) => name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/'/g, "").replace(/\s+/g, ".") + "@demo.roskids.example";
  const parentEmail = (name: string) => email(name).replace("@demo.", "@parents.demo.");
  const phone = () => "08" + int(3, 7) + " 555 " + String(int(1000, 9999)); // 555 marks a fictional number
  const initials = (n: string) => n.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  /* ---------------- places ---------------- */
  const locations = LOCS.map(l => ({ ...l }));
  const schools: School[] = SCHOOL_DEFS.map(([name, region, loc]) => ({ id: slug(name), name, region, locationId: loc }));
  const schoolsAt = (loc: LocationId) => schools.filter(s => s.locationId === loc && s.name !== "Hazelbrook");
  const rooms: Room[] = [];
  for (const loc of Object.keys(EY_ROOMS)) for (const [id, kind, name, cap, ratio] of EY_ROOMS[loc])
    rooms.push({ id, locationId: loc as LocationId, name, kind, ageBand: kind === "Crèche" ? "1–2.5 yrs" : kind === "Preschool Junior" ? "2.5–3.5 yrs" : "3–5 yrs", capacity: cap, ratio });
  for (const l of locations) rooms.push({ id: l.id + "-SAC", locationId: l.id, name: "School Age (" + l.short + ")", kind: "SAC", ageBand: "4–12 yrs", capacity: l.sacCapacity, ratio: 10 });

  /* ---------------- staff ---------------- */
  const staff: Staff[] = [];
  const certSet = (kinds: CertKind[], override: Partial<Record<CertKind, string>> = {}): Cert[] =>
    kinds.map(k => ({ kind: k, expires: override[k] || dateIn("2026-12-20", 760) }));
  const care: CertKind[] = ["Garda vetting", "First aid", "Children First", "Manual handling"];
  const addStaff = (id: string, name: string, role: StaffRole, loc: LocationId, extra: Partial<Staff> = {}) => {
    const s: Staff = {
      id, name, initials: initials(name), role, locationId: loc,
      contractHours: extra.contractHours ?? (role === "Owner" ? 45 : int(20, 39)),
      qualification: extra.qualification ?? pick(["QQI Level 5", "QQI Level 6", "QQI Level 6", "BA ECCE (Level 7)", "BA ECCE (Level 8)"]),
      email: email(name), irish: chance(0.22), certs: extra.certs ?? certSet(care),
      startDate: extra.startDate ?? dateIn("2016-02-01", 3400), hourlyCost: extra.hourlyCost ?? round2(15.2 + r() * 3.6), status: "active", ...extra,
    };
    staff.push(s); return s;
  };
  addStaff("S001", "Amanda Spiteri", "Owner", "HAZ", { qualification: "Founder · BA ECCE", startDate: "2015-09-01", hourlyCost: 0, contractHours: 45 });
  addStaff("S002", "Deirdre Kinsella", "Operations Manager", "HAZ", { qualification: "QQI Level 8 · Management", hourlyCost: 26 });
  addStaff("S003", "Gráinne Whelan", "Accounts", "HAZ", { qualification: "ACCA Technician", certs: certSet(["Garda vetting"]), hourlyCost: 22 });
  addStaff("S004", "Paul Hennessy", "Accounts", "HAZ", { qualification: "QQI Level 6 Accounting", certs: certSet(["Garda vetting"]), hourlyCost: 19 });
  addStaff("S005", "Michelle Kehoe", "Accounts", "HAZ", { qualification: "QQI Level 6 Accounting", certs: certSet(["Garda vetting"]), hourlyCost: 18.5 });
  addStaff("S006", "Lorraine Tobin", "NCS Administrator", "HAZ", { certs: certSet(["Garda vetting"]), hourlyCost: 19.5 });
  addStaff("S007", "Áine Mulvey", "NCS Administrator", "HAZ", { certs: certSet(["Garda vetting"]), hourlyCost: 18.5 });
  addStaff("S008", "Kevin Lawless", "Trainer", "HAZ", { qualification: "QQI Manual Handling Instructor", certs: certSet(["Garda vetting", "First aid", "Manual handling"]), hourlyCost: 24 });
  addStaff("S009", "Orla Dempsey", "HR & Admin", "HAZ", { certs: certSet(["Garda vetting", "Children First"]), hourlyCost: 20 });
  const MGRS: [string, string, LocationId][] = [["S010", "Siobhán Keogh", "HAZ"], ["S011", "Mark Devlin", "BRK"], ["S012", "Nicola Cash", "ARC"], ["S013", "Joanne Redmond", "ARR"], ["S014", "Fiona Kavanagh", "BKD"], ["S015", "Tara Breen", "GOR"], ["S016", "Eimear Desmond", "CAN"], ["S017", "Rachel Power", "DUN"], ["S018", "Leanne Farrell", "BMN"]];
  for (const [id, n, loc] of MGRS) addStaff(id, n, "Location Manager", loc, { qualification: "BA ECCE (Level 8)", hourlyCost: 23.5, contractHours: 39 });
  addStaff("S019", "Aisling Byrne", "Relief Practitioner", "ARC", { qualification: "QQI Level 6", contractHours: 30 });
  addStaff("S020", "Ciara Walsh", "Relief Practitioner", "ARC", { qualification: "BA ECCE (Level 7)", contractHours: 24 });
  addStaff("S021", "Niamh Corcoran", "Relief Practitioner", "GOR", { qualification: "QQI Level 6", contractHours: 28 });
  addStaff("S022", "Declan Furlong", "Relief Practitioner", "HAZ", { qualification: "QQI Level 5", contractHours: 20 });
  const drv: [string, string, LocationId, StaffRole][] = [["S023", "Gerry Doran", "HAZ", "Driver"], ["S024", "Liam Cullen", "BRK", "Driver"], ["S025", "Brian Hogan", "ARR", "Driver"], ["S026", "Dave Quirke", "ARC", "Driver"], ["S027", "Joe Kenny", "GOR", "Driver"], ["S028", "Ger Murphy", "CAN", "Driver"], ["S029", "Bríd Hayes", "HAZ", "Escort"], ["S030", "Sandra Lyons", "GOR", "Escort"]];
  for (const [id, n, loc, role] of drv) addStaff(id, n, role, loc, { qualification: role === "Driver" ? "D1 licence · CPC" : "QQI Level 5", certs: certSet(role === "Driver" ? ["Garda vetting", "First aid", "Safe driving"] : ["Garda vetting", "First aid", "Children First"]), contractHours: 20, hourlyCost: 17 });
  addStaff("S031", "Shane Molloy", "SAC Practitioner", "BRK", { certs: certSet(care, { "Garda vetting": "2026-10-02" }) });
  // Care pool, sized to cover each site's booked sessions at the demo ratios.
  const POOL: [LocationId, StaffRole, string | undefined, number][] = [
    ["HAZ", "Room Leader", "HAZ-CR", 1], ["HAZ", "Practitioner", "HAZ-CR", 3], ["HAZ", "Room Leader", "HAZ-PJ", 1], ["HAZ", "Practitioner", "HAZ-PJ", 3],
    ["HAZ", "Room Leader", "HAZ-PS", 1], ["HAZ", "Practitioner", "HAZ-PS", 4], ["HAZ", "SAC Leader", undefined, 1], ["HAZ", "SAC Practitioner", undefined, 7],
    ["BRK", "SAC Leader", undefined, 1], ["BRK", "SAC Practitioner", undefined, 6],
    ["ARC", "Room Leader", "ARC-CR", 1], ["ARC", "Practitioner", "ARC-CR", 2], ["ARC", "Room Leader", "ARC-PJ", 1], ["ARC", "Practitioner", "ARC-PJ", 3],
    ["ARC", "Room Leader", "ARC-PS", 1], ["ARC", "Practitioner", "ARC-PS", 3], ["ARC", "SAC Practitioner", undefined, 3],
    ["ARR", "SAC Leader", undefined, 1], ["ARR", "SAC Practitioner", undefined, 2],
    ["BKD", "SAC Leader", undefined, 1], ["BKD", "SAC Practitioner", undefined, 3],
    ["GOR", "SAC Leader", undefined, 1], ["GOR", "SAC Practitioner", undefined, 5],
    ["CAN", "SAC Leader", undefined, 1], ["CAN", "SAC Practitioner", undefined, 3],
    ["DUN", "SAC Leader", undefined, 1], ["DUN", "SAC Practitioner", undefined, 4],
    ["BMN", "SAC Leader", undefined, 1], ["BMN", "SAC Practitioner", undefined, 4],
  ];
  const homeRoom: Record<string, string | undefined> = {};
  const usedNames = new Set(staff.map(s => s.name));
  let sn = 32;
  for (const [loc, role, room, n] of POOL) for (let i = 0; i < n; i++) {
    let name = "";
    do { name = (chance(0.82) ? pick(ADULT_F) : pick(ADULT_M)) + " " + pick(SURNAMES); } while (usedNames.has(name));
    usedNames.add(name);
    const s = addStaff("S" + String(sn++).padStart(3, "0"), name, role, loc, role === "Room Leader" || role === "SAC Leader" ? { qualification: pick(["BA ECCE (Level 7)", "BA ECCE (Level 8)", "QQI Level 6"]), hourlyCost: round2(18.4 + r() * 2) } : {});
    homeRoom[s.id] = room;
  }
  // Five certificates fall due inside 30 days; one Garda vetting has already lapsed (S031).
  const soon: [string, CertKind, string][] = [["S041", "First aid", "2026-11-02"], ["S052", "Children First", "2026-11-06"], ["S066", "Manual handling", "2026-10-29"], ["S077", "Garda vetting", "2026-11-14"], ["S090", "First aid", "2026-11-12"]];
  for (const [id, kind, exp] of soon) { const s = staff.find(x => x.id === id)!; const c = s.certs.find(c => c.kind === kind); if (c) c.expires = exp; else s.certs.push({ kind, expires: exp }); }

  /* ---------------- families and children ---------------- */
  type Slot = { loc: LocationId; programme: "EY" | "SAC"; roomId: string };
  const slots: Record<LocationId, Slot[]> = {} as any;
  for (const l of locations) {
    const list: Slot[] = [];
    for (let i = 0; i < SAC_SLOTS[l.id]; i++) list.push({ loc: l.id, programme: "SAC", roomId: l.id + "-SAC" });
    for (const [id, , , , , enrolled] of EY_ROOMS[l.id] || []) for (let i = 0; i < enrolled; i++) list.push({ loc: l.id, programme: "EY", roomId: id });
    slots[l.id] = shuffle(list);
  }
  const takeSlot = (loc: LocationId, programme?: "EY" | "SAC") => {
    const i = slots[loc].findIndex(s => !programme || s.programme === programme);
    return slots[loc].splice(i, 1)[0];
  };

  const families: Family[] = [], children: Child[] = [];
  let childN = 2001;
  const ageFor = (s: Slot) => s.programme === "SAC" ? int(5, 12) : s.roomId.endsWith("CR") ? int(1, 2) : s.roomId.endsWith("PJ") ? 3 : int(3, 4);
  const dobFor = (age: number) => addDays("2026-10-20", -(age * 365 + int(10, 340)));
  const classFor = (age: number) => ["Junior Infants", "Senior Infants", "1st Class", "2nd Class", "3rd Class", "4th Class", "5th Class", "6th Class"][Math.max(0, Math.min(7, age - 5))];
  const MED: MedicalFlag[] = [
    { kind: "Allergy", detail: "Peanut and tree nut allergy · adrenaline auto-injector on site", severity: "Severe" },
    { kind: "Asthma", detail: "Reliever inhaler before outdoor play if wheezy", severity: "Moderate" },
    { kind: "Eczema", detail: "Emollient after hand washing", severity: "Info" },
    { kind: "Dietary", detail: "Coeliac · gluten-free snacks only", severity: "Moderate" },
    { kind: "Allergy", detail: "Egg allergy · antihistamine", severity: "Moderate" },
    { kind: "Dietary", detail: "Vegetarian", severity: "Info" },
  ];
  const makeChild = (fam: Family, slot: Slot, first: string, extra: Partial<Child> = {}): Child => {
    const age = extra.age ?? ageFor(slot);
    const sch = slot.programme === "SAC" ? pick(schoolsAt(slot.loc)) : undefined;
    const pool = staff.filter(s => s.locationId === slot.loc && (slot.programme === "SAC" ? /SAC/.test(s.role) : homeRoom[s.id] === slot.roomId));
    const g = fam.guardians;
    const collectors: Collector[] = g.map(x => ({ name: x.name, relation: x.relation, permitted: true }));
    if (chance(0.55)) collectors.push({ name: pick(ADULT_F) + " " + fam.surname, relation: "Grandparent", permitted: true });
    if (chance(0.04)) collectors.push({ name: pick(ADULT_M) + " " + pick(SURNAMES), relation: "Not permitted", permitted: false, note: "Court order on file · do not release" });
    const med = chance(0.17) ? [pick(MED)] : [];
    const c: Child = {
      id: "CH" + childN++, firstName: first, surname: fam.surname, familyId: fam.id, dob: dobFor(age), age,
      locationId: slot.loc, programme: slot.programme, roomId: slot.roomId, schoolId: sch?.id,
      schoolClass: slot.programme === "SAC" ? classFor(age) : undefined,
      keyWorkerId: (pool.length ? pick(pool) : staff.find(s => s.locationId === slot.loc)!).id,
      medical: med, collectors,
      consents: { photos: chance(0.88), transport: chance(0.92), outings: chance(0.9), sunscreen: chance(0.95) },
      supports: slot.programme === "EY" && chance(0.06) ? "AIM Level 4 · additional assistance in room" : undefined,
      started: dateIn("2021-09-01", 1500), ...extra,
    };
    if (med.some(m => m.kind === "Asthma")) c.medication = { name: "Salbutamol reliever inhaler", expires: dateIn("2027-02-01", 400), stored: "Room medicine box" };
    if (med.some(m => m.severity === "Severe")) c.medication = { name: "Adrenaline auto-injector 0.15 mg", expires: dateIn("2027-01-10", 300), stored: "Grab bag + office" };
    children.push(c); fam.childIds.push(c.id); return c;
  };
  const makeFamily = (id: string, surname: string, loc: LocationId, guardians?: [string, string][]): Family => {
    const gs = guardians || (chance(0.78)
      ? [[pick(ADULT_F) + " " + surname, "Mother"], [pick(ADULT_M) + " " + surname, "Father"]]
      : [[(chance(0.8) ? pick(ADULT_F) : pick(ADULT_M)) + " " + surname, chance(0.8) ? "Mother" : "Father"]]) as [string, string][];
    const f: Family = {
      id, surname, locationId: loc, childIds: [], funding: "Private",
      guardians: gs.map(([n, rel], i) => ({ name: n, relation: rel, email: parentEmail(n), phone: phone(), primary: i === 0 })),
      method: pick(["Card on file", "Card on file", "Card on file", "Card on file", "Card on file", "SEPA direct debit", "SEPA direct debit", "SEPA direct debit", "Bank transfer", "Card on file", "Bank transfer", "Card by phone"] as Family["method"][]),
      language: chance(0.9) ? "English" : pick(["Irish", "Polish", "Portuguese", "Ukrainian"] as Family["language"][]),
      channel: chance(0.84) ? "App" : chance(0.6) ? "Email" : "SMS",
      consentsComplete: chance(0.94), blocked: false, flags: [], notes: "", joined: dateIn("2019-08-20", 2400),
    };
    families.push(f); return f;
  };

  // Story fixtures first, so their IDs and places are fixed.
  const oneill = makeFamily("ROS1042", "O'Neill", "HAZ", [["Sinéad O'Neill", "Mother"], ["Mark O'Neill", "Father"]]);
  oneill.method = "Card on file"; oneill.funding = "NCS"; oneill.channel = "App"; oneill.consentsComplete = true; oneill.language = "English";
  const luca = makeChild(oneill, takeSlot("HAZ", "SAC"), "Luca", { age: 7, schoolId: slug("St Patrick's NS"), schoolClass: "2nd Class", medical: [], consents: { photos: true, transport: true, outings: true, sunscreen: true } });
  luca.collectors = [{ name: "Sinéad O'Neill", relation: "Mother", permitted: true }, { name: "Mark O'Neill", relation: "Father", permitted: true }, { name: "Bernie O'Neill", relation: "Grandmother", permitted: true, note: "Password: Glendalough" }];
  const kelly = makeFamily("ROS1087", "Kelly", "BRK", [["Rachel Kelly", "Mother"]]);
  kelly.funding = "NCS"; kelly.method = "SEPA direct debit"; kelly.channel = "App";
  const aoife = makeChild(kelly, takeSlot("BRK", "SAC"), "Aoife", { age: 6, schoolId: slug("Gaelscoil Chill Mhantáin"), schoolClass: "1st Class", medical: [] });
  const nolan = makeFamily("ROS1132", "Nolan", "HAZ", [["Emer Nolan", "Mother"], ["Ciarán Nolan", "Father"]]);
  nolan.funding = "NCS"; nolan.method = "SEPA direct debit"; nolan.channel = "Email";
  const finn = makeChild(nolan, takeSlot("HAZ", "SAC"), "Finn", { age: 8, schoolId: slug("St Patrick's NS"), schoolClass: "3rd Class", medical: [{ kind: "Asthma", detail: "Reliever inhaler before outdoor play if wheezy", severity: "Moderate" }], consents: { photos: true, transport: true, outings: true, sunscreen: true } });
  finn.medication = { name: "Salbutamol reliever inhaler", expires: "2027-03-31", stored: "Room medicine box" };
  const byrne = makeFamily("ROS1096", "Byrne", "ARR", [["Lisa Byrne", "Mother"]]);
  byrne.method = "Bank transfer"; byrne.flags = ["Payment plan 3 of 3"];
  const jack = makeChild(byrne, takeSlot("ARR", "SAC"), "Jack", { age: 9, schoolId: slug("St John's Senior"), schoolClass: "4th Class" });
  makeChild(byrne, takeSlot("ARR", "SAC"), "Ella", { age: 6, schoolId: slug("St Michael's and Peter's Junior"), schoolClass: "1st Class" });
  const doyle = makeFamily("ROS1198", "Doyle", "GOR", [["Stephen Doyle", "Father"]]);
  doyle.method = "Bank transfer"; doyle.blocked = true; doyle.flags = ["Booking blocked", "Plan broken"];
  makeChild(doyle, takeSlot("GOR", "SAC"), "Amy", { age: 8, schoolId: slug("Gorey Central School"), schoolClass: "3rd Class" });

  // Everyone else: 475 families across the sites, 644 children.
  const FAM_PER: Record<LocationId, number> = { HAZ: 111, BRK: 51, ARC: 72, ARR: 28, BKD: 33, GOR: 51, CAN: 41, DUN: 44, BMN: 44 };
  const fixtureIds = new Set(["ROS1042", "ROS1087", "ROS1096", "ROS1132", "ROS1198"]);
  let rosN = 1001;
  const nextRos = () => { while (fixtureIds.has("ROS" + rosN)) rosN++; return "ROS" + rosN++; };
  for (const l of locations) {
    const nFam = FAM_PER[l.id], nKids = slots[l.id].length;
    const sizes = new Array(nFam).fill(1);
    let extra = nKids - nFam;
    while (extra > 0) { const i = int(0, nFam - 1); if (sizes[i] < 3 && (sizes[i] === 1 || chance(0.35))) { sizes[i]++; extra--; } }
    for (const size of sizes) {
      const f = makeFamily(nextRos(), pick(SURNAMES), l.id);
      for (let k = 0; k < size; k++) {
        const slot = takeSlot(l.id);
        const first = chance(0.5) ? pick(FIRST_F) : pick(FIRST_M);
        makeChild(f, slot, first);
      }
    }
  }
  families.sort((a, b) => a.id.localeCompare(b.id));

  // 60% NCS (288 families); fixtures O'Neill, Kelly and Nolan are NCS, Byrne and Doyle private.
  const ncsTarget = 288;
  let ncsCount = families.filter(f => f.funding === "NCS").length;
  for (const f of shuffle(families.filter(f => !fixtureIds.has(f.id)))) { if (ncsCount >= ncsTarget) break; f.funding = "NCS"; ncsCount++; }
  // Debtors are chosen now so nothing later (window submissions, camps) treats a blocked family as bookable.
  const nonFix = families.filter(f => !fixtureIds.has(f.id));
  const odFams = shuffle(nonFix.filter(f => f.method !== "SEPA direct debit")).slice(0, 30);
  const planFams = shuffle(nonFix.filter(f => !odFams.includes(f))).slice(0, 6);
  const blockedIdx = [18, 21]; // two of the older debts are already booking-blocked
  blockedIdx.forEach(i => { odFams[i].blocked = true; odFams[i].flags = ["Booking blocked"]; });

  /* ---------------- weekly patterns and bookings ---------------- */
  type Pattern = { days: number[]; asEnd: string; morning: number[]; eyHours: number };
  const pattern: Record<string, Pattern> = {};
  for (const c of children) {
    if (c.programme === "EY") {
      const n = pick([3, 4, 4, 5, 5, 5]);
      const days = shuffle([0, 1, 2, 3, 4]).slice(0, n).sort();
      pattern[c.id] = { days, asEnd: "", morning: [], eyHours: chance(0.7) ? 9 : 5 };
    } else {
      const n = pick([1, 2, 2, 3, 3, 3, 4, 4, 5, 5]);
      const days = shuffle([0, 1, 2, 3, 4]).slice(0, n).sort();
      const morning = chance(0.28) ? days.filter(() => chance(0.6)) : [];
      pattern[c.id] = { days, asEnd: pick(["16:00", "17:00", "17:00", "17:30", "18:00", "18:00"]), morning, eyHours: 0 };
    }
  }
  pattern[luca.id] = { days: [0, 1, 2, 3], asEnd: "17:30", morning: [], eyHours: 0 };
  pattern[finn.id] = { days: [0, 1, 2, 3], asEnd: "17:00", morning: [], eyHours: 0 };
  pattern[aoife.id] = { days: [0, 2, 3], asEnd: "18:00", morning: [], eyHours: 0 };
  const doyleKid = children.find(c => c.familyId === "ROS1198")!;
  pattern[doyleKid.id] = { days: [], asEnd: "", morning: [], eyHours: 0 }; // booking-blocked
  // Arklow Rocks: exactly 22 booked for Tuesday after-school; Gorey: 41 for Wednesday.
  const forceDay = (loc: LocationId, dayIdx: number, target: number) => {
    const sac = children.filter(c => c.locationId === loc && c.programme === "SAC" && c.familyId !== "ROS1198");
    let on = sac.filter(c => pattern[c.id].days.includes(dayIdx));
    const off = shuffle(sac.filter(c => !pattern[c.id].days.includes(dayIdx)));
    while (on.length > target) { const c = on.pop()!; pattern[c.id].days = pattern[c.id].days.filter(d => d !== dayIdx); if (!pattern[c.id].days.length) pattern[c.id].days = [(dayIdx + 2) % 5]; }
    while (on.length < target && off.length) { const c = off.pop()!; pattern[c.id].days = pattern[c.id].days.concat(dayIdx).sort(); on.push(c); }
  };
  forceDay("ARR", 1, 22);
  forceDay("GOR", 2, 41);
  // Every other site/day stays within its room capacity and its rostered staff at 1:10.
  const sacPoolSize = (loc: LocationId) => staff.filter(s => s.locationId === loc && /SAC/.test(s.role) && s.id !== "S031").length;
  for (const l of locations) for (let d = 0; d < 5; d++) {
    if ((l.id === "ARR" && d === 1) || (l.id === "GOR" && d === 2)) continue;
    const max = Math.min(l.sacCapacity, sacPoolSize(l.id) * 10);
    const on = shuffle(children.filter(c => c.locationId === l.id && c.programme === "SAC" && pattern[c.id].days.includes(d) && !fixtureIds.has(c.familyId)));
    while (on.length > max) { const c = on.pop()!; pattern[c.id].days = pattern[c.id].days.filter(x => x !== d); pattern[c.id].morning = pattern[c.id].morning.filter(x => x !== d); }
  }

  const hoursBetween = (a: string, b: string) => Math.ceil(((+b.slice(0, 2) * 60 + +b.slice(3, 5)) - (+a.slice(0, 2) * 60 + +a.slice(3, 5))) / 60);
  const famOf = (id: string) => families.find(f => f.id === id)!;
  const bookings: Booking[] = [];
  let bkN = 1;
  const sacStart = (c: Child) => (c.age <= 6 ? "14:00" : "15:00");
  for (const c of children) {
    const p = pattern[c.id], f = famOf(c.familyId);
    for (const d of p.days) {
      const date = THIS_WEEK[d];
      if (c.programme === "EY") {
        const start = p.eyHours === 9 ? "08:00" : "09:00", end = p.eyHours === 9 ? "17:00" : "14:00";
        bookings.push({ id: "BK" + bkN++, childId: c.id, familyId: f.id, locationId: c.locationId, date, session: "Full Day", start, end, hours: p.eyHours, funding: f.funding, roomId: c.roomId, status: "Booked", source: "Parent app" });
      } else {
        const start = sacStart(c);
        bookings.push({ id: "BK" + bkN++, childId: c.id, familyId: f.id, locationId: c.locationId, date, session: "After School", start, end: p.asEnd, hours: hoursBetween(start, p.asEnd), funding: f.funding, schoolId: c.schoolId, roomId: c.roomId, status: "Booked", source: "Parent app" });
      }
    }
    for (const d of p.morning) {
      bookings.push({ id: "BK" + bkN++, childId: c.id, familyId: f.id, locationId: c.locationId, date: THIS_WEEK[d], session: "Morning", start: "07:30", end: "08:45", hours: 2, funding: f.funding, schoolId: c.schoolId, roomId: c.roomId, status: "Booked", source: "Parent app" });
    }
  }
  // Nolan: Finn's sessions are 15:00–17:00 so the week invoices at exactly €92 net.
  for (const b of bookings) if (b.childId === finn.id) { b.start = "15:00"; b.end = "17:00"; b.hours = 2; }

  /* ---------------- vehicles and routes ---------------- */
  const vehicles: Vehicle[] = [
    { id: "V1", reg: "241-WW-0412", seats: 16, kind: "16-seat minibus" }, { id: "V2", reg: "231-WW-1187", seats: 16, kind: "16-seat minibus" },
    { id: "V3", reg: "222-WW-0904", seats: 14, kind: "14-seat minibus" }, { id: "V4", reg: "242-WW-0233", seats: 14, kind: "14-seat minibus" },
    { id: "V5", reg: "232-WX-0718", seats: 16, kind: "16-seat minibus" }, { id: "V6", reg: "221-C-40591", seats: 12, kind: "12-seat minibus" },
  ];
  const S = (n: string) => slug(n);
  const routes: Route[] = [
    { id: "WKR-01", name: "Wicklow Town run", locationId: "BRK", vehicleId: "V2", driverId: "S024", stops: [{ schoolId: S("The Glebe NS Church Hill"), time: "14:20" }, { schoolId: S("Gaelscoil Chill Mhantáin"), time: "14:32" }, { schoolId: S("Wicklow Educate Together"), time: "14:42" }, { schoolId: S("The Cave"), time: "14:50" }], feePerRun: 3 },
    { id: "WKR-02", name: "Rathnew & Ashford run", locationId: "HAZ", vehicleId: "V1", driverId: "S023", escortId: "S029", stops: [{ schoolId: S("Nuns Cross Ashford"), time: "14:15" }, { schoolId: S("Scoil na Coróine Mhuire Ashford"), time: "14:25" }, { schoolId: S("St Coen's NS"), time: "14:35" }, { schoolId: S("St Patrick's NS"), time: "14:45" }], feePerRun: 3 },
    { id: "ARK-01", name: "Arklow Rocks run", locationId: "ARR", vehicleId: "V3", driverId: "S025", stops: [{ schoolId: S("Kangakare Preschool"), time: "13:50" }, { schoolId: S("St Michael's and Peter's Junior"), time: "14:10" }, { schoolId: S("St John's Senior"), time: "14:50" }], feePerRun: 3 },
    { id: "ARK-02", name: "Arklow town run", locationId: "ARC", vehicleId: "V4", driverId: "S026", stops: [{ schoolId: S("Jellybeans Playschool"), time: "13:45" }, { schoolId: S("Gaelscoil an Inbhir"), time: "14:30" }, { schoolId: S("Avoca NS"), time: "14:55" }], feePerRun: 3 },
    { id: "GOR-01", name: "Gorey schools run", locationId: "GOR", vehicleId: "V5", driverId: "S027", escortId: "S030", stops: [{ schoolId: S("Gorey Central School"), time: "14:30" }, { schoolId: S("St Joseph's NS Gorey"), time: "14:38" }, { schoolId: S("Gorey Educate Together"), time: "14:46" }, { schoolId: S("Bunscoil Loreto"), time: "14:52" }, { schoolId: S("Gaelscoil Moshíológ"), time: "15:00" }], feePerRun: 3 },
    { id: "CRK-01", name: "Canovee & Dripsey run", locationId: "CAN", vehicleId: "V6", driverId: "S028", stops: [{ schoolId: S("Dripsey NS"), time: "14:30" }, { schoolId: S("Vicarstown NS"), time: "14:42" }, { schoolId: S("Gaelscoil Mhainistir na Corann"), time: "14:52" }, { schoolId: S("Canovee NS"), time: "15:02" }], feePerRun: 3 },
  ];
  // Riders: WKR-02 carries exactly nine children on Tuesday, Luca and Finn among them.
  for (const rt of routes) {
    const stopSchools = new Set(rt.stops.map(s => s.schoolId));
    const seats = vehicles.find(v => v.id === rt.vehicleId)!.seats - 2;
    const cands = children.filter(c => c.locationId === rt.locationId && c.programme === "SAC" && c.schoolId && stopSchools.has(c.schoolId) && c.consents.transport && pattern[c.id].days.length);
    if (rt.id === "WKR-02") cands.sort((a, b) => (a.id === luca.id || a.id === finn.id ? -1 : 0) - (b.id === luca.id || b.id === finn.id ? -1 : 0));
    const load = [0, 0, 0, 0, 0];
    for (const c of cands) {
      const days = pattern[c.id].days;
      if (rt.id === "WKR-02" && days.includes(1) && load[1] >= 9) continue;
      if (days.some(d => load[d] >= (rt.id === "WKR-02" ? 12 : seats))) continue;
      c.routeId = rt.id; days.forEach(d => load[d]++);
    }
  }
  for (const b of bookings) {
    const c = children.find(x => x.id === b.childId)!;
    if (b.session === "After School" && c.routeId) b.routeId = c.routeId;
  }

  /* ---------------- shifts and absences ---------------- */
  const absences: RosState["absences"] = [];
  const arrPool = staff.filter(s => s.locationId === "ARR" && /SAC/.test(s.role));
  absences.push({ staffId: arrPool[arrPool.length - 1].id, date: "2026-10-20", reason: "Annual leave (approved 2 Oct)", reported: "2026-10-02 10:14" });
  const gorPool = staff.filter(s => s.locationId === "GOR" && /SAC/.test(s.role));
  absences.push({ staffId: gorPool[1].id, date: "2026-10-21", reason: "Sick leave · reported by phone", reported: "2026-10-20 07:40" });
  const shifts: Shift[] = [];
  let shN = 1;
  const bookedFor = (loc: LocationId, date: string, session: Session, roomId?: string) =>
    bookings.filter(b => b.locationId === loc && b.date === date && b.session === session && b.status === "Booked" && (!roomId || b.roomId === roomId)).length;
  for (const l of locations) for (const date of THIS_WEEK) {
    // Planned leave keeps people off the rota; this morning's sick call came after it was published.
    const away = new Set(absences.filter(a => a.date === date && !a.reason.startsWith("Sick")).map(a => a.staffId));
    const sacPool = staff.filter(s => s.locationId === l.id && /SAC/.test(s.role) && !away.has(s.id) && s.id !== "S031");
    const asReq = Math.ceil(bookedFor(l.id, date, "After School") / 10);
    sacPool.slice(0, asReq).forEach(s => shifts.push({ id: "SH" + shN++, staffId: s.id, locationId: l.id, date, session: "After School", roomId: l.id + "-SAC", start: "13:45", end: "18:15", status: "rostered" }));
    const amReq = Math.ceil(bookedFor(l.id, date, "Morning") / 10);
    sacPool.slice(sacPool.length - amReq).forEach(s => shifts.push({ id: "SH" + shN++, staffId: s.id, locationId: l.id, date, session: "Morning", roomId: l.id + "-SAC", start: "07:15", end: "09:15", status: "rostered" }));
    for (const room of rooms.filter(rm => rm.locationId === l.id && rm.kind !== "SAC")) {
      const req = Math.ceil(bookedFor(l.id, date, "Full Day", room.id) / room.ratio);
      staff.filter(s => homeRoom[s.id] === room.id && !away.has(s.id)).slice(0, req)
        .forEach(s => shifts.push({ id: "SH" + shN++, staffId: s.id, locationId: l.id, date, session: "Full Day", roomId: room.id, start: "07:45", end: "17:45", status: "rostered" }));
    }
  }
  // Gorey on Wednesday is one short: the sick practitioner was rostered before the call came in.
  const issues: Issue[] = [
    { id: "STAFF-ARK-019", kind: "Ratio", locationId: "ARR", date: "2026-10-20", session: "After School", status: "Open",
      title: "Arklow Rocks · 3pm After School is one adult short",
      detail: "22 children booked for After School from 15:00. 2 practitioners rostered against 3 required at the demo 1:10 ratio. One practitioner is on approved annual leave.",
      booked: 22, rostered: 2, required: 3, offerStaffIds: ["S019", "S020"] },
    { id: "STAFF-GOR-021", kind: "Ratio", locationId: "GOR", date: "2026-10-21", session: "After School", status: "Open",
      title: "Gorey · Wednesday After School forecast one adult short",
      detail: "41 children booked for Wednesday 21 Oct. 4 practitioners available after a sick call this morning against 5 required at the demo 1:10 ratio.",
      booked: 41, rostered: 4, required: 5, offerStaffIds: ["S021"] },
  ];

  /* ---------------- NCS awards and claims ---------------- */
  const awards: NCSAward[] = [], claims: NCSClaim[] = [];
  let awN = 4001;
  const chickFor = () => "CHK-••••-" + String.fromCharCode(65 + int(0, 25)) + int(1, 9) + String.fromCharCode(65 + int(0, 25));
  const weekHours = (c: Child) => bookings.filter(b => b.childId === c.id && b.status === "Booked").reduce((n, b) => n + b.hours, 0);
  for (const f of families.filter(f => f.funding === "NCS")) for (const cid of f.childIds) {
    const c = children.find(x => x.id === cid)!;
    const hrs = weekHours(c);
    const universal = chance(0.38);
    const last = dateIn("2026-06-01", 120);
    const a: NCSAward = {
      id: "AW" + awN++, childId: c.id, familyId: f.id, chick: chickFor(), type: universal ? "Universal" : "Income assessed",
      agreedHours: Math.max(2, Math.min(hrs || 6, c.programme === "EY" ? 45 : 20)), rate: universal ? 2.14 : round2(3 + r() * 3.4),
      lastChange: last, nextChange: addDays(last, 56), expires: dateIn("2026-12-01", 300), status: "Active",
    };
    awards.push(a); c.awardId = a.id;
  }
  const setAward = (childId: string, patch: Partial<NCSAward>) => Object.assign(awards.find(a => a.childId === childId)!, patch);
  setAward(luca.id, { type: "Universal", rate: 2.14, agreedHours: 14, expires: "2027-03-14" });
  setAward(finn.id, { type: "Income assessed", rate: 5, agreedHours: 8, lastChange: "2026-09-07", nextChange: "2026-11-02", expires: "2027-01-22" });
  setAward(aoife.id, { type: "Income assessed", rate: 4.6, agreedHours: 15, lastChange: "2026-09-07", nextChange: "2026-11-02", expires: "2027-02-08" });
  // 14 CHICKs expire this month (none of them the story children).
  const expPool = shuffle(awards.filter(a => ![luca.id, finn.id, aoife.id].includes(a.childId)));
  const OCT_DAYS = ["2026-10-21", "2026-10-22", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-10-31"];
  expPool.slice(0, 14).forEach((a, i) => { a.expires = OCT_DAYS[i]; a.status = "Expiring"; });
  for (const a of expPool.slice(14)) if (a.expires < "2026-11-25") a.expires = addDays(a.expires, 120);
  // Claims: nine awaiting acceptance (two lapse today at 17:00), plus accepted history.
  let clN = 83;
  const mkClaim = (a: NCSAward, status: NCSClaim["status"], deadline: string, raised: string, hours: number, amount?: number): NCSClaim => {
    const cl: NCSClaim = { id: "NCS-" + String(clN++).padStart(4, "0"), awardId: a.id, familyId: a.familyId, childId: a.childId, period: "28 Sep – 16 Oct", hours, amount: amount ?? round2(hours * a.rate), status, deadline, raised, reminders: [] };
    claims.push(cl); return cl;
  };
  const claimPool = shuffle(awards.filter(a => ![luca.id, finn.id, aoife.id].includes(a.childId) && a.status === "Active"));
  const pendingDeadlines = ["2026-10-21 17:00", "2026-10-22 17:00", "2026-10-22 17:00", "2026-10-23 17:00", "2026-10-24 17:00", "2026-10-25 17:00", "2026-10-26 17:00"];
  for (let i = 0; i < 8; i++) {
    const a = claimPool[i];
    if (i === 3) { clN = 91; const k = mkClaim(awards.find(x => x.childId === aoife.id)!, "Awaiting acceptance", "2026-10-20 17:00", "2026-10-13", 40, 184); k.reminders = [{ day: 2, at: "2026-10-15 09:00", channel: "App" }, { day: 4, at: "2026-10-17 09:00", channel: "App" }, { day: 6, at: "2026-10-19 09:00", channel: "SMS" }]; }
    const deadline = i === 0 ? "2026-10-20 17:00" : pendingDeadlines[i - 1] || "2026-10-26 17:00";
    const k = mkClaim(a, "Awaiting acceptance", deadline, addDays(deadline.slice(0, 10), -7), int(8, 30));
    if (deadline <= "2026-10-22 17:00") k.reminders = [{ day: 2, at: addDays(k.raised, 2) + " 09:00", channel: "App" }];
  }
  for (let i = 8; i < 40; i++) mkClaim(claimPool[i], "Accepted", addDays("2026-10-10", -int(0, 30)) + " 17:00", addDays("2026-10-03", -int(0, 30)), int(8, 30));

  /* ---------------- booking windows (w/c 2 Nov open now) ---------------- */
  const subs: BookingWindow["submissions"] = [];
  const underbooked = new Set<string>(["ROS1087"]);
  const ncsSubmitters = shuffle(families.filter(f => f.funding === "NCS" && !fixtureIds.has(f.id) && !odFams.includes(f) && !planFams.includes(f)));
  ncsSubmitters.slice(0, 3).forEach(f => underbooked.add(f.id));
  for (const f of families) {
    if (f.blocked) continue;
    const submitted = underbooked.has(f.id) || f.id === "ROS1042" || f.id === "ROS1132" || chance(0.6);
    if (!submitted) continue;
    let hours = 0, sessions = 0;
    for (const cid of f.childIds) {
      const c = children.find(x => x.id === cid)!;
      const h = weekHours(c) || 4;
      sessions += Math.max(1, pattern[c.id].days.length);
      const aw = awards.find(a => a.childId === cid);
      if (underbooked.has(f.id) && aw) {
        if (cid === aoife.id) { hours += 12; aw.agreedHours = 15; }
        else { aw.agreedHours = Math.max(aw.agreedHours, h + 3); hours += h; }
      } else { if (aw) aw.agreedHours = Math.min(aw.agreedHours, h); hours += h; }
    }
    subs.push({ familyId: f.id, submittedAt: f.id === "ROS1042" ? "2026-10-19 09:30" : pick(["2026-10-19 09:12", "2026-10-19 11:40", "2026-10-19 13:05", "2026-10-19 19:22", "2026-10-19 21:48", "2026-10-20 07:58", "2026-10-20 08:31"]), sessions, hours });
  }
  const windows: BookingWindow[] = [
    { id: "BW-1019", weekOf: "2026-10-19", label: "w/c 19 Oct", opens: "2026-10-12 09:00", closes: "2026-10-15 18:00", status: "Locked", submissions: [] },
    { id: "BW-1026", weekOf: "2026-10-26", label: "w/c 26 Oct · Halloween midterm (camps)", opens: "2026-10-05 09:00", closes: "2026-10-16 18:00", status: "Locked", submissions: [] },
    { id: "BW-1102", weekOf: "2026-11-02", label: "w/c 2 Nov", opens: "2026-10-19 09:00", closes: "2026-10-22 18:00", status: "Open", submissions: subs },
    { id: "BW-1109", weekOf: "2026-11-09", label: "w/c 9 Nov", opens: "2026-10-26 09:00", closes: "2026-10-29 18:00", status: "Scheduled", submissions: [] },
  ];

  /* ---------------- invoices, payments, plans ---------------- */
  const invoices: Invoice[] = [], payments: Payment[] = [], plans: PaymentPlan[] = [];
  let invN = 20001, oldN = 18001, lnN = 1, payN = 1;
  const nextInv = () => { if (invN === 20418) invN++; return "INV-" + invN++; }; // INV-20418 belongs to the Nolans
  const lineId = () => "L" + lnN++;
  const locOf = (id: LocationId) => locations.find(l => l.id === id)!;
  const weekLines = (f: Family, weekOf: string, fromBookings: boolean): InvoiceLine[] => {
    const lines: InvoiceLine[] = [];
    for (const cid of f.childIds) {
      const c = children.find(x => x.id === cid)!, l = locOf(c.locationId);
      const bk = fromBookings ? bookings.filter(b => b.childId === cid && b.status === "Booked")
        : pattern[cid].days.map(d => ({ date: addDays(weekOf, d), session: c.programme === "EY" ? "Full Day" : "After School", hours: c.programme === "EY" ? pattern[cid].eyHours : hoursBetween(sacStart(c), pattern[cid].asEnd || "17:00"), routeId: c.routeId, id: undefined } as any));
      let hrs = 0;
      for (const b of bk) {
        if (b.session === "Full Day") lines.push({ id: lineId(), kind: "Session", label: c.firstName + " · " + (b.hours >= 9 ? "Full day" : "Part day") + " · " + b.date.slice(8) + "/10", childId: cid, date: b.date, qty: 1, rate: b.hours >= 9 ? l.eyDayRate : round2(l.eyDayRate * 0.6), amount: b.hours >= 9 ? l.eyDayRate : round2(l.eyDayRate * 0.6), bookingId: b.id });
        else lines.push({ id: lineId(), kind: "Session", label: c.firstName + " · " + b.session + " · " + b.hours + "h", childId: cid, date: b.date, qty: b.hours, rate: l.hourlyRate, amount: round2(b.hours * l.hourlyRate), bookingId: b.id });
        if (b.routeId) lines.push({ id: lineId(), kind: "Transport", label: c.firstName + " · school collection " + b.routeId, childId: cid, date: b.date, qty: 1, rate: 3, amount: 3, bookingId: b.id });
        hrs += b.hours;
      }
      const aw = awards.find(a => a.childId === cid);
      if (aw && hrs > 0) {
        const sub = Math.min(hrs, aw.agreedHours);
        lines.push({ id: lineId(), kind: "NCS subsidy", label: c.firstName + " · NCS subsidy " + sub + "h × €" + aw.rate.toFixed(2), childId: cid, qty: sub, rate: -aw.rate, amount: -round2(sub * aw.rate) });
      }
    }
    return lines;
  };
  const total = (inv: Invoice) => round2(inv.lines.reduce((n, l) => n + l.amount, 0));
  const STAGE_PLAN: [number, string][] = [
    [1, "2026-10-19"], [1, "2026-10-19"], [1, "2026-10-19"],                        // Day 0: invoice issued yesterday
    [3, "2026-10-17"], [3, "2026-10-17"], [3, "2026-10-16"], [3, "2026-10-16"],     // Day 2 friendly
    [5, "2026-10-15"], [5, "2026-10-15"], [5, "2026-10-15"], [5, "2026-10-15"],     // Day 5 second
    [7, "2026-10-12"], [7, "2026-10-12"], [7, "2026-10-11"],                        // Day 7 final warning
    [10, "2026-10-08"], [10, "2026-10-08"], [10, "2026-10-09"],                     // Day 10 block candidate
    [14, "2026-10-01"], [14, "2026-09-24"], [14, "2026-10-01"],                     // Day 14 phone
    [30, "2026-09-10"], [30, "2026-09-03"],                                         // statements
  ];
  const odInvoiceIds: string[] = [];
  for (const f of families) {
    // Two paid prior weeks give every family a history; the current week is live.
    for (const wk of ["2026-10-05", "2026-10-12"]) {
      const inv: Invoice = { id: "INV-" + oldN++, familyId: f.id, weekOf: wk, issued: addDays(wk, -4), due: addDays(wk, -4), lines: weekLines(f, wk, false) };
      if (f.blocked || !inv.lines.length) continue;
      invoices.push(inv);
      const t = total(inv);
      if (t > 0) payments.push({ id: "PAY" + payN++, familyId: f.id, invoiceId: inv.id, date: f.method === "SEPA direct debit" ? addDays(wk, 4) : addDays(inv.issued, f.method === "Card on file" ? 1 : int(1, 3)), amount: t, method: f.method, status: "Succeeded", ref: inv.id });
    }
  }
  for (const f of families) {
    const lines = weekLines(f, "2026-10-19", true);
    if (!lines.length) continue;
    const sepa = f.method === "SEPA direct debit";
    const inv: Invoice = { id: f.id === "ROS1132" ? "INV-20418" : nextInv(), familyId: f.id, weekOf: "2026-10-19", issued: "2026-10-15", due: sepa ? "2026-10-23" : "2026-10-15", lines };
    invoices.push(inv);
    const t = total(inv);
    const odIdx = odFams.indexOf(f);
    const isSecondStage = odIdx >= 7 && odIdx <= 10; // Day 5 bucket: this week's invoice is unpaid
    if (!sepa && !isSecondStage && t > 0) payments.push({ id: "PAY" + payN++, familyId: f.id, invoiceId: inv.id, date: f.method === "Card on file" ? "2026-10-16" : "2026-10-" + pick(["16", "17", "19"]), amount: t, method: f.method, status: "Succeeded", ref: inv.id });
  }
  // INV-20418 nets €92: Finn 8h × €15 + 4 runs × €3 − 8h × €5.00 NCS.
  STAGE_PLAN.forEach(([stageDays, due], i) => {
    const f = odFams[i];
    if (i >= 7 && i <= 10) { // the current weekly invoice is the overdue one
      const cur = invoices.find(x => x.familyId === f.id && x.weekOf === "2026-10-19");
      if (cur && total(cur) > 0) { odInvoiceIds.push(cur.id); return; }
    }
    const amt = [24, 45, 58.5, 75, 90, 112.5, 128, 146, 162][int(0, 8)];
    const kind = stageDays <= 1 ? "Camp" : stageDays <= 3 ? "Session" : "Session";
    const lines: InvoiceLine[] = stageDays <= 1
      ? [{ id: lineId(), kind: "Camp", label: "Halloween camp deposit · " + (f.locationId === "GOR" ? "Gorey" : "Canovee"), qty: 1, rate: amt, amount: amt }]
      : [{ id: lineId(), kind, label: "After School sessions · w/c " + due.slice(8) + "/" + due.slice(5, 7), qty: Math.round(amt / 15), rate: 15, amount: round2(Math.round(amt / 15) * 15) },
         { id: lineId(), kind: "Late collection", label: "Late collection 18:10 (billed to next full hour)", qty: 1, rate: 15, amount: 15 }];
    const inv: Invoice = { id: nextInv(), familyId: f.id, weekOf: addDays(due, 4), issued: due, due, lines, note: stageDays <= 3 && stageDays > 1 ? "Direct debit failed · retrying" : undefined };
    invoices.push(inv); odInvoiceIds.push(inv.id);
    if (stageDays > 1 && stageDays <= 3) payments.push({ id: "PAY" + payN++, familyId: f.id, invoiceId: inv.id, date: due, amount: total(inv), method: "SEPA direct debit", status: "Failed", ref: "AM04 insufficient funds", retry: stageDays === 3 ? "Retry Day 5 · " + addDays(due, 5) : undefined });
    if (blockedIdx.includes(i)) { f.blocked = true; f.flags = ["Booking blocked"]; }
  });
  // If a Day-5 family had a €0 week, the plan still needs 25: top up from spare families.
  let spare = 22;
  while (odInvoiceIds.length < 22) {
    const f = odFams[spare++];
    const inv: Invoice = { id: nextInv(), familyId: f.id, weekOf: "2026-10-19", issued: "2026-10-15", due: "2026-10-15", lines: [{ id: lineId(), kind: "Session", label: "After School sessions · w/c 12/10", qty: 6, rate: 15, amount: 90 }] };
    invoices.push(inv); odInvoiceIds.push(inv.id);
  }
  // Payment plans: Byrne (active, revision 3 of 3, missed €81 on 19 Oct), Doyle (third plan broken), six more active.
  const planInvoices = (f: Family, amounts: number[], dues: string[]) => amounts.map((a, i) => {
    const inv: Invoice = { id: nextInv(), familyId: f.id, weekOf: addDays(dues[i], 4), issued: dues[i], due: dues[i], lines: [{ id: lineId(), kind: "Session", label: "After School sessions · w/c " + dues[i].slice(8) + "/" + dues[i].slice(5, 7), qty: Math.round(a / 15), rate: round2(a / Math.round(a / 15)), amount: a }] };
    invoices.push(inv); return inv;
  });
  const byrneInv = planInvoices(byrne, [162, 162, 162], ["2026-08-27", "2026-09-03", "2026-09-10"]);
  plans.push({ id: "PLN-031", familyId: "ROS1096", total: 486, revision: 3, maxRevisions: 3, status: "Active", esign: "Signed", started: "2026-10-05", owner: "Gráinne Whelan",
    nextAction: "Accounts follow-up call by Mon 26 Oct · instalment missed 19 Oct",
    instalments: [0, 1, 2, 3, 4, 5].map(i => ({ n: i + 1, due: addDays("2026-10-19", i * 7), amount: 81, status: i === 0 ? "Missed" : "Scheduled" })) });
  byrneInv.forEach(i => (i.planId = "PLN-031"));
  const doyleInv = planInvoices(doyle, [204, 204, 204], ["2026-07-16", "2026-07-30", "2026-08-13"]);
  plans.push({ id: "PLN-024", familyId: "ROS1198", total: 612, revision: 3, maxRevisions: 3, status: "Broken", esign: "Signed", started: "2026-09-22", owner: "Gráinne Whelan",
    nextAction: "Owner decision: review debt collection pack (approval-only)",
    instalments: [0, 1, 2, 3].map(i => ({ n: i + 1, due: addDays("2026-10-06", i * 7), amount: 153, status: i < 2 ? "Missed" : "Due" })) });
  doyleInv.forEach(i => (i.planId = "PLN-024"));
  odInvoiceIds.push(...doyleInv.map(i => i.id)); // a broken plan's invoices count as overdue again
  planFams.forEach((f, i) => {
    const n = int(2, 4), each = [60, 75, 90, 105][int(0, 3)];
    const inv = planInvoices(f, [each * n], [addDays("2026-09-17", -i * 7)]);
    const id = "PLN-0" + (40 + i);
    const ins = Array.from({ length: n * 2 }, (_, k) => ({ n: k + 1, due: addDays("2026-09-28", k * 7), amount: round2(each / 2), status: (addDays("2026-09-28", k * 7) < TODAY ? "Paid" : "Scheduled") as "Paid" | "Scheduled" }));
    plans.push({ id, familyId: f.id, total: each * n, revision: int(1, 2), maxRevisions: 3, status: "Active", esign: "Signed", started: "2026-09-21", owner: pick(["Gráinne Whelan", "Paul Hennessy"]), nextAction: "On track · next instalment " + (ins.find(x => x.status === "Scheduled")?.due || ""), instalments: ins });
    inv[0].planId = id;
    for (const x of ins.filter(x => x.status === "Paid")) payments.push({ id: "PAY" + payN++, familyId: f.id, planId: id, date: x.due, amount: x.amount, method: f.method, status: "Succeeded", ref: id + " instalment " + x.n });
    f.flags = ["Payment plan"];
  });
  byrne.flags = ["Payment plan 3 of 3", "Missed instalment 19 Oct"];

  // Bank feed: exact and ambiguous suggestions against unpaid bank-transfer invoices.
  const bank: BankLine[] = [];
  const unpaidBT = odInvoiceIds.map(id => invoices.find(i => i.id === id)!).filter(i => famOf(i.familyId).method === "Bank transfer" && !i.planId);
  unpaidBT.slice(0, 3).forEach((inv, i) => bank.push({ id: "BNK-" + (701 + i), date: "2026-10-" + (19 + (i % 2)), amount: total(inv), ref: inv.id + " " + famOf(inv.familyId).surname.toUpperCase(), payer: famOf(inv.familyId).guardians[0].name.toUpperCase(), status: "Suggested", suggestion: { invoiceId: inv.id, confidence: "Exact", reason: "Amount and invoice number match exactly" } }));
  if (unpaidBT[3]) bank.push({ id: "BNK-704", date: "2026-10-19", amount: total(unpaidBT[3]), ref: "CHILDCARE OCT", payer: famOf(unpaidBT[3].familyId).guardians[0].name.toUpperCase(), status: "Suggested", suggestion: { invoiceId: unpaidBT[3].id, confidence: "Ambiguous", reason: "Amount matches; no invoice number in the reference. Payer name matches the family's primary guardian.", alternatives: unpaidBT[4] ? [unpaidBT[4].id] : [] } });
  bank.push({ id: "BNK-705", date: "2026-10-20", amount: 81, ref: "BYRNE PLAN", payer: "L BYRNE", status: "Suggested", suggestion: { invoiceId: byrneInv[0].id, confidence: "Ambiguous", reason: "€81 matches the missed Byrne instalment, but it arrived without the plan reference. Confirm before allocating.", alternatives: [] } });
  bank.push({ id: "BNK-706", date: "2026-10-20", amount: 37.5, ref: "ROSKIDS", payer: "J M KAVANAGH", status: "Unmatched" });

  /* ---------------- requests (6 late, 4 change, 3 cancel) ---------------- */
  const requests: BookingRequest[] = [];
  const reqFees = (c: Child, hours: number, transport: boolean): BookingRequest["fees"] => {
    const l = locOf(c.locationId);
    const fees = [{ label: hours + "h After School × €" + l.hourlyRate.toFixed(2), qty: hours, rate: l.hourlyRate, amount: round2(hours * l.hourlyRate) }, { label: "Late booking fee", qty: 1, rate: 5, amount: 5 }];
    if (transport) fees.push({ label: "School collection", qty: 1, rate: 3, amount: 3 });
    return fees;
  };
  requests.push({ id: "LBR-006", kind: "Late booking", familyId: "ROS1132", childId: finn.id, locationId: "HAZ", date: "2026-10-23", session: "After School", start: "15:00", end: "18:00", schoolId: finn.schoolId, routeId: "WKR-02",
    received: "2026-10-20 07:52", channel: "Email", status: "Pending", note: "Hi, any chance Finn could stay Friday from 3 until 6? St Patrick's pickup please. Parent ID ROS1132. Thanks, Emer", fees: reqFees(finn, 3, true), messageId: "MSG-1006" });
  const sacKids = shuffle(children.filter(c => c.programme === "SAC" && !fixtureIds.has(c.familyId) && !famOf(c.familyId).blocked));
  const reqDates = ["2026-10-21", "2026-10-22", "2026-10-22", "2026-10-23", "2026-10-21"];
  const usedReq = new Set<string>();
  for (let i = 0; i < 5; i++) {
    // A late request only makes sense for a day the child is not already booked.
    const c = sacKids.find(k => !usedReq.has(k.id) && k.locationId !== "ARR" && !bookings.some(b => b.childId === k.id && b.date === reqDates[i]))!;
    usedReq.add(c.id);
    const h = int(2, 3);
    requests.push({ id: "LBR-00" + (i + 1), kind: "Late booking", familyId: c.familyId, childId: c.id, locationId: c.locationId, date: reqDates[i], session: "After School", start: "15:00", end: h === 2 ? "17:00" : "18:00", schoolId: c.schoolId, routeId: c.routeId,
      received: "2026-10-" + (i < 2 ? "19 " + ["16:42", "20:15"][i] : "20 0" + (7 + (i % 2)) + ":1" + i), channel: pick(["Parent app", "Email", "Website form"]), status: "Pending",
      note: pick(["Work meeting ran over, can " + c.firstName + " come in?", "Grandparent away this week, need an extra afternoon.", "Can we add " + reqDates[i].slice(8) + "/10 please?", "Last-minute shift change. Pickup from " + (schools.find(s => s.id === c.schoolId)?.name || "school") + " if possible."]),
      fees: reqFees(c, h, !!c.routeId) });
  }
  const bookedKids = shuffle(bookings.filter(b => b.session === "After School" && b.date >= "2026-10-21" && !fixtureIds.has(b.familyId) && !(b.locationId === "GOR" && b.date === "2026-10-21")));
  for (let i = 0; i < 4; i++) {
    const b = bookedKids[i], c = children.find(x => x.id === b.childId)!;
    requests.push({ id: "CHG-01" + (i + 1), kind: "Change", familyId: b.familyId, childId: b.childId, locationId: b.locationId, date: b.date, session: b.session, start: b.start, end: i % 2 ? "18:00" : "16:00", bookingId: b.id, schoolId: b.schoolId,
      received: "2026-10-20 0" + (6 + (i % 3)) + ":2" + i, channel: pick(["Parent app", "Email"]), status: "Pending",
      note: i % 2 ? "Could we extend to 6pm that day?" : "Collecting early that day, could we shorten to 4pm?", fees: [] });
    void c;
  }
  for (let i = 0; i < 3; i++) {
    const b = bookedKids[10 + i];
    requests.push({ id: "CXL-00" + (7 + i), kind: "Cancellation", familyId: b.familyId, childId: b.childId, locationId: b.locationId, date: b.date, session: b.session, start: b.start, end: b.end, bookingId: b.id,
      received: "2026-10-20 0" + (7 + (i % 2)) + ":0" + (5 + i), channel: "Parent app", status: "Pending", note: pick(["Child sick, won't be in.", "Family event, please cancel.", "Changed plans, no longer needed."]), fees: [] });
  }

  /* ---------------- attendance (08:45 today) ---------------- */
  const attendance: AttendanceEvent[] = [];
  let atN = 1;
  for (const b of bookings.filter(b => b.date === TODAY)) {
    if (b.session === "Full Day") {
      const arr = b.start === "08:00" ? int(0, 50) : -1; // part-day children arrive from 09:00
      if (arr >= 0) attendance.push({ id: "AT" + atN++, childId: b.childId, date: TODAY, kind: "in", time: "07:" + String(50 + Math.min(9, Math.floor(arr / 6))).padStart(2, "0"), by: "Room register", collector: famOf(b.familyId).guardians[0].name });
    }
    if (b.session === "Morning") {
      attendance.push({ id: "AT" + atN++, childId: b.childId, date: TODAY, kind: "in", time: "07:" + String(int(30, 55)).padStart(2, "0"), by: "Kiosk", collector: famOf(b.familyId).guardians[0].name });
      attendance.push({ id: "AT" + atN++, childId: b.childId, date: TODAY, kind: "out", time: "08:3" + int(0, 8), by: "Walked to school", note: "Dropped to " + (schools.find(s => s.id === b.schoolId)?.name || "school") });
    }
  }
  // Yesterday is complete: everyone booked came and went.
  for (const b of bookings.filter(b => b.date === "2026-10-19")) {
    attendance.push({ id: "AT" + atN++, childId: b.childId, date: b.date, kind: "in", time: b.session === "After School" ? (b.routeId ? "15:0" + int(2, 9) : b.start) : b.start, by: b.routeId ? "Bus arrival" : "Kiosk" });
    attendance.push({ id: "AT" + atN++, childId: b.childId, date: b.date, kind: "out", time: b.end, by: "Kiosk", collector: famOf(b.familyId).guardians[0].name });
  }

  /* ---------------- enquiries and waitlist ---------------- */
  const STAGES: EnquiryStage[] = ["New enquiry", "New enquiry", "New enquiry", "New enquiry", "Contacted", "Contacted", "Contacted", "Contacted", "Visit booked", "Visit booked", "Visit booked", "Offered", "Offered", "Registration sent", "Registration sent", "Enrolled", "Enrolled", "Started"];
  const enquiries: Enquiry[] = STAGES.map((stage, i) => {
    const loc = pick(["HAZ", "HAZ", "ARC", "BRK", "GOR", "ARR", "CAN", "DUN", "BMN"] as LocationId[]);
    const svc: Enquiry["service"] = (loc === "HAZ" || loc === "ARC") && chance(0.55) ? "Early Years" : "SAC";
    const sur = pick(SURNAMES);
    const received = addDays(TODAY, -int(0, 26));
    return { id: "ENQ-" + (310 + i), parent: pick(ADULT_F) + " " + sur, children: svc === "Early Years" ? pick(["1 child · 14 months", "1 child · 2 yrs 9 mths", "1 child · 3 yrs (ECCE)", "Twins · 18 months"]) : pick(["1 child · Senior Infants", "2 children · 1st & 4th Class", "1 child · 3rd Class", "1 child · Junior Infants"]),
      service: svc, locationId: loc, source: pick(["Website", "Website", "Facebook", "Phone", "Walk-in", "Referral"]), stage, owner: staff.find(s => s.id === locations.find(l => l.id === loc)!.managerId)!.name,
      received, nextFollowUp: addDays(TODAY, int(-2, 6)), note: pick(["Needs Mon/Wed/Thu after school from January.", "Asked about NCS and transport from St Patrick's.", "Moving to the area in December.", "Sibling already attends.", "Wants a visit on a Tuesday morning.", "Asked about camp places at Halloween."]),
      startWanted: pick(["Nov 2026", "Jan 2027", "Feb 2027", "Sep 2027"]), sibling: chance(0.2) };
  });
  const waitlist: WaitlistEntry[] = Array.from({ length: 22 }, (_, i) => {
    const loc = pick(["HAZ", "HAZ", "HAZ", "ARC", "ARC", "BRK", "GOR", "BMN"] as LocationId[]);
    const ey = (loc === "HAZ" || loc === "ARC") && chance(0.7);
    const sur = pick(SURNAMES);
    return { id: "WL-" + (120 + i), childName: (chance(0.5) ? pick(FIRST_F) : pick(FIRST_M)) + " " + sur, parent: pick(ADULT_F) + " " + sur, locationId: loc,
      service: ey ? "Early Years" : "SAC", room: ey ? pick(["Crèche", "Preschool Junior", "Preschool Senior (ECCE)"]) : "School Age",
      requestedStart: pick(["2026-11-02", "2027-01-04", "2027-01-04", "2027-02-01", "2027-09-01"]), added: addDays(TODAY, -int(5, 220)),
      priority: i < 4 ? "Sibling" : i === 4 ? "Staff" : "Standard", status: "Waiting", days: pick(["Mon–Fri", "Mon/Wed/Fri", "Tue/Thu", "Mon–Thu"]) };
  });

  /* ---------------- messages and family timeline ---------------- */
  const messages: Message[] = [];
  const comms: CommEvent[] = [];
  let cmN = 1;
  const addComm = (familyId: string, at: string, channel: string, direction: CommEvent["direction"], summary: string, by: string) => comms.push({ id: "CM" + cmN++, familyId, at, channel, direction, summary, by });
  const msg = (m: Omit<Message, "direction"> & { direction?: Message["direction"] }) => { messages.push({ direction: "in", ...m }); };
  msg({ id: "MSG-1006", queue: "Wicklow", familyId: "ROS1132", from: "Emer Nolan", subject: "Friday after school for Finn?", body: requests[0].note, received: "2026-10-20 07:52", classification: "Late booking request", confidence: 0.97, status: "New", channel: "Email", link: { kind: "request", id: "LBR-006" },
    draft: "Hi Emer, thanks for getting in touch. Friday 23 Oct from 15:00 to 18:00 at Hazelbrook with the St Patrick's NS collection is available. As it is after the booking window closed, a €5 late booking fee applies, with 3 hours at €15.00 and €3 for the school run, €53 in total, added to invoice INV-20418. Finn's NCS hours for this week are already used, so Friday is charged privately. Reply here if anything changes. Hazelbrook team", tone: "Warm, plain" });
  msg({ id: "MSG-1007", queue: "NCS", familyId: "ROS1087", from: "Rachel Kelly", subject: "Do I need to do anything with the NCS claim?", body: "Got a notification about accepting a claim for Aoife. Is that something I have to do? Not sure where to find it.", received: "2026-10-19 21:14", classification: "NCS claim acceptance", confidence: 0.92, status: "New", channel: "App", link: { kind: "claim", id: "NCS-0091" },
    draft: "Hi Rachel, yes please. Claim NCS-0091 for Aoife needs your acceptance on the NCS parent portal by 5pm today, Tuesday 20 Oct. It covers 28 Sep to 16 Oct. If it lapses, those hours may be charged privately. Shout if you get stuck and Lorraine will walk you through it.", tone: "Reassuring" });
  msg({ id: "MSG-1008", queue: "Accounts", familyId: "ROS1096", from: "Lisa Byrne", subject: "Instalment this week", body: "Sorry I missed Monday's payment, I'm paid Thursday. Can I pay the €81 then?", received: "2026-10-20 08:05", classification: "Payment plan query", confidence: 0.9, status: "New", channel: "Email", link: { kind: "plan", id: "PLN-031" },
    draft: "Hi Lisa, thanks for letting us know. Thursday 22 Oct for the €81 instalment is noted on your plan. As this is the third revision of the plan, we are not able to change the plan again, so please let us know straight away if Thursday becomes a problem. Gráinne, Accounts", tone: "Firm, kind" });
  msg({ id: "MSG-1009", queue: "Website form", from: "Website contact form", subject: "Enquiry · no Parent ID given", body: "Name: Helen Moran. I want to change my son's days to Mon/Tue. (No ROS Parent ID entered.)", received: "2026-10-20 06:58", classification: "Change request · unmatched", confidence: 0.61, status: "New", channel: "Web form",
    draft: "Hi Helen, thanks for your message. So we can update the right booking, could you reply with your ROS Parent ID (it starts with ROS, for example ROS1234)? You will find it in the MyRosKids app under Profile." });
  msg({ id: "MSG-1010", queue: "Parent app", familyId: "ROS1042", from: "Sinéad O'Neill", subject: "Bus today", body: "Hi, just checking Luca is on the bus from St Patrick's today? He has football gear with him.", received: "2026-10-20 08:21", classification: "Transport query", confidence: 0.94, status: "New", channel: "App", link: { kind: "route", id: "WKR-02" },
    draft: "Hi Sinéad, yes, Luca is on today's WKR-02 run with Gerry. Pickup at St Patrick's NS is scheduled for 14:45 and he will be signed in at Hazelbrook shortly after 15:00. You will see it live in MyRosKids." });
  msg({ id: "MSG-1011", queue: "Accounts", familyId: "ROS1198", from: "Stephen Doyle", subject: "Booking blocked?", body: "The app won't let me book Amy for November. Why?", received: "2026-10-19 18:40", classification: "Booking restriction query", confidence: 0.88, status: "Escalated", channel: "App", link: { kind: "plan", id: "PLN-024" } });
  const GENERIC: [Message["queue"], string, string, string][] = [
    ["Arklow", "Change of collector", "My sister Karen will collect on Thursday, is that ok?", "Collector change"],
    ["Wexford", "Halloween camp places", "Are there any spaces left in the Gorey Halloween camp for two?", "Camp enquiry"],
    ["Cork", "Camp NCS hours", "Can I use NCS hours for the Canovee camp?", "NCS camp hours"],
    ["Waterford", "Invoice query", "There's a late collection charge but I collected at 6. Can you check?", "Invoice dispute"],
    ["Dublin", "Sick today", "Not in today, temperature.", "Absence notice"],
    ["General", "Manual handling course", "Do you have places for 3 staff from our company in November?", "Training enquiry"],
    ["General", "Job application", "I have Level 6 and would like to apply for the relief panel.", "Recruitment"],
    ["NCS", "CHICK renewal", "My CHICK expires end of month, I've applied for the new one.", "CHICK renewal"],
    ["Parent app", "Medication form", "Uploaded the new inhaler form for Saoirse.", "Medical document"],
    ["Wicklow", "Booking window", "Forgot to book November, is it too late?", "Booking window query"],
    ["Accounts", "Direct debit failed", "Bank says the DD bounced, can I pay by card?", "Failed payment"],
    ["Arklow", "Photo consent", "Please remove photo consent for Jack.", "Consent change"],
  ];
  GENERIC.forEach(([queue, subject, body, cls], i) => {
    const f = nonFix[(i * 37) % nonFix.length];
    // Yesterday's messages spread through the day; today's all arrived before the 08:45 demo clock.
    const at = i < 5 ? "2026-10-19 " + String(9 + i * 2).padStart(2, "0") + ":" + String((i * 13) % 60).padStart(2, "0")
      : "2026-10-20 0" + (6 + (i % 3)) + ":" + String((i * 7) % 40).padStart(2, "0");
    msg({ id: "MSG-" + (1020 + i), queue, familyId: queue === "General" ? undefined : f.id, from: queue === "General" ? pick(["Wicklow Packaging Ltd", "Bríd Moran"]) : f.guardians[0].name, subject, body, received: at, classification: cls, confidence: round2(0.72 + r() * 0.25), status: i % 4 === 3 ? "Replied" : "New", channel: pick(["Email", "App", "App", "SMS"]) });
  });
  // Rich histories for the story families; light histories for a slice of everyone else.
  const fx = (id: string, rows: [string, string, CommEvent["direction"], string, string][]) => rows.forEach(([at, ch, d, s, by]) => addComm(id, at, ch, d, s, by));
  fx("ROS1042", [["2026-09-01 10:02", "App", "out", "Welcome back pack and September booking window opened", "System"], ["2026-10-12 09:00", "App", "out", "Booking window for w/c 19 Oct opened", "Bookings agent"], ["2026-10-15 18:01", "Email", "out", "Invoice for w/c 19 Oct issued, paid by card on file 16 Oct", "System"], ["2026-10-19 09:30", "App", "in", "Submitted bookings for w/c 2 Nov (4 sessions)", "Sinéad O'Neill"], ["2026-10-20 08:21", "App", "in", "Asked whether Luca is on today's bus", "Sinéad O'Neill"]]);
  fx("ROS1087", [["2026-09-07 11:15", "Phone", "note", "Agreed NCS hours changed 20h → 15h; next change allowed 2 Nov", "Lorraine Tobin"], ["2026-10-13 09:00", "App", "out", "NCS claim NCS-0091 raised for acceptance (€184.00)", "NCS agent"], ["2026-10-15 09:00", "App", "out", "Day 2 reminder: accept NCS-0091", "NCS agent"], ["2026-10-17 09:00", "App", "out", "Day 4 reminder: accept NCS-0091", "NCS agent"], ["2026-10-19 09:00", "SMS", "out", "Day 6 reminder: NCS-0091 lapses Tue 17:00", "NCS agent"], ["2026-10-19 21:14", "App", "in", "Asked how to accept the claim", "Rachel Kelly"]]);
  fx("ROS1132", [["2026-10-15 18:01", "Email", "out", "Invoice INV-20418 issued: €92.00, direct debit Fri 23 Oct", "System"], ["2026-10-20 07:52", "Email", "in", "Late booking request LBR-006 for Fri 23 Oct", "Emer Nolan"]]);
  fx("ROS1096", [["2026-09-14 10:30", "Phone", "note", "Plan revision 2 agreed (€486 over 6 weeks)", "Gráinne Whelan"], ["2026-10-05 12:12", "Email", "out", "Plan revision 3 of 3 sent for e-signature", "Collections agent"], ["2026-10-05 19:44", "Email", "in", "Plan revision 3 signed", "Lisa Byrne"], ["2026-10-19 23:59", "System", "note", "Instalment 1 (€81) not received", "Collections agent"], ["2026-10-20 08:05", "Email", "in", "Asked to pay €81 on Thursday", "Lisa Byrne"]]);
  fx("ROS1198", [["2026-08-20 09:10", "Email", "out", "Statement and final warning", "Accounts"], ["2026-09-22 15:00", "Phone", "note", "Third plan agreed: 4 × €153", "Gráinne Whelan"], ["2026-10-09 09:00", "App", "out", "Booking restricted after plan breach (approved by Accounts)", "Gráinne Whelan"], ["2026-10-14 09:00", "System", "note", "Second instalment missed: plan broken", "Collections agent"], ["2026-10-19 18:40", "App", "in", "Asked why bookings are blocked", "Stephen Doyle"]]);
  for (const f of nonFix.slice(0, 160)) {
    addComm(f.id, "2026-10-15 18:01", "Email", "out", "Weekly invoice issued for w/c 19 Oct", "System");
    if (chance(0.5)) addComm(f.id, "2026-10-1" + int(0, 9) + " 1" + int(0, 9) + ":" + String(int(0, 59)).padStart(2, "0"), pick(["App", "Email", "Phone"]), pick(["in", "out"]), pick(["Changed collector for Thursday", "Asked about Halloween camp", "Updated medical form", "Booking confirmed for w/c 2 Nov", "Reminder: booking window closes Thursday"]), pick(["Parent", "Bookings agent", "Location manager"]));
  }

  /* ---------------- automations ---------------- */
  const auto = (id: string, name: string, group: string, trigger: string, timing: string, audience: string, channels: string[], owner: string, approval: AutomationRule["approval"], delivered: number, opened: number, actioned: number, on = true, last: AutomationRule["runs"][0]["result"] = "ok", lastSummary = ""): AutomationRule => ({
    id, name, group, trigger, timing, audience, channels, owner, approval, on, delivered, opened, actioned,
    runs: [{ at: "2026-10-20 07:00", result: last, summary: lastSummary || delivered + " delivered" }, { at: "2026-10-19 07:00", result: "ok", summary: Math.round(delivered * 0.9) + " delivered" }, { at: "2026-10-16 07:00", result: "ok", summary: Math.round(delivered * 0.8) + " delivered" }],
  });
  const automations: AutomationRule[] = [
    auto("AU-01", "Booking window opening", "Bookings", "Window opens", "Mon 09:00", "All families with active children", ["App", "Email"], "Bookings agent", "Automatic", 478, 412, 297),
    auto("AU-02", "Booking window closes in 24h", "Bookings", "24h before close", "Wed 18:00", "Families not yet submitted", ["App", "SMS"], "Bookings agent", "Automatic", 181, 140, 0, true, "ok", "Scheduled for Wed 21 Oct 18:00"),
    auto("AU-03", "Booking window closes in 2h", "Bookings", "2h before close", "Thu 16:00", "Families not yet submitted", ["App", "SMS"], "Bookings agent", "Automatic", 64, 58, 31),
    auto("AU-04", "NCS hours under-booked", "NCS", "Submitted hours < agreed hours", "Daily 10:00 while window open", "NCS families", ["App", "Email"], "NCS agent", "Draft only", 4, 3, 1),
    auto("AU-05", "Invoice reminder sequence", "Collections", "Invoice unpaid", "Day 0 · 2 · 5 · 7", "Families with overdue invoices", ["Email", "App"], "Collections agent", "Automatic", 63, 51, 22),
    auto("AU-06", "Day 10 booking-block candidate", "Collections", "Invoice 10 days overdue", "Daily 09:00", "Accounts team", ["Pulse task"], "Collections agent", "Approval required", 3, 3, 1),
    auto("AU-07", "Day 14 phone follow-up", "Collections", "Invoice 14 days overdue", "Daily 09:00", "Accounts team", ["Pulse task"], "Collections agent", "Automatic", 4, 4, 2),
    auto("AU-08", "Failed direct debit retry", "Collections", "SEPA return code", "Retry Day 2 and Day 5", "Affected families", ["Email", "SMS"], "Collections agent", "Automatic", 9, 8, 5, true, "partial", "1 retry failed again (AM04)"),
    auto("AU-09", "Payment plan instalment due", "Collections", "Instalment due tomorrow", "Daily 17:00", "Families on plans", ["App", "SMS"], "Collections agent", "Automatic", 14, 13, 12),
    auto("AU-10", "CHICK expiring 30 / 14 / 7 days", "NCS", "CHICK expiry date", "Daily 08:00", "NCS families", ["App", "Email"], "NCS agent", "Automatic", 26, 22, 9),
    auto("AU-11", "NCS claim acceptance reminders", "NCS", "Claim awaiting acceptance", "Day 2 · 4 · 6", "NCS families", ["App", "SMS"], "NCS agent", "Automatic", 21, 19, 12),
    auto("AU-12", "Medical and consent documents", "Compliance", "Document missing or expiring", "Weekly Mon 08:00", "Families with gaps", ["App", "Email"], "Compliance agent", "Automatic", 31, 24, 11),
    auto("AU-13", "Camp registration and unpaid places", "Camps", "Place unpaid 48h", "Daily 12:00", "Camp families", ["App", "Email"], "Camps agent", "Automatic", 12, 11, 6),
    auto("AU-14", "Enquiry follow-up Day 1 / 3 / 7 / 14", "Enrolment", "New enquiry", "Day 1 · 3 · 7 · 14", "Prospective families", ["Email"], "Enrolment agent", "Draft only", 46, 39, 14),
    auto("AU-15", "Leaver two-month notice", "Enrolment", "Notice received", "On event", "Leaving families", ["Email"], "Accounts", "Approval required", 3, 3, 3),
    auto("AU-16", "Children's birthdays", "Families", "Birthday today", "Daily 07:30", "Room staff + family", ["App"], "Daily Diary agent", "Automatic", 9, 9, 9),
    auto("AU-17", "Incident parent follow-up", "Compliance", "Incident logged", "Same day 16:00", "Affected families", ["App"], "Compliance agent", "Approval required", 2, 1, 0),
    auto("AU-18", "Staff certificate expiry", "HR", "Garda / first aid / Children First / manual handling", "60 · 30 · 7 days", "Staff + location manager", ["Email", "Pulse task"], "Compliance agent", "Automatic", 6, 6, 1, true, "partial", "1 expired Garda vetting blocks rota"),
  ];

  /* ---------------- tasks and approvals ---------------- */
  let tkN = 101;
  const tasks: Task[] = [];
  const task = (t: Omit<Task, "id">) => { const x = { id: "TSK-" + tkN++, ...t }; tasks.push(x); return x; };
  task({ title: "Cover 3pm After School at Arklow Rocks", owner: "Deirdre Kinsella", due: "Today 14:30", dueDate: TODAY, priority: "High", department: "Operations", status: "In progress", link: { kind: "issue", id: "STAFF-ARK-019" }, source: "Ratio & Rota agent", locationId: "ARR" });
  task({ title: "Confirm Gorey cover for Wednesday", owner: "Tara Breen", due: "Today 17:00", dueDate: TODAY, priority: "High", department: "Operations", status: "Not started", link: { kind: "issue", id: "STAFF-GOR-021" }, source: "Ratio & Rota agent", locationId: "GOR" });
  task({ title: "Decide late booking LBR-006 (Nolan, Fri 23 Oct)", owner: "Siobhán Keogh", due: "Today 12:00", dueDate: TODAY, priority: "Medium", department: "Operations", status: "Not started", link: { kind: "request", id: "LBR-006" }, source: "Inbox agent", locationId: "HAZ" });
  task({ title: "Accounts follow-up call: Byrne plan (missed €81)", owner: "Gráinne Whelan", due: "Mon 26 Oct", dueDate: "2026-10-26", priority: "High", department: "Accounts", status: "Not started", link: { kind: "plan", id: "PLN-031" }, source: "Collections agent", locationId: "ARR" });
  task({ title: "Owner review: Doyle debt collection pack", owner: "Amanda Spiteri", due: "Fri 23 Oct", dueDate: "2026-10-23", priority: "High", department: "Owner", status: "Review", link: { kind: "approval", id: "APR-204" }, source: "Collections agent", locationId: "GOR" });
  task({ title: "Chase NCS-0091 acceptance before 17:00 (Kelly)", owner: "Lorraine Tobin", due: "Today 17:00", dueDate: TODAY, priority: "High", department: "NCS", status: "In progress", link: { kind: "claim", id: "NCS-0091" }, source: "NCS agent", locationId: "BRK" });
  task({ title: "Review 14 CHICKs expiring in October", owner: "Áine Mulvey", due: "Thu 22 Oct", dueDate: "2026-10-22", priority: "Medium", department: "NCS", status: "In progress", source: "NCS agent" });
  task({ title: "Thursday NCS check for camp week (w/c 26 Oct)", owner: "Lorraine Tobin", due: "Thu 22 Oct 12:00", dueDate: "2026-10-22", priority: "High", department: "NCS", status: "Not started", source: "NCS agent" });
  task({ title: "Renew Garda vetting: Shane Molloy (blocked from rota)", owner: "Orla Dempsey", due: "Overdue since 2 Oct", dueDate: "2026-10-02", priority: "High", department: "HR", status: "In progress", link: { kind: "staff", id: "S031" }, source: "Compliance agent", locationId: "BRK" });
  task({ title: "Book first aid refreshers (2 staff, November)", owner: "Orla Dempsey", due: "Fri 30 Oct", dueDate: "2026-10-30", priority: "Medium", department: "HR", status: "Not started", source: "Compliance agent" });
  task({ title: "Fire drill log: Burkeen Dales (October)", owner: "Fiona Kavanagh", due: "Fri 23 Oct", dueDate: "2026-10-23", priority: "Medium", department: "Compliance", status: "Not started", locationId: "BKD", source: "Compliance agent" });
  task({ title: "Phone follow-ups: 3 invoices past 14 days", owner: "Paul Hennessy", due: "Today", dueDate: TODAY, priority: "Medium", department: "Accounts", status: "Not started", source: "Collections agent" });
  task({ title: "Confirm Gorey Halloween camp excursion consents (4 missing)", owner: "Tara Breen", due: "Fri 23 Oct", dueDate: "2026-10-23", priority: "Medium", department: "Operations", status: "Not started", locationId: "GOR", source: "Camps agent" });
  task({ title: "Call back ENQ-310 (visit request)", owner: "Siobhán Keogh", due: "Today", dueDate: TODAY, priority: "Low", department: "Enrolment", status: "Not started", link: { kind: "enquiry", id: "ENQ-310" }, source: "Enrolment agent", locationId: "HAZ" });
  task({ title: "Approve Sunflowers weekly plan (Samhain theme)", owner: "Siobhán Keogh", due: "Thu 22 Oct", dueDate: "2026-10-22", priority: "Low", department: "Early Years", status: "Review", locationId: "HAZ", source: "Daily Diary agent" });
  task({ title: "Send Manual Handling joining instructions (4 Nov)", owner: "Kevin Lawless", due: "Fri 30 Oct", dueDate: "2026-10-30", priority: "Low", department: "Operations", status: "Not started", link: { kind: "course", id: "CRS-1104" }, source: "Staff" });
  task({ title: "Reconcile 6 bank lines from overnight feed", owner: "Michelle Kehoe", due: "Today", dueDate: TODAY, priority: "Medium", department: "Accounts", status: "In progress", source: "Collections agent" });
  task({ title: "Sign off October payroll timesheets", owner: "Deirdre Kinsella", due: "Mon 26 Oct", dueDate: "2026-10-26", priority: "Medium", department: "HR", status: "Not started", source: "Staff" });
  task({ title: "VAT and Revenue: September return filed", owner: "Gráinne Whelan", due: "Filed 14 Oct", dueDate: "2026-10-14", priority: "Medium", department: "Accounts", status: "Done", source: "Staff" });

  let apN = 201;
  const approvals: Approval[] = [];
  const appr = (a: Omit<Approval, "id" | "status">) => { const x: Approval = { id: "APR-" + apN++, status: "Pending", ...a }; approvals.push(x); return x; };
  appr({ kind: "Relief shift", title: "Relief: Aisling Byrne to Arklow Rocks, 09:00–17:30", summary: "Qualified relief (QQI Level 6, Garda vetting and first aid current). Restores 3 of 3 required for 3pm After School.", requestedBy: "Ratio & Rota agent", requestedAt: "2026-10-20 07:58", ownerRole: "ops", link: { kind: "issue", id: "STAFF-ARK-019" }, effect: "Adds one qualified shift to the Arklow Rocks rota, resolves STAFF-ARK-019", agentId: "rota" });
  appr({ kind: "Ratio cover", title: "Cover Gorey Wed 21 Oct with Niamh Corcoran", summary: "Forecast 41 booked vs 4 available (5 required). Niamh is the nearest qualified relief and free Wednesday.", requestedBy: "Ratio & Rota agent", requestedAt: "2026-10-20 07:44", ownerRole: "locmgr", link: { kind: "issue", id: "STAFF-GOR-021" }, effect: "Adds Niamh Corcoran to Gorey After School on Wed 21 Oct", agentId: "rota" });
  appr({ kind: "Booking block", title: "Restrict new bookings: Day 10 overdue account", summary: "Invoice 10 days overdue after Day 2, 5 and 7 reminders. Policy allows a booking restriction with Accounts approval.", requestedBy: "Collections agent", requestedAt: "2026-10-20 08:00", ownerRole: "accounts", effect: "Blocks new bookings for this family until paid; current week unaffected", agentId: "collections" });
  appr({ kind: "Debt collection pack", title: "Review debt collection pack: Doyle (ROS1198) €612", summary: "Third payment plan broken (2 of 4 instalments missed). Pack prepared with statement, plan history and contact log. Nothing is sent without your decision.", requestedBy: "Collections agent", requestedAt: "2026-10-16 09:00", ownerRole: "owner", link: { kind: "family", id: "ROS1198" }, amount: 612, effect: "Marks the pack as reviewed and approved for referral (no referral is sent in the demo)", agentId: "collections" });
  appr({ kind: "NCS private-charge proposal", title: "Charge privately: CHICK not received by Thursday deadline", summary: "Camp-week hours for one child have no valid CHICK on file for w/c 26 Oct. Proposal: charge 12h privately at €14.00 unless the CHICK arrives by Thu 22 Oct 12:00.", requestedBy: "NCS agent", requestedAt: "2026-10-20 08:10", ownerRole: "ncs", amount: 168, effect: "Moves 12h from NCS to private on the camp invoice", agentId: "ncs" });
  appr({ kind: "Credit adjustment", title: "Credit €15 late collection: disputed by parent", summary: "Parent says collection was 18:00, kiosk log shows 18:04. Policy bills the next full hour; the Waterford manager recommends a one-off goodwill credit.", requestedBy: "Rachel Power", requestedAt: "2026-10-19 16:20", ownerRole: "accounts", amount: 15, effect: "Adds a −€15 credit line to the family's current invoice", agentId: "inbox" });
  appr({ kind: "Incident notification", title: "Send incident summary to parent (minor bump, Sunflowers)", summary: "Incident logged 09:40 yesterday. Manager review done. Parent notified by phone; written summary awaits sign-off before it goes to the app.", requestedBy: "Compliance agent", requestedAt: "2026-10-19 16:00", ownerRole: "locmgr", effect: "Publishes the written incident summary to the parent for signature", agentId: "compliance" });
  appr({ kind: "Closure broadcast", title: "Proposed weather closure message: Canovee (Thursday)", summary: "Met Éireann orange wind warning for Cork Thursday afternoon (demo scenario). Draft closure message for 52 Canovee families. Exceptional closures need owner approval before any message or billing change.", requestedBy: "Ops Watchdog", requestedAt: "2026-10-20 08:30", ownerRole: "owner", effect: "Queues the broadcast (simulated). Fee handling under the closure policy stays a separate decision.", agentId: "ops" });
  // Link the block candidate approval to its family now the overdue set exists.
  const blockInv = invoices.find(i => i.id === odInvoiceIds[14])!;
  approvals[2].link = { kind: "family", id: blockInv.familyId };
  approvals[2].title = "Restrict new bookings: " + famOf(blockInv.familyId).surname + " (" + blockInv.familyId + ") · Day 10";
  approvals[2].amount = total(blockInv);
  const disputeFam = families.find(f => f.locationId === "DUN" && !fixtureIds.has(f.id))!;
  approvals[5].link = { kind: "family", id: disputeFam.id };
  const privFam = families.find(f => f.locationId === "GOR" && f.funding === "NCS" && !fixtureIds.has(f.id))!;
  approvals[4].link = { kind: "family", id: privFam.id };

  /* ---------------- safeguarding and compliance ---------------- */
  const eyKids = children.filter(c => c.programme === "EY");
  const incidents: Incident[] = [
    { id: "INC-0417", childId: eyKids[3].id, locationId: eyKids[3].locationId, date: "2026-10-19", time: "09:40", kind: "Minor bump · head", severity: "Minor", summary: "Slipped on the mat during free play and bumped forehead on the shelf. Cold compress applied, observed for 30 minutes, no further symptoms.", witnesses: ["Room Leader", "Practitioner"], parentNotified: true, parentSigned: false, managerReviewed: true, status: "Awaiting signature" },
    { id: "INC-0418", childId: children.filter(c => c.locationId === "GOR")[5].id, locationId: "GOR", date: "2026-10-19", time: "16:25", kind: "Graze · knee", severity: "Minor", summary: "Fell while playing tag in the yard. Graze cleaned and plaster applied.", witnesses: ["SAC Practitioner"], parentNotified: true, parentSigned: false, managerReviewed: true, status: "Awaiting signature" },
    { id: "INC-0412", childId: children.filter(c => c.locationId === "BMN")[2].id, locationId: "BMN", date: "2026-10-14", time: "17:05", kind: "Allergic reaction (mild)", severity: "Moderate", summary: "Mild hives after snack; antihistamine given per care plan, parent collected early.", witnesses: ["SAC Leader", "SAC Practitioner"], parentNotified: true, parentSigned: true, managerReviewed: true, status: "Closed" },
    { id: "INC-0409", childId: children.filter(c => c.locationId === "DUN")[7].id, locationId: "DUN", date: "2026-10-09", time: "15:40", kind: "Bite (peer)", severity: "Minor", summary: "Bitten on the arm by another child during a disagreement. Skin not broken.", witnesses: ["SAC Practitioner"], parentNotified: true, parentSigned: true, managerReviewed: true, status: "Closed" },
    { id: "INC-0415", childId: children.filter(c => c.locationId === "BRK")[4].id, locationId: "BRK", date: "2026-10-16", time: "17:30", kind: "Late collection (after 18:30)", severity: "Minor", summary: "Collected at 18:42. Two staff remained; parent contacted at 18:31.", witnesses: ["SAC Leader"], parentNotified: true, parentSigned: true, managerReviewed: false, status: "Open" },
  ];
  // One medication record needs review: an inhaler expiring this week.
  const medKid = children.find(c => c.medication && c.locationId === "HAZ" && c.id !== finn.id) || children.find(c => c.medication)!;
  medKid.medication!.expires = "2026-10-25";
  const checks: SiteCheck[] = [];
  let ckN = 1;
  for (const l of locations) for (const kind of ["Fire drill (monthly)", "Fridge temperature log", "Cleaning schedule sign-off", "First aid box check", "Outdoor area safety check"]) {
    const done = !(l.id === "BKD" && kind.startsWith("Fire")) && !(l.id === "DUN" && kind.startsWith("Fridge")) && chance(0.92);
    checks.push({ id: "CHK-" + ckN++, locationId: l.id, kind, due: kind.startsWith("Fire") ? "2026-10-23" : "2026-10-20", done, by: done ? staff.find(s => s.id === l.managerId)!.name : undefined });
  }
  const policies: Policy[] = [
    { id: "POL-01", name: "Child Safeguarding Statement", version: "v7.2", updated: "2026-09-01", acknowledged: 97, required: 100 },
    { id: "POL-02", name: "Administration of Medication", version: "v4.0", updated: "2026-08-18", acknowledged: 88, required: 91 },
    { id: "POL-03", name: "Accidents and Incidents", version: "v5.1", updated: "2026-06-10", acknowledged: 91, required: 91 },
    { id: "POL-04", name: "Collection and Late Collection", version: "v3.3", updated: "2026-09-14", acknowledged: 84, required: 91 },
    { id: "POL-05", name: "Outings and Transport", version: "v2.6", updated: "2026-05-02", acknowledged: 91, required: 91 },
    { id: "POL-06", name: "GDPR and Records Retention", version: "v2.0", updated: "2026-03-20", acknowledged: 100, required: 100 },
    { id: "POL-07", name: "Fees and Payment Terms", version: "2026/27", updated: "2026-08-25", acknowledged: 100, required: 100 },
    { id: "POL-08", name: "Behaviour Management", version: "v4.4", updated: "2026-07-01", acknowledged: 89, required: 91 },
  ];

  /* ---------------- camps and courses ---------------- */
  const camps: Camp[] = [
    { id: "CMP-GOR-HW", name: "Halloween Camp · Gorey", locationId: "GOR", start: "2026-10-26", end: "2026-10-30", ages: "5–12", themes: ["Six Bricks LEGO", "Spooky science", "Sports", "Costume parade"], capacity: 24, dayRate: 38, ncsEligible: true, staffIds: gorPool.slice(0, 3).map(s => s.id), excursion: { day: "2026-10-29", where: "Wells House pumpkin trail", consentNeeded: true }, season: "Halloween 2026" },
    { id: "CMP-CAN-HW", name: "Halloween Camp · Canovee", locationId: "CAN", start: "2026-10-26", end: "2026-10-30", ages: "5–12", themes: ["LEGO coding", "Nature trail", "Sports", "Pumpkin carving"], capacity: 20, dayRate: 36, ncsEligible: true, staffIds: staff.filter(s => s.locationId === "CAN" && /SAC/.test(s.role)).slice(0, 2).map(s => s.id), excursion: { day: "2026-10-28", where: "Fota Wildlife Park", consentNeeded: true }, season: "Halloween 2026" },
    { id: "CMP-GOR-SU", name: "Summer Camp · Gorey", locationId: "GOR", start: "2026-07-06", end: "2026-07-31", ages: "5–12", themes: ["Sports", "Six Bricks LEGO", "Outings"], capacity: 40, dayRate: 36, ncsEligible: true, staffIds: [], season: "Summer 2026", past: { booked: 37, revenue: 21420 } },
    { id: "CMP-CAN-SU", name: "Summer Camp · Canovee", locationId: "CAN", start: "2026-07-06", end: "2026-07-24", ages: "5–12", themes: ["LEGO coding", "Outdoor skills"], capacity: 30, dayRate: 34, ncsEligible: true, staffIds: [], season: "Summer 2026", past: { booked: 26, revenue: 12410 } },
    { id: "CMP-GOR-EA", name: "Easter Camp · Gorey", locationId: "GOR", start: "2026-03-30", end: "2026-04-03", ages: "5–12", themes: ["Easter crafts", "Sports"], capacity: 24, dayRate: 36, ncsEligible: true, staffIds: [], season: "Easter 2026", past: { booked: 21, revenue: 3610 } },
  ];
  const campRegs: CampRegistration[] = [];
  let crN = 1;
  for (const [campId, loc, confirmed, pending] of [["CMP-GOR-HW", "GOR", 18, 2], ["CMP-CAN-HW", "CAN", 16, 1]] as [string, LocationId, number, number][]) {
    const kids = shuffle(children.filter(c => c.locationId === loc && c.programme === "SAC" && !famOf(c.familyId).blocked));
    kids.slice(0, confirmed + pending).forEach((c, i) => {
      const f = famOf(c.familyId);
      campRegs.push({ id: "CR" + crN++, campId, childId: c.id, familyId: f.id, days: pick([3, 4, 5, 5, 5]), paid: i < confirmed, ncsHours: f.funding === "NCS" ? pick([0, 6, 9, 12]) : 0, status: i < confirmed ? "Confirmed" : "Pending payment" });
    });
  }
  const courses: Course[] = [
    { id: "CRS-1014", name: "Manual Handling (QQI-aligned, half day)", date: "2026-10-14", start: "09:30", venue: "Hazelbrook training room", capacity: 10, trainerId: "S008", price: 85 },
    { id: "CRS-1104", name: "Manual Handling (QQI-aligned, half day)", date: "2026-11-04", start: "09:30", venue: "Hazelbrook training room", capacity: 10, trainerId: "S008", price: 85 },
    { id: "CRS-1118", name: "Manual Handling (QQI-aligned, half day)", date: "2026-11-18", start: "13:30", venue: "Hazelbrook training room", capacity: 10, trainerId: "S008", price: 85 },
  ];
  const courseBookings: CourseBooking[] = [];
  let cbN = 1;
  const COMPANIES = ["Wicklow Packaging Ltd", "Arklow Marine Supplies", "Rathnew Builders Providers", "Glenealy Care Home"];
  const cb = (courseId: string, n: number, status: CourseBooking["status"], paidUpTo: number, company?: string) => {
    for (let i = 0; i < n; i++) {
      const name = (chance(0.5) ? pick(ADULT_F) : pick(ADULT_M)) + " " + pick(SURNAMES);
      courseBookings.push({ id: "CB" + cbN++, courseId, name, company: company || (chance(0.3) ? pick(COMPANIES) : undefined), email: name.toLowerCase().replace(/[^a-z]+/g, ".") + "@trainees.demo.roskids.example", paid: i < paidUpTo, status, certificate: status === "Certified" ? "MH-2026-" + (300 + cbN) : undefined });
    }
  };
  cb("CRS-1014", 10, "Certified", 10);
  cb("CRS-1104", 4, "Booked", 4, "Wicklow Packaging Ltd");
  cb("CRS-1104", 3, "Booked", 1);
  cb("CRS-1118", 3, "Reserved", 1);

  /* ---------------- early years diary (today) ---------------- */
  const diary: DiaryEntry[] = [];
  let dyN = 1;
  for (const c of eyKids.filter(c => attendance.some(a => a.childId === c.id && a.date === TODAY && a.kind === "in")).slice(0, 34)) {
    const crèche = c.roomId.endsWith("CR");
    diary.push({ id: "DY" + dyN++, childId: c.id, date: TODAY, roomId: c.roomId,
      meals: pick(["Breakfast: porridge, ate all", "Breakfast: toast and fruit, ate most", "Breakfast: yoghurt, ate some"]),
      sleep: crèche ? pick(["Not yet", "Settling for nap at 11:30"]) : "n/a", nappies: crèche ? pick(["1 wet 08:30", "1 wet, 1 dirty"]) : "Toilet independent",
      mood: pick(["Happy and chatty", "Settled after a quiet start", "Energetic", "Calm, focused"]),
      activity: pick(["Pumpkin printing", "Sand and water tray", "Story: Room on the Broom", "Building towers with blocks", "Leaf collecting in the garden"]),
      note: pick(["Shared toys well with friends.", "Asked lots of questions about autumn leaves.", "Counted to 10 during snack.", "Enjoyed singing Samhain songs."]),
      observation: !crèche && chance(0.5) ? { text: c.firstName + " sorted leaves by colour and size and explained the groups to a friend.", tags: ["Aistear: Exploring and Thinking", "Síolta: Play"] } : undefined,
      status: chance(0.3) ? "Ready for review" : "Draft", author: staff.find(s => s.id === c.keyWorkerId)?.name || "Room team" });
  }

  /* ---------------- agent log and activity ---------------- */
  let agN = 1;
  const agentActions: AgentAction[] = [];
  const ag = (agentId: string, at: string, text: string, kind: AgentAction["kind"], link?: AgentAction["link"]) => agentActions.push({ id: "AG" + agN++, agentId, at, text, kind, link });
  ag("briefing", "2026-10-20 08:45", "Morning brief prepared: 7 decisions across 9 locations", "run");
  ag("rota", "2026-10-20 07:58", "Proposed Aisling Byrne for Arklow Rocks 09:00–17:30 (STAFF-ARK-019)", "proposal", { kind: "approval", id: "APR-201" });
  ag("rota", "2026-10-20 07:44", "Forecast Gorey Wed After School 41 booked vs 4 available; proposed Niamh Corcoran", "proposal", { kind: "approval", id: "APR-202" });
  ag("rota", "2026-10-20 07:30", "Blocked Shane Molloy from Brookfield rota: Garda vetting expired 2 Oct", "action", { kind: "staff", id: "S031" });
  ag("ncs", "2026-10-19 09:00", "Day 6 reminder sent for NCS-0091 (Kelly, €184.00)", "action", { kind: "claim", id: "NCS-0091" });
  ag("ncs", "2026-10-20 08:00", "4 families under-booked on agreed NCS hours for w/c 2 Nov", "run");
  ag("ncs", "2026-10-20 08:10", "Proposed private charge where a CHICK is missing for camp week", "proposal", { kind: "approval", id: "APR-205" });
  ag("collections", "2026-10-20 08:00", "Reminder run: Day 2 × 4, Day 5 × 4, Day 7 × 3 sent", "run");
  ag("collections", "2026-10-20 08:00", "Raised Day 10 booking-block candidate for Accounts approval", "proposal", { kind: "approval", id: "APR-203" });
  ag("collections", "2026-10-20 00:05", "Byrne instalment (€81, due 19 Oct) not received; follow-up task created", "escalation", { kind: "plan", id: "PLN-031" });
  ag("collections", "2026-10-16 09:00", "Prepared Doyle debt collection pack; awaiting owner review", "proposal", { kind: "approval", id: "APR-204" });
  ag("collections", "2026-10-20 06:30", "Bank feed: 6 lines, 3 exact matches, 2 ambiguous, 1 unmatched", "run");
  ag("inbox", "2026-10-20 07:53", "Classified LBR-006 (Nolan) as late booking, 97% confidence; draft ready", "action", { kind: "request", id: "LBR-006" });
  ag("inbox", "2026-10-20 06:59", "Website form without Parent ID: asked parent for ROS ID", "action", { kind: "message", id: "MSG-1009" });
  ag("bookings", "2026-10-19 09:00", "Opened booking window for w/c 2 Nov across 9 locations", "run");
  ag("bookings", "2026-10-20 08:15", "Capacity check on 6 late requests: 6 have space, 6 within ratio", "run");
  ag("transport", "2026-10-20 07:00", "Built today's manifests from accepted bookings: 6 routes", "run");
  ag("ops", "2026-10-20 08:30", "Weather watch: proposed Canovee closure message (approval only)", "proposal", { kind: "approval", id: "APR-208" });
  ag("ops", "2026-10-20 08:40", "Watching 2 ratio issues and 13 open booking requests", "run");
  ag("enrolment", "2026-10-20 08:00", "4 new enquiries; Day 1 follow-ups drafted", "run");
  ag("diary", "2026-10-20 08:40", "Drafted " + diary.length + " daily diaries from practitioner notes (none published)", "run");
  ag("compliance", "2026-10-20 07:00", "5 staff certificates due inside 30 days; 1 expired", "run");
  ag("compliance", "2026-10-20 07:05", "Medication review: inhaler expires 25 Oct", "escalation", { kind: "child", id: medKid.id });
  ag("camps", "2026-10-20 07:30", "Halloween camps: Gorey 18/24, Canovee 16/20 confirmed; 3 places unpaid", "run");
  ag("sunny", "2026-10-20 08:21", "Answered Sinéad O'Neill: Luca is on WKR-02 today", "action", { kind: "family", id: "ROS1042" });
  ag("sunny", "2026-10-19 20:10", "12 parent questions answered; 2 routed to staff (billing dispute, consent change)", "run");

  let evN = 1;
  const activity: ActivityEvent[] = [];
  const ev = (at: string, actor: string, actorKind: ActivityEvent["actorKind"], category: ActivityEvent["category"], title: string, detail: string, link?: ActivityEvent["link"], locationId?: LocationId) =>
    activity.push({ id: "EV" + evN, seq: evN++, at, actor, actorKind, category, title, detail, link, locationId });
  ev("2026-10-19 09:00", "Bookings agent", "agent", "Operations", "Booking window opened for w/c 2 Nov", "478 families notified by app and email.", undefined);
  ev("2026-10-19 16:20", "Rachel Power", "person", "Financial", "Credit adjustment requested (€15)", "Late collection dispute, Dungarvan.", { kind: "approval", id: "APR-206" }, "DUN");
  ev("2026-10-19 18:40", "Stephen Doyle", "person", "Communications", "Parent asked why bookings are blocked", "Escalated to Accounts.", { kind: "family", id: "ROS1198" }, "GOR");
  ev("2026-10-19 21:14", "Rachel Kelly", "person", "NCS", "Parent asked how to accept NCS-0091", "Claim lapses today 17:00.", { kind: "claim", id: "NCS-0091" }, "BRK");
  ev("2026-10-20 00:05", "Collections agent", "agent", "Financial", "Byrne instalment missed (€81)", "Plan PLN-031 revision 3 of 3. Follow-up task for Accounts.", { kind: "plan", id: "PLN-031" }, "ARR");
  ev("2026-10-20 06:30", "Bank feed", "system", "Financial", "Overnight bank feed imported", "6 lines · 3 exact, 2 ambiguous, 1 unmatched.", undefined);
  ev("2026-10-20 07:00", "Transport agent", "agent", "Transport", "Manifests built for 6 routes", "From accepted bookings; WKR-02 carries 9 today.", { kind: "route", id: "WKR-02" }, "HAZ");
  ev("2026-10-20 07:30", "Ratio & Rota agent", "agent", "Staffing", "Shane Molloy blocked from rota", "Garda vetting expired 2 Oct.", { kind: "staff", id: "S031" }, "BRK");
  ev("2026-10-20 07:40", "Tara Breen", "person", "Staffing", "Sick call logged for Wednesday", "Gorey forecast drops to 4 of 5 required.", { kind: "issue", id: "STAFF-GOR-021" }, "GOR");
  ev("2026-10-20 07:52", "Emer Nolan", "person", "Communications", "Late booking request received (LBR-006)", "Finn Nolan · Fri 23 Oct 15:00–18:00 · St Patrick's pickup.", { kind: "request", id: "LBR-006" }, "HAZ");
  ev("2026-10-20 07:58", "Ratio & Rota agent", "agent", "Staffing", "Relief proposed for Arklow Rocks", "Aisling Byrne or Ciara Walsh; approval needed.", { kind: "issue", id: "STAFF-ARK-019" }, "ARR");
  ev("2026-10-20 08:00", "Collections agent", "agent", "Financial", "Reminder sequence ran", "11 reminders sent, 1 block candidate raised.", undefined);
  ev("2026-10-20 08:05", "Lisa Byrne", "person", "Communications", "Parent asked to pay instalment Thursday", "Accounts queue.", { kind: "family", id: "ROS1096" }, "ARR");
  ev("2026-10-20 08:21", "Sinéad O'Neill", "person", "Communications", "Parent asked about today's bus", "Sunny answered: Luca is on WKR-02.", { kind: "family", id: "ROS1042" }, "HAZ");
  ev("2026-10-20 08:30", "Ops Watchdog", "agent", "Operations", "Weather closure message proposed (Canovee)", "Owner approval required.", { kind: "approval", id: "APR-208" }, "CAN");
  ev("2026-10-20 08:40", "Daily Diary agent", "agent", "Operations", "Daily diaries drafted", diary.length + " drafts waiting for practitioner review.", undefined);
  ev("2026-10-20 08:44", "Kiosks", "system", "Operations", "Morning registers synced", "Morning club children walked to school.", undefined);

  const config: RosState["config"] = { sacRatio: 10, lateFee: 5, transportFee: 3, noticeHours: 24, lateCollectionPer15: 0, reminderDays: [0, 2, 5, 7], blockDay: 10, phoneDay: 14, planMaxRevisions: 3, ncsChangeWeeks: 8, claimDays: 7, leavingNoticeMonths: 2, ncsLeaveNoticeWeeks: 4 };

  return {
    seq: 5000, clockMin: 8 * 60 + 45, // runtime ids start at 5000 so they never collide with seeded ones
    locations, rooms, schools, staff, shifts, absences, families, children, awards, claims, bookings, windows, requests, attendance,
    vehicles, routes, invoices, payments, plans, bank, enquiries, waitlist, messages, comms, automations, tasks, approvals,
    incidents, checks, policies, camps, campRegs, courses, courseBookings, diary, issues, agentActions, activity, config,
  };
}
