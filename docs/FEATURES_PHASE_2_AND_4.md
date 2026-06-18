# FinRep — Feature Guide: Analytics (Phase 4) & AUP Readiness (Phase 2)

### A detailed walkthrough of everything shipped in the Analytics & Insights dashboard and the AUP / Year-End Readiness module

**Prepared:** June 2026 · **Audience:** product, leadership, and prospective school customers · **Companion to:** `PROJECT_OVERVIEW.md`

---

## How to read this document

This guide documents two completed modules that sit on top of FinRep's proven financial engine:

- **Phase 4 — Analytics & Insights Dashboard** (`/analytics`): turns the saved statements into an at-a-glance, customizable view of a school's financial and operational health.
- **Phase 2 — AUP Readiness & Year-End Review** (`/readiness`): helps a Florida private school prepare for its mandatory scholarship-compliance review (the Agreed-Upon Procedures, or "AUP") and its year-end financial review.

Two design principles run through both modules and are worth stating once:

1. **The logic lives in sealed, testable "engines."** The analytics metrics and the compliance rules are each implemented as a **pure, deterministic library** (`@finrep/analytics`, `@finrep/compliance`) — the same inputs always produce the same outputs, with no hidden state, clock, or randomness. Every metric and rule is unit-tested.
2. **Everything reads from the reproducible snapshot.** Both modules consume the *saved* statement snapshot the engine already produced; they never re-invent or silently re-compute the underlying numbers.

> Every screen is permission-aware (Owner / Accountant / Viewer) and tied to an active subscription or live trial. Viewers can always *read*; editing and generation require the right role and an entitled account.

---

# Part I — Phase 4: Analytics & Insights Dashboard

**What it is:** a per-school dashboard (`/analytics`) that converts the statements into living operational insight — with health-graded metrics, trends, drill-downs, an AI summary, and a layout each school can tailor. Delivered in four slices (4A–4D).

## 1. The metric catalog

Metrics come in two tiers. **Financial-only** metrics derive purely from the statements (available immediately). **Operational** metrics also need two inputs that don't live in a trial balance — enrollment and financial-aid totals — entered once per period.

### Tier 1 — Financial metrics (no extra input required)

| Metric | Formula | Unit |
|---|---|---|
| **Operating Margin** | (Total revenue − Total expenses) ÷ Total revenue | percent |
| **Days Cash on Hand** | Cash ÷ (Total expenses ÷ 365) | days |
| **Months of Operating Reserve** | Unrestricted net assets ÷ (Total expenses ÷ 12) | months |
| **Tuition Dependency** | Tuition & fees ÷ Total revenue | percent |
| **Revenue Mix** | Each revenue category ÷ Total revenue | share (donut) |
| **Expense Mix** | Each expense category ÷ Total expenses | share (donut) |

### Tier 2 — Operational metrics (need enrollment / aid)

| Metric | Formula | Unit |
|---|---|---|
| **Cost per Pupil** | Total expenses ÷ Enrollment | currency |
| **Net Tuition per Student** | (Gross tuition − Financial aid) ÷ Enrollment | currency |
| **Aid per Enrolled Student** | Financial aid ÷ Enrollment | currency |
| **Aid per Aided Student** | Financial aid ÷ Students on aid | currency |
| **Tuition Discount Rate** | Financial aid ÷ Gross tuition | percent |
| **% of Students on Aid** | Students on aid ÷ Enrollment | percent |

**Honesty contract:** when a metric's inputs are missing (e.g. enrollment not yet entered), the metric reports **"needs data"** with the exact missing input named — never a misleading zero.

## 2. Health status & targets (4D)

Five ratio metrics are graded **good / watch / risk** against sensible private-school sector targets (tunable later; defaults shown). The other metrics are **neutral** — shown with their trend, but no universal good/bad coloring.

| Metric | Direction | Good | Watch | Risk |
|---|---|---|---|---|
| Operating Margin | higher better | ≥ 3% | 0–3% | < 0% |
| Days Cash on Hand | higher better | ≥ 60 | 30–60 | < 30 |
| Months of Operating Reserve | higher better | ≥ 6 | 3–6 | < 3 |
| Tuition Dependency | lower better | ≤ 70% | 70–85% | > 85% |
| Tuition Discount Rate | lower better | ≤ 20% | 20–35% | > 35% |

## 3. What each slice delivered

**4A — Financial dashboard.** The `@finrep/analytics` engine + the Tier-1 metric cards (animated value, period-over-period delta, sparkline), the revenue/expense donuts, and a multi-period trend chart — all computed from the saved snapshot.

**4B — Operational data + Tier-2 metrics.** A per-period intake for **enrollment** (headcount + optional FTE), **students on aid**, and **financial-aid total**, which lights up the six Tier-2 metrics (cost per pupil, the aid metrics, the discount rate, % on aid). These same inputs feed the Phase-2 compliance checks.

