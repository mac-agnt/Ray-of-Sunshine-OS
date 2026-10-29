/* Static configuration for Ray of Sunshine OS on Pulse: icons, navigation, Records files,
   settings and agent chat history. Live numbers come from src/ros (the store). */

const INK="var(--ink)", BODY="var(--body)", DIM="var(--dim)", FAINT="var(--faint)";
const LIME="var(--accent)", GREEN="var(--ok)", AMBER="var(--warn)", RED="var(--bad)", NEUTRAL="var(--neutral)";
const MONO="var(--mono)";

const ICONS = {
  navHome:"M12 3.2 3.6 9.1v10a1.5 1.5 0 0 0 1.5 1.5h13.8a1.5 1.5 0 0 0 1.5-1.5v-10L12 3.2Z M8.9 13.1h2l1-2.6 1.5 5 1.1-2.4h1.6",
  navAgents:"M12 2.4v2.3 M12 2.4a.9.9 0 1 0 0-.02 M8.2 6.5h7.6A2.2 2.2 0 0 1 18 8.7v5.1a2.2 2.2 0 0 1-2.2 2.2H8.2A2.2 2.2 0 0 1 6 13.8V8.7a2.2 2.2 0 0 1 2.2-2.2Z M9.9 10.6v1.4 M14.1 10.6v1.4 M6 10h-1.9 M18 10h1.9 M9.2 18.6h5.6 M9.2 21.2h5.6",
  navDash:"M4 5.6h7.2v5.1H4V5.6Z M13.6 5.6H20v8.6h-6.4V5.6Z M4 13.1h7.2v5.3H4v-5.3Z M13.6 16.6H20v1.8h-6.4v-1.8Z",
  navWork:"M9.4 4.4h5.2a1.4 1.4 0 0 1 1.4 1.4v1.1h2.4A1.6 1.6 0 0 1 20 8.5v9.1a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 17.6V8.5a1.6 1.6 0 0 1 1.6-1.6H8V5.8a1.4 1.4 0 0 1 1.4-1.4Z M8 6.9h8 M9.6 13.3l1.8 1.8 3.4-3.6",
  navRecords:"M12 3.6c3.9 0 7 1.1 7 2.5S15.9 8.6 12 8.6 5 7.5 5 6.1 8.1 3.6 12 3.6Z M5 6.1v5.7c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6.1 M5 11.8v5.7c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5.7",
  navActivity:"M4.6 4.6h14.8A1.6 1.6 0 0 1 21 6.2v11.6a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 17.8V6.2a1.6 1.6 0 0 1 1.6-1.6Z M6 12.4h2.2l1.5-4.1 2.3 8 1.9-5.4 1.2 1.5H18",
  navAdmin:"M12 2.9 5 5.6v5.9c0 4 2.8 7.1 7 8.6 4.2-1.5 7-4.6 7-8.6V5.6L12 2.9Z M12 8.6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z M8.8 16.3a3.6 3.6 0 0 1 6.4 0",
  helios:"M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4-.8L3 21l1.9-4.9A8.3 8.3 0 0 1 4 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z M8 12h1.6l1.2-2.6 1.6 5 1.4-2.4H16",
  inbox:"M3 13h4l1.5 3h7l1.5-3h4 M3 13l2.4-7A2 2 0 0 1 7.3 4.6h9.4a2 2 0 0 1 1.9 1.4L21 13v4.4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V13Z",
  work:"M6 4.6h12a1.6 1.6 0 0 1 1.6 1.6v12.2A1.6 1.6 0 0 1 18 20H6a1.6 1.6 0 0 1-1.6-1.6V6.2A1.6 1.6 0 0 1 6 4.6Z M8.4 10.4l1.9 1.9 3.9-3.9 M8.4 15.6h7.2",
  approvals:"M12 3.6 19.5 6v6.1c0 4-3.1 6.9-7.5 8.3-4.4-1.4-7.5-4.3-7.5-8.3V6L12 3.6Z M9.2 12.2l2 2 3.6-3.7",
  insights:"M4.5 19.5V13 M9.7 19.5V7.5 M14.9 19.5v-8 M20 19.5V5",
  people:"M12 12.5a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z M5 20.2c.9-3.1 3.6-4.9 7-4.9s6.1 1.8 7 4.9",
  orgs:"M4.5 20V6.4A1.4 1.4 0 0 1 5.9 5h6.2a1.4 1.4 0 0 1 1.4 1.4V20 M13.5 10.5h4.6A1.4 1.4 0 0 1 19.5 12v8 M3 20h18 M7.5 8.5h2.5 M7.5 12h2.5 M7.5 15.5h2.5",
  teams:"M9 12a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 12Z M16.5 12.5a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z M2.6 19.6c.8-2.8 3.2-4.4 6.4-4.4s5.6 1.6 6.4 4.4 M17 15.4c2.2.4 3.7 1.8 4.3 4.2",
  locations:"M12 21s6.5-5.6 6.5-11a6.5 6.5 0 1 0-13 0C5.5 15.4 12 21 12 21Z M12 12.8a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z",
  visits:"M8 4v3 M16 4v3 M4.5 9.5h15 M6.4 6h11.2A1.9 1.9 0 0 1 19.5 8v10a1.9 1.9 0 0 1-1.9 1.9H6.4A1.9 1.9 0 0 1 4.5 18V8A1.9 1.9 0 0 1 6.4 6Z M9 13.5l1.6 1.6 3.4-3.4",
  autos:"M18.5 8.5A5 5 0 0 0 8.9 7.3 3.8 3.8 0 0 0 6 14.6 M8 17.5l3.2 3.2 M11.2 20.7l3.2-3.2 M11.2 20.7V9.6",
  health:"M3 12.5h3.4l2-5 3 10 2.2-5H21",
  modules:"M6.6 4.4h10.8a2.2 2.2 0 0 1 2.2 2.2v10.8a2.2 2.2 0 0 1-2.2 2.2H6.6a2.2 2.2 0 0 1-2.2-2.2V6.6a2.2 2.2 0 0 1 2.2-2.2Z M4.4 9.6h15.2 M9.6 19.6V9.6",
  agents:"M8.5 3.6h7A2.4 2.4 0 0 1 17.9 6v5.6a2.4 2.4 0 0 1-2.4 2.4h-7A2.4 2.4 0 0 1 6.1 11.6V6a2.4 2.4 0 0 1 2.4-2.4Z M9.6 8.2h.01 M14.4 8.2h.01 M12 14v2.6 M7.6 20.4h8.8 M12 16.6c-2.4 0-4.4 1.7-4.4 3.8h8.8c0-2.1-2-3.8-4.4-3.8Z",
  dash:"M4.4 4.4h6v6h-6v-6Z M13.6 4.4h6v3.6h-6V4.4Z M13.6 11.6h6v8h-6v-8Z M4.4 14h6v5.6h-6V14Z",
  files:"M5 7.2a1.8 1.8 0 0 1 1.8-1.8h3l1.8 2.2h5.6A1.8 1.8 0 0 1 19 9.4v7.4a1.8 1.8 0 0 1-1.8 1.8H6.8A1.8 1.8 0 0 1 5 16.8V7.2Z",
  pulseLine:"M2.5 12.5h3.6l2.1-6.4 3.2 12.2 2.6-8.4 1.8 2.6h5.7",
  records:"M6.4 3.6h7.4l4.2 4.2v12.6H6.4V3.6Z M13.4 3.8v4.2h4.2 M9 12.4h6 M9 16h4",
  tree:"M4.5 6h5 M4.5 12h5 M4.5 18h5 M12.5 6h7 M12.5 12h7 M12.5 18h7",
  graph:"M7 7.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z M17.6 10.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z M9.4 21.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z M8.6 6.4l7.6 2.6 M15.8 11.4l-5.6 5.2",
  bell:"M6 8.5a6 6 0 0 1 12 0c0 6.5 2.6 8.5 2.6 8.5H3.4S6 15 6 8.5Z M10.3 20.5a1.94 1.94 0 0 0 3.4 0",
  bus:"M6.5 4h11A2.5 2.5 0 0 1 20 6.5V16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6.5A2.5 2.5 0 0 1 6.5 4Z M4 11h16 M7.5 17v2 M16.5 17v2 M7.5 14h.01 M16.5 14h.01",
  sprout:"M12 20v-8 M12 12c0-3.6-2.6-6.2-6.6-6.2 0 3.8 2.6 6.2 6.6 6.2Z M12 12.5c0-3 2.2-5.3 5.8-5.3 0 3.2-2.2 5.3-5.8 5.3Z M7 20h10",
  tent:"M12 4 3.5 19.5h17L12 4Z M12 4v15.5 M9 19.5l3-5.5 3 5.5",
  enrol:"M9 11.5a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z M3 20c.8-3 3.1-4.7 6-4.7 1.4 0 2.6.4 3.6 1 M18 13v6 M15 16h6",
  cert:"M6 3.5h12v11H6z M9 7.5h6 M9 10.5h4 M10 14.5l-1.5 6 3.5-2 3.5 2-1.5-6",
  staff:"M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M16.5 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z M3 19.5c.6-2.8 2.8-4.4 5.5-4.4s4.9 1.6 5.5 4.4 M14.5 15.3c2.6.2 4.4 1.7 5 4.2",
  shield:"M12 3.6 19.5 6v6.1c0 4-3.1 6.9-7.5 8.3-4.4-1.4-7.5-4.3-7.5-8.3V6L12 3.6Z M12 9v4 M12 15.6h.01",
  reports:"M5 20V10 M10 20V4 M15 20v-7 M20 20V8 M3.5 20h17",
  heart:"M12 19.5s-7.5-4.4-7.5-9.6A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.3c0 5.2-7.5 9.6-7.5 9.6Z"
};

/* Ontology stays first and is never removed (PulseLogic enforces this too). */
const REC_SECTIONS = [
  {id:"ontology", label:"Ontology", blurb:"How every record connects: families, children, bookings, money, NCS and staff."},
  {id:"files", label:"Files", blurb:"Policies, fee terms, NCS letters and certificates, indexed where Pulse can read them."},
  {id:"contacts", label:"Contacts", blurb:"Staff, guardians and partners the business deals with."},
  {id:"explorer", label:"Record Explorer", blurb:"Search any record and walk its relationships."},
  {id:"entities", label:"Entity Types", blurb:"The childcare ontology: every entity, its fields and links."},
  {id:"history", label:"Linked History", blurb:"Everything that touched a record, in order."}
];

const CONTACTS = [
  ["Amanda Spiteri","Owner","amanda.spiteri@demo.roskids.example","Ray of Sunshine · Hazelbrook","staff","var(--accent)"],
  ["Deirdre Kinsella","Operations Manager","deirdre.kinsella@demo.roskids.example","Ray of Sunshine · all sites","staff","#9fd6f0"],
  ["Gráinne Whelan","Accounts","grainne.whelan@demo.roskids.example","Ray of Sunshine · Accounts","staff","#e6c78a"],
  ["Lorraine Tobin","NCS Administrator","lorraine.tobin@demo.roskids.example","Ray of Sunshine · NCS","staff","#c8b4f0"],
  ["Joanne Redmond","Location Manager","joanne.redmond@demo.roskids.example","Arklow Rocks","staff","#a8e0c0"],
  ["Tara Breen","Location Manager","tara.breen@demo.roskids.example","Gorey","staff","#9fd6f0"],
  ["Gerry Doran","Driver · WKR-02","gerry.doran@demo.roskids.example","Hazelbrook transport","staff","#e6c78a"],
  ["Sinéad O'Neill","Parent · ROS1042","sinead.oneill@parents.demo.roskids.example","O'Neill family","parent","#9fd6f0"],
  ["Emer Nolan","Parent · ROS1132","emer.nolan@parents.demo.roskids.example","Nolan family","parent","#a8e0c0"],
  ["Rachel Kelly","Parent · ROS1087","rachel.kelly@parents.demo.roskids.example","Kelly family","NCS","#c8b4f0"],
  ["Lisa Byrne","Parent · ROS1096","lisa.byrne@parents.demo.roskids.example","Byrne family","payment plan","#e6c78a"],
  ["Stephen Doyle","Parent · ROS1198","stephen.doyle@parents.demo.roskids.example","Doyle family","blocked","#e2a08c"],
  ["Training enquiries","Corporate client","training@wicklowpackaging.demo.example","Wicklow Packaging Ltd","course","#c8b4f0"]
];

