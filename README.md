# Ray of Sunshine OS · powered by Pulse

Frontend-only demo of an operating system for Ray of Sunshine Morning, After School and Early Years Services (9 locations, 650 children, 480 families, 100 staff). It is built on the Pulse v4 Glass template: Home and its chat, Agents, Work, Records with the Ontology, Activity, Settings and the Dashboard are all kept and re-pointed at childcare data.

Everything is simulated. No backend, no authentication, no payments, no messages, no NCS submissions and no API calls. All people are fictional.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build
```

## How it fits together

| Area | Where |
| --- | --- |
| Pulse shell, rail, header, Home chat, Work, Activity, Records, Settings, Dashboard | `src/logic/PulseLogic.js`, `src/logic/data.js`, `src/views/` |
| Typed records for every module | `src/ros/types.ts` |
| Deterministic seed (story fixtures first, then background records) | `src/ros/seed.ts` |
| Store: seed + replayed action log, role preview, location filter, drawers, toasts | `src/ros/store.ts` |
| Derived numbers (counts, money, ratios, manifests, NCS) | `src/ros/selectors.ts` |
| Demo actions (each writes to Activity) | `src/ros/actions.ts` and module files |
| Shared record drawer (any ID opens here) | `src/ros/records.tsx` |
| Module screens | `src/ros/modules/` |
| Navigation map and role access | `src/ros/registry.ts` |
| Brand accent layer and Sunshine theme | `src/styles/ros.css` |

- The demo clock is frozen at Tuesday 20 October 2026, 08:45. "Advance to afternoon" moves it to 14:45 for the school run.
- State is the seed plus a log of demo actions, saved to `localStorage`. "Reset demo" clears it; "Undo" removes the last action.
- Role Preview in the header switches between Owner, Operations, Accounts, NCS, Location Manager, Practitioner, Driver and Parent (MyRosKids).
- Ratios, fees, subsidy rates and NCS rules are demo configuration, not legal or regulatory determinations.

Read `CLAUDE.md` before customising further; its layout rules (Home then Agents at the top of the rail, Ontology first in Records, a clean Home centre column) still apply.
