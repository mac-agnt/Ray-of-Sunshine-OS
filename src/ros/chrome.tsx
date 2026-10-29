/* Shell pieces Ray of Sunshine adds to the Pulse frame: brand mark, the demo
   strip (location, role preview, demo clock, reset), toasts, the confirm
   dialog and the module router. */
import { useEffect, useState } from "react";
import { useRos, setUi, nav, resetDemo, undoLast, ROLES, roleDef, confirmThen, setTab, getUi, closeRecord } from "./store";
import { canSee, moduleOf, ROLE_HOME } from "./registry";
import { MODULE_VIEWS } from "./modules";
import { RecordDrawer } from "./records";
import { advanceAfternoon } from "./actions";
import { Btn, Page, Card, Empty } from "./ui";
import { hm, PM_MIN } from "./time";
import type { LocationId, RoleId } from "./types";

export const LOGO = "https://www.roskids.ie/wp-content/uploads/2022/03/Ros-Circle-Logo.png";
export function BrandMark({ size = 36 }: { size?: number }) {
  const [broken, setBroken] = useState(false);
  if (broken) return (
    <span style={{ width: size, height: size, borderRadius: size / 2, background: "#FFF100", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="#060068" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" fill="#060068" /><path d="M12 2.5v2.6 M12 18.9v2.6 M2.5 12h2.6 M18.9 12h2.6 M5.3 5.3l1.8 1.8 M16.9 16.9l1.8 1.8 M5.3 18.7l1.8-1.8 M16.9 7.1l1.8-1.8" /></svg>
    </span>
  );
  return <img src={LOGO} alt="Ray of Sunshine" width={size} height={size} onError={() => setBroken(true)} style={{ width: size, height: size, borderRadius: size / 2, objectFit: "cover", background: "#fff", flex: "none" }} />;
}

/** Switch role preview and land on that role's home screen. */
export function switchRole(role: RoleId) {
  setUi({ role, loc: "ALL" });
  const h = ROLE_HOME[role];
  nav(h.page, h.tab);
}

const sel: React.CSSProperties = { height: 30, padding: "0 26px 0 11px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--ink)", fontSize: 12, cursor: "pointer", maxWidth: "100%" };

export function DemoStrip({ onAskSunny, compact }: { onAskSunny: () => void; compact?: boolean }) {
  const { s, ui, role } = useRos();
  const locked = role.scope !== "ALL";
  const pm = s.clockMin >= PM_MIN;
  return (
    <div className={compact ? "ros-scroll-x" : undefined} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: compact ? "nowrap" : "wrap", padding: compact ? "8px 0 2px" : "10px 2px 0" }}>
      <span title="Everything is simulated: no messages, payments, NCS returns or API calls leave this demo." style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 10px", borderRadius: 999, background: "var(--demo-bg, var(--accent-soft))", color: "var(--demo-ink, var(--accent))", fontSize: 11, fontWeight: 600, letterSpacing: ".04em" }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: "var(--demo-ink, var(--accent))" }} />DEMO · SIMULATED
      </span>
      <select aria-label="Location" title="Location filter" className="ros-input" style={{ ...sel, width: "auto" }} value={locked ? role.scope : ui.loc} disabled={locked} onChange={(e) => setUi({ loc: e.target.value as LocationId | "ALL" })}>
        <option value="ALL">Location: all 9</option>
        {s.locations.map(l => <option key={l.id} value={l.id}>Location: {l.short}</option>)}
      </select>
      <select aria-label="Role preview" title="Role preview: see what each person sees" className="ros-input" style={{ ...sel, width: "auto" }} value={ui.role} onChange={(e) => switchRole(e.target.value as RoleId)}>
        {ROLES.map(r => <option key={r.id} value={r.id}>Role: {r.label}</option>)}
      </select>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 26, padding: "0 10px", borderRadius: 999, border: "1px solid var(--border)", fontSize: 11.5, color: "var(--body)", fontVariantNumeric: "tabular-nums" }}>
        Tue 20 Oct · {hm(s.clockMin)}
      </span>
      {!pm && !compact && <Btn size="sm" onClick={() => confirmThen({ title: "Advance demo to the afternoon?", body: "Moves the demo clock to 14:45 so the school run can be shown: driver boards children, the location signs them in, and the parent app updates. Demo time only.", confirmLabel: "Advance to 14:45", run: () => { advanceAfternoon(); } })}>Advance to afternoon</Btn>}
      <div style={{ flex: 1 }} />
      {!compact && <Btn size="sm" variant="primary" onClick={onAskSunny}>Ask Sunny</Btn>}
      <Btn size="sm" variant="subtle" onClick={undoLast} title="Undo the last demo action">Undo</Btn>
      <Btn size="sm" variant="subtle" onClick={() => confirmThen({ title: "Reset the demo?", body: "Clears every demo action and returns to Tuesday 20 October, 08:45. Nothing outside the demo is affected.", confirmLabel: "Reset demo", danger: true, run: resetDemo })}>Reset demo</Btn>
    </div>
  );
}

