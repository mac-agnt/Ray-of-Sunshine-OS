/* Schematic map of Ireland with the nine Ray of Sunshine sites, plus the small
   site-level derivations Command, Locations and Reports share (site health,
   today's attendance by site, next school run, clickable column charts).
   The coastline is a hand-simplified outline from approximate lon/lat points:
   it is schematic and not to scale. Pin colour comes from live records. */
import { useId } from "react";
import type { LocationId, Location, Ref, Tone, ISODate, Session, Approval, Booking } from "../types";
import { useRos, nav, getUi, getState } from "../store";
import { canSee } from "../registry";
import {
  cached, ratioCheck, idx, family, childStatus, invoiceStatus, invoiceBalance, daysOverdue, certStatus, manifest, childName, staffById,
} from "../selectors";
import { TODAY, TOMORROW, toMin, dowLong, fmtDay } from "../time";
import { toneInk } from "../ui";

/* ---------------- small shared helpers ---------------- */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "Tuesday 20 October" */
export const longDate = (d: ISODate) => dowLong(d) + " " + +d.slice(8, 10) + " " + MONTHS[+d.slice(5, 7) - 1];

/** A click handler that navigates only when the current role may open that page, so no tile becomes a dead end. */
export function goTo(page: string, tab?: string, focus?: Record<string, string>): (() => void) | undefined {
  return canSee(page, getUi().role) ? () => nav(page, tab, focus) : undefined;
}

export const plural = (n: number, one: string, many = one + "s") => n + " " + (n === 1 ? one : many);
const TAG: Record<string, string> = { HAZ: "Hazelbrook", BRK: "Brookfield", ARC: "Ark. Crèche", ARR: "Ark. Rocks", BKD: "Burkeen", GOR: "Gorey", CAN: "Canovee", DUN: "Dungarvan", BMN: "Ballymun" };
/** Compact site label for narrow chart columns (the two Arklow sites stay distinct). */
export const siteTag = (id: string) => TAG[id] || id;

/* ---------------- site health ---------------- */
export type SiteTone = "ok" | "warn" | "bad";
export const SITE_TONE_LABEL: Record<SiteTone, string> = { bad: "Action needed", warn: "Follow-up", ok: "Clear" };
export interface SiteReason { tone: "warn" | "bad"; text: string; ref?: Ref }
export interface RatioGap { date: ISODate; session: Session; roomId?: string; booked: number; rostered: number; required: number; issueId?: string }
export interface SiteHealth { tone: SiteTone; reasons: SiteReason[]; gaps: RatioGap[] }

/** Ratio gaps for one site today and tomorrow, the same rules as ratioAlerts() but not limited by the location filter. */
export function siteRatioGaps(loc: LocationId): RatioGap[] {
  return cached("ie:gaps:" + loc, () => {
    const s = getState(), out: RatioGap[] = [];
    for (const date of [TODAY, TOMORROW]) {
      for (const session of ["Morning", "After School"] as Session[]) {
        if (date === TODAY && session === "Morning" && s.clockMin > toMin("09:15")) continue;
        const r = ratioCheck(loc, date, session);
        if (!r.ok) out.push({ date, session, booked: r.booked, rostered: r.rostered, required: r.required, issueId: s.issues.find(i => i.kind === "Ratio" && i.locationId === loc && i.date === date && i.session === session)?.id });
      }
      for (const room of s.rooms.filter(rm => rm.locationId === loc && rm.kind !== "SAC")) {
        const r = ratioCheck(loc, date, "Full Day", room.id);
        if (!r.ok) out.push({ date, session: "Full Day", roomId: room.id, booked: r.booked, rostered: r.rostered, required: r.required });
      }
    }
    return out;
  });
}

const dayWord = (d: ISODate) => (d === TODAY ? "Today" : d === TOMORROW ? "Tomorrow" : fmtDay(d));

