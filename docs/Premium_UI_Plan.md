# KYRO premium UI overhaul — audit, direction, plan
Date 2026-10-14 · scope `apps/web` (React+Vite+Tailwind+framer) · live default = ui.v2 "Bright blue & coral"
Screenshots + DOM census: `scratchpad/shots/*.png`, `scratchpad/shots/census.json` (script: `scratchpad/audit.mjs`, 1440×900, Playwright, minted JWTs like `demo-video/capture-v3.mjs`).

## 1. Audit — why it reads amateurish

### 1.1 Numbers (the "cards everywhere" problem, quantified)
Class usage across `src/**/*.jsx` (grep): `rounded-lg` 646 · `rounded-xl` 489 · `rounded-2xl` 326 · `rounded-3xl` 27 · `rounded-md` 233 · `rounded-full` 643 → **six competing radii** on one screen. Shadows: `shadow-glow` 141, arbitrary `shadow-[0…]` 74, `shadow-card` 63, `shadow-navy-glow` 36. `bg-gradient-to-*` 31 + ~40 gradient declarations in `index.css`/`home-tiles.css`. `font-mono` 153 (no mono font is loaded; it falls to the OS). 14 distinct arbitrary px sizes (`text-[13px]` 690, `[12px]` 573, `[12.5px]` 453, `[11px]` 442, `[14px]` 430, `[15px]` 311, `[11.5px]` 245, `[13.5px]` 197, `[10.5px]` 132 …) → no type scale.
Surface classes: `.card-soft` 177 uses / 94 files · `.btn-cta` 55/37 · `.btn-primary` 56/41 · `.card-vital` 13 · `.card-flashy` 14 · `.card-attn` 14 · `.kpi-3d` 10 · `.av2-card` 19 · `.module-tile` (home + wizard) · `.modal-lux` 2.

Per-screen census (card-shaped = radius ≥12px, ≥160×60, bordered/shadowed/filled):
| screen | cards | nested | shadows | gradients | blur | font variants |
|---|---|---|---|---|---|---|
| /app school | 12 | 0 | 15 | 18 | 4 | 14 |
| /app org | 22 | 1 | 49 | 34 | 0 | 22 |
| /finance | 8 | 1 | 12 | 14 | 1 | 19 |
| /finance?tab=add | 4 | 0 | 8 | 8 | 0 | 11 |
| /enrollment | 11 | 1 | 15 | 7 | 0 | 26 |
| /enrollment?tab=records | 2 | 1 | 6 | 5 | 0 | 20 |
| /academics | 12 | 0 | 20 | 11 | 8 | 25 |
| /accreditation | **38** | **30** | 25 | 30 | 0 | 30 |
| /analytics (overview) | 12 | 4 | 17 | 6 | 0 | 24 |
| /analytics?view=scorecard | 27 | 0 | **68** | 21 | 0 | 21 |
| /penny | 19 | 1 | 35 | 34 | 1 | 23 |
| / (landing) | 39 | 3 | 62 | 33 | **38** | 50 |
No horizontal overflow anywhere (good). Tables: only 1 real `<table>` on the audited screens (student roster); 54 files use `<table>` overall, 120 use `tabular-nums` — but the scorecard, KPI rows and org KPI strip are div-cards, not tables.

