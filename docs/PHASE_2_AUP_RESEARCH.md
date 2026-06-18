# Phase 2 — Florida Scholarship AUP: Research Findings & Rule Set

**Prepared:** June 2026 · **Status:** Research complete; grounds the Phase-2A exception-pre-flagging engine
**Method:** Multi-source web research with adversarial 3-vote verification per claim (almost all 3-0).

> ⚠️ This is a *readiness/pre-flag* aid, **not** the official AUP and not legal/audit advice. It mirrors the
> published Step Up For Students (SUFS) AUP template + the governing statutes so a school can self-check
> before its CPA engagement. Citations are pinned to a statute **year** because subsection letters shifted
> after the 2023 FES consolidation.

## 1. The big picture (who must do what, when)

- Programs: **Florida Tax Credit (FTC, s.1002.395)**, **Family Empowerment – Educational Opportunity
  (FES-EO, s.1002.394)**, and **FES – Unique Abilities (FES-UA, s.1002.394, ESA tier)**, administered by
  **Step Up For Students (SUFS)** under **FLDOE** oversight.
- **AUP trigger:** once a participating private school receives **> $250,000 aggregate** scholarship dollars
  across covered programs in a school year, it must engage a **currently-licensed CPA** (firm licensed for
  attest engagements) to perform a standardized **Agreed-Upon Procedures (AUP)** engagement and submit the
  **AUP report by September 15** to the SFO that awarded the majority of its funds. *(Deliverable is an AUP
  attestation report — NOT a general-purpose financial-statement audit.)* — s.1002.421(1)(q).
- **Severity model:** findings are **Reportable Exceptions** or **Material Exceptions**. A Material Exception
  (a "same/substantially-same reportable exception in 3 consecutive years") requires a **Corrective Action
  Plan** forwarded to DOE; consecutive material exceptions empower the **Commissioner** to deem the school
  **ineligible** (discretionary "may").
- **Version boundary:** **HB 1 (2023), Ch. 2023-16, effective July 1, 2023** created universal eligibility and
  renumbered subsections → pin every rule to a statute year + program tier. AUP threshold + surety-bond rules
  live in **s.1002.421**; AUP procedure *content* derives from **s.1002.395(6)(q)/(o)**; FES cross-references
  s.1002.421 via s.1002.394(9)(a).

## 2. The AUP's six sections (our rule categories)

| § | Section | Inspects |
|---|---|---|
| I | School Eligibility | DOE compliance/approval letters showing "approved" |
| II | Accounting System | self-balancing software producing TB / financials / student subledgers |
| III | Financial Controls | bank balances, reconciliations, non-education expenses, internal controls, budget |
| IV | Deposit & Classification of Scholarship Funds | scholarship deposits traced & classified |
| V | Education-Related Expenses | scholarship funds spent on allowable education expenses |
| VI | Tuition, Operating Term & Attendance | enrollment/attendance/operating-term |

## 3. Verified checkable requirements → candidate rules

Each rule notes **[AUTO]** (evaluatable from data we already have), **[INTAKE]** (needs a few simple
attestation inputs we can collect), or **[CHECKLIST]** (document-dependent — we surface what the CPA will
need, not a pass/fail).

| Rule | Condition | Severity | Kind | Cite |
|---|---|---|---|---|
| **AUP trigger** | scholarship funds received > $250,000 → AUP required this year (due Sep 15) | info/required | AUTO/INTAKE | s.1002.421(1)(q) |
| **§II balanced books** | trial balance must balance / self-balancing system | Reportable | **AUTO** (engine already proves this) | §II |
| **§V expenses ≥ scholarships** | total education-related expenses ≥ scholarship funds received; excess needs written justification | Reportable | AUTO/INTAKE | §V |
| **§V non-education expenses** | extracurriculars, after-school athletics/programs/events, after-school care, transportation are NOT education-related | Reportable | **AUTO** (flag those expense categories) | §V |
| **§IV scholarship deposit tracing** | sample of 10 students or 5% (greater): scholarship ACH (a) deposited to bank, (b) posted to GL as tuition/books/fees, (c) posted to student accounts | Reportable | **CHECKLIST** (needs student subledger/bank data) | §IV |
| **§III FDIC/NCUA institution** | scholarship funds held at a federally-insured institution | Reportable | INTAKE | §III.A |
| **§III bank-rating review** | if avg daily balance > $250k FDIC limit, annual review of bank rating (Bauer/Fitch/Moody's/S&P) in top two | Reportable | INTAKE | §III.A |
| **§III 60-day reconciliation** | bank statements reconciled within 60 days of month-end + independently reviewed | **Material → CAP** | INTAKE | §III.B |
| **§I DOE approval** | DOE status shows "approved" (not suspended/revoked) | Reportable | INTAKE/CHECKLIST | §I; s.1002.395(2)(i) |
| **Eligibility: 3-yr / surety bond** | operated ≥ 3 school years OR posted surety bond/LOC = one quarter's scholarship funds | gate | INTAKE | s.1002.421(1)(f)1. |
| **General red flags** | negative net assets, negative cash, operating deficit, very low days-cash, going-concern | watch | **AUTO** (from our analytics) | prudential |
| **FES-UA $50k cap** *(UA tier only)* | no transfer into an ESA whose balance already exceeds $50,000 | Reportable | INTAKE/CHECKLIST | s.1002.394(12)(b)11. |
| **FES-UA dormancy/closure** *(UA tier only)* | close & revert after 3 yrs post-HS without eligible enrollment, or 2 consecutive fiscal years inactive | Reportable | CHECKLIST | s.1002.394(5)(b)3. |
| **FES-EO 14-day payment** *(SFO-level, EO only — context)* | SUFS initiates payment within 14 days of FDOE receipt | n/a (SFO duty) | CONTEXT | SBE 6A-6.0952 |
| **SFO 3% admin cap** *(SFO-level — context)* | SFO admin expenses ≤ 3% of contributions; separate accounts | n/a (SFO duty) | CONTEXT | s.1002.395(6)(m),(l)1. |

*Tier scoping:* FES-UA rules must NOT fire on FTC/FES-EO tuition-only schools. SFO-level items are background, not per-school checks.

## 4. Sources
- SUFS AUP program page & template — https://www.stepupforstudents.org/schools-and-providers/agreed-upon-procedures/
- SUFS AUP Webinar (six sections, verbatim checks) — go.stepupforstudents.org/hubfs/Website/AUP/AUP%20Webinar%20for%20Schools.pdf
- SUFS Scholarship Accountability — stepupforstudents.org/wp-content/uploads/22.12-Scholarship-Accountability.pdf
- FTC School Handbook — go.stepupforstudents.org/hubfs/HANDBOOKS/.../FTC-School-Handbook.pdf
- FLDOE FTC private-school info — fldoe.org/schools/school-choice/k-12-scholarship-programs/ftc/ftc-private-school-info.stml
- Statutes (pin by year): s.1002.394, s.1002.395, s.1002.421 (2023/2024) — flsenate.gov/laws/statutes/
- HB 1 (2023) Ch. 2023-16 — flsenate.gov/Session/Bill/2023/1
- FL Auditor General Report 2025-185 (FES-UA findings) — flauditor.gov/pages/pdf_files/2025-185.pdf
- SBE Rule 6A-6.0952 (FES-EO 14-day)
