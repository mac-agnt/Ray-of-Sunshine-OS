/* Shared building blocks for the Ray of Sunshine modules. They use the Pulse
   theme tokens only, so every module inherits the v4 Glass look and both
   themes. Charts are plain SVG/CSS: no chart library is added. */
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { Ref, Tone } from "./types";
import { openRecord } from "./store";

export const toneInk: Record<Tone, string> = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)", info: "var(--info)", neutral: "var(--dim)", accent: "var(--accent)", brand: "var(--ros-navy)" };
export const toneBg: Record<Tone, string> = { ok: "var(--ok-soft)", warn: "var(--warn-soft)", bad: "var(--bad-soft)", info: "var(--info-soft)", neutral: "var(--track)", accent: "var(--accent-soft)", brand: "var(--ros-yellow)" };
const MONO: CSSProperties = { fontFamily: "var(--mono)", fontSize: "9.5px", letterSpacing: ".13em", textTransform: "uppercase", color: "var(--faint)" };

export function Page({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="ros-page" style={style}>{children}</div>;
}

export function PageHead({ eyebrow, title, sub, right }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
      <div style={{ flex: "1 1 320px", minWidth: 0 }}>
        {eyebrow && <div style={{ ...MONO, marginBottom: 7 }}>{eyebrow}</div>}
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-.6px", lineHeight: 1.15 }}>{title}</div>
        {sub && <div style={{ fontSize: 13.5, color: "var(--dim)", marginTop: 6, lineHeight: 1.55, maxWidth: 760 }}>{sub}</div>}
      </div>
      {right && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{right}</div>}
    </div>
  );
}

export function Label({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...MONO, ...style }}>{children}</div>;
}