### 1.2 Concrete findings per screen
- **/app (school)** `home-school.png`: dark "Daily briefing" stage with a **purple→magenta aurora** (`AuroraFlow.jsx` stops `#8b5cf6`, `#a855f7`, `#ff6b7a`) — exactly the purple-blue AI-kit look the owner bans. Stat pills inside the stage are `rounded-xl` glass boxes with 4-line wrapped labels ("Asses/sment/Partici/pation"). Eight identical `rounded-[18px]` tiles with icon-in-tinted-square + title + blurb + chip + arrow = the template tile. Two radii in one tile (18px shell, 15px icon, 999px chip).
- **/app (org)** `home-org-full.png`: 22 cards; "Across the network" cards are the same shape as school tiles as org KPI tiles; the org KPI strip at the bottom is 8 **gold-bordered** boxes (v1 gold leaking in under v2) inside a white card inside the page — card-in-card.
- **/finance** `finance-overview.png`: page header (icon tile + h1 + "Your finance command center") then a second dark "COMMAND CENTER — Welcome back…" hero that repeats the title; the AI-insight panel is a card inside the hero (nested); below, six `module-tile--panel` cards each a mini-dashboard with "—" placeholders and uppercase link buttons. Three header levels say "Finance".
- **/finance?tab=add** `finance-add.png`: the stepper lives in its own white card; "Back to Finance overview" pill under a breadcrumb that already has it; the three choices are home-tile clones (icon square, grey chip, arrow circle). Wizard steps feel like a marketing page, not a form.
- **/finance?tab=records** (Workspaces) and **?tab=reports**: 2–4 link cards floating in 80% empty ground; `OPEN STATEMENTS →` in tracked uppercase + a second arrow button for the same action.
- **/enrollment** `enrollment.png`: dark hero with a rainbow gauge (purple/yellow/cyan/magenta — four hues for one number), glass sub-panel with grade chips in four hues; then a white "Where this came from" bar card, then three KPI cards (one coral-bordered = different meaning, same shape), then three more link cards. Five different header treatments on one screen.
- **/enrollment?tab=records** `enrollment-records.png`: the one real table, but wrapped in a card with a second header; grade chips use four pastel hues (no meaning), status chips are the same pill shape for Enrolled/Withdrawn; initials avatars on every row (noise); no sticky header, no right-aligned numerics, 48px rows.
- **/academics** `academics.png`: two stacked dark hero cards (`ModuleHero` + "The read"), glass stat chips, then three link cards. Mono eyebrows in OS monospace look un-set.
- **/accreditation** `accreditation-full.png`: 38 cards, 30 nested (gauge card inside hero inside page; 10 domain cards each containing chips, bands and signal rows; six "Needs attention" cards). Gold v1 gauge + gold text on a navy stage, gold borders on the rubric cards: the v1 palette survives inside v2. Longest page (5552px) and almost no rules or whitespace — only boxes.
- **/analytics** `analytics-overview.png`: the scope bar is a card holding a **wall of 17 school chips** that pushes the content below the fold; "Back to dashboard" pill + breadcrumb + icon-title header = three nav rows; "School vitals" are four dark glass tiles showing "—".
- **/analytics?view=scorecard** `analytics-scorecard-full.png`: every metric is a **separate floating row-card** (68 shadows); the metric rows and the "revenue mix" cards are different shapes for the same kind of datum; values are not column-aligned.
- **/analytics?scope=org** `analytics-peers.png`: bar chart colours per school are the module hues (purple, red, blue, teal) so the chart looks like a module legend.
- **/penny** `penny-studio.png`: navy stage with gold (`studio-*` literals + `.penny-text`), but the chrome around it is blue; the three "Get something done" cards use gold icon squares — a third palette on one screen.
- **/governance?tab=records** `governance-records.png`: an empty register as a dashed card inside a white card; tabs + filter pills + a violet `New` pill (module hue as a fill, not an accent).
- **/ (landing)** `landing.png`: video hero with a stock photo + a navy glass card with the headline + a second glass chat card overlapping; 38 backdrop-blur elements and 50 font variants down the page; `GET STARTED` uses the 3D `btn-cta` bevel.
- **Global**: `--font-display` is remapped to Montserrat under v2 (`tokens.css:99`), so `font-serif` renders Montserrat — EB Garamond is loaded but unused in the app; the "serif" word in 300+ classNames is a lie. The sidebar (`AppShell.jsx:707`) is `bg-navy-gradient` with a `border-r-2 border-gold/30` and `shadow-navy-glow` — v1 chrome. The KYRO lotus logo (purple/blue/orange) and the owl stay (brand).

