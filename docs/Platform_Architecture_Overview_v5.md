# Platform Architecture Overview — v5

**Working title:** School Intelligence Platform
**For:** the internal team and development partners · Draft 5.0
**What changed from v4:** the model is re-expressed on two axes (capabilities × domains) so "engine" and "area" stop colliding; the engines are re-tiered (3 domain engines + 2 platform services + the intelligence layer); the **semantic / metric layer** is named as a first-class component because it is the part that makes "intelligence" real; and a **market-positioning** section is added, grounded in a live competitive scan (June 2026).

---

## 1. The model in one idea (unchanged — it's right)

Every school already runs accounting, an SIS, payroll, HR, donor management, document storage, spreadsheets, email and calendars. The problem is not a shortage of software; it is that **none of these systems work together to help leaders run the institution.**

The platform does not replace those systems. It **orchestrates** them: it sits above the tools a school already uses, connects their information, captures decisions, moves work along, keeps the institution's knowledge in one place, and gives leaders a single place to run the school from. The clearest expression of that is the **digital COO** — the screen a leader sees first thing Monday morning that has already done the prioritising: *"Three things require your attention today."*

Everything else in this document exists to make that briefing **accurate, current, and worth acting on.**

---

## 2. The structural fix: two axes, not one list

v4 carried two overlapping vocabularies — **5 engines** *and* **8 areas the platform knows about** — and they didn't line up: finance, governance and planning appeared in both, while enrollment, HR, facilities and advancement were "areas" with no engine. That ambiguity is resolved by separating the two things they actually are:

- **Capabilities — the engines ("how").** What kind of work the platform does: *connect & normalise · plan · govern · route work · remember · sense & decide.*
- **Domains — the eight areas ("what").** The subjects that work is done *to*: **finance, enrollment, HR, facilities, governance, advancement, accreditation, strategic planning.**

**Every feature is a cell in a capability × domain grid.** "Budget vs. actual" = *Plan × finance*. "Policy review cycle" = *Govern × governance*. "Accreditation evidence captured from daily operations" = *Remember × accreditation*. This single reframe removes almost all of the naming confusion in v4 and gives the team a precise way to place any new idea.

| Capability ↓ \ Domain → | Finance | Enrollment | HR | Facilities | Governance | Advancement | Accreditation | Strategy |
|---|---|---|---|---|---|---|---|---|
| **Connect & normalise** | ✅ wedge | ◻ | ◻ | ◻ | — | ◻ | — | — |
| **Plan** | ✅ budget | ◻ | ◻ | ◻ | — | ◻ | — | ◻ |
| **Govern** | — | — | — | — | ◻ | — | ◻ | ◻ |
| **Route work (Workflow)** | runs across every domain → |  |  |  |  |  |  |  |
| **Remember (Knowledge)** | runs across every domain → |  |  |  |  |  |  |  |
| **Sense & decide (Intelligence)** | reads across every domain → produces the briefing |  |  |  |  |  |  |  |

(✅ built today · ◻ planned · — system-of-record lives inside the platform / N/A. See §8 for the real build state.)

---

## 3. The engines, re-tiered

The five v4 engines are **not peers.** Three own a domain and are the system of record; two are horizontal services every domain uses; and intelligence is the layer on top, not a sibling.

| Tier | Engine | Role | System of record? |
|---|---|---|---|
| **Vertical (domain) engines** | **Financial** · **Planning** · **Governance** | own a domain end-to-end | yes — these live inside the platform |
| **Horizontal (platform) services** | **Workflow** · **Knowledge** | run across *all* domains | n/a — they serve the others |
| **Top layer** | **Intelligence** | senses across everything and decides | n/a — it reads, it doesn't store |

For the four domains the platform does **not** own — enrollment, HR, facilities, advancement — it **reads from and writes back to** the systems the school already runs (SIS, HRIS, facilities, donor CRM). Either way the information lands in one place. (This "system of record vs. connector" split was implicit in v4; making it explicit is what lets us say honestly which domains we build vs. integrate.)

---

## 4. The layer cake (the structure, top to bottom)

