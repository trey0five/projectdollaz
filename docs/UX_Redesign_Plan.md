# UX Redesign Plan — "A Friendlier Front Door"

**Status:** concept approved via interactive mockup · **Date:** July 2026
**Mockup (living, single URL):** https://claude.ai/code/artifact/edcdd244-5642-4130-9567-8d93044b8aff
**Companion inputs:** user feedback ("not as user friendly as it can be… a lot of reading… where do I enter data?"), the diocesan Power BI sample layout (per-school reports, metrics tables), blackbaud.com tile pattern.

---

## 1. Why

Three complaints, three moves:

| Feedback | The move |
|---|---|
| "Hard to get around; the sidebar is a wall of links" | **The home becomes the navigation** — one colorful tile per module (picture + plain-language line + live status), Blackbaud-style but alive. Sidebar retired. |
| "A lot of reading; hard to understand" | **A brighter, easier design system** — Bright blue & coral on near-white, bigger sans type, 65-character lines, plain words first. |
| "Where do I enter data?" | **Every module gets its own “Add data” wizard** — 3 steps (choose → upload → confirm), replacing the central Data hub. |

Plus this round: **analytics must be navigable by a new user** — separate the *story*, the *graphs*, and the *metrics* instead of mixing them.

## 2. Design principles (the north stars)

1. **The home is the map.** Navigate by recognition (tiles with pictures and status), never memorization (a 20-link sidebar).
2. **Same shape everywhere.** Every module page has the same four tabs: **Overview · Add data · Records · Reports**. Learn one module, you know them all. Analytics follows the same rhythm.
3. **Three clicks to anything.** Home → module tile → tab. Deep links for everything.
4. **Color means something.** Blue = action. Coral = needs attention (only). Gold = Penny (only). Each module owns a hue; each school owns a fixed hue that never changes when you filter.
5. **Plain words first.** "Use last year's numbers as your starting point," not "promote the prior-year snapshot to the operational baseline." Jargon gets a tooltip, not a starring role.
6. **Flashy but honest.** Motion, glow, gradient depth — yes. 3-D perspective, dual axes, misleading encodings — never (boards can tell).
7. **A new user is never stranded.** First-run tour, empty states that teach the next step, search everywhere, Penny as concierge.

## 3. The new home *(mocked ✓ — §1 of the mockup)*

- **Slim top bar**: logo (→ home), school switcher, global search, Ask Penny, avatar. No left rail.
- **Briefing band**: "Good morning — 3 things need a decision" + per-domain chips + ▶ Play. The daily briefing stays the soul of the product.
- **Module tiles** (8): SVG illustration, name, one-line plain-language description, **live status chip** ("7 need attention", "68% of goal"), arrow. Hover: color floods from the arrow corner, illustration zooms, shine sweep, hue-tinted lift. Keyboard-focusable, reduced-motion safe.
- **Core row** (small tiles): Ask Penny · Tasks · Knowledge · Reports · Settings.
- Status chips are fed by the same briefing counts that power today's nav badges — the home reads like a scoreboard.

## 4. The design system swap *(mocked ✓ — §2 of the mockup)*

**Tokens** (light theme):

| Role | Hex | Use |
|---|---|---|
| Ground | `#F8FAFF` | pages |
| Ink | `#101C3D` | text (15.4:1 on ground) |
| Action blue | `#2563EB` | buttons, links, selection |
| Coral | `#FF6B5E` | needs-attention ONLY |
| Sky | `#38BDF8` | highlights, gradients |
| Penny gold | `#E3A93C` | the mascot — hers alone |

- **Module hues**: finance `#2563EB` · enrollment `#0EA5E9` · governance `#7C3AED` · accreditation `#F59E0B` · facilities `#EA580C` · advancement `#E11D48` · strategy `#4F46E5` · hr `#059669`.
- **School series palette** (analytics, CVD-validated, fixed order): A `#2563EB` · B `#D97706` · C `#7C3AED` · D `#059669` · E `#E11D48`.
- **Type**: headings move serif → heavy sans (-.02em); body 17px / 1.65 / 65ch max; labels 11.5px caps.
- **PROTECTED:** board-packet / print / PDF templates keep their current styling (existing print-exclusion stays). Penny's coin stays gold everywhere.