Summary of the amateur tells: one container idiom (rounded white box + soft shadow) used for every role; up to three stacked header treatments per page; v1 gold and v2 blue and per-module hues and semantic hues all present at once; decorative gradients and glass as default; no table discipline; no type scale; corner radii from 4px to 24px on one screen.

## 2. Design direction — one system: "the ledger"

Positioning: an official instrument for a finance office and a board, not a consumer dashboard. The page is a document; data sits **on the ground**, divided by hairlines and whitespace; the only raised surfaces are things you can act on. Flash comes from motion and from numbers, not from boxes.

### 2.1 Page grammar
```
┌ top strip (sticky, 56px, ground, hairline below; glass ONLY here when scrolled) ┐
│ eyebrow  MODULE · SCOPE                                     [secondary] [Primary] │
│ Title in EB Garamond 30/36                                                       │
│ meta line · period · updated · source                                            │
├──────────────────────────── hairline ────────────────────────────────────────────┤
│ Stat strip: 4–6 Stats separated by vertical rules, no boxes, count-ups           │
├──────────────────────────── hairline ────────────────────────────────────────────┤
│ SECTION LABEL (11px caps)  ───────────────────────────── aside/toolbar           │
│ content directly on ground (table / chart / prose)                               │
│                                                                                  │
│ ┌ Panel (only when actionable: a form, a wizard step, an upload, a drawer) ┐     │
│ └───────────────────────────────────────────────────────────────────────────┘     │
```
Rules: one elevation level (Panel: hairline border, 1px contact shadow); no card inside a card; dark "stage" allowed in exactly two places (Home briefing band, Studio hero) and those are the only full-colour surfaces; everything else is ground + ink.

### 2.2 Typography
- Display: **EB Garamond** 500 (restore `--font-display` under v2); only for page titles, the Home greeting, and big numbers in the Stat strip. Never below 22px.
- UI: **Montserrat** 400/500/600. Body 15/22 (drop the v2 17px/1.65 body — it is a blog measure, not an app).
- Mono for eyebrows: load `JetBrains Mono` 500 via the existing Google Fonts link (one weight) or drop `font-mono` entirely; current OS-mono eyebrows read unfinished. Recommendation: drop mono, use Montserrat 600 11px caps `.08em`.
- Scale (tokens → Tailwind `fontSize`): `display-xl` 40/44 · `display` 30/36 · `title` 22/28 · `heading` 17/24 · `body` 15/22 · `small` 13/18 · `micro` 11/16 caps. `font-variant-numeric: tabular-nums` on `table`, `.stat`, `.num`.
- Headings get `text-wrap: balance`; numbers right-aligned wherever they stack.

### 2.3 Colour
Ground `#F6F7FA` · surface `#FFFFFF` · ink `#101C3D` · ink-2 `#44506E` · hairline `rgb(16 28 61 / .10)` · primary `#2563EB` (buttons, links, focus) · module hue = `--c-module` (already set by `moduleAccentVars`) used **only** as a 2px rule, an underline, a Stat accent, or an icon stroke — never as a fill or a gradient. Semantic: good `#15803D`, watch `#B45309`, risk `#B91C1C` (coral `#C2362B` text variant stays as "needs a decision"), all as 2px status marks + ink text, not tinted pills. Chart series palette stays `chartPalette.js`, but module hues leave the per-school bars. Gold is Penny/KYRO only (unchanged, per `--c-penny*`).

