# FinRep — Project Overview & Roadmap

### A plain-language guide to what we're building, why, and where it's going

**Prepared:** June 2026 · **Status:** Phase 1 complete (foundation shipped) · **Audience:** Everyone — no technical background required

---

## 1. The one-paragraph summary

**FinRep is software that turns a school's raw accounting export into finished, audit-ready financial statements in minutes instead of days.**

Today, when a school's bookkeeper needs to produce financial statements, they export a "trial balance" (a long list of every account and its balance) and then manually rearrange those numbers — in spreadsheets, by hand — into the formal reports that boards, auditors, and banks require. It's slow, error-prone, and has to be redone every reporting period. FinRep automates that rearrangement: upload the export, and the polished statements appear on screen, ready to print to PDF or download as Excel.

---

## 2. The problem we're solving

Schools (and similar nonprofit organizations) are required to produce a specific set of financial statements on a regular basis. Picture a bookkeeper at a private school:

- Their accounting system spits out a **trial balance** — a raw list like *"Account 4100 – Tuition: $2.4M, Account 6200 – Teacher Salaries: $1.8M…"* — sometimes hundreds of lines long.
- The board, the auditor, and the bank don't want that raw list. They want **formal statements**: *"Here is our total revenue, here are our expenses by category, here is what we own and owe, here is our cash flow."*
- Getting from the raw list to the formal statements means knowing **which raw account belongs in which line of which statement** — and doing that math correctly, the same way, every single time.

Doing this by hand in spreadsheets is the status quo. The problems with the status quo:

| Pain point | What it costs the school |
|---|---|
| **Manual & repetitive** | Hours of skilled staff time every reporting period |
| **Error-prone** | One mis-typed number or mis-categorized account throws off the whole statement |
| **Hard to reproduce** | Six months later, nobody can perfectly recreate how a past statement was built |
| **Inconsistent** | Two people doing it produce two slightly different results |
| **Not audit-friendly** | Auditors want to trace every number back to its source — spreadsheets hide that trail |

---

## 3. What FinRep does (the solution)

FinRep replaces the manual spreadsheet work with a guided, automated workflow:

1. **Sign in** securely to your school's account.
2. **Upload** the trial-balance file(s) exported from your accounting system.
3. **Pick the reporting period** (e.g. "Fiscal Year 2026") and the period-end date.
4. **Generate.** FinRep instantly produces the formal statements.
5. **Review** them on screen, then **print to PDF** or **export to a formatted Excel workbook**.

The statements FinRep produces are the standard set used in nonprofit/school accounting:

- **Statement of Activities** — revenue and expenses (the "did we make or lose money" statement).
- **Statement of Financial Position** — what the school owns and owes (the "net worth" snapshot).
- **Statement of Cash Flows** — where cash actually came from and went.
- **Statement of Net Assets** — how the school's accumulated value rolled forward over the period.

It can also show a **prior-year comparison** column and flag any accounts it doesn't recognize, so nothing silently falls through the cracks.

---

## 4. Why our approach is trustworthy

Two design principles set FinRep apart from a do-it-yourself spreadsheet. Both matter a great deal to auditors and boards.

### Principle 1 — The math is consistent and provable

The part of FinRep that does the financial calculations is built as a **sealed, self-contained "engine."** Give it the same inputs and it *always* returns the exact same numbers — there's no hidden randomness, no dependence on who ran it or when. This is verified by an automated test suite that runs every time we make a change, so the calculations can't silently drift over time.

> **In plain terms:** It's a calculator we can prove is right, not a spreadsheet someone might have fat-fingered.

### Principle 2 — Every statement is fully reproducible and traceable

When FinRep saves a finished statement, it doesn't just save the final numbers. It records **exactly what went into them**:

- the original uploaded file, frozen and never altered ("immutable"),
- the precise version of the rules used to categorize each account,
- the version of the calculation engine that produced it.

Because of this, anyone can later re-run the process and get a **byte-for-byte identical** result. If a number on a statement is ever questioned, we can trace it all the way back to the original source line. Corrections are never made by quietly editing history — they create a new record, so the audit trail is always intact.

> **In plain terms:** Every number can be traced back to its source, and old reports never silently change. This is exactly what auditors look for.

---

## 5. How the pieces fit together

