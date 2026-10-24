import { isDeepStrictEqual } from 'node:util';
import type { Result } from '../../contracts/result';
import { CandidateCitationSchema } from '../../contracts/schemas/citations';
import { parseCandidate } from '../../contracts/schemas/findings';
import type { CandidateFinding } from '../../contracts/schemas/findings';
import { LocatorSchema } from '../../contracts/schemas/locators';
import { FindingDisplayIdSchema } from '../../contracts/schemas/payloads';
import { scopeKey } from './scope';
import type { ScopeMap } from './scope';

export type RejectReason =
  | 'MALFORMED'
  | 'OUT_OF_SCOPE'
  | 'BAD_REFERENCE'
  | 'LOCATOR_MISMATCH'
  | 'NO_VALID_CITATION'
  | 'SCHEMA'
  | 'UNKNOWN_TYPE';

export interface ResolverStore {
  getEvidence(evidenceId: string): {
    id: string;
    caseId: string;
    status: 'PROCESSED' | 'QUARANTINED' | 'DELETED' | 'PENDING';
    deletedAt: string | null;
  } | null;
  getSegment(segmentId: string): {
    id: string;
    evidenceId: string;
    locatorType: string;
    locator: Record<string, unknown>;
  } | null;
  getFinding(caseId: string, displayId: string): { id: string; findingType: string } | null;
}

export interface ResolveContext {
  caseId: string;
  scopeMap: ScopeMap;
  store: ResolverStore;
  detokenize?: (s: string) => string;
}

export interface ResolvedCitation {
  evidenceId: string;
  segmentId: string;
  evidenceDisplayId: string;
  segmentOrdinal: number;
  locatorType: string;
  locator: Record<string, unknown>; // the STORED locator, never the model's copy
  quotedText: string | null; // de-tokenized
  validationStatus: 'PENDING';
}

export interface ResolvedCandidate {
  candidate: CandidateFinding;
  citations: ResolvedCitation[];
}

