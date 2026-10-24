# DataTrace

**AI proposes. Evidence supports. Deterministic logic verifies. DataTrace explains. The user decides what action to take.**

DataTrace turns fragmented privacy-related evidence (emails, documents, screenshots, requests, responses) into a preserved case record, structured intelligence, deterministically verified findings and an evidence-grounded action report.

> **Status: partial implementation (24 Oct 2026).** [`docs/MASTER_SPEC.md`](docs/MASTER_SPEC.md) (**v1.4.2**) remains the target design. This checkout contains working contracts, AI gateway and providers, ingestion, backend API and worker code, and six P0 verification rule modules. The frontend UI, Gmail import, and automated database/pgTAP suite are not implemented. The checks currently passing are `npm test` (31 files, 362 tests) and `npm run typecheck`; this is not yet a complete end-to-end release.

> *DataTrace identifies evidence-related gaps and prepares a reviewable draft; it does not determine legal compliance or provide legal advice.*

## Disclosure (pre-existing work)

The specification, documentation, synthetic test data and design sketches predate implementation. Update this disclosure to accurately distinguish pre-existing work from work completed during the event before presenting or publishing the project; the build policy is in spec §2.5. Current runtime dependencies are listed [below](#third-party-libraries-and-services).

## The problem

People who exercise data rights (GDPR/CCPA access, deletion, correction, opt-out) end up with evidence scattered across email threads, portals, screenshots and PDFs. Organizations answer vaguely, late or inconsistently, and the person cannot easily show what was asked, what was answered, what was ignored, or where two answers conflict. Existing options are generic letter templates with no tracking, or unconstrained LLMs that treat claims as facts and produce accusations they cannot support.

DataTrace connects the full trail and never confuses an AI inference with a verified finding.

## Target workflow

```text
Evidence in (upload · manual log · Gmail import)
  → original preserved unmodified (SHA-256, private storage)
  → text extracted, split into locatable segments
  → user enables AI for the case (explicit consent)
  → Privacy Gateway minimizes the input; the model returns typed candidate findings
  → deterministic rules check citations, provenance and claims; only code changes a verification state
  → timeline · graph · request-response matrix · finding queues
  → grounded case report (Evidence / Findings / Complaint lens), exported as Markdown or JSON
  → the user reviews, edits and decides
```

Two ideas carry the design:

- **Basis and state are separate.** *How* a finding was derived (`DIRECT`, `OBSERVED`, `INFERRED`, `CONFLICTING`) is shown apart from *how far it has been verified* (`UNVERIFIED`, `AI_INFERRED`, `CORROBORATED`, `VERIFIED`, `CONTRADICTED`).
- **The model never verifies.** It cites by display ID and segment number (for example `EV-101` #3), never by database ID. Deterministic rules in `verification/` decide what reaches `VERIFIED`. A hash proves a file is unchanged, not that it is true.

## Implemented today

| Area | Current implementation |
|---|---|
| Contracts | TypeScript/Zod schemas for findings, citations, payloads, locators and reports, with unit tests. |
| AI | Consent and minimization gateway, candidate citation resolver, mock provider, Grok and Groq provider adapters, and prompt registry. Live provider credentials are not part of the test run. |
| Ingestion and backend | SHA-256, `.eml` and PDF parsing, segmentation, API router/adapter, evidence and report routes, and an analysis worker. |
| Verification | Six P0 rule modules and a deterministic verification engine. |
| Database | Six SQL migrations are present. No pgTAP tests are currently checked in, so database security and migration acceptance gates remain unverified. |
| Frontend and Gmail | UI pages/components and Gmail import are not implemented; only the API adapter and placeholder directories exist. |

The backend and unit/synthetic tests are implemented, but the user-facing workflow is not yet complete. Do not present the full target workflow below as a shipped product.

## Evidence sources

| Source | Tier | Notes |
|---|---|---|
| `.eml`, `.txt`, text-based PDF | P0 | Parsers and segmentation are implemented and covered by tests. |
| Manual log | P0 | Specified; no completed UI workflow. |
| Gmail import | P1-0 | Not implemented. Do not connect an inbox or claim this feature. |
| `.docx`, screenshots | P1 | Not implemented. |
| Continuous Gmail sync, HTTP probes, DPDP pack | P2 | Not implemented/planned beyond the master spec. |

## Scope tiers

| Tier | Contents | Status |
|---|---|---|
| **P0-Core** | Contracts, gateway, providers, ingestion, backend API/worker and six P0 rule modules are present. The frontend, complete end-to-end workflow, and acceptance gates are incomplete. | Partially implemented |
| **P0-Hardening** | SQL migrations include audit/invariant work, but there is no pgTAP suite and the database gates have not been validated in this checkout. | Partially implemented; unverified |
| **P1-0** | Gmail import (§5.5 of the spec) | Not implemented |
| **P1-A** | Timeline, graph, friction signals, remaining P1 rules, exact-range highlighting, DOCX, screenshots and PDF export | Not implemented |
| **P2** | Continuous Gmail sync, HTTP probes, DPO routing, DKIM verification, monitoring, personal-data map, DPDP pack and public deployment | Not implemented |

Six P0 verification rule modules are present. The five P1 rules in the master spec are not implemented. See the implementation and test status above; passing unit tests do not establish the full release gates.

## Team and work division

Team Civora builds with **two people** holding the four ownership roles of the spec (A frontend, B backend, C database and security, D AI and intelligence). Full detail in spec §3.

| Person | Roles | Area |
|---|---|---|
| **Person 1** (lead) | C + D | **Database** (schema, RLS, audit chain, pgTAP), **AI** (contracts, Gateway, prompts, verification rules, report drafter), **Security** (consent, minimization, isolation, Gmail token rules) |
| **Person 2** | A + B | **Frontend** (app shell, evidence viewer, matrix, report editor, Gmail connect UI), **Backend** (adapter, router, ingestion, parsers, worker, export, Gmail import) |

Handoff: Person 1 freezes the Zod contracts in Hour 0–1 and has the schema ready by Hour 3, and hands over `runExtraction`, `runVerification`, `draftReport` and `assertCaseOwner`. Person 2 builds against `mock` fixtures until they exist.

## Target architecture (specified)

```text
 Browser: Next.js UI (dashboard, evidence viewer, timeline, graph, matrix, report editor, audit view)
    │  Supabase access token
    ▼
 frontend/app/api/[[...slug]]/route.ts      ← one thin adapter, written once, then frozen
    ▼
 backend/api/router.ts                      ← route table · auth · Zod in/out · handlers · orchestration
    │                    │                           │
    ▼                    ▼                           ▼
 Postgres + RLS      AI Privacy Gateway        Verification engine
 private Storage     consent · minimization    pure TypeScript rules,
 hash-chained audit  provider adapter          no network, no AI imports
                     citation resolution
```

The current package is a strict TypeScript backend/test project using Supabase JS, Zod, `mailparser`, `pdf-parse`, Vitest and `tsx`. The Next.js UI, Tailwind, shadcn/ui, React Flow and pgTAP remain part of the target design, not installed or implemented in this checkout. AI providers are behind an `AIProvider` interface; the mock provider is available for tests.

## Repository layout (specified)

```text
frontend/        API adapter; UI pages/components are not implemented  (Person 2)
backend/         router, handlers, ingestion and worker                (Person 2)
ai/              Gateway, providers, prompts                            (Person 1)
verification/    deterministic rules, no network, no AI imports         (Person 1)
database/        security helpers incl. assertCaseOwner                 (Person 1)
supabase/        migrations 001–006; pgTAP tests not yet present        (Person 1)
contracts/       shared Zod schemas and types (change protocol, §19.3)
tests/           synthetic golden scenarios, fixtures, integration
docs/            MASTER_SPEC.md, api.md, security.md, integration.md
```

## Checks

Install dependencies and run the checks from the repository root:

```bash
npm ci
npm test
npm run typecheck
```

Latest local result: **31 test files and 362 tests passed; typecheck passed**. The test suite uses synthetic/mock data. No pgTAP, browser/component, live-provider, or full database-backed end-to-end run has been verified. `npm run worker` is available but requires the backend environment and database configuration; there is no `npm run dev` UI script in this checkout.

The full spec's database-backed quickstart, demo mode and Gmail setup are not currently runnable from this checkout because their required UI/database/Gmail implementation is incomplete.

## Testing

Tests and fixtures use synthetic data. Vitest currently runs unit, gateway, backend and synthetic scenario tests (31 files, 362 tests). There are no component tests or pgTAP tests checked in; T24–T29 are not run because Gmail import is not implemented. The spec's twice-without-reset end-to-end demo gate has not been verified.

## Privacy and security status

- The Gateway and resolver are implemented to minimize model input and resolve display-ID citations within task scope. These protections have unit tests; they do not replace database isolation tests.
- SQL migrations are present, but client grants, RLS, storage bypass, audit-chain integrity and database invariants have not been verified with an automated pgTAP suite in this checkout.
- Gmail token handling is not implemented because Gmail import is not implemented.
- SHA-256 indicates whether bytes changed since ingestion; it does not establish that evidence is authentic or true. Provider-side retention is outside DataTrace's control. See spec §15 for the target threat model and limitations.

## Third-party libraries and services

Current package dependencies are listed in `package.json`: Supabase JS, Zod, `zod-to-json-schema`, `mailparser`, `pdf-parse`, Vitest, TypeScript and `tsx`. Grok and Groq adapters are present, but live provider use is not part of automated validation. Next.js, React, Gmail APIs and pgTAP are specified targets, not current package dependencies.

## Documentation

| File | Purpose |
|---|---|
| [`docs/MASTER_SPEC.md`](docs/MASTER_SPEC.md) | The single source of truth: architecture, schema, contracts, rules, delivery plan, tests (v1.4.2) |
| [`docs/integration.md`](docs/integration.md) | Implementation readiness board; some status entries need refresh against the current test run and modules. |

Any change to architecture, schema, contract or scope is recorded in the spec in the same pull request (spec §19.3).

## License

MIT (see `LICENSE`).