### 2.4 Surface primitives (new `src/components/ui/surface/` + `src/styles/surface.css`)
| primitive | class | spec |
|---|---|---|
| `Page` | `.pg` | `max-w-page mx-auto px-8`, framer stagger container (children `y:8→0`, 320ms, 40ms stagger, `useReducedMotion` → none) |
| `PageHeader` | `.pg-head` | eyebrow / title / meta / actions on a hairline; props `eyebrow,title,meta,actions,hue`; 2px top rule in `--c-module` |
| `StatStrip` + `Stat` | `.stats` `.stat` | grid, vertical rules between stats, label 11px caps, value Garamond 30 tabular with `CountUp`, delta `Pill`, 2px status mark under the value |
| `Section` | `.sec` | label row (11px caps + hairline + aside), 32px gap; no border, no background |
| `Panel` | `.panel` | white, 1px hairline, radius `--r-panel`, `shadow-panel`; `tone="attention"` adds a 2px left mark; the only raised surface |
| `DataTable` | `.dt` | sticky `thead` (ground bg, 11px caps), 36px rows, hairline rows, hover `bg-ink/[.03]`, `.dt-num` right + tabular, 2px status mark column, no per-row cards; sort chevrons; empty state as a ruled row |
| `Pill` | `.pill` | 20px, radius 4, ink text, hairline border; variants `status` (mark + text), `count`; one shape for all meanings, colour only semantic |
| `Toolbar` | `.toolbar` | 40px row of filters/segmented controls on the ground, hairline below; replaces the chip-wall card |
| `Tile` | `.tile` | the ONE card family that stays (Home modules, wizard choose): radius `--r-panel`, hairline, hue 2px bottom rule, hover: flood kept (one-shot CSS), arrow slides |
| `Button` | `.btn` `.btn-primary` `.btn-secondary` `.btn-quiet` | 36px, radius 6, 13px 600, no bevel/sheen/uppercase; primary = `#2563EB` flat with 1px darker ring |

### 2.5 Motion (cinematic, one-shot)
Page-in stagger (Page); count-ups on every Stat (`CountUp.jsx`, `AnimatedMetricValue.jsx` already exist); hairline "draw" on PageHeader (scaleX 0→1, 480ms); row reveal on DataTable (opacity stagger 15ms/row, capped at 20 rows); hover: Tile flood + arrow, Panel border darkens, row action buttons fade in. Remove every infinite loop in app chrome: `cf-rotate`, `cf-flow`, `animate-float`, `gradient-pan`, `studio-mote`, the `ModuleHero` watermark bob, `pulse-ring` (keep spinners). Glass (`backdrop-blur`) only on the sticky top strip.

### 2.6 Token diff
`src/styles/tokens.css` (add inside `:root` + override in `html[data-ui='v2']`):
```css
--r-ctl: 4px;  --r-panel: 8px;  --r-pill: 999px;          /* ONE radius family */
--hair: 16 28 61;                                          /* hairline channel */
--sh-panel: 0 1px 2px rgb(16 28 61 / .06);
--sh-float: 0 12px 32px -12px rgb(16 28 61 / .28);         /* popovers, modals only */
--c-ground: 246 247 250;  --c-ink-2: 68 80 110;
--c-good: 21 128 61;  --c-watch: 180 83 9;  --c-risk: 185 28 28;
--font-display: 'EB Garamond', Georgia, serif;             /* v2 block: restore serif */
--sp-section: 32px; --sp-panel: 20px; --row-h: 36px;
```
`tailwind.config.js`:
```js
borderRadius: { none:'0', sm:'var(--r-ctl)', DEFAULT:'6px', md:'6px', lg:'var(--r-panel)',
  xl:'var(--r-panel)', '2xl':'var(--r-panel)', '3xl':'var(--r-panel)', full:'var(--r-pill)' }, // clamp: 842 existing classes collapse to one radius
boxShadow: { card:'var(--sh-panel)', paper:'var(--sh-panel)', lift:'var(--sh-float)', glow:'var(--sh-panel)',
  'glow-lg':'var(--sh-float)', 'navy-glow':'none', login:'var(--sh-float)', panel:'var(--sh-panel)', float:'var(--sh-float)' }, // keep penny-glow
colors: { ground:'rgb(var(--c-ground)/<alpha-value>)', hair:'rgb(var(--hair)/<alpha-value>)', ink2:…, good:…, watch:…, risk:… },
fontSize: { 'display-xl':['40px',{lineHeight:'44px'}], display:['30px',{lineHeight:'36px'}], title:['22px',{lineHeight:'28px'}],
  heading:['17px',{lineHeight:'24px'}], body:['15px',{lineHeight:'22px'}], small:['13px',{lineHeight:'18px'}], micro:['11px',{lineHeight:'16px',letterSpacing:'.08em'}] },
animation: { /* delete float, 'gradient-pan', 'studio-mote', shimmer stays */ }
```
`index.css`: v2 body → `15px/1.5`; delete `.card-vital`, `.card-flashy`, `.card-attn`, `.kpi-3d`, `.btn-cta`, `.btn-gold` bevel/sheen (in P4 after consumers migrate); `.card-soft` → alias of `.panel` in P1. Print blocks and `.ui-v1` untouched. The radius/shadow clamp is a **token** change, so `@media print` + `.ui-v1` keep their literal px/hex values (the print CSS uses literals, not Tailwind radii), which is why it is safe in P1.