## 5. Per-module "Add data" wizards *(mocked ✓ — §3 of the mockup)*

One shell, one rhythm — **Choose → Upload/Enter → Confirm** — as the "Add data" tab of every module. Wizards are chrome around **existing** importers/endpoints; no new backends.

| Module | Choose step offers |
|---|---|
| Finance | Trial balance · Monthly actuals · Budget · Connect QuickBooks |
| Enrollment | Upload roster · Connect SIS · Enter plan |
| Governance | Add policy (+ review date) |
| Accreditation | Pick standard → attach evidence |
| Facilities | Add maintenance item (+ schedule & cost) |
| Advancement | Add campaign · Record gifts |
| Strategic Planning | **Penny drafts the plan** (from live numbers) · manual goal |
| HR & Staffing | Staff counts → roles |

- Penny checks every upload and shows her work before anything saves (existing confirm-then-apply).
- Penny's drop-anything auto-filing stays untouched.
- The Data hub route redirects to the relevant module wizard after Phase C.

## 6. Analytics IA v2 — navigate by scope × content *(NEW this round)*

The mockup's three tabs (My school / Compare / Diocese) answered *whose numbers*. The missing axis is *what kind of content* — a new user shouldn't wade through gauges to find a number. Two-axis model:

**Axis 1 — the scope bar** (persistent, one filter row above everything, scopes every panel below):
`[School chips A–E] · [Compare (multi-select)] · [Diocese]` + school-year picker.

**Axis 2 — content sub-tabs** (the "separate graphs vs metrics" ask):

| Sub-tab | What lives there | For whom |
|---|---|---|
| **Overview** *(default)* | The story: 4 KPI stat tiles, 2 headline visuals, "what changed since last period" callouts | the new user / the 30-second check-in |
| **Charts** | The visual gallery, grouped by *question*, not chart type: "How's the money?" (rev vs exp, mix, the gap) · "How's enrollment?" (trend, capacity) · "How do we compare?" (multi-school lines, per-pupil cost, staffing, fingerprints, the race) | the explorer / the presenter |
| **Scorecard** | The metrics: sortable, **customizable** table board (the diocesan "Metrics tab"), inline bars, budget-status chips, per-row notes, export to board packet | the controller / the analyst |

Rules that make it intuitive:
- **Every chart has a "view as table" twin; every scorecard row has a "view chart" flip.** Graphs and metrics are two views of one registry number, cross-linked.
- Scope + sub-tab survive in the URL (`/analytics?scope=compare&view=scorecard`) and are remembered per user.
- Scorecard customization (pick metrics/columns) persists via the existing `AnalyticsDashboard` layout model.
- Breadcrumb `Home › Analytics`; the tile home is always one click (logo).
- Motion library from the mockup (draw-ins, count-ups, donut sweep, arc gauge, radar, bar race, legend spotlight) lives in the **Charts** tab; Overview stays calm (count-ups + sparklines only).

**Mockup delta:** the current mock shows the scope tabs; v4 of the mockup adds the Overview/Charts/Scorecard sub-nav before implementation starts.

## 7. The new-user safety net (site-wide)

1. **First-run tour** — 4 spotlight steps: the tiles → a module's Add data → the briefing → Penny. Dismissible, never repeats, re-launchable from Settings.
2. **Empty states teach.** An empty module tile/page always shows one action: "Add your first trial balance →" (opens the wizard).
3. **Search finds actions**, not just pages: "add budget" → the Finance wizard, step Budget.
4. **Penny as concierge**: "take me to cash," "where do I add gifts?" → she navigates (the agentNavigate bridge exists).
5. **Glossary tooltips** on jargon (days cash, TA%, the gap) — plain-English definitions from the metric registry's `description`.

## 8. Implementation phases (each runs the standard pipeline: 2 architects → locked contract → parallel engineers → 2 reviewers → live e2e)

