# Roadmap — Phase by Phase

**For:** the internal team and development partners · companion to [Platform_Architecture_Overview_v5.md](./Platform_Architecture_Overview_v5.md) and [Competitive_Landscape_June2026.md](./Competitive_Landscape_June2026.md)

**How to read this.** Phases are sequenced by **dependency and value, gated by a "definition of done"** — not by dates. (Dates need a team size + timeline, which we can layer on; see *Decisions needed* at the end.) Each phase is independently shippable and leaves the product more valuable than it found it. The order encodes one strong opinion from the competitive scan: **build the prioritised briefing early — depth on the differentiator before breadth across domains.**

---

## Guiding principles

1. **Depth before breadth.** The failure mode of an "everything platform" is *shallow everywhere*. Be the category-best at finance + the briefing first; then add one domain at a time.
2. **Every engine independently valuable.** No engine starts until the prior one passes "would a school pay for just this?" (Finance already does.)
3. **The briefing is the moat, the semantic layer is its foundation.** Competitors have finance, governance, dashboards. None have a *prioritised, role-shaped, cross-domain briefing* built on a *canonical metric layer*. Build that early and protect it.
4. **Multi-school organizations are the core market.** Districts, networks, systems and dioceses — wherever finance + multi-school consolidation pain is sharpest and where the scan found the consolidation white space largest. The wedge is **finance + multi-school consolidation**, generally — not specific to any one segment.
5. **The one test, on every feature:** *does this help a leader make a better decision?* — and *does it make its engine independently valuable?*

---

## Current state (precise inventory, June 2026)

| Engine / layer | Built today | Honest gap |
|---|---|---|
| **Financial (vertical)** | **~80%.** Data hub (sources incl. **QBO** connector), mapping/normalisation, Statements (validation + reconciliation + reporting), Budget (+ forecast, budget-vs-actual, **multi-school roll-up**), **Monthly actuals**, Reports + **Board packets**, period history | deepen QBO sync; promote multi-school consolidation from "budget roll-up" to full financials as a headline |
| **Intelligence + semantic layer** | **Seeded, real structure.** `packages/analytics`: a **metric registry** (`METRIC_KEYS`, `MetricMeta`), **health bands** (`bandsFor`/`healthStatus`), **insight generator**, `operational` analytics, dashboard layout; **Penny** assistant with an agent toolset (navigate · import_trial_balance · generate_board_narrative · readiness) | metrics are **finance-only**; not yet **canonical/cross-domain**; **no prioritisation engine**; Home isn't yet the prioritised briefing |
| **Readiness / audit-compliance** | **Substantial.** checklist, compliance-inputs, reconciliation, disbursements, **workpapers**, **corrective-action plans** | sits between Knowledge (evidence) and Governance; not yet promoted into either engine or the briefing |
| **Planning (vertical)** | **Partial** — Budget + forecast (the finance slice) | strategic plan, improvement plans, facilities/capital, progress tracking |
| **Governance (vertical)** | **Board packets only** | boards/committees, meetings/agendas, minutes/decisions, policy register |
| **Workflow (horizontal)** | **Thin** — Schedules + report-schedule (recurring) | tasks, approvals/sign-offs, reminders, document routing |
| **Knowledge (horizontal)** | **Thin** — Readiness evidence seed | document store, templates, institutional memory, search |
| **Org / multi-school** | Organizations module + multi-school rollup (budget) | full multi-school financial consolidation + scope-as-boundary roll-ups |

**Read:** the finance engine and the *scaffolding* of the intelligence layer already exist. The next unit of work is not "more finance" — it's **turning the seeds (registry + Penny) into the prioritised briefing.**

---

## The phases

Each phase uses the same template: **Thesis · Scope (with current-state delta) · Unlocks · Dependencies · Definition of Done · Risks.**

### Phase 0 — Finish the financial wedge + multi-school consolidation *(in progress)*