FinRep is built as a set of cooperating parts. You don't need to know the technology names — here's what each part *does*, by analogy to a business:

| Part | Plain-language role | Business analogy |
|---|---|---|
| **The Engine** | Does all the financial math and produces the statements | The expert accountant who knows every rule cold |
| **The Importer** | Reads the uploaded spreadsheet and cleans it up | The clerk who opens the mail and sorts the paperwork |
| **The Records / Database** | Securely stores accounts, users, uploads, and finished statements | The locked, organized filing cabinet |
| **The Service (API)** | The behind-the-scenes coordinator that connects everything | The office manager routing work between people |
| **The Website (App)** | The screens you actually click and type into | The front desk you walk up to |

Everything is organized as a single, well-structured project so these parts stay consistent with one another and can be improved independently.

### Who can do what (roles)

FinRep supports multiple people working on the same school, with appropriate permissions:

- **Owner** — full control, including managing the team and settings.
- **Accountant** — can do the financial work (upload, generate, review).
- **Viewer** — can look at results but not change anything.

Schools are grouped under an **Organization** (useful for a group that operates several schools), and team members are added by **email invitation**.

---

## 6. The roadmap — phases at a glance

We're delivering FinRep in clearly-defined phases so value lands early and risk stays low. **Phase 1** is the foundation — a working, secure, multi-user product (sub-phases **1A → 1D**). **Phases 2+** layer the high-value modules (compliance, board reporting, analytics, benchmarking, integrations) on top of the proven engine.

**Phase 1 — Foundation (a secure, multi-user product)**

| Phase | What it delivers | Status |
|---|---|---|
| **1A — Foundation** | The core service is alive: connects to the database, reports its own health, and exposes the report-generation engine | ✅ **Complete** |
| **1B — Accounts & Access** | Real user accounts, secure sign-in, organizations/schools, teams, roles, invitations | ✅ **Complete** |
| **1B.5 — Settings & Member Management** | A full Settings area: members & roles, school settings, your account, organization | ✅ **Complete** |
| **1C — Saving & History** | Store uploads and finished statements so work persists, history is kept, and prior-year comparatives auto-load | ✅ **Complete** |
| **1D — Billing** | Subscriptions, free trials, and paid plans | ✅ **Complete** |

**Phases 2+ — High-value modules (built on the engine)**

| Phase | What it delivers | Status |
|---|---|---|
| **2 — AUP Readiness & Year-End Review** | Florida scholarship-compliance prep + end-of-year review readiness: exception pre-flagging, scholarship reconciliation, workpapers, corrective-action plans | ✅ **Complete** |
| **3 — Board & Finance-Committee Reporting** | Period-over-period, budget vs. actual, one-click board packet (PDF), scheduled delivery | 📋 **Planned** |
| **4 — Analytics & Insights Dashboard** | A customizable per-school dashboard: cost per pupil, financial-aid-per-student, days cash on hand, and more — metrics each school can tailor | 📋 **Planned** |
| **5 — Peer Benchmarking** | Compare a school against an anonymized cohort of similar schools on the Phase-4 metrics | 📋 **Planned** |
| **6 — Integrations & Automation** | QuickBooks Online **and scholarship-software** connectors (no-file intake), auto-reconciliation, scheduled jobs | 📋 **Planned** |
| **7 — Hardening & Trust** | SOC 2 readiness, single sign-on, scale, billing maturity | 📋 **Planned** |

> **A note on data:** Phases 2, 4, and 5 introduce inputs **beyond the trial balance** — student **enrollment** counts, **financial-aid / scholarship** disbursements, and (exploratory) academic data. We capture those alongside the financials so the metrics and compliance checks have what they need.

The sections below break each phase down.

---

## 7. The roadmap — phase by phase

### Phase 1A — Foundation ✅ Complete

**Goal:** Stand up the behind-the-scenes service and prove the calculation engine works end-to-end.

What's done:
- The core service runs and can confirm it's healthy and connected to its database (a built-in "is everything OK?" check).
- The financial **engine is wired in** and can generate a full set of statements on demand.
- The project is structured so all the pieces build and run together reliably.

> **Why it matters:** This is the foundation the rest of the product stands on. It's plumbing the customer never sees directly — but nothing else works without it.

---

### Phase 1B — Accounts & Access ✅ Complete

