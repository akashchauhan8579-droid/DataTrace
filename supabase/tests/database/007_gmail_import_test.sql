-- =============================================================================
-- Test Plan: 007_gmail_import_test.sql
-- Tier: P1-0 (Database, Security & AI Assurance)
-- Scope: Migration 007 Gmail Import Schema & Invariants
-- =============================================================================

BEGIN;

-- Setup mock environment
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Test 1: Default ingest_source is 'UPLOAD' and external_ref is NULL
DO $$
DECLARE
  v_case_id UUID := gen_random_uuid();
  v_item_id UUID;
  v_source VARCHAR;
  v_ref VARCHAR;
BEGIN
  INSERT INTO public.evidence_items (
    case_id, display_id, source_type, original_filename,
    mime_type, size_bytes, storage_path, sha256
  ) VALUES (
    v_case_id, 'EV-TEST-01', 'DOCUMENT', 'doc.pdf',
    'application/pdf', 1024, 'path/doc.pdf', repeat('0', 64)
  ) RETURNING id, ingest_source, external_ref INTO v_item_id, v_source, v_ref;

  ASSERT v_source = 'UPLOAD', 'Expected default ingest_source to be UPLOAD';
  ASSERT v_ref IS NULL, 'Expected default external_ref to be NULL';
END $$;