export interface ResolveResult {
  accepted: ResolvedCandidate[];
  rejected: Array<{ index: number; reason: RejectReason; detail?: string }>;
  droppedCitations: Array<{ candidateIndex: number; citationIndex: number; reason: RejectReason }>;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const fail = (reason: RejectReason, detail?: string): Result<never, RejectReason> =>
  detail === undefined ? { ok: false, reason } : { ok: false, reason, detail };

/**
 * Resolves one model citation (display ID + ordinal) to database IDs.
 * Five checks in order (spec 11.8); the first failure returns its reason. Never throws on bad input.
 */
export function resolveCitation(raw: unknown, ctx: ResolveContext): Result<ResolvedCitation, RejectReason> {
  // 1. shape
  const parsed = CandidateCitationSchema.safeParse(raw);
  if (!parsed.success) {
    // Only paths and issue codes, never model-supplied text, in the detail.
    const detail = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.code}`)
      .join('; ');
    return fail('MALFORMED', detail);
  }
  const c = parsed.data;

  // 2. inside this task's scope
  const entry = ctx.scopeMap.get(scopeKey(c.evidenceDisplayId, c.segmentOrdinal));
  if (!entry) return fail('OUT_OF_SCOPE');

  // 3. reload rows and confirm case, status and ownership
  const evidence = ctx.store.getEvidence(entry.evidenceId);
  if (!evidence) return fail('BAD_REFERENCE', 'evidence not found');
  if (evidence.caseId !== ctx.caseId) return fail('BAD_REFERENCE', 'evidence belongs to another case');
  if (evidence.status !== 'PROCESSED') return fail('BAD_REFERENCE', 'evidence is not PROCESSED');
  if (evidence.deletedAt !== null) return fail('BAD_REFERENCE', 'evidence is deleted');
  const segment = ctx.store.getSegment(entry.segmentId);
  if (!segment) return fail('BAD_REFERENCE', 'segment not found');
  if (segment.evidenceId !== evidence.id) return fail('BAD_REFERENCE', 'segment belongs to another evidence item');

  // 4. locator must be valid and deep-equal the stored one
  const locatorOk = LocatorSchema.safeParse({ locatorType: c.locatorType, locator: c.locator }).success;
  if (!locatorOk || c.locatorType !== segment.locatorType || !isDeepStrictEqual(c.locator, segment.locator)) {
    return fail('LOCATOR_MISMATCH');
  }

  // 5. build the persisted shape: stored locator, de-tokenized quote, PENDING
  const quotedText =
    c.quotedText === undefined ? null : ctx.detokenize ? ctx.detokenize(c.quotedText) : c.quotedText;
  return {
    ok: true,
    value: {
      evidenceId: evidence.id,
      segmentId: segment.id,
      evidenceDisplayId: c.evidenceDisplayId,
      segmentOrdinal: c.segmentOrdinal,
      locatorType: segment.locatorType,
      locator: { ...segment.locator },
      quotedText,
      validationStatus: 'PENDING',
    },
  };
}

interface RefUse {
  field: string;
  value: unknown;
  needClaim: boolean;
}

interface Staged {
  index: number;
  candidate: CandidateFinding;
  localRef: string | undefined;
  findingType: string;
  refs: RefUse[];
  citations: ResolvedCitation[];
}

interface LocalReferenceCounts {
  total: number;
  claims: number;
}

type LocalReferenceIndex = Map<string, LocalReferenceCounts>;

function indexLocalReferences(candidates: Staged[]): LocalReferenceIndex {
  const index: LocalReferenceIndex = new Map();
  for (const candidate of candidates) {
    if (!candidate.localRef) continue;
    const counts = index.get(candidate.localRef) ?? { total: 0, claims: 0 };
    counts.total += 1;
    if (candidate.findingType === 'CLAIM') counts.claims += 1;
    index.set(candidate.localRef, counts);
  }
  return index;
}

function collectRefUses(payload: unknown): RefUse[] {
  if (!isObj(payload)) return [];
  const uses: RefUse[] = [];
  const single = (field: string, needClaim: boolean): void => {
    if (payload[field] !== undefined) uses.push({ field, value: payload[field], needClaim });
  };
  const list = (field: string): void => {
    const v = payload[field];
    if (v === undefined) return;
    if (Array.isArray(v)) v.forEach((item) => uses.push({ field, value: item, needClaim: false }));
    else uses.push({ field, value: v, needClaim: false });
  };
  single('fromRef', false); // relationship
  single('toRef', false);
  list('addresses'); // response
  list('relatedRefs'); // friction
  single('claimARef', true); // contradiction: both sides must be CLAIM findings
  single('claimBRef', true);
  return uses;
}

function refResolves(
  use: RefUse,
  candidate: Staged,
  localReferences: LocalReferenceIndex,
  ctx: ResolveContext,
): boolean {
  const ref = use.value;
  if (typeof ref !== 'string' || ref.length === 0) return false;
  if (FindingDisplayIdSchema.safeParse(ref).success) {
    const found = ctx.store.getFinding(ctx.caseId, ref);
    return found !== null && (!use.needClaim || found.findingType === 'CLAIM');
  }

  // Batch-local refs must belong to another live candidate. Subtract self so
  // duplicate refs retain the same behavior as the former live.some check.
  const counts = localReferences.get(ref);
  if (!counts) return false;

  const isSelf = candidate.localRef === ref;
  if (use.needClaim) {
    const otherClaims = counts.claims - (isSelf && candidate.findingType === 'CLAIM' ? 1 : 0);
    return otherClaims > 0;
  }

  return counts.total - (isSelf ? 1 : 0) > 0;
}

/**
 * Resolves a whole batch of raw model candidates. Never throws.
 * Refs are checked but NOT rewritten (that happens at persistence).
 */
export function resolveCandidates(rawCandidates: unknown[], ctx: ResolveContext): ResolveResult {
  const rejected: ResolveResult['rejected'] = [];
  const droppedCitations: ResolveResult['droppedCitations'] = [];
  const staged: Staged[] = [];
  const input: unknown[] = Array.isArray(rawCandidates) ? rawCandidates : [];

  input.forEach((raw, index) => {
    const parsed = parseCandidate(raw);
    if (!parsed.ok) {
      rejected.push(
        parsed.detail === undefined
          ? { index, reason: parsed.reason }
          : { index, reason: parsed.reason, detail: parsed.detail },
      );
      return;
    }

    const cand = parsed.value;
    const citations: ResolvedCitation[] = [];
    cand.citations.forEach((rc, citationIndex) => {
      const r = resolveCitation(rc, ctx);
      if (r.ok) citations.push(r.value);
      else droppedCitations.push({ candidateIndex: index, citationIndex, reason: r.reason });
    });
    if (citations.length === 0) {
      rejected.push({ index, reason: 'NO_VALID_CITATION' });
      return;
    }

    // Every model EVENT gets dateSource = 'TEXT' (new object, input is not mutated).
    const candidate: CandidateFinding =
      cand.findingType === 'EVENT'
        ? { ...cand, structuredPayload: { ...cand.structuredPayload, dateSource: 'TEXT' as const } }
        : parsed.value;

    staged.push({
      index,
      candidate,
      localRef: cand.ref,
      findingType: cand.findingType,
      refs: collectRefUses(cand.structuredPayload),
      citations,
    });
  });

  // Reference check. A candidate rejected here can itself be the target of another
  // candidate's local ref, so repeat until nothing more is rejected.
  let live = staged;
  for (;;) {
    const current = live;
    const localReferences = indexLocalReferences(current);
    const failing: Array<{ s: Staged; field: string }> = [];
    for (const s of current) {
      const bad = s.refs.find((u) => !refResolves(u, s, localReferences, ctx));
      if (bad) failing.push({ s, field: bad.field });
    }
    if (failing.length === 0) break;
    for (const f of failing) {
      rejected.push({ index: f.s.index, reason: 'BAD_REFERENCE', detail: `unresolved reference in ${f.field}` });
    }
    const failedIndexes = new Set(failing.map((f) => f.s.index));
    live = current.filter((s) => !failedIndexes.has(s.index));
  }

  rejected.sort((a, b) => a.index - b.index);
  return {
    accepted: live.map((s) => ({ candidate: s.candidate, citations: s.citations })),
    rejected,
    droppedCitations,
  };
}