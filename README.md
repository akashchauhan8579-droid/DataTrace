# DataTrace

**AI proposes. Evidence supports. Deterministic logic verifies. DataTrace explains. The user decides what action to take.**

DataTrace turns fragmented privacy-related evidence (emails, documents, screenshots, requests, responses) into a preserved case record, structured intelligence, deterministically verified findings and an evidence-grounded action report.

> **Status: specification stage.** The full design lives in [`docs/MASTER_SPEC.md`](docs/MASTER_SPEC.md) (**v1.4.2**, the implementation baseline). No application code exists yet: all product code is written on site at the Hackyard BUILD 2026 finale (IIT Guwahati, 24–25 Oct 2026). Everything below describes what is **specified**, not what is built. This README is updated as features are built and tested, and only then do they lose the word *specified* (spec principle 11, "claim only what is built").

> *DataTrace identifies evidence-related gaps and prepares a reviewable draft; it does not determine legal compliance or provide legal advice.*

## Disclosure (pre-existing work)

Before the event we had the specification, documentation, synthetic test data and design sketches. All application code, database schema and tests were written during the build window. Third-party libraries and services are listed [below](#third-party-libraries-and-services). *(This statement is edited to match reality on the day and must stay true; spec §2.5.)*

## The problem

People who exercise data rights (GDPR/CCPA access, deletion, correction, opt-out) end up with evidence scattered across email threads, portals, screenshots and PDFs. Organizations answer vaguely, late or inconsistently, and the person cannot easily show what was asked, what was answered, what was ignored, or where two answers conflict. Existing options are generic letter templates with no tracking, or unconstrained LLMs that treat claims as facts and produce accusations they cannot support.

DataTrace connects the full trail and never confuses an AI inference with a verified finding.

## How it works (specified)

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

## Evidence sources

| Source | Tier | Notes |
|---|---|---|
| `.eml`, `.txt`, manual log, text-based PDF | P0 | Page-level segments for PDF in P0 |
| **Gmail import** | **P1-0** | One-shot import of a thread you pick, read-only. **Import, not sync**: there is no background polling. Runs as a Google app in Testing mode with two throwaway accounts holding synthetic emails; never connect a real inbox. `.eml` upload is the fallback |
| `.docx`, screenshots | P1 | Screenshot text from a model is capped at `AI_INFERRED` |
| Continuous Gmail sync, HTTP probes, DPDP pack | P2 | Not planned for the weekend |

## Scope tiers

| Tier | Contents | Status |
|---|---|---|
| **P0-Core** | Adapter + router, auth and cases, upload with SHA-256 and private storage, consent + Gateway, six P0 rules, findings list, evidence viewer with whole-segment citation navigation, request-response matrix, mechanical contradiction, grounded report with live editor and export, ownership checks, cached demo run | Specified |
| **P0-Hardening** | Hash-chained audit ledger and verification, double-event audited downloads, automated pgTAP suite, quarantine and demotion cascade, user-confirmed contradictions | Specified. Cut first at Hour 14 |
| **P1-0** | Gmail import (§5.5 of the spec) | Specified |
| **P1-A** | Timeline, graph, friction signals, the other P1 rules, exact-range highlighting, DOCX, screenshots, PDF export | Specified |
| **P2** | Continuous Gmail sync, HTTP probes, DPO routing, DKIM verification, monitoring, personal-data map, DPDP pack, public deployment | Specified |

Rules live in the build: **0 today** (six P0 rules and five P1 rules are specified).

## Team and work division

Team Civora builds with **two people** holding the four ownership roles of the spec (A frontend, B backend, C database and security, D AI and intelligence). Full detail in spec §3.

| Person | Roles | Area |
|---|---|---|
| **Person 1** (lead) | C + D | **Database** (schema, RLS, audit chain, pgTAP), **AI** (contracts, Gateway, prompts, verification rules, report drafter), **Security** (consent, minimization, isolation, Gmail token rules) |
| **Person 2** | A + B | **Frontend** (app shell, evidence viewer, matrix, report editor, Gmail connect UI), **Backend** (adapter, router, ingestion, parsers, worker, export, Gmail import) |

Handoff: Person 1 freezes the Zod contracts in Hour 0–1 and has the schema ready by Hour 3, and hands over `runExtraction`, `runVerification`, `draftReport` and `assertCaseOwner`. Person 2 builds against `mock` fixtures until they exist.

## Architecture (specified)

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

Stack: TypeScript (strict), npm workspaces (`@datatrace/*`), Next.js 14+ App Router, Tailwind CSS, shadcn/ui, Supabase (Postgres, Auth, private Storage), Zod, React Flow, Vitest, pgTAP. AI is behind an `AIProvider` interface with a mandatory `mock` provider; Grok (xAI) is the development provider. No graph or vector databases, embeddings, Redis, Kafka, WebSockets, external queues or microservices.

## Repository layout (specified)

```text
frontend/        Next.js UI and the single API adapter                  (Person 2)
backend/         router, handlers, ingestion, worker, Gmail integration (Person 2)
ai/              Gateway, providers, prompts                            (Person 1)
verification/    deterministic rules, no network, no AI imports         (Person 1)
database/        security helpers incl. assertCaseOwner                 (Person 1)
supabase/        config, migrations 001–005, seed, pgTAP tests          (Person 1)
contracts/       shared Zod schemas and types (change protocol, §19.3)
tests/           synthetic golden scenarios, fixtures, integration
docs/            MASTER_SPEC.md, api.md, security.md, integration.md
```

## Quickstart (intended; verified and finalized when the build lands)

```bash
cp .env.example .env        # fill in Supabase and AI keys; leave GMAIL_MODE=mock unless testing Gmail
npm install
supabase start              # local Supabase (needs Docker)
supabase db reset           # applies all migrations and the synthetic seed
npm run dev                 # web app and API on http://localhost:3000
npm run worker              # analysis worker
```

Set `DEMO_MODE=true` to serve the cached, pre-analyzed demo run. The `mock` provider replays recorded output and never spends LLM credits.

### Gmail import setup (P1-0, optional)

Account setup only; no code is needed for it. Spec §17.2A has the full list.

1. In Google Cloud, create a project and enable the **Gmail API**.
2. Configure the OAuth consent screen as **External**, publishing status **Testing**.
3. Add your **two throwaway Gmail accounts** as test users, and put the synthetic Acme emails from `tests/synthetic/acme-deletion/` in them.
4. Create a **Web** OAuth client with redirect URI `http://localhost:3000/gmail/callback`.
5. Put the client ID and secret in your local `.env` (never commit it), plus `GMAIL_STATE_SECRET` and `GMAIL_TOKEN_ENC_KEY` (random 32-byte values), and set `GMAIL_MODE=live`.

Google limits to know: Testing-mode apps admit only listed test users (up to 100), show a warning screen to click through, and **expire refresh tokens after 7 days**. The scope `gmail.readonly` is restricted, so Google verification is not pursued. Gmail import needs internet; `.eml` upload and the cached demo work offline.

## Testing

Synthetic data only: no real personal data anywhere in this repository. Vitest (unit, synthetic runner, component tests) and pgTAP (RLS, grants, storage, display IDs, indexes, audit chain) run in CI. The regression list T01–T29 is in spec §18.2 (T24–T29 cover Gmail import and run against `GMAIL_MODE=mock`, never against Google). The demo case must run twice in a row without a reset.

## Privacy and security (specified, with stated limits)

- Clients can only `SELECT` through RLS; they never write or delete. Evidence bytes reach a user only through a short-lived, backend-issued signed URL.
- Models never see or return internal IDs. Evidence is delimited as data, never as instructions.
- Gmail refresh tokens are encrypted at rest, never returned, logged or audited, and sit in a table that no client role can read.
- Limits, stated plainly: the audit ledger is tamper-**evident**, not tamper-proof; SHA-256 proves "unchanged since ingestion", not authenticity; provider-side retention is outside DataTrace's control and is never claimed to be zero; direct owner reads of derived tables are scoped by RLS but not audited. See spec §15.

## Third-party libraries and services

Next.js, React, Tailwind CSS, shadcn/ui, React Flow, Supabase (Postgres, Auth, Storage, CLI), Zod, `zod-to-json-schema`, `mailparser`, a PDF text-extraction library, `mammoth`, Vitest, pgTAP, GitHub Actions, the xAI (Grok) API as the development AI provider, and the Google OAuth 2.0 and Gmail APIs (P1-0, called with plain `fetch`). The final list is confirmed from `package.json` when the build lands.

## Documentation

| File | Purpose |
|---|---|
| [`docs/MASTER_SPEC.md`](docs/MASTER_SPEC.md) | The single source of truth: architecture, schema, contracts, rules, delivery plan, tests (v1.4.2) |
| `docs/api.md` | Endpoint documentation (spec §16) |
| `docs/security.md` | Threat model and RLS notes (spec §15) |
| `docs/integration.md` | Live module readiness board, including *specified but not built* items |

Any change to architecture, schema, contract or scope is recorded in the spec in the same pull request (spec §19.3).

## License

MIT (see `LICENSE`).