- **Thesis.** The wedge must sell on its own and produce the trusted data everything else reads. It nearly does.
- **Scope.**
  - Deepen the **QBO** sync (toward "sync everything" — GL, classes/locations, AR/AP) and harden re-sync/idempotency.
  - Promote **multi-school consolidation** from budget roll-up to **full consolidated financials** across schools (the multi-school roll-up pattern, extended to statements + cash).
  - Close audit-trail gaps so every figure traces to source (this is also a Phase-1 prerequisite).
- **Unlocks.** A multi-school organization connects N schools' QBO → normalised, trusted statements per school + a consolidated organization-wide view + board packets.
- **Dependencies.** None (foundational).
- **Definition of done.** A design-partner organization (district/network/diocese) runs month-end on the platform: per-school statements + consolidated organization financials + a board packet, every number traceable, with no spreadsheet step.
- **Risks.** QBO API edge cases (chart-of-accounts variety) → lean on the existing mapping/normalisation layer and the inline "resolve unmatched" flow.

### Phase 1 — The semantic layer + the real prioritised briefing *(do next — the differentiator)*

- **Thesis.** Convert "another finance tool" into **the digital COO.** This is the winning demo and precisely what FACTS's "decision-ready dashboards" are *not* (dashboards show; a briefing decides). Build it while the only domain is finance — the *mechanism* is domain-agnostic, so later domains plug in.
- **Scope (delta over what exists).**
  1. **Promote the metric registry → a canonical semantic layer.** Formalise `MetricMeta` so each figure is defined *once*: formula, inputs, owning domain, **scope-aggregation rule** (how it rolls up school→organization→system), thresholds (reuse `health.js` bands), and **lineage to source**. Everything — modules, reports, briefing — reads from here.
  2. **Build the prioritisation/alert engine** (new). Turn metric *states* + deadlines + (later) workflow status into **ranked attention items**: "below target in November," "behind schedule." Health bands already classify; add *ranking* + *"needs a decision today."*
  3. **Ship the briefing surface.** Turn Home + Penny into *"Good morning. Three things require your attention."* Penny already navigates and acts — now she **explains and prioritises**. Apply **Scope × Lens** using the existing RBAC/roles so principal / finance-director / superintendent each get the correct, role-bounded briefing from the same figures.
- **Unlocks.** The digital-COO demo; role-shaped briefings; and the moat — one canonical, cross-readable metric layer ("two people never see disagreeing numbers").
- **Dependencies.** Phase 0 audit trail; existing registry/health/insight + Penny toolset.
- **Definition of done.** A superintendent logs in and sees a **prioritised, role-correct briefing** assembled from finance metrics + deadlines; each item is explained and actionable (Penny can act on it); and a spot-check confirms the same metric shows an identical value in the briefing, the dashboard, and the report.
- **Risks.** Prioritisation feels arbitrary → make ranking *explainable* ("flagged because cash dips below 60 days in Nov"), tune with the design partner. Scope creep into new domains → resist; finance-only is fine for the gate.

### Phase 2 — First non-finance domain into the briefing: **Enrollment**

- **Thesis.** The cross-domain moment — *"enrollment down 6 vs. plan"* **and** *"cash below target in November"* in one briefing — is what no competitor delivers, and it lands directly on FACTS's turf while they still ship dashboards. Enrollment is also the **lowest-integration-cost** first expansion (read from the SIS) and the highest leader-decision value (it drives tuition → cash).
- **Scope.** SIS read-connectors (enrolled / projected / lost); enrollment metrics into the canonical registry (vs. plan, attrition, yield); **link enrollment → tuition revenue → cash forecast** so the briefing can reason across the two domains. Write-back deferred.
- **Unlocks.** The first genuinely *cross-domain* briefing item; proof the Phase-1 mechanism generalises.
- **Dependencies.** Phase 1 semantic layer + briefing; ≥1 SIS connector (pick the one your design-partner organization uses).
- **Definition of done.** Enrollment metrics live in the same canonical layer as finance; the briefing shows a cross-domain item linking enrollment to cash; works against a real SIS for the design partner.
- **Risks.** SIS API fragmentation → start with one SIS, generalise later; treat enrollment as read-only first.

