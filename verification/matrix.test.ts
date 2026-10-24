import { describe, it, expect } from 'vitest';
import {
  buildMatrix,
  LABEL_ANSWERED,
  LABEL_UNANSWERED,
  LABEL_PARTIAL,
  LABEL_DEFLECTED,
  LABEL_UNCLEAR,
} from './matrix';
import { evaluateRequestResponse } from './rules/requestResponse';
import type { FindingView } from './types';

describe('request-response matrix & rule', () => {
  const caseId = 'case-001';

  function createRequestFinding(
    id: string,
    displayId: string,
    item: string,
    evidenceId: string,
  ): FindingView {
    return {
      id,
      caseId,
      displayId,
      findingType: 'REQUEST',
      evidenceBasis: 'DIRECT',
      verificationState: 'VERIFIED',
      sourceUnavailable: false,
      statement: `Request for ${item}`,
      structuredPayload: { item, requestType: 'ACCESS' },
      citations: [
        {
          id: `cit-${id}`,
          evidenceId,
          segmentId: `seg-${id}`,
          quotedText: item,
          locatorType: 'PAGE',
          locator: { page: 1 },
          validationStatus: 'VALID',
        },
      ],
    };
  }

  function createResponseFinding(
    id: string,
    displayId: string,
    addresses: string[],
    coverage: 'FULL' | 'PARTIAL' | 'DEFLECTED' | 'UNCLEAR',
    evidenceId: string,
  ): FindingView {
    return {
      id,
      caseId,
      displayId,
      findingType: 'RESPONSE',
      evidenceBasis: 'DIRECT',
      verificationState: 'VERIFIED',
      sourceUnavailable: false,
      statement: `Response addressing ${addresses.join(', ')}`,
      structuredPayload: { addresses, coverage },
      citations: [
        {
          id: `cit-${id}`,
          evidenceId,
          segmentId: `seg-${id}`,
          quotedText: 'response text',
          locatorType: 'PAGE',
          locator: { page: 1 },
          validationStatus: 'VALID',
        },
      ],
    };
  }

  it('Scenario 1: every request is ANSWERED when coverage is FULL and response is dated strictly after', () => {
    const req1 = createRequestFinding('r1', 'FND-101', 'Delete account', 'ev-1');
    const req2 = createRequestFinding('r2', 'FND-102', 'Export telemetry', 'ev-1');

    const res1 = createResponseFinding('s1', 'FND-201', ['FND-101'], 'FULL', 'ev-2');
    const res2 = createResponseFinding('s2', 'FND-202', ['FND-102'], 'FULL', 'ev-3');

    const dates = new Map([
      ['ev-1', '2026-03-01T10:00:00Z'],
      ['ev-2', '2026-03-05T12:00:00Z'],
      ['ev-3', '2026-03-06T14:00:00Z'],
    ]);

    const matrix = buildMatrix([req1, req2], [res1, res2], dates);
    expect(matrix).toHaveLength(2);
    expect(matrix[0].status).toBe('ANSWERED');
    expect(matrix[0].label).toBe(LABEL_ANSWERED);
    expect(matrix[0].chronology).toBe('OK');
    expect(matrix[1].status).toBe('ANSWERED');
    expect(matrix[1].label).toBe(LABEL_ANSWERED);
    expect(matrix[1].chronology).toBe('OK');
  });

  it('Scenario 2: PARTIAL and DEFLECTED map correctly; generic response leaves unaddressed items UNANSWERED', () => {
    const req1 = createRequestFinding('r1', 'FND-101', 'Email deletion', 'ev-1');
    const req2 = createRequestFinding('r2', 'FND-102', 'Call logs deletion', 'ev-1');
    const req3 = createRequestFinding('r3', 'FND-103', 'Billing data access', 'ev-1');

    const res1 = createResponseFinding('s1', 'FND-201', ['FND-101'], 'PARTIAL', 'ev-2');
    const res2 = createResponseFinding('s2', 'FND-202', ['FND-102'], 'DEFLECTED', 'ev-2');

    const dates = new Map([
      ['ev-1', '2026-03-01T10:00:00Z'],
      ['ev-2', '2026-03-05T12:00:00Z'],
    ]);

    const matrix = buildMatrix([req1, req2, req3], [res1, res2], dates);
    expect(matrix).toHaveLength(3);

    expect(matrix[0].status).toBe('PARTIAL');
    expect(matrix[0].label).toBe(LABEL_PARTIAL);

    expect(matrix[1].status).toBe('DEFLECTED');
    expect(matrix[1].label).toBe(LABEL_DEFLECTED);

    expect(matrix[2].status).toBe('UNANSWERED');
    expect(matrix[2].label).toBe(LABEL_UNANSWERED);
    expect(matrix[2].responseDisplayIds).toEqual([]);
  });

  it('Hour-10 demo case: 3 requests, 1 response addressing two of them -> one UNANSWERED row with exact label', () => {
    const req1 = createRequestFinding('r1', 'FND-101', 'Access request', 'ev-1');
    const req2 = createRequestFinding('r2', 'FND-102', 'Deletion request', 'ev-1');
    const req3 = createRequestFinding('r3', 'FND-103', 'Correction request', 'ev-1');

    const singleResponse = createResponseFinding(
      's1',
      'FND-201',
      ['FND-101', 'FND-102'],
      'FULL',
      'ev-2',
    );

    const dates = new Map([
      ['ev-1', '2026-03-01T10:00:00Z'],
      ['ev-2', '2026-03-02T10:00:00Z'],
    ]);

    const matrix = buildMatrix([req1, req2, req3], [singleResponse], dates);
    expect(matrix).toHaveLength(3);

    const unansweredRow = matrix.find((r) => r.requestDisplayId === 'FND-103')!;
    expect(unansweredRow.status).toBe('UNANSWERED');
    expect(unansweredRow.label).toBe('No response found in case record');
  });

  it('Scenario 9: timestamp anomaly - response dated before or equal to request gives CHRONOLOGY_IMPOSSIBLE', () => {
    const req1 = createRequestFinding('r1', 'FND-101', 'Request item', 'ev-1');
    const resBefore = createResponseFinding('s1', 'FND-201', ['FND-101'], 'FULL', 'ev-2');

    // Dated before
    const datesBefore = new Map([
      ['ev-1', '2026-03-10T12:00:00Z'],
      ['ev-2', '2026-03-05T12:00:00Z'],
    ]);
    const matrixBefore = buildMatrix([req1], [resBefore], datesBefore);
    expect(matrixBefore[0].chronology).toBe('CHRONOLOGY_IMPOSSIBLE');

    // Equal dates (strictly after requirement fails)
    const datesEqual = new Map([
      ['ev-1', '2026-03-10T12:00:00Z'],
      ['ev-2', '2026-03-10T12:00:00Z'],
    ]);
    const matrixEqual = buildMatrix([req1], [resBefore], datesEqual);
    expect(matrixEqual[0].chronology).toBe('CHRONOLOGY_IMPOSSIBLE');

    // Missing dates
    const datesMissing = new Map([['ev-1', '2026-03-10T12:00:00Z']]);
    const matrixMissing = buildMatrix([req1], [resBefore], datesMissing);
    expect(matrixMissing[0].chronology).toBe('DATE_MISSING');
  });

  it('ignores response links addressing non-existent requests and reports in ignoredLinks', () => {
    const req1 = createRequestFinding('r1', 'FND-101', 'Valid demand', 'ev-1');
    const responseWithNonExistent = createResponseFinding(
      's1',
      'FND-201',
      ['FND-999'], // does not exist
      'FULL',
      'ev-2',
    );

    const dates = new Map([
      ['ev-1', '2026-03-01T10:00:00Z'],
      ['ev-2', '2026-03-02T10:00:00Z'],
    ]);

    const evalResult = evaluateRequestResponse([req1], [responseWithNonExistent], dates);
    expect(evalResult.ignoredLinks).toHaveLength(1);
    expect(evalResult.ignoredLinks[0]).toEqual({
      responseFindingId: 's1',
      responseDisplayId: 'FND-201',
      referencedRef: 'FND-999',
      reason: 'REQUEST_NOT_FOUND',
    });

    const matrix = buildMatrix([req1], [responseWithNonExistent], dates);
    expect(matrix[0].status).toBe('UNANSWERED');
  });

  it('picks the best status when several responses address one request', () => {
    const req1 = createRequestFinding('r1', 'FND-101', 'Multi-response demand', 'ev-1');

    const resPartial = createResponseFinding('s1', 'FND-201', ['FND-101'], 'PARTIAL', 'ev-2');
    const resFull = createResponseFinding('s2', 'FND-202', ['FND-101'], 'FULL', 'ev-3');
    const resDeflected = createResponseFinding('s3', 'FND-203', ['FND-101'], 'DEFLECTED', 'ev-4');

    const dates = new Map([
      ['ev-1', '2026-03-01T10:00:00Z'],
      ['ev-2', '2026-03-02T10:00:00Z'],
      ['ev-3', '2026-03-03T10:00:00Z'],
      ['ev-4', '2026-03-04T10:00:00Z'],
    ]);

    const matrix = buildMatrix([req1], [resPartial, resFull, resDeflected], dates);
    expect(matrix[0].status).toBe('ANSWERED');
    expect(matrix[0].responseDisplayIds).toEqual(['FND-201', 'FND-202', 'FND-203']);
  });

  it('wording rule: matrix labels and output never contain prohibited legal conclusion words', () => {
    const forbiddenWords = ['compliant', 'non-compliant', 'violation', 'bad faith'];

    const labels = [
      LABEL_ANSWERED,
      LABEL_UNANSWERED,
      LABEL_PARTIAL,
      LABEL_DEFLECTED,
      LABEL_UNCLEAR,
    ];

    for (const label of labels) {
      for (const word of forbiddenWords) {
        expect(label.toLowerCase()).not.toContain(word);
      }
    }

    const req1 = createRequestFinding('r1', 'FND-101', 'Item', 'ev-1');
    const res1 = createResponseFinding('s1', 'FND-201', ['FND-101'], 'FULL', 'ev-2');
    const dates = new Map([
      ['ev-1', '2026-03-01T10:00:00Z'],
      ['ev-2', '2026-03-02T10:00:00Z'],
    ]);

    const matrix = buildMatrix([req1], [res1], dates);
    const serializedMatrix = JSON.stringify(matrix).toLowerCase();

    for (const word of forbiddenWords) {
      expect(serializedMatrix).not.toContain(word);
    }
  });
});