| Phase | Scope | Key files/endpoints | Flag |
|---|---|---|---|
| **A — Tokens & type** | Tailwind token swap (blue/coral), type scale, print exemption | `tailwind.config`, `index.css` | `ui.v2` |
| **B — Home v2** | Tile home + slim top bar; tiles from `MODULE_META` + briefing counts; sidebar kept as fallback until C | `AppShell.jsx`, new `HomeTiles`, `sidebarNav.js` | `ui.v2` |
| **C — Module anatomy + wizards** | Overview/Add data/Records/Reports tabs on every module (extends `DomainCommandCenter`); the wizard shell + 8 configs wrapping existing importers; Data-hub redirects | `components/wizard/**`, module pages | `ui.v2` |
| **D — Analytics v2** | Scope bar + Overview/Charts/Scorecard; port the motion chart engine (Donut, ArcGauge, Radar, BarRace, Grouped/Stacked bars — keep recharts for trend); **new API: per-school compare** `GET /organizations/:id/metrics/by-school` (exposes what `computeOrgMetrics` already computes per school pre-rollup — zero recompute, registry-routed); scorecard reuses `AnalyticsDashboard` persistence | `analytics/**`, `org-metrics.service` | `ui.v2` |
| **E — Safety net** | Tour, empty-state CTAs, action search, Penny go-to intents, glossary tooltips | shell + search + assistant | — |

**Sequencing:** A+B together (one run) → C (two runs: tab shell, then wizards) → D (two runs: IA + charts, then compare API + scorecard) → E (one run). Retire the sidebar + Data hub only when C lands; flip `ui.v2` default when A–D are stable.

**Later (registry work, separate from UX):** the two new inputs from the diocesan sample — building capacity (→ capacity-achievement metric) and the diocesan salary scale (→ teacher-pay-% metric); "declared indicator" metric class for non-financial domain indicators.

## 9. Risks & guardrails

- **A rebrand touches everything** → ship behind `ui.v2`, QA page-by-page, print/PDF templates exempt, Penny gold unchanged, board-report visuals unchanged.
- **Two nav paradigms during rollout** → sidebar stays until Phase C completes; then redirects, not dead ends.
- **Chart engine split** → recharts stays for the trend/area charts it already does well; the new SVG engine only adds forms recharts lacks (donut sweep, arc gauge, radar, race). No dual-axis charts, no 3-D perspective, ever.
- **Value safety** → every analytics number keeps routing through `@finrep/analytics`; the compare endpoint re-exposes existing per-school computations (briefing ↔ analytics can never disagree).
- **Mobile** → tiles stack; the scope bar scrolls horizontally; race/radar have phone sizes; everything honors `prefers-reduced-motion`.

## 10. Success criteria

- A brand-new user reaches "first data added" in **under 5 minutes**, unassisted.
- Any module is **≤ 3 clicks** from anywhere; "days cash for School C" is **≤ 2 interactions** (scope chip → Scorecard).
- Zero metric mismatches between briefing, analytics, and board packet (registry-routed).
- Lighthouse accessibility ≥ 95 on Home and Analytics; all motion reduced-motion-safe.
- Qualitative: the next demo to a head of school requires zero "let me explain the nav" moments.

## 11. Out of scope (this redesign)

True 3-D charts · dark mode (revisit post-launch) · board-packet/print redesign (protected) · native mobile app.

---

### Appendix — mockup inventory (what's already designed)

| Mockup section | Status |
|---|---|
| §1 Tile home (hover floods, status chips, briefing band) | ✓ mocked, approved direction |
| §2 Palette/type tokens + before/after copy | ✓ mocked (blue & coral chosen over teal and evolved-navy options) |
| §3 Finance Add-data wizard (interactive) + per-module strip | ✓ mocked |
| §4 Analytics: scope tabs, motion charts (donut, gauge, radar, race, spotlight), scorecard table, PDF-metric mapping | ✓ mocked · **v4 adds Overview/Charts/Scorecard sub-nav (§6)** |
| §5 Old-world → new-world mapping + rollout | ✓ mocked |
