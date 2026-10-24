-- =============================================================================
-- Migration: 001_core.sql
-- Stack: Supabase (PostgreSQL 15+)
-- Tier: P0-Core (spec §9.1)
-- Description: Core tables, sequences, display ID generation, and indexes
-- =============================================================================

-- 0. Database sequence for human-readable case display IDs (e.g. 'CASE-101')
CREATE SEQUENCE case_display_seq START 101;

-- 1. Cases table
-- The primary isolation boundary. Cases are archived, never hard-deleted.
-- owner_id references Supabase auth.users with ON DELETE RESTRICT so cases and audit rows are never cascaded away.
CREATE TABLE cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    display_id VARCHAR(32) NOT NULL UNIQUE DEFAULT ('CASE-' || nextval('case_display_seq')::text),
    title TEXT NOT NULL,
    description TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED','CLOSED')),
    evidence_counter INT NOT NULL DEFAULT 100,              -- per-case counter for EV-### display IDs
    finding_counter INT NOT NULL DEFAULT 200,               -- per-case counter for FND-### display IDs
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. AI Consents table
-- Records user consent per case. Active consent exists when revoked_at IS NULL.
CREATE TABLE ai_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    policy_version VARCHAR(32) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    scope JSONB NOT NULL,                                   -- what may be sent, minimization mode
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

-- 3. Evidence Items table (preserved originals)
-- Original evidence bytes are immutable. Deletion is soft delete (deleted_at).
CREATE TABLE evidence_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    display_id VARCHAR(32) NOT NULL,                        -- 'EV-101'
    source_type VARCHAR(16) NOT NULL CHECK (source_type IN ('EMAIL','DOCUMENT','SCREENSHOT','MANUAL_LOG')),
    original_filename TEXT NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    size_bytes BIGINT NOT NULL,
    storage_path TEXT NOT NULL,                             -- cases/{case_id}/evidence/{id}/original
    sha256 CHAR(64) NOT NULL,
    captured_at TIMESTAMPTZ,                                -- creation time in world, if known
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
        CHECK (processing_status IN ('PENDING','PROCESSED','FAILED','QUARANTINED')),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uk_case_evidence UNIQUE (case_id, display_id),
    CONSTRAINT uk_evidence_id_case UNIQUE (id, case_id),    -- target of composite foreign keys
    -- storage path is strictly derived from case_id and id to prevent path traversal or cross-case linking
    CONSTRAINT ck_storage_path CHECK (storage_path = 'cases/' || case_id::text || '/evidence/' || id::text || '/original')
);

-- 4. Evidence Artifacts table (derived representations)
-- Derived representations (text, headers JSON, transcripts) that never mutate the original.
CREATE TABLE evidence_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
    artifact_type VARCHAR(32) NOT NULL CHECK (artifact_type IN ('NORMALIZED_TEXT','METADATA_JSON','TRANSCRIPT')),
    extraction_method VARCHAR(16) NOT NULL CHECK (extraction_method IN ('PARSER','AI_VISION','MANUAL')),
    version INT NOT NULL DEFAULT 1,
    storage_path TEXT,
    raw_content TEXT,
    created_by_process VARCHAR(64) NOT NULL,                -- parser/tool name and version
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_artifact_evidence UNIQUE (id, evidence_id)
);

-- 5. Evidence Segments table (atomic citation targets)
-- Atomic locatable chunks within an artifact.
CREATE TABLE evidence_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
    artifact_id UUID NOT NULL,
    ordinal INT NOT NULL CHECK (ordinal >= 1),              -- 1-based reading order
    locator_type VARCHAR(32) NOT NULL CHECK (locator_type IN ('PAGE','PAGE_PARAGRAPH','CHAR_RANGE','LINE_NUMBER','TIMESTAMP')),
    locator JSONB NOT NULL,                                 -- e.g. {"page":2} or {"start":120,"end":450}
    segment_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- The artifact must belong to the same evidence item
    CONSTRAINT fk_segment_artifact FOREIGN KEY (artifact_id, evidence_id)
        REFERENCES evidence_artifacts (id, evidence_id) ON DELETE CASCADE,
    CONSTRAINT uk_segment_evidence UNIQUE (id, evidence_id)
);

