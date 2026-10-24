import type { RouteDef } from '../types';
import { evaluateRequestResponse } from '../../../verification/rules/requestResponse';
import type { FindingView } from '../../../verification/types';

export const matrixRoutes: RouteDef[] = [
  // GET /cases/:id/request-response-matrix (§13.2, §15.2, §17.4)
  {
    method: 'GET',
    pattern: '/cases/:id/request-response-matrix',
    auth: 'user',
    handler: async ({ user, db, params }) => {
      // 1. Verify case ownership
      const { data: caseRow } = await db
        .from('cases')
        .select('id')
        .eq('id', params.id)
        .eq('owner_id', user.id)
        .single();

      if (!caseRow) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: `Case ${params.id} not found` } }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 2. Fetch findings with citations
      const { data: rawFindings, error: fError } = await db
        .from('findings')
        .select(`
          id, case_id, display_id, finding_type, statement, structured_payload,
          evidence_basis, verification_state, source_unavailable,
          citations (
            id, evidence_id, segment_id, locator_type, locator, quoted_text, validation_status
          )
        `)
        .eq('case_id', params.id);

      if (fError) {
        throw new Error(`Failed to load findings for matrix: ${fError.message}`);
      }

      // 3. Fetch evidence items for timestamps
      const { data: evidenceItems, error: eError } = await db
        .from('evidence_items')
        .select('id, captured_at, uploaded_at')
        .eq('case_id', params.id);

      if (eError) {
        throw new Error(`Failed to load evidence dates for matrix: ${eError.message}`);
      }

      const evidenceDates = new Map<string, string>();
      for (const ev of evidenceItems || []) {
        const date = ev.captured_at || ev.uploaded_at;
        if (date) evidenceDates.set(ev.id, date);
      }

      // 4. Map into FindingView shape for evaluation engine
      const findingsList: FindingView[] = (rawFindings || []).map((f: any) => ({
        id: f.id,
        caseId: f.case_id,
        displayId: f.display_id,
        findingType: f.finding_type,
        evidenceBasis: f.evidence_basis,
        verificationState: f.verification_state,
        sourceUnavailable: !!f.source_unavailable,
        statement: f.statement,
        structuredPayload: f.structured_payload,
        citations: (f.citations || []).map((c: any) => ({
          id: c.id,
          evidenceId: c.evidence_id,
          segmentId: c.segment_id,
          quotedText: c.quoted_text,
          locatorType: c.locator_type,
          locator: c.locator || {},
          validationStatus: c.validation_status || 'PENDING',
        })),
      }));

      const requests = findingsList.filter((f) => f.findingType === 'REQUEST');
      const responses = findingsList.filter((f) => f.findingType === 'RESPONSE');

      // 5. Evaluate matrix using deterministic verification rule
      const matrixResult = evaluateRequestResponse(requests, responses, evidenceDates);

      return {
        caseId: params.id,
        summary: {
          totalRequests: requests.length,
          totalResponses: responses.length,
          linksCount: matrixResult.links.length,
          unansweredCount: matrixResult.unansweredRequests.length,
        },
        matrix: matrixResult,
      };
    },
  },

  // Alias /cases/:id/matrix
  {
    method: 'GET',
    pattern: '/cases/:id/matrix',
    auth: 'user',
    handler: async (ctx) => {
      const fullHandler = matrixRoutes.find((r) => r.pattern === '/cases/:id/request-response-matrix')!;
      return fullHandler.handler(ctx);
    },
  },
];
