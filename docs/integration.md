# Integration Readiness

This board records the checked-in implementation against the folder ownership and boundaries in [MASTER_SPEC.md](MASTER_SPEC.md). The folder layout is scaffolded; a directory or `.gitkeep` file is not evidence that its module is implemented.

## Implemented

| Area | Current files | Status |
|---|---|---|
| Shared contracts | `contracts/index.ts`, `contracts/normalize.ts`, `contracts/result.ts`, `contracts/schemas/` | Implemented: Normalization, locators, citations, findings, payloads, and reports schemas with complete unit tests. |
| AI gateway & Providers | `ai/gateway/`, `ai/providers/`, `ai/prompts/` | Implemented: Consent check, minimizer, candidate resolver, Grok, Groq & Mock providers, prompt registry, and extraction v1 prompt with tests. Groq credentials are read server-side from `.env`; live credentials are not included or exercised by the automated tests. |
| Backend ingestion (Member B) | `backend/ingestion/` | Implemented: SHA-256 computation, strict path parsing, paragraph segmentation, RFC-822 email parser, and page-level PDF extractor with tests. |
| Backend API & Router (Member B) | `backend/api/`, `frontend/app/api/[[...slug]]/route.ts` | Implemented: Framework-agnostic router, Next.js adapter, Supabase auth/scoped client, health, cases, evidence ingestion, audited signed-URL downloads, findings, reports, and audit endpoints with tests. |
| Analysis worker (Member B) | `backend/jobs/` | Implemented: Worker polling loop with atomic PostgreSQL claims, lease recovery, input_evidence_scope isolation, output-hash validation, and transactional audit persistence. Run with `npm run worker`. |
| Database & Migrations (Member C) | `supabase/migrations/` | Implemented: Migrations 001 to 006 (core tables, findings, RLS/storage, audit-chain hash, invariants, and worker functions). Verified live against Supabase cloud. |
| Synthetic data | `tests/synthetic/sample.eml`, `tests/synthetic/fixtures/` | Sample email fixture and extraction v1 fixtures present and tested. |
| Project checks | `package.json`, `tsconfig.json` | `npm test`, `npm run typecheck`, and `npm run worker` operational. |

## Scaffolded, pending implementation

| Spec area | Current state | Owner |
|---|---|---|
| Frontend UI components & pages | `frontend/app/`, `frontend/components/`, `frontend/lib/` contain scaffolded placeholders; adapter is frozen and ready. | Member A |
| Verification engine & rules | `verification/rules/` scaffolded; deterministic rules (`claim_verification.v1`, `citation_integrity.v1`, etc.) to be finalized. | Member D |
| Stretch integrations & probes (P2) | `backend/integrations/` (Gmail OAuth), `backend/probes/` (HTTP probes) are stretch goals. | Member B (P2) |

## Checks

Run from the `DATA_TRACE` repository root:

| Command | Result at last check |
|---|---|
| `npm test` | Pass — 18 test files, 238 tests passing |
| `npm run typecheck` | Pass — Zero TypeScript errors |
| `npm run worker` | Pass — Analysis worker starts and polls for tasks |

## Next Delivery Priorities

1. **Member A (Frontend):** Build Case Dashboard, Evidence Viewer, Matrix View, and Report Editor using `frontend/app/api/[[...slug]]/route.ts`.
2. **Member D (Lead / Verification):** Implement the 6 P0 deterministic verification rules in `verification/rules/`.
3. **Member B (Backend):** P0 Core is 100% complete and fully verified. Ready to support frontend and verification integrations during hackathon onsite window.
