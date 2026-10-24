import type { RequestResponseStatus } from '../contracts/schemas/enums';
import { RequestPayloadSchema } from '../contracts/schemas/payloads';
import {
  evaluateRequestResponse,
  RequestResponseLink,
} from './rules/requestResponse';
import type { FindingView } from './types';

export const LABEL_ANSWERED = 'Answered in the record';
export const LABEL_UNANSWERED = 'No response found in case record';
export const LABEL_PARTIAL = 'Partially answered in the record';
export const LABEL_DEFLECTED = 'Deflected in the record';
export const LABEL_UNCLEAR = 'Unclear in the record';

export interface MatrixRow {
  requestDisplayId: string;
  item: string;
  status: RequestResponseStatus;
  responseDisplayIds: string[];
  chronology: 'OK' | 'CHRONOLOGY_IMPOSSIBLE' | 'DATE_MISSING';
  label: string;
}

const STATUS_RANK: Record<RequestResponseStatus, number> = {
  ANSWERED: 4,
  PARTIAL: 3,
  DEFLECTED: 2,
  UNCLEAR: 1,
  UNANSWERED: 0,
};

const STATUS_TO_LABEL: Record<RequestResponseStatus, string> = {
  ANSWERED: LABEL_ANSWERED,
  PARTIAL: LABEL_PARTIAL,
  DEFLECTED: LABEL_DEFLECTED,
  UNCLEAR: LABEL_UNCLEAR,
  UNANSWERED: LABEL_UNANSWERED,
};

export function buildMatrix(
  requests: FindingView[],
  responses: FindingView[],
  evidenceDates: Map<string, string>,
): MatrixRow[] {
  const { links } = evaluateRequestResponse(requests, responses, evidenceDates);

  // Group links by requestDisplayId
  const linksByRequest = new Map<string, RequestResponseLink[]>();
  for (const link of links) {
    const list = linksByRequest.get(link.requestDisplayId) ?? [];
    list.push(link);
    linksByRequest.set(link.requestDisplayId, list);
  }

  const rows: MatrixRow[] = [];

  for (const req of requests) {
    if (req.findingType !== 'REQUEST') continue;

    const parsed = RequestPayloadSchema.safeParse(req.structuredPayload);
    const item = parsed.success ? parsed.data.item : req.statement;

    const matchedLinks = linksByRequest.get(req.displayId) ?? [];

    if (matchedLinks.length === 0) {
      rows.push({
        requestDisplayId: req.displayId,
        item,
        status: 'UNANSWERED',
        responseDisplayIds: [],
        chronology: 'OK',
        label: LABEL_UNANSWERED,
      });
      continue;
    }

    // Pick best status among all addressing responses
    let bestStatus: RequestResponseStatus = 'UNCLEAR';
    let bestRank = -1;
    for (const link of matchedLinks) {
      const rank = STATUS_RANK[link.status] ?? 0;
      if (rank > bestRank) {
        bestRank = rank;
        bestStatus = link.status;
      }
    }

    // Determine chronology across links: if any link is impossible, flag CHRONOLOGY_IMPOSSIBLE;
    // else if any is missing date, DATE_MISSING; else OK
    let combinedChronology: 'OK' | 'CHRONOLOGY_IMPOSSIBLE' | 'DATE_MISSING' = 'OK';
    if (matchedLinks.some((l) => l.chronology === 'CHRONOLOGY_IMPOSSIBLE')) {
      combinedChronology = 'CHRONOLOGY_IMPOSSIBLE';
    } else if (matchedLinks.some((l) => l.chronology === 'DATE_MISSING')) {
      combinedChronology = 'DATE_MISSING';
    }

    const responseDisplayIds = Array.from(
      new Set(matchedLinks.map((l) => l.responseDisplayId)),
    );

    rows.push({
      requestDisplayId: req.displayId,
      item,
      status: bestStatus,
      responseDisplayIds,
      chronology: combinedChronology,
      label: STATUS_TO_LABEL[bestStatus] ?? LABEL_UNCLEAR,
    });
  }

  return rows;
}
