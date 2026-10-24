import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockGateway } from './mock-gateway';
import { AnalysisWorker } from './worker';
import type { QueuedTask, TaskResult } from './types';
import { scopeKey } from '../../ai/gateway/scope';
import { parseCandidate } from '../../contracts/schemas/findings';
import { AIReportDraftSchema } from '../../contracts/schemas/reports';

const MOCK_TASK: QueuedTask = {
  id: 'task-001',
  run_id: 'run-001',
  task_type: 'extraction',
  status: 'RUNNING',
  input_evidence_scope: 'EV-101',
  prompt_id: 'extraction.v1',
  prompt_version: '1.0',
  schema_name: 'CandidateFindingList',
  schema_version: '1.0',
  provider: 'mock',
  model: 'mock-model',
  minimization_metadata: {},
  retry_count: 0,
  created_at: new Date().toISOString(),
  claim_token: 'claim-token-001',
};

const MOCK_SEGMENTS = [
  {
    evidence_display_id: 'EV-101',
    ordinal: 1,
    segment_text: 'We have confirmed the deletion of your personal data per GDPR Article 17.',
    locator_type: 'CHAR_RANGE',
    locator: { start: 0, end: 73 },
  },
  {
    evidence_display_id: 'EV-101',
    ordinal: 2,
    segment_text: 'Please allow 30 days for backup cycle purges to complete.',
    locator_type: 'CHAR_RANGE',
    locator: { start: 75, end: 132 },
  },
];

describe('Analysis Worker — Phase 3 (Member B Spec v1.4 §7.6)', () => {
  describe('MockGateway (Stub)', () => {
    const gateway = new MockGateway();

    it('returns TaskResult with 64-char output_sha256 for extraction task', async () => {
      const scopeMap = new Map([
        [scopeKey('EV-101', 1), { evidenceId: 'ev-uuid-1', segmentId: 'seg-uuid-1', locatorType: 'CHAR_RANGE', locator: { start: 0, end: 73 } }],
        [scopeKey('EV-101', 2), { evidenceId: 'ev-uuid-1', segmentId: 'seg-uuid-2', locatorType: 'CHAR_RANGE', locator: { start: 75, end: 132 } }],
      ]);

      const result = await gateway.run(MOCK_TASK, scopeMap, MOCK_SEGMENTS);

      expect(result.output_sha256).toHaveLength(64);
      expect(result.output_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(result.validated_output).toBeDefined();
      expect(result.fallback_used).toBe(false);
      expect(result.validated_output).toEqual(
        expect.objectContaining({
          candidates: expect.arrayContaining([
            expect.objectContaining({
              citations: expect.arrayContaining([
                expect.objectContaining({
                  evidenceDisplayId: 'EV-101',
                  segmentOrdinal: 1,
                }),
              ]),
            }),
          ]),
        })
      );
      const candidates = (result.validated_output as { candidates: unknown[] }).candidates;
      expect(candidates.every((candidate) => parseCandidate(candidate).ok)).toBe(true);
      expect(candidates[0]).toEqual(expect.objectContaining({
        evidenceBasis: 'INFERRED',
        structuredPayload: expect.objectContaining({
          normalizedClaim: expect.any(Object),
        }),
        citations: expect.arrayContaining([
          expect.objectContaining({
            quotedText: MOCK_SEGMENTS[0].segment_text,
          }),
        ]),
      }));
    });

    it('output_sha256 matches SHA-256 of JSON.stringify(validated_output)', async () => {
      const { createHash } = await import('node:crypto');
      const scopeMap = new Map();
      const result = await gateway.run(MOCK_TASK, scopeMap, MOCK_SEGMENTS);

      const expected = createHash('sha256')
        .update(JSON.stringify(result.validated_output), 'utf8')
        .digest('hex');

      expect(result.output_sha256).toBe(expected);
    });

    const TASK_TYPES: QueuedTask['task_type'][] = [
      'extraction',
      'response_analysis',
      'friction_analysis',
      'contradiction_consolidation',
      'report_draft',
      'vision_transcription',
    ];

    for (const taskType of TASK_TYPES) {
      it(`handles task_type="${taskType}" without throwing`, async () => {
        const task = { ...MOCK_TASK, task_type: taskType };
        const scopeMap = new Map();
        const result = await gateway.run(task, scopeMap, MOCK_SEGMENTS);
        expect(result.output_sha256).toHaveLength(64);
        expect(result.validated_output).toBeDefined();
      });
    }

    it('returns schema-valid friction candidates and report drafts', async () => {
      for (const taskType of ['response_analysis', 'friction_analysis'] as const) {
        const result = await gateway.run(
          { ...MOCK_TASK, task_type: taskType },
          new Map(),
          MOCK_SEGMENTS
        );
        const frictionSignals = (result.validated_output as { frictionSignals: unknown[] }).frictionSignals;
        expect(frictionSignals.every((candidate) => parseCandidate(candidate).ok)).toBe(true);
      }

      const report = await gateway.run(
        { ...MOCK_TASK, task_type: 'report_draft' },
        new Map(),
        MOCK_SEGMENTS
      );
      expect(AIReportDraftSchema.safeParse(report.validated_output).success).toBe(true);
    });
  });

  describe('ScopeMap Key Isolation (Spec §11.8)', () => {
    it('scopeKey correctly namespaces evidence display ID and ordinal', () => {
      expect(scopeKey('EV-101', 1)).toBe('EV-101#1');
      expect(scopeKey('EV-202', 15)).toBe('EV-202#15');
    });

    it('different evidence display IDs produce distinct scope keys', () => {
      const key1 = scopeKey('EV-101', 3);
      const key2 = scopeKey('EV-102', 3);
      expect(key1).not.toBe(key2);
    });
  });

  describe('Gateway Interface Swappability', () => {
    it('AnalysisWorker accepts any AIGatewayInterface implementation', () => {
      const customGateway = {
        run: vi.fn().mockResolvedValue({
          validated_output: { test: true },
          output_sha256: 'a'.repeat(64),
          tokens_in: 100,
          tokens_out: 50,
          latency_ms: 200,
          fallback_used: false,
        } satisfies TaskResult),
      };

      // Should not throw: custom gateway is accepted by the worker
      const worker = new AnalysisWorker(customGateway);
      expect(worker).toBeDefined();
    });
  });
});