const FILE_TREE = [
  {type:"folder", id:"f-pol", name:"Policies", depth:0},
  {type:"file", id:"fl-1", name:"Fees and Payment Terms 2026-27.pdf", depth:1, parent:"f-pol", indexed:true,
   path:"Policies / Fees", title:"Fees and Payment Terms 2026/27",
   facts:[["TYPE","PDF · 6 pages"],["UPDATED","25 Aug 2026"],["INDEXED","All 6 pages"],["OWNER","Gráinne Whelan"]],
   body:["Fees are due on receipt. Bookings are made weekly inside the booking window; once a week is locked, cancellations are not refunded.",
     "Late booking and change requests need at least 24 hours' notice on a weekday and are subject to space and staffing. Part hours are billed to the next full hour.",
     "Leaving the service needs two months' written notice. Payment plans can be revised at most three times. These are Ray of Sunshine operating policies, not statutory rules."],
   links:[["Billing & Collections","area"],["Gráinne Whelan","person"],["INV-20418","invoice"]]},
  {type:"file", id:"fl-2", name:"Child Safeguarding Statement v7.2.pdf", depth:1, parent:"f-pol", indexed:true,
   path:"Policies / Safeguarding", title:"Child Safeguarding Statement v7.2",
   facts:[["TYPE","PDF · 11 pages"],["UPDATED","1 Sep 2026"],["ACKNOWLEDGED","97 of 100 staff"],["OWNER","Orla Dempsey"]],
   body:["Names the designated liaison persons for each site and the reporting route for a concern.",
     "Three staff have not yet acknowledged this version; the Compliance agent has a reminder queued for them."],
   links:[["Compliance & Safeguarding","area"],["Orla Dempsey","person"]]},
  {type:"folder", id:"f-ncs", name:"NCS and funding", depth:0},
  {type:"file", id:"fl-3", name:"NCS claim acceptance guide for parents.pdf", depth:1, parent:"f-ncs", indexed:true,
   path:"NCS / Parent guides", title:"Accepting an NCS claim",
   facts:[["TYPE","PDF · 2 pages"],["UPDATED","2 Sep 2026"],["INDEXED","Both pages"],["OWNER","Lorraine Tobin"]],
   body:["Step-by-step guide sent with claim reminders on Days 2, 4 and 6 of the seven-day acceptance window.",
     "Linked to claim NCS-0091 for the Kelly family, which lapses today at 17:00."],
   links:[["NCS-0091","claim"],["Kelly family","family"]]},
  {type:"file", id:"fl-4", name:"Award letters (masked).zip", depth:1, parent:"f-ncs", indexed:false,
   path:"NCS / Award letters", title:"Award letters (masked)",
   facts:[["TYPE","ZIP · 412 letters"],["UPDATED","19 Oct 2026"],["INDEXED","Not indexed"],["OWNER","NCS team"]],
   body:["CHICK references are masked in every view. Letters are stored but not indexed, so agents read award data from the NCS register instead."],
   links:[["NCS & Funding","area"]]},
  {type:"folder", id:"f-hr", name:"Staff certificates", depth:0},
  {type:"file", id:"fl-5", name:"Garda vetting register.xlsx", depth:1, parent:"f-hr", indexed:true,
   path:"HR / Vetting", title:"Garda vetting register",
   facts:[["TYPE","XLSX · 100 rows"],["UPDATED","20 Oct 2026"],["INDEXED","Yes"],["OWNER","Orla Dempsey"]],
   body:["One vetting has lapsed (Shane Molloy, Brookfield, 2 Oct) and he is blocked from the rota until renewed.",
     "Five other certificates fall due in the next 30 days across first aid, Children First and manual handling."],
   links:[["Shane Molloy","person"],["Staff & HR","area"]]},
  {type:"folder", id:"f-fin", name:"Finance", depth:0},
  {type:"file", id:"fl-6", name:"INV-20418.pdf", depth:1, parent:"f-fin", indexed:true,
   path:"Finance / Invoices", title:"INV-20418 (Nolan, w/c 19 Oct)",
   facts:[["TYPE","PDF · 1 page"],["VALUE","Live from billing"],["DUE","Direct debit Fri 23 Oct"],["OWNER","Accounts"]],
   body:["Finn Nolan's week: four After School sessions with the St Patrick's NS collection, less NCS subsidy.",
     "If late booking LBR-006 is approved, the Friday session, late booking fee and school run are added here as itemised lines."],
   links:[["Nolan family","family"],["LBR-006","request"]]}
];

const ONTO_NODES = [
  ["Family","entity",500,300,1,"A household with a ROS Parent ID. Guardians, children, bookings and invoices hang off it."],
  ["Child","entity",300,190,1,"One child file: room or school, collectors, consents and medical flags (role-restricted)."],
  ["Location","entity",700,190,1,"Nine sites. Rooms, staff, routes and schools are scoped to a location."],
  ["Staff","entity",250,430,1,"Practitioners, managers, drivers and admin, with certificates that gate the rota."],
  ["Booking","entity",690,430,1,"A session for a child on a day. Registers, manifests and invoice lines derive from it."],
  ["NCS award","entity",850,320,0,"Agreed hours, masked CHICK and a demo subsidy rate. Claims follow from it."],
  ["Invoice","ledger",390,95,0,"Weekly, generated when the booking window closes. NCS subsidy shown as its own line."],
  ["Payment","ledger",620,95,0,"Card, SEPA or transfer (simulated). Plans allocate oldest invoice first."],
  ["Route","module",860,470,0,"School runs: stops, vehicle, driver. The manifest is built from bookings."],
  ["Incident","entity",140,300,0,"Accidents and incidents with parent signature and manager review."],
  ["has child","predicate",395,240,0,"Family → Child."],
  ["attends","predicate",605,240,0,"Child → Location."],
  ["rostered at","predicate",360,370,0,"Staff → Location."],
  ["booked for","predicate",600,370,0,"Booking → Child."],
  ["involves","predicate",140,372,0,"Incident → Child."]
];

const ONTO_EDGES = [
  [500,300,300,190],[500,300,700,190],[500,300,250,430],[500,300,690,430],
  [500,300,850,320],[500,300,390,95],[500,300,620,95],[500,300,140,300],
  [300,190,250,430],[700,190,860,470],[690,430,850,320],[690,430,860,470],
  [300,190,140,300],[390,95,620,95]
];

const REC_TEMPLATES = [
  ["Field sheet","Records","Labelled fields in a grid — the default for a person, organisation or location.",
   "M5 5.5h14v13H5v-13Z M5 10h14 M12 10v8.5","grid"],
  ["Contact card","Records","A portrait, key fields and every linked record in one compact panel.",
   "M12 11.5a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z M5.5 19c.8-3 3.3-4.7 6.5-4.7s5.7 1.7 6.5 4.7","card"],
  ["Directory","Records","A sortable table of many records at once, built for lists.",
   "M4.5 6.5h15 M4.5 12h15 M4.5 17.5h15 M4.5 6.5h.01 M4.5 12h.01 M4.5 17.5h.01","rows"],
  ["Timeline","Case work","Ordered events with who did what and when. Good for a case or a claim.",
   "M12 3.5v17 M12 7.5h6 M12 13h-6 M12 18h6","timeline"],
  ["Kanban board","Case work","Cards in columns by status. For anything that moves through stages.",
   "M5 5h4.5v14H5V5Z M9.75 5h4.5v9h-4.5V5Z M14.5 5H19v6h-4.5V5Z","kanban"],
  ["Checklist","Case work","Ticked steps in order, with an owner and a due date on each.",
   "M5 6.5h2l1.4 1.4L11 5.5 M5 12.5h2l1.4 1.4 2.6-2.4 M5 18.5h2l1.4 1.4 2.6-2.4 M15 6.5h4 M15 12.5h4 M15 18.5h4","checklist"],
  ["Ledger","Finance","Rows and running totals. For anything with amounts and dates.",
   "M4 6h16 M4 12h16 M4 18h16 M9 3.5v17","ledger"],
  ["Invoice","Finance","Line items, totals and a status — built to be sent, not just stored.",
   "M7 3.5h10v17H7v-17Z M9.5 8h5 M9.5 11.5h5 M9.5 15h3","invoice"],
  ["Document","Notes","Long-form text with linked records pulled out down the side.",
   "M7 3.5h7l5 5v12H7v-17Z M14 3.7v5h5 M10 13h6 M10 16.5h4","document"],
  ["Gallery","Notes","A wall of images and files with a caption on each — for a site or a job.",
   "M4.5 6h6v6h-6V6Z M13.5 6h6v6h-6V6Z M4.5 14h6v4h-6v-4Z M13.5 14h6v4h-6v-4Z","gallery"],
  ["Map & locations","Ops","A pinboard of places, with the record's fields beside each pin.",
   "M12 21s6.5-5.6 6.5-11a6.5 6.5 0 1 0-13 0C5.5 15.4 12 21 12 21Z M12 12.8a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z","map"],
  ["Schedule","Ops","A calendar of bookings against this record, with recurring rules.",
   "M8 4v3 M16 4v3 M4.5 9.5h15 M6.4 6h11.2A1.9 1.9 0 0 1 19.5 8v10a1.9 1.9 0 0 1-1.9 1.9H6.4A1.9 1.9 0 0 1 4.5 18V8A1.9 1.9 0 0 1 6.4 6Z","schedule"]
];
const REC_TEMPLATE_CATS = ["All","Records","Case work","Finance","Notes","Ops"];

/* ---- admin hub ---- */
/* ---- admin hub: 13 settings areas in five groups ---- */
const PEOPLE = [
  ["Amanda Spiteri","Owner","amanda.spiteri@demo.roskids.example","Hazelbrook (HQ)","active","Admin","Now"],
  ["Deirdre Kinsella","Operations Manager","deirdre.kinsella@demo.roskids.example","All locations","active","Manager","8 min ago"],
  ["Gráinne Whelan","Accounts","grainne.whelan@demo.roskids.example","Hazelbrook (HQ)","active","Manager","12 min ago"],
  ["Lorraine Tobin","NCS Administrator","lorraine.tobin@demo.roskids.example","Hazelbrook (HQ)","active","Standard","20 min ago"],
  ["Joanne Redmond","Location Manager","joanne.redmond@demo.roskids.example","Arklow Rocks","active","Manager","34 min ago"],
  ["Shane Molloy","SAC Practitioner","shane.molloy@demo.roskids.example","Brookfield","inactive","Standard","Blocked: vetting lapsed"]
];
const ROLE_LEVELS = ["Admin","Manager","Standard","External"];
const PERM_KEYS = [["view","View records"],["edit","Edit records"],["approve","Approve payments"]];
const GRANT_DEFS = [
  ["view","View records","Read anything in scope"],
  ["edit","Edit records","Create and change records"],
  ["approve","Approve decisions","Say yes to parked work"],
  ["pay","Release payments","Send money out"],
  ["export","Export data","Download and share out"],
  ["agents","Manage agents","Create and grant agents"],
  ["settings","Change settings","Modules, roles, integrations"],
  ["audit","Read the audit log","Every action, everyone"]
];
const ROLE_SCOPES = ["All records","Their location","Assigned only"];
const DEFAULT_PERMS = {Admin:{view:true,edit:true,approve:true}, Manager:{view:true,edit:true,approve:true},
  Standard:{view:true,edit:true,approve:false}, External:{view:true,edit:false,approve:false}};
