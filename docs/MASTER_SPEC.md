# DataTrace — Master Specification v1.4.2

> **Status:** **v1.4.2 is the implementation baseline.** It supersedes v1.4, v1.3, v1.2 and v1.1 (v1.1 itself superseded `DATATRACE_MASTER_SPEC_FINAL.md` and `DATATRACE_MASTER_SPEC_GITHUB_FINAL.md`).
> **Continuity:** v1.4.2 keeps the architecture, invariants, rule semantics and scope tiers of v1.4. It makes three changes only: (1) **Gmail import** moves from P2 to **P1-0**, in a deliberately small, one-shot form (§5.5, §15.9, §17.3); (2) the build team is **two people**: the four ownership roles A–D are kept and mapped onto them, with a work division by area (§3); (3) the schedule, sleep rota, tests, gates and checklists are updated to match (§17, §18, §20–§22). See [Appendix C](#appendix-c--changelog).
> **Audience:** the two-person build team (Person 1 and Person 2, who together hold the four ownership roles A, B, C, D), the same 24-hour hackathon, plus reviewers and judges.
> **Principle:** *AI proposes. Evidence supports. Deterministic logic verifies. DataTrace explains. The user decides what action to take.*
> **Change rule:** any change to architecture, schema, contract, or scope is agreed and recorded in this file (see §19.3) before code is written.

**Contents**

1. [Project Overview & Principles](#1-project-overview--principles)
2. [Hackathon Context & Strategy](#2-hackathon-context--strategy)
3. [Team & Ownership](#3-team--ownership)
4. [User Journey](#4-user-journey)
5. [Evidence Ingestion & Integrity](#5-evidence-ingestion--integrity)
6. [Outputs & the Unified Case Report](#6-outputs--the-unified-case-report)
7. [Architecture & Technology Decisions](#7-architecture--technology-decisions)
8. [Repository Structure](#8-repository-structure)
9. [Data Model](#9-data-model)
10. [Contracts (Zod / TypeScript)](#10-contracts-zod--typescript)
11. [AI Pipeline & Privacy Gateway](#11-ai-pipeline--privacy-gateway)
12. [Verification Model & Rules](#12-verification-model--rules)
13. [Intelligence Engines](#13-intelligence-engines)
14. [Report Generator & Grounding](#14-report-generator--grounding)
15. [Privacy, Security, Consent & Audit](#15-privacy-security-consent--audit)
16. [API Surface](#16-api-surface)
17. [Delivery Plan](#17-delivery-plan)
18. [Testing & Evaluation](#18-testing--evaluation)
19. [Workflow Rules](#19-workflow-rules)
20. [Definition of Done, Release Gates & Freeze](#20-definition-of-done-release-gates--freeze)
21. [Demo Script & Fallbacks](#21-demo-script--fallbacks)
22. [Acceptance Checklist](#22-acceptance-checklist)
23. [Non-Negotiables](#23-non-negotiables)
- [Appendix A — Decision Register](#appendix-a--decision-register)
- [Appendix B — Open Questions](#appendix-b--open-questions)
- [Appendix C — Changelog](#appendix-c--changelog)
- [Implementation Freeze Checklist](#implementation-freeze-checklist)

---

# 1. Project Overview & Principles

## 1.1 Identity

- **Name:** DataTrace
- **One line:** DataTrace turns fragmented privacy-related evidence (emails, documents, screenshots, requests, responses) into a preserved case record (originals kept unmodified), structured intelligence, deterministically verified findings, and an evidence-grounded action report.

## 1.2 Problem

People who exercise data rights (GDPR/CCPA access, deletion, correction, opt-out) end up with evidence scattered across email threads, portals, screenshots and PDFs. Organizations answer vaguely, late, or inconsistently, and the person cannot easily show what was asked, what was answered, what was ignored, or where two answers conflict.

Existing options are either generic letter templates with no tracking, or unconstrained LLMs that treat claims as facts and produce accusations they cannot support.

DataTrace is an **evidence-centered decision-support and case-preparation tool**. It connects the full trail and never confuses an AI inference with a verified finding.

## 1.3 Primary user

> A privacy-conscious individual who has made a data-access, deletion, correction, or opt-out request and received ambiguous, stalling, or contradictory responses across several channels.

Secondary audiences (future, not MVP drivers): privacy professionals, researchers, digital-rights organizations, compliance analysts.

## 1.4 Product boundary

DataTrace **may**: organize evidence; extract privacy-relevant claims, entities, events and relationships; compare requests with responses; flag friction and candidate contradictions; validate citations and deterministic conditions; draft an evidence-grounded report.

DataTrace **must not**: present AI inference as established fact; invent evidence; silently turn uncertainty into certainty; give legal advice; file anything with an authority automatically; claim legal conclusions without an evidence and rule basis.

**Standard disclaimer (exact wording).** Shown in the UI footer of every case page, in every report and in every export: *"DataTrace identifies evidence-related gaps and prepares a reviewable draft; it does not determine legal compliance or provide legal advice."*

**Legal-claims rule.** DataTrace does not state a deadline, a legal article or a compliance conclusion unless a human has checked the exact rule and jurisdiction and recorded it as a reviewed entry in `contracts/schemas/frameworks.ts` (§14.1, §15.6).

## 1.5 Axioms

1. AI inference is not verified fact.
2. AI confidence is not verification.
3. Similarity is not verification.
4. A citation says *where* a claim comes from; it does not make the claim verified.
5. Generated text is not evidence.
6. A hash proves a file is unchanged, not that its contents are true or authentic.
7. Absence from the case record is not absence in the world (an unanswered request means "no response found in this case").

**Epistemic ladder:**

```text
Raw evidence  →  Candidate (AI output)  →  Finding in one of five verification states  →  Report assertion
                                            UNVERIFIED · AI_INFERRED · CORROBORATED · VERIFIED · CONTRADICTED
```

## 1.6 Glossary

| Term | Meaning |
|---|---|
| **Case** | The isolation boundary. All evidence, findings, reports and audit rows belong to exactly one case. |
| **EvidenceItem** | The preserved original of an uploaded file or manual entry (with SHA-256). Its bytes are never modified. |
| **EvidenceArtifact** | A derived representation of an item (extracted text, header JSON, transcript). Never replaces the original. |
| **EvidenceSegment** | A locatable chunk of an artifact (page, char range, line). The atomic target of citations. Identified to humans and models by *evidence display ID + segment ordinal* (for example `EV-101` #3). |
| **Display ID** | Human-readable, database-generated identifier: `CASE-101`, `EV-101`, `FND-201`. The UUID remains the primary key. |
| **Finding** | Unified record for a claim, entity, event, relationship, request, response, friction signal, contradiction or data category. |
| **Candidate** | A finding as proposed by a model, before persistence. Uses display IDs and ordinals, never UUIDs. |
| **Candidate citation** | The AI-facing citation: `evidenceDisplayId`, `segmentOrdinal`, `locatorType`, `locator`, `quotedText`. |
| **Persisted citation** | The database citation: UUID foreign keys to the evidence item and segment, written only after the Gateway resolves a candidate citation (§11.8). |
| **Normalized claim** | The machine-checkable form of a `CLAIM`: `subject`, `predicate`, `object`, `polarity` (§10). |
| **Evidence basis** | *How* the finding was derived: `DIRECT`, `OBSERVED`, `INFERRED`, `CONFLICTING`. |
| **Verification state** | *How far deterministic checks have taken it*: `UNVERIFIED`, `AI_INFERRED`, `CORROBORATED`, `VERIFIED`, `CONTRADICTED`. |
| **Rule** | A pure deterministic function in `verification/` that returns PASS / FAIL / INCONCLUSIVE and may change a finding's state. |
| **Gateway** | The only code path allowed to talk to an AI provider. Enforces consent, minimization, schema validation, reference resolution and audit. |
| **Lens** | One of three views of the single case report: Evidence, Findings, Complaint. |

## 1.7 Record terminology

"The case record" is not one thing. Each part has its own guarantee, and documents, code comments and the UI must use these words and no others:

| Part | Correct description | Guarantee |
|---|---|---|
| Original evidence (`EvidenceItem` bytes in private Storage) | **Preserved original (immutable)** | Never modified. Deletion is a soft delete plus removal of the binary, with a tombstone (§15.5). |
| Derived intelligence (artifacts, segments, findings, citations, verification results, reports) | **Mutable and versioned** | New versions are added; `supersedes_id`, `version` and `report_version` keep history. States change only through the engine. |
| Audit ledger (`audit_events`) | **Append-only and tamper-evident** | No UPDATE/DELETE; hash-chained per case (§9.3). Not tamper-proof. |
| SHA-256 | **Integrity mechanism** | Shows bytes are unchanged since ingestion. It is not proof that the content is true or authentic. |

---

# 2. Hackathon Context & Strategy

DataTrace is being built for **Hackyard BUILD 2026** (online Round 1, in-person Round 2 at IIT Guwahati). Facts below were re-checked against the official Apply, Guide and Rules pages on **19 Oct 2026**; re-check them before relying on dates.

## 2.1 Event facts

| Item | Detail |
|---|---|
| **Round 1 — Idea submission** | Online. Applications ran 14 Sep to 10 Oct 2026 and are **closed**. No finished product was required; an optional public work link could be added. |
| **Round 2 — Grand Finale** | In person at **IIT Guwahati, 24–25 Oct 2026**, a 24-hour build, then presentation to a jury. |
| **Selection** | Applications were reviewed after 10 Oct. Selected projects are announced in waves on the official results page; selected builders receive attendance-confirmation details directly from Hackyard. |
| **Team** | Solo or 2–4 people. Every member applies individually, then connects with a private team code (format like `HYB-7K4P2`). |
| **LLM credits** | One shared **$100** Hackyard LLM allocation per selected *project*. |
| **Costs** | Applying is free. Selected builders get an all-inclusive participant package: event seat, 2 nights' stay, all meals, build space and internet. **Travel to and from IIT Guwahati is not covered.** Details are emailed before attendance confirmation. |
| **Prizes** | Published on the official Prizes page: main-event prizes (including ₹47,500 cash and ₹1,00,000 in Agent37 credits) plus separate sponsor challenges (Agent37, ByteAsk, Nodus, Render). Amounts and eligibility are the organizers'; re-check before relying on them. Entering a sponsor challenge is optional and only worth it if it costs almost no build time (Appendix B #13). |
| **Problem statement** | None fixed: "anything worth building". We choose the problem. |
| **Official build window** | Judging focuses on work created or materially advanced during the announced onsite window. Pre-existing work must be disclosed (§2.5). Judges review the working build and disclosed dependencies, not only the pitch. |

## 2.2 Judging alignment

| Criterion | Weight | How DataTrace answers it | Where the jury sees it |
|---|---|---|---|
| **Build** | 40% | A working end-to-end slice (upload → AI → verification → grounded report) that runs reliably, with cached fallback. | §21 demo, §17.3 cut line |
| **Problem** | 20% | Real, common pain: data-rights requests that get stalled or contradicted, with no evidence tooling. | §1.2, demo scenario |
| **Ingenuity** | 20% | Trust architecture: AI proposes, deterministic code verifies; basis and state kept orthogonal; hash-chained audit; grounded reports that cannot contain unsupported allegations. | §12, §14, §15.4 |
| **Potential** | 20% | Same evidence-verification core serves professionals, NGOs, other jurisdictions (e.g. India's DPDP Act) and other dispute domains. | §15.6, §17.3 |

**Consequence:** Build carries the most weight and the guide says "judge the build, not the pitch", so the P0-Core slice (§17.3) is protected over breadth, and visible behaviour is ordered ahead of invisible hardening. Trust architecture is the differentiator, so it must be *visible* in the UI, not only in the docs.

## 2.3 Round 1 submission plan

> **v1.4 status:** Round 1 is closed (10 Oct 2026). The submitted text is kept in `docs/idea-submission.md`. This section is retained for the record.

Round 1 is judged on problem relevance, innovation, feasibility, potential impact and execution potential. Prepare `docs/idea-submission.md` containing:

| Criterion | What to state (one short paragraph each) |
|---|---|
| Problem relevance | Who suffers, how often, what they do today, why it fails. |
| Innovation | The AI-proposes / code-verifies model; orthogonal basis vs state; grounded reports. |
| Feasibility | The vertical slice (§17.4), the stack (§7.3), the 24-hour plan, the cut line. |
| Potential impact | Individuals first; then professionals, NGOs, other regulations. No invented market numbers. |
| Execution potential | Team roles (§3), the repo and spec already in place, synthetic test suite. |

Add the public repository link in the optional work-link field.

## 2.4 Registration checklist

> **v1.4 status:** registration closed on 10 Oct 2026. Kept for the record. Remaining admin: confirm attendance with Hackyard when asked, and share travel plans within the team (Appendix B #4).

- [ ] Each member registers on **Unstop**.
- [ ] Each member completes the official form at `hackyard.org/build2026` using **the same email** as on Unstop.
- [ ] Each member submits their own application; one member creates the team and shares the code; the others join with it.
- [ ] Everyone joins the Hackyard Slack workspace.
- [ ] All of the above before **10 Oct 2026**.

## 2.5 Pre-event build policy (resolved in v1.4)

**What the official Rules say** (Rules page, checked 19 Oct 2026):

- Judging focuses on work created or materially advanced during the announced onsite build window.
- Pre-existing libraries, tools, designs, datasets and project foundations may be used **when disclosed**. Teams must clearly identify what existed before the event and what was built during the window.
- A reused foundation must be transformed through meaningful onsite work.
- Hackyard may disqualify for undisclosed pre-built work, plagiarism or false information.

This answers Appendix B #1.

**Team decision (unchanged from v1.3): strict reading.** All product code is written on site, 24–25 Oct. Before the event the team prepares only material that is safe under any reading and discloses all of it.

| Prepared before the event (disclosed) | Written on site (the judged work) |
|---|---|
| This specification, README, `docs/` (build card, demo kit, Q&A sheet, idea submission) | `contracts/`, migrations, RLS, audit chain |
| Synthetic test data (`tests/synthetic/`) | Gateway, providers, prompts as code |
| UI wireframes, design tokens, landing page design | `verification/` rules and tests |
| Account setup (including the Google Cloud project, OAuth consent screen and throwaway Gmail test accounts for P1-0, §17.2A), tooling installs, throwaway library spikes (deleted afterwards) | Frontend, backend, worker, export |
| Demo rehearsal on paper | The recorded fixtures and the cached demo run |

**Disclosure statement** (README, first pitch slide, and said aloud): *"Before the event we had the specification, documentation, synthetic test data and design sketches. All application code, database schema and tests were written during the build window. Third-party libraries and services are listed in the README."* Edit it to match reality on the day; it must stay true.

**Doubt rule.** If anyone is unsure whether something counts as pre-built, treat it as on-site work (do not bring it) or disclose it. Never bring code that cannot be disclosed.

## 2.6 LLM credits and token budget

- Every selected project gets one **$100** Hackyard LLM allocation, shared by the whole team, so budget it. The Guide does not say which providers the credits cover; that is **unconfirmed** (Appendix B #2). Ask at kickoff.
- The `AIProvider` abstraction (§11.3) means the provider can change without touching other layers. Grok (xAI) is the development provider until the credits' provider is known.
- A `mock` provider that replays recorded fixtures is **mandatory**: UI work, CI and the demo fallback must never spend credits.
- The mock provider is not only a fallback: it is the **guaranteed demo path**. It replays identical structured output every time, with no dependency on Wi-Fi, credits, model availability or an API key. Use a live model on stage only if it has worked reliably in rehearsal; otherwise run the demo on `mock`.
- Planning estimate (replace with measured values after the first real run): one full analysis of the demo case ≈ 100k tokens in total. At mid-tier pricing that is roughly $0.5 per run, so $100 supports on the order of 150–200 runs. Rule: real-provider runs only for prompt work, evaluation and rehearsal; log tokens per run; set `AI_TOKEN_BUDGET_PER_RUN`.

---

# 3. Team & Ownership

## 3.1 Two people, four roles (v1.4.2)

The build team is **two people**. The four ownership roles (A frontend, B backend, C database and security, D AI and intelligence) are kept exactly as in v1.4, so every `[A]`, `[B]`, `[C]`, `[D]` tag, branch name and checklist owner in this file stays valid. Each person simply holds two roles.

| Person | Roles held | Areas |
|---|---|---|
| **Person 1** (team lead) | **C + D** | Database, AI, Security (the trust pieces) |
| **Person 2** | **A + B** | Frontend, Backend (both sides of the adapter/router seam) |

**Why this split.** Person 2 holds both ends of the frontend/backend seam (§7.5), so the most failure-prone boundary never waits on a second person. Person 1 holds everything that decides whether the system can be trusted (schema, RLS, Gateway, verification rules, security design), so those decisions stay consistent.

## 3.2 Roles and boundaries

| Member | Role | Owns | Does not own |
|---|---|---|---|
| **A** | Frontend & UI/UX | `frontend/`: Next.js UI, case dashboard, evidence viewer, timeline, graph, request-response matrix, live report editor, design system; P1-0: Gmail connect button, `/gmail/callback` page and thread picker; **the single API adapter** `frontend/app/api/[[...slug]]/route.ts` and `frontend/lib/api.ts` (§7.5) | Prompts, migrations, backend auth flows, any file under `backend/` |
| **B** | Backend & Integrations | `backend/`: **`backend/api/router.ts` and every endpoint handler**, upload/ingestion pipeline, RFC-822/PDF/DOCX parsing, job worker, orchestration; **P1-0: Gmail OAuth and import** (§5.5); stretch: HTTP probes | Anything under `frontend/` (including the API adapter), prompts, schema and RLS ownership |
| **C** | Database, Security & DevOps | `database/`, `supabase/`: schema, migrations, RLS, storage policies, audit hash chain, hashing utilities, `assertCaseOwner()`, `gmail_connections` and migration 005 (P1-0), security design for the whole system (§15), CI/CD, deployment | Prompts, UI, interpretation of AI output |
| **D** | AI & Privacy Intelligence (Team Lead) | `ai/` and `verification/`: gateway (including citation and reference resolution), providers, prompt registry, extraction and engines, verification rules, report drafter, synthetic harness; architecture coordination | Route wiring, DB maintenance, UI layout, deployment |

**Lead principle.** Member D (Person 1) coordinates architecture, contracts and integration checkpoints. D does not overwrite A, B or C's internals and is not the fallback developer for other modules. Each role owns its boundary absolutely. With two people, this means Person 1 does not edit `frontend/` or `backend/`, and Person 2 does not edit `ai/`, `verification/`, `database/`, `supabase/` or `contracts/`; a needed change in the other person's area is a request or a PR they review.

**Shared surfaces** (changes need review from affected owners): `contracts/`, `docs/`, `tests/synthetic/`, `.env.example`. See §19.3.

**Frontend/backend seam.** Exactly one file connects the two: the adapter `frontend/app/api/[[...slug]]/route.ts` (owned by A, written in Hour 0–1, then frozen). It forwards every `/api/*` request to `backend/api/router.ts` (owned by B). B adds or changes endpoints only inside `backend/api/`; A never needs to touch backend files and B never needs to touch frontend files to ship an endpoint.

## 3.3 Work division by area (v1.4.2)

This table replaces any earlier split. Person 1 takes AI, Database and Security (the trust pieces); Person 2 takes Frontend and Backend, so the adapter and the router sit with one person. The last column lists work that is P1, plus P0-Hardening items that slip past the Hour-14 cut line and are demoted to P1 (§17.3).

| Area | Owner | P0 work | P1 and demoted-Hardening work |
|---|---|---|---|
| **Frontend** | Person 2 (A) | Adapter and `apiFetch`, app shell, case dashboard, upload, findings list with basis and state badges, evidence viewer with whole-segment highlight, request-response matrix, report editor, disclaimer footer | **P1-0:** Gmail connect button, callback page, thread picker. Confirm-contradiction button, audit verify screen, timeline, friction badges, graph |
| **Backend** | Person 2 (B) | Router and `/api/health`, case and evidence endpoints, SHA-256 and storage, `.eml`/`.txt` parsers, segmenter, worker and handler glue, report export | **P1-0:** Gmail OAuth routes and import. Audited (double-event) downloads, text-PDF |
| **Database** | Person 1 (C) | The P0 tables from §9, display-ID triggers, indexes, demo seed data | `gmail_connections` table and `ingest_source`/`external_ref` columns (schema built at Hour 1–3, §17.3), audit chain, quarantine function, pgTAP suite |
| **AI** | Person 1 (D) | `contracts/`, Gateway and resolver, `mock` + one live provider, prompts, the six P0 rules, report draft and grounding | `event_consistency`, friction rules, `entity_reference` and the other P1 rules |
| **Security** | Person 1 designs, both apply | Consent and minimization, no IDs to the model, secrets and `.gitignore`, deny-all Storage and RLS posture, private bucket, `assertCaseOwner()`, one second-user cross-case check, treating email text as data and never as instructions | Gmail token rules (§15.9: read-only scope, state parameter, tokens server-side and never logged), full RLS and pgTAP |

## 3.4 Handoffs between the two people

| When | Handoff |
|---|---|
| **Hour 0–1** | Person 1 freezes the Zod contracts (§10), including the Gmail contracts of §10.6. Person 2 commits the adapter, `apiFetch` and the `/api/health` router. |
| **Hour 3** | Person 1: database schema ready (including migration 005, §9.1), so Person 2 can persist against it. |
| **Exported functions** | Person 1 hands over four functions; Person 2 calls them and uses the `mock` provider and recorded fixtures until they exist. Exact parameter lists are agreed at the Hour-1 contract freeze. |

| Export | Module | Behaviour |
|---|---|---|
| `runExtraction` | `ai/gateway` | Runs one extraction task through the Gateway for a scope; returns persisted findings and the rejected-candidate count |
| `runVerification` | `verification/engine` | Runs the rules for a case or finding through the single transition path (§12.4) |
| `draftReport` | `ai/` | Drafts a report for a lens and framework from eligible findings (§14) |
| `assertCaseOwner` | `database/security/assertCaseOwner.ts` | Called first in every handler that takes a case or an object inside a case; resolves to `404 NOT_FOUND` when the caller does not own it (§7.5) |

**Person 2's early hours** (adapter, app shell, `apiFetch`, parsers, segmenter) need no database, so they run in parallel with Person 1's schema work.

## 3.5 Capacity and review rules for two people

- **Capacity.** The v1.4 hour budgets were written for four parallel lanes. Two people share those lanes, so expect P0-Core to consume most of Hours 0–14. The cut line (§17.3) is the arbiter: P0-Hardening is cut first, then P1. What is cut is not claimed (§23, principle 11).
- **Review.** The other person reviews every PR (§19.1). While one person sleeps (§17.5A), the awake person may merge their own PR when CI is green and marks it for review on the sleeper's return. Nothing in `contracts/` or `supabase/migrations/` merges while Person 1 sleeps.
- **Escalation.** The 90-minute time-box rule (§17.5A) is decided jointly when both people are involved.

---

# 4. User Journey

```text
User adds evidence (file upload, manual log, or, P1-0, a Gmail thread import)
  → Original preserved (SHA-256, private storage)
  → Text/metadata extracted into derived artifacts, split into locatable segments
  → User turns on AI for this case (explicit consent)
  → AI Privacy Gateway minimizes input and calls the provider with a typed schema
  → Candidate findings returned (claims, entities, events, requests, responses, signals, contradictions)
  → Deterministic verification engine checks citations, provenance and rules; sets states
  → Everything written to PostgreSQL under RLS, with a hash-chained audit ledger (originals are preserved unmodified; derived intelligence is versioned)
  → User explores: timeline, graph, request-response matrix, finding queues
  → Unified case report (Evidence / Findings / Complaint lens), grounding-validated
  → User reviews, edits, redacts, exports. The user decides what to do next.
```

---

# 5. Evidence Ingestion & Integrity

## 5.1 Supported inputs, extraction and segmentation

| Input | Formats | Extraction (decision) | P0 segmentation and locator | Priority |
|---|---|---|---|---|
| Email | `.eml` / RFC-822, pasted raw text | `mailparser`: headers → `METADATA_JSON` artifact; body → `NORMALIZED_TEXT` artifact | Paragraph chunks of the body text; locator `CHAR_RANGE {start,end}` (offsets into the artifact) | P0 |
| Text | `.txt` | Direct | Paragraph chunks; `CHAR_RANGE` | P0 |
| PDF (text-based) | `.pdf` | PDF text library, **page-level text blocks** | **One segment per page with extractable text**; locator `PAGE {page}`. Paragraph-level locators (`PAGE_PARAGRAPH`) are P1 | P0 |
| Manual log | Typed entry (call, letter, portal action) | Stored as `MANUAL_LOG` item with user-entered text | Paragraph chunks; `CHAR_RANGE` | P0 |
| Gmail thread (P1-0) | One-shot import through the Gmail API (§5.5): each message fetched as raw RFC-822 bytes | Stored as a `.eml` original, then exactly as an email | Same as email | **P1-0** |
| Word | `.docx` | `mammoth` to text | Paragraph chunks; `CHAR_RANGE` | P1 |
| Screenshot / image | `.png`, `.jpg` | **Vision-capable model via the Gateway**, or manual transcript if the provider lacks vision | One segment per transcript paragraph; `CHAR_RANGE` | P1 |
| Scanned PDF | image-only `.pdf` | Same vision path as screenshots | as above | P2 |

**Ordinals.** Within an artifact, segments are numbered `ordinal = 1, 2, 3…` in reading order (blank PDF pages are skipped, so an ordinal is not always the page number). The ordinal plus the evidence display ID is what a model cites (§11.8). `(artifact_id, ordinal)` is unique in the database.

**Highlighting scope.** In P0 the viewer navigates to and highlights the **whole segment** (§14.3). Highlighting the exact quoted characters inside a segment, across PDF or HTML rendering, is P1.

**Vision/OCR rule.** Text produced by a model from an image is itself an AI output. Its artifact is tagged `extraction_method = AI_VISION`, and findings that rest *only* on such artifacts cannot exceed `AI_INFERRED`. A user-confirmed transcript is stored as a manual artifact (`extraction_method = MANUAL`) and is not capped. Gmail import is P1-0 (§5.5); continuous or background Gmail sync stays P2. `.eml` upload remains the fallback and covers the same ground for the demo.

## 5.2 Storage and integrity protocol

1. **Private, case-scoped storage.** Path: `cases/{case_id}/evidence/{evidence_id}/original` in a private Supabase Storage bucket (`evidence`, `public = false`, size and MIME limits set in `supabase/config.toml`). The backend generates `evidence_id` before upload and builds the path from validated UUIDs only, never from client-supplied strings.
2. **No public URLs and no client storage access.** Client roles have no access to the `evidence` bucket at all (§9.2). The only retrieval path is:

```text
Frontend  → GET /api/evidence/:id/download      (Supabase access token)
Backend   → authorize: user owns the case (ownership query runs under the user's own RLS scope)
          → refuse if the item is deleted or QUARANTINED
          → write audit EVIDENCE_DOWNLOAD_AUTHORIZED   (fail closed: if this write fails, no URL is created)
          → create a signed URL with the service role, TTL = SIGNED_URL_TTL_SECONDS (default 60)
          → write audit EVIDENCE_DOWNLOAD_URL_ISSUED   (only after the URL exists; fail closed: if this write
                                                         fails, the URL is discarded and never returned)
Frontend  ← { url, expiresAt }  → downloads the original
```

The frontend never imports a Storage client for evidence. The ledger uses exact terms: `EVIDENCE_DOWNLOAD_AUTHORIZED` means the backend decided to allow the download; `EVIDENCE_DOWNLOAD_URL_ISSUED` (metadata: `authorizedEventId`, `ttlSeconds`) means a signed URL was actually created and is being returned. An `AUTHORIZED` event with no matching `URL_ISSUED` event therefore means issuance failed. Neither event records that the file was fetched; the URL is a bearer link, valid only for its short TTL. `EVIDENCE_VIEWED` is not used for original-file downloads (it is written only when extracted text is opened through the REST API, §16).
3. **Hash at ingestion.** The backend computes SHA-256 over the raw bytes before persisting them (uploads are capped at `MAX_UPLOAD_MB`, so buffering is acceptable). Hash, size, MIME type, original filename and upload time go to PostgreSQL.
4. **Re-verification.** Before any processing, and again before an item's text is placed in an AI scope, the hash is recomputed from storage. A mismatch quarantines the item, writes an audit event, and demotes every finding that cites it (§12.4).
5. **Upload limits.** Max size and allowed MIME list enforced server-side (MIME sniffed, not trusted from the client).
6. **Path parsing is strict.** Stored paths are parsed only by `parseEvidencePath()` in the backend (anchored regex, UUID-shaped segments). A malformed or non-UUID path returns a `MALFORMED_PATH` error; it never reaches a SQL cast. The database also enforces `storage_path = 'cases/' || case_id || '/evidence/' || id || '/original'` (§9.1).

## 5.3 Original vs derived

Derived data never mutates the original.

- `EvidenceItem`: immutable original.
- `EvidenceArtifact`: derived representation with `created_by_process` and `extraction_method`; several per item; new versions never overwrite.
- `EvidenceSegment`: locatable chunk of one artifact; the target of citations.

## 5.4 Ingestion pipeline

```text
Upload → AuthZ → SHA-256 → private storage → EvidenceItem (PENDING)
       → extractor → EvidenceArtifact(s) → segmenter → EvidenceSegments
       → EvidenceItem.processing_status = PROCESSED   (FAILED on any error; retry never overwrites history)
```

## 5.5 Gmail import (P1-0, v1.4.2)

**Import, not sync.** The user clicks *Connect Gmail*, picks a thread, and DataTrace fetches its messages once. There is no background polling, no push watch, no scheduled refresh: that is *continuous sync* and it stays P2. UI copy, docs and the pitch say **"import from Gmail"** and never "sync" (principle 11).

**What it adds, and what it does not.** Gmail import is only a new way to bring emails into the existing flow. Each message becomes an ordinary evidence item and runs through the same pipeline as an uploaded `.eml` (§5.4): hash, store, parse, segment, analyze. Nothing downstream changes. DataTrace reads mail only: it never sends, drafts, labels, archives or deletes anything.

```text
Browser            Backend (router)                     Google
  │ Connect Gmail     │                                    │
  ├──POST /gmail/connect──► signed `state` ───────────────►│ consent screen (Testing mode)
  │◄───── redirect to http://localhost:3000/gmail/callback?code&state ─────────────┤
  ├──POST /gmail/callback {code,state}──► verify state ──► exchange code ─────────►│
  │                       encrypt + store refresh token (gmail_connections)        │
  ├──GET  /gmail/threads ──► list threads (metadata, display only) ───────────────►│
  ├──POST /cases/:id/evidence/gmail {threadId}                                     │
  │                       assertCaseOwner → for each message: format=raw ─────────►│
  │                       base64url-decode → bytes → SHA-256 → private storage     │
  │                       → evidence_items (ingest_source = GMAIL_IMPORT) → parse → segments
```

**Rules**

1. **Scope.** One scope only: `https://www.googleapis.com/auth/gmail.readonly`. A callback whose granted scope differs is rejected and nothing is stored.
2. **Redirect through the frontend.** The OAuth redirect URI is a *frontend page* (`/gmail/callback`, not under `app/api/`). The page forwards `code` and `state` to `POST /api/gmail/callback` with the user's Supabase token, so every API route stays authenticated, `/health` remains the only unauthenticated route (§7.5) and the adapter rule is untouched.
3. **One message, one evidence item.** `source_type = EMAIL`, `mime_type = message/rfc822`, `ingest_source = GMAIL_IMPORT`, `external_ref = <Gmail message ID>`, filename `gmail-<first 8 characters of the ID>.eml`. The SHA-256 is computed over the decoded raw bytes exactly as for an upload. It proves the bytes are unchanged since import (axiom 6); it does not prove the email is authentic. DKIM verification stays P2.
4. **Idempotent.** The unique index on `(case_id, external_ref)` makes a repeated import of the same message a no-op: the existing item is returned with `duplicate: true`.
5. **Bounded.** At most `GMAIL_MAX_MESSAGES_PER_IMPORT` messages per import (default 10), taken in thread order; the result says `truncated: true` if more existed. Each message obeys `MAX_UPLOAD_MB`.
6. **Listing is display-only.** The thread list (subject, sender, snippet, count) is shown to the user, never stored, never sent to a model and never written to the audit ledger.
7. **Mail is untrusted evidence.** Imported text is delimited as data in prompts like any other evidence (§11.1, scenario S2). It enters an AI scope only after the user enables AI for the case (§15.2).
8. **Audit.** Each imported item writes `EVIDENCE_IMPORTED` to the case ledger (IDs, hash, `ingestSource`; no subject, sender or body). Connecting and disconnecting a mailbox are account-level events outside any case, so they are **not** in a per-case ledger, and the product does not claim they are (§15.8).
9. **A client interface with a mock.** `backend/integrations/gmail.ts` exposes a `GmailClient` (`listThreads`, `getThreadMessageIds`, `getRawMessage`) with a live implementation and a fixture-backed `mock` implementation, selected by `GMAIL_MODE=live|mock`. CI and `DEMO_MODE` use `mock` and never call Google, mirroring the AI `mock` provider (§2.6).

**Google platform constraints** (Google's OAuth documentation, re-checked 23 Oct 2026; re-check before relying on them):

| Constraint | Consequence for DataTrace |
|---|---|
| `gmail.readonly` is a *restricted* scope. Public use needs verification and a security assessment, which takes weeks. | Not pursued. The app stays in **Testing** publishing status (External user type). |
| In Testing, only accounts listed as test users can sign in (hard cap of 100), and they see a warning screen they must click through. | Add exactly two throwaway Gmail accounts as test users; click through the warning during the demo. |
| In Testing, refresh tokens expire 7 days after consent. | Fine for a weekend: connect on site, never before. An expired token sets the connection to `EXPIRED` and the UI asks the user to reconnect. |
| Google issues a refresh token only when offline access is requested with a consent prompt. | The authorization request sets `access_type=offline` and `prompt=consent`. |

**Accounts and data.** Only **throwaway Gmail accounts holding synthetic Acme emails** are ever connected (principle 9). Never connect a real inbox. Import needs internet at the venue: `.eml` upload and the cached demo remain the fallbacks (§21).

**Not claimed.** DataTrace does not claim to "sync" Gmail, to monitor an inbox, to be Google-verified, to verify DKIM or sender authenticity, or to support accounts other than the listed test users.

---

# 6. Outputs & the Unified Case Report

## 6.1 Output inventory

Extracted claims; privacy entities (controllers, processors, data subjects, systems, data categories); dated events; controlled relationships; request-response matrix; friction signals; contradiction candidates and confirmed contradictions; verification results (rule outcomes and state transitions); append-only audit log; the case report.

## 6.2 One report, three lenses

```text
                          CASE REPORT (one record)
        ┌──────────────────────┼──────────────────────┐
   EVIDENCE LENS          FINDINGS LENS          COMPLAINT LENS
 evidence inventory     verified + corroborated   grounded formal draft
 SHA-256 + integrity    qualified AI inferences   framework articles
 provenance + locators  contradictions + rules    explicit citations, editable
```

## 6.3 Report pipeline

1. **Filter.** User selects scope; default is `VERIFIED` and `CORROBORATED` findings. `AI_INFERRED` is included only with a visible qualifier.
2. **Draft.** The model drafts text from the supplied finding references only (§14).
3. **Ground.** `report_grounding.v1` validates every assertion block against finding IDs. Failure blocks export.
4. **Export.** Markdown and JSON (P0); PDF with provenance footer (P1). Each export carries the case's audit-chain head hash.

---

# 7. Architecture & Technology Decisions

## 7.1 System architecture

```text
                         USER / BROWSER  (A)
        Next.js UI: dashboard, evidence viewer, timeline, graph,
        request-response matrix, live report editor, audit view
                               │  HTTPS, Supabase access token in the Authorization header
                               ▼
        frontend/app/api/[[...slug]]/route.ts   (A) one thin adapter, written once, then frozen
                               │  route(request, slug[])
                               ▼
        backend/api/router.ts   (B) route table · auth · Zod in/out · handlers · orchestration
              │                         │                          │
              ▼                         ▼                          ▼
   DATABASE & STORAGE (C)      AI PRIVACY GATEWAY (D)      VERIFICATION ENGINE (D)
   Postgres + RLS              consent check               pure TypeScript rules,
   private Storage             minimization                no network, no AI imports
   hash-chained audit          prompt registry             reads findings + evidence,
                               provider adapter            writes states + results
                               Zod validation
                               citation/reference resolution
                                      │                            ▲
                                      └──── candidate findings ────┘
```

The verification engine sits **outside** `ai/` on purpose: the folder layout itself shows that AI proposes and code verifies.

## 7.2 Component boundaries

| Component | Responsible for | Forbidden |
|---|---|---|
| **Frontend (A)** | Rendering; calling the REST API through `lib/api.ts`; showing basis and state distinctly; whole-segment citation navigation | Direct database queries; any Storage access to evidence; showing a candidate as verified; holding any secret |
| **Backend (B)** | Auth validation, uploads, parsing, orchestration, download authorization, calling the Gateway and the engine; P1-0: Gmail OAuth and import | Calling an AI provider directly; embedding prompts in business logic; importing `next/*`; exposing, logging or auditing a Gmail token |
| **Database/Storage (C)** | Persistence, migrations, RLS and grants, private storage, display-ID generation, append-only audit | Public storage; client write or DELETE privileges; mutating audit rows; skipping foreign keys |
| **Gateway (D)** | Consent check, minimization, provider call, schema validation, resolving candidate citations and references to database IDs, audit of every call | Setting verification states; accepting UUIDs from a model; writing findings outside its persistence transaction |
| **Verification engine (D)** | Deterministic rules; state transitions; recording each result | Network or AI calls; inventing evidence; trusting AI text over citations |

## 7.3 Technology decisions

| Concern | Decision |
|---|---|
| Language | TypeScript (strict) everywhere |
| Monorepo | npm workspaces: `frontend`, `backend`, `ai`, `verification`, `contracts` (package names `@datatrace/*`) |
| Web app | Next.js 14+ (App Router), Tailwind CSS, shadcn/ui. `next.config` sets `transpilePackages` for the `@datatrace/*` workspace packages so the adapter can import them. |
| Graph | React Flow (Cytoscape is dropped) |
| API | **One adapter, one router.** `frontend/app/api/[[...slug]]/route.ts` (A) exports `GET/POST/PUT/PATCH/DELETE` and calls `route()` from `backend/api/router.ts` (B). No separate Fastify server or other backend framework. Details in §7.5. |
| Worker | `backend/jobs/worker.ts`, a Node process that polls `analysis_tasks` (`QUEUED`) using the service-role key. Run with `npm run worker`. |
| Database | Supabase (Postgres, Auth, private Storage). Local development with the Supabase CLI. |
| Validation | Zod, at every boundary (API in/out, AI out) |
| Parsing | `mailparser` (email), a PDF text library (text PDFs), `mammoth` (DOCX) |
| AI | `AIProvider` interface; Grok (xAI) as development provider; `mock` provider mandatory; vision flag per provider. Provider JSON schemas are generated from the Zod contracts (`zod-to-json-schema`). |
| Gmail import (P1-0) | Google OAuth 2.0 web-server flow and the Gmail REST API called with plain `fetch` (no heavy SDK), scope `gmail.readonly`, Google app in Testing status; `GmailClient` interface with a fixture-backed `mock`; refresh tokens encrypted with AES-256-GCM (Node `crypto`) |
| Tests | Vitest (unit, synthetic runner, jsdom component tests), pgTAP (RLS, grants, audit chain), GitHub Actions CI |
| Demo runtime | **Local-first**: the presentation laptop runs the app against Supabase (local CLI or cloud project) with `DEMO_MODE` cached runs. Public deployment (web on a Node host, worker on one small container) is P2. |

Explicitly not used: graph or vector databases, embeddings, LangChain/LlamaIndex, Redis, Kafka, WebSockets, external queues, microservices.

## 7.4 `.env.example`

```bash
# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server only, never in client bundles

# --- AI ---
AI_PROVIDER=grok                    # grok | mock | <future provider>
AI_FALLBACK_PROVIDER=none
XAI_API_KEY=                        # server only
AI_MODEL=
AI_TIMEOUT_MS=30000
AI_MAX_RETRIES=2
AI_TOKEN_BUDGET_PER_RUN=100000

# --- Evidence access ---
SIGNED_URL_TTL_SECONDS=60           # lifetime of a backend-issued evidence download URL
MAX_UPLOAD_MB=20

# --- Gmail import (P1-0). Testing-mode Google app; throwaway accounts with synthetic emails only ---
GMAIL_MODE=mock                     # live | mock (mock replays fixtures; CI and DEMO_MODE always use mock)
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=                # server only
GMAIL_REDIRECT_URI=http://localhost:3000/gmail/callback
GMAIL_STATE_SECRET=                 # server only; 32+ random bytes; signs the OAuth state
GMAIL_TOKEN_ENC_KEY=                # server only; base64 of 32 random bytes; encrypts refresh tokens at rest
GMAIL_MAX_MESSAGES_PER_IMPORT=10

# --- App ---
APP_BASE_URL=http://localhost:3000
DEMO_MODE=false                     # true = serve cached, pre-analyzed runs
```

## 7.5 API adapter and router contract

**Adapter (Member A; written once, then frozen):**

```typescript
// frontend/app/api/[[...slug]]/route.ts
import { route } from '@datatrace/backend/api/router';

export const runtime = 'nodejs';          // service-role and parsing code need Node APIs
export const dynamic = 'force-dynamic';   // never cache API responses

async function handler(req: Request, ctx: { params: Promise<{ slug?: string[] }> | { slug?: string[] } }) {
  const { slug = [] } = await ctx.params; // `await` works for both Next 14 (object) and Next 15 (Promise)
  return route(req, slug);
}
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
```

An optional catch-all (`[[...slug]]`) under `app/api/` also matches `/api` itself and all nested paths, so no other file is needed under `app/api/`.

**Router (Member B):**

```typescript
// backend/api/router.ts. Framework-agnostic: Web-standard Request/Response only, no `next/*` imports.
export async function route(req: Request, slug: string[]): Promise<Response>;

export interface RouteDef {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  pattern: string;                       // '/cases/:id/analyze'
  auth: 'user' | 'none';                 // only /health is 'none'
  input?: ZodTypeAny;                    // body/query schema from contracts/
  output?: ZodTypeAny;
  handler: (ctx: HandlerContext) => Promise<unknown | Response>;
}
export interface HandlerContext {
  req: Request;
  params: Record<string, string>;
  user: { id: string; accessToken: string };
  db: SupabaseClient;                    // runs under the user's JWT, so RLS applies (reads and ownership checks)
  admin: SupabaseClient;                 // service role; writes only after an explicit ownership check
}
```

Behaviour: match method and pattern (a small hand-written matcher over the route table; unknown route → `404 NOT_FOUND`) → authenticate (`Authorization: Bearer <access token>`, verified with `supabase.auth.getUser`; failure → `401`) → validate input → run handler → validate output → JSON response. Errors use `{ "error": { "code": string, "message": string } }`; unexpected exceptions return `500 INTERNAL` without internals. A resource that exists but belongs to another user returns `404`, not `403`, so existence is not leaked.

**Frontend helper (Member A):** `frontend/lib/api.ts` exports `apiFetch(path, init)`, which attaches the current Supabase access token and parses the standard error envelope. Components call `apiFetch`; they never call `fetch('/api/...')` or Supabase tables directly.

**Handler files (Member B):** `backend/api/{router,routes,health,cases,evidence,consent,analyze,findings,reports,audit,gmail}.ts` (`gmail` is P1-0). Every handler that takes a case, or an object inside a case, calls `assertCaseOwner()` (§3.4) before any read or write. New endpoints are added by editing `routes.ts` and a handler file only.

---

# 8. Repository Structure

```text
datatrace/
├── .github/workflows/ci.yml        # lint, typecheck, unit, supabase db reset + pgTAP, synthetic suite
├── README.md                       # pitch, architecture picture, quickstart, demo link
├── LICENSE                         # decide before publishing (MIT suggested)
├── SECURITY.md                     # how to report a vulnerability (short)
├── .env.example
├── .gitignore                      # node_modules, .env*, raw evidence, build output
├── package.json  tsconfig.json     # workspace root, strict TS
│
├── frontend/                       # A
│   ├── app/                        # pages: cases, evidence, graph, matrix, timeline, report, audit, gmail/callback (P1-0)
│   │   └── api/[[...slug]]/route.ts  # THE adapter → backend/api/router.ts (A writes once, then frozen)
│   ├── components/                 # CaseGraph, Timeline, MatrixView, EvidenceViewer, LiveEditor, StateBadge
│   └── lib/                        # api.ts (apiFetch), supabase browser client (auth only)
├── backend/                        # B
│   ├── api/                        # router.ts, routes.ts, health, cases, evidence, consent, analyze, findings, reports, audit, gmail (P1-0)
│   ├── ingestion/                  # extractors, rfc822 parser, segmenter, parseEvidencePath
│   ├── jobs/worker.ts              # task runner
│   ├── integrations/               # P1-0: gmail.ts (GmailClient, live + mock), tokenVault.ts (AES-256-GCM)
│   └── probes/                     # P2: httpProbes.ts
├── ai/                             # D — everything that may call a model
│   ├── gateway/                    # gateway.ts, minimizer.ts, consent.ts, resolver.ts (citation + reference resolution)
│   ├── providers/                  # interface.ts, grok.ts, mock.ts
│   ├── prompts/                    # registry.ts, extraction.v1.ts, friction.v1.ts, contradiction.v1.ts, reportDraft.v1.ts
│   └── parsers/                    # candidate normalizers
├── verification/                   # D — deterministic only, no network, no AI imports
│   ├── engine.ts
│   └── rules/                      # one file per rule (§12.3): citationIntegrity, claimVerification, provenance,
│                                   # entityReference, relationshipTaxonomy, eventConsistency, requestResponse,
│                                   # frictionValidation, contradictionSupport, corroboration, reportGrounding
├── database/                       # C — helpers that the Supabase CLI does not manage
│   └── security/                   # hashing helpers, assertCaseOwner.ts
├── supabase/                       # C — standard Supabase CLI layout
│   ├── config.toml                 # includes the private `evidence` bucket
│   ├── migrations/                 # 001_core · 002_findings · 003_rls_and_storage · 004_audit_chain · 005_gmail_import (P1-0)
│   ├── seed.sql                    # deterministic synthetic demo data (display IDs are DB-generated)
│   └── tests/database/             # pgTAP: RLS, grants, storage, display IDs, indexes, audit chain
├── contracts/                      # SHARED — canonical Zod schemas and types
│   ├── index.ts
│   ├── normalize.ts                # normalizeText, normalizeToken, claimKey (§10)
│   ├── schemas/                    # evidence, locators, citations, findings, payloads, analysis, reports, predicates, frameworks
│   └── types/
├── tests/
│   ├── synthetic/                  # golden scenarios (JSON) + recorded provider fixtures (AI-facing candidate form)
│   │                               # gmail/: raw-message fixtures for GMAIL_MODE=mock (P1-0)
│   └── integration/
└── docs/
    ├── MASTER_SPEC.md              # this file
    ├── idea-submission.md          # Round 1 answers (§2.3)
    ├── api.md                      # endpoint documentation (§16)
    ├── security.md                 # threat model and RLS notes (§15)
    └── integration.md              # live module readiness board (§19.4)
```

---

# 9. Data Model

Conventions: UUID primary keys; human-readable `display_id` per case (`EV-101`, `FND-201`); `CHECK` constraints enforce the controlled vocabularies; timestamps are `TIMESTAMPTZ`.

## 9.1 Schema

```sql
CREATE SEQUENCE case_display_seq START 101;   -- DB-side source of case display IDs

-- 1. Cases (archived, never hard-deleted; owner FK is RESTRICT so audit rows are never cascaded away)
CREATE TABLE cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    display_id VARCHAR(32) NOT NULL UNIQUE DEFAULT ('CASE-' || nextval('case_display_seq')::text),  -- 'CASE-101', database-generated
    title TEXT NOT NULL,
    description TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED','CLOSED')),
    evidence_counter INT NOT NULL DEFAULT 100,              -- per-case counters behind EV-/FND- display IDs (§9.1 triggers)
    finding_counter INT NOT NULL DEFAULT 200,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. AI consent history (consent is active when a row exists with revoked_at IS NULL)
CREATE TABLE ai_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    policy_version VARCHAR(32) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    scope JSONB NOT NULL,                                   -- what may be sent, minimization mode
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

-- 3. Evidence items (originals). Original-evidence fields are immutable, enforced by trg_evidence_immutable (§9.1.1);
--    only processing_status, soft delete (deleted_at) and a one-time captured_at may change.
CREATE TABLE evidence_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    display_id VARCHAR(32) NOT NULL,                        -- 'EV-101'
    source_type VARCHAR(16) NOT NULL CHECK (source_type IN ('EMAIL','DOCUMENT','SCREENSHOT','MANUAL_LOG')),
    original_filename TEXT NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    size_bytes BIGINT NOT NULL,
    storage_path TEXT NOT NULL,                             -- cases/{case_id}/evidence/{id}/original (the backend supplies `id`)
    sha256 CHAR(64) NOT NULL,
    captured_at TIMESTAMPTZ,                                -- when the evidence was created in the world, if known
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
        CHECK (processing_status IN ('PENDING','PROCESSED','FAILED','QUARANTINED')),
    deleted_at TIMESTAMPTZ,
    ingest_source VARCHAR(16) NOT NULL DEFAULT 'UPLOAD'
        CHECK (ingest_source IN ('UPLOAD','GMAIL_IMPORT')),  -- v1.4.2: how the original reached DataTrace ('UPLOAD' covers file upload and manual log)
    external_ref TEXT,                                      -- v1.4.2: Gmail message ID when ingest_source = 'GMAIL_IMPORT', otherwise NULL
    CONSTRAINT uk_case_evidence UNIQUE (case_id, display_id),
    CONSTRAINT uk_evidence_id_case UNIQUE (id, case_id),            -- target of composite foreign keys (database-enforced case boundary)
    -- the path is derived from the row's own IDs, so a malformed or foreign path cannot be stored (no casts involved)
    CONSTRAINT ck_storage_path CHECK (storage_path = 'cases/' || case_id::text || '/evidence/' || id::text || '/original'),
    -- v1.4.2: a Gmail-imported item carries its Gmail message ID, and only a Gmail-imported item does
    CONSTRAINT ck_external_ref CHECK ((ingest_source = 'GMAIL_IMPORT') = (external_ref IS NOT NULL)
                                      AND (external_ref IS NULL OR length(external_ref) <= 64))
);

-- 4. Evidence artifacts (derived representations; never overwrite, add a version)
CREATE TABLE evidence_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
    artifact_type VARCHAR(32) NOT NULL CHECK (artifact_type IN ('NORMALIZED_TEXT','METADATA_JSON','TRANSCRIPT')),
    extraction_method VARCHAR(16) NOT NULL CHECK (extraction_method IN ('PARSER','AI_VISION','MANUAL')),
    version INT NOT NULL DEFAULT 1,
    storage_path TEXT,
    raw_content TEXT,
    created_by_process VARCHAR(64) NOT NULL,                -- tool and version
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_artifact_evidence UNIQUE (id, evidence_id)
);

-- 5. Evidence segments (atomic citation targets)
CREATE TABLE evidence_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
    artifact_id UUID NOT NULL,                              -- composite FK below: the artifact must belong to the same evidence item
    ordinal INT NOT NULL CHECK (ordinal >= 1),              -- 1-based; the number a model cites together with the evidence display ID
    locator_type VARCHAR(32) NOT NULL CHECK (locator_type IN ('PAGE','PAGE_PARAGRAPH','CHAR_RANGE','LINE_NUMBER','TIMESTAMP')),
    locator JSONB NOT NULL,                                 -- {"page":2,"paragraph":4} | {"start":120,"end":450}
    segment_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_segment_artifact FOREIGN KEY (artifact_id, evidence_id)
        REFERENCES evidence_artifacts (id, evidence_id) ON DELETE CASCADE,
    CONSTRAINT uk_segment_evidence UNIQUE (id, evidence_id)
);

-- 6. Analysis runs
CREATE TABLE analysis_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED')),
    requested_by UUID NOT NULL REFERENCES auth.users(id),
    configuration_version VARCHAR(32) NOT NULL DEFAULT '1.0',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 7. Analysis tasks (one provider call each)
CREATE TABLE analysis_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
    task_type VARCHAR(32) NOT NULL CHECK (task_type IN
        ('extraction','response_analysis','friction_analysis','contradiction_consolidation','report_draft','vision_transcription')),
    status VARCHAR(16) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED')),
    input_evidence_scope JSONB NOT NULL,                    -- display ID, display ID array, or [{evidenceDisplayId, segmentOrdinals}]
    prompt_id VARCHAR(64) NOT NULL,
    prompt_version VARCHAR(32) NOT NULL,
    schema_name VARCHAR(64) NOT NULL,
    schema_version VARCHAR(32) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    model VARCHAR(64) NOT NULL,
    minimization_metadata JSONB NOT NULL,
    raw_output_ref TEXT,                                    -- pointer; raw output is not logged inline
    output_sha256 CHAR(64),
    validated_output JSONB,
    tokens_in INT, tokens_out INT, latency_ms INT,
    retry_count INT NOT NULL DEFAULT 0,
    fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Findings (unified)
CREATE TABLE findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    display_id VARCHAR(32) NOT NULL,                        -- 'FND-201'
    finding_type VARCHAR(32) NOT NULL CHECK (finding_type IN
        ('CLAIM','ENTITY','EVENT','RELATIONSHIP','REQUEST','RESPONSE','FRICTION_SIGNAL','CONTRADICTION','DATA_CATEGORY')),
    statement TEXT NOT NULL,
    structured_payload JSONB NOT NULL,
    evidence_basis VARCHAR(16) NOT NULL CHECK (evidence_basis IN ('DIRECT','OBSERVED','INFERRED','CONFLICTING')),
    verification_state VARCHAR(16) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (verification_state IN ('UNVERIFIED','AI_INFERRED','CORROBORATED','VERIFIED','CONTRADICTED')),
    candidate_confidence NUMERIC(4,3) CHECK (candidate_confidence BETWEEN 0 AND 1),   -- model's own number; never proof
    source_task_id UUID REFERENCES analysis_tasks(id),
    supersedes_id UUID REFERENCES findings(id),
    human_confirmed_by UUID REFERENCES auth.users(id),
    human_confirmed_at TIMESTAMPTZ,
    source_unavailable BOOLEAN NOT NULL DEFAULT FALSE,      -- TRUE when a cited evidence item is soft-deleted or QUARANTINED
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_case_finding UNIQUE (case_id, display_id),
    CONSTRAINT uk_finding_id_case UNIQUE (id, case_id),             -- target of composite foreign keys (database-enforced case boundary)
    -- model-derived or conflicting findings can never be VERIFIED (basis check only; the requirement that a rule actually
    -- passed is enforced by trg_findings_state_guard, §9.1.1)
    CONSTRAINT ck_verified_basis CHECK (verification_state <> 'VERIFIED' OR evidence_basis IN ('DIRECT','OBSERVED')),
    -- only a CONTRADICTION finding can hold the CONTRADICTED state
    CONSTRAINT ck_contradicted_type CHECK (verification_state <> 'CONTRADICTED' OR finding_type = 'CONTRADICTION'),
    -- a finding whose source is gone can only be UNVERIFIED
    CONSTRAINT ck_source_unavailable CHECK (NOT source_unavailable OR verification_state = 'UNVERIFIED'),
    -- a CLAIM must carry a complete normalized claim (mirrors ClaimPayloadSchema; Zod is the first gate, this is the last)
    CONSTRAINT ck_claim_payload CHECK (finding_type <> 'CLAIM' OR COALESCE(
        (structured_payload #>> '{normalizedClaim,subject}')   IS NOT NULL
        AND (structured_payload #>> '{normalizedClaim,predicate}') IS NOT NULL
        AND (structured_payload #>> '{normalizedClaim,object}')    IS NOT NULL
        AND (structured_payload #>> '{normalizedClaim,polarity}') IN ('AFFIRMS','DENIES'), FALSE))
);

-- 9. Citations
CREATE TABLE citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    finding_id UUID NOT NULL,
    evidence_id UUID NOT NULL,
    segment_id UUID,
    locator_type VARCHAR(32) NOT NULL CHECK (locator_type IN ('PAGE','PAGE_PARAGRAPH','CHAR_RANGE','LINE_NUMBER','TIMESTAMP')),
    locator JSONB NOT NULL,
    quoted_text TEXT,
    validation_status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (validation_status IN ('PENDING','VALID','INVALID')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Case boundary enforced by the database: the finding, the evidence item and the segment must all belong to citations.case_id.
    CONSTRAINT fk_citation_finding  FOREIGN KEY (finding_id,  case_id) REFERENCES findings (id, case_id)       ON DELETE CASCADE,
    CONSTRAINT fk_citation_evidence FOREIGN KEY (evidence_id, case_id) REFERENCES evidence_items (id, case_id) ON DELETE CASCADE,
    -- The segment must belong to the cited evidence item (MATCH SIMPLE: not checked while segment_id IS NULL).
    -- The column-list form of SET NULL requires PostgreSQL 15 or later.
    CONSTRAINT fk_citation_segment  FOREIGN KEY (segment_id, evidence_id) REFERENCES evidence_segments (id, evidence_id)
        ON DELETE SET NULL (segment_id)
);

-- 10. Relationships (graph edges; controlled taxonomy)
CREATE TABLE relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    from_finding_id UUID NOT NULL,
    to_finding_id UUID NOT NULL,
    relationship_type VARCHAR(32) NOT NULL CHECK (relationship_type IN
        ('SENT_TO','SENT_BY','REQUESTED_FROM','RESPONDED_TO','ABOUT','RELATES_TO',
         'PROCESSES','CONTAINS','CONTRADICTS','FOLLOWED_BY','ASSOCIATED_WITH')),
    evidence_basis VARCHAR(16) NOT NULL CHECK (evidence_basis IN ('DIRECT','OBSERVED','INFERRED','CONFLICTING')),
    verification_state VARCHAR(16) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (verification_state IN ('UNVERIFIED','AI_INFERRED','CORROBORATED','VERIFIED','CONTRADICTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- both endpoints must belong to this relationship's case
    CONSTRAINT fk_rel_from FOREIGN KEY (from_finding_id, case_id) REFERENCES findings (id, case_id) ON DELETE CASCADE,
    CONSTRAINT fk_rel_to   FOREIGN KEY (to_finding_id,   case_id) REFERENCES findings (id, case_id) ON DELETE CASCADE
);

-- 11. Request-response links (request-response matrix rows)
CREATE TABLE request_response_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    request_finding_id UUID NOT NULL,
    response_finding_id UUID,
    status VARCHAR(16) NOT NULL CHECK (status IN ('ANSWERED','PARTIAL','UNANSWERED','DEFLECTED','UNCLEAR')),
    rationale TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- both findings must belong to this link's case (MATCH SIMPLE: response may be NULL for UNANSWERED)
    CONSTRAINT fk_rrl_request  FOREIGN KEY (request_finding_id,  case_id) REFERENCES findings (id, case_id) ON DELETE CASCADE,
    CONSTRAINT fk_rrl_response FOREIGN KEY (response_finding_id, case_id) REFERENCES findings (id, case_id) ON DELETE CASCADE
);

-- 12. Verification results (rule evaluation ledger)
CREATE TABLE verification_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    finding_id UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
    rule_id VARCHAR(64) NOT NULL,                           -- 'citation_integrity.v1'
    input_snapshot JSONB NOT NULL,
    outcome VARCHAR(16) NOT NULL CHECK (outcome IN ('PASS','FAIL','INCONCLUSIVE')),
    previous_state VARCHAR(16) NOT NULL,
    resulting_state VARCHAR(16) NOT NULL,
    details JSONB,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Case reports (content is block-structured, see §14.2)
CREATE TABLE case_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    report_version INT NOT NULL DEFAULT 1,
    active_lens VARCHAR(16) NOT NULL DEFAULT 'EVIDENCE' CHECK (active_lens IN ('EVIDENCE','FINDINGS','COMPLAINT')),
    status VARCHAR(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','VALIDATED','EXPORTED')),
    content JSONB NOT NULL,
    validation_status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (validation_status IN ('PENDING','PASSED','FAILED')),
    validation_details JSONB,
    generated_from_run_id UUID REFERENCES analysis_runs(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Audit events (append-only, hash-chained per case; see §9.3)
CREATE TABLE audit_events (
    seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
    case_seq BIGINT NOT NULL,                               -- per-case chain position, assigned by trg_audit_chain under the per-case lock (§9.3)
    actor_type VARCHAR(16) NOT NULL CHECK (actor_type IN ('USER','SYSTEM','AI_GATEWAY')),
    actor_id TEXT NOT NULL,
    entity_type VARCHAR(32) NOT NULL,
    entity_id TEXT NOT NULL,
    action VARCHAR(64) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL,                                -- IDs, counts, versions. Never evidence text or PII.
    prev_hash CHAR(64) NOT NULL,
    row_hash CHAR(64) NOT NULL,
    CONSTRAINT uk_audit_case_seq UNIQUE (case_id, case_seq)
);

-- 15. Gmail connections (P1-0, v1.4.2; created by migration 005_gmail_import). One row per user, holding a credential.
--     Clients get NO access at all: no grant, RLS enabled, no policy. Not even the owner can SELECT it.
--     Only the backend (service role) reads or writes it.
CREATE TABLE gmail_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    google_email TEXT NOT NULL,                             -- the linked mailbox, shown to the user so they know which account is connected
    scope TEXT NOT NULL CHECK (scope = 'https://www.googleapis.com/auth/gmail.readonly'),
    refresh_token_enc TEXT NOT NULL,                        -- AES-256-GCM ciphertext (key: GMAIL_TOKEN_ENC_KEY). Never plaintext, never logged
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED')),
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);
ALTER TABLE gmail_connections ENABLE ROW LEVEL SECURITY;    -- no policy exists, so anon and authenticated are denied
REVOKE ALL ON gmail_connections FROM anon, authenticated;   -- explicit, although default privileges already revoke it (§9.2)

-- Display IDs are generated by the database; callers never supply them (any supplied value is overwritten).
CREATE FUNCTION public.assign_display_id() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
  IF TG_TABLE_NAME = 'evidence_items' THEN
    UPDATE cases SET evidence_counter = evidence_counter + 1 WHERE id = NEW.case_id RETURNING evidence_counter INTO n;
    NEW.display_id := 'EV-' || n;
  ELSE
    UPDATE cases SET finding_counter = finding_counter + 1 WHERE id = NEW.case_id RETURNING finding_counter INTO n;
    NEW.display_id := 'FND-' || n;
  END IF;
  RETURN NEW;
END $$;   -- the UPDATE row-locks the case, so concurrent inserts get distinct, gap-free-per-commit numbers
CREATE TRIGGER trg_evidence_display_id BEFORE INSERT ON evidence_items
  FOR EACH ROW EXECUTE FUNCTION public.assign_display_id();
CREATE TRIGGER trg_finding_display_id BEFORE INSERT ON findings
  FOR EACH ROW EXECUTE FUNCTION public.assign_display_id();

-- Indexes: support the query paths below (RLS helpers, case-scoped lists, parent-to-child reads,
-- worker polling, source-deletion fan-out). They support query performance; no latency figure is promised.
CREATE INDEX ON ai_consents (case_id) WHERE revoked_at IS NULL;          -- "is AI enabled for this case?"
CREATE INDEX ON evidence_items (case_id);
CREATE UNIQUE INDEX uk_evidence_external_ref ON evidence_items (case_id, external_ref) WHERE external_ref IS NOT NULL;   -- v1.4.2: idempotent Gmail import
CREATE INDEX ON evidence_artifacts (evidence_id);
CREATE INDEX ON evidence_segments (evidence_id);
CREATE UNIQUE INDEX uk_segment_ordinal ON evidence_segments (artifact_id, ordinal);
CREATE INDEX ON analysis_runs (case_id);
CREATE INDEX ON analysis_tasks (run_id);
CREATE INDEX ON analysis_tasks (created_at) WHERE status = 'QUEUED';     -- worker polling
CREATE INDEX ON findings (case_id, finding_type, verification_state);
CREATE INDEX ON citations (finding_id);
CREATE INDEX ON citations (case_id);
CREATE INDEX ON citations (evidence_id);                                  -- find findings affected by a deleted/quarantined item
CREATE INDEX ON relationships (case_id);
CREATE INDEX ON request_response_links (case_id);
CREATE INDEX ON verification_results (finding_id);
CREATE INDEX ON case_reports (case_id);
-- audit_events: the unique constraint uk_audit_case_seq (case_id, case_seq) is the index used for chain reads (§9.3)
```

### 9.1.1 Database-enforced invariants (triggers)

The backend holds the service-role key, which bypasses RLS and can write to every table. Invariants that must survive a backend bug therefore live in the schema (composite foreign keys above, and the triggers below), not only in handler code or grants. A database superuser can still disable triggers; that residual limit is stated in §9.3 and §15.8.

**Original evidence is immutable.** Only `processing_status`, `deleted_at` (set once, never cleared) and a one-time `captured_at` may change after insert.

```sql
CREATE FUNCTION public.evidence_items_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id               IS DISTINCT FROM OLD.id
  OR NEW.case_id          IS DISTINCT FROM OLD.case_id
  OR NEW.display_id       IS DISTINCT FROM OLD.display_id
  OR NEW.source_type      IS DISTINCT FROM OLD.source_type
  OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
  OR NEW.mime_type        IS DISTINCT FROM OLD.mime_type
  OR NEW.size_bytes       IS DISTINCT FROM OLD.size_bytes
  OR NEW.storage_path     IS DISTINCT FROM OLD.storage_path
  OR NEW.sha256           IS DISTINCT FROM OLD.sha256
  OR NEW.ingest_source    IS DISTINCT FROM OLD.ingest_source
  OR NEW.external_ref     IS DISTINCT FROM OLD.external_ref
  OR NEW.uploaded_at      IS DISTINCT FROM OLD.uploaded_at THEN
    RAISE EXCEPTION 'evidence_items: original-evidence fields are immutable' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  -- captured_at may be set once (ingestion, from parsed headers) and never changed afterwards
  IF OLD.captured_at IS NOT NULL AND NEW.captured_at IS DISTINCT FROM OLD.captured_at THEN
    RAISE EXCEPTION 'evidence_items: captured_at is already set' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  -- a tombstone cannot be undone
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'evidence_items: deleted_at cannot be changed or cleared' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_evidence_immutable BEFORE UPDATE ON evidence_items
  FOR EACH ROW EXECUTE FUNCTION public.evidence_items_guard();
```

**`VERIFIED` and `CONTRADICTED` can be reached only through the engine.** A finding is inserted as `UNVERIFIED`. It may enter `VERIFIED` or `CONTRADICTED` only in a transaction that also wrote a matching `PASS` row in `verification_results` from a rule allowed to set that state. Demotions (to `UNVERIFIED` or `AI_INFERRED`) are always allowed because they only reduce trust.

```sql
CREATE FUNCTION public.findings_state_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_ok BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.verification_state IN ('VERIFIED','CONTRADICTED') THEN
      RAISE EXCEPTION 'findings are inserted as UNVERIFIED; % is reachable only through the verification engine', NEW.verification_state
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.verification_state IN ('VERIFIED','CONTRADICTED')
     AND NEW.verification_state IS DISTINCT FROM OLD.verification_state THEN
    SELECT EXISTS (
      SELECT 1 FROM verification_results vr
      WHERE vr.finding_id     = NEW.id
        AND vr.outcome        = 'PASS'
        AND vr.previous_state = OLD.verification_state
        AND vr.resulting_state = NEW.verification_state
        AND vr.performed_at   = transaction_timestamp()      -- written in this same transaction (engine must not override performed_at)
        AND ( (NEW.verification_state = 'VERIFIED' AND vr.rule_id IN
                ('claim_verification.v1','relationship_taxonomy.v1','event_consistency.v1','request_response.v1','friction_validation.v1'))
           OR (NEW.verification_state = 'CONTRADICTED' AND vr.rule_id = 'contradiction_support.v1') )
    ) INTO v_ok;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'findings.verification_state % requires a PASS verification_results row from an allowed rule in this transaction',
        NEW.verification_state USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_findings_state_guard BEFORE INSERT OR UPDATE OF verification_state ON findings
  FOR EACH ROW EXECUTE FUNCTION public.findings_state_guard();
```

The rule itself runs in TypeScript (`verification/`), because its semantics (token matching, the hedge gate) are not practical to reimplement in SQL. The trigger is therefore a **backstop** against a buggy or careless write: it guarantees that a state change is accompanied by a recorded rule result, and it does not re-evaluate the rule. The single code path that performs the transition is described in §12.4.

## 9.2 Row-Level Security, grants and Storage

**Model.** Clients (browser, `anon`, `authenticated`) read through RLS and **never write and never delete** in the MVP. All writes, including case creation, evidence handling and audit rows, go through the backend, which checks ownership in code and then uses the service-role key. RLS is the second layer protecting every read path and any accidental client query; the grants below are the third, and the composite foreign keys and triggers of §9.1 and §9.1.1 are the fourth: they apply to the service role too.

```sql
-- 0. Baseline privileges: clients get SELECT only. There is no DELETE privilege for any client role on any table.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
GRANT SELECT ON cases, ai_consents, evidence_items, evidence_artifacts, evidence_segments,
  analysis_runs, analysis_tasks, findings, citations, relationships,
  request_response_links, verification_results, case_reports, audit_events TO authenticated;

-- 1. Ownership helpers (SECURITY DEFINER avoids recursive policy evaluation)
CREATE FUNCTION public.owns_case(p_case UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM cases WHERE id = p_case AND owner_id = auth.uid());
$$;
CREATE FUNCTION public.owns_evidence(p_ev UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM evidence_items e JOIN cases c ON c.id = e.case_id
                 WHERE e.id = p_ev AND c.owner_id = auth.uid());
$$;
CREATE FUNCTION public.owns_finding(p_f UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM findings f JOIN cases c ON c.id = f.case_id
                 WHERE f.id = p_f AND c.owner_id = auth.uid());
$$;
CREATE FUNCTION public.owns_run(p_run UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM analysis_runs r JOIN cases c ON c.id = r.case_id
                 WHERE r.id = p_run AND c.owner_id = auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.owns_case, public.owns_evidence, public.owns_finding, public.owns_run FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.owns_case, public.owns_evidence, public.owns_finding, public.owns_run TO authenticated;

-- 2. Safe cast for any code that must parse an untrusted path segment: NULL instead of an exception (22P02)
CREATE FUNCTION public.try_uuid(p TEXT) RETURNS UUID LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN RETURN p::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN NULL; END $$;

-- 3. Enable RLS everywhere
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['cases','ai_consents','evidence_items','evidence_artifacts','evidence_segments',
    'analysis_runs','analysis_tasks','findings','citations','relationships',
    'request_response_links','verification_results','case_reports','audit_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- 4. Cases: explicit per-command policies. No FOR ALL. No DELETE policy and no DELETE privilege.
CREATE POLICY cases_select ON cases FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY cases_insert ON cases FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY cases_update ON cases FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
-- In the MVP `authenticated` holds only SELECT (step 0), so the INSERT and UPDATE policies are inert. They exist
-- so that if a client write path is ever enabled by an explicit GRANT, it stays scoped to the owner's own rows.
-- Case lifecycle is archive, never delete (§15.5).

-- 5. Tables with a direct case_id: SELECT only, for the case owner
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ai_consents','evidence_items','analysis_runs','findings','citations','relationships',
    'request_response_links','case_reports','audit_events'] LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (public.owns_case(case_id))', t || '_select', t);
  END LOOP;
END $$;

-- 6. Tables reached through a parent: SELECT only
CREATE POLICY evidence_artifacts_select   ON evidence_artifacts   FOR SELECT TO authenticated USING (public.owns_evidence(evidence_id));
CREATE POLICY evidence_segments_select    ON evidence_segments    FOR SELECT TO authenticated USING (public.owns_evidence(evidence_id));
CREATE POLICY analysis_tasks_select       ON analysis_tasks       FOR SELECT TO authenticated USING (public.owns_run(run_id));
CREATE POLICY verification_results_select ON verification_results FOR SELECT TO authenticated USING (public.owns_finding(finding_id));
```

**`gmail_connections` (P1-0).** The table is deliberately outside the client read model: it is not in the `GRANT SELECT` list, it has RLS enabled and no policy, so `anon` and `authenticated` can neither read nor write it, even for their own row. The backend reads and writes it with the service role, always filtered by the caller's own verified user id, so a user can only ever act on their own row. It holds the only long-lived third-party credential in the system, which is why it gets stricter treatment than the case tables (§15.9).

**Storage (private bucket `evidence`, `public = false`).** There is **no client access to evidence objects at all**: no download, no listing, no upload, no client-created signed URL. That removes any route around the audited download flow in §5.2.

```sql
-- No permissive policy exists for client roles on bucket 'evidence'. This RESTRICTIVE policy makes the intent explicit
-- and survives any permissive policy added later by mistake. It performs no path parsing, so it cannot raise cast errors.
CREATE POLICY evidence_bucket_no_client_access ON storage.objects AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (bucket_id <> 'evidence') WITH CHECK (bucket_id <> 'evidence');
```

Uploads, deletes and signed-URL creation are performed only by the backend with the service role. Any future policy or function that must read a path segment uses `try_uuid()` and treats `NULL` as *deny*.

**Required tests (pgTAP, in CI):**
1. User B reads zero rows of user A's data in every table above.
2. `authenticated` has no `DELETE` (and no `INSERT`/`UPDATE`) privilege on any table; an attempted `DELETE FROM cases` fails with insufficient privilege.
3. User B cannot read, list, upload, or create a signed URL for user A's evidence object; neither can user A directly (only the backend can).
4. `try_uuid('../x')` and `try_uuid('not-a-uuid')` return `NULL`; inserting an `evidence_items` row with a malformed `storage_path` fails with a check violation, not a cast error.
5. `display_id` values are generated (`CASE-101`, `EV-101`, `FND-201` on a fresh database), unique under concurrent inserts, and cannot be overridden by the caller.
6. The indexes in §9.1 exist (`pg_indexes`) and all migrations apply from empty with `supabase db reset`.
7. A `CLAIM` finding without a complete `normalizedClaim` is rejected by `ck_claim_payload`; a `VERIFIED` finding with `evidence_basis = 'INFERRED'` is rejected by `ck_verified_basis`.
8. A citation whose finding, evidence item or segment belong to different cases is rejected by the composite foreign keys; so is a citation whose segment belongs to a different evidence item, a segment whose artifact belongs to a different evidence item, and a relationship or request-response link whose findings belong to another case.
9. As the service role, `UPDATE` of `sha256`, `storage_path`, `original_filename`, `mime_type`, `size_bytes`, `case_id`, `display_id`, `uploaded_at`, `ingest_source` or `external_ref` on `evidence_items` fails; `UPDATE` of `processing_status` and `deleted_at` succeeds; a set `deleted_at` or `captured_at` cannot be changed or cleared.
10. As the service role, setting `findings.verification_state` to `VERIFIED` or `CONTRADICTED` without a same-transaction `PASS` row in `verification_results` from an allowed rule fails; `INSERT` as `VERIFIED` fails; the engine path succeeds; demotion to `UNVERIFIED` always succeeds.
11. Two interleaved audit inserts for the same case leave `verify_audit_chain` intact and `case_seq` gap-free (§9.3).
12. (P1-0) `authenticated` has no privilege on `gmail_connections` (`SELECT` fails with insufficient privilege); if `SELECT` were granted by mistake, the table would still return zero rows because no policy exists; a `scope` other than `gmail.readonly` is rejected; a second row for the same `user_id` is rejected.
13. (P1-0) `ck_external_ref` rejects a `GMAIL_IMPORT` row without `external_ref` and an `UPLOAD` row with one; inserting the same `(case_id, external_ref)` twice fails on `uk_evidence_external_ref`.

## 9.3 Audit ledger: append-only and hash-chained

The ledger is **tamper-evident**: each row stores the hash of the previous row in the same case, so editing or removing a row breaks every later hash.

```sql
CREATE FUNCTION public.audit_compute_hash(
  p_prev TEXT, p_case UUID, p_case_seq BIGINT, p_actor_type TEXT, p_actor_id TEXT, p_entity_type TEXT,
  p_entity_id TEXT, p_action TEXT, p_at TIMESTAMPTZ, p_meta JSONB
) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(
    p_prev || '|' || p_case::text || '|' || p_case_seq::text || '|' || p_actor_type || '|' || p_actor_id || '|' ||
    p_entity_type || '|' || p_entity_id || '|' || p_action || '|' ||
    to_char(p_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|' || p_meta::text, 'UTF8')), 'hex');
$$;

CREATE FUNCTION public.audit_events_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_prev TEXT; v_last BIGINT;
BEGIN
  -- Take the per-case lock first, THEN read the chain head and assign the per-case position, so chain order equals
  -- commit order for a case. (The global identity column `seq` is allocated before this trigger runs and can therefore
  -- be out of chain order under concurrency; it is only a unique row id and must never be used to order the chain.)
  PERFORM pg_advisory_xact_lock(hashtext(NEW.case_id::text));
  SELECT row_hash, case_seq INTO v_prev, v_last
    FROM audit_events WHERE case_id = NEW.case_id ORDER BY case_seq DESC LIMIT 1;
  NEW.case_seq  := COALESCE(v_last, 0) + 1;
  NEW.prev_hash := COALESCE(v_prev, repeat('0', 64));
  NEW.row_hash  := public.audit_compute_hash(NEW.prev_hash, NEW.case_id, NEW.case_seq, NEW.actor_type, NEW.actor_id,
                     NEW.entity_type, NEW.entity_id, NEW.action, NEW.occurred_at, NEW.metadata);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_audit_chain BEFORE INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_chain();

CREATE FUNCTION public.audit_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_events is append-only'; END $$;
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_immutable();
CREATE TRIGGER trg_audit_no_truncate BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_events_immutable();
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.verify_audit_chain(p_case UUID)
RETURNS TABLE (intact BOOLEAN, first_broken_case_seq BIGINT) LANGUAGE plpgsql STABLE AS $$
DECLARE r RECORD; v_prev TEXT := repeat('0', 64); v_expected BIGINT := 0;
BEGIN
  FOR r IN SELECT * FROM audit_events WHERE case_id = p_case ORDER BY case_seq LOOP
    v_expected := v_expected + 1;
    IF r.case_seq <> v_expected                                   -- a gap means a row was removed
       OR r.prev_hash <> v_prev
       OR r.row_hash <> public.audit_compute_hash(
            v_prev, r.case_id, r.case_seq, r.actor_type, r.actor_id, r.entity_type, r.entity_id, r.action, r.occurred_at, r.metadata) THEN
      RETURN QUERY SELECT FALSE, r.case_seq; RETURN;
    END IF;
    v_prev := r.row_hash;
  END LOOP;
  RETURN QUERY SELECT TRUE, NULL::BIGINT;
END $$;
```

**Honest limits.** A chain detects tampering; it does not stop someone with superuser access from rewriting the whole chain. To raise the cost of that, every report export embeds the case's current chain-head hash, so an exported report can later be checked against the ledger. External anchoring (for example posting the head hash somewhere public) is a stretch idea, not an MVP claim.

**Mandatory audit actions:** `CASE_CREATED/UPDATED/ARCHIVED`; `EVIDENCE_UPLOADED/VIEWED/DELETED/QUARANTINED`; `EVIDENCE_DOWNLOAD_AUTHORIZED`, `EVIDENCE_DOWNLOAD_URL_ISSUED`; `EVIDENCE_IMPORTED` (P1-0, one per imported item; metadata `ingestSource`, `sha256`, no mail content); `AI_CONSENT_RECORDED/REVOKED`; `AI_ANALYSIS_STARTED/COMPLETED/FAILED`; `FINDING_CREATED/UPDATED/SUPERSEDED/CONFIRMED_BY_USER`; `VERIFICATION_RULE_EXECUTED`, `VERIFICATION_STATE_CHANGED`; `REPORT_DRAFTED/VALIDATED/EXPORTED`.

**Audit coverage statement (use this wording, do not broaden it).** Every original-file download is audited (authorization, then URL issuance). Every read of an item's extracted content through the REST API is audited (`EVIDENCE_VIEWED`, `kind: CONTENT`). Direct database reads of derived tables (`evidence_artifacts`, `evidence_segments`, `findings`, ...) by the authenticated case owner are scoped by RLS but are **not** audited. DataTrace therefore never claims that "every evidence read is audited". If that claim is ever required, remove the client `SELECT` grant on the derived tables and serve all reads through the backend.

---

# 10. Contracts (Zod / TypeScript)

`contracts/` is the single source of truth. Schemas are Zod (3.23+ or 4); TypeScript types are inferred. AI output, API input and API output are all validated against these at runtime. The database mirrors the key invariants with `CHECK` constraints (§9.1) so that a validation bug cannot silently corrupt the record. The sketch below is normative for names, fields and rules; minor typing details may differ in code.

## 10.1 Enums, locators and normalization

```typescript
import { z } from 'zod';

export const EvidenceBasisSchema = z.enum([
  'DIRECT',       // stated or shown in the evidence
  'OBSERVED',     // computed by code from structured data (headers, hashes). Never claimed by a model.
  'INFERRED',     // reasoned by a model; must be qualified in the UI
  'CONFLICTING',  // evidence points conflict
]);
// What a model may claim. OBSERVED is assigned only by DataTrace code (parser-derived findings).
export const CandidateBasisSchema = z.enum(['DIRECT', 'INFERRED', 'CONFLICTING']);

export const VerificationStateSchema = z.enum([
  'UNVERIFIED', 'AI_INFERRED', 'CORROBORATED', 'VERIFIED', 'CONTRADICTED',
]);

export const FindingTypeSchema = z.enum([
  'CLAIM', 'ENTITY', 'EVENT', 'RELATIONSHIP', 'REQUEST', 'RESPONSE',
  'FRICTION_SIGNAL', 'CONTRADICTION', 'DATA_CATEGORY',
]);

export const RelationshipTypeSchema = z.enum([
  'SENT_TO', 'SENT_BY', 'REQUESTED_FROM', 'RESPONDED_TO', 'ABOUT', 'RELATES_TO',
  'PROCESSES', 'CONTAINS', 'CONTRADICTS', 'FOLLOWED_BY', 'ASSOCIATED_WITH',
]);

export const FrictionSignalTypeSchema = z.enum([
  'UNANSWERED_REQUEST', 'MISSING_INFORMATION', 'REPEATED_REDIRECTION', 'GENERIC_RESPONSE',
  'REPEATED_REQUEST_FOR_PROVIDED_INFORMATION', 'CONTRADICTORY_INSTRUCTION',
  'UNCLEAR_NEXT_STEP', 'POSSIBLE_DELAY',
]);

export const RequestResponseStatusSchema = z.enum([
  'ANSWERED', 'PARTIAL', 'UNANSWERED', 'DEFLECTED', 'UNCLEAR',
]);

// Locators. PAGE is the P0 PDF locator; PAGE_PARAGRAPH is P1.
export const LocatorTypeSchema = z.enum(['PAGE', 'PAGE_PARAGRAPH', 'CHAR_RANGE', 'LINE_NUMBER', 'TIMESTAMP']);
export const LocatorSchema = z.discriminatedUnion('locatorType', [
  z.object({ locatorType: z.literal('PAGE'),
             locator: z.object({ page: z.number().int().min(1) }).strict() }),
  z.object({ locatorType: z.literal('PAGE_PARAGRAPH'),
             locator: z.object({ page: z.number().int().min(1), paragraph: z.number().int().min(1) }).strict() }),
  z.object({ locatorType: z.literal('CHAR_RANGE'),
             locator: z.object({ start: z.number().int().min(0), end: z.number().int().min(1) }).strict()
                        .refine(l => l.end > l.start) }),
  z.object({ locatorType: z.literal('LINE_NUMBER'),
             locator: z.object({ line: z.number().int().min(1), endLine: z.number().int().min(1).optional() }).strict() }),
  z.object({ locatorType: z.literal('TIMESTAMP'),
             locator: z.object({ startSeconds: z.number().min(0), endSeconds: z.number().min(0) }).strict() }),
]);
```

```typescript
// contracts/normalize.ts: the ONLY text and token normalization used by verification and contradiction matching
export function normalizeText(s: string): string;   // NFKC, lowercase, straighten quotes/dashes, strip zero-width chars, collapse whitespace
export function normalizeToken(s: string): string[]; // normalizeText, split on non-alphanumerics, drop stopwords, sort, de-duplicate
export function claimKey(c: NormalizedClaim): string; // `${predicate}|${normalizeToken(subject).join(' ')}|${normalizeToken(object).join(' ')}`
```

## 10.2 Citations: AI-facing versus persisted

A model never sees or produces an internal UUID. There are two distinct citation shapes.

```typescript
// A. AI-facing candidate citation: what a model returns. Human-readable identifiers only.
export const CandidateCitationSchema = z.object({
  evidenceDisplayId: z.string().regex(/^EV-\d+$/),         // "EV-101"
  segmentOrdinal: z.number().int().min(1),                  // the number shown to the model next to each segment
  locatorType: LocatorTypeSchema,
  locator: z.record(z.string(), z.unknown()),               // echoed from the segment header; checked by the Gateway (§11.8)
  quotedText: z.string().min(1).max(2000).optional(),
}).strict();

// B. Persisted citation: what the database stores and the API returns. UUID foreign keys.
export const PersistedCitationSchema = z.object({
  id: z.string().uuid(),
  findingId: z.string().uuid(),
  evidenceId: z.string().uuid(),
  evidenceDisplayId: z.string(),                            // joined at read time, for the UI
  segmentId: z.string().uuid().nullable(),                  // null only if the segment was removed with its source
  segmentOrdinal: z.number().int().nullable(),
  locatorType: LocatorTypeSchema,
  locator: z.record(z.string(), z.unknown()),               // copied from the stored segment, never from the model
  quotedText: z.string().nullable(),
  validationStatus: z.enum(['PENDING', 'VALID', 'INVALID']),
});
```

The database keeps UUID foreign keys (`citations.evidence_id`, `citations.segment_id`). The Gateway turns `evidenceDisplayId + segmentOrdinal` into those UUIDs before anything is persisted (§11.8). Nothing about this weakens referential integrity.

## 10.3 Typed payloads

`structuredPayload` is not a free-form record for the types the engine reads. Each finding type has its own strict schema; a `CLAIM` cannot exist without a normalized claim.

```typescript
export const PredicateSchema = z.enum([                     // controlled list; cue lexicon in contracts/schemas/predicates.ts
  'holds_data', 'deletes_data', 'retains_data', 'shares_data_with',
  'acknowledges_request', 'extends_deadline', 'requires_identity_verification', 'provides_data',
]);

export const NormalizedClaimSchema = z.object({
  subject: z.string().min(1).max(200),                      // who the claim is about, e.g. "Acme Corp"
  predicate: PredicateSchema,
  object: z.string().min(1).max(300),                       // shortest noun phrase from the quote, e.g. "personal data"
  polarity: z.enum(['AFFIRMS', 'DENIES']),
}).strict();

// A finding reference inside a payload: a batch-local ref ("e1") or an existing display ID ("FND-201"). Never a UUID.
export const LocalRefSchema = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/);
export const FindingDisplayIdSchema = z.string().regex(/^FND-\d+$/);
export const FindingRefSchema = z.union([FindingDisplayIdSchema, LocalRefSchema]);

export const ClaimPayloadSchema = z.object({
  normalizedClaim: NormalizedClaimSchema,                   // REQUIRED
  speaker: z.enum(['ORGANIZATION', 'USER', 'THIRD_PARTY']).optional(),   // context only; never used for verification
  statedAt: z.string().datetime({ offset: true }).optional(),            // model-reported; never used for verification
}).strict();

export const EntityPayloadSchema = z.object({
  name: z.string().min(1).max(200),
  entityType: z.enum(['CONTROLLER', 'PROCESSOR', 'DATA_SUBJECT', 'SYSTEM', 'OTHER']),
}).strict();

export const EventPayloadSchema = z.object({
  label: z.string().min(1).max(200),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  dateSource: z.enum(['HEADER', 'TEXT']).default('TEXT'),   // the Gateway forces 'TEXT' on every model candidate
  dateUncertain: z.boolean().optional(),
}).strict();

export const RelationshipPayloadSchema = z.object({
  relationshipType: RelationshipTypeSchema,
  fromRef: FindingRefSchema, toRef: FindingRefSchema,
}).strict();

export const RequestPayloadSchema = z.object({
  item: z.string().min(1).max(500),                         // one demand, e.g. "Delete my phone number"
  requestType: z.enum(['ACCESS', 'DELETION', 'CORRECTION', 'OPT_OUT', 'OTHER']).optional(),
}).strict();

export const ResponsePayloadSchema = z.object({
  addresses: z.array(FindingRefSchema),                     // the REQUEST findings this response speaks to
  coverage: z.enum(['FULL', 'PARTIAL', 'DEFLECTED', 'UNCLEAR']),
}).strict();

export const FrictionPayloadSchema = z.object({
  signalType: FrictionSignalTypeSchema,
  relatedRefs: z.array(FindingRefSchema).default([]),
}).strict();

export const DataCategoryPayloadSchema = z.object({ category: z.string().min(1).max(200) }).strict();

// A model proposes a pair of existing claims. It cannot set the resolution.
export const ContradictionCandidatePayloadSchema = z.object({
  claimARef: FindingRefSchema, claimBRef: FindingRefSchema,
}).strict();
// Persisted: refs are rewritten to display IDs; `resolution` is written only by the engine or by user confirmation.
export const ContradictionPayloadSchema = ContradictionCandidatePayloadSchema.extend({
  claimARef: FindingDisplayIdSchema, claimBRef: FindingDisplayIdSchema,
  resolution: z.object({
    mode: z.enum(['MECHANICAL', 'USER_CONFIRMED']),
    confirmedBy: z.string().uuid().optional(), confirmedAt: z.string().datetime({ offset: true }).optional(),
  }).optional(),
}).strict();
```

## 10.4 Candidate and persisted findings

```typescript
const CandidateBase = z.object({
  ref: LocalRefSchema.optional(),                           // batch-local label so one response can link its own items
  statement: z.string().min(1).max(1000),
  evidenceBasis: CandidateBasisSchema,
  candidateConfidence: z.number().min(0).max(1).optional(),// the model's own number; never proof
  citations: z.array(CandidateCitationSchema).min(1).max(5),
}).strict();

const PersistedBase = z.object({
  id: z.string().uuid(), caseId: z.string().uuid(), displayId: z.string(),
  statement: z.string(), evidenceBasis: EvidenceBasisSchema,
  verificationState: VerificationStateSchema,
  sourceUnavailable: z.boolean(),
  candidateConfidence: z.number().min(0).max(1).optional(),
  humanConfirmedAt: z.string().datetime({ offset: true }).optional(),
  citations: z.array(PersistedCitationSchema),
}).strict();

// One variant per finding type, each with its own payload schema (types simplified here).
const variants = (base: z.ZodObject<any>, contradiction: z.ZodTypeAny) => [
  base.extend({ findingType: z.literal('CLAIM'),           structuredPayload: ClaimPayloadSchema }),
  base.extend({ findingType: z.literal('ENTITY'),          structuredPayload: EntityPayloadSchema }),
  base.extend({ findingType: z.literal('EVENT'),           structuredPayload: EventPayloadSchema }),
  base.extend({ findingType: z.literal('RELATIONSHIP'),    structuredPayload: RelationshipPayloadSchema }),
  base.extend({ findingType: z.literal('REQUEST'),         structuredPayload: RequestPayloadSchema }),
  base.extend({ findingType: z.literal('RESPONSE'),        structuredPayload: ResponsePayloadSchema }),
  base.extend({ findingType: z.literal('FRICTION_SIGNAL'), structuredPayload: FrictionPayloadSchema }),
  base.extend({ findingType: z.literal('CONTRADICTION'),   structuredPayload: contradiction }),
  base.extend({ findingType: z.literal('DATA_CATEGORY'),   structuredPayload: DataCategoryPayloadSchema }),
] as const;

// A CLAIM must be anchored in a quote: at least one citation carries quotedText.
export const CandidateFindingSchema = z
  .discriminatedUnion('findingType', variants(CandidateBase, ContradictionCandidatePayloadSchema))
  .superRefine((c, ctx) => {
    if (c.findingType === 'CLAIM' && !c.citations.some(x => x.quotedText))
      ctx.addIssue({ code: 'custom', message: 'CLAIM requires a citation with quotedText' });
  });

export const FindingSchema = z.discriminatedUnion('findingType', variants(PersistedBase, ContradictionPayloadSchema));

// The provider envelope is validated first; each candidate is then validated on its own (§11.1 step 8).
export const AnalysisEnvelopeSchema = z.object({ candidates: z.array(z.unknown()) }).strict();
```

Consequences the engine relies on: `contradiction_support.v1`, `claim_verification.v1` and `corroboration.v1` read `normalizedClaim` only after `ClaimPayloadSchema.safeParse` succeeds; a payload that fails parsing is treated as `INCONCLUSIVE` and never read by assumption.

## 10.5 Report contracts

```typescript
// What the model may produce. 'user_note' (or any other kind) is not in this union, so it fails validation:
// the restriction is enforced by schema, not by prompt wording.
export const AIHeadingBlockSchema = z.object({
  kind: z.literal('heading'), text: z.string().min(1).max(200),
}).strict();
export const AIAssertionBlockSchema = z.object({
  kind: z.literal('assertion'), text: z.string().min(1).max(1500),
  findingDisplayIds: z.array(FindingDisplayIdSchema).min(1),      // display IDs, never UUIDs
}).strict();
export const AIReportDraftSchema = z.object({
  blocks: z.array(z.discriminatedUnion('kind', [AIHeadingBlockSchema, AIAssertionBlockSchema])).min(1).max(60),
}).strict();

// What is persisted and edited (the Gateway assigns ids and resolves display IDs to UUIDs).
const BlockId = z.string().min(1).max(40);
export const HeadingBlockSchema = z.object({ kind: z.literal('heading'), id: BlockId, text: z.string() }).strict();
export const AssertionBlockSchema = z.object({
  kind: z.literal('assertion'), id: BlockId, text: z.string(),
  findingIds: z.array(z.string().uuid()).min(1),                  // grounded by construction
  origin: z.enum(['AI', 'USER']),                                 // set by the server
  editedAfterDraft: z.boolean(),                                  // set by the server when text differs from the AI draft
}).strict();
export const UserNoteBlockSchema = z.object({
  kind: z.literal('user_note'), id: BlockId, text: z.string(),
  authorId: z.string().uuid(),                                    // stamped by the server; only humans create these
}).strict();
export const ReportBlockSchema = z.discriminatedUnion('kind', [HeadingBlockSchema, AssertionBlockSchema, UserNoteBlockSchema]);

export const CaseReportContentSchema = z.object({
  lens: z.enum(['EVIDENCE', 'FINDINGS', 'COMPLAINT']),
  framework: z.string().optional(),                               // e.g. 'GDPR', 'CCPA'
  blocks: z.array(ReportBlockSchema),
});
```

The editor's `PUT /api/reports/:id` accepts `CaseReportContentSchema`. The server, not the client, sets `origin`, `editedAfterDraft` and `authorId`; AI-created blocks can never be `user_note`, and a block the client labels `origin: 'AI'` is re-derived from the stored draft.

```typescript
export type Finding = z.infer<typeof FindingSchema>;
export type CandidateFinding = z.infer<typeof CandidateFindingSchema>;
export type CandidateCitation = z.infer<typeof CandidateCitationSchema>;
export type PersistedCitation = z.infer<typeof PersistedCitationSchema>;
export type NormalizedClaim = z.infer<typeof NormalizedClaimSchema>;
export type CaseReportContent = z.infer<typeof CaseReportContentSchema>;
```

**Taxonomy rule.** No free-form types. A candidate with an unknown finding type, relationship type, predicate or signal type fails candidate validation, is recorded under the task's `rejected` list with reason `SCHEMA` or `UNKNOWN_TYPE`, and is never relabelled into something the model did not say.

## 10.6 Gmail import contracts (P1-0, v1.4.2)

Added under §19.3 and frozen at Hour 1 with the other contracts, although the behavior behind them starts at Hour 14 (§17.3). The evidence item API output gains `ingestSource`; the Gmail message ID (`external_ref`) is an internal field and is not returned.

```typescript
// contracts/schemas/gmail.ts
export const IngestSourceSchema = z.enum(['UPLOAD', 'GMAIL_IMPORT']);          // evidence_items.ingest_source

const GmailIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);                // Gmail thread and message IDs

export const GmailStatusSchema = z.object({
  connected: z.boolean(),
  googleEmail: z.string().email().optional(),                                   // shown so the user knows which mailbox is linked
  status: z.enum(['ACTIVE', 'EXPIRED']).optional(),
}).strict();

export const GmailCallbackRequestSchema = z.object({                            // POST /api/gmail/callback
  code: z.string().min(1).max(2048),
  state: z.string().min(1).max(1024),
}).strict();

export const GmailThreadSummarySchema = z.object({                              // display only: never stored, never sent to a model, never audited
  threadId: GmailIdSchema,
  subject: z.string().max(300),
  from: z.string().max(300),
  snippet: z.string().max(300),
  messageCount: z.number().int().min(1),
  lastMessageAt: z.string().datetime(),
}).strict();

export const GmailThreadListSchema = z.object({
  threads: z.array(GmailThreadSummarySchema).max(10),                           // page size 10
  nextPageToken: z.string().max(512).optional(),
}).strict();

export const GmailImportRequestSchema = z.object({ threadId: GmailIdSchema }).strict();   // POST /api/cases/:id/evidence/gmail

export const GmailImportResultSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    displayId: z.string(),                                                      // 'EV-101', database-generated
    sha256: z.string().length(64),
    duplicate: z.boolean(),                                                     // true when this message was already imported into this case
  }).strict()),
  truncated: z.boolean(),                                                       // true when the thread had more than GMAIL_MAX_MESSAGES_PER_IMPORT messages
}).strict();
```

```typescript
// backend/integrations/gmail.ts (not a contract; the seam that GMAIL_MODE switches)
export interface GmailClient {
  listThreads(accessToken: string, opts: { q?: string; pageToken?: string }): Promise<GmailThreadList>;
  getThreadMessageIds(accessToken: string, threadId: string): Promise<string[]>;   // in thread order
  getRawMessage(accessToken: string, messageId: string): Promise<Uint8Array>;      // users.messages.get?format=raw, base64url-decoded
}
```

---

# 11. AI Pipeline & Privacy Gateway

## 11.1 Gateway sequence

All model calls go through the Gateway (`ai/gateway/`). No other module may import a provider.

```text
 1. Backend requests a task for a case
 2. Gateway re-checks case ownership
 3. Gateway checks an active AI consent row for this case and the current policy version
 4. Task selector picks task type, prompt version, output schema
 5. Gateway re-verifies the SHA-256 of every evidence item that will enter the scope; mismatches are quarantined and excluded
 6. Minimizer builds the smallest sufficient input from evidence segments (§11.2) and records the SCOPE MAP:
    "EV-101#3" → { evidenceId, segmentId, stored locator }  (kept by the Gateway; never sent to the model)
 7. Gateway writes AI_ANALYSIS_STARTED to the audit ledger (scope, prompt, schema, provider; no content)
 8. Provider adapter calls the model with the schema, a timeout and bounded retries
 9. Output is validated in two levels:
      a. Envelope (AnalysisEnvelopeSchema). Invalid → task FAILED, raw output kept by reference, zero findings written.
      b. Each candidate against CandidateFindingSchema. An invalid candidate is rejected on its own and listed in the
         task's `rejected` entries (reason and index only). If the envelope had candidates and none are valid → task FAILED.
10. Resolution (§11.8): candidate citations and finding references are resolved to database IDs and structurally checked.
11. In ONE database transaction the Gateway persists the surviving candidates as UNVERIFIED findings with PENDING
    citations (finding display IDs are assigned by the database), plus relationships and request-response links, and
    enqueues the verification engine
12. Gateway writes AI_ANALYSIS_COMPLETED (model, latency, tokens, retries, fallback, counts of accepted and rejected candidates)
```

**Evidence is untrusted data.** Emails and documents may contain instructions aimed at the model. Prompts wrap evidence in clearly delimited data blocks and state that nothing inside them is an instruction. Output is schema-constrained, the Gateway has no tools or side effects, and verification never depends on model text, so an injected instruction can at worst produce a candidate that is rejected or fails verification.

## 11.2 Minimization

Send the minimum needed for the task. Each case sets a mode:

| Mode | Behaviour |
|---|---|
| `MINIMIZE` (default) | Send only the segments the task needs; strip footers, unsubscribe links, tracking, credentials, tokens, full card numbers; pseudonymize personal identifiers the task does not need |
| `REDACT` | `MINIMIZE` plus placeholder tokens for names, emails, phones, addresses |
| `RAW` | Send segment text unmodified (user must choose this explicitly) |
| `LOCAL_ONLY` | Never send; item is skipped by AI tasks and remains usable manually |

Placeholders are stable (`[EMAIL_1]`) and the mapping stays local. Before citation checks the Gateway **de-tokenizes** any `quotedText` the model returns, so quotes are compared with the original segment text. The minimization applied is stored in `analysis_tasks.minimization_metadata`.

## 11.3 Provider interface

The provider-facing request contains **no database identifiers**: segments are labelled with the evidence display ID and the ordinal, nothing else.

```typescript
export type AnalysisTaskType =
  | 'vision_transcription' | 'extraction' | 'response_analysis'
  | 'friction_analysis' | 'contradiction_consolidation' | 'report_draft';

export interface CanonicalAnalysisRequest {
  taskType: AnalysisTaskType;
  schema: { name: string; version: string };
  prompt: { id: string; version: string };
  evidenceScope: Array<{
    evidenceDisplayId: string;                               // "EV-101"
    segments: Array<{ ordinal: number; locatorType: string; locator: Record<string, unknown>; text: string }>;
    image?: { mimeType: string; base64: string };            // vision tasks only
  }>;
  findingContext?: Array<{ displayId: string; statement: string; normalizedClaim?: NormalizedClaim;
                           citations: CandidateCitation[] }>;  // e.g. VERIFIED claims for contradiction_consolidation
  minimizedInput: Record<string, unknown>;
}

export interface CanonicalAnalysisResponse {
  taskType: AnalysisTaskType;
  schemaName: string;
  schemaVersion: string;
  candidates: unknown[];                                      // UNTRUSTED provider JSON; validated by the Gateway (§10.4)
  rawProviderMetadata: {
    provider: string; model: string;
    tokensIn?: number; tokensOut?: number; latencyMs: number;
  };
}

export interface AIProvider {
  analyze(request: CanonicalAnalysisRequest): Promise<CanonicalAnalysisResponse>;
  healthCheck(): Promise<{ available: boolean; model: string; capabilities: { vision: boolean } }>;
}
```

`caseId`, consent and policy data stay inside the Gateway; they are not part of the provider request. Providers: `grok.ts` (xAI, development), `mock.ts` (replays recorded fixtures from `tests/synthetic/`, written in the AI-facing candidate form; used in CI, UI work and the demo fallback). Anything provider-specific stays inside its adapter.

## 11.4 Routing and failure handling

- Configured by env: `AI_PROVIDER`, `AI_FALLBACK_PROVIDER` (default `none`).
- **Retry** on timeout, 5xx, rate limit, transient network errors: 30 s timeout, exponential backoff, max 2 retries.
- **Do not retry** on invalid key, invalid model, malformed request, unsupported feature.
- A fallback provider must return the same canonical schema and must never change semantics silently. Every task records provider, model, `retry_count`, `fallback_used`.
- Server-side key isolation: provider keys exist only in server environments and are never sent to the browser.

## 11.5 Structured output and the candidate principle

```text
Model → JSON → envelope check → per-candidate Zod check → reference/citation resolution → store as UNVERIFIED → deterministic rules
```

- Every provider result is a **candidate**, never a fact. Confidence numbers are stored as `candidate_confidence` and labelled "model confidence" in the UI.
- A model may claim only `DIRECT`, `INFERRED` or `CONFLICTING` as evidence basis. `OBSERVED` is assigned by DataTrace code, so a model cannot label its own output as computed.
- Candidates without a resolvable citation are rejected at the boundary. A `CLAIM` without a complete `normalizedClaim` fails Zod and is rejected.
- No auto-promotion: only the verification engine changes a state.

## 11.6 Prompt registry

Prompts live in `ai/prompts/` as immutable files named `{task}.v{n}.ts`. Any edit creates a new version. The prompt id and version used are stored on every task. Initial set: `extraction.v1`, `friction.v1`, `contradiction.v1`, `reportDraft.v1`, plus `vision.v1` (P1). Every prompt (a) shows each segment under a header such as `[EV-101 #3 PAGE {"page":2}]`, (b) tells the model to cite only by that display ID and ordinal and to copy the locator from the header, (c) never mentions or requests UUIDs, and (d) takes its output JSON Schema from the Zod contract (§7.3). For `extraction.v1`, the prompt requires each `CLAIM` to include a `normalizedClaim` whose `object` is the shortest noun phrase from the quote and whose `predicate` is one of the controlled values. `reportDraft.v1` asks only for `heading` and `assertion` blocks.

## 11.7 Pipeline order

`vision_transcription` (screenshots, if any) → `extraction` → `response_analysis` → `friction_analysis` → `contradiction_consolidation` → deterministic verification. Each stage is a tracked `analysis_tasks` row. Retrying never overwrites earlier output. `friction_analysis` and `contradiction_consolidation` receive prior findings by display ID through `findingContext`.

## 11.8 Citation and reference resolution

The Gateway (`ai/gateway/resolver.ts`) is the only place where model-facing identifiers become database identifiers. It resolves against the **scope map built at step 6**, not against free database lookups, so a model can only cite what it was actually shown.

**For every candidate citation:**

| # | Check | On failure |
|---|---|---|
| 1 | Parses as `CandidateCitationSchema` (malformed input fails safely, never throws) | citation dropped, reason `MALFORMED` |
| 2 | `"{evidenceDisplayId}#{segmentOrdinal}"` exists in the scope map (so it is inside this task's input scope) | dropped, `OUT_OF_SCOPE` |
| 3 | Resolve to `evidenceId` UUID and `segmentId` UUID; reload both rows (service role) and confirm: evidence belongs to the task's `case_id`; segment belongs to that evidence; evidence is not deleted or QUARANTINED and is `PROCESSED` | dropped, `BAD_REFERENCE` |
| 4 | `LocatorSchema` accepts `{locatorType, locator}` **and** it deep-equals the stored segment locator | dropped, `LOCATOR_MISMATCH` |
| 5 | Persist the citation with `case_id` set to the task's case, the **stored** locator (the model's copy is discarded), `quoted_text` as returned (de-tokenized, §11.2), `validation_status = PENDING` | n/a |

A candidate with zero surviving citations is rejected (`NO_VALID_CITATION`). Whether the quoted text really occurs in the segment, whether the hash still matches, and whether the segment supports the claim are **not** the Gateway's job: `citation_integrity.v1`, `provenance.v1` and `claim_verification.v1` decide those, so a fabricated quote produces a persisted `UNVERIFIED` finding with an `INVALID` citation (visible, never trusted) rather than a silent drop.

**For finding references** (`ref`, `relationships`, `ResponsePayload.addresses`, `FrictionPayload.relatedRefs`, `ContradictionCandidatePayload`): a batch-local ref must name another candidate in the same response; a display ID must name an existing finding in the same case (and, for contradictions, an existing `CLAIM`). Unresolvable references reject that candidate (`BAD_REFERENCE`). On persistence, local refs are rewritten to the display IDs the database assigned, so persisted payloads contain only `FND-###` references, while the rows in `relationships` and `request_response_links` carry real UUID foreign keys.

**Reports.** For `report_draft`, each `findingDisplayIds` entry must be in the eligible set supplied for that draft; the Gateway converts them to `findingIds` UUIDs, assigns block ids, sets `origin = 'AI'`, and rejects the whole draft if any assertion cites an ineligible or unknown finding.

**Other normalizations applied here:** `dateSource` is forced to `'TEXT'` on every model `EVENT`; any model-supplied `resolution` or `OBSERVED` basis is already impossible by schema.

---

# 12. Verification Model & Rules

## 12.1 Two orthogonal dimensions

- **Evidence basis** answers *how was this derived?* (`DIRECT`, `OBSERVED`, `INFERRED`, `CONFLICTING`).
- **Verification state** answers *how far have deterministic checks taken it?* (`UNVERIFIED` → `AI_INFERRED` → `CORROBORATED` → `VERIFIED`, or `CONTRADICTED` for contradiction findings).

The two are stored and shown separately. Never merge them into one badge.

| State | Meaning | Set by | Allowed bases |
|---|---|---|---|
| `UNVERIFIED` | Candidate not yet checked, or failed a check, or its source is no longer available | Insertion; any failing citation rule; source deletion or quarantine | any |
| `AI_INFERRED` | Citations resolve and provenance holds; content is still the model's reading | `citation_integrity.v1` + `provenance.v1` pass | any |
| `CORROBORATED` | Independent evidence items support the same normalized statement | `corroboration.v1` | `DIRECT`, `OBSERVED`, `INFERRED` |
| `VERIFIED` | Deterministically confirmed against preserved, integrity-checked evidence (see box below) | **`claim_verification.v1`** for `DIRECT` claims; `relationship_taxonomy.v1` / `event_consistency.v1` for `OBSERVED` edges and events | `DIRECT`, `OBSERVED` only |
| `CONTRADICTED` | A contradiction finding whose bilateral proof passed or was confirmed by the user | `contradiction_support.v1` | `CONFLICTING` |

> **What `VERIFIED` does and does not mean.**
> It means the evidentiary condition was deterministically confirmed against preserved evidence: for a `DIRECT` claim, the cited quote occurs in a hash-verified segment and the claim's normalized form is supported by that quote under the documented semantics of `claim_verification.v1`; for an `OBSERVED` item, the value was computed by code from structured data such as email headers.
> It does **not** mean the organization is telling the truth, that the model is correct, or that anything in the outside world was independently checked. The UI always shows the exact quote beside the statement, and reports cite the quote.
> A `VERIFIED` claim and a `VERIFIED` opposing claim can coexist. The `CONTRADICTION` finding between them carries `CONTRADICTED`; the two claims keep their own states and are linked by a `CONTRADICTS` edge shown with a conflict marker.

A user can mark a finding as "reading confirmed". This stores `human_confirmed_*` and an audit event and shows a badge; it never changes the verification state by itself. (Confirming a *contradiction* is different: it is an input to `contradiction_support.v1`, §13.4.)

## 12.2 State transitions

```text
            insertion
               ▼
          UNVERIFIED ──(citation_integrity + provenance pass)──► AI_INFERRED
               ▲                                                   │         │
   any failing citation rule,                            corroboration.v1    claim_verification.v1 (DIRECT CLAIM)
   hash mismatch, source deleted                                   ▼         or relationship_taxonomy / event_consistency (OBSERVED)
   or quarantined                                          CORROBORATED ──────────────► VERIFIED
                                                  (a CORROBORATED DIRECT claim may also pass claim_verification.v1)

   CONTRADICTION finding:  AI_INFERRED ──(mechanical match or user confirmation, both claims VERIFIED)──► CONTRADICTED
```

Only `verification/engine.ts` changes a state, and every change writes a `verification_results` row and a `VERIFICATION_STATE_CHANGED` audit event. Lint rules forbid `ai/` from importing `verification/` write paths, and `verification/` from importing anything that touches the network or a provider.

Screenshot-derived text: findings resting only on `AI_VISION` artifacts are capped at `AI_INFERRED` (§5.1).

## 12.3 Rule catalog

**Eleven rules are specified** (six are P0, five are P1), each a pure function with a versioned id. Only rules that are implemented and passing their golden tests may be described as live (§23, principle 11). Numbering follows v1.1 with the new rule inserted as **1B**. Tiers are defined in §17.3.

| # | Rule | Applies to | Deterministic condition | On pass | On fail | State cap | Tier |
|---|---|---|---|---|---|---|---|
| 1 | `citation_integrity.v1` | all findings | Every citation: evidence belongs to the case; item is `PROCESSED`, not deleted, not `QUARANTINED`, and its SHA-256 re-verifies; segment exists and its stored locator matches; if `quotedText` exists, it is a `normalizeText` substring of the segment text. Relevance is **not** judged here. | citations `VALID`; `UNVERIFIED` → `AI_INFERRED` (a higher state is retained) | citation `INVALID`; finding → `UNVERIFIED` (and `source_unavailable` set if the cause is a deleted/quarantined source) | `AI_INFERRED` | P0 |
| 1B | **`claim_verification.v1`** | `CLAIM` | `finding_type = CLAIM` and `evidence_basis = DIRECT`; payload parses as `ClaimPayloadSchema`; `citation_integrity.v1` and `provenance.v1` have passed; ≥1 `VALID` citation has `quotedText`, all artifacts on its provenance path have `extraction_method` `PARSER` or `MANUAL`; and the **claim-support semantics** below hold for that quote. | `AI_INFERRED`/`CORROBORATED` → `VERIFIED` | stays `AI_INFERRED` with reason codes (`NO_CUE`, `OBJECT_UNANCHORED`, `SUBJECT_UNANCHORED`, `POLARITY_MISMATCH`); `INCONCLUSIVE` for hedged/future statements | `VERIFIED` (DIRECT only) | P0 |
| 2 | `provenance.v1` | all findings | Unbroken chain Finding → Citation → Segment → Artifact → EvidenceItem → stored SHA-256. Records `extraction_method` of every artifact on the path. | eligible for promotion | quarantined (hidden from report-eligible views) | none | P0 |
| 3 | `entity_reference.v1` | `ENTITY` | Normalized entity name occurs in the cited segment | `AI_INFERRED`; `CORROBORATED` if found in 2+ items | stays `UNVERIFIED` | `CORROBORATED` | P1 |
| 4 | `relationship_taxonomy.v1` | `RELATIONSHIP` | Type is in the 11-value taxonomy; both endpoints exist in the same case | `AI_INFERRED` | rejected (listed with the task's `rejected` entries) | `AI_INFERRED`, except edges derived by backend code from email headers (`OBSERVED`), which may be `VERIFIED` | P1 |
| 5 | `event_consistency.v1` | `EVENT` | Valid ISO-8601; not in the future; `dateSource` recorded | header-derived dates (`OBSERVED`, created by ingestion code) → `VERIFIED`; model-extracted dates stay `AI_INFERRED` | `AI_INFERRED` with `dateUncertain` | `VERIFIED` only for `OBSERVED` | P1 |
| 6 | `request_response.v1` | `REQUEST`/`RESPONSE` links | Response header date is strictly after the request date; both endpoints valid. `UNANSWERED` is allowed only if no response finding in the case addresses that request item, and is reported as "no response found in case record". | link verified | flagged `CHRONOLOGY_IMPOSSIBLE` | `AI_INFERRED` for status; `VERIFIED` for chronology | P0 |
| 7 | `friction_validation.v1` | `FRICTION_SIGNAL` | Type-specific preconditions (§13.3), e.g. a repeated demand needs an earlier user message, by header date, that contains the information | preconditions met → keeps `AI_INFERRED`/`CORROBORATED`; `POSSIBLE_DELAY` (observed dates only) → `VERIFIED` | stays `UNVERIFIED` | `CORROBORATED`, except `POSSIBLE_DELAY` | P1 |
| 8 | `contradiction_support.v1` | `CONTRADICTION` | Payload parses as `ContradictionPayloadSchema`; both referenced findings are `CLAIM`, `DIRECT`, currently `VERIFIED` (via `claim_verification.v1`), cite different evidence items, and each claim's `normalizedClaim` parses. Mechanical pass: equal `claimKey` (same predicate, subject tokens and object tokens) and **opposite polarity**. Otherwise `INCONCLUSIVE`, and the user may confirm after reviewing both quotes. | `CONTRADICTED` with `resolution.mode = MECHANICAL` or `USER_CONFIRMED` | stays an `AI_INFERRED` candidate | `CONTRADICTED` | P0 |
| 9 | `corroboration.v1` | `CLAIM`, `EVENT` | ≥2 findings with equal `claimKey` and equal polarity (events: equal normalized label and equal UTC date) from **distinct evidence items with distinct SHA-256** (duplicate uploads do not count) | `CORROBORATED` | unchanged | `CORROBORATED` | P1 |
| 10 | `report_grounding.v1` | case report | Every `assertion` block lists ≥1 finding ID; each exists in the case, is in the selected eligible set, is not quarantined, has `source_unavailable = FALSE`, and carries its required qualifier flag; blocks edited after drafting are flagged | report `VALIDATED` | export blocked; failing block IDs returned | n/a | P0 |

### Claim-support semantics (`claim_verification.v1`)

The rule never calls a model and never uses similarity scores or embeddings. It checks that the `normalizedClaim` is *anchored in* the quote using fixed, human-reviewed cue lists in `contracts/schemas/predicates.ts` (changes follow §19.3). With `q = normalizeText(quote)`:

1. **Predicate cue.** `q` contains at least one cue for `normalizedClaim.predicate` (word-boundary, inflection-tolerant patterns). Let *p* be the position of the first cue.
2. **Object anchor.** Let *T* be the content tokens of `normalizedClaim.object` (`normalizeToken`, ≥3 characters, no stopwords). At least ⌈\|T\|/2⌉ of them occur in `q`. An empty *T* fails.
3. **Subject anchor.** A content token of `normalizedClaim.subject` occurs in `q`, **or** in the evidence item's header text (From, To, Subject, from `METADATA_JSON`) for emails, **or** in its first or last segment for other item types (letterhead or signature). This lets "We deleted your data" in a message from `privacy@acme.example` anchor to the subject "Acme Corp".
4. **Polarity.** If a negation cue (`not`, `never`, `no`, `cannot`, `n't`, `without`, `none`, `nor`) occurs within 6 tokens before *p*, the quote's polarity is `DENIES`, otherwise `AFFIRMS`. It must equal `normalizedClaim.polarity`.
5. **Hedge gate.** If a hedge cue (`if`, `unless`, `would`, `may`, `might`, `could`, `should`, `will`, `subject to`) occurs within 8 tokens before *p*, the outcome is `INCONCLUSIVE`: conditional, modal and future statements ("we will delete your data within 30 days") are never auto-`VERIFIED`.

Illustrative predicate cues (authoritative list in code): `deletes_data` (delet-, eras-, remov-, purg-, destroy-); `retains_data` (retain-, keep/kept, preserv-, remain-); `holds_data` (hold, store, process, have); `shares_data_with` (shar-, disclos-, transmit-, transfer-, sent to); `acknowledges_request` (receiv-, acknowledg-); `extends_deadline` (extend-, extension, additional time); `requires_identity_verification` (verify your identity, proof of identity); `provides_data` (provid-, attach-, enclos-, copy of your data).

**What this does and does not establish.** A pass means the quote is present in a hash-verified source and the normalized claim is consistent with it under these fixed checks. It does not interpret nuance, scope or exceptions, and it does not make the statement true. That limit is why `VERIFIED` is defined as it is in §12.1, and why the UI shows the quote next to every `VERIFIED` claim.

## 12.4 Engine semantics

- Rules are idempotent. Per finding the engine runs `citation_integrity.v1` → `provenance.v1` → the type-specific rule (`claim_verification.v1`, `entity_reference.v1`, …); then the cross-finding rules (`corroboration.v1`, `contradiction_support.v1`) run over the case. Rules re-run when new evidence arrives, when a hash check fails, or on demand (`POST /api/findings/:id/verify`).
- Each execution stores `input_snapshot`, `outcome`, `previous_state`, `resulting_state`.
- **Single transition path.** Every change of `verification_state` is made by one engine function (`applyVerificationResult` in `verification/engine.ts`) in one transaction, in this order: (1) insert the `verification_results` row (`performed_at` left to its default); (2) update `findings.verification_state` only if the rule passed; (3) write the `VERIFICATION_STATE_CHANGED` audit event. The Gateway only inserts findings as `UNVERIFIED`. No other module writes `verification_state`, and `trg_findings_state_guard` (§9.1.1) rejects a `VERIFIED` or `CONTRADICTED` write that lacks a matching same-transaction `PASS` result.
- **Source quarantine or deletion.** When an evidence item is QUARANTINED (hash mismatch) or soft-deleted, one engine function does the following in a single transaction: every finding with a citation to that item becomes `UNVERIFIED` with `source_unavailable = TRUE`; its verification state change is recorded; it loses any report eligibility (`report_grounding.v1` rejects it); reports that contain it revert to `validation_status = PENDING` and cannot be exported until re-validated; and audit events (`EVIDENCE_QUARANTINED` or `EVIDENCE_DELETED`, and `VERIFICATION_STATE_CHANGED` per finding with reason `SOURCE_UNAVAILABLE`) are written. The UI shows "source no longer available" on those findings.
- **Re-evaluation cascade.** When a finding is demoted, findings that depend on it are re-run in the same transaction: a `CONTRADICTION` whose claim is no longer `VERIFIED` falls back to `AI_INFERRED` (`CONTRADICTED` requires bilateral proof that holds *now*), and `CORROBORATED` statuses are recomputed.
- Quarantined items are not released automatically; the user re-uploads the correct file.

---

# 13. Intelligence Engines

## 13.1 Response analyzer

Input is normalized before it reaches the Gateway: email headers (`From`, `To`, `Date`, `Subject`, `Message-ID`, `In-Reply-To`) are parsed by code into `OBSERVED` data; HTML is converted to text with paragraph breaks; footers and tracking text are dropped. Three extraction passes:

1. **Claims:** formal statements about data handling, each with a **mandatory** `normalizedClaim` (§10.3, `ClaimPayloadSchema`). A claim the model cannot normalize into the controlled `predicate` list is not emitted as a `CLAIM`.
2. **Exceptions and disclaimers:** legal caveats and conditional exemptions the organization cites.
3. **Missing elements:** parts of the user's request the response does not address.

## 13.2 Request-response matrix

Completeness is judged **per request item**, not per response. Each item gets one status:

| Status | Meaning |
|---|---|
| `ANSWERED` | The response appears to address the item, with a cited segment. An evidence-based status only: it is not a judgment that the answer is complete, timely or legally sufficient |
| `PARTIAL` | Some of the item is addressed |
| `UNANSWERED` | No response in the case record addresses it |
| `DEFLECTED` | Redirected to a generic FAQ, another department, or a portal without the data |
| `UNCLEAR` | The response is ambiguous or evidence is insufficient to say |

`UNANSWERED` always reads "no response found in case record" (axiom 7).

**Wording rule.** The matrix and every report describe what the record shows ("Answered in the record", "No response found in case record"). They never use "compliant" or "non-compliant", and never state that a deadline or legal duty was or was not met unless a human-reviewed framework entry applies (§14.1).

**How links are produced.** `REQUEST` findings are the request items. A `RESPONSE` finding's `addresses` and `coverage` create `request_response_links` rows after persistence (`FULL` → `ANSWERED`; `PARTIAL`, `DEFLECTED`, `UNCLEAR` map to the same-named statuses). Any request item that no response addresses gets an `UNANSWERED` row, created by the engine under `request_response.v1`, never by the model.

## 13.3 Friction detector

The model proposes candidate signals; `friction_validation.v1` checks preconditions. Signals describe **observable procedural patterns**, never intent: the product does not say "bad faith". There is no aggregate friction score in the MVP.

| Signal | What it describes | Deterministic precondition |
|---|---|---|
| `UNANSWERED_REQUEST` | A request item with no response found | Linked matrix row has status `UNANSWERED` |
| `MISSING_INFORMATION` | Response does not appear to include requested data, and no exemption claim was extracted for that item (describes the record, not a legal finding) | Linked request item exists; response citations valid; no exemption claim extracted for that item |
| `REPEATED_REDIRECTION` | User sent to another channel or department more than once | ≥2 redirect findings from the organization, ordered by header date |
| `GENERIC_RESPONSE` | Boilerplate that does not address the request items | Response is linked to a request, with every linked item `UNANSWERED` or `DEFLECTED` |
| `REPEATED_REQUEST_FOR_PROVIDED_INFORMATION` | Organization asks again for information the user already gave | Earlier user message (by header date) contains the information, and a later organization demand cites it |
| `CONTRADICTORY_INSTRUCTION` | Conflicting instructions about how to proceed | Two organization instructions with valid citations, different evidence items |
| `UNCLEAR_NEXT_STEP` | Response gives no actionable next step | Response citations valid; no step/deadline finding extracted |
| `POSSIBLE_DELAY` | Response deadline has passed with no reply | No message from the organization dated after the request exists in the case record, and the framework deadline in `contracts/schemas/frameworks.ts` has elapsed. Computed from header dates only. |

## 13.4 Contradiction engine

Suspicion or tone never establishes a contradiction. A contradiction requires **bilateral proof**:

1. Claim A is `VERIFIED` against evidence item X (through `claim_verification.v1`).
2. Claim B is `VERIFIED` against evidence item Y (X ≠ Y).
3. A and B are incompatible.
4. X and Y both pass integrity and provenance.

**Where candidates come from.** The `contradiction_consolidation` task receives only `VERIFIED` claims (by display ID, with their normalized claims and quotes) and proposes pairs (`claimARef`, `claimBRef`). The Gateway resolves both references and checks that they are existing `CLAIM` findings (§11.8).

**Incompatibility is checked mechanically and without a model.** `contradiction_support.v1` parses both claims' `normalizedClaim` with `ClaimPayloadSchema` (a payload that does not parse is `INCONCLUSIVE`, never assumed) and compares `claimKey` values: same predicate, same subject tokens, same object tokens, **opposite polarity** → mechanical pass, `CONTRADICTED`, `resolution.mode = MECHANICAL`.

If the keys differ but the model believes the claims conflict (for example "we do not share data with third parties" against "we transmitted your data to analytics partner Z"), the candidate stays `AI_INFERRED` with the label "needs your confirmation". The user reviews both quotes side by side and may confirm via `POST /api/findings/:id/confirm`. The confirmation is audited, `resolution.mode = USER_CONFIRMED` with `confirmedBy` and `confirmedAt` is recorded, and the finding becomes `CONTRADICTED`. User confirmation is still gated on both claims being `VERIFIED` at that moment. The system never claims a mechanical proof it does not have.

The `CONTRADICTION` finding is the one that holds `CONTRADICTED`; the two claims keep their own states and are linked by a `CONTRADICTS` relationship. If either claim later loses `VERIFIED` (for example its source is quarantined), the contradiction falls back to `AI_INFERRED` (§12.4).

---

# 14. Report Generator & Grounding

## 14.1 Pipeline

```text
Case record → user picks lens and framework (e.g. GDPR, CCPA)
  → filter eligible findings (VERIFIED, CORROBORATED, qualified AI_INFERRED; never source_unavailable)
  → model drafts blocks from the supplied finding display IDs only (AIReportDraftSchema: heading and assertion only)
  → Gateway resolves display IDs to UUIDs and assigns block ids
  → report_grounding.v1 validates every block
  → live editor: user reviews, edits, redacts, adds notes
  → export (grounding re-checked at export time)
```

**Legal text is not generated by the model.** Article titles, deadlines and complaint section templates come from `contracts/schemas/frameworks.ts`, written and reviewed by humans. The model fills evidence-based assertions; it cannot invent a legal citation. All output carries the standard disclaimer in §1.4 (rendered in the editor, in every export and in the demo UI).

**Human-reviewed framework entries only.** Every `frameworks.ts` entry (article title, deadline, complaint section template) carries `humanReviewed: boolean`, `reviewedBy` and `reviewedAt`. Rules and the report drafter use only entries with `humanReviewed === true`. For any other entry the UI shows "deadline not confirmed" and `POSSIBLE_DELAY` is not computed. DataTrace never states a deadline, legal article or compliance conclusion on its own authority.

## 14.2 Block-structured reports

A report is a list of blocks (§10.5):

| Block | Who may create it | Rule |
|---|---|---|
| `heading` | AI draft or user | Structural text only |
| `assertion` | AI draft, or a user who selects findings | Must list ≥1 finding ID (`findingIds`). Rendered with citation tokens such as `[FND-201 · EV-101 §2]`. If any cited finding is only `AI_INFERRED`, the renderer prefixes: *"Based on algorithmic analysis of the cited correspondence…"*. The server sets `origin` and `editedAfterDraft`. |
| `user_note` | **Humans only** | Free text, rendered as "Author's statement (not evidence-backed)", stamped with `authorId`. The AI report schema has no `user_note` kind, so a model cannot produce one (enforced by Zod, not by the prompt). |

Grounding is checked on structure, not by parsing prose. Editing text inside an `assertion` keeps its `findingIds`, but the server marks it `editedAfterDraft = true`; the editor shows an "edited by author" marker, and the export's provenance footer counts edited assertions. New factual statements either select findings (a new `assertion` with `origin = USER`) or are written as a `user_note`.

**Honest limit.** `report_grounding.v1` guarantees that every assertion is attached to eligible findings and that nothing unattached is presented as evidence-backed. It cannot prove that a sentence a human rewrote is semantically supported by the findings attached to it; that is why edited assertions are flagged and the quotes sit beside each assertion.

## 14.3 Live editor and citation navigation

Split screen: draft on the left, evidence viewer on the right.

- **P0:** clicking a citation token (1) resolves the citation to its `EvidenceSegment`, (2) opens that item in the viewer, (3) scrolls to the segment element (`data-segment-id="<segment uuid>"`), and (4) highlights the **whole segment**, with the exact quoted text, the item's SHA-256 and its integrity status shown in a side panel. The viewer renders extracted text per segment; the original opens through the audited download flow (§5.2).
- **P1:** highlight the exact quoted characters inside the segment, and paragraph-level locators for PDFs.

The user can modify, remove or discard anything.

## 14.4 Export

Markdown and JSON (P0); PDF (P1). Every export includes: case id, list of cited evidence items with SHA-256, the report's validation status, the number of assertions edited after drafting, generation timestamp, the audit-chain head hash, and the draft/not-legal-advice notice.

---

# 15. Privacy, Security, Consent & Audit

## 15.1 Defense in depth

```text
Supabase access token → adapter → router authentication → backend authorization (user owns the case, checked in code)
  → Postgres grants + RLS → private Storage with no client access
```

- Clients hold `SELECT` only and no `DELETE` anywhere; RLS scopes every read to the case owner (§9.2).
- All writes use the service role after an ownership check in the handler; those checks are covered by tests.
- Evidence bytes reach a client only through the audited signed-URL flow (§5.2). There is no second route.
- The Gateway is the only provider path; it checks ownership and consent on every task (§11.1).

## 15.2 Consent and minimization

- No evidence leaves DataTrace for a model until the user enables AI **for that case** and accepts the privacy notice. The notice states: what may be sent, why, which provider, what minimization applies, what DataTrace stores, and known limits.
- Consent is stored as history in `ai_consents` (policy version, provider, scope, granted/revoked times).
- **Revocation** terminates running and queued tasks for the case immediately. Existing findings remain for audit and review.
- With AI off, upload, storage, manual logs, timelines and the audit trail still work.
- **Gmail import notice (P1-0).** Connecting Gmail has its own notice, separate from AI consent: DataTrace asks for read-only access, reads only the threads the user picks, keeps an encrypted refresh token until the user disconnects, and this is an unverified Testing-mode app for listed test accounts only. Importing an email does not enable AI: imported text reaches a model only after the user enables AI for the case, like any other evidence.

## 15.3 Provider retention and secrets

- Record provider, model, prompt and schema versions, input scope, privacy policy version, timestamp, output hash, and the provider's retention policy reference.
- **Never claim zero provider retention** unless the provider explicitly guarantees it. Keep "DataTrace retention" and "AI provider retention" distinct in the UI and docs.
- Secrets (`XAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_CLIENT_SECRET`, `GMAIL_STATE_SECRET`, `GMAIL_TOKEN_ENC_KEY`) live only in environment variables. Nothing secret or raw evidence is committed; `.gitignore` and CI secret scanning enforce it.

## 15.4 Audit

All lifecycle events are written to the hash-chained ledger (§9.3). Audit metadata holds IDs, counts, versions and hashes, never evidence text or personal data. The UI offers an "Audit chain intact ✓" check backed by `verify_audit_chain`.

## 15.5 Retention and deletion

- Evidence is kept until the user deletes it. Case lifecycle is **archive, never delete**: no client can delete a case, and no `DELETE /api/cases/:id` endpoint exists. A full account purge is P2 and would be an operator action.
- **Deleting an evidence item** (`DELETE /api/evidence/:id`, P1) is a soft delete: set `deleted_at`, remove the binary from Storage, remove its artifacts and segments, and keep a tombstone row (ID, display ID, SHA-256, size, deleted time) so audit references stay valid.
- **Quarantine** (hash mismatch, P0) and **deletion** share one engine function (§12.4): citing findings become `UNVERIFIED` with `source_unavailable = TRUE` and are shown as "source no longer available"; they lose report eligibility; reports containing them revert to unvalidated; the event is audited.
- Tests, demos and the repository use **synthetic data only**.

## 15.6 Jurisdictions and legal framing

- MVP frameworks: **GDPR** (Arts. 12, 15, 16, 17) and **CCPA** (Cal. Civ. Code § 1798.100 et seq.). Deadlines used for `POSSIBLE_DELAY` live in `frameworks.ts` and must be verified by a human before the demo; an entry that has not been human-reviewed is not used (§14.1).
- Stretch (P2): **India's Digital Personal Data Protection Act, 2023**, relevant to the IIT Guwahati audience. Check the Act's current commencement status and its rules before adding any article or deadline.
- DataTrace is a case-preparation tool. It gives no legal advice, files nothing automatically, and every output says so using the exact disclaimer wording fixed in §1.4.

## 15.7 Threat model summary

| Threat | Mitigation |
|---|---|
| Cross-case or cross-user data access | Backend ownership checks, RLS on all tables, SELECT-only grants, no client Storage access, composite foreign keys tying every citation, relationship and matrix link to a single case (§9.1), pgTAP tests (§9.2); non-owned resources return 404 |
| Evidence downloaded without an audit trail | No client Storage policy (restrictive deny), URLs issued only by the backend after ownership check and fail-closed `EVIDENCE_DOWNLOAD_AUTHORIZED` and `EVIDENCE_DOWNLOAD_URL_ISSUED` audit writes, short TTL (§5.2) |
| Client deletes or rewrites cases, evidence or audit rows | No DELETE (or INSERT/UPDATE) privilege for client roles; audit table has no UPDATE/DELETE/TRUNCATE for anyone |
| Model-forged or confused identifiers (UUIDs, other cases' evidence) | Models never see UUIDs; citations resolve only against the task's scope map; case and segment-to-evidence checks (§11.8) |
| Prompt injection inside evidence | Evidence delimited as data; schema-constrained output; no tools; verification independent of model text (§11.1) |
| Tampered evidence | SHA-256 at ingestion, re-verification before use and before AI scope; quarantine and demotion on mismatch |
| Tampered audit trail | Hash chain, no UPDATE/DELETE, chain-head hash in exports (§9.3) |
| Secret leakage | Server-only env vars, secret scanning in CI, no secrets in logs or audit metadata |
| Hallucinated allegations in reports | Typed AI report schema (heading and assertion only), block-structured assertions, `report_grounding.v1`, human-written legal templates, edited-assertion flags (§14) |
| Malicious uploads | Size and MIME limits, MIME sniffing, parsing in the worker, no execution of uploaded content |
| XSS from rendered evidence | Evidence rendered as escaped text; HTML emails converted to text, never injected as HTML |
| Provider retention surprises | Explicit consent, minimization, no zero-retention claims (§15.3) |
| Consent bypass | Gateway is the only provider path; consent checked in step 3 of every task |
| Malformed storage paths | Backend builds paths from validated UUIDs; strict `parseEvidencePath()`; DB equality constraint; `try_uuid()` for any future SQL parsing |
| A backend bug writes a cross-case citation, edits original-evidence metadata, or writes `VERIFIED` directly | Composite foreign keys, `trg_evidence_immutable`, `trg_findings_state_guard` apply even to the service role (§9.1, §9.1.1); pgTAP tests 8–10 |
| Audit chain breaks under concurrent writes | Per-case lock taken before the per-case `case_seq` is assigned; `verify_audit_chain` also detects gaps (§9.3) |
| Gmail refresh token leaked or stolen (P1-0) | Encrypted at rest (AES-256-GCM); `gmail_connections` has no client grant and no policy; tokens are never returned, logged or audited; access tokens live in memory only; the user can disconnect (revoke at Google and delete the row); §15.9, T25 |
| OAuth callback forgery or code injection (P1-0) | HMAC-signed `state` bound to the user and expiring in 10 minutes, verified before the code is exchanged; the callback is an authenticated API call; §15.9, T24 |
| Over-broad mailbox access (P1-0) | One read-only scope, enforced by a database CHECK and re-checked on the callback; the user picks one thread at a time; message cap per import; listed test accounts only (§5.5) |
| A real inbox connected by mistake (P1-0) | The Testing-mode app admits only the two throwaway test users; the connect screen says "test accounts only"; principle 9 |

Expand this table into `docs/security.md` during the build.

## 15.8 Security consistency check and known limits

Result of the v1.3 pass across layers. No layer is claimed to be absolutely secure; each has a stated residual limit.

| Layer | Position in v1.3 | Residual limit |
|---|---|---|
| Auth | Supabase Auth; every route except `/health` requires a verified access token | Token theft is out of scope for the MVP |
| Backend authorization | Ownership checked in code before any service-role write or signed-URL issuance | The service role bypasses RLS; a bug in a handler is a bug in isolation, so handlers are test-covered |
| RLS and grants | Per-command policies; SELECT-only grants; no DELETE; helper functions `SECURITY DEFINER` with fixed `search_path` | An owner can read their own derived text through the database API; reads of derived content that go through the REST API are audited, direct table reads are not |
| Storage | Private bucket; restrictive deny for client roles; backend-only access | Depends on the Supabase stack honouring the policy (verified in Hour 1, Appendix B) |
| Signed URLs | 60-second TTL (default), issued after authorization and audit | A URL is a bearer link for its lifetime; the audit shows issuance, not the fetch |
| Audit | Append-only, hash-chained, no content in metadata | Detects tampering; does not stop a database superuser rewriting the whole chain |
| Prompt injection | Delimited evidence, schema-constrained output, no tools, verification independent of model text | Cannot be eliminated; a malicious email can still skew *candidates*, which then must pass deterministic checks |
| AI Gateway | Single provider path; consent, minimization, resolution, per-candidate validation | Provider-side retention is outside DataTrace's control and is never claimed to be zero |
| Case isolation | Enforced in database, Storage, backend, and AI scope | Covered by tests T09–T13 and scenario S1 |
| Provenance | Hash re-verification, `provenance.v1`, quarantine on mismatch | SHA-256 proves "unchanged since upload", not authenticity |
| Case boundary in the data model | Composite foreign keys on `citations`, `relationships`, `request_response_links`, `evidence_segments` | A database superuser can drop constraints; migrations are reviewed |
| Original-evidence metadata | `trg_evidence_immutable` rejects changes to hash, path, filename, MIME type, size, ids, ingest source and external reference, even for the service role | A superuser can disable triggers; the stored hash is also re-checked against the bytes before use (§5.2) |
| `VERIFIED` / `CONTRADICTED` | `trg_findings_state_guard` requires a same-transaction `PASS` result from an allowed rule | A backstop only: it does not re-evaluate the rule, so a wrong rule implementation is caught by the golden suite, not the trigger |
| Report grounding | Structure-level grounding, human-only notes, edited flags | Cannot prove a human-edited sentence is semantically supported (§14.2) |
| Secrets | Env vars only; `.gitignore` and CI scanning | Developer laptops and the demo machine are trusted |
| Gmail credentials (P1-0) | Encrypted refresh token; no client access to `gmail_connections`; signed `state`; read-only scope; tokens absent from logs, audit metadata and responses | The Google app is unverified and in Testing; refresh tokens expire after 7 days; the encryption key lives in the same environment as the service-role key, so a compromised backend host exposes both; connect and disconnect are account-level events and are not in a per-case ledger |

## 15.9 Gmail import security rules (P1-0, v1.4.2)

Person 1 designs these rules, Person 2 implements them, and Person 1 reviews the Gmail PR (Hours 17–20, §17.5) before any Gmail screen is shown in the demo.

1. **Read-only, one scope.** `https://www.googleapis.com/auth/gmail.readonly` and nothing else. The callback compares the scope Google reports as granted with this value and rejects anything different without storing a token (T24).
2. **State parameter.** `state` is an HMAC (key `GMAIL_STATE_SECRET`) over the user id, a random nonce and an expiry of 10 minutes. The callback verifies signature, expiry and that the user id equals the authenticated caller *before* it exchanges the code. A failure returns `VALIDATION` and writes nothing (T24).
3. **Server-side exchange.** The code is exchanged by the backend with `GMAIL_CLIENT_SECRET`. The authorization request sets `access_type=offline` and `prompt=consent`. The client secret never reaches the browser.
4. **Token handling.** The refresh token is encrypted with AES-256-GCM (key `GMAIL_TOKEN_ENC_KEY`, fresh random nonce per encryption) before it is stored. Access tokens are obtained per request from the refresh token and kept in memory only. No token is ever returned by an API, written to a log, put in audit metadata, or sent to a model (T25).
5. **No client access.** `gmail_connections` has no grant and no policy (§9.2, pgTAP item 12). It is invisible to every client role, including its owner.
6. **Authenticated and owner-checked.** All Gmail routes require the Supabase token like every other route. The import route calls `assertCaseOwner()` first and then loads the connection of the *caller*, never a connection chosen by request data (T28).
7. **Input validation.** Thread IDs must match the contract regex before any Google call. Google error bodies are never forwarded: failures map to `GMAIL_NOT_CONNECTED`, `GMAIL_AUTH_EXPIRED` or `GMAIL_UPSTREAM` (§16).
8. **Fail safe.** `invalid_grant` sets the connection to `EXPIRED`, imports nothing and returns `409 GMAIL_AUTH_EXPIRED` (T29). Each message is imported atomically (bytes stored, hash recorded, row written) or not at all; a failure partway through a thread keeps the complete items already imported and returns the error.
9. **Disconnect.** `DELETE /api/gmail/connection` revokes the token at Google (best effort) and always deletes the stored row. Evidence already imported stays: it is a preserved original like any other (§15.5).
10. **Test accounts only.** Only throwaway accounts that hold synthetic emails are connected. The connect screen states this. Never connect a real inbox.
11. **Logging.** No code path logs `code`, `state`, tokens or the `Authorization` header. T25 runs a sentinel token through connect and import and scans the captured logs.

---

# 16. API Surface

All endpoints live under `/api` and are served by the single adapter and router (§7.5). They require a valid Supabase access token (except `/api/health`), validate input and output with Zod, and return errors as `{ "error": { "code": string, "message": string } }`. Codes include `UNAUTHENTICATED` (401), `NOT_FOUND` (404), `VALIDATION` (400), `MALFORMED_PATH` (400), `AI_CONSENT_REQUIRED` (409), `EVIDENCE_QUARANTINED` (409), `GROUNDING_FAILED` (422), `GMAIL_NOT_CONNECTED` (409), `GMAIL_AUTH_EXPIRED` (409), `GMAIL_UPSTREAM` (502), `INTERNAL` (500). A resource owned by someone else returns `NOT_FOUND`. Names may follow framework conventions without changing the contracts.

| Method & path | Purpose | Tier |
|---|---|---|
| `GET /api/health` | Liveness (no auth); used by the adapter smoke test | P0 |
| `POST /api/cases` · `GET /api/cases` · `GET /api/cases/:id` | Create (`{ title, description? }`), list, read. `displayId` (`CASE-101`) is generated by the database and returned; callers never send it. | P0 |
| `POST /api/cases/:id/archive` | Archive a case. **There is no case DELETE endpoint.** | P1 |
| `POST /api/cases/:id/evidence` | Upload (multipart) or add a manual log; returns the item with `displayId` and `sha256` | P0 |
| `GET /api/cases/:id/evidence` · `GET /api/evidence/:id` | List; one item with artifacts and segments (ordinals, locators, text). Opening an item writes `EVIDENCE_VIEWED` (`kind: CONTENT`). | P0 |
| `GET /api/evidence/:id/download` | Backend-issued short-lived signed URL: `{ url, expiresAt }`. Authorizes, refuses deleted/quarantined items, writes `EVIDENCE_DOWNLOAD_AUTHORIZED` first, creates the URL, then writes `EVIDENCE_DOWNLOAD_URL_ISSUED` before returning it (both fail closed). | P0 |
| `DELETE /api/evidence/:id` | Soft delete of an evidence item with source-unavailable demotion (§15.5) | P1 |
| `POST /api/cases/:id/consent` · `DELETE /api/cases/:id/consent` | Record / revoke AI consent (`DELETE` revokes consent; it deletes no data) | P0 (record), P1 (revoke UI) |
| `POST /api/cases/:id/analyze` | Start an analysis run; returns run id | P0 |
| `GET /api/analysis-runs/:id` | Run and task status, accepted and rejected candidate counts | P0 |
| `GET /api/cases/:id/findings` | Findings with persisted citations, filterable by type, state, basis | P0 |
| `POST /api/findings/:id/verify` | Re-run rules for one finding | P1 |
| `POST /api/findings/:id/confirm` | User confirms a reading or a contradiction (audited; contradiction confirmation needs both claims `VERIFIED`) | P0 |
| `GET /api/cases/:id/request-response-matrix` | Matrix rows | P0 |
| `GET /api/cases/:id/signals` | Friction signals | P1 |
| `GET /api/cases/:id/timeline` · `GET /api/cases/:id/graph` | Timeline events; nodes and edges | P1 |
| `POST /api/cases/:id/reports` | Draft a report for lens and framework | P0 |
| `GET /api/reports/:id` · `PUT /api/reports/:id` | Read / save edited blocks (`CaseReportContentSchema`; server sets `origin`, `editedAfterDraft`, `authorId`) | P0 |
| `POST /api/reports/:id/validate` | Run `report_grounding.v1` | P0 |
| `POST /api/reports/:id/export?format=md\|json\|pdf` | Export (re-validates first) | P0 (md, json), P1 (pdf) |
| `GET /api/cases/:id/audit` · `GET /api/cases/:id/audit/verify` | Audit log; chain verification | P0 |
| `GET /api/gmail/status` | `{ connected, googleEmail?, status? }` for the current user | P1-0 |
| `POST /api/gmail/connect` | Start OAuth: returns `{ authUrl }` carrying a signed `state` (§15.9) | P1-0 |
| `POST /api/gmail/callback` | `{ code, state }`, forwarded by the frontend `/gmail/callback` page; verifies the state, exchanges the code, stores the encrypted connection | P1-0 |
| `GET /api/gmail/threads?q=&pageToken=` | Thread metadata for the picker (display only; nothing is stored) | P1-0 |
| `POST /api/cases/:id/evidence/gmail` | Import a thread: `{ threadId }` → `{ items, truncated }`. Each message becomes an ordinary evidence item with `ingestSource = GMAIL_IMPORT`; writes `EVIDENCE_IMPORTED` per item | P1-0 |
| `DELETE /api/gmail/connection` | Revoke at Google and delete the stored connection (deletes no evidence) | P1-0 |

**Frontend integration instructions (Member A).** Use `apiFetch` for everything. To open an original file: `const { url } = await apiFetch('/evidence/:id/download'); window.open(url)`. Never build a Storage URL, import a Storage client for evidence, or query Postgres tables from components. Display `displayId` values as returned; never generate them. **Gmail (P1-0):** the `/gmail/callback` page forwards `code` and `state` with `apiFetch('/gmail/callback', …)` and then returns to the case; components never see a Google token and never call Google.

---

# 17. Delivery Plan

## 17.1 Principles

- Contract first: agree the schema in `contracts/`, then build on both sides of it.
- Integration first: a thin end-to-end slice before any breadth or polish.
- Build is 40% of the score: a smaller system that works every time beats a larger one that works sometimes.

## 17.2 Pre-event work

Governed by §2.5. Until the organizers answer, assume the strict reading.

| Always safe | Only if organizers allow pre-built code |
|---|---|
| This spec, README, `docs/idea-submission.md` | Repo skeleton with workspaces and CI |
| Synthetic scenarios as test **data** (JSON/text) | `contracts/` Zod schemas |
| UI wireframes and a design-token sheet | Migrations, RLS, audit chain |
| Accounts and keys: Supabase project, AI provider, Slack, Google Cloud project (Gmail import, P1-0) | Gateway, mock and Grok adapters, prompt files |
| Library spikes (parsers, React Flow) thrown away afterwards | Verification rules and their unit tests |
| Two full demo rehearsals on paper | UI shell |

## 17.2A Pre-event preparation (v1.4)

Under §2.5, product code is written on site. This is what the team can usefully do before 24 Oct.

| Area | Tasks | Lead |
|---|---|---|
| Synthetic data | Use `tests/synthetic/acme-deletion/` (shipped with v1.4); add edge cases; check every golden quote is an exact substring of its email body | D |
| Design | Wireframes for four screens (findings list, evidence viewer, request-response matrix, report editor); design-token sheet; landing page design | A |
| Setup | Supabase project, AI provider account and keys, Slack; Docker and Supabase CLI installed and images pulled; run `supabase start` once on a throwaway project; Node 20+ and a warm npm cache | C, B |
| Gmail import setup (P1-0) | In Google Cloud: create a project and enable the Gmail API; set up the OAuth consent screen as **External** with publishing status **Testing**; add the two throwaway Gmail accounts as test users; create a **Web** OAuth client with redirect URI `http://localhost:3000/gmail/callback`; put the client ID and secret in a local `.env` (never committed). Seed the throwaway inboxes by hand with the synthetic Acme emails. **No Gmail code** (§2.5) | C (Person 1) |
| Spikes (deleted afterwards) | `.eml` parsing, text-PDF extraction, React Flow | B |
| Paper work | Prompt ideas and cue-lexicon review on paper (Appendix B #10); demo and Q&A rehearsal from `docs/DEMO_KIT.md` and `docs/QA_SHEET.md` | D, all |
| Logistics | Travel to IIT Guwahati (not covered), chargers and extension cords, offline copies of docs, phone hotspot as network backup | all |
| Questions to organizers | Which LLM providers the $100 credits cover and whether a vision model is included (Appendix B #2); jury slot length and whether it sits inside the 24 hours (#3) | D |

**Not before the event:** `contracts/`, migrations, the Gateway, rules, prompts as code, the UI shell, and any Gmail import code (routes, token vault, UI). If the team ever decides to bring any code, it must be disclosed under §2.5 first.

## 17.3 Scope tiers and the cut line

| Tier | Meaning | Contents |
|---|---|---|
| **P0** | Must work in the demo. Protect it first. | Single API adapter + router (`/api/health`); auth and cases with database-generated display IDs; upload with SHA-256 and private storage; audited signed-URL download; `.eml`, `.txt`, text-PDF (page-level segments) and manual-log ingestion; consent + Gateway + minimization; candidate-to-persisted citation resolution; Zod validation with typed claim payloads; cited findings; rules `citation_integrity.v1`, `claim_verification.v1`, `provenance.v1`, `request_response.v1`, `contradiction_support.v1`, `report_grounding.v1`; request-response matrix; findings list with separate basis and state badges; evidence viewer with **whole-segment** citation navigation; contradiction with user confirmation; block-structured complaint draft (AI: heading and assertion only), live editor with human `user_note`, Markdown/JSON export; hash-chained audit with verify; source-quarantine demotion; `mock` provider and cached demo run |
| **P1** | Adds depth when P0 gates are green. | **P1-0: Gmail import** (§5.5), first in the P1 order; then **P1-A**, everything else in this row: Timeline; graph (React Flow); friction signals (start with `UNANSWERED_REQUEST`, `POSSIBLE_DELAY`, `REPEATED_REQUEST_FOR_PROVIDED_INFORMATION`); rules `entity_reference.v1`, `relationship_taxonomy.v1`, `event_consistency.v1`, `friction_validation.v1`, `corroboration.v1`; exact quote highlighting inside a segment; paragraph-level PDF locators; DOCX; screenshots (vision or manual transcript); PDF export; evidence soft-delete endpoint and case archive; consent revocation UI; full pgTAP suite in CI |
| **P2** | Stretch. Do not start before P1 is stable. | Continuous or background Gmail sync (the one-shot import is P1-0); HTTP probes; DPO directory routing; DKIM verification; background monitoring; personal-data map; request builder; DPDP framework pack; public deployment; account purge |

**Cut line:** at Hour 14 all **P0-Core** items (below) must be demonstrable. Anything P0-Core that is not working at Hour 14 stops all other work until fixed. **P0-Hardening** items not finished at Hour 14 are demoted to P1: they are neither demonstrated nor claimed (§23, principle 11).

### P0 delivery groups (milestone labels)

P0 is delivered in three ordered groups. The groups set the *order* of work; nothing is removed from P0. They map onto the hour schedule in §17.5.

| Group | Purpose | Contents | Milestone |
|---|---|---|---|
| **P0-A: Evidence-to-finding core** | Proves DataTrace is a working product | Single API adapter and router; Supabase Auth and case create/list (the minimum needed to run anything); `.eml`, `.txt` and manual-log upload, with text-PDF ingestion added once the email slice works; parsing and segments; SHA-256 and private storage; consent; `mock` and live extraction; candidate-to-persisted citation resolution; `citation_integrity.v1` and `provenance.v1`; findings list with basis and state shown separately; evidence viewer | **M1:** Hour-6 vertical slice (§17.4) on one synthetic email, end to end |
| **P0-B: Trust and safety controls** | Proves it is safer than a plain AI summarizer | Ownership checks in every handler; audited signed-URL download; Zod validation at every boundary; no UUIDs to the model; `claim_verification.v1` and the single engine transition path; database invariants (§9.1.1) with pgTAP tests; mock-provider fallback; hash-chained audit with verification | **M2:** Hours 6–10 |
| **P0-C: Final action workflow** | Proves the user can act on the result | Request-response matrix and `request_response.v1`; contradiction flow with user confirmation (`contradiction_support.v1`); report draft, `report_grounding.v1`, human notes, live editor; Markdown/JSON export; source-quarantine demotion; cached demo run | **M3:** Hours 10–14 (cut line) |

**Rule under schedule pressure (v1.4):** P0-Core is never sacrificed for a graph, timeline, Gmail import, PDF export or any other P1/P2 item. Within P0, **P0-Hardening is cut first**. The P0-A/B/C groups above remain as ordering labels; the P0-Core / P0-Hardening split below decides what is cut.

### v1.4 build-day tiers: P0-Core and P0-Hardening

Judges score Build at 40% and review the working build. Hardening that nobody can see earns nothing if the visible flow is late, so v1.4 orders P0 by what the jury meets first. The P0 list above stays the *target design*; this split decides what is built first and what is cut first.

**P0-Core: must run end to end by Hour 14. The demo depends on it.**

| # | Item | Owner | Target |
|---|---|---|---|
| 1 | Adapter and router (`/api/health`), Supabase Auth, cases with database-generated display IDs | A, B, C | Hours 1–3 |
| 2 | Upload (`.eml`, `.txt`, manual log) → SHA-256 → private storage → parse → segments; text-PDF only after the email path works; backend-issued signed-URL download (basic) | B, C | Hour 6 |
| 3 | Consent, Gateway (minimization, Zod validation, candidate-to-persisted citation resolution), `mock` provider plus one live provider | D | Hour 6 |
| 4 | Rules `citation_integrity.v1`, `provenance.v1`, `claim_verification.v1` | D | Hours 6–10 |
| 5 | Findings list with separate basis and state badges; evidence viewer with whole-segment citation navigation (T19) | A | Hours 6–10 |
| 6 | `request_response.v1` and the request-response matrix, including one `UNANSWERED` row | D, A | Hour 10 |
| 7 | `contradiction_support.v1`, **mechanical path only** | D, A | Hour 10 |
| 8 | Report: AI draft (heading and assertion only), `report_grounding.v1`, live editor with human `user_note`, Markdown/JSON export, export blocked when ungrounded | D, B, A | Hour 14 |
| 9 | Ownership check in every handler; SELECT-only client grants; no client DELETE; a scripted cross-case attempt by a second user | B, C | Hour 10 |
| 10 | Cached demo run, `DEMO_MODE`, backup video | D, all | Hour 14 (cached run), Hour 23 (video) |

Core tests: T01–T08, T09 (grant check), T10 (scripted), T15 (mechanical path), T17, T19; scenarios 1, 2, 3 (mechanical variant), 5, 7, 10 and S2. The six rules above are the six P0 rules; they are the only rules that may be called live unless more are built.

**P0-Hardening: start only when Core items 1–8 run end to end. First to be cut.**

- Hash-chained audit ledger, `verify_audit_chain` and its UI (§9.3)
- Double-event, fail-closed audited downloads (T11, T12)
- Automated pgTAP suite in CI (T13, T18, T20–T23) and the database invariants of §9.1.1 beyond basic keys and grants
- Source quarantine and demotion cascade (T14, T16, scenario 6)
- User-confirmed contradictions, `resolution.mode = USER_CONFIRMED` (scenario 3 variant, rest of T15)

Anything not finished at Hour 14 becomes P1. In v1.4.2 the P1 and P2 lists change in one way only: one-shot Gmail import moves from P2 to P1-0 (below); continuous sync stays P2.

### P1-0: Gmail import (v1.4.2)

Gmail import (§5.5) is promoted from P2 to **P1-0**: the first item in the P1 order, ahead of P1-A (timeline, graph, friction signals, the other P1 rules, exact-range highlighting, DOCX, screenshots, PDF export and the rest). It is promoted, not made P0. It is only a new way to bring emails into the same evidence → verification → report flow, so P0-Core is never sacrificed for it.

| Aspect | Decision |
|---|---|
| Scope | Connect Gmail, pick a thread, import its messages as raw `.eml` originals, disconnect. One-shot, no sync. Routes in §16, contracts in §10.6, security rules in §15.9 |
| Owner | Person 2 (A + B) builds it; Person 1 designs the security rules and reviews the PR |
| Estimate | About 3–4 hours of Person 2's time (an estimate, not a measurement) |
| Schema and contracts | Built early, at the Hour-1 contract freeze and the Hour-3 schema handoff: migration 005 (§9.1), the §10.6 contracts and the `GmailClient` mock fixtures. They are small, and freezing them early avoids a `[CONTRACT-BREAK]` later. **No Gmail behavior (routes, UI, token vault) is written before Hour 14.** |
| Start condition | Hour 14, and only if every P0-Core item is demonstrable. Otherwise Person 2 fixes Core and P1-0 does not start |
| What it pushes down | Any P0-Hardening item not finished at Hour 14 drops below P1-0 in priority (order below). In practice this moves the audit-verify UI and audited double-event downloads down |
| Optional trade | The team may move code freeze from Hour 20 to Hour 21 to keep those items. Decide at Hour 14 and record it in `docs/integration.md` (Appendix B #17) |
| Fallbacks | `.eml` upload and the cached demo (§21). Gmail never becomes the only way to get evidence in |

**Order of work after Hour 14.** (1) Fix anything in P0-Core that is not running. (2) P1-0 Gmail import: Person 2, Hours 14–17. (3) Demoted P0-Hardening: Person 1, Hours 17–20, in this order: user-confirmed contradictions; quarantine and demotion cascade; recording (or re-recording) the cached demo run; then, if time remains, audited double-event downloads and the audit-verify UI. (4) P1-A only if everything above is done early. Whatever is not built is not demonstrated or claimed (§23, principle 11).

## 17.4 Hour-6 vertical slice

By Hour 6 the team demonstrates this unbroken path on one synthetic email:

```text
Create case → upload .eml → private storage + SHA-256 → consent → Gateway extraction
→ Zod validation → citation resolved from display ID + ordinal → cited finding → citation_integrity + provenance
→ finding shown in UI with basis and state
```

No secondary view (graph animation, polish) is started before this runs. `claim_verification.v1` follows in Hours 6–10 and takes the finding from `AI_INFERRED` to `VERIFIED` for DIRECT claims.

## 17.5 24-hour schedule

Assumes everything is built on site (strict reading). Times are hours from the start of the build.

| Hours | Focus | Parallel work |
|---|---|---|
| **00–01** | Setup and contract freeze | Everyone runs the repo locally; Supabase and AI keys verified; credits provider confirmed. **A** commits the API adapter and `lib/api.ts`; **B** commits `router.ts` with `/api/health` and the adapter smoke test; the adapter is then frozen. **C** verifies the Storage restrictive policy works on the local stack (Appendix B #9). Core contracts agreed and committed: typed payloads, candidate versus persisted citations, report schemas. **P1-0 schema and contracts:** Person 1 includes the §10.6 contracts in the freeze and migration 005 in the Hour-3 schema handoff; no Gmail behavior yet |
| **01–06** | **Vertical slice (Gate: Hour 6)** | **Person 2 — A:** app shell, case and evidence pages through `apiFetch`, finding list with badges. **B:** upload and download endpoints, `.eml`/text parsers, segmenter, worker. **Person 1 — C:** migrations (display IDs, indexes, CHECKs, plus the small P1-0 Gmail schema), grants, RLS, storage policy, audit chain. **D:** Gateway including `resolver.ts`, `mock` + Grok adapters, `extraction.v1`, `citation_integrity.v1` and `provenance.v1` |
| **06–10** | P0 intelligence | **Person 2 — A:** request-response matrix, evidence viewer with whole-segment navigation. **B:** analysis orchestration, findings API, confirm endpoint. **Person 1 — C:** pgTAP RLS, grant and storage tests, audit verify endpoint. **D:** `claim_verification.v1`, response analysis, `request_response.v1`, `contradiction_support.v1`, contradiction candidates |
| **10–14** | P0 action layer | **Person 2 — A:** live editor with citation backlinks and user notes. **B:** reports and export API. **Person 1 — C:** CI, seed data for the demo. **D:** `reportDraft.v1`, `report_grounding.v1`, framework config. **Hour 14: cut line.** |
| **14–17** | **P1-0 Gmail import** (Person 2); Person 1 sleeps | **Person 2:** Gmail connect button and callback page, thread picker, OAuth and import routes, token vault, disconnect; tests T24–T29 against `GMAIL_MODE=mock`; one live connect and import with a throwaway account. Starts only if every P0-Core item runs (§17.3). **Person 1** sleeps (§17.5A); nothing in `contracts/` or migrations changes |
| **17–20** | Hardening and demo capture (Person 1); Person 2 sleeps | **Person 1:** review the Gmail PR against §15.9 (about 30 minutes); then, in order: user-confirmed contradictions; quarantine and demotion cascade; synthetic suite on all scenarios and T01–T23 (T24–T29 if P1-0 is built); cross-case and storage-bypass attempts; malformed AI output; rate-limit errors; record or re-record the cached demo run; then, if time remains, audited double-event downloads and the audit-verify UI. **P1-A** (timeline, graph, friction signals, the other P1 rules, exact-range highlight, PDF) starts only if all of that is done early. **Person 2** sleeps, then wakes for code freeze |
| **20** | **Code freeze** on `main` (bug fixes only); Hour 21 if the team chose the trade in §17.3 | |
| **20–23** | Demo readiness | Seed deterministic demo data; two full rehearsals; record the 3-minute backup video; prepare static screenshots |
| **23–24** | Buffer and presentation | Final run-through; present |

If the presentation slot sits inside these 24 hours, move the freeze earlier to match; the cut line and the P0 list do not change.

### 17.5A Rest, meals and escalation (v1.4)

- Hours are counted from the start of the build; convert to the real clock once the start time is known.
- **Sleep rota** (v1.4.2, two people; target at least 3 hours each, after the Hour-14 cut line): **Person 1 sleeps Hours 14–17** while Person 2 builds P1-0; **Person 2 sleeps Hours 17–20** while Person 1 completes hardening and records the cached run. Both are awake from Hour 20 for code freeze and rehearsals. While one person sleeps, the other owns the bug list; P1-0 is the only P1 work in progress and nobody starts a P1-A feature. Review and merge rules for the sleeping window are in §3.5.
- Eat when the organizers serve meals. One person at a time may stay at the keyboard through a meal.
- **Time-box:** a task more than 90 minutes over its estimate goes to the lead (D) and is re-scoped or cut under §17.3. With two people the decision is joint; Person 1's own overruns are re-scoped with Person 2.
- **Presentation slot:** when jury times are published (Appendix B #3), move code freeze to at least 3 hours before the earliest possible slot and place rehearsals after it.
- Keep a running list of *specified but not built* items in `docs/integration.md` so the pitch never claims them.

## 17.6 Integration checkpoints

| Checkpoint | Boundary | Success criteria |
|---|---|---|
| **A ↔ B** | UI to API **through the adapter** | `GET /api/health` and an authenticated `GET /api/cases` work via `frontend/app/api/[[...slug]]/route.ts`; UI renders cases, findings, matrix from API payloads; loading and error states handled; evidence download works only via the signed-URL endpoint |
| **B ↔ C** | Backend to Supabase | Uploads reach private storage; queries respect RLS; display IDs come back from the database; audit rows written; direct client Storage access is denied |
| **B ↔ D** | Backend to Gateway | Backend sends a scope; Gateway returns persisted findings whose citations resolved from display IDs; rejected candidates are counted |
| **D ↔ C** | Engine to database | Findings, citations and verification results persist without FK, CHECK or schema violations |
| **Gmail import (P1-0)** | Browser → backend → Google → evidence pipeline | With `GMAIL_MODE=mock`, importing the Acme thread gives the same items, hashes and segments as uploading the same bytes; one live connect and import with a throwaway account succeeds from the demo machine on the venue network; disconnect deletes the stored row; T24–T29 pass |
| **End to end** | Whole system | A synthetic case completes ingestion, analysis, verification and export **twice in a row** without error |

---

# 18. Testing & Evaluation

## 18.1 Synthetic dataset

All tests, demos and fixtures use synthetic data only. Provider fixtures are stored in the AI-facing candidate form (display IDs and ordinals) so the same files exercise the real resolver. Ten core scenarios plus two security scenarios:

| # | Scenario | Expected behaviour |
|---|---|---|
| 1 | `NORMAL_RESPONSIVE` | All request items `ANSWERED`; `DIRECT` claims with supported quotes reach `VERIFIED` via `claim_verification.v1`; no friction signals |
| 2 | `AMBIGUOUS_RESPONSE` | `GENERIC_RESPONSE` / `PARTIAL`; hedged or future statements stay `AI_INFERRED` (`INCONCLUSIVE`) |
| 3 | `CONTRADICTORY_CLAIMS` | Matching `claimKey` with opposite polarity → `CONTRADICTED` (`MECHANICAL`); a variant with non-matching keys → "needs your confirmation" → after user confirmation `CONTRADICTED` (`USER_CONFIRMED`) |
| 4 | `FALSE_POSITIVE_ENTITY` | Similar names are not merged; unsupported links rejected |
| 5 | `MISSING_EVIDENCE` | Fabricated quote → citation `INVALID`, finding persisted `UNVERIFIED` |
| 6 | `MANIPULATED_FILE_HASH` | SHA-256 mismatch → item quarantined; citing findings `UNVERIFIED` with `source_unavailable`; affected reports unvalidated |
| 7 | `MALFORMED_AI_OUTPUT` | Invalid envelope → task `FAILED`, zero findings; one invalid candidate among valid ones → only that candidate rejected |
| 8 | `DUPLICATE_IDENTITY` | Same organization under two names merged only with cited evidence; a duplicate upload does not count as corroboration |
| 9 | `TIMESTAMP_ANOMALY` | Response dated before request → `CHRONOLOGY_IMPOSSIBLE` |
| 10 | `UNGROUNDED_REPORT_CLAIM` | Assertion with no valid findings → export blocked |
| S1 | `CROSS_CASE_ACCESS` | User B reads nothing of user A's data (tables and storage) |
| S2 | `PROMPT_INJECTION_IN_EVIDENCE` | Instruction hidden in an email does not change output structure; any resulting candidate fails or is flagged |

## 18.2 Required regression cases (v1.2, extended in v1.3 and v1.4.2)

Every case is automated. "Layer" says where it runs: **U** unit (Vitest), **G** Gateway/integration (mock provider), **D** pgTAP, **E** end-to-end script, **C** component (Vitest + Testing Library).

| ID | Case | Layer | Expected result |
|---|---|---|---|
| T01 | A `DIRECT` claim with a supported quote reaches `VERIFIED` | U, E | `claim_verification.v1` PASS; `AI_INFERRED` → `VERIFIED`; `verification_results` row written |
| T02 | An `INFERRED` claim cannot reach `VERIFIED` | U, D | Rule does not apply (basis); a direct SQL attempt violates `ck_verified_basis` |
| T03 | Invalid `CLAIM` payload is rejected by Zod | U, D | Missing `normalizedClaim`, unknown predicate, extra key, bad polarity → candidate rejected (`SCHEMA`); direct insert violates `ck_claim_payload` |
| T04 | Human-readable AI citation resolves to the correct UUIDs | G | `EV-101` + ordinal 3 → expected `evidenceId` and `segmentId`; persisted locator equals the stored one |
| T05 | AI citation outside task scope is rejected | G | Evidence or ordinal not in the scope map (including another case's display ID) → `OUT_OF_SCOPE`; candidate rejected if no citation survives |
| T06 | Malformed citation fails safely | U, G | Non-object, missing fields, ordinal 0 / negative / string, wrong locator shape → dropped with reason, no exception, no partial write |
| T07 | AI cannot generate `user_note` | U, G | `AIReportDraftSchema` rejects a `user_note` block and any extra key; draft rejected, nothing persisted |
| T08 | Human `user_note` is accepted | G | `PUT /api/reports/:id` with a `user_note` succeeds; server stamps `authorId`; grounding does not require findings for it |
| T09 | Client cannot DELETE a case | D, E | `DELETE FROM cases` as `authenticated` fails (privilege); no HTTP route deletes a case |
| T10 | Cross-case evidence access fails | D, G, E | User B gets `404` for user A's evidence; a citation to another case's evidence is rejected |
| T11 | Direct Storage access cannot bypass audit | D, E | Client SDK download, list, upload and `createSignedUrl` on the `evidence` bucket all fail; each URL the backend issued has exactly one `EVIDENCE_DOWNLOAD_AUTHORIZED` and one `EVIDENCE_DOWNLOAD_URL_ISSUED` row |
| T12 | Signed URL requires authorization | E | No token → 401; other user's token → 404; quarantined item → 409; failure of either audit write → no URL returned; injected URL-creation failure → an `AUTHORIZED` row but no `URL_ISSUED` row; URL stops working after its TTL |
| T13 | Malformed storage path fails safely | U, D | `parseEvidencePath('cases/../x')`, non-UUID segments, extra segments → `MALFORMED_PATH`; DB insert with a bad path fails with a check violation, never a cast error |
| T14 | Source deletion or quarantine demotes findings | G, E | Citing findings → `UNVERIFIED` + `source_unavailable`; excluded from report eligibility; reports revert to unvalidated; audit rows written (quarantine P0, soft delete P1) |
| T15 | Contradiction becomes `CONTRADICTED` only after bilateral proof | U, G | One claim not `VERIFIED` → stays candidate; both `VERIFIED` + matching key/opposite polarity → mechanical; payload that fails Zod → `INCONCLUSIVE`; later demotion of a claim reverts the contradiction |
| T16 | Manipulated-hash scenario (6) remains valid | E | As scenario 6 |
| T17 | Malformed-AI-output scenario (7) remains valid | G | As scenario 7 |
| T18 | New indexes and migrations execute | D, CI | `supabase db reset` applies all migrations from empty; every index in §9.1 appears in `pg_indexes` |
| T19 | P0 segment-level citation navigation works | C | Clicking a citation token scrolls to and marks the element `[data-segment-id=<id>]` as highlighted and shows the quote and SHA-256 in the side panel |
| T20 | Case boundary is enforced by the database | D | A citation, relationship or matrix link that mixes findings, evidence items or segments of different cases fails with a foreign-key violation; a segment of another evidence item, or an artifact of another evidence item, is rejected |
| T21 | Original-evidence fields are immutable | D | As service role, `UPDATE` of `sha256`, `storage_path`, `original_filename`, `mime_type`, `size_bytes`, `case_id`, `display_id`, `uploaded_at`, `ingest_source` or `external_ref` fails; `processing_status` and `deleted_at` updates succeed; a set `deleted_at` cannot be cleared |
| T22 | `VERIFIED` and `CONTRADICTED` require an engine result | U, D | Direct SQL to either state without a same-transaction `PASS` `verification_results` row fails; `INSERT` as `VERIFIED` fails; the engine path writes result, state and audit event together; demotion always succeeds |
| T23 | Audit chain stays intact under concurrency; download events are exact | D, E | Two interleaved inserts for one case leave `verify_audit_chain` intact with gap-free `case_seq`; an injected URL-creation failure leaves `AUTHORIZED` without `URL_ISSUED` (with T12) |
| T24 | Gmail OAuth state is validated (P1-0) | U, E | A tampered, expired, wrong-user or missing `state` → `VALIDATION`; no code exchange is attempted and no `gmail_connections` row is written; a callback that grants any scope other than `gmail.readonly` is rejected and stores nothing |
| T25 | Gmail credentials never leak (P1-0) | U, D, E | `refresh_token_enc` is not the plaintext token; `authenticated` cannot read `gmail_connections`; a sentinel token run through connect and import appears in no API response, captured log line or audit metadata |
| T26 | Gmail import yields an ordinary evidence item (P1-0) | G, E | With `GMAIL_MODE=mock`, importing the synthetic Acme thread creates items with `source_type = EMAIL`, `ingest_source = GMAIL_IMPORT` and `external_ref` set; SHA-256 equals the hash of the decoded raw bytes; uploading the same bytes as `.eml` yields identical segments; one `EVIDENCE_IMPORTED` row per item; extraction, verification and report flow work unchanged |
| T27 | Gmail import is idempotent and bounded (P1-0) | G, D | Importing the same thread twice creates no new items (`duplicate: true`); a thread above `GMAIL_MAX_MESSAGES_PER_IMPORT` returns `truncated: true`; a malformed `threadId` → `VALIDATION` before any Google call |
| T28 | Gmail import respects ownership and isolation (P1-0) | E | Another user's case → `404`; a user with no connection → `409 GMAIL_NOT_CONNECTED`; user B never sees the imported items (scenario S1 extended) |
| T29 | Expired or revoked connection fails safe (P1-0) | G, E | `invalid_grant` from Google → connection `EXPIRED`, `409 GMAIL_AUTH_EXPIRED`, no item written for the failing message; `DELETE /api/gmail/connection` removes the row |

**T24–T29 (P1-0)** are required only if Gmail import is built. CI runs them against `GMAIL_MODE=mock` and never calls Google.

## 18.3 Layered metrics

There is no single "AI accuracy" number. Independent layers, each reported as measured:

| Layer | Metric | Target |
|---|---|---|
| Schema adherence | candidates passing Zod ÷ candidates returned | ≥ 95% (envelope validity ≥ 99%) |
| Citation resolution | citations resolved by the Gateway ÷ citations proposed | ≥ 95% |
| Citation precision | citations passing `citation_integrity.v1` ÷ citations resolved | ≥ 95% |
| Extraction recall | golden claims found ÷ golden claims | ≥ 90% |
| Rule accuracy | rule outcomes matching the golden suite | 100% |
| False `VERIFIED` | golden claims wrongly `VERIFIED` | 0 |
| Grounding integrity | exported assertions backed by valid findings | 100% |
| Cross-case isolation | unauthorized reads | 0 |

Targets are goals to measure against. If a number is missed, show the real number.

## 18.4 Test types

Unit tests for every rule and contract; pgTAP for RLS, grants, storage, display IDs, indexes and the audit chain; the synthetic runner (mock provider fixtures in CI; real provider only for evaluation); Gateway integration tests; component tests for citation navigation; integration tests for the checkpoints in §17.6; an end-to-end script that runs the demo case twice.

---

# 19. Workflow Rules

## 19.1 Branches

- `main` is protected: no direct or force pushes; changes arrive through pull requests with CI green and one reviewer (with two people, always the other person; §3.5 covers the window when they are asleep).
- Branch names: `feature/frontend-*` (A), `feature/backend-*` (B), `feature/database-*` (C), `feature/ai-*` (D); P1-0 work (Person 2) uses `feature/gmail-*`. Rebase on `main` before opening a PR.
- During the 24-hour build, reviews should happen within about 15 minutes; do not let PRs queue.
- **Seam ownership:** only A edits `frontend/app/api/[[...slug]]/route.ts` and only B edits `backend/api/`. The adapter is frozen after Hour 1; a new endpoint is a change to `backend/api/` plus a contract, never a new file under `frontend/app/api/`.
- Commit style: small, descriptive, conventional (`feat(ai): add friction signal parser v1`).

## 19.2 Rules for AI-assisted coding

1. **Humans own the architecture.** Assistants suggest; the module owner reviews every diff.
2. **Work from this spec.** Every prompt to an assistant cites the relevant section.
3. **Small, scoped prompts.** Not "build DataTrace". Instead: "Implement `citation_integrity.v1` in `verification/rules/citationIntegrity.ts` per §12.3."
4. **Inspect diffs** for silent contract drift, new dependencies, deleted comments, hard-coded secrets.
5. **Protect `contracts/`.** An assistant never edits it without the change protocol below.
6. **Test before merge.** Every PR carries a unit or synthetic test.
7. **Do not paste real personal data or secrets** into any assistant.

## 19.3 Change protocol (contracts and this spec)

1. Update the Zod schema in `contracts/schemas/`; regenerate types.
2. Update affected synthetic fixtures.
3. Tell affected owners in the team chat.
4. Open a PR titled `[CONTRACT-BREAK] <description>`; affected owners approve.
5. For architecture or scope changes, edit this file in the **same PR** and add a line to Appendix C.

## 19.4 Merge readiness and `docs/integration.md`

A PR merges only if: it compiles with no TypeScript errors; relevant tests pass; no secrets, `.env` files or raw evidence are in the diff; and the owner updated their entry:

```markdown
## Module: AI & Privacy Intelligence
- **Owner:** D
- **Status:** Ready for B ↔ D integration
- **Contracts validated:** CandidateFinding v1, ExtractionSchema v1
- **Tests:** 10/10 synthetic scenarios (mock provider)
- **Blockers:** none
```

---

# 20. Definition of Done, Release Gates & Freeze

## 20.1 Feature definition of done

1. **Contract compliant** with `contracts/`.
2. **Isolated:** respects case boundaries and passes RLS, grant and storage tests.
3. **Tested:** unit tests and relevant synthetic scenarios.
4. **Resilient:** handles bad input, timeouts, model failures.
5. **Audited:** state-changing actions and evidence access write audit events.
6. **No leaks:** no secrets or personal data in code or logs.
7. **Explainable:** the owner can demo and explain it.

## 20.2 Release gates

Three cumulative gates, each checked on the synthetic suite.

**v1.4 gate rule.** Lines tagged **(H)** are P0-Hardening (§17.3). A gate passes when every untagged line passes. An (H) line that is built must also pass. One that is not built is recorded as *specified, not built* in `docs/integration.md` and is not claimed in the UI, README or pitch.

```text
GATE 1 — CORE WORKS
  • Auth and case creation work; case, evidence and finding display IDs are database-generated.
  • Every request reaches the backend through the single adapter and router.
  • Upload computes SHA-256 and writes to private storage.
  • Evidence downloads work only through the backend signed-URL endpoint; direct client Storage access is denied. (H: the double-event audit.)
  • Zero cross-case access (scripted attempt by a second user); no client DELETE. (H: the automated pgTAP RLS, grant and storage suite.)
  • Ingestion status updates cleanly (PENDING → PROCESSED / FAILED / QUARANTINED).
          │ pass
          ▼
GATE 2 — TRUSTWORTHY INTELLIGENCE
  • Gateway enforces consent and minimization; every task is audited.
  • Provider output is Zod-validated per candidate; malformed output creates no findings.
  • Model citations resolve from display IDs to UUIDs inside the task scope; out-of-scope citations are rejected.
  • Candidates stay UNVERIFIED / AI_INFERRED until rules run; a DIRECT claim reaches VERIFIED only via claim_verification.v1.
  • P0 rules (citation_integrity, claim_verification, provenance, request_response, contradiction_support,
    report_grounding) pass the golden suite at 100%.
  • Contradictions (and friction signals, if P1 is in) display their citations. (H: quarantine demotes dependent findings.)
  • (H) verify_audit_chain reports "intact" after a full run; an UPDATE on audit_events is rejected.
          │ pass
          ▼
GATE 3 — DEMO READY
  • Evidence → Intelligence → Verification → Action runs end to end.
  • Matrix, findings and evidence viewer render smoothly; citation click highlights the whole segment.
  • Live editor blocks an ungrounded assertion via report_grounding.v1; the AI cannot create user_note blocks.
  • The demo case runs twice in a row with no reset and no errors.
  • Cached run, backup video and static screenshots are ready.
```

**(P1-0) lines (v1.4.2).** If Gmail import is built, these lines are added to Gate 1 and Gate 3 and must pass:

- Gate 1: T24–T29 pass against `GMAIL_MODE=mock`; `gmail_connections` is unreadable by clients; no token appears in logs, responses or audit metadata; Person 1 has signed off the §15.9 review.
- Gate 3: one live connect and import with a throwaway account succeeded on the demo machine; `.eml` upload and the cached run still work without Gmail.

If it is not built, it is recorded as *specified, not built* in `docs/integration.md` and is not shown, claimed or mentioned (§23, principle 11).

## 20.3 Frozen core and extension points

**Frozen after Hour 1 (change only through §19.3):** the data flow Evidence → Segments → Gateway → Findings → Rules → Report; the basis and state enums; the rules' ids and semantics (eleven specified, six P0); the typed payload and citation contracts; Postgres + private Storage + Auth + RLS and the SELECT-only client grant model; the append-only hash-chained audit design; the adapter file and router contract (§7.5).

**Permitted extensions:** a new `FindingType` or `RelationshipType` (contract + migration); a new rule (`verification/rules/*.v1.ts`); a new predicate or cue (`contracts/schemas/predicates.ts`, reviewed by D); a new prompt version; UI filters and export templates; a new framework entry in `frameworks.ts`; a new endpoint (in `backend/api/` only).

---

# 21. Demo Script & Fallbacks

The jury's slot length is not published. Below is the full 15-minute script; keep a 5-minute cut (Act 1 skim, Act 2 core, Act 3 grounding block) ready.

**Act 1 — Evidence and integrity (0:00–5:00)**
1. Frame the user: a citizen who asked a company to delete their data and got stalled.
2. Create a case titled "Acme Corp deletion request". The database assigns its display ID (`CASE-101` on a fresh database).
3. Upload three items: the request email, a portal screenshot (or manual transcript), the company's reply.
   *(If P1-0 is built)* Import the request-email thread from the throwaway Gmail account instead of uploading it: Connect Gmail (read-only, test account), pick the thread, import. It appears as ordinary evidence with its own SHA-256. Say "import", never "sync".
4. Show the SHA-256 computed on upload and the private storage path.
5. Open an item: segments with their ordinals, metadata. Click "Download original": the backend issues a short-lived link and the audit view shows the `EVIDENCE_DOWNLOAD_AUTHORIZED` and `EVIDENCE_DOWNLOAD_URL_ISSUED` events.
6. Say: "The original is never modified, and there is no way around the audit trail to download it."

**Act 2 — Intelligence and deterministic verification (5:00–11:00)**
1. Enable AI for the case and show the consent notice and the minimization summary.
2. Run analysis (live, or the cached run if the network is slow).
3. Show candidate findings with their `AI_INFERRED` badges and the model confidence labelled as such. Point out that the model cited "EV-101, segment 3", not a database ID.
4. Run verification: `citation_integrity.v1` accepts real citations and rejects a fabricated quote; `claim_verification.v1` promotes a `DIRECT` claim to `VERIFIED` (show the quote next to it), while an `INFERRED` claim stays `AI_INFERRED`.
5. Show the request-response matrix: one item `UNANSWERED` ("no response found in case record").
6. Show a friction signal (if P1 is in) and a contradiction: two verified quotes side by side. The mechanical pair becomes `CONTRADICTED` on its own; for a second pair the UI says "needs your confirmation", and the presenter confirms it.
7. Say: "The model proposed. Deterministic code verified."

**Act 3 — Grounded action (11:00–15:00)**
1. Open the report, Complaint lens, GDPR template.
2. Click an assertion's citation: the viewer jumps to the cited segment, highlights it, and shows the exact quote and SHA-256.
3. Add an assertion with no evidence: `report_grounding.v1` blocks the export. Add a note as a `user_note`: it is accepted and labelled "Author's statement (not evidence-backed)".
4. Export Markdown (PDF if P1 is in). Show "Audit chain intact ✓".
5. Optional 20-second moment: attempt an `UPDATE` on the audit table in a SQL console and show it rejected.
6. Close: "DataTrace turns fragmented privacy evidence into verified, actionable intelligence, and never claims more than the evidence supports."

**Fallbacks**
- `DEMO_MODE=true` serves a pre-analyzed run; the `mock` provider replays recorded output. Never depend on live network or live provider.
- A 3-minute backup screen recording and static screenshots are stored on the presentation machine.
- The demo runs twice consecutively before the freeze, without resetting the database.
- If Google or the venue network is unavailable, skip the Gmail step and upload the same `.eml`. Never wait on Google on stage.

### Judge-facing rules (v1.4)

1. **Say what is live and what is replayed.** The Guide asks teams to say what depends on an external service. When a run is replayed from recorded provider output, say so in one sentence. Never present a replay as live.
2. **Include one live moment.** Ask a judge for two invented sentences a company might reply with (no real personal data), put them in a plain-text file and run the live provider on it. If the provider or network fails, say so and switch to the cached case; the `mock` provider cannot analyse new text.
3. **Show one awkward case.** At least one of: a hedged statement staying `AI_INFERRED`; a fabricated quote rejected by `citation_integrity.v1`; an ungrounded assertion blocking export.
4. **Skip what is not built.** If P0-Hardening items were cut, omit Act 1 step 5 (audit view), Act 3 step 4 ("Audit chain intact") and step 5 (SQL `UPDATE`), and do not mention them.
5. **Disclose pre-built work** with the statement in §2.5, adjusted to be true.
6. Timed scripts (5-minute cut, 3-minute backup video) and screen drills are in `docs/DEMO_KIT.md`; likely jury questions are in `docs/QA_SHEET.md`.
7. **Gmail import (if built).** Say it is a one-shot import of a thread from a throwaway account holding synthetic emails, through a Google app in Testing mode that only listed test users can use. Say "import", never "sync". Never connect a real inbox on stage. If it was not built, do not show or mention it (rule 4).

---

# 22. Acceptance Checklist

> **v1.4:** boxes tagged **(H)** belong to P0-Hardening (§17.3). Tick them if built; otherwise mark them *deferred* and do not claim them. **v1.4.2:** boxes tagged **(P1-0)** apply only if Gmail import is built.

- [ ] A second synthetic user cannot read the first user's cases, evidence, findings or audit rows (RLS and storage verified).
- [ ] No client role can DELETE (or write) any table; no HTTP route deletes a case.
- [ ] Case, evidence and finding display IDs are generated by the database; no caller supplies them.
- [ ] Every evidence item has a display ID and a verified SHA-256; binaries are reachable only through the backend's audited signed-URL endpoint, never by a public URL or direct client Storage access.
- [ ] Every request passes through `frontend/app/api/[[...slug]]/route.ts` into `backend/api/router.ts`; no other file exists under `frontend/app/api/`.
- [ ] Every displayed finding links to at least one valid, locatable segment; clicking a citation scrolls to and highlights its whole segment (`data-segment-id`).
- [ ] The UI and API show evidence basis and verification state as separate fields.
- [ ] Models are reached only through the Gateway; no provider key exists client-side; no UUID is sent to or accepted from a model.
- [ ] Malformed AI output is rejected by Zod and never produces findings; a `CLAIM` without a `normalizedClaim` cannot be stored.
- [ ] A `DIRECT` claim reaches `VERIFIED` through `claim_verification.v1`; an `INFERRED` claim cannot.
- [ ] At least one request-response link, one contradiction, and (if P1 is in) one friction signal are verified end to end.
- [ ] The verification engine lives in `verification/`, implements the six P0 rules (the five P1 rules if time allows), and no module in `ai/` can set a state.
- [ ] Every verification run writes `verification_results` rows.
- [ ] (H) Quarantining or deleting a source demotes citing findings, flags them `source_unavailable`, and invalidates affected reports.
- [ ] The AI report schema cannot produce `user_note`; a human `user_note` is accepted and labelled.
- [ ] A report with an ungrounded assertion cannot be exported.
- [ ] (H) `audit_events` is append-only and `verify_audit_chain` reports intact after the demo.
- [ ] All three release gates pass on the synthetic suite, twice consecutively, including T01–T19.
- [ ] (P1-0) Gmail import, if built: read-only scope only; refresh tokens encrypted, server-side and absent from logs, API responses and audit metadata; `gmail_connections` unreadable by clients; an imported email is an ordinary evidence item (hash, segments, citations) with `ingest_source = 'GMAIL_IMPORT'`; the UI, docs and pitch say *import*, never *sync*; T24–T29 pass.
- [ ] (P1-0) Only throwaway Gmail accounts holding synthetic emails were connected.

---

# 23. Non-Negotiables

A pull request that violates one of these is rejected.

1. **Preserve the evidence.** Never modify or overwrite an original file.
2. **Cite the source.** Never show a finding without a locatable citation.
3. **AI proposes, code verifies.** The model is a hypothesis generator; only deterministic rules and the user's confirmation change a state.
4. **Separate basis from state.** How something was derived is not the same as how far it has been verified.
5. **Never claim more than the evidence supports.** `VERIFIED` means confirmed against preserved evidence, not true in the world; "unanswered" means "no response found in the case".
6. **Enforce isolation.** Case boundaries hold across storage, database, and AI context. Clients never delete and never touch Storage directly.
7. **Ground every action.** No report assertion without findings.
8. **Keep an honest audit trail.** Every lifecycle action, every original-file download and every REST read of an item's extracted text is logged in the hash-chained ledger, with no personal content inside it. Direct database reads by the owner are scoped by RLS but not logged, and the product never claims otherwise (§9.3).
9. **Synthetic data only** in tests, demos and the repository.
10. **Models never see or produce internal IDs.** They cite by display ID and ordinal; only the Gateway resolves those to UUIDs.
11. **Claim only what is built.** The README, UI, pitch and docs describe only features that run in the build and pass their tests. Features that are specified but not built are labelled *specified*. This covers rule counts (say how many rules are live), the audit chain and every security property.

*v1.4 note on principle 8:* the hash-chained ledger is P0-Hardening (§17.3). Until it exists and passes its tests, no document, screen or pitch may call the audit trail tamper-evident.

*v1.4.2 notes.* **Principle 8:** connecting and disconnecting a Gmail mailbox are account-level events outside any case; they are not in a per-case ledger and no document may say otherwise. Importing a message is audited (`EVIDENCE_IMPORTED`). **Principle 9:** Gmail import connects throwaway accounts holding synthetic emails only; a real inbox is never connected. **Principle 11:** Gmail is described as *import* (one-shot, user-initiated), never as *sync*, monitoring or Google-verified access, and only if it is built and T24–T29 pass.

---

# Appendix A — Decision Register

Numbers 1–53 keep the team's earlier numbering. **✎** marks a decision whose detail changed in v1.1 or v1.2; 54–65 were added in v1.1, 66–79 in v1.2 and 80–85 in v1.4 and 86–94 in v1.4.2.

| # | Decision |
|---|---|
| 1 | Evidence-centric product: evidence is the system of record; every derived item links to source |
| 2 | Case is the primary boundary; everything is partitioned by `case_id` |
| 3 | Privacy-rights focus (DSAR, GDPR, CCPA, deletion); architecture stays adaptable |
| 4 | ✎ Evidence types: documents, email/RFC-822, screenshots, manual entries (extraction methods in §5.1); P0 PDF extraction is page-level text blocks |
| 5 | Original, artifact, segment and finding are separate linked entities |
| 6 | Integrity first: SHA-256 at ingestion, re-verified before processing |
| 7 | Evidence identity: UUID plus stable display ID |
| 8 | Timeline is a core view; uncertain dates are labelled |
| 9 | Case graph is a core view (P1) |
| 10 | Human review preserved at every step |
| 11 | Model confidence is not verification |
| 12 | Evidence basis: `DIRECT`, `OBSERVED`, `INFERRED`, `CONFLICTING` |
| 13 | ✎ Verification states: five values, semantics defined in §12.1; `VERIFIED` has a deterministic path for `DIRECT` claims through `claim_verification.v1` |
| 14 | No unsupported assertions: uncited candidates are rejected |
| 15 | Navigation both ways: Finding ↔ Citation ↔ Segment ↔ Evidence |
| 16 | Supabase for Postgres, Auth, Storage |
| 17 | Storage is not the database: binaries in Storage, metadata in Postgres |
| 18 | ✎ AI behind an abstraction; Grok is the development provider; provider-agnostic; `mock` mandatory |
| 19 | Ordered pipeline: extraction → response analysis → friction → contradiction → verification |
| 20 | Adaptive processing by format; retries never overwrite history |
| 21 | Analysis runs and tasks are tracked records |
| 22 | Typed, versioned structured output; unvalidated text rejected |
| 23 | Versioned prompt registry |
| 24 | Unified `Finding` abstraction |
| 25 | ✎ Citations pair a human-readable reference (evidence display ID + segment ordinal) on the AI side with UUID foreign keys in the database; the Gateway resolves one to the other |
| 26 | Extract privacy-relevant claims, not conversational summaries |
| 27 | Privacy-domain entities (controllers, processors, subjects, systems, data categories) |
| 28 | Controlled relationship taxonomy (11 types) |
| 29 | Hybrid events: model proposes, code normalizes and flags uncertainty |
| 30 | Verification evaluates evidence-connected findings deterministically |
| 31 | ✎ Eleven core rules (§12.3): v1.1's ten plus `claim_verification.v1` (1B) |
| 32 | ✎ Request-response matrix statuses: `ANSWERED`, `PARTIAL`, `UNANSWERED`, `DEFLECTED`, `UNCLEAR` |
| 33 | ✎ Contradictions need bilateral proof from two `VERIFIED` claims; mechanical match on `claimKey` with opposite polarity, or user confirmation (§13.4) |
| 34 | ✎ Friction uses the 8-signal taxonomy in §13.3, with preconditions |
| 35 | Report drafting restricted to eligible, cited findings |
| 36 | One case report, three lenses |
| 37 | Synthetic evaluation dataset; no real user data |
| 38 | Layered evaluation metrics |
| 39 | Candidate queues stay separate from verified views |
| 40 | AI Privacy Gateway for every model call |
| 41 | AI processing record kept; never claim zero provider retention |
| 42 | ✎ Case-level AI consent, stored as history in `ai_consents` |
| 43 | ✎ Access control: Auth, backend authorization, SELECT-only grants plus RLS, no client Storage access |
| 44 | ✎ Full-lifecycle audit, append-only and hash-chained; evidence access is audited before any URL is issued |
| 45 | Canonical Zod contracts in `contracts/` |
| 46 | Four-module ownership model |
| 47 | Contract-first integration |
| 48 | Feature branches; protected `main`; reviewed PRs |
| 49 | ✎ Pre-event vs on-site boundary depends on organizer rules (§2.5) |
| 50 | Vertical slice by Hour 6 |
| 51 | Demo tells one Evidence → Intelligence → Action story |
| 52 | Three layered release gates |
| 53 | Stable core plus controlled extension points |
| 54 | Verification engine lives in top-level `verification/`: pure, deterministic, no network or AI imports |
| 55 | ✎ `VERIFIED` means the evidentiary condition was deterministically confirmed against preserved evidence; it certifies the quote and its consistency with the normalized claim, not the paraphrase and not the world |
| 56 | Audit ledger is hash-chained: tamper-evident, not tamper-proof; chain head is embedded in exports |
| 57 | ✎ Reports are block-structured so grounding is checked structurally; the AI may emit only heading and assertion blocks |
| 58 | Screenshot text via a vision model through the Gateway, or a manual transcript; AI-derived text caps findings at `AI_INFERRED` |
| 59 | ✎ Stack: Next.js with a single catch-all adapter into `backend/api/router.ts`, plus a worker process; local-first demo; public deployment is P2 |
| 60 | ✎ Scope tiers P0 / P1 / P2 with an Hour-14 cut line (v1.2 reclassification in Appendix C) |
| 61 | `CONTRADICTED` belongs to the contradiction finding; the two claims keep their own states |
| 62 | Legal framework text comes from human-written config; the model cannot generate legal citations |
| 63 | `mock` provider is mandatory; token use is logged and budgeted against the shared credits |
| 64 | Evidence is untrusted data: delimited in prompts; verification never depends on model text |
| 65 | GDPR and CCPA in the MVP; DPDP Act 2023 is a stretch, to be verified before use |
| 66 | `claim_verification.v1` is the deterministic promotion rule for `DIRECT` claims, with fixed cue-based semantics; conditional, modal and future statements are never auto-`VERIFIED` |
| 67 | Typed payloads per finding type; a `CLAIM` requires a `normalizedClaim` (Zod and a database CHECK) |
| 68 | AI-facing candidate citations (display ID + ordinal) versus persisted citations (UUIDs); resolution only against the task's scope map |
| 69 | Client privileges are SELECT only; per-command RLS policies on `cases`; no DELETE privilege or policy anywhere |
| 70 | Evidence bytes only through a backend-issued, audited, short-lived signed URL; restrictive Storage policy denies all client access; audit failure fails closed |
| 71 | One frontend adapter `frontend/app/api/[[...slug]]/route.ts` into `backend/api/router.ts`; A owns the adapter, B owns the router and handlers; no Fastify |
| 72 | Display IDs are database-generated: `case_display_seq` for cases, per-case counters for `EV-` and `FND-` |
| 73 | The AI report schema allows only `heading` and `assertion`; `user_note` is human-only, enforced by Zod; assertions carry `origin` and `editedAfterDraft` |
| 74 | P0 citation navigation highlights the whole segment (`data-segment-id`); exact-range highlighting and paragraph-level PDF locators are P1 |
| 75 | `findings.source_unavailable` marks findings whose source was deleted or quarantined; they are `UNVERIFIED` and report-ineligible |
| 76 | Record terminology (§1.7): originals immutable, derived intelligence mutable and versioned, audit append-only and tamper-evident, SHA-256 an integrity mechanism |
| 77 | A model may claim only `DIRECT`, `INFERRED` or `CONFLICTING`; `OBSERVED` is assigned by DataTrace code |
| 78 | Payload references between findings use batch-local refs or display IDs, never UUIDs; persisted payloads contain only `FND-###` references |
| 79 | Candidates are validated individually (an invalid candidate is rejected and listed); an invalid envelope fails the task |
| 80 | Build-day scope is split into P0-Core and P0-Hardening; Hardening is cut first at Hour 14 (§17.3) |
| 81 | Principle 11, claim only what is built: rule counts and security claims state what is built, not what is specified (§23) |
| 82 | Pre-event policy resolved against the official Rules: disclosed pre-existing work is allowed and judging is on onsite work; the team still builds all product code on site (§2.5) |
| 83 | Sleep rota and a 90-minute time-box rule added to the schedule (§17.5A) |
| 84 | Judge-facing demo rules: disclose live versus replayed, one live moment, one awkward case (§21) |
| 85 | Event facts in §2 re-checked against the official pages on 19 Oct 2026 |
| 86 | Gmail import is promoted from P2 to **P1-0**: first in the P1 order, below all of P0-Core; a one-shot import of user-picked threads, not sync; continuous sync stays P2 (§5.5, §17.3) |
| 87 | Gmail runs as a Google app in **Testing** status, read-only scope `gmail.readonly`, two throwaway test accounts; verification is not pursued (restricted scope, weeks-long); the 7-day refresh-token expiry is acceptable for one weekend (§5.5) |
| 88 | Gmail messages are fetched as raw RFC-822 and enter the existing `.eml` pipeline unchanged; `evidence_items` gains immutable `ingest_source` and `external_ref` (unique per case); new table `gmail_connections` with no client access (§9.1, §10.6) |
| 89 | OAuth redirects to a frontend page that forwards `code` and `state` to an authenticated API route, so `/health` stays the only unauthenticated route; `state` is HMAC-signed, user-bound and expires in 10 minutes (§5.5, §15.9) |
| 90 | Refresh tokens are encrypted at rest (AES-256-GCM) and never returned, logged or audited; Gmail is reached through a `GmailClient` interface with a fixture-backed `mock` (`GMAIL_MODE`), so CI and `DEMO_MODE` never call Google (§5.5, §15.9) |
| 91 | The build team is two people holding the four roles: Person 1 = C + D (Database, AI, Security), Person 2 = A + B (Frontend, Backend); role tags stay valid (§3.1) |
| 92 | Handoffs between the two people: contracts frozen Hour 0–1, schema ready Hour 3, and four exported functions: `runExtraction`, `runVerification`, `draftReport`, `assertCaseOwner` (§3.4) |
| 93 | Order after Hour 14: Person 2 builds P1-0 while Person 1 sleeps (Hours 14–17); Person 1 completes hardening while Person 2 sleeps (17–20); code freeze at Hour 20, or 21 by team choice (§17.3, §17.5, §17.5A) |
| 94 | While one person sleeps, the other may merge their own green PR and marks it for review; `contracts/` and migrations do not change in that window (§3.5) |

---

# Appendix B — Open Questions

| # | Question | Owner | Needed by | Answer |
|---|---|---|---|---|
| 1 | May pre-built code and components be brought to the finale? (ask on Hackyard Slack) | D | before 10 Oct | **Answered (Rules page, 19 Oct 2026):** pre-existing libraries, tools, designs, datasets and foundations are allowed when disclosed; judging focuses on onsite work; undisclosed pre-built work can lead to disqualification. Team decision: all product code on site (§2.5). |
| 2 | Which LLM providers do the $100 credits cover, and is a vision model included? | D | before the finale | **Open.** Guide: $100 per selected project, shared by the team. Provider coverage not stated; ask at kickoff. |
| 3 | Selection-result date; does the 24 hours include the presentation slot; length of the jury slot? | D | when published | **Partly answered.** Results are announced in waves on the results page. Slot length and whether the 24 hours include the presentation are still unpublished. |
| 4 | Food and accommodation fee; travel plan for every member attending | all | after selection | **Answered for the package:** all-inclusive (seat, 2 nights, meals, build space, internet). Travel to and from IIT Guwahati is not covered; each member still needs a travel plan. |
| 5 | Repository license (MIT suggested) and whether the repo is public before the event | C | before submission | README states MIT. Public-before-event is a team decision; a public repo must make the §2.5 disclosure visible. |
| 6 | DPDP Act 2023: current commencement status of the Act and its rules; which provisions to cite | D | before adding the pack | |
| 7 | GDPR and CCPA deadlines and article titles in `frameworks.ts` checked by a human | D | before Hour 10 | |
| 8 | Venue network quality; assume unreliable and rely on the cached demo | all | before the finale | |
| 9 | Does the local Supabase stack accept the `RESTRICTIVE` policy on `storage.objects` from a migration, and does a service-role `createSignedUrl` still work? (If not: rely on revoked privileges plus the absence of any permissive policy.) | C | Hour 1 | |
| 10 | Review the cue lexicon in `contracts/schemas/predicates.ts` (predicate, negation, hedge cues) against the synthetic scenarios and adjust before Hour 6 | D | Hour 6 | |
| 11 | Run the whole §9 DDL (tables, composite foreign keys, §9.1.1 triggers, RLS, §9.3 audit chain) on the local Supabase stack from empty, and confirm its PostgreSQL major version is 15 or later (`ON DELETE SET NULL (segment_id)` needs it). v1.3 SQL has been written but not executed. | C | Hour 1 | |
| 12 | Add the §9.1.1 and §9.3 pgTAP tests (T20–T23, items 8–11) and confirm the service-role path is covered, not only the `authenticated` role | C | before Hour 10 | |
| 13 | Which sponsor challenges (Agent37, ByteAsk, Nodus, Render), if any, are worth entering? Only if one costs almost no build time. | all | at kickoff | |
| 14 | **Speaker gap (found while writing the synthetic pack).** `speaker` on a claim is "context only; never used for verification" (§10.3). A user's email that restates what the company said can pass `claim_verification.v1` (the subject anchors through the To/From header) and could then form a false contradiction with the company's later message. **Proposed fix, to decide before Hour 1 under §19.3:** `claim_verification.v1` and `contradiction_support.v1` require that the cited item was sent by the organization (header `From`, or the author of a manual-log entry), and user-authored claims are labelled `USER_STATEMENT` and excluded from contradiction pairs. `04_followup` in `tests/synthetic/acme-deletion/` restates the company's claim on purpose as the regression case. | D | Hour 1 | **Open: decision needed.** |
| 15 | Gmail setup done before the event (§17.2A): Google Cloud project, Gmail API enabled, OAuth consent screen External/Testing, two throwaway test users, Web client with redirect `http://localhost:3000/gmail/callback`, ID and secret in a local `.env`, synthetic Acme emails in the throwaway inboxes | Person 1 (C) | before the event | |
| 16 | Does the venue network reach `accounts.google.com`, `oauth2.googleapis.com` and `gmail.googleapis.com`? Test at kickoff. If not, Gmail is dropped from the demo and `.eml` upload is used | Person 2 (B) | Hour 1 | |
| 17 | Hour-14 decision: keep code freeze at Hour 20, or move it to Hour 21 to keep the hardening items that P1-0 pushes down (§17.3). Record the choice in `docs/integration.md` | Person 1 (D) | Hour 14 | |

---

# Appendix C — Changelog

## v1.4.2 (this version): changes from v1.4

v1.4.2 promotes one feature and re-assigns the work. Architecture, invariants, rule semantics, P0 scope and the P0-Core / P0-Hardening split are **unchanged**. A reviewer comparing with v1.4 should find differences only in the items below.

**Gmail import (P1-0)**
- Gmail moves from P2 ("Gmail OAuth sync") to P1-0, first in the P1 order, and is renamed **import**: one-shot, user-initiated, read-only. Continuous sync stays P2 (§5.5, §17.3, §23).
- New §5.5 (flow, rules, Google Testing-mode constraints), §15.9 (security rules) and §10.6 (contracts); migration 005 and table 15 `gmail_connections`; `ingest_source` and `external_ref` on `evidence_items`, with a unique index and the immutability guard extended (§9.1, §9.1.1); pgTAP items 12–13 (§9.2); audit action `EVIDENCE_IMPORTED` (§9.3).
- API: six routes and three error codes (§16). Environment: `GMAIL_MODE`, `GMAIL_STATE_SECRET`, `GMAIL_TOKEN_ENC_KEY`, `GMAIL_MAX_MESSAGES_PER_IMPORT`; the redirect URI is now `/gmail/callback` (§7.4).
- Tests T24–T29 (§18.2); gate and acceptance lines (§20.2, §22); threat-model and limits rows (§15.7, §15.8); demo step, fallback and judge rule 7 (§21); integration checkpoint (§17.6); pre-event Google Cloud setup with no code (§2.5, §17.2, §17.2A).

**Two-person team and work division**
- §3 restructured: two people hold roles A–D (Person 1 = C + D, Person 2 = A + B), work division by area, handoffs, capacity and review rules (§3.1–§3.5). `assertCaseOwner()` is named as the shared ownership check (§3.4, §7.5).
- Schedule rows for Hours 14–20, sleep rota, time-box rule, branch and review rules updated (§17.5, §17.5A, §19.1).

**Appendices.** Decisions 86–94 added (A); open questions 15–17 added and #4 reworded (B).

**Deliberately not changed:** the user journey, evidence model, Gateway, minimization, verification rules and their semantics, the P0 list and the P0-Core / P0-Hardening split, the cut line at Hour 14, the SELECT-only client model, the audit chain, the test philosophy, and the exclusion of graph or vector databases, embeddings, Redis, Kafka, WebSockets, external queues, Fastify and microservices.

**Companion files with v1.4.2:** `README.md` (rewritten). `docs/BUILD_CARD.md`, `docs/DEMO_KIT.md`, `docs/QA_SHEET.md` and `docs/idea-submission.md` were not re-issued; update their role tags and add the optional Gmail step if they are used.

---

## v1.4 (previous version): changes from v1.3

v1.4 is a scope-and-facts revision prepared five days before the in-person finale. Architecture, schema, contracts, rule semantics and ownership are **unchanged**. A reviewer comparing with v1.3 should find differences only in the items below.

**Event facts and policy (§2)**
- §2.1 re-checked against the official Apply, Guide and Rules pages (19 Oct 2026): Round 1 closed; results in waves; all-inclusive participant package; travel not covered; prizes published; official build window row added.
- §2.5 rewritten: the Rules answer the pre-built-code question (disclosed pre-existing work allowed, judging on onsite work). The team keeps the strict reading, adds a disclosure statement and a doubt rule.
- §2.2, §2.3, §2.4, §2.6 updated or annotated to match.

**Scope and schedule (§17, §20, §21, §22, §23)**
- P0 is split into **P0-Core** (must run by Hour 14) and **P0-Hardening** (cut first); items 1–10 of P0-Core are listed with owners and targets (§17.3). Hardening: hash-chained audit and verification, double-event audited downloads, automated pgTAP, §9.1.1 invariants beyond basics, quarantine demotion, user-confirmed contradictions.
- Cut line and schedule-pressure rule rewritten to match (§17.3).
- Pre-event preparation added (§17.2A); sleep rota, time-box and presentation-slot rules added (§17.5A).
- Gates and acceptance checklist tag hardening lines **(H)** (§20.2, §22); gate rule added.
- Demo: judge-facing rules added (§21).
- Principle 11, *claim only what is built*, added (§23); principle 8 annotated.

**Wording consistency**
- "Eleven rules" now reads "eleven specified, six P0" in §12.3, §20.3, §22 and the Freeze Checklist.

**Appendices**
- Decisions 80–85 added (A); answers recorded for open questions 1–5 (B); new questions 13 (sponsor challenges) and 14 (speaker gap in claim verification, with a proposed fix) added (B).

**Companion files shipped with v1.4:** `README.md` (updated), `docs/BUILD_CARD.md`, `docs/DEMO_KIT.md`, `docs/QA_SHEET.md`, `docs/idea-submission.md`, `tests/synthetic/acme-deletion/`.

---

## v1.3 (previous version): changes from v1.2

v1.3 applies an external review of v1.2 and the follow-up checks it triggered. The architecture, invariants, ownership model, P0/P1/P2 philosophy, Hour-6 slice and Hour-14 cut line are unchanged.

**Database integrity**
- Case boundary: `citations` gains `case_id`; composite foreign keys tie finding, evidence item and segment to one case, and segment, artifact and evidence item to each other. `relationships` and `request_response_links` get the same treatment (§9.1). The Gateway still checks in code (§11.8); the schema now enforces it too.
- Original evidence: `trg_evidence_immutable` rejects changes to hash, path, filename, MIME type, size, ids and upload time (§9.1.1).
- `VERIFIED` / `CONTRADICTED`: `trg_findings_state_guard` requires a same-transaction `PASS` result from an allowed rule; one engine function performs every transition (§9.1.1, §12.4).
- **Audit chain race fixed (§9.3).** In v1.2 the global `seq` was allocated before the trigger took the per-case lock, so concurrent writes could leave chain order different from `seq` order and `verify_audit_chain` could report a false break. The chain now uses a per-case `case_seq` assigned under the lock, included in the hash; verification also detects gaps. `audit_compute_hash` gains a parameter, so migrations must be written against v1.3.

**Audit terminology and claims**
- `EVIDENCE_VIEWED` (`ORIGINAL`) is replaced by `EVIDENCE_DOWNLOAD_AUTHORIZED` and `EVIDENCE_DOWNLOAD_URL_ISSUED` (§5.2, §16). `EVIDENCE_VIEWED` now means only a REST read of extracted content.
- Audit coverage claims narrowed to what is true, with a fixed wording (§9.3, §16 demo script, principle 8).

**Legal framing**
- Exact disclaimer wording and a legal-claims rule (§1.4); only human-reviewed `frameworks.ts` entries are used (§14.1, §15.6).
- `SATISFIED` renamed `ANSWERED` and defined as an evidence-based status; "compliance matrix" renamed "request-response matrix"; scenario `NORMAL_COMPLIANT` renamed `NORMAL_RESPONSIVE`; `MISSING_INFORMATION` reworded (§13). Decision #32 in Appendix A uses the new status name.

**Delivery and demo**
- P0 delivery groups P0-A, P0-B, P0-C with milestones M1–M3 and a schedule-pressure rule (§17.3). Hours and contents of P0 are unchanged.
- The `mock` provider is stated as the guaranteed demo path (§2.6).

**Tests**
- Added T20–T23 and pgTAP items 8–11; updated T11 and T12 (§9.2, §18.2).

---

## v1.2 (previous version): changes from v1.1

v1.2 applies nine accepted corrections plus the consistency fixes they require. The core architecture, invariants, ownership model, P0/P1/P2 philosophy, Hour-6 slice and Hour-14 cut line are unchanged.

**Verification**
- Added `claim_verification.v1` (rule 1B): the deterministic path for a `DIRECT` claim to go `AI_INFERRED` → `VERIFIED`, with documented cue-based support semantics (§12.3). Without it, `contradiction_support.v1` could never fire, because it requires `VERIFIED` claims. Rule count is now **eleven**; rule numbering follows the final catalogue order (`contradiction_support.v1` is #8 and `corroboration.v1` #9, swapped relative to v1.1's labels). Updated: transition diagram, rule catalogue, P0/P1 tiers (P0 rules are now six), engine order, tests, acceptance checklist, decision register.
- The re-evaluation cascade and source-unavailable handling are specified (§12.4).

**Contracts**
- `structuredPayload` is typed per finding type; `CLAIM` requires `normalizedClaim` (`subject`, `predicate`, `object`, `polarity`) in Zod and in a database `CHECK`. `predicate` is now an enum. Other types get small strict payload schemas only where an engine reads them (§10.3).
- Candidate citations (AI-facing: `evidenceDisplayId`, `segmentOrdinal`, `locatorType`, `locator`, `quotedText`) are separate from persisted citations (UUID foreign keys). The Gateway resolves one to the other against the task's scope map (§10.2, §11.8). The provider request no longer carries database IDs. Finding references inside payloads use batch-local refs or display IDs.
- A model may claim only `DIRECT`, `INFERRED` or `CONFLICTING`; `OBSERVED` is assigned by code.
- Candidates are validated one by one; an invalid envelope still fails the whole task (§11.1).
- Added the `PAGE` locator type for P0 page-level PDF segments; `(artifact_id, ordinal)` is unique.

**Security**
- RLS: `cases` no longer uses `FOR ALL`; explicit SELECT, INSERT and UPDATE policies, no DELETE policy; client grants reduced to SELECT; `SECURITY DEFINER` helpers have fixed `search_path` and restricted `EXECUTE` (§9.2).
- Storage: the client SELECT policy is removed; a restrictive policy denies all client access to the `evidence` bucket; downloads go only through the backend (authorize → audit `EVIDENCE_VIEWED` → signed URL), failing closed. Path handling is hardened (`ck_storage_path`, `try_uuid`, strict backend parser). Added a security consistency table (§15.8).

**Ownership and API**
- One frontend adapter `frontend/app/api/[[...slug]]/route.ts` (A) dispatches to `backend/api/router.ts` (B); no per-route frontend files; no new framework (§7.5). Updated architecture, repository tree, team table, API section, checkpoints, workflow rules, acceptance checklist.

**Data model**
- `cases.display_id` is generated by `case_display_seq`. As a necessary extension, `EV-` and `FND-` display IDs are generated by a trigger using per-case counters, because the same caller-race exists for them.
- Added indexes `relationships(case_id)` and `verification_results(finding_id)`; reviewed the remaining query paths and added only the ones used by RLS helpers, parent-to-child reads, worker polling and source-deletion fan-out. Indexes are described as query-performance support, with no latency claim.
- Added `findings.source_unavailable` (generalizing the suggested `source_deleted` so it also covers quarantine) with a CHECK that such findings are `UNVERIFIED`.

**Reports and UI**
- The AI report schema allows only `heading` and `assertion` (`user_note` is human-only, enforced by Zod); persisted assertions carry `origin` and `editedAfterDraft`; the AI cites findings by display ID (§10.5, §14.2).
- P0 citation navigation highlights the whole segment via `data-segment-id`; exact-range highlighting and paragraph-level PDF locators moved to P1; P0 PDF extraction is page-level. Demo script and acceptance criteria updated.

**Terminology and tests**
- "Immutable case record" replaced by precise terms (§1.7, §1.1, glossary).
- Added regression cases T01–T19 (§18.2) and a false-`VERIFIED` metric; scenarios 1, 2, 3, 6 and 7 updated.
- Clean-ups: upload hashing no longer says "stream"; `GET /api/evidence/:id` is audited; the demo no longer hard-codes a case display ID; Appendix B adds items 9 and 10.

**Deliberately not changed:** user journey, evidence model, privacy gateway and minimization modes, provider abstraction, mock provider, analysis runs/tasks, retry policy, prompt registry, report lenses, audit chain, team ownership model, schedule shape, testing philosophy, and the exclusion of graph/vector databases, embeddings, Redis, Kafka, WebSockets, external queues, Fastify and microservices.

---

## v1.1 (previous version)

**v1.1** merges `DATATRACE_MASTER_SPEC_FINAL.md` (base) with the useful parts of `DATATRACE_MASTER_SPEC_GITHUB_FINAL.md`.

Added: hackathon context, judging alignment, Round 1 plan and registration checklist (§2); pre-event build policy and credits budget; API surface (§16); minimization modes, retry policy and provider routing; the 8-signal friction taxonomy with preconditions; scope tiers and cut line (§17.3); threat model, retention and deletion policy, jurisdictions (§15); `.env.example` contents and stack decisions (§7); `ai_consents` table; two security test scenarios; open-questions list.

Changed: verification engine moved out of `ai/` into `verification/`; `entity_reference` and `relationship_taxonomy` no longer promote a candidate straight to `VERIFIED`; `VERIFIED` given a precise meaning; `CONTRADICTED` now belongs to the contradiction finding; audit ledger made hash-chained (it was only called cryptographic); report grounding moved from sentence parsing to block structure; RLS completed for all 14 tables; broken "Section 12 endpoints" references fixed; undefined terminology removed; rules grew from 8 to 10; hours 00–02 no longer assume a fixed problem statement; request-response statuses unified; the "signed and locked" line removed.

Removed: draft-reconciliation sections and per-decision TODO tags (decision numbers are kept in Appendix A).


---

# Implementation Freeze Checklist

Tick every box before declaring v1.4.2 frozen (target: end of Hour 1 for contracts and seams, Hour 14 for the P0 cut line, Hour 20 for code freeze). Owners in brackets.

**v1.4:** boxes under *RLS*, *Storage* (the double-event download audit), *Indexes*, *Source deletion / quarantine* and the pgTAP part of *Tests* are P0-Hardening (§17.3). Tick them if built; otherwise mark them *deferred* and do not claim them.

**v1.4.2:** boxes tagged **(P1-0)** apply only if Gmail import is built. Its *schema and contracts* are ticked at Hours 1–3; its *behavior* is ticked at Hour 17.

**Contracts** [D, review A/B/C]
- [ ] `contracts/` contains the enums, `LocatorSchema` (with `PAGE`), `CandidateCitationSchema`, `PersistedCitationSchema`, `NormalizedClaimSchema`, all per-type payload schemas, `CandidateFindingSchema`, `FindingSchema`, `AnalysisEnvelopeSchema`, `AIReportDraftSchema`, `ReportBlockSchema`, `CaseReportContentSchema`.
- [ ] `normalize.ts` (`normalizeText`, `normalizeToken`, `claimKey`) and `predicates.ts` (cue lexicon) exist with unit tests.
- [ ] Types are generated from Zod; no hand-written duplicate types.

**Claim verification** [D]
- [ ] `claim_verification.v1` implemented with the five support checks and reason codes (§12.3); the six P0 rules registered in `verification/engine.ts` (the five P1 rules too, if built).
- [ ] A `DIRECT` claim reaches `VERIFIED`; `INFERRED` claims and hedged/future statements do not (T01, T02).

**Citation normalization** [D]
- [ ] `resolver.ts` resolves `evidenceDisplayId + segmentOrdinal` only against the task's scope map; checks case, segment-to-evidence, locator equality; stores the stored locator (T04–T06).
- [ ] The provider request contains no database IDs; prompts never ask for UUIDs; fixtures are in AI-facing form.
- [ ] Per-candidate validation and the `rejected` list work; an invalid envelope fails the task (T17).

**RLS** [C]
- [ ] Grants: clients have `SELECT` only; no DELETE privilege on any table; `cases` has separate SELECT, INSERT, UPDATE policies and no `FOR ALL` (T09).
- [ ] Helper functions are `SECURITY DEFINER` with fixed `search_path` and restricted `EXECUTE`; pgTAP isolation tests pass (T10).
- [ ] Database invariants (§9.1.1): composite case foreign keys, immutable original-evidence fields, `VERIFIED`/`CONTRADICTED` guard, per-case audit sequence (T20–T23).

**Storage** [C, B]
- [ ] Private bucket; restrictive deny policy for client roles (Appendix B #9 resolved); `ck_storage_path`, `try_uuid`, `parseEvidencePath` in place (T13).
- [ ] Download flow: authorize → audit `EVIDENCE_DOWNLOAD_AUTHORIZED` → backend signed URL with TTL → audit `EVIDENCE_DOWNLOAD_URL_ISSUED` (both audit writes fail closed); no direct client Storage access (T11, T12).

**API router** [A, B]
- [ ] `frontend/app/api/[[...slug]]/route.ts` is the only file under `frontend/app/api/`, frozen after Hour 1; `transpilePackages` set; `/api/health` smoke test passes.
- [ ] `backend/api/router.ts` has no `next/*` imports; every endpoint in §16 is a route entry with Zod input/output and the standard error envelope; no case DELETE route.

**Display IDs** [C]
- [ ] `case_display_seq`, per-case counters and triggers generate `CASE-`, `EV-`, `FND-` IDs; API creation contract takes no `displayId`; seed and tests rely on generated values.

**Indexes** [C]
- [ ] All indexes in §9.1 (including `relationships(case_id)` and `verification_results(finding_id)`) are created by migrations and asserted in pgTAP (T18); no latency claims in docs.

**Report grounding** [D, A]
- [ ] The AI report schema permits only `heading` and `assertion` (T07); human `user_note` accepted and stamped (T08); `origin` and `editedAfterDraft` set by the server.
- [ ] `report_grounding.v1` rejects ineligible, quarantined and `source_unavailable` findings; export re-validates.

**Source deletion / quarantine** [D, C]
- [ ] `findings.source_unavailable` and `ck_source_unavailable` exist; the engine function demotes findings, resets affected reports, and writes audit events (T14); the cascade re-evaluates contradictions (T15).

**Team and handoffs** [Person 1, Person 2]
- [ ] Roles are agreed (§3.1: Person 1 = C + D, Person 2 = A + B) and the work division (§3.3) is read by both.
- [ ] The four exports (`runExtraction`, `runVerification`, `draftReport`, `assertCaseOwner`) have agreed signatures at the Hour-1 freeze (§3.4); every handler that takes a case calls `assertCaseOwner()` first.

**Gmail import (P1-0)** [Person 2 (A, B); Person 1 (C, D) reviews]
- [ ] (P1-0, Hours 1–3) Schema and contracts: `ingest_source`, `external_ref`, `ck_external_ref`, `uk_evidence_external_ref`, `gmail_connections` with no grant and no policy, the §10.6 schemas; pgTAP items 12–13.
- [ ] (P1-0) The Google app is in Testing status with two test users, the read-only scope and redirect `http://localhost:3000/gmail/callback`; secrets only in the local `.env`.
- [ ] (P1-0) `GmailClient` has a live and a `mock` implementation; CI and `DEMO_MODE` use `GMAIL_MODE=mock` with recorded raw-message fixtures built from the Acme emails.
- [ ] (P1-0) Signed `state`, AES-256-GCM token vault, no token in logs, responses or audit metadata; Person 1 has signed off §15.9 (T24, T25).
- [ ] (P1-0) Import creates ordinary evidence items, is idempotent, bounded and owner-checked, and writes `EVIDENCE_IMPORTED` (T26–T29).
- [ ] (P1-0) UI and docs say *import*, never *sync*; the connect screen says "test accounts only".

**P0 scope** [all]
- [ ] §17.3 P0 list is agreed; P1 and P2 items are not started before the Hour-14 cut line is met (the only exception is the P1-0 schema and contracts, built at Hours 1–3).
- [ ] P0 PDF segmentation is page-level; the viewer highlights the whole segment via `data-segment-id` (T19).

**Tests** [D, all]
- [ ] Scenarios 1–10, S1, S2 and T01–T19 exist as automated tests; CI runs `supabase db reset`, pgTAP, unit and synthetic suites.
- [ ] Synthetic data only; no real personal data anywhere in the repository.

**Mock provider** [D]
- [ ] `mock.ts` replays recorded candidate-form fixtures; CI, UI work and `DEMO_MODE` never spend credits; token use per real run is logged.

**Integration checkpoints** [all]
- [ ] A↔B, B↔C, B↔D, D↔C and end-to-end checkpoints in §17.6 pass; the demo case runs twice in a row; `docs/integration.md` is current.

---

*DataTrace Master Specification v1.4.2: implementation baseline. Supersedes v1.4, v1.3, v1.2 and v1.1.*