**Goal:** Make FinRep a real, secure, multi-user product that a school's team can actually log into.

What's done:
- **User accounts** with email-and-password sign-up and secure sign-in.
- **Email verification** to confirm new accounts are real.
- **Password reset** ("forgot password") and the ability to change your password.
- **Account protection** — passwords are stored in a securely scrambled form (never in plain text), and accounts temporarily lock after repeated failed sign-in attempts to block guessing attacks.
- **Organizations and schools** — set up your organization and the school(s) under it.
- **Teams and roles** — invite colleagues by email and assign them Owner, Accountant, or Viewer permissions.
- **A Settings area** — manage your profile, your organization, your school details, and your team members from a clean interface.
- **An audit log** — the system keeps a record of significant actions for accountability.

> **Why it matters:** This turns a single-user tool into something a whole finance team can use safely, with the right people having the right level of access.

---

### Phase 1B.5 — Settings & Member Management ✅ Complete

**Goal:** Give Owners a real interface to manage their team and school — not just behind-the-scenes permissions.

What's done:
- A dedicated **Settings** area with a sidebar: **My Account**, **Members & Roles**, **School**, and **Organization**.
- **Members & Roles** — invite people, change a member's role, remove a member, and see/cancel pending invitations, with **last-owner protection** (you can't accidentally lock a school out by removing its only Owner).
- **School Settings** — edit the school's name and its opening net-asset balances.
- **My Account** — update your name and change your password.
- **Organization** — name your organization and see the schools it manages.

> **Why it matters:** Owners can run their own team without needing support — the day-to-day control that makes a multi-user product self-serve.

---

### Phase 1C — Saving & History ✅ Complete

**Goal:** Make work persist. The heavy lifting no longer happens only in the moment; we now store the inputs and results so nothing is lost and history is preserved.

What's done:
- **Uploads are saved** exactly as received and never altered, so they remain a permanent, trustworthy record.
- **Finished statements are stored** and can be reopened, compared, and re-printed later — no need to re-upload and regenerate.
- **Prior-year comparatives auto-load** from history — once a year is on file, the next year's comparison column fills in automatically with no re-upload.
- **Full version history** of the categorization rules and the engine, so any past statement can be reproduced perfectly (see the reproducibility principle in Section 4).
- **Work survives a refresh** — reopen the app and your in-progress period is restored from the saved record.

> **Why it matters:** Schools get a durable, auditable archive of their financial reporting, not just a one-time render on screen.

---

### Phase 1D — Billing ✅ Complete

**Goal:** Turn FinRep into a sustainable subscription product.

What's done:
- **Subscription plans** (monthly / yearly) with secure payment handling via Stripe.
- **A free trial on every new school** — 14 days to evaluate before paying, with no card required up front.
- **Access tied to subscription status** — generating and saving statements requires an active subscription or a live trial; if a trial lapses or a payment fails, those paid actions pause (while sign-in, settings, and viewing existing data stay open) until billing is brought current.
- **Owner-managed billing in Settings** — Owners subscribe, switch plans, and open a secure billing portal; Accountants and Viewers see status only.
- **A trusted payment record** — Stripe's signed notifications keep the app's subscription status in sync automatically, and every billing change is written to the audit log.

> **Why it matters:** This is how the product funds its own ongoing development and support — and it completes Phase 1: FinRep is now a secure, multi-user, saleable product end to end. *(Live card processing activates once the operator adds their Stripe keys; everything else is built and verified.)*

---

### Phase 2 — AUP Readiness & Year-End Review ✅ Complete

**Goal:** Make Florida private schools' mandatory **scholarship-compliance review (AUP)** and their **year-end financial review** far less manual — catching problems before the auditor does.