const INTEGRATIONS = [
  {name:"MyRosKids parent app", blurb:"Existing parent app for bookings and receipts. In the demo, the reimagined portal is previewed through Role Preview; no live sync.", tint:"#1B75BB", status:"existing system", statusKind:"ok",
   glyph:"M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z M10.5 17.5h3",
   lastSync:"Demo only · not connected", usage:"480 families", auth:"—", scopes:["Read (proposed)"]},
  {name:"Website form and Gmail queues", blurb:"Current contact form and the General, Accounts, NCS and regional inboxes. Shown here as the unified inbox (simulated).", tint:"#ea4335", status:"existing system", statusKind:"ok",
   glyph:"M4 7.2 12 13 20 7.2 M4 7.2v10.6h16V7.2 M4 7.2 8.5 4h7L20 7.2",
   lastSync:"Demo only · sample messages", usage:"7 queues", auth:"—", scopes:["Read (proposed)","Draft"]},
  {name:"Stripe", blurb:"Card on file, Apple Pay and Google Pay for weekly invoices. Proposed connection; every payment in the demo is simulated.", tint:"#635bff", status:"proposed connection", statusKind:"warn",
   glyph:"M4 7h16v10H4z M4 10.5h16",
   lastSync:"—", usage:"Not connected", auth:"Proposed", scopes:[]},
  {name:"SEPA direct debit", blurb:"Mandates and collections with return codes for failed debits and Day 2 / Day 5 retries. Proposed connection.", tint:"#0F5A94", status:"proposed connection", statusKind:"warn",
   glyph:"M4 9.5 12 5l8 4.5 M5.5 10v7 M9.5 10v7 M14.5 10v7 M18.5 10v7 M4 19h16",
   lastSync:"—", usage:"Not connected", auth:"Proposed", scopes:[]},
  {name:"Bank statement feed", blurb:"Daily statement lines for reconciliation suggestions. The demo uses six sample lines.", tint:"#53948D", status:"demo only", statusKind:"warn",
   glyph:"M4 6h16 M4 12h16 M4 18h10",
   lastSync:"Sample feed 06:30", usage:"6 lines today", auth:"—", scopes:["Read (demo)"]},
  {name:"Twilio SMS", blurb:"SMS reminders for booking windows, claims and pickups. Proposed; no message leaves the demo.", tint:"#f22f46", status:"proposed connection", statusKind:"warn",
   glyph:"M4 5.5h16v10H8l-4 3v-13Z",
   lastSync:"—", usage:"Not connected", auth:"Proposed", scopes:[]},
  {name:"WhatsApp Business", blurb:"Optional channel for parent broadcasts. Proposed connection.", tint:"#25d366", status:"proposed connection", statusKind:"warn",
   glyph:"M4 19.5 5.3 15A7.7 7.7 0 1 1 8.6 18.2L4 19.5Z",
   lastSync:"—", usage:"Not connected", auth:"Proposed", scopes:[]},
  {name:"Google Calendar", blurb:"Visits, training courses and camp dates on staff calendars. Proposed connection.", tint:"#4285f4", status:"proposed connection", statusKind:"warn",
   glyph:"M8 4v3 M16 4v3 M4.5 9.5h15 M6.4 6h11.2A1.9 1.9 0 0 1 19.5 8v10a1.9 1.9 0 0 1-1.9 1.9H6.4A1.9 1.9 0 0 1 4.5 18V8A1.9 1.9 0 0 1 6.4 6Z",
   lastSync:"—", usage:"Not connected", auth:"Proposed", scopes:[]},
  {name:"NCS / Pobal / Early Years Hive export", blurb:"Prepared return files for review. Nothing is ever submitted from the demo.", tint:"#8DB35E", status:"demo only", statusKind:"warn",
   glyph:"M12 4v10 M8 10l4 4 4-4 M5 19h14",
   lastSync:"Prepared, not submitted", usage:"Export preview", auth:"—", scopes:["Prepare"]},
  {name:"Xero / Sage CSV", blurb:"Month-end CSV for the accountants. Proposed; the demo downloads local CSV only.", tint:"#13b5ea", status:"proposed connection", statusKind:"off",
   glyph:"M4.5 12a7.5 7.5 0 0 1 12.8-5.3 M19.5 12a7.5 7.5 0 0 1-12.8 5.3",
   lastSync:"—", usage:"CSV export", auth:"—", scopes:[]}
];

/* Background catalogue. Each entry is pure CSS so a tile is the real thing at
   thumbnail size, not a picture of it. */
const BG_DEFS = [
  {id:"bloom", name:"Bloom", cat:"Signature",
   css:"background:radial-gradient(60% 48% at 50% 34%, var(--accent-faint), transparent 72%), radial-gradient(44% 38% at 16% 84%, rgba(255,255,255,.05), transparent 70%)",
   thumb:"background:radial-gradient(62% 58% at 46% 34%, var(--accent-soft), transparent 74%), radial-gradient(50% 46% at 82% 84%, rgba(255,255,255,.08), transparent 72%), var(--surface-2)"},
  {id:"mist", name:"Mist", cat:"Signature",
   css:"background:radial-gradient(52% 44% at 24% 22%, rgba(255,255,255,.07), transparent 70%), radial-gradient(56% 46% at 80% 76%, rgba(255,255,255,.05), transparent 72%)",
   thumb:"background:radial-gradient(58% 52% at 24% 22%, rgba(255,255,255,.16), transparent 72%), radial-gradient(60% 54% at 82% 78%, rgba(255,255,255,.10), transparent 74%), var(--surface-2)"},
  {id:"grid", name:"Grid", cat:"Signature",
   css:"background-image:linear-gradient(var(--border) 1px, transparent 1px),linear-gradient(90deg, var(--border) 1px, transparent 1px);background-size:56px 56px;mask-image:radial-gradient(62% 56% at 50% 46%, #000, transparent 78%);-webkit-mask-image:radial-gradient(62% 56% at 50% 46%, #000, transparent 78%)",
   thumb:"background-color:var(--surface-2);background-image:linear-gradient(var(--border-strong) 1px, transparent 1px),linear-gradient(90deg, var(--border-strong) 1px, transparent 1px);background-size:14px 14px"},
  {id:"none", name:"None", cat:"Signature", css:"", thumb:"background:var(--surface-2)"},

  {id:"aurora", name:"Aurora", cat:"Gradient",
   css:"background:radial-gradient(70% 52% at 18% 8%, var(--bloom-a), transparent 66%), radial-gradient(64% 48% at 84% 22%, var(--bloom-b), transparent 68%), radial-gradient(70% 60% at 50% 104%, var(--bloom-c), transparent 70%);filter:blur(24px)",
   thumb:"background:radial-gradient(72% 60% at 16% 6%, var(--bloom-a), transparent 68%), radial-gradient(66% 54% at 86% 24%, var(--bloom-b), transparent 70%), radial-gradient(74% 66% at 50% 108%, var(--bloom-c), transparent 72%), var(--surface-2)"},
  {id:"horizon", name:"Horizon", cat:"Gradient",
   css:"background:linear-gradient(180deg, transparent 0%, var(--accent-faint) 58%, transparent 100%), radial-gradient(90% 40% at 50% 72%, var(--accent-soft), transparent 70%)",
   thumb:"background:linear-gradient(180deg, var(--surface-2) 0%, var(--accent-faint) 58%, var(--surface-2) 100%), radial-gradient(90% 44% at 50% 74%, var(--accent-soft), transparent 70%)"},
  {id:"dusk", name:"Dusk", cat:"Gradient",
   css:"background:linear-gradient(200deg, var(--bloom-c) -10%, transparent 46%), linear-gradient(20deg, var(--bloom-b) -10%, transparent 52%);opacity:.5",
   thumb:"background:linear-gradient(200deg, var(--bloom-c) -12%, transparent 48%), linear-gradient(20deg, var(--bloom-b) -12%, transparent 54%), var(--surface-2)"},
  {id:"ember", name:"Ember", cat:"Gradient",
   css:"background:radial-gradient(60% 70% at 84% 96%, var(--bloom-a), transparent 64%), radial-gradient(50% 60% at 10% 96%, var(--bloom-c), transparent 66%)",
   thumb:"background:radial-gradient(64% 76% at 84% 100%, var(--bloom-a), transparent 66%), radial-gradient(54% 66% at 8% 100%, var(--bloom-c), transparent 68%), var(--surface-2)"},

  {id:"mesh", name:"Mesh", cat:"Abstract",
   css:"background-image:radial-gradient(var(--border-strong) 1px, transparent 1px);background-size:22px 22px;mask-image:radial-gradient(70% 62% at 50% 46%, #000, transparent 76%);-webkit-mask-image:radial-gradient(70% 62% at 50% 46%, #000, transparent 76%)",
   thumb:"background-color:var(--surface-2);background-image:radial-gradient(var(--border-strong) 1px, transparent 1px);background-size:8px 8px"},
  {id:"contour", name:"Contour", cat:"Abstract",
   css:"background:repeating-radial-gradient(circle at 30% 110%, transparent 0 22px, var(--border) 22px 23px);mask-image:radial-gradient(80% 70% at 40% 80%, #000, transparent 78%);-webkit-mask-image:radial-gradient(80% 70% at 40% 80%, #000, transparent 78%)",
   thumb:"background:repeating-radial-gradient(circle at 26% 116%, var(--surface-2) 0 9px, var(--border-strong) 9px 10px)"},
  {id:"weave", name:"Weave", cat:"Abstract",
   css:"background:repeating-linear-gradient(48deg, transparent 0 16px, var(--border) 16px 17px), repeating-linear-gradient(-48deg, transparent 0 16px, var(--border) 16px 17px);opacity:.7",
   thumb:"background-color:var(--surface-2);background-image:repeating-linear-gradient(48deg, transparent 0 7px, var(--border-strong) 7px 8px), repeating-linear-gradient(-48deg, transparent 0 7px, var(--border-strong) 7px 8px)"},
  {id:"halo", name:"Halo", cat:"Abstract",
   css:"background:repeating-radial-gradient(circle at 50% 50%, transparent 0 46px, var(--accent-line) 46px 47px);mask-image:radial-gradient(60% 60% at 50% 50%, #000, transparent 72%);-webkit-mask-image:radial-gradient(60% 60% at 50% 50%, #000, transparent 72%)",
   thumb:"background:repeating-radial-gradient(circle at 50% 50%, var(--surface-2) 0 11px, var(--accent-line) 11px 12px)"},
  {id:"drift", name:"Drift", cat:"Abstract",
   css:"background:conic-gradient(from 210deg at 32% 38%, var(--bloom-b), transparent 38%), conic-gradient(from 20deg at 76% 70%, var(--bloom-a), transparent 34%);filter:blur(30px);opacity:.6",
   thumb:"background:conic-gradient(from 210deg at 32% 38%, var(--bloom-b), transparent 38%), conic-gradient(from 20deg at 76% 70%, var(--bloom-a), transparent 34%), var(--surface-2)"},
  {id:"scan", name:"Scanlines", cat:"Abstract",
   css:"background:repeating-linear-gradient(0deg, var(--border) 0 1px, transparent 1px 7px);mask-image:linear-gradient(180deg, #000, transparent 88%);-webkit-mask-image:linear-gradient(180deg, #000, transparent 88%)",
   thumb:"background-color:var(--surface-2);background-image:repeating-linear-gradient(0deg, var(--border-strong) 0 1px, transparent 1px 5px)"}
];