### 2.7 Before / after sketches
1. **Finance overview** — before: breadcrumb → icon+title → dark "Command center" hero (AI insight card inside) → 6 mini-dashboard cards. After:
```
FINANCE · NORTH MIAMI BEACH SR HIGH · FY 2027            [Workspaces] [Add data]
Finance                                   (Garamond 30)
Updated 2 h ago · trial balance Jun 30 · 4 signals
────────────────────────────────────────────────────────────────────────────
 Total revenue      Total expense     Change in net assets   Days cash   Margin
 $6,511,719 ▲3.2%   $6,210,004        $301,715               112 ▬ good  4.6%
────────────────────────────────────────────────────────────────────────────
WHAT NEEDS A DECISION ──────────────────────────────────────── view briefing →
 ▌risk   Aid per student declined $357 …                         Statements →
 ▌watch  Enrollment down slightly …                              Budget →
STATEMENTS ───────────────  BUDGET VS ACTUAL ───────────  CASH ──────────────
 (three ruled columns of figures, each a link list — no boxes)
```
2. **Tile home** — the briefing stage stays (ink `#0A1628`, blue light only, aurora recoloured to primary + sky, no purple); stat pills become a Stat strip inside the stage; tiles: 8 `Tile`s, 2px bottom rule in hue, flood on hover; chips become `Pill status` ("7 need attention" with a risk mark). Org home: school grid becomes a `DataTable` (crest, name, latest FY, critical count, trend spark) plus three `Tile`s for network views; KPI strip → `StatStrip`.
3. **Records register** — the roster is a `DataTable` directly on the ground under a `PageHeader` (title "Student roster", meta "836 students · 11 imports"); `Toolbar` with search + facet selects + flag toggles; grade as text, status as a 2px mark + word, flags as `Pill`s; no avatars, no wrapper card, sticky header, 36px rows.
4. **Analytics scorecard** — one `DataTable` per section (Metric · Target · Value · Δ · Status · chart→), values right-aligned tabular; the section label is the `Section` rule; "attention first" is a sort, not a button pair. Scope bar → `Toolbar`: a `select`/combobox for school + a `Compare` popover; the 17-chip wall is gone.
5. **Add-data wizard** — `PageHeader` eyebrow "FINANCE · ADD DATA", title "Get your finance numbers in"; stepper is a 2px progress rule with three labels on the hairline (not a card); step 1 choices are `Tile`s in a 3-up; steps 2–3 render inside a single `Panel` (the one raised surface) with the footer actions on a hairline.
6. **Module hero (Enrollment/Academics/Accreditation)** — the dark stage becomes a light `PageHeader` + `StatStrip`; the gauge/arc stays but monochrome (module hue + ink track) inside a `Section`, right-aligned to a prose "read" column; the ten accreditation domain cards become a `DataTable` (Domain · Coverage · Documented · Defensible · Signals · Status).

