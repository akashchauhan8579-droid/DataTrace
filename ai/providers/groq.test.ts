import { describe, expect, it, vi } from 'vitest';
import { createGroqProvider } from './groq';
import type { CanonicalAnalysisRequest } from './interface';

const request: CanonicalAnalysisRequest = {
  taskType: 'extraction',
  schema: { name: 'candidate-finding', version: 'v1' },
  prompt: { id: 'extraction', version: 'v1' },
  evidenceScope: [],
  minimizedInput: {},
  renderedPrompt: { system: 'Extract only supported findings.', user: 'Return JSON.' },
};

describe('createGroqProvider', () => {
  it('uses the Groq OpenAI-compatible endpoint and reports Groq metadata', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ candidates: [] }) } }],
          usage: { prompt_tokens: 15, completion_tokens: 8 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const provider = createGroqProvider({
      apiKey: 'test-groq-key',
      model: 'test-model',
      fetchImpl,
      maxRetries: 0,
    });

    const result = await provider.analyze(request);

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://api.groq.com/openai/v1/chat/completions',
    );
    expect((fetchImpl.mock.calls[0][1]?.headers as Record<string, string>).Authorization)
      .toMatch(/^Bearer \S+$/);
    expect(result.rawProviderMetadata.provider).toBe('groq');
    expect(result.rawProviderMetadata.model).toBe('test-model');
  });

  it('reports unavailable when no key is configured', async () => {
    const provider = createGroqProvider({ apiKey: '', model: 'test-model' });
    await expect(provider.healthCheck()).resolves.toEqual({
      available: false,
      model: 'test-model',
      capabilities: { vision: false },
    });
  });
});
