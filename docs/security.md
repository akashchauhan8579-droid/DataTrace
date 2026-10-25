# DataTrace Security Architecture & P1-0 Handoff

This document defines the security architecture, authorization boundaries, and security implementation handoff for DataTrace.

---

## 1. Case Authorization & Tenant Isolation: `assertCaseOwner`

Every endpoint operating on a case or evidence item must call `assertCaseOwner` as its first action:

```ts
await assertCaseOwner({ db, caseId: params.id, userId: user.id });
// Or positional:
await assertCaseOwner(db, params.id, user.id);
```

### Security Rules:
- **First Importer Action**: Must be executed before reading connection credentials or querying Gmail APIs.
- **Fail-Closed 404 NOT_FOUND**: If a case is missing or owned by another user, the guard returns/throws the project-standard 404 `NOT_FOUND` response:
  ```json
  { "error": { "code": "NOT_FOUND", "message": "Case <id> not found" } }
  ```
- **Zero Existence Leakage**: Cross-user queries query `.eq('id', caseId).eq('owner_id', userId)`. Unauthorized requests receive an identical 404 response to non-existent cases, preventing tenant probing.

---

## 2. P1-0: Gmail Ingress Security Specification

The Gmail ingestion ingress adheres to the following strict security controls:

### 2.1 Exact Readonly Scope
- Scope is strictly constrained to `https://www.googleapis.com/auth/gmail.readonly`.
- Enforced at three layers:
  1. **OAuth URL Generation**: Requests only the readonly scope with `access_type=offline` and `prompt=consent`.
  2. **Callback Validation**: Callback schemas and exchange handlers verify the granted scope.
  3. **Database Constraint**: `gmail_connections.scope` check constraint enforces `CHECK (scope = 'https://www.googleapis.com/auth/gmail.readonly')`.

### 2.2 HMAC State Parameter & CSRF Mitigation
- OAuth `state` parameter is generated as:
  $$\text{state} = \text{HMAC-SHA256}(\text{userId} : \text{nonce} : \text{issuedAt} : \text{expiresAt}, \text{secret})$$
- State lifetime is strictly capped at **10 minutes** from creation.
- `GMAIL_STATE_SECRET` is required and must be canonical base64 containing at least 32 bytes; there is no development fallback.
- Upon callback, the server verifies:
  1. HMAC signature integrity using the server-side secret.
  2. Expiration time ($t_{\text{current}} < t_{\text{expires}}$) and rejects future-issued state.
  3. The exact 10-minute issued-to-expiry interval.
  4. Authenticated session user ID matching the user ID encoded within state.
- Code exchange never proceeds if state validation fails.

### 2.3 AES-256-GCM Token Storage
- Refresh tokens are encrypted via AES-256-GCM using `backend/integrations/tokenVault.ts`.
- **Key Validation**: `GMAIL_TOKEN_ENC_KEY` is required and must be canonical base64 for exactly 32 bytes (256 bits); there is no fallback or key normalization.
- **Unique Nonce**: A fresh, cryptographically secure 12-byte initialization vector (IV) is generated for every encryption call.
- **Storage Format**: `iv:authTag:ciphertext` base64-encoded string stored in `gmail_connections.refresh_token_enc`.
- **In-Memory Access Tokens**: Ephemeral access tokens are kept in memory only and never written to database, disk, or logs.

### 2.4 Zero Credential & Token Leakage
- **No Client Secrets / Codes / Tokens in Browser**: Server exchanges authorization code for tokens; client secrets are never delivered to the client.
- **Table Isolation**: `gmail_connections` has Row-Level Security enabled with **zero policies**; client roles (`anon`, `authenticated`) have all table permissions explicitly revoked (`REVOKE ALL`). Only the backend `service_role` can access this table.
- **Logging & Audit Ledger**:
  - Tokens, authorization codes, state parameters, and `Authorization` headers are stripped and excluded from console logs, error traces, and audit logs.
  - Audit ledger entries record non-sensitive metadata only: `caseId`, `threadId`, `ingestSource: 'GMAIL_IMPORT'`, item count, and SHA-256 content hashes.
- **API Boundary Protection**:
  - `external_ref` (Gmail message ID) is internal metadata used solely for partial unique index deduplication (`uk_evidence_external_ref`) and is **never** returned in evidence API outputs or user-facing responses.
  - Upstream Google error bodies are never reflected to clients; sanitized internal error codes (`GMAIL_NOT_CONNECTED`, `GMAIL_FETCH_FAILED`) are returned instead.

### 2.5 Synthetic Test Accounts & Mock Mode
- Mock mode (`GMAIL_MOCK=true`) simulates all OAuth and message retrieval flows in-memory without contacting Google APIs or requiring real accounts.
- Testing in development and CI environments uses synthetic, throwaway test accounts and mocked fixtures only.
- Frontend UI displays "Import" and "test accounts only" when operating in test/mock mode.

### 2.6 Disconnect Semantics & Token Expiry
- **Disconnect**:
  - Invokes Google OAuth token revocation endpoint (`https://oauth2.googleapis.com/revoke`) on a best-effort basis.
  - Deletes the connection record from `gmail_connections` regardless of whether Google revocation succeeds.
  - **Evidence Retention**: Disconnection deletes only the connection credentials. Existing evidence items and audit ledger records are never deleted upon disconnect.
- **Expired Tokens & `invalid_grant`**:
  - When Google returns `invalid_grant` during token refresh, the connection status is updated to `EXPIRED`.
  - No failing or corrupt evidence items are created.

---

## 3. AB2 / AB3 Backend Implementation Handoff

```text
1. Guard Enforcement:
   Ensure `await assertCaseOwner({ db, caseId: params.id, userId: user.id });` executes at the start of:
   - `GET /cases/:id/evidence/gmail/threads`
   - `POST /cases/:id/evidence/gmail`
   - `POST /cases/:id/evidence/gmail/disconnect`

2. Token Handling:
   - Decrypt `refresh_token_enc` using `decryptToken(conn.refresh_token_enc)` from `backend/integrations/tokenVault.ts`.
   - Never write access tokens or refreshed tokens to logs or audit metadata.

3. Idempotent Ingestion:
   - For each message in the thread, calculate SHA-256 over raw RFC-822 bytes.
   - Insert evidence item with `ingest_source = 'GMAIL_IMPORT'` and `external_ref = messageId`.
   - On unique constraint violation on `(case_id, external_ref)`, query existing item and return `{ id, displayId, sha256, duplicate: true }`.
```
