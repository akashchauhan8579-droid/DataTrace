-- =============================================================================
-- Migration: 008c_analysis_cancellation.sql
-- Stack: Supabase (PostgreSQL 15+)
-- Tier: P1-B (Master Spec v1.5.0 §15.5.1, D3)
-- Description: Account deletion freezes the analysis pipeline. RUNNING/PENDING
--              runs and their QUEUED/RUNNING tasks must be cancellable, so add
--              CANCELLED to both status CHECK constraints.
-- =============================================================================

-- 1. analysis_runs: PENDING | RUNNING | COMPLETED | FAILED | CANCELLED
ALTER TABLE public.analysis_runs
  DROP CONSTRAINT IF EXISTS analysis_runs_status_check;

ALTER TABLE public.analysis_runs
  ADD CONSTRAINT analysis_runs_status_check
  CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'));

-- 2. analysis_tasks: QUEUED | RUNNING | COMPLETED | FAILED | CANCELLED
ALTER TABLE public.analysis_tasks
  DROP CONSTRAINT IF EXISTS analysis_tasks_status_check;

ALTER TABLE public.analysis_tasks
  ADD CONSTRAINT analysis_tasks_status_check
  CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'));

-- The lease consistency constraint already permits CANCELLED because it only
-- requires a lease when status = 'RUNNING'. Cancellation code clears both
-- claimed_at and claim_token in the same UPDATE.
