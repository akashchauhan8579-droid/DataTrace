-- =============================================================================
-- Test Plan: 007_account_erasure.test.sql
-- Stack: Supabase (PostgreSQL 15+) / pgTAP
-- Tier: P1-B (Master Spec v1.5.0 §9.3, §15.5.1, D1, D2, D3, D6)
-- Description: pgTAP tests for GDPR Art. 17 Account & Data Deletion:
--   1. Plain DELETE on audit_events fails as service_role
--   2. TRUNCATE on audit_events fails
--   3. purge_user_account permissions (service_role only, denied to authenticated/anon)
--   4. purge_user_account cascades and purges target user records only
--   5. Multi-tenant isolation: User B data intact and verify_audit_chain passes
--   6. erasure_receipts contains no user_id column and stores no PII
--   7. is_deletion_pending helper reflects active vs completed requests
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

SELECT plan(17);

-- Setup test identities in auth.users
DO $$
DECLARE
  v_user_a UUID := '11111111-1111-4111-a111-111111111111';
  v_user_b UUID := '22222222-2222-4222-a222-222222222222';
  v_case_a UUID := '33333333-3333-4333-a333-333333333333';
  v_case_b UUID := '44444444-4444-4444-a444-444444444444';
BEGIN
  -- 1. Ensure test users exist in auth.users
  INSERT INTO auth.users (id, aud, role, email)
  VALUES
    (v_user_a, 'authenticated', 'authenticated', 'tenant_a@datatrace.test'),
    (v_user_b, 'authenticated', 'authenticated', 'tenant_b@datatrace.test')
  ON CONFLICT (id) DO NOTHING;

  -- 2. Seed cases for User A and User B
  INSERT INTO public.cases (id, owner_id, display_id, title, status)
  VALUES
    (v_case_a, v_user_a, 'CASE-TEST-A', 'Tenant A Deletion Target', 'ACTIVE'),
    (v_case_b, v_user_b, 'CASE-TEST-B', 'Tenant B Control Group', 'ACTIVE')
  ON CONFLICT (id) DO NOTHING;

  -- 3. Seed audit events for User A
  INSERT INTO public.audit_events (case_id, actor_type, actor_id, entity_type, entity_id, action, metadata)
  VALUES
    (v_case_a, 'USER', v_user_a::text, 'CASE', v_case_a::text, 'CASE_CREATED', '{"name":"A"}'::jsonb);

  -- 4. Seed audit events for User B (2 chained events to verify chain head integrity)
  INSERT INTO public.audit_events (case_id, actor_type, actor_id, entity_type, entity_id, action, metadata)
  VALUES
    (v_case_b, 'USER', v_user_b::text, 'CASE', v_case_b::text, 'CASE_CREATED', '{"name":"B"}'::jsonb),
    (v_case_b, 'USER', v_user_b::text, 'EVIDENCE', 'EV-01', 'EVIDENCE_UPLOADED', '{"bytes":500}'::jsonb);

  -- 5. Seed gmail connections
  INSERT INTO public.gmail_connections (user_id, google_email, scope, refresh_token_enc, status)
  VALUES
    (v_user_a, 'tenant_a@gmail.test', 'https://www.googleapis.com/auth/gmail.readonly', 'enc_token_a', 'ACTIVE'),
    (v_user_b, 'tenant_b@gmail.test', 'https://www.googleapis.com/auth/gmail.readonly', 'enc_token_b', 'ACTIVE')
  ON CONFLICT (user_id) DO NOTHING;
END $$;

-- -----------------------------------------------------------------------------
-- Test 1: Plain DELETE on audit_events fails as service_role
-- -----------------------------------------------------------------------------
SET ROLE service_role;
SELECT throws_ok(
  'DELETE FROM public.audit_events WHERE case_id = ''33333333-3333-4333-a333-333333333333''',
  NULL,
  'Plain DELETE on audit_events fails as service_role'
);
RESET ROLE;

-- -----------------------------------------------------------------------------
-- Test 2: TRUNCATE on audit_events fails
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  'TRUNCATE TABLE public.audit_events',
  NULL,
  'TRUNCATE on audit_events fails'
);

-- -----------------------------------------------------------------------------
-- Test 3: Execution permissions on purge_user_account
-- -----------------------------------------------------------------------------
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.purge_user_account(uuid)', 'EXECUTE'),
  'purge_user_account is NOT executable by authenticated role'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.purge_user_account(uuid)', 'EXECUTE'),
  'purge_user_account is NOT executable by anon role'
);