**4C — Per-school customization.** An Owner-only **Customize mode**: show/hide metrics, drag to reorder, choose a chart variant, and set card width — saved per school and applied for everyone. When nothing is customized, a sensible default layout is shown.

**4D — Redesign & intelligence layer.** A cleaner "hero vitals + grouped sections" layout with:
- **Hero tiles** for the financial-health vitals, color-graded by status;
- a **drill-down drawer** — click any metric to see its full trend, its **formula**, and the exact input values feeding it;
- an **AI insight line** — a plain-language summary of what changed and what to watch (e.g. *"Tuition dependency remains high at 87% — the top priority to address"*). It works out of the box with a deterministic, rule-based generator and can be upgraded to a Claude-written narrative by supplying an API key;
- **freshness cues** — a context bar showing the active period, *"data as of"* the snapshot date, and how recently it was updated.

> **Access:** analytics is included for every customer on an active subscription or live trial — there is no separate analytics paywall. Owners customize; Accountants and Viewers see the configured layout read-only.

---

# Part II — Phase 2: AUP Readiness & Year-End Review

**What it is:** a **Review Readiness** workspace (`/readiness`) that mirrors the published Step Up For Students Agreed-Upon-Procedures template and the governing Florida statutes, so a school can self-check **before** its CPA engagement and hand the reviewer a clean packet.

> **Framing (shown prominently in-app):** this is a **readiness pre-flag** — it is **not** the official AUP submission and **not** legal or audit advice. Every rule is grounded in cited statute/template language (see `PHASE_2_AUP_RESEARCH.md`).

## 1. The trigger and the framework

- **Who must do the AUP:** a participating private school that receives **more than $250,000** in aggregate scholarship funds (across FTC, FES-EO, FES-UA) in a school year must engage a CPA to perform the AUP and file the report by **September 15**.
- **Six AUP sections** organize every check: **I** School Eligibility · **II** Accounting System · **III** Financial Controls · **IV** Deposit & Classification of Scholarship Funds · **V** Education-Related Expenses · **VI** Tuition / Operating Term / Attendance (plus an **Eligibility** gate).
- **Two severities:** a **Reportable** exception, and a **Material** exception (the same reportable issue three years running) — a Material exception **requires a Corrective Action Plan**, and repeated ones can render the school ineligible.
- **Versioned, not hard-coded:** the rule set is stamped `fl-scholarship-aup v2025.1` (statute year 2024) and pinned by program tier, so a procedure change is a version bump — not a code rewrite.

## 2. 2A — Exception pre-flagging (the rules engine)

Thirteen checks run against each period. Each carries a **status** (pass / reportable / material / needs-data / manual / not-applicable), a **severity**, a **kind** (auto = from the statements; intake = from a short attestation; checklist = document the CPA will sample), and its **citation**.

| Rule | § | What it checks | Severity | Kind | Citation |
|---|---|---|---|---|---|
| $250,000 AUP trigger | V | Scholarship funds received > $250k → AUP required (due Sep 15) | info | intake | s.1002.421(1)(q) |
| Trial balance balances | II | Self-balancing system produces a balanced TB | reportable | auto | AUP §II |
| Education expenses ≥ scholarships | V | Total education expenses ≥ scholarship funds received | reportable | auto | AUP §V |
| Non-education expenses flagged | V | Athletics / student activities / transportation / food can't count toward coverage | reportable | auto | AUP §V |
| Funds at insured institution | III | Scholarship funds at an FDIC/NCUA-insured bank | reportable | intake | AUP §III.A |
| Bank-rating review > $250k | III | If avg balance > $250k, bank rating reviewed (top two) | reportable | intake | AUP §III.A |
| 60-day bank reconciliation | III | Reconciled within 60 days **and** independently reviewed | **material** | intake | AUP §III.B |
| Scholarship deposit tracing | IV | Sample of ACH payments traced to deposits / GL / student accounts | reportable | checklist | AUP §IV |
| DOE status "approved" | I | DOE compliance/approval status is "approved" | reportable | intake | §I; s.1002.395(2)(i) |
| Operated ≥ 3 years or surety bond | ELIG | 3+ school years, else a surety bond / LOC posted | gate | intake | s.1002.421(1)(f)1. |
| FES-UA $50,000 cap | ELIG | No FES-UA ESA balance over $50,000 *(UA tier only)* | reportable | intake | s.1002.394(12)(b)11. |
| FES-UA dormancy / closure | ELIG | Dormant-account closure rules *(UA tier only)* | reportable | checklist | s.1002.394(5)(b)3. |
| Prudential red flags | VI | Negative net assets / cash, operating deficit, low days-cash | watch | auto | prudential |