export function Grid({ min = 220, gap = 14, children, style }: { min?: number; gap?: number; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(min(${min}px,100%),1fr))`, gap, ...style }}>{children}</div>;
}

export function Card({ title, sub, right, children, pad = true, onClick, style, tone, id }: {
  title?: ReactNode; sub?: ReactNode; right?: ReactNode; children?: ReactNode; pad?: boolean; onClick?: () => void; style?: CSSProperties; tone?: Tone; id?: string;
}) {
  return (
    <section id={id} className={onClick ? "ros-card-click" : undefined} onClick={onClick}
      style={{ background: "var(--surface)", border: "1px solid " + (tone ? toneInk[tone] : "var(--border)"), borderRadius: "var(--card-r,18px)", boxShadow: "var(--card-shadow)", minWidth: 0, overflow: "hidden", ...style }}>
      {(title || right) && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 18px 0", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 180px", minWidth: 0 }}>
            {title && <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: "-.2px" }}>{title}</div>}
            {sub && <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 4, lineHeight: 1.5 }}>{sub}</div>}
          </div>
          {right && <div style={{ flex: "0 1 auto", maxWidth: "100%", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>{right}</div>}
        </div>
      )}
      <div style={pad ? { padding: title || right ? "14px 18px 18px" : 18 } : { paddingTop: title || right ? 12 : 0 }}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tone, onClick, foot, big }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone; onClick?: () => void; foot?: ReactNode; big?: boolean }) {
  return (
    <button className={onClick ? "ros-btn ros-focus" : undefined} onClick={onClick} disabled={!onClick}
      style={{ textAlign: "left", cursor: onClick ? "pointer" : "default", background: "var(--kpi-card,var(--surface))", border: "1px solid " + (tone && tone !== "neutral" ? toneBg[tone] : "var(--border)"), borderRadius: "var(--r-md,16px)", padding: "13px 15px 14px", minWidth: 0, color: "var(--ink)", display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11.5, color: "var(--dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <span style={{ fontSize: big ? 26 : 21, fontWeight: 600, letterSpacing: "-.7px", lineHeight: 1, fontVariantNumeric: "tabular-nums", color: tone && tone !== "neutral" && tone !== "accent" ? toneInk[tone] : "var(--ink)" }}>{value}</span>
      {sub && <span style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.35 }}>{sub}</span>}
      {foot}
    </button>
  );
}

export function Badge({ tone = "neutral", children, dot, title }: { tone?: Tone; children: ReactNode; dot?: boolean; title?: string }) {
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 22, padding: "0 9px", borderRadius: "var(--chip-r,8px)", background: toneBg[tone], color: tone === "brand" ? "var(--ros-navy)" : toneInk[tone], fontSize: 11.5, fontWeight: 500, whiteSpace: "nowrap", flex: "none", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 3, background: tone === "brand" ? "var(--ros-navy)" : toneInk[tone], animation: tone === "bad" ? "rosPulse 1.6s infinite" : undefined }} />}
      {children}
    </span>
  );
}

export function DemoTag({ children = "Demo only", title }: { children?: ReactNode; title?: string }) {
  return <span title={title || "Simulated in this demo. Nothing is sent, charged or submitted."} style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 999, border: "1px dashed var(--accent-line)", color: "var(--accent)", fontSize: 10.5, fontWeight: 500, letterSpacing: ".02em", whiteSpace: "nowrap" }}>{children}</span>;
}

type BtnVariant = "primary" | "ghost" | "danger" | "subtle" | "ok";
export function Btn({ children, onClick, variant = "ghost", size = "md", disabled, title, style, full }: {
  children: ReactNode; onClick?: (e: React.MouseEvent) => void; variant?: BtnVariant; size?: "sm" | "md"; disabled?: boolean; title?: string; style?: CSSProperties; full?: boolean;
}) {
  const v: Record<BtnVariant, CSSProperties> = {
    primary: { background: "var(--accent-fill,var(--accent))", color: "var(--on-accent)", border: "1px solid transparent", boxShadow: "var(--accent-glow,none)", fontWeight: 600 },
    ok: { background: "var(--ok-soft)", color: "var(--ok)", border: "1px solid transparent", fontWeight: 600 },
    ghost: { background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--border)" },
    subtle: { background: "none", color: "var(--dim)", border: "1px solid transparent" },
    danger: { background: "var(--bad-soft)", color: "var(--bad)", border: "1px solid transparent", fontWeight: 600 },
  };
  return (
    <button className="ros-btn ros-focus" title={title} disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick && onClick(e); }}
      style={{ height: size === "sm" ? 28 : 34, padding: size === "sm" ? "0 11px" : "0 15px", borderRadius: "var(--cta-r,10px)", fontSize: size === "sm" ? 12 : 13, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, width: full ? "100%" : undefined, ...v[variant], ...style }}>
      {children}
    </button>
  );
}

export function RecLink({ r, children, mono = true }: { r: Ref; children?: ReactNode; mono?: boolean }) {
  return (
    <span role="link" tabIndex={0} className="ros-link ros-focus" onClick={(e) => { e.stopPropagation(); openRecord(r); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); openRecord(r); } }}
      style={{ fontFamily: mono ? "var(--mono)" : undefined, fontSize: mono ? 12 : undefined, letterSpacing: mono ? ".02em" : undefined, whiteSpace: "nowrap" }}>
      {children || r.id}
    </span>
  );
}

export function Avatar({ name, size = 28, tone }: { name: string; size?: number; tone?: string }) {
  const ini = name.split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const palette = ["#1B75BB", "#53948D", "#8DB35E", "#C6D22F", "#6b7bd6", "#d98c3a", "#3a9bd9", "#a067c4"];
  return <span style={{ width: size, height: size, flex: "none", borderRadius: size / 2.6, background: tone || palette[h % palette.length], color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36, fontWeight: 600, letterSpacing: ".02em" }}>{ini}</span>;
}

export function Bar({ value, max = 1, tone = "accent", height = 6, track = true }: { value: number; max?: number; tone?: Tone; height?: number; track?: boolean }) {
  const p = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <div style={{ height, borderRadius: height, background: track ? "var(--track)" : "transparent", overflow: "hidden", minWidth: 40 }}>
      <div style={{ width: (p * 100).toFixed(1) + "%", height: "100%", borderRadius: height, background: tone === "accent" ? "var(--accent-fill,var(--accent))" : toneInk[tone], transition: "width .5s var(--ease)" }} />
    </div>
  );
}

export function Meter({ label, value, max, tone, hint }: { label: ReactNode; value: number; max: number; tone?: Tone; hint?: ReactNode }) {
  const p = max ? value / max : 0;
  const t: Tone = tone || (p > 1 ? "bad" : p > 0.92 ? "warn" : "accent");
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--ink)" }}>{value}/{max}</span>
        {hint && <span style={{ fontSize: 11, color: "var(--faint)" }}>{hint}</span>}
      </div>
      <Bar value={value} max={max} tone={t} />
    </div>
  );
}

export function KV({ items, cols = 2 }: { items: [ReactNode, ReactNode][]; cols?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`, gap: 10 }}>
      {items.map(([k, v], i) => (
        <div key={i} style={{ padding: "10px 12px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-sm,10px)", minWidth: 0 }}>
          <div style={{ ...MONO, fontSize: 8.5 }}>{k}</div>
          <div style={{ fontSize: 13, marginTop: 5, color: "var(--ink)", overflowWrap: "anywhere" }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div style={{ padding: "34px 18px", textAlign: "center" }}>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
      {body && <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 6, lineHeight: 1.55 }}>{body}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function Callout({ tone = "info", title, children, right }: { tone?: Tone; title?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: "var(--r-md,14px)", background: toneBg[tone], border: "1px solid " + toneBg[tone] }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, flex: "none", background: tone === "brand" ? "var(--ros-navy)" : toneInk[tone] }} />
      <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 1.55, color: tone === "brand" ? "var(--ros-navy)" : "var(--body)" }}>
        {title && <div style={{ fontWeight: 600, color: tone === "brand" ? "var(--ros-navy)" : "var(--ink)", marginBottom: 2 }}>{title}</div>}
        {children}
      </div>
      {right}
    </div>
  );
}