export function RosPage({ page }: { page: string }) {
  const { ui, role } = useRos();
  const m = moduleOf(page);
  const View = MODULE_VIEWS[page];
  if (!m || !View) return null;
  if (!canSee(page, role.id)) {
    return <Page><Card><Empty title={m.label + " is not part of the " + role.label + " view"} body="Role preview hides screens and data this role should not see. Switch role in the header to explore it." action={<Btn variant="primary" onClick={() => switchRole("owner")}>Back to Owner view</Btn>} /></Card></Page>;
  }
  const tab = ui.tabs[page] && m.tabs.includes(ui.tabs[page]) ? ui.tabs[page] : m.tabs[0];
  return <View tab={tab} />;
}
export const rosTabs = (page: string, active?: string) => {
  const m = moduleOf(page);
  if (!m) return [];
  return m.tabs.map(t => ({ label: t, active: t === (active || m.tabs[0]), go: () => setTab(page, t) }));
};

function Toasts() {
  const { ui } = useRos();
  return (
    <div style={{ position: "fixed", left: "50%", bottom: 22, transform: "translateX(-50%)", zIndex: 95, display: "flex", flexDirection: "column", gap: 8, alignItems: "center", pointerEvents: "none", width: "min(560px, calc(100vw - 32px))" }}>
      {ui.toasts.map(t => (
        <div key={t.id} role="status" style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: 12, padding: "11px 14px 11px 16px", borderRadius: 14, background: "var(--tooltip)", color: "var(--tooltip-ink)", border: "1px solid var(--border-strong)", boxShadow: "0 18px 44px rgba(0,0,0,.4)", fontSize: 13, animation: "rosToastIn .3s var(--ease) both", width: "100%" }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, flex: "none", background: t.tone === "ok" ? "var(--ok)" : t.tone === "warn" ? "var(--warn)" : t.tone === "bad" ? "var(--bad)" : "var(--info)" }} />
          <span style={{ flex: 1 }}>{t.text}</span>
          {t.undo && <Btn size="sm" variant="ghost" onClick={undoLast}>Undo</Btn>}
        </div>
      ))}
    </div>
  );
}

function ConfirmModal() {
  const { ui } = useRos();
  const c = ui.confirm;
  if (!c) return null;
  const close = () => setUi({ confirm: null });
  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 92, background: "var(--scrim)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ width: "min(460px,100%)", background: "var(--overlay)", border: "1px solid var(--border-strong)", borderRadius: 20, padding: "22px 22px 18px", boxShadow: "0 30px 80px rgba(0,0,0,.5)", animation: "popIn .25s var(--ease) both" }}>
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-.3px" }}>{c.title}</div>
        <div style={{ fontSize: 13.5, color: "var(--body)", marginTop: 10, lineHeight: 1.6 }}>{c.body}</div>
        <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 10 }}>Demo action: nothing leaves the browser.</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <Btn onClick={close}>Cancel</Btn>
          <Btn variant={c.danger ? "danger" : "primary"} onClick={() => { close(); c.run(); }}>{c.confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

export function RosOverlays() {
  // Escape closes the confirm dialog first, then the top record drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const u = getUi();
      if (u.confirm) setUi({ confirm: null });
      else if (u.drawer.length) closeRecord();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return <><RecordDrawer /><ConfirmModal /><Toasts /></>;
}
export { roleDef };
