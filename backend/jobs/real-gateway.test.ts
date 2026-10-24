import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { RealGatewayAdapter } from './real-gateway';
import { createMockProvider } from '../../ai/providers/mock';
import type { QueuedTask } from './types';
import { scopeKey } from '../../ai/gateway/scope';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const BASE_TASK: QueuedTask = {
  id: 'task-rga-001',
  run_id: 'run-rga-001',
  task_type: 'extraction',
  status: 'RUNNING',
  input_evidence_scope: 'EV-200',
  prompt_id: 'extraction',
  prompt_version: 'v1',
  schema_name: 'CandidateFindingList',
  schema_version: '1.0',
  provider: 'mock',
  model: 'mock-model',
  minimization_metadata: {},
  retry_count: 0,
  created_at: new Date().toISOString(),
  claim_token: 'claim-token-rga-001',
};

const SEGMENTS = [
  {
    evidence_display_id: 'EV-200',
    ordinal: 1,
    segment_text: 'Acme Corp has deleted your personal data from all primary databases.',
    locator_type: 'CHAR_RANGE',
    locator: { start: 0, end: 67 },
  },
  {
    evidence_display_id: 'EV-200',
    ordinal: 2,
    segment_text: 'Backups will be purged within 30 days per our retention policy.',
    locator_type: 'CHAR_RANGE',
    locator: { start: 68, end: 131 },
  },
];

const SCOPE_MAP = new Map([
  [
    scopeKey('EV-200', 1),
    {
      evidenceId: 'ev-uuid-200',
      segmentId: 'seg-uuid-200-1',
      locatorType: 'CHAR_RANGE',
      locator: { start: 0, end: 67 },
    },
  ],
  [
    scopeKey('EV-200', 2),
    {
      evidenceId: 'ev-uuid-200',
      segmentId: 'seg-uuid-200-2',
      locatorType: 'CHAR_RANGE',
      locator: { start: 68, end: 131 },
    },
  ],
]);

