# Phase 4 — Analytics & Insights Dashboard (Implementation Plan)

**Status:** Draft for review · **Prepared:** June 2026 · **Depends on:** Phase 1 (complete)
**Does *not* depend on:** Phases 2, 3, or 5. Phase 5 (Benchmarking) depends on *this*.

---

## 1. Goal

Give each school an at-a-glance, **customizable** dashboard of the financial and operational
metrics that matter to *them* — turning the statements from once-a-year compliance documents
into ongoing operational insight a head of school / board can use.

## 2. Why it can come next (dependency summary)

- It reads numbers the **engine already produces** (statement snapshots from Phase 1C) — the
  reproducible, audited source of truth is already in place.
- The only genuinely new groundwork is capturing **two inputs that don't live in the trial
  balance**: student **enrollment** and **financial-aid / scholarship totals**.
- That operational data is **reused by Phase 2 (AUP scholarship reconciliation)** and
  **Phase 5 (peer benchmarking)** — so building it here is groundwork, not throwaway.

## 3. Two tiers of metrics (drives the sub-phase order)

| Tier | Needs new input? | Examples |
|---|---|---|
| **Financial-only** | No — derived purely from statements | Days cash on hand, operating margin, months of reserve, tuition dependency, revenue/expense mix |
| **Operational** | Yes — enrollment and/or aid | Cost per pupil, net tuition per student, aid per student, tuition discount rate, % of students on aid |

The financial-only tier can **ship immediately** with zero new inputs; the operational tier
lights up once enrollment/aid capture exists.

---

## 4. Architecture

### 4.1 A new pure package: `@finrep/analytics`
Mirrors the engine's discipline — **pure TypeScript, zero UI, zero IO, fully unit-tested,
deterministic**. It is the single source of metric truth.

```
metrics = computeMetrics({
  statements,        // the engine's computed statement output (or a stored snapshot)
  operational,       // { enrollment, enrollmentFte?, studentsOnAid?, financialAidTotal? }
  priorPeriods?,     // prior snapshots+operational for trend/PoP deltas
})
// -> { metricKey: { value, unit, basis, available, inputsMissing[], periodOverPeriodDelta } }
```

- Consumes the engine's output **types**, never re-derives statement math.
- A metric whose inputs are missing returns `available: false` + `inputsMissing` (so the UI can
  show a tiered "needs enrollment" empty state rather than a wrong/zero number).
- Each metric is a small pure function in a registry, so adding a metric = adding one entry +
  one test. This registry is also what powers Phase 5 benchmarking later.

### 4.2 Data model (Prisma — additive only)

**`period_operational_data`** — per `(school_id, fiscal_period_id)`, **mutable** reference data
(unlike immutable imports), audited via `audit_log` + `updated_by`/`updated_at`:
```
id                fiscal_period_id (FK)   school_id (FK)
enrollment              Int?              // headcount (primary)
enrollment_fte          Decimal?          // optional FTE
students_on_aid         Int?              // count receiving aid
financial_aid_total     Decimal?          // total aid / scholarship $ for the period
notes                   String?
updated_by_user_id      created_at        updated_at
@@unique([school_id, fiscal_period_id])
```

**`analytics_dashboard`** — per-school dashboard config (one row per school for Phase 4;
per-user customization deferred):
```
id   school_id (unique FK)
layout  Jsonb     // [{ metricKey, chart: 'value'|'spark'|'line'|'pie', order, span }]
updated_by_user_id   updated_at
```
*(If unset, the API returns a sensible default layout, so the dashboard works before anyone
customizes it.)*

### 4.3 API (NestJS) — RBAC + tenant-isolated, mirrors existing patterns
- `GET  /schools/:id/periods/:pid/metrics` — compute metrics for a period (snapshot + operational).
- `GET  /schools/:id/metrics/trends?metric=<key>` — a series across the school's periods.
- `PUT  /schools/:id/periods/:pid/operational` — save enrollment/aid *(owner/accountant)*.
- `GET  /schools/:id/operational` / per-period reads.
- `GET  /schools/:id/dashboard` · `PUT /schools/:id/dashboard` — read/save layout *(owner)*.
- **Entitlement:** analytics is a paid feature → reuse the Phase-1D entitlement gate on the
  compute/read endpoints (decision flagged in §6). Auth/settings/billing stay open as always.

