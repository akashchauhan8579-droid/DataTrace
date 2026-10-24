-- =============================================================================
-- Migration: 005_invariants.sql
-- Stack: Supabase (PostgreSQL 15+)
-- Tier: P0-Hardening (spec §9.1.1)
-- Description: Database-enforced invariants that apply even to service_role:
--              1. Original evidence immutability and tombstone protection.
--              2. Deterministic findings verification state transition guard.
-- Spec reference: Section 9.1.1 (Database-enforced invariants)
-- =============================================================================

-- 1. Evidence items immutability trigger function
-- Protects original evidence bytes and metadata from tampering or clearing.
CREATE FUNCTION public.evidence_items_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
  OR NEW.uploaded_at       IS DISTINCT FROM OLD.uploaded_at THEN
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

CREATE TRIGGER trg_evidence_immutable BEFORE UPDATE ON evidence_items
  FOR EACH ROW EXECUTE FUNCTION public.evidence_items_guard();

-- 2. Findings state guard trigger function
-- Guarantees that VERIFIED and CONTRADICTED states are reachable ONLY via a verified PASS
-- row in verification_results created in the same transaction.
CREATE FUNCTION public.findings_state_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ok BOOLEAN;
BEGIN
  -- Rejects direct INSERT into VERIFIED or CONTRADICTED state
  IF TG_OP = 'INSERT' THEN
    IF NEW.verification_state IN ('VERIFIED','CONTRADICTED') THEN
      RAISE EXCEPTION 'findings are inserted as UNVERIFIED; % is reachable only through the verification engine', NEW.verification_state
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- On UPDATE into VERIFIED or CONTRADICTED, require an exact rule PASS in the same transaction
  IF NEW.verification_state IN ('VERIFIED','CONTRADICTED')
     AND NEW.verification_state IS DISTINCT FROM OLD.verification_state THEN
    SELECT EXISTS (
      SELECT 1 FROM verification_results vr
      WHERE vr.finding_id      = NEW.id
        AND vr.outcome         = 'PASS'
        AND vr.previous_state  = OLD.verification_state
        AND vr.resulting_state = NEW.verification_state
        AND vr.performed_at    = transaction_timestamp()      -- written in the exact same transaction
        AND (
          (NEW.verification_state = 'VERIFIED' AND vr.rule_id IN (
            'claim_verification.v1',
            'relationship_taxonomy.v1',
            'event_consistency.v1',
            'request_response.v1',
            'friction_validation.v1'
          ))
          OR
          (NEW.verification_state = 'CONTRADICTED' AND vr.rule_id = 'contradiction_support.v1')
        )
    ) INTO v_ok;

    IF NOT v_ok THEN
      RAISE EXCEPTION 'findings.verification_state % requires a PASS verification_results row from an allowed rule in this transaction',
        NEW.verification_state USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_findings_state_guard BEFORE INSERT OR UPDATE OF verification_state ON findings
  FOR EACH ROW EXECUTE FUNCTION public.findings_state_guard();