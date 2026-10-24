-- =============================================================================
BEGIN;

-- =========================================================
-- 003_rls_and_storage.sql
-- DataTrace: RLS, permissions, ownership helpers, storage
-- =========================================================

-- 1. CLIENT PERMISSIONS: READ ONLY
-- Browser clients must not write or delete data directly.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;


-- 2. OWNERSHIP HELPER FUNCTIONS
-- SECURITY DEFINER avoids recursive RLS checks in ownership lookups.

CREATE OR REPLACE FUNCTION public.owns_case(p_case UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.cases c
        WHERE c.id = p_case
          AND c.owner_id = auth.uid()
    );
$$;


CREATE OR REPLACE FUNCTION public.owns_evidence(p_ev UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.evidence_items e
        JOIN public.cases c ON c.id = e.case_id
        WHERE e.id = p_ev
          AND c.owner_id = auth.uid()
    );
$$;


CREATE OR REPLACE FUNCTION public.owns_finding(p_f UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.findings f
        JOIN public.cases c ON c.id = f.case_id
        WHERE f.id = p_f
          AND c.owner_id = auth.uid()
    );
$$;


CREATE OR REPLACE FUNCTION public.owns_run(p_run UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.analysis_runs r
        JOIN public.cases c ON c.id = r.case_id
        WHERE r.id = p_run
          AND c.owner_id = auth.uid()
    );
$$;


-- Restrict execution of ownership helpers.
REVOKE EXECUTE ON FUNCTION public.owns_case(UUID)
FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.owns_evidence(UUID)
FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.owns_finding(UUID)
FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.owns_run(UUID)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.owns_case(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_evidence(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_finding(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_run(UUID) TO authenticated;


-- 3. SAFE UUID PARSER
CREATE OR REPLACE FUNCTION public.try_uuid(p TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
    RETURN p::uuid;
EXCEPTION
    WHEN invalid_text_representation THEN
        RETURN NULL;
END;
$$;


-- 4. ENABLE RLS ON EXISTING DATATRACE TABLES
DO $$
DECLARE
    t TEXT;
    tables_to_secure TEXT[] := ARRAY[
        'cases',
        'ai_consents',
        'evidence_items',
        'evidence_artifacts',
        'evidence_segments',
        'analysis_runs',
        'analysis_tasks',
        'findings',
        'citations',
        'relationships',
        'request_response_links',
        'verification_results',
        'case_reports',
        'audit_events'
    ];
BEGIN
    FOREACH t IN ARRAY tables_to_secure LOOP
        IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
            EXECUTE format(
                'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
                t
            );
        ELSE
            RAISE NOTICE 'Table public.% does not exist; skipping it.', t;
        END IF;
    END LOOP;
END;
$$;


-- 5. GRANT SELECT ONLY ON EXISTING DATATRACE TABLES
DO $$
DECLARE
    t TEXT;
    tables_to_read TEXT[] := ARRAY[
        'cases',
        'ai_consents',
        'evidence_items',
        'evidence_artifacts',
        'evidence_segments',
        'analysis_runs',
        'analysis_tasks',
        'findings',
        'citations',
        'relationships',
        'request_response_links',
        'verification_results',
        'case_reports',
        'audit_events'
    ];
BEGIN
    FOREACH t IN ARRAY tables_to_read LOOP
        IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
            EXECUTE format(
                'GRANT SELECT ON TABLE public.%I TO authenticated',
                t
            );
        END IF;
    END LOOP;
END;
$$;


-- 6. CASE POLICIES
DROP POLICY IF EXISTS cases_select ON public.cases;
DROP POLICY IF EXISTS cases_insert ON public.cases;
DROP POLICY IF EXISTS cases_update ON public.cases;

CREATE POLICY cases_select
ON public.cases
FOR SELECT
TO authenticated
USING (owner_id = (SELECT auth.uid()));

-- Guardrails for a future explicitly enabled client-write path.
-- INSERT/UPDATE remain blocked by the missing SQL privileges.
CREATE POLICY cases_insert
ON public.cases
FOR INSERT
TO authenticated
WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY cases_update
ON public.cases
FOR UPDATE
TO authenticated
USING (owner_id = (SELECT auth.uid()))
WITH CHECK (owner_id = (SELECT auth.uid()));


-- 7. POLICIES FOR TABLES WITH A DIRECT case_id
DO $$
DECLARE
    t TEXT;
    tables_with_case_id TEXT[] := ARRAY[
        'ai_consents',
        'evidence_items',
        'analysis_runs',
        'findings',
        'citations',
        'relationships',
        'request_response_links',
        'case_reports',
        'audit_events'
    ];
BEGIN
    FOREACH t IN ARRAY tables_with_case_id LOOP
        IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
            EXECUTE format(
                'DROP POLICY IF EXISTS %I ON public.%I',
                t || '_select', t
            );

            EXECUTE format(
                'CREATE POLICY %I ON public.%I
                 FOR SELECT TO authenticated
                 USING (public.owns_case(case_id))',
                t || '_select', t
            );
        END IF;
    END LOOP;
END;
$$;


-- 8. POLICIES FOR TABLES REACHED THROUGH PARENT RECORDS

DO $$
BEGIN
    IF to_regclass('public.evidence_artifacts') IS NOT NULL THEN
        DROP POLICY IF EXISTS evidence_artifacts_select
        ON public.evidence_artifacts;

        CREATE POLICY evidence_artifacts_select
        ON public.evidence_artifacts
        FOR SELECT TO authenticated
        USING (public.owns_evidence(evidence_id));
    END IF;

    IF to_regclass('public.evidence_segments') IS NOT NULL THEN
        DROP POLICY IF EXISTS evidence_segments_select
        ON public.evidence_segments;

        CREATE POLICY evidence_segments_select
        ON public.evidence_segments
        FOR SELECT TO authenticated
        USING (public.owns_evidence(evidence_id));
    END IF;

    IF to_regclass('public.analysis_tasks') IS NOT NULL THEN
        DROP POLICY IF EXISTS analysis_tasks_select
        ON public.analysis_tasks;

        CREATE POLICY analysis_tasks_select
        ON public.analysis_tasks
        FOR SELECT TO authenticated
        USING (public.owns_run(run_id));
    END IF;

    IF to_regclass('public.verification_results') IS NOT NULL THEN
        DROP POLICY IF EXISTS verification_results_select
        ON public.verification_results;

        CREATE POLICY verification_results_select
        ON public.verification_results
        FOR SELECT TO authenticated
        USING (public.owns_finding(finding_id));
    END IF;
END;
$$;


-- 9. PRIVATE EVIDENCE STORAGE
-- Clients must not access objects in the evidence bucket.

DROP POLICY IF EXISTS evidence_bucket_no_client_access
ON storage.objects;

CREATE POLICY evidence_bucket_no_client_access
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (bucket_id <> 'evidence')
WITH CHECK (bucket_id <> 'evidence');


COMMIT;