const THEMES = [
  {id:"sunshine", label:"Sunshine", group:"Dark", bg:"#070b1d", surface:"#10172f", ink:"#f4f6fb", accent:"#FFF100"},
  {id:"dark", label:"Dark", group:"Dark", bg:"#0b0c0b", surface:"#1a1c19", ink:"#f2f3ef", accent:"#c8f04b"},
  {id:"indigo", label:"Indigo", group:"Dark", bg:"#0a0b13", surface:"#1a1b26", ink:"#f0f1fa", accent:"#8b93ff"},
  {id:"slate", label:"Slate", group:"Dark", bg:"#100e0c", surface:"#211c17", ink:"#f4f0ea", accent:"#e8a14a"},
  {id:"plum", label:"Plum", group:"Dark", bg:"#100a10", surface:"#20151f", ink:"#f6eef4", accent:"#f077b0"},
  {id:"ember", label:"Ember", group:"Dark", bg:"#0b0b0b", surface:"#1c1714", ink:"#f7f3ef", accent:"#f4561a"},
  {id:"harbour", label:"Harbour", group:"Dark", bg:"#0b0e10", surface:"#13171a", ink:"#f3f5f4", accent:"#5ee79a"},
  {id:"cargo", label:"Cargo", group:"Dark", bg:"#0a0a0a", surface:"#1a1c1a", ink:"#f2f5f2", accent:"#4ade80"},
  {id:"ocean", label:"Ocean", group:"Dark", bg:"#080e12", surface:"#141f25", ink:"#eaf4f8", accent:"#4fd4d0"},
  {id:"graphite", label:"Graphite", group:"Dark", bg:"#111112", surface:"#212124", ink:"#f4f4f5", accent:"#f4f4f5"},
  {id:"light", label:"Daylight", group:"Light", bg:"#F4F6FB", surface:"#ffffff", ink:"#0E1440", accent:"#1B75BB"},
  {id:"warm", label:"Warm paper", group:"Light", bg:"#faf5ec", surface:"#fffdf9", ink:"#2a2016", accent:"#c9683f"},
  {id:"mist", label:"Mist", group:"Light", bg:"#eef1f4", surface:"#ffffff", ink:"#141e20", accent:"#0e9f6e"},
  {id:"sand", label:"Sand", group:"Light", bg:"#f6f1e6", surface:"#fffdf7", ink:"#221d12", accent:"#7d5fd6"}
];

const ADMIN_ICONS = {
  people:"M12 12.5a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z M5 20.2c.9-3.1 3.6-4.9 7-4.9s6.1 1.8 7 4.9",
  teams:"M9 12a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 12Z M16.5 12.5a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z M2.6 19.6c.8-2.8 3.2-4.4 6.4-4.4s5.6 1.6 6.4 4.4 M17 15.4c2.2.4 3.7 1.8 4.3 4.2",
  structure:"M4.5 20V6.4A1.4 1.4 0 0 1 5.9 5h6.2a1.4 1.4 0 0 1 1.4 1.4V20 M13.5 10.5h4.6A1.4 1.4 0 0 1 19.5 12v8 M3 20h18 M7.5 8.5h2.5 M7.5 12h2.5",
  shield:"M12 3.6 19.5 6v6.1c0 4-3.1 6.9-7.5 8.3-4.4-1.4-7.5-4.3-7.5-8.3V6L12 3.6Z M9.2 12.2l2 2 3.6-3.7",
  agent:"M2 12h4l2.5-6 3.5 12 3-8 2 2h5",
  flow:"M18.5 8.5A5 5 0 0 0 8.9 7.3 3.8 3.8 0 0 0 6 14.6 M8 17.5l3.2 3.2 M11.2 20.7l3.2-3.2 M11.2 20.7V9.6",
  plug:"M9 3.5v5 M15 3.5v5 M6.5 8.5h11v3a5.5 5.5 0 0 1-11 0v-3Z M12 17v3.5",
  modules:"M6.6 4.4h10.8a2.2 2.2 0 0 1 2.2 2.2v10.8a2.2 2.2 0 0 1-2.2 2.2H6.6a2.2 2.2 0 0 1-2.2-2.2V6.6a2.2 2.2 0 0 1 2.2-2.2Z M4.4 9.6h15.2 M9.6 19.6V9.6",
  health:"M3 12.5h3.4l2-5 3 10 2.2-5H21",
  lock:"M6.5 10.5h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19v-7a1.5 1.5 0 0 1 1.5-1.5Z M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3",
  audit:"M8 3.5h8l3.5 3.5v13a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 6 3.5h2Z M9 12h6 M9 16h4",
  brand:"M12 3.5 14.6 9l6.4.6-4.8 4.2 1.4 6.2-5.6-3.3-5.6 3.3 1.4-6.2L3 9.6 9.4 9 12 3.5Z",
  bell:"M6 8.5a6 6 0 0 1 12 0c0 6.5 2.6 8.5 2.6 8.5H3.4S6 15 6 8.5Z M10.3 20.5a1.94 1.94 0 0 0 3.4 0",
  data:"M4.5 7.5c0-1.7 3.4-3 7.5-3s7.5 1.3 7.5 3-3.4 3-7.5 3-7.5-1.3-7.5-3Z M4.5 7.5v9c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-9 M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"
};

const ADMIN_CARDS = [
  {id:"org", group:"ORGANISATION", title:"Organisation", icon:"structure", tint:"var(--accent)",
   blurb:"Ray of Sunshine Morning, After School and Early Years Services.",
   tags:["Founded 2015","9 locations","~100 staff"],
   listLabel:"ORGANISATION DETAILS",
   rows:[["Legal and trading name","Ray of Sunshine Morning, After School and Early Years Services"],["Product","Ray of Sunshine OS, powered by Pulse"],
     ["Founder and owner","Amanda Spiteri"],["Founded","2015, Wicklow Town"],["Head office","Hazelbrook Rise, Rathnew, Co. Wicklow, A67 HX39"],
     ["Admin hours","Monday to Friday, 08:30 to 16:00"],["Services","Early Years · Morning and After School · Transport · Camps · Training"],["Currency and timezone","EUR · Europe/Dublin"]]},
  {id:"people", group:"ORGANISATION", title:"People & access", icon:"people", tint:"#6ad0f0",
   blurb:"Invite, suspend and offboard the people who use the OS.",
   tags:["100 staff","9 locations","1 blocked"], badge:"1 vetting lapsed", badgeKind:"bad",
   footer:"Shane Molloy blocked from the rota until Garda vetting is renewed", action:"Review access",
   listLabel:"WHAT YOU CONTROL HERE",
   rows:[["Add, invite or remove staff",""],["Assign location managers","9 sites"],["Suspend accounts","1 suspended"],["View last login","100 people tracked"]]},
  {id:"locs", group:"LOCATIONS", title:"Locations & services", icon:"structure", tint:"#f0c04b",
   blurb:"Which services run where, rooms, capacity and collection schools.",
   tags:["9 sites","5 rooms","35 schools"],
   listLabel:"SITES",
   rows:[["Hazelbrook (HQ), Rathnew","Early Years · SAC · admin · training"],["Brookfield, Wicklow","SAC"],["Arklow Crèche","Early Years · SAC"],["Arklow Rocks","SAC"],
     ["Burkeen Dales, Arklow","SAC"],["Gorey, Wexford","SAC · camps"],["Canovee, Cork","SAC · camps"],["Dungarvan, Waterford","SAC"],["Ballymun, Dublin","SAC"]]},
  {id:"windows", group:"LOCATIONS", title:"Booking windows", icon:"flow", tint:"#9d8cf5",
   blurb:"When parents can book, when the week locks and what happens on close.",
   tags:["Opens Mon 09:00","Closes Thu 18:00"],
   listLabel:"RULES (DEMO CONFIGURATION)",
   rows:[["Window opens","Monday 09:00, the week before"],["Window closes","Thursday 18:00"],["On close","Lock week · generate invoices · build registers and manifests"],
     ["Reminders","24 hours and 2 hours before close", true],["Late requests after close","24h weekday notice, space and cover permitting"],["Weekend processing","Off", false]]},
  {id:"ratios", group:"LOCATIONS", title:"Ratio configuration", icon:"shield", tint:"#e2705c",
   blurb:"Illustrative thresholds used for forecasts. Not a regulatory determination.",
   tags:["Demo values","Configurable"], badge:"Validate before production", badgeKind:"warn",
   listLabel:"DEMO THRESHOLDS",
   rows:[["School age (After School, Morning)","1 adult : 10 children"],["Crèche (1 to 2.5 years)","1 : 5"],["Preschool Junior","1 : 6"],["Preschool Senior (ECCE)","1 : 8"],
     ["Forecast horizon","Today and tomorrow"],["Expired Garda vetting blocks rota","On", true]]},
  {id:"teams", group:"ROLES", title:"Roles & permissions", icon:"shield", tint:"var(--accent)",
   blurb:"Eight roles, each with a scope and what it may see.",
   tags:["8 roles","Location scope","Masked medical"],
   heroLabel:"ROLE PREVIEW", heroAction:"Switch role in the header",
   heroText:"Use Role Preview in the header to see exactly what each person sees: the owner sees everything, a location manager sees one site, a driver sees their route, a parent sees only their own family.",
   listLabel:"ROLES",
   rows:[["Owner","All sites, all data"],["Operations Manager","All sites, no payroll detail"],["Accounts Team","Billing, debt, NCS financials"],["NCS Administrator","CHICKs, hours, claims"],
     ["Location Manager","One site only"],["Room Leader / Practitioner","Room and child updates, no finance"],["Driver","Assigned route, collector checks"],["Parent","Own family only, in MyRosKids"]]},
  {id:"fees", group:"FEE POLICIES", title:"Fee policies", icon:"data", tint:"#5fe0a8",
   blurb:"Published operating policies, held as editable demo rules.",
   tags:["Demo values","Not quoted fees"], badge:"Demo only", badgeKind:"warn",
   footer:"Edit rates and fees in Billing → Fee Rules", action:"Open Fee Rules",
   listLabel:"RAY OF SUNSHINE POLICY (NOT STATUTORY)",
   rows:[["Invoices","Due on receipt"],["Late booking fee","€5.00 (demo)"],["School collection","€3.00 per run (demo)"],["Part hours","Billed to the next full hour"],
     ["Locked week cancellations","No refund"],["Exceptional closures","Full fees · owner approval before any mass change", true],["Booking restriction after failed payment","Accounts approval required", true],["Leaving","Two months' written notice"]]},
  {id:"plans", group:"FEE POLICIES", title:"Payment plans & debt", icon:"audit", tint:"#f0994b",
   blurb:"How plans are agreed, monitored and escalated, with people deciding.",
   tags:["Max 3 revisions","Owner decides escalation"],
   listLabel:"RULES",
   rows:[["Missed instalment","Raised to Accounts within a week"],["Plan revisions","At most 3"],["Third breach","Owner approval only for any debt-collection pack", true],["Automatic penalties","Off", false]]},
  {id:"ncspol", group:"FEE POLICIES", title:"NCS policies", icon:"approvals", tint:"#8DB35E",
   blurb:"Programme rules and our own operating rules, labelled separately.",
   tags:["8-week rule","Thursday deadline","7-day acceptance"],
   listLabel:"NCS PROGRAMME RULES · RoS OPERATING POLICY",
   rows:[["Book agreed hours weekly","Programme expectation"],["Hours change","No more than every 8 weeks (camp-week increase exception)"],["CHICK or award","By Thursday before the week of service (RoS policy)"],
     ["Claim acceptance","Seven days, reminders on Days 2, 4 and 6"],["Stopping NCS","Four weeks' notice (RoS policy)"],["Private charge after a lapse","Human review required", true]]},
  {id:"integrations", group:"INTEGRATIONS", title:"Integrations", icon:"plug", tint:"#6ad0f0",
   blurb:"Existing systems, proposed connections and what is demo only.",
   tags:["2 existing","6 proposed","2 demo only"], badge:"Nothing live", badgeKind:"warn",
   footer:"No integration is connected in this demo", action:"Review",
   listLabel:"CONNECTIONS", rows:[]},
  {id:"agents", group:"AI & GOVERNANCE", title:"Agents & AI controls", icon:"agent", tint:"var(--accent)",
   blurb:"What agents may read, what they may do, and where a person must decide.",
   tags:["13 agents","Approvals on every write"],
   heroLabel:"GLOBAL CONTROL", heroAction:"Pause every agent",
   heroText:"One switch stops every agent. Child-safety events, debt escalation, booking blocks and NCS charge changes always go to a person.",
   listLabel:"WHAT YOU CONTROL HERE",
   rows:[["Agents can draft messages","On", true],["Agents can send messages","Off (people send)", false],["Agents can change invoices","Off", false],
     ["Missing child alerts can be closed by an agent","Never", false],["Data agents can read","Scoped by role and location"],["Memory retention","90 days"]]},
  {id:"audit", group:"AI & GOVERNANCE", title:"Audit & GDPR", icon:"audit", tint:"#9d8cf5",
   blurb:"Who saw or changed what. Retention and access requests.",
   tags:["Append-only","Role-masked medical"],
   footer:"Every demo action is written to Activity", action:"Open Activity",
   listLabel:"WHAT IS RECORDED",
   rows:[["Record views (sensitive)","Child medical, safeguarding"],["Approvals and decisions","Who, when, what changed"],["Data exports","CSV and print"],["Retention","Per records retention policy v2.0"]]},
  {id:"health", group:"AI & GOVERNANCE", title:"Data health", icon:"health", tint:"#e2705c",
   blurb:"What is incomplete or inconsistent, how bad it is, and the fix.",
   tags:["6 issue types"], badge:"Consents incomplete", badgeKind:"warn",
   footer:"Last scanned 08:40 today", action:"Fix",
   listLabel:"ISSUES FOUND",
   trend:[61,58,55,49,46,44,41],
   bySeverity:[["High","2",RED],["Medium","27",AMBER],["Low","12",DIM]],
   issues:[["Families with incomplete consents","29","medium","Photo, outing or transport consent missing","Chase in app"],
     ["Website messages without Parent ID","1","low","Ask the parent for their ROS ID","Draft reply"],
     ["Expired Garda vetting","1","high","Blocked from rota until renewed","Open staff file"],
     ["Medication expiring this week","1","high","Ask the parent for a replacement","Open child"],
     ["Children without a key worker","0","low","All assigned","Review"],
     ["Invoices without a family","0","low","None","Review"]],
   rows:[]},
  {id:"brand", group:"EXPERIENCE", title:"Branding", icon:"brand", tint:"var(--accent)",
   blurb:"Ray of Sunshine identity on top of Pulse.",
   tags:["Sun yellow","RoS blue","Navy"],
   listLabel:"WHAT YOU CONTROL HERE",
   rows:[["Logo","Ros-Circle-Logo.png (roskids.ie)"],["Accent (dark)","#FFF100 sun yellow, navy text on yellow"],["Accent (light)","#1B75BB RoS blue"],["Supporting","#53948D teal · #8DB35E green · #C6D22F lime"],["Parent portal branding","On", true]]},
  {id:"appearance", group:"EXPERIENCE", title:"Appearance & themes", icon:"brand", tint:"#6ad0f0",
   blurb:"Pick a light or dark theme for how the OS looks to you.",
   tags:["Sunshine (dark)","Light"],
   listLabel:"THEMES", rows:[]}
];

