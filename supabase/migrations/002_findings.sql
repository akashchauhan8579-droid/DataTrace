-- =============================================================================
-- Migration: 002_findings.sql
-- Stack: Supabase (PostgreSQL 15+)
-- Tier: P0-Core (spec §9.1)
-- Description: Findings, citations, relationships, request-response links,
--              verification results, case reports, display ID triggers,
--              composite foreign keys, and indexes.
-- =============================================================================

-- 1. Findings table (unified record for claims, entities, events, etc.)
CREATE TABLE findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    display_id VARCHAR(32) NOT NULL,                        -- 'FND-201'
    finding_type VARCHAR(32) NOT NULL CHECK (finding_type IN
        ('CLAIM','ENTITY','EVENT','RELATIONSHIP','REQUEST','RESPONSE','FRICTION_SIGNAL','CONTRADICTION','DATA_CATEGORY')),
    statement TEXT NOT NULL,
    structured_payload JSONB NOT NULL,
    evidence_basis VARCHAR(16) NOT NULL CHECK (evidence_basis IN ('DIRECT','OBSERVED','INFERRED','CONFLICTING')),
    verification_state VARCHAR(16) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (verification_state IN ('UNVERIFIED','AI_INFERRED','CORROBORATED','VERIFIED','CONTRADICTED')),
    candidate_confidence NUMERIC(4,3) CHECK (candidate_confidence BETWEEN 0 AND 1),   -- model's own number; never proof
    source_task_id UUID REFERENCES analysis_tasks(id),
    supersedes_id UUID REFERENCES findings(id),
    human_confirmed_by UUID REFERENCES auth.users(id),
    human_confirmed_at TIMESTAMPTZ,
    source_unavailable BOOLEAN NOT NULL DEFAULT FALSE,      -- TRUE when a cited evidence item is soft-deleted or QUARANTINED
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_case_finding UNIQUE (case_id, display_id),
    CONSTRAINT uk_finding_id_case UNIQUE (id, case_id),     -- target of composite foreign keys (case boundary)
    -- model-derived or conflicting findings can never be VERIFIED
    CONSTRAINT ck_verified_basis CHECK (verification_state <> 'VERIFIED' OR evidence_basis IN ('DIRECT','OBSERVED')),
    -- only a CONTRADICTION finding can hold the CONTRADICTED state
    CONSTRAINT ck_contradicted_type CHECK (verification_state <> 'CONTRADICTED' OR finding_type = 'CONTRADICTION'),
    -- a finding whose source is gone can only be UNVERIFIED
    CONSTRAINT ck_source_unavailable CHECK (NOT source_unavailable OR verification_state = 'UNVERIFIED'),
    -- a CLAIM must carry a complete normalized claim (mirrors ClaimPayloadSchema)
    CONSTRAINT ck_claim_payload CHECK (finding_type <> 'CLAIM' OR COALESCE(
        (structured_payload #>> '{normalizedClaim,subject}')   IS NOT NULL
        AND (structured_payload #>> '{normalizedClaim,predicate}') IS NOT NULL
        AND (structured_payload #>> '{normalizedClaim,object}')    IS NOT NULL
        AND (structured_payload #>> '{normalizedClaim,polarity}') IN ('AFFIRMS','DENIES'), FALSE))
);

-- Trigger to automatically assign human-readable FND-### display IDs
CREATE TRIGGER trg_finding_display_id BEFORE INSERT ON findings
  FOR EACH ROW EXECUTE FUNCTION public.assign_display_id();

-- 2. Citations table
CREATE TABLE citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    finding_id UUID NOT NULL,
    evidence_id UUID NOT NULL,
    segment_id UUID,
    locator_type VARCHAR(32) NOT NULL CHECK (locator_type IN ('PAGE','PAGE_PARAGRAPH','CHAR_RANGE','LINE_NUMBER','TIMESTAMP')),
    locator JSONB NOT NULL,
    quoted_text TEXT,
    validation_status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (validation_status IN ('PENDING','VALID','INVALID')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Case boundary enforced by database: finding and evidence item must belong to citations.case_id
    CONSTRAINT fk_citation_finding  FOREIGN KEY (finding_id,  case_id) REFERENCES findings (id, case_id)       ON DELETE CASCADE,
    CONSTRAINT fk_citation_evidence FOREIGN KEY (evidence_id, case_id) REFERENCES evidence_items (id, case_id) ON DELETE CASCADE,
    -- The segment must belong to the cited evidence item.
    -- Column-list form of SET NULL requires PostgreSQL 15 or later.
    CONSTRAINT fk_citation_segment  FOREIGN KEY (segment_id, evidence_id) REFERENCES evidence_segments (id, evidence_id)
        ON DELETE SET NULL (segment_id)
);

-- 3. Relationships table (graph edges; controlled taxonomy)
CREATE TABLE relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    from_finding_id UUID NOT NULL,
    to_finding_id UUID NOT NULL,
    relationship_type VARCHAR(32) NOT NULL CHECK (relationship_type IN
        ('SENT_TO','SENT_BY','REQUESTED_FROM','RESPONDED_TO','ABOUT','RELATES_TO',
         'PROCESSES','CONTAINS','CONTRADICTS','FOLLOWED_BY','ASSOCIATED_WITH')),
    evidence_basis VARCHAR(16) NOT NULL CHECK (evidence_basis IN ('DIRECT','OBSERVED','INFERRED','CONFLICTING')),
    verification_state VARCHAR(16) NOT NULL DEFAULT 'UNVERIFIED'
        CHECK (verification_state IN ('UNVERIFIED','AI_INFERRED','CORROBORATED','VERIFIED','CONTRADICTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Both endpoints must belong to this relationship's case
    CONSTRAINT fk_rel_from FOREIGN KEY (from_finding_id, case_id) REFERENCES findings (id, case_id) ON DELETE CASCADE,
    CONSTRAINT fk_rel_to   FOREIGN KEY (to_finding_id,   case_id) REFERENCES findings (id, case_id) ON DELETE CASCADE
);

-- 4. Request-response links table (matrix rows)
CREATE TABLE request_response_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    request_finding_id UUID NOT NULL,
    response_finding_id UUID,
    status VARCHAR(16) NOT NULL CHECK (status IN ('ANSWERED','PARTIAL','UNANSWERED','DEFLECTED','UNCLEAR')),
    rationale TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Both findings must belong to this link's case (response may be NULL for UNANSWERED)
    CONSTRAINT fk_rrl_request  FOREIGN KEY (request_finding_id,  case_id) REFERENCES findings (id, case_id) ON DELETE CASCADE,
    CONSTRAINT fk_rrl_response FOREIGN KEY (response_finding_id, case_id) REFERENCES findings (id, case_id) ON DELETE CASCADE
);

-- 5. Verification results table (rule evaluation ledger)
CREATE TABLE verification_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    finding_id UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
    rule_id VARCHAR(64) NOT NULL,                           -- e.g. 'claim_verification.v1'
    input_snapshot JSONB NOT NULL,
    outcome VARCHAR(16) NOT NULL CHECK (outcome IN ('PASS','FAIL','INCONCLUSIVE')),
    previous_state VARCHAR(16) NOT NULL,
    resulting_state VARCHAR(16) NOT NULL,
    details JSONB,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Case reports table
CREATE TABLE case_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    report_version INT NOT NULL DEFAULT 1,
    active_lens VARCHAR(16) NOT NULL DEFAULT 'EVIDENCE' CHECK (active_lens IN ('EVIDENCE','FINDINGS','COMPLAINT')),
    status VARCHAR(16) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','VALIDATED','EXPORTED')),
    content JSONB NOT NULL,
    validation_status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (validation_status IN ('PENDING','PASSED','FAILED')),
    validation_details JSONB,
    generated_from_run_id UUID REFERENCES analysis_runs(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Indexes for findings and derived tables
CREATE INDEX ON findings (case_id, finding_type, verification_state);
CREATE INDEX ON citations (finding_id);
CREATE INDEX ON citations (case_id);
CREATE INDEX ON citations (evidence_id);                     -- find findings affected by deleted/quarantined item
CREATE INDEX ON relationships (case_id);
CREATE INDEX ON request_response_links (case_id);
CREATE INDEX ON verification_results (finding_id);
CREATE INDEX ON case_reports (case_id);