/** Red: ratio gap or missing child. Amber: incident, NCS claim lapsing inside 48h, debt over 30 days, expired Garda vetting, medication review. */
export function siteHealthAll(): Record<string, SiteHealth> {
  return cached("ie:health", () => {
    const s = getState(), out: Record<string, SiteHealth> = {};
    const claimCut = TOMORROW + " 23:59";
    for (const l of s.locations) {
      const reasons: SiteReason[] = [];
      const gaps = siteRatioGaps(l.id);
      for (const g of gaps) reasons.push({ tone: "bad", text: dayWord(g.date) + " " + g.session + (g.roomId ? " (" + (idx().room.get(g.roomId)?.name || g.roomId) + ")" : "") + ": " + g.rostered + " of " + g.required + " staff for " + g.booked + " booked", ref: g.issueId ? { kind: "issue", id: g.issueId } : { kind: "location", id: l.id } });
      for (const m of s.issues.filter(i => i.kind === "Missing child" && i.status === "Open" && i.locationId === l.id)) reasons.push({ tone: "bad", text: m.title, ref: { kind: "issue", id: m.id } });
      const inc = s.incidents.filter(i => i.locationId === l.id && i.status !== "Closed");
      if (inc.length) reasons.push({ tone: "warn", text: plural(inc.length, "incident") + " awaiting signature or review", ref: { kind: "incident", id: inc[0].id } });
      const cl = s.claims.filter(c => c.status === "Awaiting acceptance" && c.deadline <= claimCut && family(c.familyId)?.locationId === l.id).sort((a, b) => a.deadline.localeCompare(b.deadline));
      if (cl.length) reasons.push({ tone: "warn", text: plural(cl.length, "NCS claim") + " lapsing " + (cl[0].deadline.slice(0, 10) === TODAY ? "today " : dayWord(cl[0].deadline.slice(0, 10)).toLowerCase() + " ") + cl[0].deadline.slice(11), ref: { kind: "claim", id: cl[0].id } });
      const old = s.invoices.filter(i => { const st = invoiceStatus(i); return (st === "Overdue" || st === "Debt review") && daysOverdue(i) > 30 && invoiceBalance(i) > 0 && family(i.familyId)?.locationId === l.id; });
      if (old.length) reasons.push({ tone: "warn", text: plural(old.length, "invoice") + " more than 30 days overdue", ref: { kind: "invoice", id: old[0].id } });
      for (const st of s.staff.filter(x => x.locationId === l.id && certStatus(x).gardaExpired)) reasons.push({ tone: "warn", text: "Garda vetting expired: " + st.name + " (blocked from rota)", ref: { kind: "staff", id: st.id } });
      const meds = s.children.filter(c => c.locationId === l.id && c.medication && c.medication.expires <= "2026-11-03");
      if (meds.length) reasons.push({ tone: "warn", text: plural(meds.length, "medication record") + " due for review", ref: { kind: "child", id: meds[0].id } });
      const tone: SiteTone = reasons.some(r => r.tone === "bad") ? "bad" : reasons.length ? "warn" : "ok";
      out[l.id] = { tone, reasons, gaps };
    }
    return out;
  });
}

/* ---------------- today by site ---------------- */
export type DayState = "in" | "out" | "bus" | "absent" | "due" | "later";
export const DAY_STATE_LABEL: Record<DayState, string> = { in: "Signed in", out: "Signed out", bus: "On bus", absent: "Absent", due: "Due, not signed in", later: "Expected later" };
export const DAY_STATE_TONE: Record<DayState, Tone> = { in: "ok", out: "neutral", bus: "info", absent: "bad", due: "warn", later: "accent" };

/** Where a booked child stands right now, relative to their next session today. */
export function dayState(childId: string, todays: Booking[], clockMin: number): DayState {
  const st = childStatus(childId);
  if (st.status === "Signed in") return "in";
  if (st.status === "On bus") return "bus";
  if (st.status === "Absent" || st.status === "Not present") return "absent";
  const sorted = todays.slice().sort((a, b) => a.start.localeCompare(b.start));
  const next = sorted.find(b => !st.time || b.start > st.time);
  if (st.status === "Signed out" && !next) return "out";
  const b = next || sorted[0];
  if (!b) return "out";
  return toMin(b.start) <= clockMin ? "due" : "later";
}