export function Seg<T extends string>({ options, value, onChange, size = "md" }: { options: (T | [T, ReactNode])[]; value: T; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div className="ros-scroll-x" style={{ display: "inline-flex", gap: 2, padding: 3, background: "var(--surface-faint)", border: "1px solid var(--border)", borderRadius: 999, maxWidth: "100%" }}>
      {options.map((o) => {
        const [v, label] = Array.isArray(o) ? o : [o, o];
        const on = v === value;
        return (
          <button key={v} className="ros-focus" onClick={() => onChange(v)}
            style={{ height: size === "sm" ? 26 : 30, padding: "0 13px", border: 0, borderRadius: 999, cursor: "pointer", fontSize: size === "sm" ? 11.5 : 12.5, whiteSpace: "nowrap", background: on ? "var(--pill-bg)" : "none", color: on ? "var(--pill-ink)" : "var(--dim)", fontWeight: on ? 600 : 500, boxShadow: on ? "0 2px 6px rgba(0,0,0,.25)" : "none", transition: "background .2s var(--ease),color .2s var(--ease)" }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label?: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className="ros-focus" onClick={(e) => { e.stopPropagation(); onChange(); }}
      style={{ width: 36, height: 20, borderRadius: 999, border: 0, padding: 0, cursor: "pointer", position: "relative", flex: "none", background: on ? "var(--accent)" : "var(--track)", transition: "background .2s var(--ease)" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 19 : 3, width: 14, height: 14, borderRadius: 7, background: on ? "var(--on-accent)" : "var(--dim)", transition: "left .2s var(--ease)" }} />
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: "var(--dim)", fontWeight: 500 }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: "var(--faint)" }}>{hint}</span>}
    </label>
  );
}

export function Search({ value, onChange, placeholder = "Search", width = 240 }: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number | string }) {
  return (
    <div style={{ position: "relative", width, maxWidth: "100%" }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 11, top: 11, color: "var(--faint)" }}><path d="m21 21-4.3-4.3 M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0" /></svg>
      <input className="ros-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ paddingLeft: 30, height: 34, borderRadius: 999 }} />
    </div>
  );
}