### Phase 3 — Governance engine + Workflow primitives

- **Thesis.** Board packets already exist; multi-school organizations and boards feel governance pain acutely; and governance *requires* the first real workflow primitives — so these ship together.
- **Scope.**
  - **Governance:** boards/committees (structure, membership, terms), meetings/agendas, minutes/decisions, policy register with review cycles — grown up from the existing board-packet generator.
  - **Workflow:** tasks, approvals/sign-offs, reminders/deadlines, document routing; generalise the existing schedules/report-schedule into the workflow engine.
  - **Feed the briefing:** "board packet 92% complete," "committee chair hasn't approved the minutes," "3 policies need review before accreditation."
- **Unlocks.** The board-meeting half of the Monday-morning screen; approvals that route to the right person.
- **Dependencies.** Phase 1 (briefing reads governance/workflow state); board-report module as the seed.
- **Definition of done.** A board packet assembles from *live* governance + workflow state (not a one-off export); the briefing surfaces governance attention items; an approval routes and records who decided.
- **Risks.** Governance is configuration-heavy per institution → drive it through solution packs, not hard-coding.

### Phase 4 — Knowledge engine + the read-only domains (HR · Facilities · Advancement)

- **Thesis.** The institution's memory, plus the remaining domains connected as feeds — completing the eight-domain briefing.
- **Scope.**
  - **Knowledge:** document store, templates, **accreditation evidence promoted from the existing Readiness/compliance module** (workpapers + CAP already exist), institutional memory, and **search across the platform.**
  - **Connect read-only domains:** HR (HRIS — staffing, contracts, cost), facilities (maintenance, capital), advancement (donor CRM) → metrics into the registry → briefing.
- **Unlocks.** Search finds anything; accreditation evidence accrues from daily operations (a major pain for independent and accredited schools); all eight domains feed ≥1 briefing indicator — the full digital COO.
- **Dependencies.** Phases 1–3; Readiness module (evidence seed); workflow (routing docs into knowledge).
- **Definition of done.** Every one of the eight domains feeds at least one briefing indicator; accreditation evidence is captured as a by-product of operations; platform-wide search works.
- **Risks.** Read-only domains add integration surface → integrate only what the briefing needs; don't rebuild the source systems.

---

## Cross-cutting tracks (run in parallel across all phases)

| Track | What it is | Cadence |
|---|---|---|
| **Semantic layer** | Every new domain adds canonical metrics + scope-aggregation rules to the registry. The layer *is* the product's compounding asset. | every phase |
| **Modularisation** | Core platform vs **licensable modules** + the plug-in registration contract + **per-module entitlement** (extend the existing binary billing). Established in **Phase 1** so Finance is the first proven module and every later engine is pluggable + independently sellable from day one. See *Packaging & per-module pricing* below. | establish Phase 1, then every module |
| **Solution packs** | Config over one architecture: org hierarchy, compliance rules, templates, report packages. The platform is general; equal packs for **independent schools, charter schools, private-school networks, dioceses, small colleges** — no single pack leads. | start with the first design-partner's segment in Phase 0; others as demand pulls |
| **Trust, RBAC & audit** | Scope-as-boundary (you see only your entitlement), full audit trail, security posture (SOC 2 track) as you reach organization scale. | continuous |
| **Positioning / GTM** | Lead with the two unclaimed things — **the briefing** and **multi-school consolidation** — finance as proof. Core market is multi-school organizations (districts, networks, systems, dioceses). Land a design-partner organization early; expand school-by-school. | continuous |

---

## Packaging & per-module pricing

The platform is **modular**: a school can license **only the modules it wants** (e.g. just Finance), at **price tiers per module**, and each module runs standalone *or* plugs into the whole. (Full model in [Platform_Architecture_Overview_v5.md §7](./Platform_Architecture_Overview_v5.md).)