export interface SiteDay { enrolled: number; booked: number; sessions: number; counts: Record<DayState, number> }
export function siteDayAll(): Record<string, SiteDay> {
  return cached("ie:day", () => {
    const s = getState(), out: Record<string, SiteDay> = {};
    for (const l of s.locations) out[l.id] = { enrolled: 0, booked: 0, sessions: 0, counts: { in: 0, out: 0, bus: 0, absent: 0, due: 0, later: 0 } };
    for (const c of s.children) out[c.locationId].enrolled++;
    const byChild = new Map<string, Booking[]>();
    for (const b of idx().bookingsByDate.get(TODAY) || []) {
      out[b.locationId].sessions++;
      if (!byChild.has(b.childId)) byChild.set(b.childId, []);
      byChild.get(b.childId)!.push(b);
    }
    for (const [cid, list] of byChild) {
      const e = out[list[0].locationId];
      e.booked++;
      e.counts[dayState(cid, list, s.clockMin)]++;
    }
    return out;
  });
}

/** Next school run for a site today, from the route stops and today's manifest. */
export function siteNextRun(loc: LocationId): { text: string; tone: Tone; ref?: Ref } {
  const s = getState();
  const routes = s.routes.filter(r => r.locationId === loc);
  if (!routes.length) return { text: "No minibus · escort walk from school", tone: "neutral" };
  const items = routes.map(r => {
    const first = toMin(r.stops[0].time), last = toMin(r.stops[r.stops.length - 1].time);
    return { r, first, last, riders: manifest(r.id, TODAY).length };
  }).sort((a, b) => a.first - b.first);
  const now = s.clockMin;
  const next = items.find(x => x.last >= now);
  if (!next) return { text: items.map(x => x.r.id).join(", ") + " complete · " + items.reduce((n, x) => n + x.riders, 0) + " riders", tone: "ok", ref: { kind: "route", id: items[0].r.id } };
  const live = next.first <= now;
  return { text: next.r.id + (live ? " on the road · last stop " : " · first pickup ") + (live ? next.r.stops[next.r.stops.length - 1].time : next.r.stops[0].time) + " · " + plural(next.riders, "rider"), tone: live ? "info" : "accent", ref: { kind: "route", id: next.r.id } };
}

/** Which site an approval belongs to, when its link says. */
export function approvalLoc(a: Approval): LocationId | undefined {
  if (!a.link) return undefined;
  const s = getState();
  if (a.link.kind === "issue") return s.issues.find(i => i.id === a.link!.id)?.locationId;
  if (a.link.kind === "family") return family(a.link.id)?.locationId;
  return undefined;
}

