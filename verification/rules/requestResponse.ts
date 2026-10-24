import type { RequestResponseStatus } from '../../contracts/schemas/enums';
import {
  RequestPayloadSchema,
  ResponsePayloadSchema,
} from '../../contracts/schemas/payloads';
import type { FindingRule, FindingView, RuleContext, RuleResult } from '../types';

export interface RequestResponseLink {
  requestFindingId: string;
  requestDisplayId: string;
  responseFindingId: string;
  responseDisplayId: string;
  coverage: 'FULL' | 'PARTIAL' | 'DEFLECTED' | 'UNCLEAR';
  status: RequestResponseStatus;
  chronology: 'OK' | 'CHRONOLOGY_IMPOSSIBLE' | 'DATE_MISSING';
  requestDate?: string;
  responseDate?: string;
}

export interface EvaluateRequestResponseResult {
  links: RequestResponseLink[];
  unansweredRequests: Array<{
    requestFindingId: string;
    requestDisplayId: string;
    status: 'UNANSWERED';
    wording: string;
  }>;
  ignoredLinks: Array<{
    responseFindingId: string;
    responseDisplayId: string;
    referencedRef: string;
    reason: string;
  }>;
}

export const UNANSWERED_WORDING = 'No response found in case record';

export function evaluateRequestResponse(
  requests: FindingView[],
  responses: FindingView[],
  evidenceDates: Map<string, string>,
): EvaluateRequestResponseResult {
  const requestMap = new Map<string, FindingView>();
  for (const req of requests) {
    if (req.findingType === 'REQUEST') {
      requestMap.set(req.id, req);
      requestMap.set(req.displayId, req);
    }
  }

  const links: RequestResponseLink[] = [];
  const ignoredLinks: EvaluateRequestResponseResult['ignoredLinks'] = [];
  const addressedRequestIds = new Set<string>();

  for (const res of responses) {
    if (res.findingType !== 'RESPONSE') continue;

    const parsedResponse = ResponsePayloadSchema.safeParse(res.structuredPayload);
    if (!parsedResponse.success) continue;

    const resEvidenceId = res.citations[0]?.evidenceId;
    const resDate = resEvidenceId ? evidenceDates.get(resEvidenceId) : undefined;

    for (const ref of parsedResponse.data.addresses) {
      const targetReq = requestMap.get(ref);
      if (!targetReq) {
        ignoredLinks.push({
          responseFindingId: res.id,
          responseDisplayId: res.displayId,
          referencedRef: ref,
          reason: 'REQUEST_NOT_FOUND',
        });
        continue;
      }

      addressedRequestIds.add(targetReq.id);
      addressedRequestIds.add(targetReq.displayId);

      const reqEvidenceId = targetReq.citations[0]?.evidenceId;
      const reqDate = reqEvidenceId ? evidenceDates.get(reqEvidenceId) : undefined;

      let chronology: 'OK' | 'CHRONOLOGY_IMPOSSIBLE' | 'DATE_MISSING';
      if (!reqDate || !resDate) {
        chronology = 'DATE_MISSING';
      } else {
        const reqTime = new Date(reqDate).getTime();
        const resTime = new Date(resDate).getTime();
        if (isNaN(reqTime) || isNaN(resTime)) {
          chronology = 'DATE_MISSING';
        } else if (resTime <= reqTime) {
          chronology = 'CHRONOLOGY_IMPOSSIBLE';
        } else {
          chronology = 'OK';
        }
      }

      const statusMap: Record<string, RequestResponseStatus> = {
        FULL: 'ANSWERED',
        PARTIAL: 'PARTIAL',
        DEFLECTED: 'DEFLECTED',
        UNCLEAR: 'UNCLEAR',
      };

      links.push({
        requestFindingId: targetReq.id,
        requestDisplayId: targetReq.displayId,
        responseFindingId: res.id,
        responseDisplayId: res.displayId,
        coverage: parsedResponse.data.coverage,
        status: statusMap[parsedResponse.data.coverage] ?? 'UNCLEAR',
        chronology,
        requestDate: reqDate,
        responseDate: resDate,
      });
    }
  }

  const unansweredRequests: EvaluateRequestResponseResult['unansweredRequests'] = [];
  for (const req of requests) {
    if (req.findingType !== 'REQUEST') continue;
    if (!addressedRequestIds.has(req.id) && !addressedRequestIds.has(req.displayId)) {
      unansweredRequests.push({
        requestFindingId: req.id,
        requestDisplayId: req.displayId,
        status: 'UNANSWERED',
        wording: UNANSWERED_WORDING,
      });
    }
  }

  return {
    links,
    unansweredRequests,
    ignoredLinks,
  };
}

export const requestResponseRule: FindingRule = {
  id: 'request_response.v1',
  applies: (f: FindingView) => f.findingType === 'REQUEST' || f.findingType === 'RESPONSE',
  passState: 'AI_INFERRED',
  evaluate: (f: FindingView, _ctx: RuleContext): RuleResult => {
    if (f.findingType === 'REQUEST') {
      const parsed = RequestPayloadSchema.safeParse(f.structuredPayload);
      if (!parsed.success) {
        return {
          ruleId: 'request_response.v1',
          outcome: 'FAIL',
          reason: 'PAYLOAD_INVALID',
        };
      }
      return {
        ruleId: 'request_response.v1',
        outcome: 'PASS',
      };
    }

    if (f.findingType === 'RESPONSE') {
      const parsed = ResponsePayloadSchema.safeParse(f.structuredPayload);
      if (!parsed.success) {
        return {
          ruleId: 'request_response.v1',
          outcome: 'FAIL',
          reason: 'PAYLOAD_INVALID',
        };
      }
      return {
        ruleId: 'request_response.v1',
        outcome: 'PASS',
      };
    }

    return {
      ruleId: 'request_response.v1',
      outcome: 'INCONCLUSIVE',
    };
  },
};
