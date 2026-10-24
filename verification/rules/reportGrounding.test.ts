import { describe, it, expect } from 'vitest';
import type { FindingView } from '../types';
import type { CaseReportContent, AssertionBlock, UserNoteBlock, HeadingBlock } from '../../contracts/schemas/reports';
import {
  eligibleFindings,
  qualifierFor,
  validateReport,
  canExport,
  frameworkNote,
  AI_INFERRED_QUALIFIER_TEXT,
} from './reportGrounding';
import { SAMPLE_FRAMEWORKS } from '../../contracts/schemas/frameworks';

function makeFinding(
  id: string,
  displayId: string,
  state: any,
  sourceUnavailable = false,
): FindingView {
  return {
    id,
    caseId: 'case-1',
    displayId,
    findingType: 'CLAIM',
    evidenceBasis: 'DIRECT',
    verificationState: state,
    sourceUnavailable,
    statement: `Statement for ${displayId}`,
    structuredPayload: {},
    citations: [],
  };
}

describe('report_grounding.v1 (Step 12)', () => {
  it('eligibleFindings filters out UNVERIFIED and sourceUnavailable findings', () => {
    const f1 = makeFinding('f1', 'FND-101', 'VERIFIED');
    const f2 = makeFinding('f2', 'FND-102', 'CORROBORATED');
    const f3 = makeFinding('f3', 'FND-103', 'AI_INFERRED');
    const f4 = makeFinding('f4', 'FND-104', 'UNVERIFIED');
    const f5 = makeFinding('f5', 'FND-105', 'VERIFIED', true); // sourceUnavailable

    const eligible = eligibleFindings([f1, f2, f3, f4, f5]);
    expect(eligible.map((f) => f.displayId)).toEqual(['FND-101', 'FND-102', 'FND-103']);
    expect((eligible[0] as any).needsQualifier).toBe(false);
    expect((eligible[2] as any).needsQualifier).toBe(true);
  });

  it('T08: human user_note passes grounding with no findings', () => {
    const noteBlock: UserNoteBlock = {
      kind: 'user_note',
      id: 'blk-note-1',
      text: 'Human author note explaining context.',
      authorId: 'a123e456-e89b-12d3-a456-426614174000',
    };

    const headingBlock: HeadingBlock = {
      kind: 'heading',
      id: 'blk-head-1',
      text: 'Summary',
    };

    const report: CaseReportContent = {
      lens: 'FINDINGS',
      blocks: [headingBlock, noteBlock],
    };

    const res = validateReport(report, []);
    expect(res.status).toBe('VALIDATED');
    expect(res.failingBlockIds).toEqual([]);
    expect(canExport(res)).toBe(true);
  });

  it('Scenario 10: assertion with no findings gives BLOCKED and canExport false', () => {
    const emptyAssertion: AssertionBlock = {
      kind: 'assertion',
      id: 'blk-assert-empty',
      text: 'This assertion has no evidence backing.',
      findingIds: [],
      origin: 'AI',
      editedAfterDraft: false,
    };

    const report: CaseReportContent = {
      lens: 'FINDINGS',
      blocks: [emptyAssertion],
    };

    const res = validateReport(report, []);
    expect(res.status).toBe('BLOCKED');
    expect(res.failingBlockIds).toContain('blk-assert-empty');
    expect(canExport(res)).toBe(false);
  });

  it('assertion citing a quarantined / sourceUnavailable or UNVERIFIED finding fails', () => {
    const validFinding = makeFinding('f-val', 'FND-101', 'VERIFIED');
    const unverifiedFinding = makeFinding('f-unv', 'FND-102', 'UNVERIFIED');
    const quarantinedFinding = makeFinding('f-quar', 'FND-103', 'VERIFIED', true);

    const assertion: AssertionBlock = {
      kind: 'assertion',
      id: 'blk-assert-bad',
      text: 'Assertion citing bad findings.',
      findingIds: ['f-val', 'f-quar'],
      origin: 'AI',
      editedAfterDraft: false,
    };

    const report = {
      lens: 'FINDINGS' as const,
      blocks: [assertion],
    };

    const res = validateReport(report, [validFinding, unverifiedFinding, quarantinedFinding]);
    expect(res.status).toBe('BLOCKED');
    expect(res.failingBlockIds).toContain('blk-assert-bad');
  });

  it('edited assertions are counted and flagged but still validate', () => {
    const validFinding = makeFinding('f1', 'FND-101', 'VERIFIED');

    const editedAssertion: AssertionBlock = {
      kind: 'assertion',
      id: 'blk-assert-edited',
      text: 'Edited by user but properly backed.',
      findingIds: ['f1'],
      origin: 'USER',
      editedAfterDraft: true,
    };

    const report = {
      lens: 'FINDINGS' as const,
      blocks: [editedAssertion],
    };

    const res = validateReport(report, [validFinding]);
    expect(res.status).toBe('VALIDATED');
    expect(res.editedAssertionCount).toBe(1);
    expect(canExport(res)).toBe(true);
  });

  it('qualifier text appears when any cited finding is AI_INFERRED and not when all are VERIFIED', () => {
    const fVer = makeFinding('f1', 'FND-101', 'VERIFIED');
    const fInf = makeFinding('f2', 'FND-102', 'AI_INFERRED');

    const assertVer: AssertionBlock = {
      kind: 'assertion',
      id: 'b1',
      text: 'Verified statement',
      findingIds: ['f1'],
      origin: 'AI',
      editedAfterDraft: false,
    };

    const assertInf: AssertionBlock = {
      kind: 'assertion',
      id: 'b2',
      text: 'Inferred statement',
      findingIds: ['f1', 'f2'],
      origin: 'AI',
      editedAfterDraft: false,
    };

    const findings = [fVer, fInf];

    expect(qualifierFor(assertVer, findings)).toBeNull();
    expect(qualifierFor(assertInf, findings)).toBe(AI_INFERRED_QUALIFIER_TEXT);
  });

  it('frameworkNote returns "deadline not confirmed" for unreviewed frameworks', () => {
    const [reviewed, unreviewed] = SAMPLE_FRAMEWORKS;
    expect(frameworkNote(unreviewed)).toBe('deadline not confirmed');
    expect(frameworkNote(undefined)).toBe('deadline not confirmed');
    expect(frameworkNote(reviewed)).toContain('30 days');
  });
});