## 3. Plan — five phases, no flags

### P1 — Tokens + primitives (one PR, no page edits)
Files: `src/styles/tokens.css`, `tailwind.config.js`, `src/index.css` (v2 body size, `.card-soft` alias, delete infinite keyframes), `index.html` (fonts: add Garamond 500, drop Montserrat 300), new `src/styles/surface.css`, new `src/components/ui/surface/{Page,PageHeader,StatStrip,Stat,Section,Panel,DataTable,Pill,Toolbar,Tile,Button}.jsx` + `index.js`, new `src/components/ui/surface/surface.spec.jsx` (render + class contract), new `apps/web/scripts/ui-audit.mjs` (port of `scratchpad/audit.mjs`, writes `apps/web/.ui-audit/`).
Effect without page edits: radius clamp (842 classes → 8px), shadow clamp (quiet), serif display restored, body 15px, loops stopped. Risk: pill-shaped controls using `rounded-2xl`/`rounded-3xl` turn square-ish (grep shows ~40 such buttons; `rounded-full` is untouched so most pills survive); `card-noclip-sweep.spec.js` + `domain/domain-kpi-noclip.spec.jsx` pin "shared depth vocabulary" strings — update rosters in the same PR. Verification: `pnpm --filter @finrep/web test`; `scripts/ui-audit.mjs` before/after on all 18 routes; assert no horizontal overflow; print routes (`/reports/board/print`, `/board-packet/print`, `/readiness/cap/print`, `/readiness/workpapers/print`, `/accreditation/*/print`, `/governance/report/print`) screenshot-diffed pixel-identical (they use literal px/hex inside `.ui-v1`/`@media print`).
Issue: **"P1 · Premium UI: tokens, radius/shadow clamp, surface primitives"** — body: findings §1.1 counts; token diff §2.6; primitive list §2.4; acceptance: specs green, print diff 0, audit census shows radius values ∈ {4,6,8,9999} on every route.

### P2 — App shell, tile home, page headers
Files: `components/nav/AppShell.jsx` (sidebar: flat ink `#0A1628`, no gold border/glow, 1px hairline; top strip sticky ground + glass on scroll; active item = 2px hue rule), `components/module/ModuleHero.jsx` → re-implemented on `PageHeader`+`StatStrip` (keeps props so 6 module pages need no edits), `components/module/ModuleTabs.jsx` (drop the `bg-section` wrapper; breadcrumb into PageHeader eyebrow), `components/module/ModuleBreadcrumb.jsx`, `components/module/SectionHeader.jsx` → `Section`, `components/home/{HomeTiles,ModuleTile,OrgTiles,SchoolTile,BriefingBand,AuroraFlow,BriefingPerformers,HomeVitalsStrip,OrgHome}.jsx`, `styles/home-tiles.css` (flood kept, radius/ring/glass removed), `components/ui/BackLink.jsx` (back pill → quiet text link; delete `.back-pill-*` CSS), `components/analytics/ContextBar.jsx`.
Replace map: `.module-tile` → `Tile`; HomeVitalsStrip `.card-vital` → `StatStrip`; BriefingPerformers glass chips → in-stage `Stat`; OrgTiles school cards → `DataTable` + 3 `Tile`; `card-attn` boards (HomeBriefing, OrgBriefing) → `Panel tone`. AuroraFlow stops → `#2563EB`/`#38BDF8`/`#0EA5E9` (no purple). Risk: Penny target-registry ids (`nav-home`, `tile-*`) must survive — keep ids on the same elements; `school-crest.spec`, `org-modules-columns.spec`. Verification: audit census `/app` ≤ 10 cards, nested 0, blur ≤ 1; keyboard focus ring visible; reduced-motion run.
Issue: **"P2 · Premium UI: shell, home tiles, page header band"** — before/after sketch 2; file list; acceptance above.