/** A valid ENTITY candidate (no quotedText constraint, unlike CLAIM) */
const VALID_CANDIDATE = {
  findingType: 'ENTITY',
  statement: 'Acme Corp deleted personal data from primary databases.',
  evidenceBasis: 'EXTRACTED',
  candidateConfidence: 0.9,
  citations: [
    {
      evidenceDisplayId: 'EV-200',
      segmentOrdinal: 1,
    },
  ],
  structuredPayload: {
    entityType: 'ORGANISATION',
    entityName: 'Acme Corp',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdapter(candidates: unknown[] = [VALID_CANDIDATE]) {
  const provider = createMockProvider({
    fixtures: {
      'extraction.v1': candidates,
    },
  });
  return new RealGatewayAdapter({ provider });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RealGatewayAdapter — STEP 14 (Member B Spec v1.4 §7.6)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // 1. SHA-256 integrity
  // -------------------------------------------------------------------------
  describe('output_sha256 integrity', () => {
    it('returns a 64-char lowercase hex SHA-256', async () => {
      const adapter = makeAdapter();
      const result = await adapter.run(BASE_TASK, SCOPE_MAP, SEGMENTS);

      expect(result.output_sha256).toHaveLength(64);
      expect(result.output_sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('SHA-256 of JSON.stringify(validated_output) matches output_sha256', async () => {
      const adapter = makeAdapter();
      const result = await adapter.run(BASE_TASK, SCOPE_MAP, SEGMENTS);

      const computed = createHash('sha256')
        .update(JSON.stringify(result.validated_output), 'utf8')
        .digest('hex');

      expect(computed).toBe(result.output_sha256);
    });
  });

  // -------------------------------------------------------------------------
  // 2. validated_output shape
  // -------------------------------------------------------------------------
  describe('validated_output shape', () => {
    it('validated_output.candidates is an array', async () => {
      const adapter = makeAdapter();
      const result = await adapter.run(BASE_TASK, SCOPE_MAP, SEGMENTS);

      const output = result.validated_output as { candidates: unknown[] };
      expect(Array.isArray(output.candidates)).toBe(true);
    });

    it('candidates contains the envelope-parsed items (not raw provider JSON)', async () => {
      const adapter = makeAdapter();
      const result = await adapter.run(BASE_TASK, SCOPE_MAP, SEGMENTS);

      const output = result.validated_output as { candidates: unknown[] };
      expect(output.candidates).toHaveLength(1);
      expect(output.candidates[0]).toMatchObject({
        findingType: 'ENTITY',
        statement: 'Acme Corp deleted personal data from primary databases.',
      });
    });
  });

  // -------------------------------------------------------------------------
  // 3. fallback_used flag
  // -------------------------------------------------------------------------
  it('fallback_used is false for a normal run', async () => {
    const adapter = makeAdapter();
    const result = await adapter.run(BASE_TASK, SCOPE_MAP, SEGMENTS);
    expect(result.fallback_used).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 4. Graceful construction — no fixtures dir, no API key
  // -------------------------------------------------------------------------
  it('constructs without throwing when AI_PROVIDER=mock and fixtures dir is absent', () => {
    vi.stubEnv('AI_PROVIDER', 'mock');

    // Point to a directory that doesn't exist — loadFixtures returns {} without throwing
    expect(() => {
      new RealGatewayAdapter({
        fixturesDir: '/tmp/__nonexistent_fixtures_dir_8675309__',
      });
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // 5. Prompt id split — "extraction.v1" dot notation
  // -------------------------------------------------------------------------
  it('resolves prompt correctly when prompt_id uses dot-version notation', async () => {
    const provider = createMockProvider({
      fixtures: { 'extraction.v1': [VALID_CANDIDATE] },
    });
    const capturedPrompts: unknown[] = [];
    const spyProvider = {
      ...provider,
      async analyze(req: Parameters<typeof provider.analyze>[0]) {
        capturedPrompts.push(req.prompt);
        return provider.analyze(req);
      },
      healthCheck: provider.healthCheck.bind(provider),
    };

    const dotTask: QueuedTask = {
      ...BASE_TASK,
      prompt_id: 'extraction.v1',   // dot-notation input
      prompt_version: '1.0',
    };

    const adapter = new RealGatewayAdapter({ provider: spyProvider });
    await adapter.run(dotTask, SCOPE_MAP, SEGMENTS);

    // After split, adapter should have resolved to id='extraction', version='v1'
    expect(capturedPrompts[0]).toMatchObject({ id: 'extraction', version: 'v1' });
  });

  // -------------------------------------------------------------------------
  // 6. Invalid envelope — adapter throws
  // -------------------------------------------------------------------------
  it('throws when the provider returns a non-array candidates envelope', async () => {
    const badProvider = createMockProvider({
      fixtures: { 'extraction.v1': [] },
    });
    const patchedProvider = {
      ...badProvider,
      async analyze() {
        return {
          taskType: 'extraction' as const,
          schemaName: 'CandidateFindingList',
          schemaVersion: '1.0',
          candidates: 'not-an-array' as unknown as unknown[],
          rawProviderMetadata: {
            provider: 'mock',
            model: 'mock-1',
            latencyMs: 0,
          },
        };
      },
      healthCheck: badProvider.healthCheck.bind(badProvider),
    };

    const adapter = new RealGatewayAdapter({ provider: patchedProvider });
    await expect(adapter.run(BASE_TASK, SCOPE_MAP, SEGMENTS)).rejects.toThrow(
      /invalid candidates envelope/i
    );
  });

  // -------------------------------------------------------------------------
  // 7. Multiple evidence display ids are grouped correctly
  // -------------------------------------------------------------------------
  it('groups segments by evidence_display_id into separate scope entries', async () => {
    const provider = createMockProvider({
      fixtures: { 'extraction.v1': [VALID_CANDIDATE] },
    });
    const capturedScopes: unknown[] = [];
    const spyProvider = {
      ...provider,
      async analyze(req: Parameters<typeof provider.analyze>[0]) {
        capturedScopes.push(req.evidenceScope);
        return provider.analyze(req);
      },
      healthCheck: provider.healthCheck.bind(provider),
    };

    const multiSegments = [
      ...SEGMENTS,
      {
        evidence_display_id: 'EV-201',
        ordinal: 1,
        segment_text: 'Additional evidence from a second document.',
        locator_type: 'CHAR_RANGE',
        locator: { start: 0, end: 42 },
      },
    ];

    const adapter = new RealGatewayAdapter({ provider: spyProvider });
    await adapter.run(BASE_TASK, SCOPE_MAP, multiSegments);

    const scope = capturedScopes[0] as Array<{ evidenceDisplayId: string }>;
    const displayIds = scope.map((e) => e.evidenceDisplayId).sort();
    expect(displayIds).toEqual(['EV-200', 'EV-201']);
  });

  // -------------------------------------------------------------------------
  // 8 & 9. Provider configuration guards (existing tests preserved)
  // -------------------------------------------------------------------------
  it('requires GROQ_API_KEY when Groq is selected', () => {
    vi.stubEnv('AI_PROVIDER', 'groq');
    vi.stubEnv('GROQ_API_KEY', '');

    expect(() => new RealGatewayAdapter()).toThrow(
      'AI_PROVIDER=groq requires GROQ_API_KEY to be configured.',
    );
  });

  it('routes configured Groq tasks to the Groq endpoint', async () => {
    vi.stubEnv('AI_PROVIDER', 'groq');
    vi.stubEnv('GROQ_API_KEY', 'test-groq-key');
    vi.stubEnv('GROQ_MODEL', 'test-groq-model');

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ candidates: [VALID_CANDIDATE] }) } }],
          usage: { prompt_tokens: 15, completion_tokens: 8 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new RealGatewayAdapter();
    await adapter.run(BASE_TASK, SCOPE_MAP, SEGMENTS);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.groq.com/openai/v1/chat/completions',
    );
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization)
      .toBe('Bearer test-groq-key');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).model).toBe('test-groq-model');
  });

  it('rejects unsupported provider names instead of silently switching to mock', () => {
    vi.stubEnv('AI_PROVIDER', 'unknown');

    expect(() => new RealGatewayAdapter()).toThrow(
      'Unsupported AI_PROVIDER "unknown". Use "groq", "grok", or "mock".',
    );
  });
});