const ADMIN_GROUPS = [
  ["ORGANISATION", "repeat(2,1fr)"],
  ["LOCATIONS", "repeat(3,1fr)"],
  ["ROLES", "repeat(1,1fr)"],
  ["FEE POLICIES", "repeat(3,1fr)"],
  ["INTEGRATIONS", "repeat(1,1fr)"],
  ["AI & GOVERNANCE", "repeat(3,1fr)"],
  ["EXPERIENCE", "repeat(2,1fr)"]
];

/* ---- activity feeds ---- */
const SRC_TINT = {Operations:"var(--accent)", Financial:"#8DB35E", NCS:"#5fe0a8", Transport:"#9d8cf5", Safeguarding:"#ef6262",
  Communications:"#6cb4ec", Staffing:"#f0c04b", Enrolment:"#C6D22F", System:"#8790b0"};
const SRC_ABBR = {Operations:"OP", Financial:"€", NCS:"NC", Transport:"TR", Safeguarding:"SG", Communications:"CM", Staffing:"ST", Enrolment:"EN", System:"SY"};

const DATA_EVENTS = [["Morning registers synced","Morning club children walked to school.","Kiosks","All sites","Pulse","completed"]];

const PEOPLE_EVENTS = [["Late booking request received","LBR-006 for Fri 23 Oct.","Emer Nolan","Nolan family","Pulse","awaiting"]];

const AI_EVENTS = [["Morning brief prepared","Seven decisions across nine locations.","Owner Briefing","Amanda Spiteri","Agent","completed"]];

const STREAM_DEFS = [
  {id:"data", title:"Systems", sub:"Feeds, kiosks and automations", pool:DATA_EVENTS, every:3200,
   tint:"#6cb4ec", icon:"M4.5 7.5c0-1.7 3.4-3 7.5-3s7.5 1.3 7.5 3-3.4 3-7.5 3-7.5-1.3-7.5-3Z M4.5 7.5v9c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-9 M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"},
  {id:"people", title:"People", sub:"Decisions staff and parents made", pool:PEOPLE_EVENTS, every:6400,
   tint:"#8DB35E", icon:"M12 12.5a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z M5 20.2c.9-3.1 3.6-4.9 7-4.9s6.1 1.8 7 4.9"},
  {id:"ai", title:"Agents", sub:"What the agents did and proposed", pool:AI_EVENTS, every:4600,
   tint:"var(--accent)", icon:"M2 12h4l2.5-6 3.5 12 3-8 2 2h5"}
];

const NAV = [
  {label:"Home", icon:"helios", page:"Home"},
  {label:"Agents", icon:"navAgents", page:"Agents"},
  {label:"Work", icon:"navWork", page:"Work"},
  {label:"Records & Ontology", icon:"navRecords", page:"Records"},
  {label:"Activity", icon:"pulseLine", page:"Activity", dot:true}
];

/* Inbox items follow the real InboxItem shape: what happened, why it matters, what I can do. */
const ITEMS = {};
const ORDER = [];

const ANSWERS = {
  fallback:{tool:"ros_search", effect:"read",
    text:"I can answer from the records your role can see across all nine locations. Anything that changes a record waits for a person to approve it.",
    actions:[["What needs attention across our 9 locations?",1]]}
};
function synthesizeCustomArea(name){
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  let seed = 0;
  for (let i = 0; i < trimmed.length; i++) seed = (seed * 31 + trimmed.charCodeAt(i)) >>> 0;
  const rnd = (n) => (((seed >>> (n % 24)) ^ (seed << ((n * 7) % 13))) >>> 0) % 997 / 997;
  const low = trimmed.toLowerCase();
  const has = (...words) => words.some(w => low.indexOf(w) > -1);
  const growth = has("expansion","growth","launch","scale","pilot","new site","open","opening","grow");
  const risk = has("risk","issue","delay","problem","complaint","fault","incident","churn","decline");
  const dir = risk ? -1 : (growth ? 1 : (rnd(2) > 0.45 ? 1 : -1));

  let vocab = "generic";
  if (has("scotland","ireland","wales","england","region","dublin","belfast","cork","galway","london","glasgow","edinburgh"))
    vocab = "region";
  else if (has("cost","spend","budget","saving","margin")) vocab = "cost";
  else if (has("staff","hiring","team","recruit","headcount")) vocab = "people";
  else if (has("supplier","stock","inventory","warehouse","fleet")) vocab = "ops";
  else if (has("customer","client","retention","account")) vocab = "customer";

  const V = {
    region:   {labels:["New enquiries","Orders won","Revenue","Site coverage"], unit:"EUR — 30 DAYS"},
    cost:     {labels:["Spend","Cost per job","Savings found","Budget used"], unit:"EUR — 30 DAYS"},
    people:   {labels:["Headcount","Open roles","Time to hire","Retention"], unit:"PEOPLE"},
    ops:      {labels:["Stock cover","Lead time","Stockouts","Reorders raised"], unit:"DAYS"},
    customer: {labels:["Active accounts","Repeat rate","Churn","NPS"], unit:"ACCOUNTS"},
    generic:  {labels:["Volume","Rate","Cost","Coverage"], unit:"ACTIVITY — 30 DAYS"}
  }[vocab];

  const months = ["Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug"];
  let v0 = 40 + Math.floor(rnd(1) * 220);
  const chart = months.map((m, i) => {
    v0 = Math.max(8, Math.round(v0 * (1 + dir * (0.03 + rnd(i + 3) * 0.07))));
    return [m, v0, String(v0)];
  });
  const metrics = V.labels.map((label, i) => {
    const val = 20 + Math.floor(rnd(i + 5) * 400);
    const pct = 2 + Math.round(rnd(i + 9) * 18);
    const up = dir > 0 ? rnd(i + 12) > 0.25 : rnd(i + 12) > 0.7;
    const bars = [0,1,2,3,4,5,6,7,8].map(k => 0.3 + rnd(i * 3 + k) * 0.7);
    return [label, i === 1 ? pct + "%" : String(val), (up ? "+" : "\u2212") + pct + (i === 1 ? "pt" : "%"), up ? "up" : "down", "vs last month", bars];
  });
  const capName = trimmed.replace(/\b\w/g, c => c.toUpperCase());
  const split = [
    [capName + " \u2014 direct", String(Math.round(v0 * 0.5)), "48%", 1],
    ["Existing pipeline", String(Math.round(v0 * 0.3)), "31%", 0],
    ["Everything else", String(Math.round(v0 * 0.2)), "21%", 0]
  ];
  const table = [1,2,3].map(w => [capName + " \u2014 week " + w, String(20 + Math.floor(rnd(20 + w) * 200)),
    (dir > 0 ? "+" : "\u2212") + (3 + Math.floor(rnd(23 + w) * 14)) + "%", "Auto-tagged from records mentioning \u201c" + low + "\u201d"]);
  table.push(["Everything else", String(20 + Math.floor(rnd(30) * 200)), "\u2014", "Baseline"]);
  return {
    id: trimmed, label: capName, color: "var(--accent)", owner: "CUSTOM FILTER",
    description: "Generated from \u201c" + trimmed + "\u201d \u2014 a plain-English filter, not a registered metric set. Refine it and Pulse will tighten this up.",
    kind: "columns", chartTitle: capName + " over time", chartUnit: V.unit,
    chart, splitTitle: "Where \u201c" + low + "\u201d shows up", split,
    tableCols: ["Item","Value","Change","Note"], table,
    metrics, legend: [capName, "Pipeline", "Other"]
  };
}

function pickAnswer(q){
  return ANSWERS.fallback;
}

const ORGS = [];
const TEAMS = [];
const LOCATIONS = [];