**Core (always included — the base price):** identity/RBAC/org, the semantic/metric layer, the intelligence/briefing shell, Workflow + Knowledge. Cannot be unbundled.
**Modules (licensed à la carte):** Finance · Planning · Governance · the read-domain connectors (Enrollment, HR, Facilities, Advancement, Accreditation).

**The entitlement change (an extension, not a rebuild).** Today: binary — `isEntitled(schoolId) → true/false`, one `plan` per school, `EntitlementGuard → 402`. Target:
- `Subscription` carries a **set of licensed modules** (+ a tier per module), not a single plan.
- `isEntitled(school, module)` + a **module-aware guard**; each module's routes declare the entitlement key they need.
- **per-module Stripe prices/line-items**; the core is the base subscription.
- a module **registration contract** so enabling a module lights up exactly its metrics, briefing items, nav and routes.

**Build it as a modular monolith** — clean module boundaries (mostly already there) + entitlement-gated feature flags — *not* a runtime plugin system. Independent licensing + standalone operation without microservices cost; extract a module to its own service later only if scale demands.

**Why per-module pricing fits the architecture:** the briefing's value scales with how many modules you own (finance-only briefing → add Enrollment → cross-domain → add Governance → fuller COO). That's the **built-in upsell engine** — pricing and architecture reinforce each other.

---

## One-page summary

| Phase | Thesis | Headline deliverable | Done when… |
|---|---|---|---|
| **0** | Finish the wedge | Trusted per-school + **consolidated multi-school** financials, board packets | a multi-school organization runs month-end with no spreadsheet step |
| **1** | **Make it the COO** | **Semantic layer + prioritised briefing** (finance-only) | a superintendent gets a role-correct "3 things today," numbers tie out everywhere |
| **2** | First cross-domain | **Enrollment** into the briefing | briefing links "enrollment vs plan" ↔ "cash below target" |
| **3** | Board half | **Governance + Workflow** | board packet from live state; approvals route; governance items in the briefing |
| **4** | Full COO | **Knowledge + HR/Facilities/Advancement** | all 8 domains feed the briefing; accreditation evidence accrues; search works |

---

## Why this order (tied to the competitive scan)

- **Semantic layer + briefing before more domains (Phase 1 before 2–4):** the scan confirms *no one* ships the prioritised cross-domain briefing — that's the differentiator, and FACTS (the biggest threat) is racing to add an "intelligence layer." Owning the *leadership* layer early, even finance-only, is the defensible move; more domains without it is just another suite.
- **Enrollment as the first non-finance domain (Phase 2):** it produces the cross-domain briefing moment on FACTS's home turf, at the lowest integration cost.
- **Multi-school consolidation as a constant headline:** the scan found it "largely unclaimed" by the SIS/suite incumbents (the tool that surfaces for the diocesan slice is ParishSOFT, a separate parish vendor) — so it's both a wedge and a differentiator, not a phase.
- **Governance/Knowledge later (Phases 3–4):** real value, but they're where competitors *do* exist (BoardEffect, Weave/Watermark) — so they're expansion, not the spearhead.

---

## Decisions needed (to turn this into a dated plan)

1. **Team size + target timeline** — so phases map to quarters and we can parallelise tracks honestly.
2. **First design-partner organization** (district / network / diocese) — anchors Phase 0–1 DoD and the first SIS to support (Phase 2), and which solution pack ships first.
3. **Build-vs-integrate per non-finance domain** — confirm enrollment-first, and which SIS / HRIS / donor CRM to connect first.
4. **How many solution packs to stand up early** before the briefing is proven (recommendation: don't spread — prove the wedge with the first design partner's segment, then templatise the rest as equal packs).
5. **Module boundaries + price tiers** — confirm the licensable-module list (Finance · Planning · Governance · Enrollment · HR · Facilities · Advancement · Accreditation), what's in the always-on core, and the tier/price per module. Needed before the Phase-1 entitlement work so the model is right the first time.
