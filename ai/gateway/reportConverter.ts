import { randomUUID } from 'node:crypto';
import type { Result } from '../../contracts/result';
import {
  AIReportDraftSchema,
  ReportBlock,
} from '../../contracts/schemas/reports';
import type { FrameworkEntry } from '../../contracts/schemas/frameworks';
import { frameworkNote } from '../../verification/rules/reportGrounding';

export { frameworkNote };

export interface ConvertDraftContext {
  eligibleFindings: Array<{ id: string; displayId: string }>;
  lookupFindingByDisplayId?: (displayId: string) => { id: string } | null | undefined;
  generateBlockId?: () => string;
}

export type ConvertDraftError = 'SCHEMA' | 'INELIGIBLE_FINDING';

export function convertDraft(
  raw: unknown,
  ctx: ConvertDraftContext,
): Result<ReportBlock[], ConvertDraftError> {
  try {
    const parseResult = AIReportDraftSchema.safeParse(raw);
    if (!parseResult.success) {
      return {
        ok: false,
        reason: 'SCHEMA',
        detail: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      };
    }

    const eligibleMap = new Map<string, string>();
    for (const f of ctx.eligibleFindings) {
      eligibleMap.set(f.displayId, f.id);
    }

    // Check that every finding display ID is in the eligible set
    for (const block of parseResult.data.blocks) {
      if (block.kind === 'assertion') {
        for (const dispId of block.findingDisplayIds) {
          if (!eligibleMap.has(dispId)) {
            return {
              ok: false,
              reason: 'INELIGIBLE_FINDING',
              detail: `Finding ${dispId} is not in the eligible set supplied for this draft`,
            };
          }
        }
      }
    }

    let blockCounter = 1;
    const generateId = ctx.generateBlockId ?? (() => `blk-${blockCounter++}`);

    const converted: ReportBlock[] = [];

    for (const block of parseResult.data.blocks) {
      const id = generateId();
      if (block.kind === 'heading') {
        converted.push({
          kind: 'heading',
          id,
          text: block.text,
        });
      } else if (block.kind === 'assertion') {
        converted.push({
          kind: 'assertion',
          id,
          text: block.text,
          findingIds: block.findingDisplayIds.map((d) => eligibleMap.get(d)!),
          origin: 'AI',
          editedAfterDraft: false,
        });
      }
    }

    return {
      ok: true,
      value: converted,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      reason: 'SCHEMA',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