const AGENT_DEFS = [
  {id:"huddle", name:"Morning huddle", shape:"rim-capsule", tint:"#1b2440", state:"working", group:true,
   members:["briefing","rota","ncs"], role:"Owner Briefing, Ratio & Rota and NCS working today's decisions together",
   when:"08:45", preview:"ratio & rota: arklow rocks is one short at 3pm.",
   thread:[
     {kind:"stamp", text:"Today 08:45"},
     {kind:"routine", text:"Ran routine", routine:"Morning brief"},
     {kind:"agent", from:"rota", text:"arklow rocks has 22 booked for 3pm after school with 2 on the rota against 3 at the demo 1:10. one practitioner is on approved leave. aisling byrne and ciara walsh are both qualified and free."},
     {kind:"agent", from:"ncs", text:"NCS-0091 for the kelly family (€184.00) lapses at 17:00 today. days 2, 4 and 6 reminders went out. rachel asked last night how to accept it."},
     {kind:"agent", from:"briefing", text:"so this morning is two quick decisions: approve arklow cover, and decide whether lorraine phones rachel kelly. everything else is in the brief and can wait until after 10."}
   ]},
  {id:"briefing", name:"Owner Briefing", shape:"crown-pebble", tint:"#191c3a", state:"complete", role:"Reads all nine locations at 08:45 and gives you the decisions that matter",
   when:"08:45", preview:"seven decisions this morning. two are time-critical.",
   thread:[
     {kind:"stamp", text:"Today 08:45"},
     {kind:"routine", text:"Ran routine", routine:"Morning brief"},
     {kind:"agent", text:"morning brief, tuesday 20 october:", lines:[
       {k:"Staffing", v:"Arklow Rocks 3pm: 2 of 3 · Gorey tomorrow: 4 of 5"},
       {k:"NCS", v:"NCS-0091 Kelly €184.00 lapses 17:00 · 9 claims waiting"},
       {k:"Money", v:"25 invoices overdue · Byrne missed €81 · Doyle pack waiting on you"},
       {k:"Requests", v:"LBR-006 Nolan Friday · 12 others in the queue"}]},
     {kind:"agent", text:"two things need you before 10: the arklow rocks relief, and the doyle debt pack (review only, nothing gets sent). the rest is with the right people."}
   ]},
  {id:"rota", name:"Ratio & Rota", shape:"glass-visor", tint:"#1d2440", state:"attention", role:"Forecasts required staff from bookings and proposes qualified cover",
   when:"07:58", preview:"proposed aisling byrne for arklow rocks.",
   thread:[
     {kind:"stamp", text:"Today 07:30"},
     {kind:"agent", text:"blocked shane molloy from the brookfield rota: garda vetting expired 2 october. orla has the renewal task."},
     {kind:"stamp", text:"Today 07:58"},
     {kind:"agent", text:"arklow rocks 3pm after school: 22 booked, 2 rostered, 3 required at 1:10 (demo). aisling byrne (level 6, vetting and first aid current) can do 09:00 to 17:30. approval APR-201 is with operations."}
   ]},
  {id:"ncs", name:"NCS", shape:"control-cube", tint:"#16241f", state:"waiting", role:"CHICKs, agreed hours, claims and the Thursday deadline",
   when:"08:10", preview:"4 families under-booked for w/c 2 nov.",
   thread:[
     {kind:"stamp", text:"Today 08:00"},
     {kind:"agent", text:"four families have booked fewer than their agreed hours for the week of 2 november. kelly is 12 of 15. i can draft reminders; nothing goes until lorraine reviews them."},
     {kind:"agent", text:"14 CHICKs expire this month. thursday 12:00 is the cut-off for camp week, so i've proposed a private charge for one child with no valid CHICK (APR-205). that needs a person."}
   ]},
  {id:"collections", name:"Collections", shape:"executive-capsule", tint:"#2a2118", state:"waiting", role:"Reminders, bank matches, plans and approval-only escalations",
   when:"08:00", preview:"byrne missed €81. doyle pack waits on the owner.",
   thread:[
     {kind:"stamp", text:"Today 00:05"},
     {kind:"agent", text:"byrne (ROS1096) didn't pay the €81 instalment due yesterday. plan PLN-031 is on revision 3 of 3, so i can't propose another revision. follow-up call task is with gráinne for monday."},
     {kind:"stamp", text:"Today 08:00"},
     {kind:"agent", text:"reminder run done. one account hit day 10, so a booking restriction is now an accounts decision (APR-203). bank feed: 3 exact matches, 2 need a person, 1 unmatched."}
   ]},
  {id:"bookings", name:"Bookings", shape:"rim-capsule", tint:"#1b2430", state:"working", role:"Booking window, late and change requests, capacity and ratio checks",
   when:"08:15", preview:"LBR-006 checks out: notice, space and ratio.",
   thread:[
     {kind:"stamp", text:"Today 08:15"},
     {kind:"agent", text:"emer nolan wants finn in on friday 15:00 to 18:00 with the st patrick's pickup. 79 hours' notice on a weekday, space at hazelbrook, ratio holds. fees on the demo rules come to €53. approve it in the inbox and i'll write the booking, invoice, register and manifest together."}
   ]},
  {id:"transport", name:"Transport", shape:"wide-eyed", tint:"#20302a", state:"working", role:"Manifests from bookings, boarding, arrivals and pickup exceptions",
   when:"07:00", preview:"6 manifests built. WKR-02 has 9 today.",
   thread:[
     {kind:"stamp", text:"Today 07:00"},
     {kind:"agent", text:"manifests built for all six routes from accepted bookings. WKR-02 (gerry doran) has 9 children today, luca o'neill and finn nolan from st patrick's at 14:45. a missing child is always passed to a person; i can't close one."}
   ]},
  {id:"sunny", name:"Sunny", shape:"low-dome", tint:"#3a3410", state:"working", role:"Parent assistant in MyRosKids. Routes anything sensitive to staff",
   when:"08:21", preview:"told sinéad luca is on WKR-02 today.",
   thread:[
     {kind:"stamp", text:"Today 08:21"},
     {kind:"agent", text:"sinéad o'neill asked if luca is on the bus today. answered from the manifest: yes, WKR-02, pickup at st patrick's 14:45. she'll see it live in the app."}
   ]},
  {id:"compliance", name:"Compliance", shape:"precision-brow", tint:"#30201c", state:"waiting", role:"Certificates, incidents, medication and inspection readiness",
   when:"07:05", preview:"one inhaler expires on sunday.",
   thread:[
     {kind:"stamp", text:"Today 07:00"},
     {kind:"agent", text:"five staff certificates fall due inside 30 days and one garda vetting has lapsed. two incident reports are waiting on a parent signature. an inhaler at hazelbrook expires on 25 october; i've asked the room to request a replacement."}
   ]}
];

/* Labels only: values are computed live from the Ray of Sunshine store (see ros/pulseData.ts). */
const KPI_DEFS = {
  revenue:{label:"Invoiced this week", value:"€0", delta:"", dir:"up", hint:"w/c 19 Oct", hero:true},
  cash:{label:"Collected", value:"€0", delta:"", dir:"up", hint:"this week"},
  overdue:{label:"Aged debt", value:"€0", delta:"", dir:"down", hint:"past due"},
  margin:{label:"Occupancy", value:"0%", delta:"", dir:"up", hint:"today"},
  jobs:{label:"Children booked", value:"0", delta:"", dir:"up", hint:"today"},
  nps:{label:"Collection rate", value:"0%", delta:"", dir:"up", hint:"month to date"},
  pipeline:{label:"Waitlist", value:"0", delta:"", dir:"up", hint:"children"},
  utilisation:{label:"NCS claims waiting", value:"0", delta:"", dir:"down", hint:"acceptance"}
};

/* Replaced at render time by live areas from ros/pulseData.ts. */
const ASPECT_DEFS = [];

const FILTER_GROUPS = [
  {title:"AREA", items:["Occupancy","Finance","NCS","Staffing","Enrolment","Transport"]},
  {title:"SCOPE", items:["Location","Room","Family","Staff"]},
  {title:"TIME", items:["This week","This month","This term","Year to date"]}
];

