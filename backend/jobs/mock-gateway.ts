import { createHash } from 'node:crypto';
import type { AIGatewayInterface, QueuedTask, TaskResult } from './types';
import type { ScopeMap } from '../../ai/gateway/scope';

type MockSegment = {
  evidence_display_id: string;
  ordinal: number;
  segment_text: string;
  locator_type: string;
  locator: unknown;
};

/**
 * MockGateway — Deterministic stub used before Member D's real gateway is ready.
 * Master Spec v1.4 Principle 11: Only claim what is built.
 * At hackathon, replace MockGateway with Member D's real gateway implementation.
 * The worker code does NOT change — only this import swaps.
 */
export class MockGateway implements AIGatewayInterface {
  async run(
    task: QueuedTask,
    _scopeMap: ScopeMap,
    segments: MockSegment[]
  ): Promise<TaskResult> {
    const start = Date.now();

    // Deterministic stub output per task type
    let validated_output: unknown;

    switch (task.task_type) {
      case 'extraction':
        validated_output = {
          candidates: segments.slice(0, 3).map((seg) => ({
            findingType: 'CLAIM',
            statement: `[MOCK] Extracted claim from segment #${seg.ordinal}: "${seg.segment_text.slice(0, 80)}..."`.slice(
              0,
              1000
            ),
            evidenceBasis: 'INFERRED',
            candidateConfidence: 0.75,
            structuredPayload: {
              normalizedClaim: {
                subject: '[MOCK]',
                predicate: 'holds_data',
                object: `segment #${seg.ordinal}`,
                polarity: 'AFFIRMS',
              },
            },
            citations: [
              {
                evidenceDisplayId: seg.evidence_display_id,
                segmentOrdinal: seg.ordinal,
                locatorType: seg.locator_type,
                locator: seg.locator,
                quotedText: seg.segment_text.slice(0, 2000),
              },
            ],
          })),
        };
        break;

      case 'response_analysis':
        validated_output = {
          requestsMet: [],
          requestsUnanswered: [],
          frictionSignals: segments
            .slice(0, 1)
            .map((seg) => mockFrictionCandidate(seg, 'Potential bureaucratic delay detected in response.', 0.60)),
        };
        break;

      case 'friction_analysis':
        validated_output = {
          frictionSignals: segments
            .slice(0, 1)
            .map((seg) =>
              mockFrictionCandidate(seg, 'Generic/template response detected — no specific data deletion confirmed.', 0.65)
            ),
        };
        break;

      case 'contradiction_consolidation':
        // The mock cannot produce real CONTRADICTION candidates because valid
        // claimARef/claimBRef values must reference existing persisted findings
        // (FND-NNN display IDs) — which don't exist at mock time. Return an
        // empty candidates list so the task succeeds cleanly with 0 results,
        // exactly as the real prompt does when no contradictions are found.
        validated_output = { candidates: [] };
        break;

      case 'report_draft':
        validated_output = {
          blocks: [
            { kind: 'heading', text: '[MOCK] No grounded findings available for this report draft.' },
          ],
        };
        break;

      case 'vision_transcription':
        validated_output = {
          transcript: '[MOCK] Vision transcription is not available in the stub gateway.',
          pages: [],
        };
        break;

      default:
        validated_output = { note: '[MOCK] Unknown task type — no output generated.' };
    }

    const outputJson = JSON.stringify(validated_output);
    const output_sha256 = createHash('sha256').update(outputJson, 'utf8').digest('hex');
    const latency_ms = Date.now() - start;

    return {
      validated_output,
      output_sha256,
      tokens_in: 0,
      tokens_out: 0,
      latency_ms,
      fallback_used: false,
    };
  }
}

function mockFrictionCandidate(
  seg: MockSegment,
  description: string,
  candidateConfidence: number
) {
  return {
    findingType: 'FRICTION_SIGNAL',
    statement: `[MOCK] ${description}`,
    evidenceBasis: 'INFERRED',
    candidateConfidence,
    structuredPayload: {
      signalType: 'POSSIBLE_DELAY',
      relatedRefs: [],
    },
    citations: [
      {
        evidenceDisplayId: seg.evidence_display_id,
        segmentOrdinal: seg.ordinal,
        locatorType: seg.locator_type,
        locator: seg.locator,
        quotedText: seg.segment_text.slice(0, 2000),
      },
    ],
  };
}
