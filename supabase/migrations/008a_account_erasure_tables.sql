-- =============================================================================
-- Migration: 008a_account_erasure_tables.sql
-- Stack: Supabase (PostgreSQL 15+)
-- Tier: P1-B (Master Spec v1.5.0 §15.5.1, D2, D6)
-- Description: Account deletion requests state machine, erasure receipts,
--              partial unique index, and is_deletion_pending helper function.
-- =============================================================================

-- 1. State machine enum type (D2: REQUESTED > STORAGE_PURGED > GMAIL_REVOKED > DB_PURGED > AUTH_DELETED > COMPLETE)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_deletion_state') THEN
        CREATE TYPE public.account_deletion_state AS ENUM (
            'REQUESTED',
            'STORAGE_PURGED',
            'GMAIL_REVOKED',
            'DB_PURGED',
            'AUTH_DELETED',
            'COMPLETE'
        );
    END IF;
END $$;

-- 2. Account deletion requests table
-- Resumable, client-driven deletion state machine (D2).
-- Deliberately holds NO foreign key to auth.users so the record persists across user deletion;
-- the raw user_id is nulled out when the request transitions to COMPLETE (D6).
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,                                           -- NO FK to auth.users; nulled at COMPLETE
    state public.account_deletion_state NOT NULL DEFAULT 'REQUESTED',
    subject_hash TEXT NOT NULL,                             -- HMAC-SHA256 of user_id using ERASURE_RECEIPT_KEY
    attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT,
    counts JSONB NOT NULL DEFAULT '{}'::jsonb,              -- per-table row counts
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Partial unique index ensuring at most one active (non-COMPLETE) deletion request per user (D2)
CREATE UNIQUE INDEX IF NOT EXISTS uk_account_deletion_user_active
    ON public.account_deletion_requests (user_id)
    WHERE state <> 'COMPLETE' AND user_id IS NOT NULL;

-- Index for lookup by subject hash
CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_subject_hash
    ON public.account_deletion_requests (subject_hash);

-- 3. Erasure receipts table
-- Immutable, anonymized compliance receipt (D6).
-- Contains zero PII: only HMAC-SHA256 of user ID, timestamp, and per-table row counts. Deliberately NO FK.
CREATE TABLE IF NOT EXISTS public.erasure_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_hash TEXT NOT NULL,                             -- HMAC-SHA256 of user_id (no PII)
    counts JSONB NOT NULL DEFAULT '{}'::jsonb,              -- per-table deleted row counts
    erased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erasure_receipts_subject_hash
    ON public.erasure_receipts (subject_hash);

-- 4. Deletion status check helper function (D3 write freeze)
-- Returns true if an active (non-COMPLETE) deletion request exists for the specified user.
CREATE OR REPLACE FUNCTION public.is_deletion_pending(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.account_deletion_requests
        WHERE user_id = p_user_id
          AND state <> 'COMPLETE'::public.account_deletion_state
    );
$$;

-- 5. Row Level Security and permissions
-- Clients get NO direct table access: RLS enabled with NO policies.
-- Only the backend service role reads/writes these tables directly.
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erasure_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON public.account_deletion_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON public.erasure_receipts FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.is_deletion_pending(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_deletion_pending(UUID) TO authenticated, service_role;
