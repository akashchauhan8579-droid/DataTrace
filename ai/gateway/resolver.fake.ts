import { randomUUID } from 'node:crypto';
import type { ResolverStore } from './resolver';

type EvidenceRow = NonNullable<ReturnType<ResolverStore['getEvidence']>>;
type SegmentRow = NonNullable<ReturnType<ResolverStore['getSegment']>>;
type FindingRow = NonNullable<ReturnType<ResolverStore['getFinding']>>;

export interface FakeResolverStore extends ResolverStore {
  addEvidence(input: {
    id?: string;
    caseId: string;
    status?: EvidenceRow['status'];
    deletedAt?: string | null;
  }): EvidenceRow;
  addSegment(input: {
    id?: string;
    evidenceId: string;
    locatorType: string;
    locator: Record<string, unknown>;
  }): SegmentRow;
  addFinding(input: { id?: string; caseId: string; displayId: string; findingType: string }): FindingRow;
}

export function createFakeResolverStore(): FakeResolverStore {
  const evidence = new Map<string, EvidenceRow>();
  const segments = new Map<string, SegmentRow>();
  const findings = new Map<string, FindingRow>();
  const findingKey = (caseId: string, displayId: string): string => `${caseId}|${displayId}`;

  return {
    addEvidence(input) {
      const row: EvidenceRow = {
        id: input.id ?? randomUUID(),
        caseId: input.caseId,
        status: input.status ?? 'PROCESSED',
        deletedAt: input.deletedAt ?? null,
      };
      evidence.set(row.id, row);
      return { ...row };
    },
    addSegment(input) {
      const row: SegmentRow = {
        id: input.id ?? randomUUID(),
        evidenceId: input.evidenceId,
        locatorType: input.locatorType,
        locator: { ...input.locator },
      };
      segments.set(row.id, row);
      return { ...row, locator: { ...row.locator } };
    },
    addFinding(input) {
      const row: FindingRow = { id: input.id ?? randomUUID(), findingType: input.findingType };
      findings.set(findingKey(input.caseId, input.displayId), row);
      return { ...row };
    },
    getEvidence(evidenceId) {
      const row = evidence.get(evidenceId);
      return row ? { ...row } : null;
    },
    getSegment(segmentId) {
      const row = segments.get(segmentId);
      return row ? { ...row, locator: { ...row.locator } } : null;
    },
    getFinding(caseId, displayId) {
      const row = findings.get(findingKey(caseId, displayId));
      return row ? { ...row } : null;
    },
  };
}