const OPS_DEFS = [
  {id:"o1", name:"Friday nine-location report", kind:"report", owner:"Owner Briefing", ownerKind:"agent", initials:"OB",
   trigger:"Fri, 16:00", triggerKind:"schedule", next:"Fri 16:00", last:"Sent to Amanda", status:"healthy", rate:100, on:true,
   what:"One page for Amanda: occupancy, cash, debt, NCS, staffing risks and incidents across all nine sites, with links into every figure.",
   why:"Weekly numbers were assembled from separate spreadsheets every Friday afternoon.",
   saved:"5 hours a month",
   steps:[["Trigger","Every Friday at 16:00"],["Find","Week's bookings, invoices, claims and incidents"],["Check","Flag anything that moved more than 10%"],["Draft","Write the one-page report"],["Send","Post to Home (demo)"]],
   runs:[["Fri 16 Oct 16:00","48s","ok","1 report","€0.03"],["Fri 9 Oct 16:00","51s","ok","1 report","€0.03"]]},
  {id:"o2", name:"Invoice reminder sequence", kind:"automation", owner:"Collections", ownerKind:"agent", initials:"CO",
   trigger:"Daily, 08:00", triggerKind:"schedule", next:"Tomorrow", last:"11 sent · 1 block candidate", status:"approval", rate:96, on:true,
   what:"Day 0 invoice, Day 2 friendly, Day 5 second, Day 7 final warning. At Day 10 it raises a booking-restriction candidate for Accounts to decide.",
   why:"Chasing happened in bursts, so the oldest debt got the least attention.",
   saved:"11 hours a month",
   steps:[["Trigger","Every day at 08:00"],["Find","Unpaid invoices by days overdue"],["Check","Skip anything on an active plan"],["Draft","Stage-appropriate reminder"],["Approval","Accounts decides any booking restriction","gate"],["Update","Log to the family timeline"]],
   runs:[["Today 08:00","38s","ok","11 reminders","€0.02"],["Yesterday 08:00","41s","ok","9 reminders","€0.02"]]},
  {id:"o3", name:"Late booking checks", kind:"automation", owner:"Bookings", ownerKind:"agent", initials:"BK",
   trigger:"Request received", triggerKind:"event", next:"Event-based", last:"6 checked today", status:"approval", rate:99, on:true,
   what:"Checks notice, capacity and ratio for every late, change or cancellation request and prepares the fee lines.",
   why:"Requests sat in three inboxes and were checked by hand against spreadsheets.",
   saved:"14 hours a month",
   steps:[["Trigger","A request arrives in any queue"],["Check","24h weekday notice"],["Check","Capacity and ratio for that session"],["Draft","Fee lines and the reply"],["Approval","Staff approve or decline","gate"],["Update","Booking, invoice, register and manifest together"]],
   runs:[["Today 08:15","4s","ok","6 requests","€0.01"],["Yesterday 16:42","3s","ok","1 request","€0.00"]]},
  {id:"o4", name:"Staff certificate expiry", kind:"routine", owner:"Compliance", ownerKind:"agent", initials:"CP",
   trigger:"60 / 30 / 7 days", triggerKind:"event", next:"Tomorrow 07:00", last:"1 lapsed · rota blocked", status:"failed", rate:83, on:true,
   what:"Watches Garda vetting, first aid, Children First and manual handling, and blocks a lapsed Garda vetting from the rota.",
   why:"A lapsed certificate is a compliance risk that nobody saw until an audit.",
   saved:"3 hours a month",
   steps:[["Trigger","60, 30 and 7 days before expiry"],["Find","The staff member and their manager"],["Send","Reminder and task"],["Update","Block the rota if Garda vetting lapses"]],
   runs:[["Today 07:00","3s","partial","5 due · 1 lapsed","€0.00"],["Yesterday 07:00","3s","ok","5 due","€0.00"]]},
  {id:"o5", name:"Morning brief", kind:"routine", owner:"Owner Briefing", ownerKind:"agent", initials:"OB",
   trigger:"Weekdays, 08:45", triggerKind:"schedule", next:"Tomorrow", last:"Delivered 08:45", status:"healthy", rate:100, on:true,
   what:"Reads all nine locations and tells Amanda the few decisions that matter, each linked to its record.",
   why:"The day started with six inboxes and nine phone calls.",
   saved:"9 hours a month",
   steps:[["Trigger","Every weekday at 08:45"],["Find","Ratios, approvals, NCS, debt, incidents"],["Check","Drop anything already handled"],["Draft","The brief"],["Send","Post to Home"]],
   runs:[["Today 08:45","19s","ok","7 decisions","€0.02"],["Yesterday 08:45","17s","ok","5 decisions","€0.02"]]},
  {id:"o6", name:"Manifest build", kind:"task", owner:"Transport", ownerKind:"agent", initials:"TR",
   trigger:"Weekdays, 07:00", triggerKind:"schedule", next:"Tomorrow 07:00", last:"6 routes built", status:"healthy", rate:100, on:true,
   what:"Builds each route's manifest from accepted bookings so drivers never work from an old list.",
   why:"Drivers carried paper lists that missed late changes.",
   saved:"6 hours a month",
   steps:[["Trigger","Every weekday at 07:00"],["Find","After School bookings with a route"],["Check","Transport consent and collector notes"],["Update","Publish to the driver app"]],
   runs:[["Today 07:00","6s","ok","6 routes","€0.00"],["Yesterday 07:00","6s","ok","6 routes","€0.00"]]},
  {id:"o7", name:"NCS claim acceptance reminders", kind:"automation", owner:"NCS", ownerKind:"agent", initials:"NC",
   trigger:"Day 2 · 4 · 6", triggerKind:"schedule", next:"Tomorrow 09:00", last:"3 reminders", status:"healthy", rate:98, on:true,
   what:"Reminds parents to accept a claim inside the seven-day window and flags any that will lapse today.",
   why:"Lapsed claims became private charges and difficult conversations.",
   saved:"8 hours a month",
   steps:[["Trigger","Days 2, 4 and 6 after a claim is raised"],["Send","App and SMS reminder (simulated)"],["Check","Flag claims lapsing today"]],
   runs:[["Today 09:00","5s","ok","3 reminders","€0.00"],["Yesterday 09:00","5s","ok","4 reminders","€0.00"]]},
  {id:"o8", name:"Bank feed reconciliation", kind:"automation", owner:"Collections", ownerKind:"agent", initials:"CO",
   trigger:"Daily, 06:30", triggerKind:"schedule", next:"Tomorrow 06:30", last:"3 exact · 2 ambiguous", status:"approval", rate:94, on:true,
   what:"Suggests matches between bank lines and invoices; ambiguous ones wait for a person.",
   why:"Reconciliation took a morning a week.",
   saved:"10 hours a month",
   steps:[["Trigger","Daily at 06:30"],["Find","New bank lines (sample feed)"],["Check","Amount, reference and payer"],["Approval","Ambiguous matches confirmed by Accounts","gate"],["Update","Mark invoices paid"]],
   runs:[["Today 06:30","9s","partial","6 lines","€0.00"]]},
  {id:"o9", name:"Booking window reminders", kind:"task", owner:"Bookings", ownerKind:"agent", initials:"BK",
   trigger:"24h and 2h before close", triggerKind:"schedule", next:"Wed 18:00", last:"Window opened Mon", status:"healthy", rate:100, on:true,
   what:"Reminds families who have not submitted for next week, 24 hours and 2 hours before the window closes.",
   why:"Late bookings were mostly forgotten bookings.",
   saved:"4 hours a month",
   steps:[["Trigger","Wednesday 18:00 and Thursday 16:00"],["Find","Families not yet submitted"],["Send","App and SMS (simulated)"]],
   runs:[["Mon 09:00","12s","ok","478 notified","€0.01"]]},
  {id:"o10", name:"Daily diary drafts", kind:"routine", owner:"Daily Diary", ownerKind:"agent", initials:"DD",
   trigger:"Daily, 15:30", triggerKind:"schedule", next:"Today 15:30", last:"34 drafted · 0 published", status:"healthy", rate:100, on:true,
   what:"Turns practitioner notes into diary drafts. A practitioner always reviews and publishes.",
   why:"Writing up diaries ate the end of every day.",
   saved:"24 hours a month",
   steps:[["Trigger","Practitioner notes through the day"],["Draft","Diary entries and observation tags"],["Approval","Practitioner publishes","gate"]],
   runs:[["Today 08:40","22s","ok","34 drafts","€0.03"]]},
  {id:"o11", name:"Month-end NCS return preview", kind:"report", owner:"NCS", ownerKind:"agent", initials:"NC",
   trigger:"Last working day", triggerKind:"schedule", next:"Fri 30 Oct", last:"Prepared 30 Sep", status:"healthy", rate:100, on:true,
   what:"Prepares the return file for review. Never submits it.",
   why:"Returns were rebuilt from scratch each month.",
   saved:"12 hours a month",
   steps:[["Trigger","Last working day of the month"],["Find","Claims, attendance and awards"],["Draft","Export preview"],["Approval","NCS admin reviews","gate"]],
   runs:[["30 Sep 17:00","2m 10s","ok","1 file","€0.05"]]}
];

const OPS_FILTERS = [
  ["all","All"], ["routine","Agent routines"], ["automation","Automations"],
  ["report","Scheduled reports"], ["task","Recurring tasks"], ["approval","Needs approval"], ["failed","Failed"]
];

const WORK_SECTIONS = [
  {id:"tasks", label:"Tasks", blurb:"Everything assigned to people, with owner, due date, department and the record it came from.",
   views:["All tasks","Due tasks","Review","Done"], filters:[]},
  {id:"approvals", label:"Approvals", blurb:"Decisions waiting on a person. Agents propose; people decide.",
   views:["Awaiting you","Awaiting others","Decided"], filters:[]},
  {id:"workflows", label:"Workflows", blurb:"Automations and agent routines: what runs on its own, and who owns it.",
   views:[], filters:[]},
  {id:"schedules", label:"Schedule", blurb:"When recurring work fires across the week.",
   views:[], filters:[]}
];

const WORK_TASKS = [];

const WORKFLOWS = [];

const SCHEDULES = [
  {id:"s1", name:"Morning brief", cadence:"Weekdays · 08:45", next:"Tomorrow 08:45", owner:"Owner Briefing", on:true, day:1},
  {id:"s2", name:"Invoice reminder sequence", cadence:"Daily · 08:00", next:"Tomorrow 08:00", owner:"Collections", on:true, day:1},
  {id:"s3", name:"Booking window closes", cadence:"Thursdays · 18:00", next:"Thu 18:00", owner:"Bookings", on:true, day:3},
  {id:"s4", name:"NCS Thursday deadline check", cadence:"Thursdays · 12:00", next:"Thu 12:00", owner:"NCS", on:true, day:3},
  {id:"s5", name:"Friday nine-location report", cadence:"Fridays · 16:00", next:"Fri 16:00", owner:"Owner Briefing", on:true, day:4}
];

const WIDGET_DEFS = [["inbox","Morning Brief"],["work","My work"],["activity","Activity"],["kpi","Today's numbers"],["visits","School runs today"]];
const WORK_WIDGETS = [
  {id:"queue", label:"My queue", value:"", hint:"assigned to you", icon:"work", queue:"mine"},
  {id:"late", label:"Running late", value:"", hint:"past their due date", icon:"health", queue:"overdue"},
  {id:"unassigned", label:"Unassigned", value:"", hint:"nobody owns it yet", icon:"teams", queue:"unassigned"},
  {id:"week", label:"Next 7 days", value:"", hint:"due this week", icon:"visits", queue:"upcoming"}
];
const PERSONALITIES = ["Straight-talking","Warm","Formal","Dry"];
const ANSWER_STYLES = ["Short answers","Show the working","Ask before acting"];
/* Every context source and every registered tool the agent could be granted —
   the builder shows the whole catalogue, grouped, rather than a sample. */
const CONTEXT_DEFS = [
  ["Families","records","Guardians, Parent IDs, flags"],
  ["Children","records","Rooms, schools, collectors (role-masked medical)"],
  ["Staff","records","Roles, sites, certificates"],
  ["Bookings","work","Sessions, windows, requests"],
  ["Attendance","work","Sign-ins, registers, manifests"],
  ["Approvals","work","What is waiting on a decision"],
  ["Invoices","money","Issued, paid, overdue"],
  ["Payment plans","money","Instalments and revisions"],
  ["NCS","money","Awards, claims, agreed hours"],
  ["Activity log","system","Every event, agent and human"],
  ["Policies","system","Fee terms and operating rules"],
  ["Reports","system","Occupancy, cash, debt"]
];
const CONTEXT_SOURCES = CONTEXT_DEFS.map(c => c[0]);
const SKILL_DEFS = [
  ["Search records","read"],["Summarise activity","read"],["Read invoices","read"],
  ["Read rota","read"],["Check ratios","read"],
  ["Draft parent message","write"],["Create task","write"],["Propose approval","write"],
  ["Prepare fee lines","write"],["Draft diary entry","write"],
  ["Send message","external"],["Charge a card","external"],["Submit NCS return","external"],["Refer a debt","external"]
];
/* The two questions the agent asks back once it knows the job. */
const TRAIN_PHASES = [
  ["Reading the whole ontology", "650 children · 480 families"],
  ["Learning how Ray of Sunshine words things", "ROS Parent ID, SAC, ECCE, CHICK"],
  ["Reading published policies", "fees, notice, NCS rules"],
  ["Writing its own system prompt", "1,180 tokens"]
];
const BRIEF_QUESTIONS = [
  {title:"What should it cover?", sub:"Pick as many as you like.",
   options:[["Staffing","Ratios, absences and relief"],["Money","Invoices, debt and plans"],
            ["NCS","Claims, CHICKs and hours"],["Families","Requests and messages"],
            ["Something else","Tell me in the next message"]]},
  {title:"When should it land?", sub:"One is enough to start.",
   options:[["Weekdays 08:45","Before the morning calls"],["Fridays 16:00","Weekly report"],
            ["Only when something changes","Event-driven, no noise"],["On demand","When you ask for it"]]}
];
/* The words under a name, keyed to the same state the face lights with. */
const STATE_LABELS = {working:"working", thinking:"thinking", waiting:"waiting on you",
  complete:"up to date", attention:"needs you", idle:"idle"};

const FACE_SHAPES = [
  ["crown-pebble","Crown pebble"],["executive-capsule","Executive capsule"],["shield","Shield"],
  ["glass-visor","Glass visor"],["control-cube","Control cube"],["low-dome","Low dome"],
  ["offset-pebble","Offset pebble"],["rim-capsule","Rim capsule"],["wide-eyed","Wide-eyed"],
  ["precision-brow","Precision brow"],["tall-unit","Tall unit"],["soft-asymmetric","Soft asymmetric"]
];
/* Shell colours only — deliberately desaturated so none of them reads as a
   state. The eyes, rim and dots always carry the state colour. */
const FACE_TINTS = [
  ["#191c1f","Graphite"],["#1b2430","Slate"],["#241b2e","Aubergine"],
  ["#2a2118","Bronze"],["#16241f","Pine"],["#2b1b1e","Oxblood"]
];

/* ---- ontology graph: generation, Dijkstra traversal, canvas render ---- */
const CLUSTERS = [
  ["Families",      "#FFF100", 0.00, 0.62, 46],
  ["Children",      "#6cb4ec", 0.90, 0.70, 56],
  ["Staff",         "#8DB35E", 1.75, 0.66, 44],
  ["Bookings",      "#f0c04b", 2.55, 0.72, 52],
  ["Invoices",      "#f0567f", 3.35, 0.60, 40],
  ["NCS",           "#5fe0a8", 4.15, 0.70, 34],
  ["Locations",     "#f0803a", 4.95, 0.64, 26],
  ["Routes",        "#9d8cf5", 5.65, 0.72, 30]
];