/* ---------------- clickable charts ---------------- */
export function ClickCols({ data, height = 130, format = (n: number) => String(n), tone = "accent" }: {
  data: { label: string; value: number; tone?: Tone; hint?: string; onClick?: () => void }[]; height?: number; format?: (n: number) => string; tone?: Tone;
}) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: height + 36 }}>
      {data.map((d, i) => {
        const t = d.tone || tone;
        const body = (
          <>
            <span style={{ fontSize: 10.5, color: "var(--dim)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{format(d.value)}</span>
            <span style={{ display: "block", width: "100%", maxWidth: 44, height: Math.max(3, (d.value / max) * height), borderRadius: "7px 7px 3px 3px", background: t === "accent" ? "var(--accent-fill,var(--accent))" : toneInk[t], transformOrigin: "bottom", animation: "growBar .6s var(--ease) both", animationDelay: i * 30 + "ms" }} />
            <span style={{ fontSize: 10.5, color: "var(--faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{d.label}</span>
          </>
        );
        const st = { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 6, background: "none", border: 0, padding: "4px 0 0", color: "inherit", borderRadius: 8 };
        return d.onClick
          ? <button key={i} className="ros-focus ros-row-hover" title={(d.hint || d.label + ": " + format(d.value)) + " · open"} onClick={d.onClick} style={{ ...st, cursor: "pointer", height: "100%", justifyContent: "flex-end" }}>{body}</button>
          : <div key={i} title={d.hint || d.label + ": " + format(d.value)} style={{ ...st, height: "100%", justifyContent: "flex-end" }}>{body}</div>;
      })}
    </div>
  );
}

/** Two bars per group (for example invoiced vs collected). */
export function PairCols({ data, names, tones = ["accent", "ok"], height = 130, format = (n: number) => String(n), top }: {
  data: { label: string; a: number; b: number; onClick?: () => void; hint?: string }[]; names: [string, string]; tones?: [Tone, Tone]; height?: number; format?: (n: number) => string;
  top?: (d: { a: number; b: number }) => string;
}) {
  const max = Math.max(1, ...data.flatMap(d => [d.a, d.b]));
  const fill = (t: Tone) => (t === "accent" ? "var(--accent-fill,var(--accent))" : toneInk[t]);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: height + 36 }}>
        {data.map((d, i) => (
          <button key={i} className="ros-focus ros-row-hover" onClick={d.onClick} disabled={!d.onClick} title={d.hint || d.label + " · " + names[0] + " " + format(d.a) + " · " + names[1] + " " + format(d.b)}
            style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 6, background: "none", border: 0, borderRadius: 8, padding: "4px 0 0", color: "inherit", cursor: d.onClick ? "pointer" : "default" }}>
            <span style={{ fontSize: 10.5, color: "var(--dim)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{top ? top(d) : format(d.b)}</span>
            <span style={{ display: "flex", alignItems: "flex-end", gap: 3, width: "100%", maxWidth: 64, justifyContent: "center" }}>
              <span style={{ flex: 1, height: Math.max(3, (d.a / max) * height), borderRadius: "6px 6px 2px 2px", background: fill(tones[0]), opacity: 0.55 }} />
              <span style={{ flex: 1, height: Math.max(3, (d.b / max) * height), borderRadius: "6px 6px 2px 2px", background: fill(tones[1]) }} />
            </span>
            <span style={{ fontSize: 10.5, color: "var(--faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{d.label}</span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
        {names.map((n, i) => <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--dim)" }}><span style={{ width: 9, height: 9, borderRadius: 2, background: fill(tones[i]), opacity: i ? 1 : 0.55 }} />{n}</span>)}
      </div>
    </div>
  );
}

/* ---------------- the map ---------------- */
// Approximate coastline, clockwise from Malin Head. Simplified by hand; schematic only.
const COAST: [number, number][] = [
  [-7.37, 55.38], [-7.05, 55.25], [-6.95, 55.15], [-6.65, 55.2], [-6.25, 55.22], [-6.05, 55.15], [-5.95, 54.98], [-5.75, 54.85],
  [-5.9, 54.7], [-5.53, 54.65], [-5.45, 54.45], [-5.55, 54.3], [-5.66, 54.24], [-5.88, 54.1], [-6.1, 54.03], [-6.36, 54.0],
  [-6.25, 53.85], [-6.23, 53.7], [-6.1, 53.55], [-6.08, 53.45], [-6.04, 53.38], [-6.2, 53.34], [-6.1, 53.27], [-6.08, 53.17],
  [-6.0, 53.05], [-5.99, 52.96], [-6.06, 52.88], [-6.1, 52.79], [-6.18, 52.62], [-6.22, 52.48], [-6.35, 52.33], [-6.36, 52.18],
  [-6.62, 52.17], [-6.93, 52.13], [-7.0, 52.22], [-7.15, 52.14], [-7.55, 52.05], [-7.85, 51.95], [-8.25, 51.8], [-8.53, 51.6],
  [-9.0, 51.55], [-9.4, 51.47], [-9.82, 51.44], [-9.55, 51.62], [-10.15, 51.58], [-9.8, 51.78], [-10.38, 51.78], [-9.85, 52.03],
  [-10.48, 52.1], [-10.2, 52.27], [-9.85, 52.3], [-9.9, 52.45], [-9.55, 52.58], [-9.93, 52.57], [-9.45, 52.8], [-9.43, 52.97],
  [-9.0, 53.14], [-9.05, 53.26], [-9.6, 53.25], [-10.15, 53.4], [-9.9, 53.6], [-9.75, 53.8], [-10.25, 53.98], [-10.05, 54.23],
  [-9.85, 54.32], [-9.3, 54.32], [-9.1, 54.2], [-8.7, 54.3], [-8.45, 54.45], [-8.2, 54.55], [-8.45, 54.62], [-8.8, 54.66],
  [-8.45, 54.85], [-8.55, 55.0], [-8.3, 55.16], [-7.95, 55.2], [-7.65, 55.25], [-7.55, 55.1], [-7.4, 55.25],
];
const COS = Math.cos((53.3 * Math.PI) / 180);
const VB_W = 480, VB_H = 336;
const M = { lon0: -10.7, lat0: 55.5, k: 77, x0: 10, y0: 10 };
const mx = (lon: number) => M.x0 + (lon - M.lon0) * COS * M.k;
const my = (lat: number) => M.y0 + (M.lat0 - lat) * M.k;
// Inset: Wicklow and north Wexford, where six sites sit within a few kilometres of each other.
const I = { lon0: -6.55, lon1: -5.85, lat0: 53.08, lat1: 52.62, x: 290, y: 46, w: 180 };
const IK = I.w / ((I.lon1 - I.lon0) * COS);
const IH = (I.lat0 - I.lat1) * IK;
const ix = (lon: number) => I.x + (lon - I.lon0) * COS * IK;
const iy = (lat: number) => I.y + (I.lat0 - lat) * IK;
const inInset = (l: Location) => l.lon >= I.lon0 && l.lon <= I.lon1 && l.lat <= I.lat0 && l.lat >= I.lat1;
/** Chaikin corner-cutting, twice, so the hand-placed points read as a coastline rather than a polygon. */
function smooth(pts: [number, number][], rounds = 2): [number, number][] {
  let p = pts;
  for (let r = 0; r < rounds; r++) {
    const out: [number, number][] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = out;
  }
  return p;
}
const SMOOTH = smooth(COAST);
const pathOf = (fx: (n: number) => number, fy: (n: number) => number) => SMOOTH.map(([lo, la], i) => (i ? "L" : "M") + fx(lo).toFixed(1) + " " + fy(la).toFixed(1)).join(" ") + " Z";
const MAIN_PATH = pathOf(mx, my);
const INSET_PATH = pathOf(ix, iy);

type Pin = { id: LocationId; x: number; y: number; tx: number; ty: number; r: number; label: string };
type Box = { x0: number; y0: number; x1: number; y1: number };
const overlap = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** Push overlapping pins apart (deterministic), keeping each near its true position. */
function spread(pins: Pin[], pad: number): Pin[] {
  const out = pins.map(p => ({ ...p }));
  for (let k = 0; k < 80; k++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      const min = a.r + b.r + pad;
      if (d >= min) continue;
      if (d < 0.01) { dx = 1; dy = 0.4; d = Math.hypot(dx, dy); }
      const push = (min - d) / 2;
      a.x -= (dx / d) * push; a.y -= (dy / d) * push; b.x += (dx / d) * push; b.y += (dy / d) * push;
      moved = true;
    }
    if (!moved) break;
  }
  return out;
}

/** Place each label right, left, below or above its pin, whichever first avoids pins, other labels and the frame. */
function placeLabels(pins: Pin[], bounds: Box, fs: number) {
  const placed: Box[] = [];
  const pinBoxes = pins.map(p => ({ x0: p.x - p.r, y0: p.y - p.r, x1: p.x + p.r, y1: p.y + p.r }));
  return pins.map(p => {
    const w = p.label.length * fs * 0.56, h = fs + 2;
    const cands: { x: number; y: number; anchor: "start" | "end" | "middle"; box: Box }[] = [
      { x: p.x + p.r + 4, y: p.y + fs * 0.35, anchor: "start", box: { x0: p.x + p.r + 3, y0: p.y - h / 2, x1: p.x + p.r + 5 + w, y1: p.y + h / 2 } },
      { x: p.x - p.r - 4, y: p.y + fs * 0.35, anchor: "end", box: { x0: p.x - p.r - 5 - w, y0: p.y - h / 2, x1: p.x - p.r - 3, y1: p.y + h / 2 } },
      { x: p.x, y: p.y + p.r + fs + 1, anchor: "middle", box: { x0: p.x - w / 2, y0: p.y + p.r + 1, x1: p.x + w / 2, y1: p.y + p.r + 2 + h } },
      { x: p.x, y: p.y - p.r - 4, anchor: "middle", box: { x0: p.x - w / 2, y0: p.y - p.r - 3 - h, x1: p.x + w / 2, y1: p.y - p.r - 2 } },
    ];
    const ok = (c: Box) => c.x0 >= bounds.x0 && c.x1 <= bounds.x1 && c.y0 >= bounds.y0 && c.y1 <= bounds.y1
      && !placed.some(b => overlap(b, c)) && !pinBoxes.some((b, i) => pins[i].id !== p.id && overlap(b, c));
    const pick = cands.find(c => ok(c.box)) || cands.find(c => c.box.x0 >= bounds.x0 && c.box.x1 <= bounds.x1) || cands[0];
    placed.push(pick.box);
    return { id: p.id, x: pick.x, y: pick.y, anchor: pick.anchor };
  });
}

export function IrelandMap({ height = 360, selected, onSelect, compact }: { height?: number; selected?: string | null; onSelect?: (id: LocationId) => void; compact?: boolean }) {
  const { s } = useRos();
  const clip = "iemap" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const health = siteHealthAll();
  const kids = siteDayAll();
  const fs = 9.5;
  const radius = (id: string, big: boolean) => (big ? 4 : 3.4) + Math.sqrt(kids[id]?.enrolled || 0) * (big ? 0.5 : 0.42);

  const mainPins: Pin[] = s.locations.filter(l => !inInset(l)).map(l => ({ id: l.id, x: mx(l.lon), y: my(l.lat), tx: mx(l.lon), ty: my(l.lat), r: radius(l.id, false), label: l.short }));
  const insetPins = spread(s.locations.filter(inInset).map(l => ({ id: l.id, x: ix(l.lon), y: iy(l.lat), tx: ix(l.lon), ty: iy(l.lat), r: radius(l.id, true), label: l.short })), 5)
    .sort((a, b) => b.r - a.r);
  const mainLabels = placeLabels(mainPins, { x0: 2, y0: 20, x1: I.x - 8, y1: VB_H - 2 }, fs);
  const insetLabels = placeLabels(insetPins, { x0: I.x + 3, y0: I.y + 3, x1: I.x + I.w - 3, y1: I.y + IH - 3 }, fs);
  const counts = { bad: 0, warn: 0, ok: 0 } as Record<SiteTone, number>;
  for (const l of s.locations) counts[health[l.id].tone]++;
  const rect = { x0: mx(I.lon0), x1: mx(I.lon1), y0: my(I.lat0), y1: my(I.lat1) };
  const insetLocs = s.locations.filter(inInset);

  const pinEl = (p: Pin, lab: { x: number; y: number; anchor: "start" | "end" | "middle" } | undefined) => {
    const l = s.locations.find(x => x.id === p.id)!;
    const hh = health[p.id];
    const ink = toneInk[hh.tone];
    const on = selected === p.id;
    const moved = Math.hypot(p.x - p.tx, p.y - p.ty) > 2;
    const act = () => onSelect && onSelect(p.id);
    return (
      <g key={p.id}>
        {moved && <><line x1={p.tx} y1={p.ty} x2={p.x} y2={p.y} stroke="var(--border-strong)" strokeWidth={1} /><circle cx={p.tx} cy={p.ty} r={1.8} fill="var(--dim)" /></>}
        <g role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={l.name + ": " + SITE_TONE_LABEL[hh.tone]} className="ros-focus"
          onClick={onSelect ? act : undefined} onKeyDown={onSelect ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } } : undefined}
          style={{ cursor: onSelect ? "pointer" : "default", outline: "none" }}>
          <title>{l.name + " · " + (kids[p.id]?.enrolled || 0) + " children · " + SITE_TONE_LABEL[hh.tone] + (hh.reasons.length ? ": " + hh.reasons.map(r => r.text).join("; ") : "")}</title>
          {hh.tone === "bad" && <circle cx={p.x} cy={p.y} r={p.r + 4} fill={ink} opacity={0.18} />}
          {on && <circle cx={p.x} cy={p.y} r={p.r + 3.5} fill="none" stroke="var(--accent)" strokeWidth={2} />}
          <circle cx={p.x} cy={p.y} r={p.r} fill={ink} stroke="var(--surface)" strokeWidth={1.5} />
          {l.isHQ && <circle cx={p.x} cy={p.y} r={Math.max(1.6, p.r * 0.32)} fill="var(--surface)" />}
          {lab && <text x={lab.x} y={lab.y} textAnchor={lab.anchor} fontSize={fs} fill={on ? "var(--ink)" : "var(--body)"} fontWeight={on ? 600 : 500} style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 3, strokeLinejoin: "round" }}>{p.label}</text>}
        </g>
      </g>
    );
  };

  return (
    <div style={{ minWidth: 0 }}>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height={height} preserveAspectRatio="xMidYMid meet" role="group" aria-label="Schematic map of Ireland showing the nine Ray of Sunshine sites" style={{ display: "block", maxWidth: "100%" }}>
        <defs><clipPath id={clip}><rect x={I.x} y={I.y} width={I.w} height={IH} rx={10} /></clipPath></defs>
        <path d={MAIN_PATH} fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth={1} strokeLinejoin="round" />
        <text x={8} y={14} fontSize={9} fill="var(--faint)" style={{ letterSpacing: ".08em", textTransform: "uppercase" }}>Schematic, not to scale</text>
        <rect x={rect.x0} y={rect.y0} width={rect.x1 - rect.x0} height={rect.y1 - rect.y0} rx={3} fill="none" stroke="var(--accent-line)" strokeDasharray="3 3" />
        <line x1={rect.x1} y1={rect.y0} x2={I.x} y2={I.y + 6} stroke="var(--accent-line)" strokeDasharray="3 3" />
        <line x1={rect.x1} y1={rect.y1} x2={I.x} y2={I.y + IH - 6} stroke="var(--accent-line)" strokeDasharray="3 3" />
        {insetLocs.map(l => <circle key={l.id} cx={mx(l.lon)} cy={my(l.lat)} r={2} fill={toneInk[health[l.id].tone]} />)}
        {mainPins.map(p => pinEl(p, mainLabels.find(x => x.id === p.id)))}
        <rect x={I.x} y={I.y} width={I.w} height={IH} rx={10} fill="var(--surface-faint)" stroke="var(--border-strong)" />
        <g clipPath={`url(#${clip})`}><path d={INSET_PATH} fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth={1} strokeLinejoin="round" /></g>
        <text x={I.x} y={I.y - 8} fontSize={9} fill="var(--faint)" style={{ letterSpacing: ".08em", textTransform: "uppercase" }}>Wicklow and north Wexford</text>
        {insetPins.map(p => pinEl(p, insetLabels.find(x => x.id === p.id)))}
        {!compact && <text x={I.x + I.w - 6} y={I.y + IH - 8} textAnchor="end" fontSize={8.5} fill="var(--faint)">Enlarged</text>}
      </svg>
      <div style={{ display: "flex", gap: compact ? 10 : 14, flexWrap: "wrap", marginTop: 8, fontSize: 11.5, color: "var(--dim)" }}>
        {(["bad", "warn", "ok"] as SiteTone[]).map(t => (
          <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 5, background: toneInk[t] }} />{SITE_TONE_LABEL[t]} · {counts[t]}
          </span>
        ))}
        {!compact && <span style={{ color: "var(--faint)" }}>Pin size: children enrolled. Ring: HQ.</span>}
      </div>
      {!compact && <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 6, lineHeight: 1.5 }}>Red: a ratio gap today or tomorrow, or a child not at pickup. Amber: an incident, an NCS claim lapsing within 48 hours, debt over 30 days, or a compliance item. Positions are approximate.</div>}
    </div>
  );
}

/** Children enrolled per site, shared with the cards. */
export const siteKids = (loc: string) => siteDayAll()[loc]?.enrolled || 0;
export const staffName = (id?: string) => (id ? staffById(id)?.name || id : "Unassigned");
export const childLabel = (id: string) => childName(idx().child.get(id));