-- 6. Analysis Runs table
-- Groups analysis tasks requested by a user for a case.
CREATE TABLE analysis_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED')),
    requested_by UUID NOT NULL REFERENCES auth.users(id),
    configuration_version VARCHAR(32) NOT NULL DEFAULT '1.0',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 7. Analysis Tasks table
-- Individual provider calls tracked with model, prompt, tokens, latency, and status.
CREATE TABLE analysis_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
    task_type VARCHAR(32) NOT NULL CHECK (task_type IN
        ('extraction','response_analysis','friction_analysis','contradiction_consolidation','report_draft','vision_transcription')),
    status VARCHAR(16) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED')),
    input_evidence_scope JSONB NOT NULL,                    -- display ID, display ID array, or [{evidenceDisplayId, segmentOrdinals}]
    prompt_id VARCHAR(64) NOT NULL,
    prompt_version VARCHAR(32) NOT NULL,
    schema_name VARCHAR(64) NOT NULL,
    schema_version VARCHAR(32) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    model VARCHAR(64) NOT NULL,
    minimization_metadata JSONB NOT NULL,
    raw_output_ref TEXT,                                    -- pointer to raw output, not logged inline
    output_sha256 CHAR(64),
    validated_output JSONB,
    tokens_in INT, tokens_out INT, latency_ms INT,
    retry_count INT NOT NULL DEFAULT 0,
    fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Audit Events table (Plain table for Core; hash chain & immutability triggers in 004)
-- Keeps track of all lifecycle actions and evidence access.
CREATE TABLE audit_events (
    seq BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
    case_seq BIGINT NOT NULL,                               -- per-case sequence counter
    actor_type VARCHAR(16) NOT NULL CHECK (actor_type IN ('USER','SYSTEM','AI_GATEWAY')),
    actor_id TEXT NOT NULL,
    entity_type VARCHAR(32) NOT NULL,
    entity_id TEXT NOT NULL,
    action VARCHAR(64) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL,                                -- IDs, counts, versions (no PII or raw text)
    prev_hash CHAR(64) NOT NULL,
    row_hash CHAR(64) NOT NULL,
    CONSTRAINT uk_audit_case_seq UNIQUE (case_id, case_seq)
);

-- 9. Display ID generation function and triggers
-- Generates EV-### display IDs for evidence (and FND-### for findings in 002).
-- Row-locks the case record to prevent race conditions during concurrent inserts.
CREATE FUNCTION public.assign_display_id() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
  IF TG_TABLE_NAME = 'evidence_items' THEN
    UPDATE cases SET evidence_counter = evidence_counter + 1 WHERE id = NEW.case_id RETURNING evidence_counter INTO n;
    NEW.display_id := 'EV-' || n;
  ELSE
    UPDATE cases SET finding_counter = finding_counter + 1 WHERE id = NEW.case_id RETURNING finding_counter INTO n;
    NEW.display_id := 'FND-' || n;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_evidence_display_id BEFORE INSERT ON evidence_items
  FOR EACH ROW EXECUTE FUNCTION public.assign_display_id();

-- 10. Indexes for Core 1 tables
CREATE INDEX ON ai_consents (case_id) WHERE revoked_at IS NULL;          -- active AI consent lookup
CREATE INDEX ON evidence_items (case_id);
CREATE INDEX ON evidence_artifacts (evidence_id);
CREATE INDEX ON evidence_segments (evidence_id);
CREATE UNIQUE INDEX uk_segment_ordinal ON evidence_segments (artifact_id, ordinal);
CREATE INDEX ON analysis_runs (case_id);
CREATE INDEX ON analysis_tasks (run_id);
CREATE INDEX ON analysis_tasks (created_at) WHERE status = 'QUEUED';     -- worker task polling