```
        ┌─────────────────────────────────────────────────────┐
        │   THE BRIEFING — the "digital COO"                   │  shaped per person by SCOPE × LENS
        ├─────────────────────────────────────────────────────┤
        │   INTELLIGENCE: sense → prioritise → recommend       │  alerts · benchmarks · forecasts · "3 things today"
        ├─────────────────────────────────────────────────────┤
        │  ★ SEMANTIC / METRIC LAYER ★  (the keystone)         │  every figure defined ONCE; the audit trail of meaning
        ├──────────────┬──────────────┬───────────────────────┤
        │  Financial   │   Planning   │   Governance          │  vertical engines — systems of record
        ├──────────────┴──────────────┴───────────────────────┤
        │   Workflow   ·   Knowledge                           │  horizontal services — run across all domains
        ├─────────────────────────────────────────────────────┤
        │   CONNECT & NORMALISE                                │  QBO · SIS · payroll · HRIS · donor CRM · docs
        └─────────────────────────────────────────────────────┘
```

**Modules vs. engines.** What a user clicks — *Finance, Budget, Statements, Reports, Governance, the morning briefing* — are **modules**: the navigable app surface rendered *from* the engines. Engines are the platform beneath. (This is the "intelligence section with modules under it" instinct, made precise: the briefing is the top module; each engine projects one or more modules.)

---

## 5. The semantic layer — the keystone, and the actual moat

The starred row is the part v4 was missing, and it is the hardest and most valuable piece.

The platform's core promise is that **two people never see figures that disagree.** That only holds if there is **one canonical place that defines each figure once** — "cash position," "enrollment vs. plan," "budget variance," "days cash on hand" — so every engine, every module and every personalised briefing reads the *same* number from the *same* definition. Concretely the semantic layer is three things:

1. **A canonical data model** — normalised entities (school, period, account, fund, person, plan, decision) that all sources map into.
2. **A metric/indicator registry** — each KPI defined once, with its formula, inputs, thresholds and owning domain, versioned and traceable back to source (the audit trail of *meaning*, paralleling the financial audit trail).
3. **A prioritisation/alert engine** — rules and models that turn metrics into *ranked attention* ("below target in November," "behind schedule") — which is what the Intelligence layer reads to assemble the briefing.

**Why this is the moat, not any single engine:** every individual engine has a credible competitor (see §7). What no point-solution can replicate is a *connected* metric layer spanning domains, because they only ever see one domain. Build the engines for coverage; build the semantic layer for defensibility.

---

## 6. The briefing changes with the reader (Scope × Lens)

The Monday-morning screen is not one view for everyone. From the same connected figures, the Intelligence layer assembles a per-person briefing along two dimensions:

- **Scope** — how much of the organisation you're responsible for (one school → an organization's finances → the whole system). Scope is also a **boundary**: you see only what your role entitles you to, following the org hierarchy the solution pack defines.
- **Lens** — which decisions and which of the eight domains sit with you (a finance director's briefing centres on money; a principal's on running their school; a superintendent's reaches across all eight).

Same engines, same figures, three different briefings — Principal · Organization finance director · Superintendent. This is the feature competitors can't fake without the semantic layer underneath it.

---

## 7. Packaging — a core platform + licensable modules

The platform must be **modular**: a school that only wants finance can buy *just* finance, with **price tiers per module**, and each module must run on its own *or* plug into the whole and add capability. The good news is the engine decomposition was already built for this ("each engine independently valuable" is a founding rule). Per-module licensing turns that implicit modularity into an explicit split:

**The core (always shipped — the substrate a module plugs into; cannot be unbundled):**
- identity / RBAC / org hierarchy
- the **semantic / metric layer** (§5)
- the **intelligence / briefing shell** (§4, §6)
- the horizontal services — **Workflow** and **Knowledge**

**The modules (independently licensed; each runs standalone with just core + itself):**
- the vertical engines — **Finance**, **Planning**, **Governance**
- the read-domain connectors — **Enrollment, HR, Facilities, Advancement, Accreditation**

A school can license **only Finance** and get a working product (core + Finance, with a finance-only briefing). Add modules and the core *composes* them.

### The plug-in contract (how a module attaches)
Each module is pluggable because it **registers what it contributes** to the core, rather than the core hard-coding it:

| A module declares… | …which the core composes into |
|---|---|
| metrics (formula, thresholds, scope-aggregation) | the semantic/metric registry (§5) |
| alerts / briefing items | the prioritisation engine → the briefing (§6) |
| task & approval types | Workflow |
| document / evidence types | Knowledge |
| a nav surface + routes | the app shell |
| an **entitlement key** | billing / feature-gating (below) |

Enabling or disabling a module (by license tier) lights up or hides exactly its metrics, briefing items, nav and routes — nothing else needs to know.

### Per-module entitlement (extend the billing you already have)
Today entitlement is **binary**: `isEntitled(schoolId) → true/false`, one `plan` per school, `EntitlementGuard → 402`. Per-module pricing is an *extension*, not a new system:
- `Subscription` carries a **set of licensed modules** (+ a tier per module), not one plan.
- `isEntitled(school, module)` and a **module-aware guard** (each module's routes declare the entitlement key they need).
- per-module **Stripe prices**; the core is the base.

### The commercial payoff: modularity and the briefing reinforce each other
A finance-only customer gets a **finance-only COO briefing** — valuable alone. Add Enrollment → the briefing becomes cross-domain ("enrollment down *and* cash below target"). Add Governance → fuller COO. **The intelligence layer's value scales with how many modules you own — that's the built-in upsell / land-and-expand engine.** Per-module pricing isn't fighting the architecture; it's powered by it.

### How to build it (don't over-engineer)
Do a **modular monolith**, not a runtime plugin system: clean module boundaries (largely already there — one NestJS module + engine per module), the registration contract above, and **entitlement-gated feature flags** per module. That buys independent licensing + standalone operation + plug-in composition *without* microservices/plugin-runtime cost — right for a small team. The contract makes extracting a module into its own service *later* cheap, if scale ever demands it.

## 8. Where we sit in the market (live scan, June 2026)

A multi-source competitive sweep (sources cited in the companion research file) supports a clear conclusion: **the integrated cross-domain "digital COO" briefing for schools is genuinely unclaimed — but the gap is narrowing, and the threat is not who we assumed.**

| Layer | Who's there | What they do | The gap they leave |
|---|---|---|---|
| **Suite incumbent** | **Blackbaud** (Financial Edge NXT, Raiser's Edge NXT, SIS, Billing, BoardEffect) | discrete products + *point-to-point* integrations; per-product "Copilot" AI | sold as separate products; tightest integration is only "intelligent reporting," **no unified cross-domain briefing**; consolidation lives on separate pages |
| **SIS + billing (and the real threat)** | **FACTS / Nelnet** — building **FACTS IQ** | branded "the intelligence layer," "central nervous system," "single system of record," "30+ decision-ready dashboards" | **single-school, SIS-centric; only 4 hubs (admissions/engagement/financial/success); no HR, facilities, governance, accreditation, strategy, or multi-school consolidation; dashboards, not a *prioritised briefing*** |
| | Veracross | connected single-school SIS+billing+accounting | accounting positioned as an *efficiency* tool — no leadership/briefing layer |
| **Finance / FP&A** | Frontline/Forecast5, Sage Intacct, Adaptive/Vena/Prophix | strong multi-year forecasting & multi-entity GL | **finance-domain only**; Forecast5 is public-district only |
| **Multi-school consolidation** | ParishSOFT (parish-focused), separate FE NXT pages | parish/diocese financial reporting | **multi-school (multi-entity) consolidation is largely unclaimed** by the SIS/suite incumbents on their core pages |
| **Governance** | BoardEffect, OnBoard, Diligent, Boardable, BoardPro | board portals | governance domain only |
| **AI-era entrants ('25–'26)** | **schoolOS** (IT/ops "operational intelligence"), **Scout** (YC W25, AI SIS) | orchestrate-not-replace, but for IT/ops and SIS busywork | **adjacent slices, not the cross-domain COO briefing** |

**Verdict:**
- **(a) White space is real (high confidence).** No verified player ships a prioritised, role-shaped, cross-domain daily *briefing* across all eight domains.
- **(b) Single biggest threat: FACTS (Nelnet).** It already sits on enrollment + tuition + finance data and is actively shipping an "intelligence layer." But its scope is bounded to its own SIS ecosystem, single-school, and it markets **dashboards, not prioritisation** — and it has **no governance/accreditation/strategy and no multi-school consolidation.** Our three durable differentiators are exactly its three gaps: **(1) a prioritised briefing, not dashboards; (2) full eight-domain orchestration; (3) multi-school (multi-entity) consolidation across districts, networks, systems and dioceses.**
- **(c) Near-analogue worth studying:** **schoolOS** (same "orchestrate, don't replace" thesis, but for IT/operations) and higher-ed **student-success/early-alert** tools (EAB Navigate, Civitas) that nail the "prioritised morning briefing" pattern — for *students*, not institutional operations. Borrow the pattern; own the domain they don't.

**Strategic read:** lead go-to-market with the two unclaimed things — **the briefing** and **multi-school consolidation** — using **finance as the proof.** The core market is **multi-school organizations** — districts, networks, systems and dioceses — where finance + multi-school consolidation pain is sharpest. FACTS will likely add domains and prioritisation over time; the race is to own the cross-domain *leadership* layer (and the multi-school consolidation wedge) before they extend out of the SIS.

---

## 9. Build state & phased roadmap (mapped to what exists)

Honest inventory of the current codebase against the model:

| Engine / layer | Built today | Gap |
|---|---|---|
| **Financial (vertical)** | **~80%** — Data hub (sources incl. **QBO**), mapping/normalisation, Statements (validation/reconciliation + reporting), Budget (+ forecast, budget-vs-actual, **multi-school roll-up**), Monthly actuals, Reports + **Board packets**, Readiness/Compliance, period history | deepen QBO sync; harden multi-school consolidation as a headline |
| **Intelligence + briefing** | **seeded** — Analytics (dashboards/metrics/benchmarks), **Penny** (AI assistant + autonomous actions), Home (briefing surface) | it only reads the *finance* domain; no canonical metric registry; no prioritisation → not yet a real cross-domain briefing |
| **Semantic / metric layer** | **implicit** — each module computes its own numbers | **not unified** — this is the keystone work |
| **Planning (vertical)** | **partial** — Budget + forecast (the finance slice) | strategic plan, improvement plans, facilities/capital, progress tracking |
| **Governance (vertical)** | **board packets only** | boards/committees, meetings/agendas, minutes/decisions, policy register |
| **Workflow (horizontal)** | **thin** — Schedules, report-schedule (recurring) | tasks, approvals/sign-offs, reminders, document routing |
| **Knowledge (horizontal)** | **thin** — Readiness (accreditation-evidence seed) | document store, templates, institutional memory, search |

### The roadmap (depth on the differentiator before breadth)

**Phase 0 — Finish the wedge *(in progress).*** Financial intelligence engine + multi-school roll-up as a *headline*, deeper QBO sync. This already delivers value alone and earns the trust + data everything else depends on. ✅ largely done.

**Phase 1 — Build the semantic layer and the *real* briefing *(do this next — it's the differentiator).*** Extract the metric/indicator registry + prioritisation engine from the finance domain; turn Home + Penny into an actual *prioritised* briefing ("3 things today"), finance-only at first. **This is the demo that wins, and it must come before more engines** — it's what converts "another finance tool" into "the digital COO," and it's precisely what FACTS's dashboards are not.

**Phase 2 — First non-finance domain into the briefing.** Add **enrollment** (read from the SIS) — because *"enrollment down 6 vs. plan"* + *"cash below target in November"* in one briefing is the cross-domain moment no competitor delivers, and it's directly on FACTS's turf where they still lack prioritisation. (Enrollment is also the lowest-integration-cost first expansion.)

**Phase 3 — Governance + Workflow primitives.** Grow **Governance** out from the existing board-packets into meetings/minutes/policies; this *requires* the first real **Workflow** primitives (tasks, approvals, reminders, document routing). Multi-school organizations and boards feel this acutely, and it deepens the governance white space competitors leave open.

**Phase 4 — Knowledge + the read-only domains.** Stand up the **Knowledge** engine (document store, accreditation evidence promoted from Readiness, search, institutional memory) and connect the remaining read-from-external domains — **HR, facilities, advancement** — as feeds into the briefing.

**Cross-cutting — solution packs.** The platform's identity is general; each market gets a pack — **independent schools, charter schools, private-school networks, dioceses, small colleges** — as configuration (org hierarchy, compliance rules, templates, report packages) over the same architecture. No single pack leads; the common wedge across all of them is **finance + multi-school consolidation**, the unclaimed white space.

**Sequencing principle:** hold every engine to "independently valuable before the next starts" (finance already passes). Resist the everything-platform sprawl — the failure mode is *shallow everywhere*. Win by being **deep on finance + the briefing**, then expand one domain at a time, each one making the briefing smarter.

---

## 10. The one test (unchanged)

Every feature, on any engine, must answer one question: **does this help leaders make better decisions?** If a proposed addition doesn't save time, improve a decision, strengthen accountability, preserve institutional knowledge, or reduce risk, it doesn't belong in the platform. Add one corollary from §8: *and is the engine it sits on already independently valuable, or does this feature make it so?*
