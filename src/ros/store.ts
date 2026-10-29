/* The single source of truth. State = deterministic seed + a replayed log of
   demo actions, so a reload (localStorage) or "Reset demo" always lands on a
   consistent world. Every action writes its own Activity entry, so Home,
   Command, Work, Agents and Activity all move together. Nothing here talks
   to a network, a payment provider or a messaging service. */
import { useSyncExternalStore } from "react";
import { buildSeed } from "./seed";
import type { RosState, Ref, RoleId, LocationId, ActivityEvent, AgentAction, CommEvent } from "./types";
import { hm, TODAY } from "./time";

/* ---------------- roles ---------------- */
export interface RoleDef {
  id: RoleId; label: string; person: string; initials: string; title: string; scope: LocationId | "ALL";
  finance: boolean; payroll: boolean; medical: boolean; safeguarding: boolean;
}
export const ROLES: RoleDef[] = [
  { id: "owner", label: "Owner", person: "Amanda Spiteri", initials: "AS", title: "Owner · all 9 locations", scope: "ALL", finance: true, payroll: true, medical: true, safeguarding: true },
  { id: "ops", label: "Operations Manager", person: "Deirdre Kinsella", initials: "DK", title: "Operations · all locations", scope: "ALL", finance: true, payroll: false, medical: true, safeguarding: true },
  { id: "accounts", label: "Accounts Team", person: "Gráinne Whelan", initials: "GW", title: "Accounts · billing and debt", scope: "ALL", finance: true, payroll: false, medical: false, safeguarding: false },
  { id: "ncs", label: "NCS Administrator", person: "Lorraine Tobin", initials: "LT", title: "NCS · CHICKs, hours, claims", scope: "ALL", finance: true, payroll: false, medical: false, safeguarding: false },
  { id: "locmgr", label: "Location Manager", person: "Joanne Redmond", initials: "JR", title: "Manager · Arklow Rocks only", scope: "ARR", finance: false, payroll: false, medical: true, safeguarding: true },
  { id: "practitioner", label: "Room Leader / Practitioner", person: "Room team · Hazelbrook", initials: "RT", title: "Practitioner · Hazelbrook rooms", scope: "HAZ", finance: false, payroll: false, medical: true, safeguarding: false },
  { id: "driver", label: "Driver", person: "Gerry Doran", initials: "GD", title: "Driver · route WKR-02", scope: "HAZ", finance: false, payroll: false, medical: true, safeguarding: false },
  { id: "parent", label: "Parent (MyRosKids)", person: "Sinéad O'Neill", initials: "SO", title: "Parent · O'Neill family (ROS1042)", scope: "HAZ", finance: false, payroll: false, medical: false, safeguarding: false },
];
export const roleDef = (id: RoleId) => ROLES.find(r => r.id === id) || ROLES[0];

/* ---------------- ui state ---------------- */
export interface Toast { id: number; text: string; tone: "ok" | "warn" | "bad" | "info"; undo?: boolean }
export interface ConfirmReq { title: string; body: string; confirmLabel: string; danger?: boolean; run: () => void }
export interface UiState {
  role: RoleId; loc: LocationId | "ALL";
  tabs: Record<string, string>; focus: Record<string, string>;
  drawer: Ref[]; toasts: Toast[]; confirm: ConfirmReq | null;
}

type ActionRec = { t: string; p: any; actor: string; clock: number };
type Ctx = {
  actor: string; now: string; time: string;
  id: (prefix: string) => string;
  log: (e: Omit<ActivityEvent, "id" | "seq" | "at" | "actor" | "actorKind"> & { actor?: string; actorKind?: ActivityEvent["actorKind"] }) => void;
  agent: (agentId: string, text: string, kind?: AgentAction["kind"], link?: Ref) => void;
  comm: (familyId: string, channel: string, direction: CommEvent["direction"], summary: string, by?: string) => void;
};
type Reducer<P> = (s: RosState, p: P, ctx: Ctx) => void;

const KEY = "ros-demo-v1";
const reducers = new Map<string, Reducer<any>>();
let state: RosState | null = null;
let log: ActionRec[] = [];
let version = 0;
let ui: UiState = { role: "owner", loc: "ALL", tabs: {}, focus: {}, drawer: [], toasts: [], confirm: null };
let toastN = 0;
const listeners = new Set<() => void>();

function load(): { log: ActionRec[]; ui?: Partial<UiState> } {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* private window or blocked storage */ }
  return { log: [] };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ log, ui: { role: ui.role, loc: ui.loc } })); } catch { /* demo still works without persistence */ }
}

