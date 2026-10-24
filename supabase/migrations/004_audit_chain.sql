-- =============================================================================
-- Migration: 004_audit_chain.sql
-- Stack: Supabase (PostgreSQL 15+)
-- Tier: P0-Hardening (spec §9.3)
-- Description: Audit ledger hash chain, immutability triggers, and
--              verify_audit_chain cryptographic validation function.
-- =============================================================================

-- 1. Deterministic hashing function for audit ledger rows
CREATE FUNCTION public.audit_compute_hash(
  p_prev TEXT,
  p_case UUID,
  p_case_seq BIGINT,
  p_actor_type TEXT,
  p_actor_id TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_action TEXT,
  p_at TIMESTAMPTZ,
  p_meta JSONB
) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(
    p_prev || '|' || p_case::text || '|' || p_case_seq::text || '|' || p_actor_type || '|' || p_actor_id || '|' ||
    p_entity_type || '|' || p_entity_id || '|' || p_action || '|' ||
    to_char(p_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|' || p_meta::text, 'UTF8')), 'hex');
$$;

-- 2. Audit chain trigger
-- Takes a per-case advisory transaction lock first, then reads the current chain head
-- and assigns the gap-free per-case case_seq and hash.
CREATE FUNCTION public.audit_events_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_prev TEXT;
  v_last BIGINT;
BEGIN
  -- Per-case advisory lock ensures serialized chain sequence assignment per case
  PERFORM pg_advisory_xact_lock(hashtext(NEW.case_id::text));

  SELECT row_hash, case_seq INTO v_prev, v_last
    FROM audit_events
    WHERE case_id = NEW.case_id
    ORDER BY case_seq DESC
    LIMIT 1;

  NEW.case_seq  := COALESCE(v_last, 0) + 1;
  NEW.prev_hash := COALESCE(v_prev, repeat('0', 64));
  NEW.row_hash  := public.audit_compute_hash(
    NEW.prev_hash,
    NEW.case_id,
    NEW.case_seq,
    NEW.actor_type,
    NEW.actor_id,
    NEW.entity_type,
    NEW.entity_id,
    NEW.action,
    NEW.occurred_at,
    NEW.metadata
  );

  RETURN NEW;
END $$;

CREATE TRIGGER trg_audit_chain BEFORE INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_chain();

-- 3. Immutability triggers: prevent any UPDATE, DELETE, or TRUNCATE on audit_events
CREATE FUNCTION public.audit_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only' USING ERRCODE = 'integrity_constraint_violation';
END $$;

CREATE TRIGGER trg_audit_no_update BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_immutable();

CREATE TRIGGER trg_audit_no_truncate BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_events_immutable();

-- Revoke mutation privileges even from service_role
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC, anon, authenticated, service_role;

-- 4. Audit chain verification function
-- Scans all audit events for a case to confirm gap-free sequence and matching SHA-256 hashes.
CREATE FUNCTION public.verify_audit_chain(p_case UUID)
RETURNS TABLE (intact BOOLEAN, first_broken_case_seq BIGINT) LANGUAGE plpgsql STABLE AS $$
DECLARE
  r RECORD;
  v_prev TEXT := repeat('0', 64);
  v_expected BIGINT := 0;
BEGIN
  FOR r IN SELECT * FROM audit_events WHERE case_id = p_case ORDER BY case_seq LOOP
    v_expected := v_expected + 1;

    -- A sequence gap means a row was removed
    IF r.case_seq <> v_expected
       OR r.prev_hash <> v_prev
       OR r.row_hash <> public.audit_compute_hash(
            v_prev, r.case_id, r.case_seq, r.actor_type, r.actor_id,
            r.entity_type, r.entity_id, r.action, r.occurred_at, r.metadata) THEN
      RETURN QUERY SELECT FALSE, r.case_seq;
      RETURN;
    END IF;

    v_prev := r.row_hash;
  END LOOP;

  RETURN QUERY SELECT TRUE, NULL::BIGINT;
END $$;

GRANT EXECUTE ON FUNCTION public.verify_audit_chain, public.audit_compute_hash TO authenticated, service_role;