What's done — grounded in researched, cited Florida statutes + the Step Up For Students AUP template (see `docs/PHASE_2_AUP_RESEARCH.md`), delivered as a **Review Readiness** workspace:
- **2A — Exception pre-flagging** — a **versioned** rules engine (statute-year + program-tier pinned) scans each period for likely audit findings (books don't balance, education expenses below scholarship funds, non-education expenditures, the $250k AUP trigger, FDIC/60-day-reconciliation/DOE-status controls, FES-UA-specific limits). Each finding carries a **pass / reportable / material** status and its statute citation. A short attestation intake makes most checks produce a real verdict.
- **2B — Scholarship reconciliation** — upload the funding organization's disbursement records (parsed in-browser) and reconcile them against the recorded scholarship revenue, with per-program / per-month breakdowns, a matched/variance verdict, and anomaly flags (duplicates, negatives, out-of-period dates, unknown program).
- **2C — Year-end review readiness** — a guided checklist (a procedure item per AUP rule + a document-gathering list) with progress tracking, **plus a one-click Workpapers Packet** that aggregates the statements, findings, reconciliation, and corrective-action plan into a clean, print-ready document for the reviewer.
- **2D — Corrective Action Plan scaffolding** — every **material** finding auto-scaffolds a pre-filled, editable CAP entry (root cause, corrective action, responsible party, target date, status) that persists and exports; entries self-resolve when the underlying finding clears.
- **Built to adapt** — the checks are **versioned configuration, not hard-coded rules**, so a procedure change is a settings/version bump, not a software release.

> **Framing:** this is a **readiness pre-flag** that mirrors the published AUP — clearly labeled as *not* the official AUP submission or legal/audit advice. *(Automatic disbursement pull from the funding-org system is Phase 6; here the records are uploaded.)*

> **Why it matters:** This is the wedge — it turns a stressful, manual annual scramble into a guided, mostly-automated process. *(Scholarship data can be uploaded manually here; Phase 6 adds the automatic connector.)*

---

### Phase 3 — Board & Finance-Committee Reporting 📋 Planned

**Goal:** Produce the recurring reports a school's board and finance committee expect — in one click.

What it will deliver:
- **Period-over-period** comparisons and **budget vs. actual / variance**.
- A **one-click board packet (PDF)** combining the statements, comparatives, and variances.
- An optional plain-language **narrative summary**.
- **Scheduled delivery** — e.g., the monthly packet generated and emailed automatically.

> **Why it matters:** Replaces hours of monthly spreadsheet assembly with a single click — or a hands-off automated email.

---

### Phase 4 — Analytics & Insights Dashboard 📋 Planned

**Goal:** Give each school an at-a-glance dashboard of the financial metrics that matter **to them** — customizable, because every school cares about different things.

What it will deliver:
- **Key metrics out of the box** — **cost per pupil** (total cost ÷ enrollment), **financial-aid metrics** (e.g., aid per student), **days cash on hand**, tuition dependency, net tuition per student.
- **A customizable dashboard** — schools choose which metrics to feature and how to view them.
- **New inputs captured** — these metrics need a little more than the trial balance (student **enrollment** counts and **financial-aid/scholarship** totals), which we collect alongside the financials.

> **Why it matters:** Turns the statements from once-a-year compliance documents into ongoing operational insight a head of school can use.

---

### Phase 5 — Peer Benchmarking 📋 Planned

**Goal:** Let a school see how it stacks up against comparable schools — privately.

What it will deliver:
- Compare against an **anonymized cohort** on the Phase-4 ratios (days cash on hand, tuition dependency, cost per pupil, aid per student).
- **Cohorts** by size / region / type, **privacy-safe** — no individual school is identifiable and minimum cohort sizes are enforced.

> **Why it matters:** Context a single school can't get alone — "is our cost per pupil normal for a school our size?"

---

### Phase 6 — Integrations & Automation 📋 Planned

**Goal:** Cut out manual file wrangling by connecting directly to the systems schools already use.

What it will deliver:
- **QuickBooks Online connector** — pull the trial balance directly, no file upload.
- **Scholarship-software connector** — integrate with the scholarship funding-organization systems (e.g., Step Up For Students) to pull disbursement data automatically, powering the **AUP reconciliation (Phase 2)** and the **aid metrics (Phase 4)**.
- **Auto-reconciliation** and an **automatic exception scan on every import**.
- **Scheduled jobs** (e.g., the monthly board packet) running reliably in the background.

> **Why it matters:** The difference between "export a file and upload it" and "it's already done." This is also where the scholarship integration you flagged comes to life.

---

### Phase 7 — Hardening & Trust 📋 Planned

**Goal:** Enterprise-grade trust and scale.

What it will deliver:
- **SOC 2 readiness** — the security credential auditors and schools will ask for.
- **Single sign-on** (Google / Microsoft).
- **Billing maturity** (dunning, seats) and the performance/reliability to serve hundreds of schools.

> **Why it matters:** This is what lets FinRep serve many schools and pass their security reviews.

---

### Future / Exploratory 🔬

Ideas worth pursuing once the core platform is mature — flagged as research, not committed scope:
- **Blended academic + financial metrics** — bringing academic indicators (e.g., **test scores**) alongside the financial picture so a school can view **cost and outcomes together**. This needs an academic-data source and careful handling of student-related data (privacy/FERPA), so it's exploratory and would be scoped separately.

---

## 8. Where things stand today (June 2026)

- ✅ The financial **engine is built, tested, and verified** — the hard, high-risk accounting logic is done and proven.
- ✅ The **foundation (1A)** is complete and running.
- ✅ **Accounts, security, teams (1B)** and the full **Settings & member-management area (1B.5)** are complete — FinRep is a real multi-user application.
- ✅ **Saving & history (1C)** is complete — uploads and statements persist, history is kept, and prior-year comparatives auto-load.
- ✅ **Billing (1D)** is complete — subscriptions, free trials, and subscription-gated access, all managed from Settings.
- 🎉 **Phase 1 is finished.** FinRep is now a secure, multi-user, persistent, **saleable** product end to end.
- ✅ **The Analytics & Insights dashboard (Phase 4)** is complete — a customizable per-school dashboard with health-status metrics, drill-down, AI-style insights, and freshness cues (pulled forward ahead of 2–3).
- ✅ **AUP Readiness & Year-End Review (Phase 2)** is complete — a researched, cited, versioned compliance **Review Readiness** workspace: exception pre-flagging (2A), scholarship reconciliation (2B), year-end checklist + one-click workpapers packet (2C), and corrective-action-plan scaffolding (2D).
- 📋 **Remaining modules — board reporting (3), peer benchmarking (5), integrations including the scholarship-software connector (6), and hardening/SOC 2 (7)** — are planned and build directly on the proven engine + the analytics and compliance layers now in place.

**The biggest technical risk — getting the accounting math exactly right and provably consistent — is already behind us, and the foundation, analytics, and compliance layers now stand on top of it.** What remains is board-facing reporting, cross-school benchmarking, direct integrations, and enterprise hardening — layered onto a product that already stores, secures, monetizes, analyzes, and compliance-checks the work the engine does correctly.

---

## 9. What FinRep is *not* (scope clarity)

To set expectations clearly with non-technical stakeholders:

- FinRep is **not** a full accounting system. It doesn't replace the bookkeeping software where transactions are recorded. It sits **downstream**, turning that software's output into finished statements.
- FinRep does **not** invent or guess numbers. It rearranges and totals the numbers you give it, using transparent, traceable rules.
- FinRep does **not** lock you in. Results export to standard **PDF** and **Excel** formats you already use.

---

## 10. Glossary (plain-language definitions)

- **Trial balance** — the raw list of every account and its balance, exported from accounting software. FinRep's starting input.
- **Financial statements** — the formal reports (Activities, Financial Position, Cash Flows, Net Assets) that boards, auditors, and banks require.
- **Reporting period** — the span of time a statement covers, e.g. a fiscal year.
- **Net assets** — a nonprofit's accumulated value; the equivalent of "net worth" or "equity."
- **The Engine** — FinRep's sealed calculator that does the financial math identically every time.
- **Reproducible** — able to be recreated exactly, down to the last cent, from the original inputs.
- **Immutable** — saved in a form that is never altered, preserving a trustworthy record.
- **Audit trail** — the traceable path from a final number back to its original source.
- **Role (Owner / Accountant / Viewer)** — a person's permission level within a school.
- **Organization** — the top-level account that can contain one or more schools.

---

*This document describes the product vision and delivery plan. Phase status reflects the state of the project as of June 2026 (Phases 1, 4, and 2 complete — foundation, analytics dashboard, and AUP/year-end readiness all shipped; Phases 3, 5, 6, 7 planned) and will be updated as phases complete. The full plan now runs through Phase 7 plus exploratory work — see Sections 6–7. The companion `PROJECT_OVERVIEW.pdf` is generated from this Markdown via `scripts/md-to-pdf.py`; re-run it after edits to keep the two in sync.*
