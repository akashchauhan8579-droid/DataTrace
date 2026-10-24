import type { FrameworkEntry } from '../../contracts/schemas/frameworks';
import type { ReportBlock, CaseReportContent, AssertionBlock } from '../../contracts/schemas/reports';
import type { FindingView } from '../types';

export const AI_INFERRED_QUALIFIER_TEXT =
  'Based on algorithmic analysis of the cited correspondence...';

export function eligibleFindings(findings: FindingView[]): FindingView[] {
  return findings
    .filter((f) => {
      if (f.sourceUnavailable) return false;
      if (f.verificationState === 'UNVERIFIED') return false;
      return (
        f.verificationState === 'VERIFIED' ||
        f.verificationState === 'CORROBORATED' ||
        f.verificationState === 'AI_INFERRED'
      );
    })
    .map((f) => {
      const copy = { ...f };
      (copy as any).needsQualifier = f.verificationState === 'AI_INFERRED';
      return copy;
    });
}

export function qualifierFor(
  block: ReportBlock | { kind: string; findingIds?: string[] },
  findings: FindingView[] | Map<string, FindingView>,
): string | null {
  if (block.kind !== 'assertion') {
    return null;
  }

  const findingIds = (block as { findingIds?: string[] }).findingIds ?? [];
  if (findingIds.length === 0) {
    return null;
  }

  const findingMap =
    findings instanceof Map
      ? findings
      : new Map(findings.map((f) => [f.id, f]));

  let hasAiInferred = false;
  for (const id of findingIds) {
    const f = findingMap.get(id);
    if (f && f.verificationState === 'AI_INFERRED') {
      hasAiInferred = true;
      break;
    }
  }

  return hasAiInferred ? AI_INFERRED_QUALIFIER_TEXT : null;
}

export interface ReportValidationResult {
  status: 'VALIDATED' | 'BLOCKED';
  failingBlockIds: string[];
  editedAssertionCount: number;
}

export function validateReport(
  report: CaseReportContent | { blocks: ReportBlock[] },
  findings: FindingView[] | Map<string, FindingView>,
): ReportValidationResult {
  const eligible =
    findings instanceof Map
      ? Array.from(findings.values())
      : findings;

  const eligibleMap = new Map<string, FindingView>();
  for (const f of eligibleFindings(eligible)) {
    eligibleMap.set(f.id, f);
    if (f.displayId) {
      eligibleMap.set(f.displayId, f);
    }
  }

  const failingBlockIds: string[] = [];
  let editedAssertionCount = 0;

  for (const block of report.blocks) {
    // Structural headings pass grounding without findings
    if (block.kind === 'heading') {
      continue;
    }

    // Human user_note passes grounding with no findings
    if (block.kind === 'user_note') {
      continue;
    }

    if (block.kind === 'assertion') {
      const assertion = block as AssertionBlock;
      if (assertion.editedAfterDraft) {
        editedAssertionCount++;
      }

      if (!assertion.findingIds || assertion.findingIds.length === 0) {
        failingBlockIds.push(assertion.id);
        continue;
      }

      let assertionValid = true;
      for (const fId of assertion.findingIds) {
        const f = eligibleMap.get(fId);
        if (!f || f.sourceUnavailable || f.verificationState === 'UNVERIFIED') {
          assertionValid = false;
          break;
        }
      }

      if (!assertionValid) {
        failingBlockIds.push(assertion.id);
      }
    }
  }

  const status = failingBlockIds.length === 0 ? 'VALIDATED' : 'BLOCKED';
  return {
    status,
    failingBlockIds,
    editedAssertionCount,
  };
}

export function canExport(validation: ReportValidationResult | { status: 'VALIDATED' | 'BLOCKED' }): boolean {
  return validation.status === 'VALIDATED';
}

export function frameworkNote(
  framework?: FrameworkEntry | { humanReviewed: boolean; deadlineDays?: number } | null,
): string {
  if (!framework || !framework.humanReviewed) {
    return 'deadline not confirmed';
  }
  return framework.deadlineDays !== undefined ? `${framework.deadlineDays} days` : '';
}