**The compliance intake** collects the handful of attestation facts that aren't in a trial balance, so most sections produce a real verdict: scholarship funds received, programs, funds-at-insured-institution, avg-balance-over-$250k, bank-rating-reviewed, reconciled-within-60-days, independently-reviewed, DOE-approved, years-in-operation, surety-bond-posted, and the FES-UA over-$50k flag. **Tier scoping:** FES-UA rules report *not applicable* unless the school participates in FES-UA.

The **Review Readiness panel** shows the six sections with color-graded status badges, citations, the $250k trigger banner, a program-tier selector, and an overall summary with a **"Material → Corrective Action Plan needed"** callout.

## 3. 2B — Scholarship reconciliation

Addresses AUP **Section IV** at the disbursement-vs-recorded level:

- **Upload** the funding organization's disbursement records (CSV/XLSX, parsed in-browser) with a flexible **column-mapping** step (funding-org headers vary), or add rows manually.
- The engine produces **total disbursed**, **per-program** and **per-month** breakdowns, and reconciles against the recorded scholarship revenue → a **matched / variance / needs-data** verdict (tolerance: the greater of $1 or 0.5%).
- **Anomaly detection:** duplicates, negative amounts, zero amounts, dates outside the period, unknown program, missing amount.
- A one-click **"use disbursed total as recorded scholarship revenue"** keeps 2A and 2B consistent and feeds the $250k trigger with real data.

## 4. 2C — Year-end checklist + workpapers packet

- **Guided checklist:** one procedure item per AUP rule (grouped by section, each with its citation) **plus** a fixed **document-gathering list** (bank statements + reconciliations, DOE approval letter, disbursement records, student subledgers, GL/trial balance, prior-year AUP + CAP, surety bond if applicable). Each item is marked *pending / done / n-a* with notes, and a progress meter distinguishes "done" from "n/a" so a school can't accidentally look ready.
- **Workpapers packet:** a one-click, print-ready document that **aggregates everything** for the reviewer — a cover (school, period, ruleset version, prepared date, disclaimer), the **statements**, the **reconciliation schedule**, the **compliance findings schedule**, and the **Corrective Action Plan**. It reads the saved snapshot — it never re-computes the statement math.

## 5. 2D — Corrective Action Plan scaffolding

- Every **material** (and, optionally, reportable) finding **auto-scaffolds** a CAP entry pre-filled from a per-rule, AUP-grounded template — e.g. the 60-day-reconciliation finding pre-fills *"Implement a documented monthly bank-reconciliation process completed within 60 days of month-end and independently reviewed…"*
- Each entry is **editable** (root cause, corrective action, responsible party, target date) with a **status** (open / in progress / complete) and **persists**.
- Entries **self-resolve**: when the underlying finding clears (e.g. reconciliation is now within 60 days), the entry is flagged resolved rather than deleted, preserving the record.
- The CAP **exports** to a clean, print-ready document with the readiness disclaimer.

---

## Cross-cutting characteristics

- **Security & tenancy.** Every endpoint is role-gated (Owner / Accountant / Viewer), scoped to the school, and tied to an active subscription or live trial (a lapsed account is paused with a friendly prompt, never a raw error). Malformed identifiers are rejected cleanly.
- **Reproducibility.** Metrics, rules, reconciliation, and CAP scaffolding are all pure and deterministic — re-running on the same inputs yields byte-identical results. The frozen financial engine is never modified by these modules.
- **Consistent, on-brand UI.** Both modules share the navy/gold design language, animated-but-tasteful motion (respecting reduced-motion preferences), and a consistent good/watch/risk status palette.
- **Export.** Results print to clean PDF documents (the analytics drawer, the CAP, and the workpapers packet), and the underlying statements export to PDF/Excel as before.

## What these modules intentionally leave for later

- **Automatic disbursement pull.** Phase 2B ingests an uploaded funding-org file; the *automatic* connector to the scholarship system (e.g. Step Up For Students) is **Phase 6 — Integrations**.
- **Per-student bank-deposit tracing.** The deepest AUP §IV procedure (sampling individual ACH payments to bank deposits and student subledgers) remains a **checklist** item, since it needs bank/subledger data the product doesn't yet hold.
- **Live AI narration.** The AI insight runs on a deterministic generator by default; richer Claude-written narratives activate when an API key is configured.

---

*This document reflects the state of FinRep as of June 2026: Phases 1, 4, and 2 complete. It is generated from `docs/FEATURES_PHASE_2_AND_4.md` via `scripts/md-to-pdf.py` (run with `python3.10`). The compliance content is a readiness aid grounded in cited Florida statutes and the published AUP template — it is not the official AUP submission or legal/audit advice.*
