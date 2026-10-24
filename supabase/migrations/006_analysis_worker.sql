-- =============================================================================
-- Migration: 006_analysis_worker.sql
-- Description: Atomic worker claims, recoverable leases, and audited completion.
-- =============================================================================

ALTER TABLE public.analysis_tasks
  ADD COLUMN claimed_at TIMESTAMPTZ,
  ADD COLUMN claim_token UUID;

-- Any pre-lease RUNNING task cannot be owned by the new worker protocol.
UPDATE public.analysis_tasks
SET status = 'QUEUED'
WHERE status = 'RUNNING';

ALTER TABLE public.analysis_tasks
  ADD CONSTRAINT analysis_tasks_lease_consistent CHECK (
    (status = 'RUNNING' AND claimed_at IS NOT NULL AND claim_token IS NOT NULL)
    OR
    (status <> 'RUNNING' AND claimed_at IS NULL AND claim_token IS NULL)
  );

CREATE FUNCTION public.claim_analysis_task(p_claim_token UUID)
RETURNS SETOF public.analysis_tasks
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH next_task AS (
    SELECT id
    FROM public.analysis_tasks
    WHERE status = 'QUEUED'
      AND retry_count < 3
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.analysis_tasks AS task
  SET status = 'RUNNING',
      claimed_at = clock_timestamp(),
      claim_token = p_claim_token
  FROM next_task
  WHERE task.id = next_task.id
  RETURNING task.*;
$$;

CREATE FUNCTION public.finalize_analysis_run(p_run_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_case_id UUID;
  v_has_failed BOOLEAN;
  v_final_status VARCHAR(16);
  v_action VARCHAR(64);
BEGIN
  -- 1. Serialize on the run row to prevent concurrent task completions from racing
  SELECT run.case_id INTO v_case_id
  FROM public.analysis_runs AS run
  WHERE run.id = p_run_id
    AND run.status IN ('PENDING', 'RUNNING')
  FOR UPDATE;

  IF v_case_id IS NULL THEN
    RETURN FALSE; -- Already finalized or not found
  END IF;

  -- 2. Check if any tasks are still queued or running
  IF EXISTS (
    SELECT 1
    FROM public.analysis_tasks AS task
    WHERE task.run_id = p_run_id
      AND task.status IN ('QUEUED', 'RUNNING')
  ) THEN
    RETURN FALSE; -- Still active tasks remaining
  END IF;

  -- 3. Check if any task ended in FAILED state (do not falsely mark COMPLETED if tasks failed)
  SELECT EXISTS (
    SELECT 1
    FROM public.analysis_tasks AS task
    WHERE task.run_id = p_run_id
      AND task.status = 'FAILED'
  ) INTO v_has_failed;

  v_final_status := CASE WHEN v_has_failed THEN 'FAILED' ELSE 'COMPLETED' END;
  v_action := CASE WHEN v_has_failed THEN 'ANALYSIS_RUN_FAILED' ELSE 'ANALYSIS_RUN_COMPLETED' END;

  -- 4. Update the run with the accurate status
  UPDATE public.analysis_runs AS run
  SET status = v_final_status,
      completed_at = clock_timestamp()
  WHERE run.id = p_run_id;

  -- 5. Audit event with accurate final status
  INSERT INTO public.audit_events (
    case_id, actor_type, actor_id, entity_type, entity_id, action, metadata
  ) VALUES (
    v_case_id, 'SYSTEM', 'datatrace-worker@1.0',
    'ANALYSIS_RUN', p_run_id::TEXT, v_action,
    jsonb_build_object('runId', p_run_id, 'status', v_final_status)
  );

  RETURN TRUE;
END;
$$;

CREATE FUNCTION public.complete_analysis_task(
  p_task_id UUID,
  p_claim_token UUID,
  p_validated_output JSONB,
  p_output_sha256 TEXT,
  p_tokens_in INTEGER,
  p_tokens_out INTEGER,
  p_latency_ms INTEGER,
  p_fallback_used BOOLEAN,
  p_scope_map_size INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_task public.analysis_tasks%ROWTYPE;
  v_case_id UUID;
BEGIN
  UPDATE public.analysis_tasks AS task
  SET status = 'COMPLETED',
      validated_output = p_validated_output,
      output_sha256 = p_output_sha256,
      tokens_in = p_tokens_in,
      tokens_out = p_tokens_out,
      latency_ms = p_latency_ms,
      fallback_used = p_fallback_used,
      claimed_at = NULL,
      claim_token = NULL
  WHERE task.id = p_task_id
    AND task.status = 'RUNNING'
    AND task.claim_token = p_claim_token
  RETURNING task.* INTO v_task;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  SELECT run.case_id INTO v_case_id
  FROM public.analysis_runs AS run
  WHERE run.id = v_task.run_id;

  IF v_case_id IS NULL THEN
    RAISE EXCEPTION 'Analysis run % not found for task %', v_task.run_id, p_task_id;
  END IF;

  INSERT INTO public.audit_events (
    case_id, actor_type, actor_id, entity_type, entity_id, action, metadata
  ) VALUES (
    v_case_id, 'SYSTEM', 'datatrace-worker@1.0',
    'ANALYSIS_TASK', p_task_id::TEXT, 'ANALYSIS_TASK_COMPLETED',
    jsonb_build_object(
      'taskType', v_task.task_type,
      'provider', v_task.provider,
      'model', v_task.model,
      'promptId', v_task.prompt_id,
      'promptVersion', v_task.prompt_version,
      'outputSha256', p_output_sha256,
      'tokensIn', p_tokens_in,
      'tokensOut', p_tokens_out,
      'latencyMs', p_latency_ms,
      'fallbackUsed', p_fallback_used,
      'scopeMapSize', p_scope_map_size
    )
  );

  PERFORM public.finalize_analysis_run(v_task.run_id);
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_analysis_task(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_analysis_run(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_analysis_task(UUID, UUID, JSONB, TEXT, INTEGER, INTEGER, INTEGER, BOOLEAN, INTEGER)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_analysis_task(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_analysis_run(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_analysis_task(UUID, UUID, JSONB, TEXT, INTEGER, INTEGER, INTEGER, BOOLEAN, INTEGER)
  TO service_role;
