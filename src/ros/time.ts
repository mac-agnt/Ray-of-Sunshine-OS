/* Demo clock helpers. The demo is frozen on Tuesday 20 October 2026 (school
   term). The Halloween midterm is 26–30 October, so camps run next week and
   there are no school runs then. */
import type { ISODate } from "./types";

export const TODAY: ISODate = "2026-10-20";
export const TOMORROW: ISODate = "2026-10-21";
export const THIS_WEEK: ISODate[] = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"];
export const MIDTERM_WEEK: ISODate[] = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"];
export const NEXT_SCHOOL_WEEK = "2026-11-02";
export const AM_MIN = 8 * 60 + 45;   // 08:45
export const PM_MIN = 14 * 60 + 45;  // 14:45

const DAY = 86400000;
const parse = (d: ISODate) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const addDays = (d: ISODate, n: number): ISODate => new Date(parse(d) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: ISODate, b: ISODate) => Math.round((parse(b) - parse(a)) / DAY);
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dow = (d: ISODate) => DOW[new Date(parse(d)).getUTCDay()];
export const dowLong = (d: ISODate) => DOW_LONG[new Date(parse(d)).getUTCDay()];
export const fmtDate = (d: ISODate) => +d.slice(8, 10) + " " + MON[+d.slice(5, 7) - 1];
export const fmtDay = (d: ISODate) => dow(d) + " " + fmtDate(d);
export const fmtDateY = (d: ISODate) => fmtDate(d) + " " + d.slice(0, 4);
export const hm = (min: number) => String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
export const toMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
export const stamp = (min: number, date: ISODate = TODAY) => date + " " + hm(min);

/** "Today 08:31", "Yesterday 16:02", "Fri 16 Oct 09:10" relative to the demo day. */
export function rel(at: string): string {
  const d = at.slice(0, 10), t = at.slice(11, 16);
  const diff = daysBetween(d, TODAY);
  if (diff === 0) return "Today " + t;
  if (diff === 1) return "Yesterday " + t;
  if (diff === -1) return "Tomorrow " + t;
  return fmtDay(d) + (t ? " " + t : "");
}

export const euro = (n: number, dp = 2) =>
  (n < 0 ? "−€" : "€") + Math.abs(n).toLocaleString("en-IE", { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const euro0 = (n: number) => euro(n, 0);
export const pct = (n: number, dp = 0) => (isFinite(n) ? (n * 100).toFixed(dp) : "0") + "%";
export const round2 = (n: number) => Math.round(n * 100) / 100;