function mulberry(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* Hub-and-spoke clusters around a dense phyllotaxis core, in unit space
   (-1..1 on both axes) so the layout is resolution independent. */
const _hexCache = {};
function hexRGB(hex){
  if (_hexCache[hex]) return _hexCache[hex];
  const h = hex.replace("#", "");
  const v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  _hexCache[hex] = v;
  return v;
}


function buildGraph(){
  const rnd = mulberry(20260902);
  const nodes = [], edges = [], adj = [];
  const add = (x, y, z, r, cluster, kind) => {
    nodes.push({x, y, z, r, cluster, kind}); adj.push([]); return nodes.length - 1;
  };
  const link = (a, b) => {
    const dx = nodes[a].x - nodes[b].x, dy = nodes[a].y - nodes[b].y, dz = nodes[a].z - nodes[b].z;
    const w = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.004;
    const id = edges.length;
    edges.push({a, b, w});
    adj[a].push([b, w, id]); adj[b].push([a, w, id]);
  };

  // the core is a filled sphere on a Fibonacci lattice, not a disc
  const CORE = 880, coreIds = [];
  for (let i = 0; i < CORE; i++){
    const t = (i + 0.5) / CORE;
    const phi = Math.acos(1 - 2 * t);
    const theta = i * 2.39996;
    const shell = 0.16 + 0.28 * Math.pow(rnd(), 0.5);
    const grade = rnd();
    coreIds.push(add(
      Math.sin(phi) * Math.cos(theta) * shell * 1.04,
      Math.cos(phi) * shell * 0.96,
      Math.sin(phi) * Math.sin(theta) * shell,
      grade < 0.06 ? 3.4 + rnd() * 1.4 : grade < 0.3 ? 2.1 + rnd() * 0.7 : 1.0 + rnd() * 0.8, 0, "core"));
  }
  // lattice neighbours plus a mesh of chords, so the sphere reads as a volume
  for (let i = 1; i < coreIds.length; i++){
    link(coreIds[i], coreIds[i - 1]);
    if (i >= 13) link(coreIds[i], coreIds[i - 13]);
    if (i >= 21 && i % 2 === 0) link(coreIds[i], coreIds[i - 21]);
    if (i >= 34 && i % 3 === 0) link(coreIds[i], coreIds[i - 34]);
    if (i >= 55 && i % 4 === 0) link(coreIds[i], coreIds[i - 55]);
    if (i >= 89 && i % 5 === 0) link(coreIds[i], coreIds[i - 89]);
    if (i % 6 === 0) link(coreIds[i], coreIds[Math.floor(rnd() * coreIds.length)]);
  }

  // a mid shell between the nucleus and the lobes: the layer that makes it
  // read as a network rather than a ball with satellites
  const MID = 560, midIds = [];
  for (let i = 0; i < MID; i++){
    const t = (i + 0.5) / MID;
    const phi = Math.acos(1 - 2 * t), theta = i * 2.39996 + 0.7;
    const d = 0.52 + 0.16 * Math.pow(rnd(), 0.6);
    const g2 = rnd();
    midIds.push(add(
      Math.sin(phi) * Math.cos(theta) * d * 1.02,
      Math.cos(phi) * d * 0.96,
      Math.sin(phi) * Math.sin(theta) * d,
      g2 < 0.05 ? 2.6 + rnd() * 1.0 : g2 < 0.3 ? 1.6 + rnd() * 0.6 : 0.8 + rnd() * 0.7, 0, "core"));
  }
  for (let i = 0; i < midIds.length; i++){
    if (i >= 1) link(midIds[i], midIds[i - 1]);
    if (i >= 17) link(midIds[i], midIds[i - 17]);
    if (i >= 29 && i % 2 === 0) link(midIds[i], midIds[i - 29]);
    // radial spokes tying the shell to the nucleus
    if (i % 2 === 0) link(midIds[i], coreIds[Math.floor(rnd() * coreIds.length)]);
    if (i % 9 === 0) link(midIds[i], coreIds[Math.floor(rnd() * coreIds.length)]);
  }

  // clusters ride a sphere: each hub gets its own latitude as well as longitude
  const hubs = [], clusterLeaves = [];
  const onSphere = (lon, lat, d0) => { const d = d0 * 1.22;
    return [Math.cos(lat) * Math.cos(lon) * d * 1.02, Math.sin(lat) * d * 0.96, Math.cos(lat) * Math.sin(lon) * d]; };
  CLUSTERS.forEach((c, ci) => {
    const [, , ang, dist, leaves] = c;
    const lat = (ci % 2 ? 1 : -1) * (0.26 + rnd() * 0.5);
    const wob = 1.06 + rnd() * 0.16;
    const hp = onSphere(ang, lat, dist * wob);
    const hub = add(hp[0], hp[1], hp[2], 5.4, ci, "hub");
    hubs.push(hub);
    const mine = [];
    clusterLeaves.push(mine);
    for (let k = 0; k < 3; k++) link(hub, coreIds[Math.floor(rnd() * coreIds.length)]);
    for (let k = 0; k < 5; k++) link(hub, midIds[Math.floor(rnd() * midIds.length)]);

    const subs = 5 + Math.floor(rnd() * 4);
    const subIds = [];
    for (let s = 0; s < subs; s++){
      const sa = ang + (rnd() - 0.5) * 0.52, sl = lat + (rnd() - 0.5) * 0.3;
      const sd = dist + 0.08 + rnd() * 0.18;
      const sp = onSphere(sa, sl, sd);
      const sub = add(sp[0], sp[1], sp[2], 3.2, ci, "sub");
      subIds.push(sub);
      link(sub, hub);
      if (s > 0 && rnd() < 0.7) link(sub, subIds[s - 1]);
      const fan = Math.floor((leaves * 7.4) / subs);
      const spread = 0.17 + rnd() * 0.2;
      let prev = -1;
      for (let l = 0; l < fan; l++){
        const la = sa + (rnd() - 0.5) * spread * 2 + (rnd() - 0.5) * 0.06;
        const ll = sl + (rnd() - 0.5) * spread * 1.1;
        const ld = sd + 0.03 + Math.pow(rnd(), 0.8) * 0.17;
        const lp = onSphere(la, ll, ld);
        const lg = rnd();
        const leaf = add(lp[0], lp[1], lp[2],
          lg < 0.08 ? 2.8 + rnd() * 1.2 : lg < 0.34 ? 1.8 + rnd() * 0.6 : 1.0 + rnd() * 0.7, ci, "leaf");
        link(leaf, sub);
        mine.push(leaf);
        if (rnd() < 0.14) link(leaf, hub);
        if (prev >= 0 && rnd() < 0.34) link(leaf, prev);
        if (rnd() < 0.16) link(leaf, midIds[Math.floor(rnd() * midIds.length)]);
        prev = leaf;
      }
    }
  });
  // far satellites hanging off the outer leaves
  CLUSTERS.forEach((c, ci) => {
    const [, , ang, dist] = c;
    for (let s = 0; s < 7; s++){
      const sa = ang + (rnd() - 0.5) * 1.5, sl = (rnd() - 0.5) * 1.3;
      const sd = dist + 0.42 + rnd() * 0.22;
      const ap = onSphere(sa, sl, sd);
      const anchor = add(ap[0], ap[1], ap[2], 2.4, ci, "sub");
      link(anchor, hubs[ci]);
      const n = 14 + Math.floor(rnd() * 18);
      for (let l = 0; l < n; l++){
        const la = sa + (rnd() - 0.5) * 0.9, ll = sl + (rnd() - 0.5) * 0.7;
        const ld = sd + 0.02 + Math.pow(rnd(), 0.8) * 0.18;
        const p = onSphere(la, ll, ld);
        const leaf = add(p[0], p[1], p[2], 0.8 + rnd() * 0.9, ci, "leaf");
        link(leaf, anchor);
        clusterLeaves[ci].push(leaf);
      }
    }
  });

  // two hub rings and long chords across the sphere
  hubs.forEach((h, i) => {
    link(h, hubs[(i + 1) % hubs.length]);
    link(h, hubs[(i + 2) % hubs.length]);
    if (i % 3 === 0) link(h, hubs[(i + 4) % hubs.length]);
  });
  // neighbouring clusters share records, so their leaves cross-link
  for (let ci = 0; ci < clusterLeaves.length; ci++){
    const a = clusterLeaves[ci], b = clusterLeaves[(ci + 1) % clusterLeaves.length];
    const n = 26 + Math.floor(rnd() * 16);
    for (let k = 0; k < n; k++){
      link(a[Math.floor(rnd() * a.length)], b[Math.floor(rnd() * b.length)]);
    }
    // and a good number reach right across to the far side
    for (let k = 0; k < 12; k++){
      const far = clusterLeaves[(ci + 3) % clusterLeaves.length];
      link(a[Math.floor(rnd() * a.length)], far[Math.floor(rnd() * far.length)]);
    }
    for (let k = 0; k < 8; k++){
      const far = clusterLeaves[(ci + 4) % clusterLeaves.length];
      link(a[Math.floor(rnd() * a.length)], far[Math.floor(rnd() * far.length)]);
    }
  }

  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const n of nodes){
    if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
    if (n.z < minZ) minZ = n.z; if (n.z > maxZ) maxZ = n.z;
  }
  const bounds = {minX, maxX, minY, maxY, cx:(minX + maxX) / 2, cy:(minY + maxY) / 2,
    cz:(minZ + maxZ) / 2, w:maxX - minX, h:maxY - minY, d:maxZ - minZ,
    radius: Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2,
    reach: nodes.reduce((m, n) => Math.max(m, Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z)), 0)};
  return {nodes, edges, adj, hubs, coreIds, bounds};
}

export {
  INK,
  BODY,
  DIM,
  FAINT,
  LIME,
  GREEN,
  AMBER,
  RED,
  NEUTRAL,
  MONO,
  ICONS,
  REC_SECTIONS,
  CONTACTS,
  FILE_TREE,
  ONTO_NODES,
  ONTO_EDGES,
  REC_TEMPLATES,
  REC_TEMPLATE_CATS,
  PEOPLE,
  ROLE_LEVELS,
  PERM_KEYS,
  GRANT_DEFS,
  ROLE_SCOPES,
  DEFAULT_PERMS,
  INTEGRATIONS,
  BG_DEFS,
  THEMES,
  ADMIN_ICONS,
  ADMIN_CARDS,
  ADMIN_GROUPS,
  SRC_TINT,
  SRC_ABBR,
  DATA_EVENTS,
  PEOPLE_EVENTS,
  AI_EVENTS,
  STREAM_DEFS,
  NAV,
  ITEMS,
  ORDER,
  ANSWERS,
  synthesizeCustomArea,
  pickAnswer,
  ORGS,
  TEAMS,
  LOCATIONS,
  AGENT_DEFS,
  KPI_DEFS,
  ASPECT_DEFS,
  FILTER_GROUPS,
  OPS_DEFS,
  OPS_FILTERS,
  WORK_SECTIONS,
  WORK_TASKS,
  WORKFLOWS,
  SCHEDULES,
  WIDGET_DEFS,
  WORK_WIDGETS,
  PERSONALITIES,
  ANSWER_STYLES,
  CONTEXT_DEFS,
  CONTEXT_SOURCES,
  SKILL_DEFS,
  TRAIN_PHASES,
  BRIEF_QUESTIONS,
  STATE_LABELS,
  FACE_SHAPES,
  FACE_TINTS,
  CLUSTERS,
  mulberry,
  _hexCache,
  hexRGB,
  buildGraph
};
