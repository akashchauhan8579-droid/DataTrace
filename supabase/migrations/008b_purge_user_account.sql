-- =============================================================================
-- Migration: 008b_purge_user_account.sql
-- Stack: Supabase (PostgreSQL 15+)
-- Tier: P1-B (Master Spec v1.5.0 §9.3, §15.5.1, D1)
-- Description: Modifies audit_events_immutable() to honour a transaction-local
--              purge flag, and introduces the SECURITY DEFINER purge_user_account
--              function executable exclusively by service_role.
-- =============================================================================

-- 1. Modify audit immutability trigger function
-- Retains append-only guarantee for standard operations.
-- Allows DELETE only when purge_user_account() has explicitly set the
-- transaction-local setting 'datatrace.allow_audit_delete = true'.
CREATE OR REPLACE FUNCTION public.audit_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Allow DELETE only when the transaction-local flag set by purge_user_account() is active
  IF TG_OP = 'DELETE' AND current_setting('datatrace.allow_audit_delete', true) = 'true' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'audit_events is append-only' USING ERRCODE = 'integrity_constraint_violation';
END $$;

-- 2. Account purge procedure (D1)
-- Only authorized pathway for GDPR Article 17 data destruction.
-- Takes per-case advisory locks, deletes audit_events under the transaction-local flag,
-- cascades cases and dependent tables, and cleans up gmail connections.
-- Returns a JSONB object containing per-table deleted row counts.
CREATE OR REPLACE FUNCTION public.purge_user_account(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  v_case RECORD;
  v_case_ids UUID[];
  v_count_cases INT := 0;
  v_count_audit INT := 0;
  v_count_evidence INT := 0;
  v_count_artifacts INT := 0;
  v_count_segments INT := 0;
  v_count_runs INT := 0;
  v_count_tasks INT := 0;
  v_count_findings INT := 0;
  v_count_citations INT := 0;
  v_count_relationships INT := 0;
  v_count_rrl INT := 0;
  v_count_verifications INT := 0;
  v_count_reports INT := 0;
  v_count_consents INT := 0;
  v_count_gmail INT := 0;
  v_result JSONB;
BEGIN
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'p_user cannot be null';
  END IF;

  -- 1. Identify all cases owned by the user
  SELECT ARRAY_AGG(id) INTO v_case_ids
  FROM public.cases
  WHERE owner_id = p_user;

  -- 2. Take identical per-case advisory locks as audit_events_chain()
  IF v_case_ids IS NOT NULL THEN
    FOR v_case IN SELECT unnest(v_case_ids) AS id LOOP
      PERFORM pg_advisory_xact_lock(hashtext(v_case.id::text));
    END LOOP;
  END IF;

  -- 3. Gather per-table row counts before deletion
  IF v_case_ids IS NOT NULL AND cardinality(v_case_ids) > 0 THEN
    SELECT COUNT(*) INTO v_count_cases FROM public.cases WHERE owner_id = p_user;
    SELECT COUNT(*) INTO v_count_audit FROM public.audit_events WHERE case_id = ANY(v_case_ids);
    SELECT COUNT(*) INTO v_count_evidence FROM public.evidence_items WHERE case_id = ANY(v_case_ids);
    SELECT COUNT(*) INTO v_count_artifacts FROM public.evidence_artifacts WHERE evidence_id IN (
      SELECT id FROM public.evidence_items WHERE case_id = ANY(v_case_ids)
    );
    SELECT COUNT(*) INTO v_count_segments FROM public.evidence_segments WHERE evidence_id IN (
      SELECT id FROM public.evidence_items WHERE case_id = ANY(v_case_ids)
    );
    SELECT COUNT(*) INTO v_count_runs FROM public.analysis_runs WHERE case_id = ANY(v_case_ids);
    SELECT COUNT(*) INTO v_count_tasks FROM public.analysis_tasks WHERE run_id IN (
      SELECT id FROM public.analysis_runs WHERE case_id = ANY(v_case_ids)
    );
    SELECT COUNT(*) INTO v_count_findings FROM public.findings WHERE case_id = ANY(v_case_ids);
    SELECT COUNT(*) INTO v_count_citations FROM public.citations WHERE case_id = ANY(v_case_ids);
    SELECT COUNT(*) INTO v_count_relationships FROM public.relationships WHERE case_id = ANY(v_case_ids);
    SELECT COUNT(*) INTO v_count_rrl FROM public.request_response_links WHERE case_id = ANY(v_case_ids);
    SELECT COUNT(*) INTO v_count_verifications FROM public.verification_results WHERE finding_id IN (
      SELECT id FROM public.findings WHERE case_id = ANY(v_case_ids)
    );
    SELECT COUNT(*) INTO v_count_reports FROM public.case_reports WHERE case_id = ANY(v_case_ids);
    SELECT COUNT(*) INTO v_count_consents FROM public.ai_consents WHERE case_id = ANY(v_case_ids) OR user_id = p_user;
  ELSE
    SELECT COUNT(*) INTO v_count_consents FROM public.ai_consents WHERE user_id = p_user;
  END IF;

  SELECT COUNT(*) INTO v_count_gmail FROM public.gmail_connections WHERE user_id = p_user;

  v_result := jsonb_build_object(
    'cases', v_count_cases,
    'audit_events', v_count_audit,
    'evidence_items', v_count_evidence,
    'evidence_artifacts', v_count_artifacts,
    'evidence_segments', v_count_segments,
    'analysis_runs', v_count_runs,
    'analysis_tasks', v_count_tasks,
    'findings', v_count_findings,
    'citations', v_count_citations,
    'relationships', v_count_relationships,
    'request_response_links', v_count_rrl,
    'verification_results', v_count_verifications,
    'reports', v_count_reports,
    'case_reports', v_count_reports,
    'ai_consents', v_count_consents,
    'gmail_connections', v_count_gmail
  );

  -- 4. Enable transaction-local audit deletion flag
  PERFORM set_config('datatrace.allow_audit_delete', 'true', true);

  -- 5. Delete audit rows for user cases first (audit_events.case_id -> cases is ON DELETE RESTRICT)
  IF v_case_ids IS NOT NULL AND cardinality(v_case_ids) > 0 THEN
    DELETE FROM public.audit_events WHERE case_id = ANY(v_case_ids);
  END IF;

  -- 6. Delete cases (cascades to all child tables)
  DELETE FROM public.cases WHERE owner_id = p_user;

  -- 7. Delete standalone user records (ai_consents if any remaining, gmail_connections)
  DELETE FROM public.ai_consents WHERE user_id = p_user;
  DELETE FROM public.gmail_connections WHERE user_id = p_user;

  -- 8. Reset transaction-local flag
  PERFORM set_config('datatrace.allow_audit_delete', 'false', true);

  RETURN v_result;
END $$;

-- 3. Restrict execution permissions: service_role only
REVOKE ALL PRIVILEGES ON FUNCTION public.purge_user_account(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_user_account(UUID) TO service_role;