### P3 — Finance + Analytics + tables
Files: `pages/FinancePage.jsx` (FinanceHeader → PageHeader; delete the second "Command center" hero; SectionCards → `Section` columns), `components/finance/*`, `pages/CashFlowPage.jsx` (11 `rounded-2xl`), `components/analytics/{AnalyticsDashboard,HeadlineBand,HeroVitals,HeroVitalTile,MetricCard,MetricGrid,MetricSection,BudgetVsActual,PeriodComparison,CustomizeBar,CustomizePanel}.jsx`, `components/analytics/v2/{AnalyticsScopeBar,PeerScopeBar,AnalyticsSubTabs,Scorecard,ScorecardView,V2StatTile,ChartCard,QuestionGroup,Leaderboard,PeersView,OverviewView}.jsx`, `styles/analytics-v2.css` (delete `.av2-card`, ambient wash), `components/budget/{OrgBriefing,OrgRollup,OrgSchoolsTable,MonthlySpreadGrid}.jsx`, `components/domain/{DomainCommandCenter,DomainKpiCard,NeedsAttentionPanel}.jsx` (shared by Governance/Facilities/Advancement/Strategy — migrating here moves four modules for free).
Replace map: `HeroVitalTile`/`V2StatTile`/`DomainKpiCard`/`.kpi-3d` → `Stat`; `MetricCard` + `Scorecard.MetricRow` → `DataTable` rows; `ChartCard`/`.av2-card` → `Section` (chart on ground) ; scope chip wall → `Toolbar` select; `HeadlineBand` → `PageHeader` meta; all `<table>`s in the list above → `.dt` classes (sticky head, `.dt-num`). Chart series: per-school palette from `chartPalette.js` only. Risk: `flash.js` cross-link ring assumes `border-radius:14px` cards — retarget to the row; `peer-rail.spec`, `peers-fallback.spec`, `finance-honesty.spec`, `finance-first-run.spec`. Verification: scorecard census shadows ≤ 4; every numeric column right-aligned (audit script: check `text-align` of `.dt-num`); count-ups fire once per mount.
Issue: **"P3 · Premium UI: Finance, Analytics, DataTable"** — sketches 1 and 4; replace map; acceptance.