### 4.4 Web (React)
- New `/analytics` (or `/dashboard`) route in the authed shell.
- **Metric cards**: big value + unit, period-over-period delta (▲/▼ with good/bad coloring per
  metric's "good direction"), a sparkline/trend, and a reserved slot for the Phase-5 benchmark.
- **Operational-data form** (per period): enrollment, FTE, students-on-aid, aid total — with the
  same tiered empty-state cue we use elsewhere ("Add enrollment to unlock cost-per-pupil").
- **Customize mode** (owner): toggle which metrics show, reorder, pick chart type; persists to
  `analytics_dashboard`.
- Navy/gold + framer-motion, RBAC-aware (viewers read-only; only owners customize).

---

## 5. Metric catalog (initial)

**Financial-only (Tier 1 — ships first, no new inputs):**
| Metric | Formula | Unit | Good |
|---|---|---|---|
| Operating margin | (Revenue − Expenses) / Revenue | % | higher |
| Days cash on hand | Cash / (cash operating expenses ÷ 365) | days | higher |
| Months of operating reserve | Unrestricted net assets / (annual op-ex ÷ 12) | months | higher |
| Tuition dependency | Tuition & fees / Total revenue | % | context |
| Revenue mix | each revenue category / total | % (pie) | — |
| Expense mix (program vs admin vs fundraising) | each category / total expense | % (pie) | — |

**Operational (Tier 2 — needs enrollment/aid):**
| Metric | Formula | Unit | Good |
|---|---|---|---|
| Cost per pupil | Total operating expenses / enrollment | $ | context |
| Net tuition per student | (Gross tuition − aid) / enrollment | $ | higher |
| Financial aid per student | Aid total / enrollment | $ | context |
| Aid per *aided* student | Aid total / students-on-aid | $ | context |
| Tuition discount rate | Aid total / gross tuition | % | lower |
| % of students on aid | Students-on-aid / enrollment | % | context |

*Liquidity ratios that need current/non-current balance-sheet classification (e.g. current
ratio) are deferred until we confirm the chart of accounts carries that granularity.*

All metrics support a **trend across periods** (Phase 1C history already gives us multiple
snapshots) and a **period-over-period delta**.

---

## 6. Confirmed decisions ✅

1. **Enrollment basis** — **headcount as the primary number, with an optional FTE field.**
2. **Aid metrics** — show **all three**: aid per *enrolled* student, aid per *aided* student,
   and the **tuition discount rate** (aid ÷ gross tuition).
3. **Access** — **analytics is included for every customer** (active subscription *or* live trial).
   There is **no free tier beyond the trial** and **no separate analytics paywall** — it's gated
   by the *same* Phase-1D entitlement check as generate/save (active OR trialing), nothing extra.
4. **Customization scope** — per-school dashboard config for Phase 4; per-user layouts deferred.

---

## 7. Suggested sub-phase sequence

- **4A — Financial-only dashboard:** `@finrep/analytics` package + Tier-1 metrics + metrics/trends
  API + dashboard with default layout. **Ships value with zero new inputs.**
- **4B — Operational data:** `period_operational_data` model + intake form + Tier-2 metrics
  (cost per pupil, aid metrics, discount rate). *(This is the groundwork Phases 2 & 5 reuse.)*
- **4C — Customizable dashboard:** choose/reorder metrics, chart types, saved per-school layout.
- *(Future 4D: push selected metrics into the Phase-3 board packet.)*

## 8. Definition of done

- `@finrep/analytics` is pure + unit-tested; engine stays untouched; all existing tests green.
- Metrics are reproducible from a stored snapshot + operational data (same inputs → same numbers).
- Additive migrations only; RBAC + tenant isolation enforced; entitlement gate applied per §6.
- Sample data unchanged; Phases 1A–1D behavior intact; web builds; typecheck + lint clean.