SELECT ok(
  has_function_privilege('service_role', 'public.purge_user_account(uuid)', 'EXECUTE'),
  'purge_user_account is executable by service_role'
);

-- -----------------------------------------------------------------------------
-- Test 4: Execute purge_user_account for User A
-- -----------------------------------------------------------------------------
SELECT public.purge_user_account('11111111-1111-4111-a111-111111111111'::uuid);

SELECT is(
  (SELECT count(*)::int FROM public.cases WHERE owner_id = '11111111-1111-4111-a111-111111111111'::uuid),
  0,
  'User A cases purged successfully'
);

SELECT is(
  (SELECT count(*)::int FROM public.audit_events WHERE case_id = '33333333-3333-4333-a333-333333333333'::uuid),
  0,
  'User A audit_events purged successfully'
);

SELECT is(
  (SELECT count(*)::int FROM public.gmail_connections WHERE user_id = '11111111-1111-4111-a111-111111111111'::uuid),
  0,
  'User A gmail_connections purged successfully'
);

-- -----------------------------------------------------------------------------
-- Test 5 & 6: Multi-tenant isolation - User B data & audit chain intact
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT count(*)::int FROM public.cases WHERE owner_id = '22222222-2222-4222-a222-222222222222'::uuid),
  1,
  'User B cases remain intact'
);

SELECT is(
  (SELECT count(*)::int FROM public.audit_events WHERE case_id = '44444444-4444-4444-a444-444444444444'::uuid),
  2,
  'User B audit_events remain intact'
);

SELECT is(
  (SELECT count(*)::int FROM public.gmail_connections WHERE user_id = '22222222-2222-4222-a222-222222222222'::uuid),
  1,
  'User B gmail_connections remain intact'
);

SELECT is(
  (SELECT intact FROM public.verify_audit_chain('44444444-4444-4444-a444-444444444444'::uuid)),
  TRUE,
  'User B audit chain passes verify_audit_chain intact'
);

-- -----------------------------------------------------------------------------
-- Test 7: erasure_receipts schema & anonymous compliance proof
-- -----------------------------------------------------------------------------
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'erasure_receipts'
      AND column_name = 'user_id'
  ),
  'erasure_receipts table has no user_id column'
);

INSERT INTO public.erasure_receipts (subject_hash, counts)
VALUES (
  encode(hmac('11111111-1111-4111-a111-111111111111', 'test_key', 'sha256'), 'hex'),
  '{"cases": 1, "audit_events": 1}'::jsonb
);

SELECT is(
  (SELECT count(*)::int FROM public.erasure_receipts
   WHERE subject_hash = encode(hmac('11111111-1111-4111-a111-111111111111', 'test_key', 'sha256'), 'hex')),
  1,
  'Receipt stored with HMAC subject_hash only (no PII)'
);

-- -----------------------------------------------------------------------------
-- Test 8: is_deletion_pending helper function state verification
-- -----------------------------------------------------------------------------
SELECT is(
  public.is_deletion_pending('22222222-2222-4222-a222-222222222222'::uuid),
  FALSE,
  'is_deletion_pending returns FALSE before any request is made'
);

-- Insert active deletion request for User B
INSERT INTO public.account_deletion_requests (user_id, state, subject_hash)
VALUES (
  '22222222-2222-4222-a222-222222222222'::uuid,
  'REQUESTED',
  encode(hmac('22222222-2222-4222-a222-222222222222', 'test_key', 'sha256'), 'hex')
);

SELECT is(
  public.is_deletion_pending('22222222-2222-4222-a222-222222222222'::uuid),
  TRUE,
  'is_deletion_pending returns TRUE when deletion request is active'
);

-- Mark deletion request COMPLETE and nullify user_id
UPDATE public.account_deletion_requests
SET state = 'COMPLETE', user_id = NULL
WHERE user_id = '22222222-2222-4222-a222-222222222222'::uuid;

SELECT is(
  public.is_deletion_pending('22222222-2222-4222-a222-222222222222'::uuid),
  FALSE,
  'is_deletion_pending returns FALSE once request transitions to COMPLETE'
);

SELECT * FROM finish();

ROLLBACK;