/* ---------------- table ---------------- */
export interface Col<T> { key: string; label: ReactNode; w?: string; align?: "left" | "right" | "center"; render: (row: T) => ReactNode; sort?: (row: T) => string | number; hideSm?: boolean }
export function Table<T>({ rows, cols, onRow, empty = "Nothing here", pageSize = 25, rowKey, dense, rowTone, minWidth = 640 }: {
  rows: T[]; cols: Col<T>[]; onRow?: (r: T) => void; empty?: string; pageSize?: number; rowKey: (r: T) => string; dense?: boolean; rowTone?: (r: T) => Tone | undefined; minWidth?: number;
}) {
  const [shown, setShown] = useState(pageSize);
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = cols.find(x => x.key === sort.k);
    if (!c?.sort) return rows;
    return rows.slice().sort((a, b) => { const x = c.sort!(a), y = c.sort!(b); return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; });
  }, [rows, sort, cols]);
  const tpl = cols.map(c => c.w || "1fr").join(" ");
  const pad = dense ? "8px 14px" : "11px 16px";
  return (
    <div className="ros-scroll-x">
      <div style={{ minWidth }}>
        <div style={{ display: "grid", gridTemplateColumns: tpl, background: "var(--surface-faint)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
          {cols.map(c => (
            <div key={c.key} onClick={() => c.sort && setSort(s => (s && s.k === c.key ? { k: c.key, dir: (s.dir * -1) as 1 | -1 } : { k: c.key, dir: 1 }))}
              style={{ padding: dense ? "7px 14px" : "9px 16px", fontSize: 11.5, fontWeight: 500, color: "var(--faint)", textAlign: c.align || "left", cursor: c.sort ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {c.label}{sort?.k === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
            </div>
          ))}
        </div>
        {sorted.slice(0, shown).map(r => {
          const t = rowTone ? rowTone(r) : undefined;
          return (
            <div key={rowKey(r)} className={onRow ? "ros-row-hover" : undefined} onClick={onRow ? () => onRow(r) : undefined}
              style={{ display: "grid", gridTemplateColumns: tpl, borderBottom: "1px solid var(--border)", cursor: onRow ? "pointer" : "default", boxShadow: t ? "inset 3px 0 0 " + toneInk[t] : undefined, transition: "background .15s var(--ease)" }}>
              {cols.map(c => (
                <div key={c.key} style={{ padding: pad, fontSize: 13, minWidth: 0, display: "flex", alignItems: "center", justifyContent: c.align === "right" ? "flex-end" : c.align === "center" ? "center" : "flex-start", textAlign: c.align || "left", fontVariantNumeric: "tabular-nums", overflow: "hidden" }}>
                  {c.render(r)}
                </div>
              ))}
            </div>
          );
        })}
        {!rows.length && <Empty title={empty} />}
        {rows.length > shown && (
          <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ flex: 1, fontSize: 12, color: "var(--faint)" }}>Showing {shown} of {rows.length}</span>
            <Btn size="sm" onClick={() => setShown(n => n + pageSize * 2)}>Show more</Btn>
          </div>
        )}
      </div>
    </div>
  );
}
export const Ellip = ({ children, style }: { children: ReactNode; style?: CSSProperties }) =>
  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...style }}>{children}</span>;
export const Sub = ({ children }: { children: ReactNode }) => <span style={{ fontSize: 11.5, color: "var(--faint)" }}>{children}</span>;
export const Stack = ({ children, gap = 2 }: { children: ReactNode; gap?: number }) => <div style={{ display: "flex", flexDirection: "column", gap, minWidth: 0 }}>{children}</div>;
export const Row = ({ children, gap = 8, wrap, style }: { children: ReactNode; gap?: number; wrap?: boolean; style?: CSSProperties }) =>
  <div style={{ display: "flex", alignItems: "center", gap, flexWrap: wrap ? "wrap" : undefined, minWidth: 0, ...style }}>{children}</div>;

