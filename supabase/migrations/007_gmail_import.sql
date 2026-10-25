-- =============================================================================
-- Migration: 007_gmail_import.sql
-- Tier: P1-0 (Master Spec v1.4.2 §5.5, §9.1, §15.9)
-- Description: Gmail OAuth connections table and evidence items import fields.
-- =============================================================================

-- 1. Evidence items columns for idempotent external ingestion
ALTER TABLE public.evidence_items
    ADD COLUMN IF NOT EXISTS ingest_source VARCHAR(32) NOT NULL DEFAULT 'UPLOAD'
        CHECK (ingest_source IN ('UPLOAD', 'GMAIL_IMPORT')),
    ADD COLUMN IF NOT EXISTS external_ref VARCHAR(64);

-- Ensure external_ref is VARCHAR(64) if it was previously created as text
ALTER TABLE public.evidence_items
    ALTER COLUMN external_ref TYPE VARCHAR(64);

-- Enforce exact relation: (ingest_source = 'GMAIL_IMPORT') = (external_ref IS NOT NULL) and length <= 64
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_external_ref'
    ) THEN
        ALTER TABLE public.evidence_items
            ADD CONSTRAINT ck_external_ref CHECK (
                (
                    (ingest_source = 'GMAIL_IMPORT' AND external_ref IS NOT NULL)
                    OR
                    (ingest_source = 'UPLOAD' AND external_ref IS NULL)
                )
                AND (external_ref IS NULL OR length(external_ref) <= 64)
            );
    END IF;
END $$;

-- Unique partial index ensuring idempotent Gmail import: importing the same thread/message twice is a no-op
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

-- 3. Replace/update evidence immutability trigger so ingest_source and external_ref cannot change
CREATE OR REPLACE FUNCTION public.evidence_items_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Original evidence metadata cannot be modified once stored
  IF NEW.id                IS DISTINCT FROM OLD.id
  OR NEW.case_id           IS DISTINCT FROM OLD.case_id
  OR NEW.display_id        IS DISTINCT FROM OLD.display_id
  OR NEW.source_type       IS DISTINCT FROM OLD.source_type
  OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
  OR NEW.mime_type         IS DISTINCT FROM OLD.mime_type
  OR NEW.size_bytes        IS DISTINCT FROM OLD.size_bytes
  OR NEW.storage_path      IS DISTINCT FROM OLD.storage_path
  OR NEW.sha256            IS DISTINCT FROM OLD.sha256
  OR NEW.uploaded_at       IS DISTINCT FROM OLD.uploaded_at
  OR NEW.ingest_source     IS DISTINCT FROM OLD.ingest_source
  OR NEW.external_ref      IS DISTINCT FROM OLD.external_ref THEN
    RAISE EXCEPTION 'evidence_items: original-evidence fields are immutable'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- captured_at may be set once during extraction and never changed afterwards
  IF OLD.captured_at IS NOT NULL AND NEW.captured_at IS DISTINCT FROM OLD.captured_at THEN
    RAISE EXCEPTION 'evidence_items: captured_at is already set'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  -- Evidence soft-delete tombstone: once deleted_at is set, it cannot be changed or cleared
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'evidence_items: deleted_at cannot be changed or cleared'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END $$;