### P4 — Remaining modules, wizards, record flows, Studio
Files: `pages/{EnrollmentPage,AcademicsPage,OrgAcademicsPage,AccreditationPage,VisitPage,GovernancePage,FacilitiesPage,AdvancementPage,StrategyPage,HrPage,PlanningPage,ImprovementPage,TasksPage,KnowledgePage,SettingsPage,DataHubPage,DiocesanImportPage}.jsx`, `components/enrollment/{EnrollmentHero,VsPlanKpi,EnrollmentMixCards,StudentRegister,StudentSlideOver,RosterSourceCard,EnrollmentConnectCard}.jsx`, `components/academics/{AcademicsOverview,AssessmentDashboard,CohortTrajectoryPanel,GradesPanel,AcademicsHeatmap}.jsx`, `components/accreditation/{ReadinessHero,DomainGrid,DomainBandStrip,NamedHolesPanel,JourneyTab,EvidenceReadinessTable,SignalCoverageTable,MilestoneCard}.jsx` (gauge → monochrome; 10 domain cards → DataTable), `components/module/ModuleRegister.jsx` (drop `.card-soft` wrapper), `components/wizard/{AddDataWizard,WizardStepper,WizardChoose,WizardConfirm,AddDataTab}.jsx`, `components/recordwizard/{RecordFlow,FlowStepRail,FlowReview,FlowConfirm}.jsx`, `components/ui/EntityFormModal.jsx` (+ delete `.modal-lux`, `.field-lux` → `.panel` + plain fields), `pages/PennyStudioPage.jsx`, `components/penny/studio/{StudioHero,StudioCapabilityTiles,StudioRecipes,StudioAskBar,StudioBackdrop,StudioParticles}.jsx` (stage stays ink + gold as KYRO's colour; tiles → `Tile`; particles one-shot), `index.css` (delete `.card-vital/.card-flashy/.card-attn/.kpi-3d/.btn-cta/.btn-gold/.module-cta-ghost/.back-pill-*`, `.btn-primary` → flat).
Replace map: all `.card-soft` (177) → `Panel` only where the box contains a form/upload/action, else unwrap to `Section`; `btn-cta`/`btn-gold`/`btn-primary` (129) → `Button`; `module-tile` in `WizardChoose` → `Tile`. Risk: largest diff; `card-noclip-sweep` roster; `accreditation-honesty.spec`, `enrollment-overview.spec`, `wizard-finish.spec`, `KyroDove.spec`. Split into 3 PRs (modules A: enrollment+academics+accreditation; B: governance/facilities/advancement/strategy/hr/planning/tasks/knowledge/settings; C: wizards+record flows+Studio+CSS deletion). Verification: audit census on all module overviews: cards ≤ 6, nested 0; `grep -c 'card-soft\|kpi-3d\|btn-cta' src` = 0 at the end of C.
Issue: **"P4 · Premium UI: modules, wizards, record flows, Studio"** — sketches 5 and 6; three sub-PR list; grep-zero acceptance.

### P5 — Public landing
Files: `pages/landing/{LandingPage,LandingNav,LandingHero,VideoHero,TrustBar,BentoWall,DomainPlates,OrbitScrolly,IngestScrolly,IngestScenePress,ingestShared,BoardReadyShow,CashForecastCinema,OrgCommandShow,PennyDemo,DioceseBand,ActSection,FinalCta,LandingFooter}.jsx`, `styles/landing-orbit.css`.
Direction: same system at editorial scale — Garamond display 56/60, one ink band (hero), everything else on ground with rules; the product shots become real screenshots of the P2–P4 UI (the audit script can produce them); glass removed (38 → 1: the nav on scroll); the chat demo card becomes a `Panel`; `btn-cta` bevel → `Button`. Keep the hero video and the owl. Risk: Lottie/scrolly timing; `no-compliant-claim.spec`, `no-ghost-hub.spec`. Verification: Lighthouse perf ≥ 85 desktop, CLS < 0.1; audit census blur ≤ 1, fonts ≤ 16 variants.
Issue: **"P5 · Premium UI: landing page on the new system"** — direction; file list; acceptance.

### Epic draft
**Title:** "Premium / official UI overhaul (tokens → shell → money screens → modules → landing)"
**Body:** Owner's brief (2026-10-14) verbatim; §1.1 table; §2 direction summary (page grammar, one radius 8px, hairlines not shadows, Garamond display + Montserrat UI, DataTable everywhere numbers stack, one-shot motion, colour = ground+ink+primary+hue rule+semantic); phase checklist P1–P5 with links; global acceptance: every route in `scripts/ui-audit.mjs` shows radii ∈ {4,6,8,9999}, nested cards 0, blur ≤ 1, no horizontal overflow, print routes pixel-identical to baseline, `prefers-reduced-motion` run has zero animations; excluded: `.ui-v1` report preview and all `*PrintPage`/`*PrintDocument` files.

### Sequencing and ownership notes
P1 is the lever: because radius/shadow are tokens, the whole app calms down in one PR and every later phase is subtractive (remove wrappers, replace components). P2 before P3 because `ModuleHero`/`PageHeader` is shared chrome. P3's `DomainCommandCenter` migration silently covers four P4 modules. Memory rules honoured: flashy via count-ups/stagger/hover; no purple-blue gradients (AuroraFlow recoloured; governance purple remains a 2px hue rule only); glass once (top strip); animate once (all loops deleted); semantic colour only; owl stays.