/* ---------------- lists and timelines ---------------- */
export function ListRow({ title, sub, right, onClick, tone, lead }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void; tone?: Tone; lead?: ReactNode }) {
  return (
    <div className={onClick ? "ros-row-hover" : undefined} onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "11px 14px", borderRadius: "var(--r-sm,12px)", cursor: onClick ? "pointer" : "default", boxShadow: tone ? "inset 3px 0 0 " + toneInk[tone] : undefined, transition: "background .15s var(--ease)" }}>
      {lead}
      <div style={{ flex: "1 1 160px", minWidth: 0 }}>
        <div style={{ fontSize: 13.5, lineHeight: 1.4, color: "var(--ink)" }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 3, lineHeight: 1.45 }}>{sub}</div>}
      </div>
      {right && <div style={{ flex: "0 1 auto", maxWidth: "100%", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", marginLeft: "auto" }}>{right}</div>}
    </div>
  );
}

export function Timeline({ items }: { items: { at: ReactNode; title: ReactNode; detail?: ReactNode; tone?: Tone; right?: ReactNode }[] }) {
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: "none", width: 14, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ width: 9, height: 9, borderRadius: 5, marginTop: 5, background: it.tone ? toneInk[it.tone] : "var(--border-strong)" }} />
            {i < items.length - 1 && <span style={{ flex: 1, width: 1, background: "var(--border)", marginTop: 4 }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 14 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.45 }}>{it.title}</span>
              <span style={{ fontSize: 11, color: "var(--faint)" }}>{it.at}</span>
              {it.right}
            </div>
            {it.detail && <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 3, lineHeight: 1.5 }}>{it.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- charts ---------------- */
export function Columns({ data, height = 150, format = (n: number) => String(n), tone = "accent" }: { data: { label: string; value: number; tone?: Tone; hint?: string }[]; height?: number; format?: (n: number) => string; tone?: Tone }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: height + 34 }}>
      {data.map((d, i) => (
        <div key={i} title={d.hint || d.label + ": " + format(d.value)} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10.5, color: "var(--dim)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{format(d.value)}</span>
          <div style={{ width: "100%", maxWidth: 46, height: Math.max(3, (d.value / max) * height), borderRadius: "8px 8px 3px 3px", background: (d.tone || tone) === "accent" ? "var(--accent-fill,var(--accent))" : toneInk[d.tone || tone], transformOrigin: "bottom", animation: "growBar .6s var(--ease) both", animationDelay: i * 30 + "ms", opacity: d.tone === "neutral" ? 0.5 : 1 }} />
          <span style={{ fontSize: 10.5, color: "var(--faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function HBars({ items, format = (n: number) => String(n), max }: { items: { label: ReactNode; value: number; tone?: Tone; onClick?: () => void; sub?: ReactNode }[]; format?: (n: number) => string; max?: number }) {
  const m = max ?? Math.max(1, ...items.map(i => i.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((it, i) => (
        <div key={i} className={it.onClick ? "ros-row-hover" : undefined} onClick={it.onClick} style={{ cursor: it.onClick ? "pointer" : "default", borderRadius: 8, padding: "2px 4px" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 5 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
            {it.sub && <span style={{ fontSize: 11, color: "var(--faint)" }}>{it.sub}</span>}
            <span style={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>{format(it.value)}</span>
          </div>
          <Bar value={it.value} max={m} tone={it.tone || "accent"} />
        </div>
      ))}
    </div>
  );
}

export function Line({ series, labels, height = 150, format = (n: number) => String(n) }: { series: { name: string; values: number[]; tone?: Tone; dashed?: boolean }[]; labels: string[]; height?: number; format?: (n: number) => string }) {
  const w = 600, h = height, padL = 4, padR = 4, padT = 10, padB = 22;
  const all = series.flatMap(s => s.values);
  const max = Math.max(1, ...all) * 1.08, min = Math.min(0, ...all);
  const x = (i: number) => padL + (i * (w - padL - padR)) / Math.max(1, labels.length - 1);
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (h - padT - padB);
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: h, display: "block", overflow: "visible" }}>
        {[0.25, 0.5, 0.75].map(g => <line key={g} x1={0} x2={w} y1={padT + g * (h - padT - padB)} y2={padT + g * (h - padT - padB)} stroke="var(--border)" strokeWidth={1} />)}
        {series.map((s, si) => (
          <g key={si}>
            <path d={s.values.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" ")} fill="none" stroke={s.tone && s.tone !== "accent" ? toneInk[s.tone] : "var(--accent)"} strokeWidth={2.2} strokeDasharray={s.dashed ? "5 5" : undefined} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={2.6} fill={s.tone && s.tone !== "accent" ? toneInk[s.tone] : "var(--accent)"}><title>{labels[i] + " · " + s.name + ": " + format(v)}</title></circle>)}
          </g>
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: -16 }}>
        {labels.map((l, i) => <span key={i} style={{ fontSize: 10.5, color: "var(--faint)" }}>{l}</span>)}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
        {series.map((s, i) => <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--dim)" }}><span style={{ width: 14, height: 3, borderRadius: 2, background: s.tone && s.tone !== "accent" ? toneInk[s.tone] : "var(--accent)" }} />{s.name}</span>)}
      </div>
    </div>
  );
}

export function StackBar({ parts, height = 10 }: { parts: { label: string; value: number; tone: Tone }[]; height?: number }) {
  const t = parts.reduce((n, p) => n + p.value, 0) || 1;
  return (
    <div>
      <div style={{ display: "flex", height, borderRadius: height, overflow: "hidden", background: "var(--track)" }}>
        {parts.map((p, i) => <div key={i} title={p.label} style={{ width: (p.value / t) * 100 + "%", background: toneInk[p.tone], transition: "width .5s var(--ease)" }} />)}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
        {parts.map((p, i) => <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--dim)" }}><span style={{ width: 8, height: 8, borderRadius: 2, background: toneInk[p.tone] }} />{p.label}</span>)}
      </div>
    </div>
  );
}

export function Spark({ values, tone = "accent", width = 90, height = 26 }: { values: number[]; tone?: Tone; width?: number; height?: number }) {
  const max = Math.max(1, ...values), min = Math.min(...values);
  const pts = values.map((v, i) => (i * width) / Math.max(1, values.length - 1) + "," + (height - ((v - min) / Math.max(1e-6, max - min)) * (height - 4) - 2)).join(" ");
  return <svg width={width} height={height} style={{ display: "block" }}><polyline points={pts} fill="none" stroke={tone === "accent" ? "var(--accent)" : toneInk[tone]} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

/** Shared tone for common status words, so badges read the same in every module. */
export function statusTone(s: string): Tone {
  const k = s.toLowerCase();
  if (/(paid|accepted|approved|resolved|active|confirmed|signed in|ok|healthy|current|published|enrolled|started|attended|certified|matched|on track|paid up|done|connected|existing)/.test(k)) return "ok";
  if (/(overdue|broken|declined|failed|expired|blocked|missing|not present|lapsed|bad|urgent|debt)/.test(k)) return "bad";
  if (/(pending|awaiting|due|plan|review|draft|expiring|scheduled|waiting|offered|partial|ready|proposed|warning|reserved|registration)/.test(k)) return "warn";
  if (/(demo|simulated|proposed connection)/.test(k)) return "info";
  return "neutral";
}
export const StatusBadge = ({ s, dot }: { s: string; dot?: boolean }) => <Badge tone={statusTone(s)} dot={dot}>{s}</Badge>;