function makeCtx(s: RosState, rec: ActionRec): Ctx {
  // Stamps are read when written, so an action that moves the demo clock (boarding at 14:49) logs at the new time.
  const stampNow = () => TODAY + " " + hm(Math.max(rec.clock, s.clockMin));
  return {
    actor: rec.actor,
    get now() { return stampNow(); },
    get time() { return hm(Math.max(rec.clock, s.clockMin)); },
    id: (prefix) => prefix + "-" + (s.seq++),
    log: (e) => {
      const seq = s.seq++;
      s.activity.push({ id: "EV" + seq, seq, at: stampNow(), actor: e.actor || rec.actor, actorKind: e.actorKind || "person", category: e.category, title: e.title, detail: e.detail, link: e.link, locationId: e.locationId });
    },
    agent: (agentId, text, kind = "action", link) => { s.agentActions.push({ id: "AG" + (s.seq++), agentId, at: stampNow(), text, kind, link }); },
    comm: (familyId, channel, direction, summary, by) => { s.comms.push({ id: "CM" + (s.seq++), familyId, at: stampNow(), channel, direction, summary, by: by || rec.actor }); },
  };
}

function apply(s: RosState, rec: ActionRec) {
  const fn = reducers.get(rec.t);
  if (!fn) return; // an action from an older build: skip rather than break the demo
  try { fn(s, rec.p, makeCtx(s, rec)); } catch (e) { console.warn("[ros] action failed", rec.t, e); }
}

function ensure(): RosState {
  if (state) return state;
  const saved = load();
  state = buildSeed();
  log = Array.isArray(saved.log) ? saved.log : [];
  for (const rec of log) apply(state, rec);
  if (saved.ui) ui = { ...ui, role: (saved.ui.role as RoleId) || ui.role, loc: (saved.ui.loc as any) || ui.loc };
  return state;
}

function emit() { version++; for (const l of listeners) l(); }

/* ---------------- public api ---------------- */
export function getState(): RosState { return ensure(); }
export function getUi(): UiState { ensure(); return ui; }
export function getVersion() { return version; }
export function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** Define a replayable action. Reducers must be deterministic (ids via ctx.id, time via ctx.now). */
export function defineAction<P>(type: string, reducer: Reducer<P>, opts: { toast?: (p: P) => string; undo?: boolean } = {}) {
  reducers.set(type, reducer);
  return (p: P) => {
    const s = ensure();
    const rec: ActionRec = { t: type, p, actor: roleDef(ui.role).person, clock: s.clockMin };
    apply(s, rec);
    log.push(rec);
    save();
    if (opts.toast) pushToast(opts.toast(p), "ok", !!opts.undo);
    emit();
  };
}

export function undoLast() {
  if (!log.length) return;
  log.pop();
  state = buildSeed();
  for (const rec of log) apply(state, rec);
  save();
  pushToast("Undone. Every linked record is back as it was.", "info");
  emit();
}

export function resetDemo() {
  log = [];
  state = buildSeed();
  ui = { ...ui, role: "owner", loc: "ALL", drawer: [], confirm: null, focus: {}, tabs: {} };
  save();
  pushToast("Demo reset to Tuesday 20 October, 08:45.", "info");
  emit();
}

export function setUi(patch: Partial<UiState>) {
  ensure();
  ui = { ...ui, ...patch };
  if ("role" in patch || "loc" in patch) save();
  emit();
}

export function pushToast(text: string, tone: Toast["tone"] = "ok", undo = false) {
  const t: Toast = { id: ++toastN, text, tone, undo };
  ui = { ...ui, toasts: ui.toasts.concat(t).slice(-3) };
  setTimeout(() => { ui = { ...ui, toasts: ui.toasts.filter(x => x.id !== t.id) }; emit(); }, undo ? 7000 : 4200);
}

export function confirmThen(req: ConfirmReq) { setUi({ confirm: req }); }

/* drawers and navigation */
export function openRecord(ref: Ref) { ensure(); ui = { ...ui, drawer: ui.drawer.concat(ref).slice(-4) }; emit(); }
export function closeRecord() { ui = { ...ui, drawer: ui.drawer.slice(0, -1) }; emit(); }
export function closeAllRecords() { ui = { ...ui, drawer: [] }; emit(); }

let navigator: ((page: string) => void) | null = null;
export function setNavigator(fn: (page: string) => void) { navigator = fn; }
/** Go to a module, optionally a tab, and optionally focus a record (e.g. {familyId}). */
export function nav(page: string, tab?: string, focus?: Record<string, string>) {
  ensure();
  ui = { ...ui, tabs: tab ? { ...ui.tabs, [page]: tab } : ui.tabs, focus: focus ? { ...ui.focus, ...focus } : ui.focus, drawer: [] };
  if (navigator) navigator(page);
  emit();
}
export function setTab(page: string, tab: string) { ui = { ...ui, tabs: { ...ui.tabs, [page]: tab } }; emit(); }
export function setFocus(patch: Record<string, string>) { ui = { ...ui, focus: { ...ui.focus, ...patch } }; emit(); }

/** React hook: re-renders on every store change and returns the live world. */
export function useRos() {
  useSyncExternalStore(subscribe, getVersion);
  return { s: ensure(), ui, role: roleDef(ui.role), v: version };
}

/* ---------------- clock ---------------- */
export const setClock = defineAction<{ min: number }>("clock.set", (s, p, ctx) => {
  if (p.min <= s.clockMin) return;
  s.clockMin = p.min;
  ctx.log({ category: "System", title: "Demo clock moved to " + hm(p.min), detail: "Demo time only. Nothing outside the demo changes.", actorKind: "system", actor: "Demo clock" });
});