-- Test 2: GMAIL_IMPORT requires non-null external_ref (fails ck_external_ref)
DO $$
DECLARE
  v_case_id UUID := gen_random_uuid();
  v_failed BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.evidence_items (
      case_id, display_id, source_type, original_filename,
      mime_type, size_bytes, storage_path, sha256,
      ingest_source, external_ref
    ) VALUES (
      v_case_id, 'EV-TEST-02', 'EMAIL', 'email.eml',
      'message/rfc822', 2048, 'path/email.eml', repeat('1', 64),
      'GMAIL_IMPORT', NULL
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'GMAIL_IMPORT with NULL external_ref must violate ck_external_ref';
END $$;

-- Test 3: UPLOAD cannot have external_ref (fails ck_external_ref)
DO $$
DECLARE
  v_case_id UUID := gen_random_uuid();
  v_failed BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.evidence_items (
      case_id, display_id, source_type, original_filename,
      mime_type, size_bytes, storage_path, sha256,
      ingest_source, external_ref
    ) VALUES (
      v_case_id, 'EV-TEST-03', 'EMAIL', 'email.eml',
      'message/rfc822', 2048, 'path/email.eml', repeat('2', 64),
      'UPLOAD', 'msg_12345'
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'UPLOAD with non-null external_ref must violate ck_external_ref';
END $$;

-- Test 4: external_ref cannot exceed 64 characters
DO $$
DECLARE
  v_case_id UUID := gen_random_uuid();
  v_failed BOOLEAN := FALSE;
BEGIN
  BEGIN
    INSERT INTO public.evidence_items (
      case_id, display_id, source_type, original_filename,
      mime_type, size_bytes, storage_path, sha256,
      ingest_source, external_ref
    ) VALUES (
      v_case_id, 'EV-TEST-04', 'EMAIL', 'email.eml',
      'message/rfc822', 2048, 'path/email.eml', repeat('3', 64),
      'GMAIL_IMPORT', repeat('x', 65)
    );
  EXCEPTION WHEN check_violation OR string_data_right_truncation THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'external_ref > 64 chars must be rejected';
END $$;

-- Test 5: Unique partial index uk_evidence_external_ref prevents duplicates within same case
DO $$
DECLARE
  v_case_id UUID := gen_random_uuid();
  v_failed BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.evidence_items (
    case_id, display_id, source_type, original_filename,
    mime_type, size_bytes, storage_path, sha256,
    ingest_source, external_ref
  ) VALUES (
    v_case_id, 'EV-TEST-05A', 'EMAIL', 'email.eml',
    'message/rfc822', 2048, 'path/email1.eml', repeat('4', 64),
    'GMAIL_IMPORT', 'msg_shared_123'
  );

  BEGIN
    INSERT INTO public.evidence_items (
      case_id, display_id, source_type, original_filename,
      mime_type, size_bytes, storage_path, sha256,
      ingest_source, external_ref
    ) VALUES (
      v_case_id, 'EV-TEST-05B', 'EMAIL', 'email.eml',
      'message/rfc822', 2048, 'path/email2.eml', repeat('5', 64),
      'GMAIL_IMPORT', 'msg_shared_123'
    );
  EXCEPTION WHEN unique_violation THEN
    v_failed := TRUE;
  END;
  ASSERT v_failed, 'Duplicate external_ref in same case must raise unique_violation';
END $$;

-- Test 6: Different cases CAN have the same external_ref
DO $$
DECLARE
  v_case_1 UUID := gen_random_uuid();
  v_case_2 UUID := gen_random_uuid();
BEGIN
  INSERT INTO public.evidence_items (
    case_id, display_id, source_type, original_filename,
    mime_type, size_bytes, storage_path, sha256,
    ingest_source, external_ref
  ) VALUES
  (v_case_1, 'EV-C1', 'EMAIL', 'email.eml', 'message/rfc822', 2048, 'p1', repeat('6', 64), 'GMAIL_IMPORT', 'cross_case_msg'),
  (v_case_2, 'EV-C2', 'EMAIL', 'email.eml', 'message/rfc822', 2048, 'p2', repeat('7', 64), 'GMAIL_IMPORT', 'cross_case_msg');
END $$;

-- Test 7: Immutability trigger prevents changing ingest_source or external_ref
DO $$
DECLARE
  v_case_id UUID := gen_random_uuid();
  v_item_id UUID;
  v_failed_source BOOLEAN := FALSE;
  v_failed_ref BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.evidence_items (
    case_id, display_id, source_type, original_filename,
    mime_type, size_bytes, storage_path, sha256,
    ingest_source, external_ref
  ) VALUES (
    v_case_id, 'EV-IMMUTABLE', 'EMAIL', 'email.eml',
    'message/rfc822', 2048, 'path/orig.eml', repeat('8', 64),
    'GMAIL_IMPORT', 'orig_msg_id'
  ) RETURNING id INTO v_item_id;

  BEGIN
    UPDATE public.evidence_items
    SET ingest_source = 'UPLOAD'
    WHERE id = v_item_id;
  EXCEPTION WHEN integrity_constraint_violation THEN
    v_failed_source := TRUE;
  END;
  ASSERT v_failed_source, 'Updating ingest_source must be rejected by immutability trigger';

  BEGIN
    UPDATE public.evidence_items
    SET external_ref = 'tampered_id'
    WHERE id = v_item_id;
  EXCEPTION WHEN integrity_constraint_violation THEN
    v_failed_ref := TRUE;
  END;
  ASSERT v_failed_ref, 'Updating external_ref must be rejected by immutability trigger';
END $$;

-- Test 8: gmail_connections enforces one row per user, exact scope, valid status
DO $$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_failed_scope BOOLEAN := FALSE;
  v_failed_status BOOLEAN := FALSE;
  v_failed_dup_user BOOLEAN := FALSE;
BEGIN
  -- Insert valid connection
  INSERT INTO public.gmail_connections (
    user_id, google_email, scope, refresh_token_enc, status
  ) VALUES (
    v_user_id, 'investigator@acme.corp',
    'https://www.googleapis.com/auth/gmail.readonly',
    'vault_enc_token_123', 'ACTIVE'
  );

  -- Duplicate user_id should fail
  BEGIN
    INSERT INTO public.gmail_connections (
      user_id, google_email, scope, refresh_token_enc, status
    ) VALUES (
      v_user_id, 'other@acme.corp',
      'https://www.googleapis.com/auth/gmail.readonly',
      'vault_enc_token_456', 'ACTIVE'
    );
  EXCEPTION WHEN unique_violation THEN
    v_failed_dup_user := TRUE;
  END;
  ASSERT v_failed_dup_user, 'Duplicate user_id in gmail_connections must violate uniqueness';

  -- Wrong scope should fail
  BEGIN
    INSERT INTO public.gmail_connections (
      user_id, google_email, scope, refresh_token_enc, status
    ) VALUES (
      gen_random_uuid(), 'badscope@acme.corp',
      'https://mail.google.com/',
      'vault_enc_token_789', 'ACTIVE'
    );
  EXCEPTION WHEN check_violation THEN
    v_failed_scope := TRUE;
  END;
  ASSERT v_failed_scope, 'Non-exact scope must violate check constraint';

  -- Bad status should fail
  BEGIN
    INSERT INTO public.gmail_connections (
      user_id, google_email, scope, refresh_token_enc, status
    ) VALUES (
      gen_random_uuid(), 'badstatus@acme.corp',
      'https://www.googleapis.com/auth/gmail.readonly',
      'vault_enc_token_999', 'REVOKED'
    );
  EXCEPTION WHEN check_violation THEN
    v_failed_status := TRUE;
  END;
  ASSERT v_failed_status, 'Status not in (ACTIVE, EXPIRED) must violate check constraint';
END $$;

-- Test 9: RLS enabled and no permissions for client roles
DO $$
DECLARE
  v_rls_enabled BOOLEAN;
  v_has_anon_select BOOLEAN;
  v_has_auth_select BOOLEAN;
BEGIN
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class
  WHERE relname = 'gmail_connections';
  ASSERT v_rls_enabled, 'gmail_connections must have RLS enabled';

  SELECT has_table_privilege('anon', 'public.gmail_connections', 'SELECT') INTO v_has_anon_select;
  ASSERT NOT v_has_anon_select, 'anon role must NOT have SELECT on gmail_connections';

  SELECT has_table_privilege('authenticated', 'public.gmail_connections', 'SELECT') INTO v_has_auth_select;
  ASSERT NOT v_has_auth_select, 'authenticated role must NOT have SELECT on gmail_connections';
END $$;

ROLLBACK;
