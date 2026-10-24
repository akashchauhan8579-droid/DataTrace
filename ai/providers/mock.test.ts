import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { createMockProvider, loadFixtures } from './mock';
import { ProviderError, CanonicalAnalysisRequest } from './interface';
import { parseCandidate } from '../../contracts';

describe('createMockProvider', () => {
  const sampleCandidate = {
    findingType: 'CLAIM' as const,
    statement: 'Acme Corp retains customer account data for 30 days following an erasure request.',
    evidenceBasis: 'DIRECT' as const,
    candidateConfidence: 0.95,
    citations: [
      {
        evidenceDisplayId: 'EV-101',
        segmentOrdinal: 1,
        locatorType: 'PAGE' as const,
        locator: { page: 1 },
        quotedText: 'We retain customer account data for 30 days following an erasure request.',
      },
    ],
    structuredPayload: {
      normalizedClaim: {
        subject: 'Acme Corp',
        predicate: 'retains_data' as const,
        object: 'customer account data',
        polarity: 'AFFIRMS' as const,
      },
      speaker: 'ORGANIZATION' as const,
    },
  };

  const dummyRequest: CanonicalAnalysisRequest = {
    taskType: 'extraction',
    schema: { name: 'extraction_schema', version: 'v1' },
    prompt: { id: 'extraction', version: 'v1' },
    evidenceScope: [
      {
        evidenceDisplayId: 'EV-101',
        segments: [
          {
            ordinal: 1,
            locatorType: 'PAGE',
            locator: { page: 1 },
            text: 'We retain customer account data for 30 days following an erasure request.',
          },
        ],
      },
    ],
    minimizedInput: {},
  };

  it('returns the fixture', async () => {
    const provider = createMockProvider({
      fixtures: {
        'extraction.v1': [sampleCandidate],
      },
    });

    const response = await provider.analyze(dummyRequest);
    expect(response.taskType).toBe('extraction');
    expect(response.schemaName).toBe('extraction_schema');
    expect(response.schemaVersion).toBe('v1');
    expect(response.candidates).toEqual([sampleCandidate]);
    expect(response.rawProviderMetadata).toEqual({
      provider: 'mock',
      model: 'mock-1',
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
    });
  });

  it('two calls return equal but not the same object (deep clone)', async () => {
    const provider = createMockProvider({
      fixtures: {
        'extraction.v1': [sampleCandidate],
      },
    });

    const res1 = await provider.analyze(dummyRequest);
    const res2 = await provider.analyze(dummyRequest);

    expect(res1.candidates).toEqual(res2.candidates);
    expect(res1.candidates).not.toBe(res2.candidates);
    expect(res1.candidates[0]).not.toBe(res2.candidates[0]);
    expect((res1.candidates[0] as typeof sampleCandidate).citations).not.toBe(
      (res2.candidates[0] as typeof sampleCandidate).citations
    );
  });

  it('unknown key throws UNSUPPORTED', async () => {
    const provider = createMockProvider({
      fixtures: {
        'other.v1': [sampleCandidate],
      },
    });

    await expect(provider.analyze(dummyRequest)).rejects.toThrow(ProviderError);
    try {
      await provider.analyze(dummyRequest);
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).code).toBe('UNSUPPORTED');
      expect((err as ProviderError).retryable).toBe(false);
    }
  });

  it('calls records requests', async () => {
    const provider = createMockProvider({
      fixtures: {
        'extraction.v1': [sampleCandidate],
      },
    });

    expect(provider.calls).toHaveLength(0);
    await provider.analyze(dummyRequest);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]).toBe(dummyRequest);

    const secondRequest: CanonicalAnalysisRequest = {
      ...dummyRequest,
      schema: { name: 'different_schema', version: 'v2' },
    };
    await provider.analyze(secondRequest);
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1]).toBe(secondRequest);
  });

  it('failWith is thrown', async () => {
    const customError = new ProviderError('SERVER', 'Injected mock failure', true);
    const provider = createMockProvider({
      fixtures: {
        'extraction.v1': [sampleCandidate],
      },
      failWith: customError,
    });

    await expect(provider.analyze(dummyRequest)).rejects.toThrow(customError);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]).toBe(dummyRequest);
  });

  it('healthCheck returns available and mock-1 model', async () => {
    const provider = createMockProvider();
    const health = await provider.healthCheck();
    expect(health).toEqual({
      available: true,
      model: 'mock-1',
      capabilities: { vision: true },
    });
  });

  it('loadFixtures loads sample fixture from disk and candidate is valid per contracts', () => {
    const fixturesDir = path.resolve(__dirname, '../../tests/synthetic/fixtures');
    const fixtures = loadFixtures(fixturesDir);

    expect(fixtures['extraction.v1.sample']).toBeDefined();
    expect(fixtures['extraction.v1']).toBeDefined();
    expect(fixtures['extraction.v1']).toHaveLength(1);

    const candidate = fixtures['extraction.v1'][0];
    const parseResult = parseCandidate(candidate);
    expect(parseResult.ok).toBe(true);
  });
});
