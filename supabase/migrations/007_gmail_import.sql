-- =============================================================================
-- Migration: 007_gmail_import.sql
-- Tier: P1-0 (Master Spec v1.4.2 §5.5, §9.1, §15.9)
-- Description: Gmail OAuth connections table and evidence items import fields.
-- =============================================================================

-- 1. Evidence items columns for idempotent external ingestion
ALTER TABLE public.evidence_items
    ADD COLUMN IF NOT EXISTS ingest_source VARCHAR(32) NOT NULL DEFAULT 'UPLOAD'
        CHECK (ingest_source IN ('UPLOAD', 'GMAIL_IMPORT')),
    ADD COLUMN IF NOT EXISTS external_ref TEXT;

-- Enforce that GMAIL_IMPORT items must carry external_ref, while UPLOAD items must not
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_external_ref'
    ) THEN
        ALTER TABLE public.evidence_items
            ADD CONSTRAINT ck_external_ref CHECK (
                (ingest_source = 'GMAIL_IMPORT' AND external_ref IS NOT NULL)
                OR
                (ingest_source <> 'GMAIL_IMPORT' AND external_ref IS NULL)
            );
    END IF;
END $$;

-- Unique index ensuring idempotent Gmail import: importing the same thread/message twice is a no-op
CREATE UNIQUE INDEX IF NOT EXISTS uk_evidence_external_ref
    ON public.evidence_items (case_id, external_ref)
    WHERE external_ref IS NOT NULL;

-- 2. Gmail connections table
-- One row per user, holding encrypted credentials.
-- Clients get NO access at all: no grant, RLS enabled, no policy. Not even the owner can SELECT it.
-- Only the backend service-role client reads or writes it.
CREATE TABLE IF NOT EXISTS public.gmail_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    google_email TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope = 'https://www.googleapis.com/auth/gmail.readonly'),
    refresh_token_enc TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED')),
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

ALTER TABLE public.gmail_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gmail_connections FROM anon, authenticated;
