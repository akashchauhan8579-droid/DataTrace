import { describe, it, expect, vi } from 'vitest';
import { createGrokProvider } from './grok';
import { CanonicalAnalysisRequest, ProviderError } from './interface';

describe('createGrokProvider', () => {
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
    renderedPrompt: {
      system: 'You are an extraction assistant.',
      user: 'Extract claims from the evidence.',
    },
  };

  const sampleCandidate = {
    findingType: 'CLAIM',
    statement: 'Acme Corp retains customer account data for 30 days following an erasure request.',
  };

  const validResponsePayload = {
    choices: [
      {
        message: {
          content: JSON.stringify({
            candidates: [sampleCandidate],
          }),
        },
      },
    ],
    usage: {
      prompt_tokens: 120,
      completion_tokens: 45,
    },
  };

  it('success path with token mapping and correct request payload', async () => {
    let capturedUrl = '';
    let capturedOptions: RequestInit | undefined;

    const fakeFetch: typeof fetch = async (url, options) => {
      capturedUrl = String(url);
      capturedOptions = options;
      return new Response(JSON.stringify(validResponsePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const provider = createGrokProvider({
      apiKey: 'test-secret-xai-key',
      model: 'grok-beta',
      baseUrl: 'https://api.x.ai/v1',
      fetchImpl: fakeFetch,
      sleep: sleepMock,
    });

    const response = await provider.analyze(dummyRequest);

    expect(capturedUrl).toBe('https://api.x.ai/v1/chat/completions');
    expect(capturedOptions?.method).toBe('POST');
    expect((capturedOptions?.headers as Record<string, string>)?.['Authorization']).toBe(
      'Bearer test-secret-xai-key'
    );
    expect((capturedOptions?.headers as Record<string, string>)?.['Content-Type']).toBe(
      'application/json'
    );

    const body = JSON.parse(String(capturedOptions?.body));
    expect(body).toEqual({
      model: 'grok-beta',
      messages: [
        { role: 'system', content: 'You are an extraction assistant.' },
        { role: 'user', content: 'Extract claims from the evidence.' },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    expect(response.taskType).toBe('extraction');
    expect(response.schemaName).toBe('extraction_schema');
    expect(response.schemaVersion).toBe('v1');
    expect(response.candidates).toEqual([sampleCandidate]);
    expect(response.rawProviderMetadata.provider).toBe('grok');
    expect(response.rawProviderMetadata.model).toBe('grok-beta');
    expect(response.rawProviderMetadata.tokensIn).toBe(120);
    expect(response.rawProviderMetadata.tokensOut).toBe(45);
    expect(response.rawProviderMetadata.retryCount).toBe(0);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it('missing renderedPrompt throws ProviderError BAD_REQUEST', async () => {
    const fakeFetch = vi.fn();
    const provider = createGrokProvider({
      apiKey: 'key',
      model: 'grok-beta',
      fetchImpl: fakeFetch,
    });

    const reqWithoutPrompt: CanonicalAnalysisRequest = {
      ...dummyRequest,
      renderedPrompt: undefined,
    };

    await expect(provider.analyze(reqWithoutPrompt)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      retryable: false,
    });
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it('500 then 200 gives retryCount 1', async () => {
    let callCount = 0;
    const fakeFetch: typeof fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return new Response('Internal Server Error', { status: 500 });
      }
      return new Response(JSON.stringify(validResponsePayload), { status: 200 });
    };

    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const provider = createGrokProvider({
      apiKey: 'key',
      model: 'grok-beta',
      fetchImpl: fakeFetch,
      sleep: sleepMock,
    });

    const response = await provider.analyze(dummyRequest);
    expect(response.rawProviderMetadata.retryCount).toBe(1);
    expect(callCount).toBe(2);
    expect(sleepMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).toHaveBeenCalledWith(500);
  });

  it('429 is retried', async () => {
    let callCount = 0;
    const fakeFetch: typeof fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return new Response('Too Many Requests', { status: 429 });
      }
      return new Response(JSON.stringify(validResponsePayload), { status: 200 });
    };

    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const provider = createGrokProvider({
      apiKey: 'key',
      model: 'grok-beta',
      fetchImpl: fakeFetch,
      sleep: sleepMock,
    });

    const response = await provider.analyze(dummyRequest);
    expect(response.rawProviderMetadata.retryCount).toBe(1);
    expect(callCount).toBe(2);
    expect(sleepMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).toHaveBeenCalledWith(500);
  });

  it('401 is not retried (AUTH)', async () => {
    let callCount = 0;
    const fakeFetch: typeof fetch = async () => {
      callCount++;
      return new Response('Unauthorized', { status: 401 });
    };

    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const provider = createGrokProvider({
      apiKey: 'key',
      model: 'grok-beta',
      fetchImpl: fakeFetch,
      sleep: sleepMock,
    });

    await expect(provider.analyze(dummyRequest)).rejects.toMatchObject({
      code: 'AUTH',
      retryable: false,
    });
    expect(callCount).toBe(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it('400 is not retried (BAD_REQUEST)', async () => {
    let callCount = 0;
    const fakeFetch: typeof fetch = async () => {
      callCount++;
      return new Response('Bad Request', { status: 400 });
    };

    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const provider = createGrokProvider({
      apiKey: 'key',
      model: 'grok-beta',
      fetchImpl: fakeFetch,
      sleep: sleepMock,
    });

    await expect(provider.analyze(dummyRequest)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      retryable: false,
    });
    expect(callCount).toBe(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it('fetch rejecting with AbortError is retried as TIMEOUT', async () => {
    let callCount = 0;
    const fakeFetch: typeof fetch = async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      return new Response(JSON.stringify(validResponsePayload), { status: 200 });
    };

    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const provider = createGrokProvider({
      apiKey: 'key',
      model: 'grok-beta',
      fetchImpl: fakeFetch,
      sleep: sleepMock,
    });

    const response = await provider.analyze(dummyRequest);
    expect(response.rawProviderMetadata.retryCount).toBe(1);
    expect(callCount).toBe(2);
    expect(sleepMock).toHaveBeenCalledWith(500);
  });

  it('retries exhausted throws the last error', async () => {
    let callCount = 0;
    const fakeFetch: typeof fetch = async () => {
      callCount++;
      return new Response('Gateway Timeout', { status: 504 });
    };

    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const provider = createGrokProvider({
      apiKey: 'key',
      model: 'grok-beta',
      maxRetries: 2,
      fetchImpl: fakeFetch,
      sleep: sleepMock,
    });

    await expect(provider.analyze(dummyRequest)).rejects.toMatchObject({
      code: 'SERVER',
      retryable: true,
    });
    // 1 initial attempt + 2 retries = 3 attempts total
    expect(callCount).toBe(3);
    expect(sleepMock).toHaveBeenCalledTimes(2);
  });

  it('non-JSON content gives INVALID_ENVELOPE with no retry', async () => {
    let callCount = 0;
    const fakeFetch: typeof fetch = async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'this is not valid json {',
              },
            },
          ],
        }),
        { status: 200 }
      );
    };

    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const provider = createGrokProvider({
      apiKey: 'key',
      model: 'grok-beta',
      fetchImpl: fakeFetch,
      sleep: sleepMock,
    });

    await expect(provider.analyze(dummyRequest)).rejects.toMatchObject({
      code: 'INVALID_ENVELOPE',
      retryable: false,
    });
    expect(callCount).toBe(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it('the API key is not present in any thrown error message', async () => {
    const sensitiveApiKey = 'super-secret-xai-api-key-999';

    // 1. Network rejection containing key in error message
    const fakeFetchNetworkErr: typeof fetch = async () => {
      throw new Error(`Failed to connect with token ${sensitiveApiKey}`);
    };

    const provider1 = createGrokProvider({
      apiKey: sensitiveApiKey,
      model: 'grok-beta',
      maxRetries: 0,
      fetchImpl: fakeFetchNetworkErr,
    });

    try {
      await provider1.analyze(dummyRequest);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as Error).message).not.toContain(sensitiveApiKey);
      expect((err as Error).message).toContain('[REDACTED]');
    }

    // 2. HTTP 401 error
    const fakeFetchAuthErr: typeof fetch = async () => {
      return new Response(`Forbidden ${sensitiveApiKey}`, { status: 401 });
    };

    const provider2 = createGrokProvider({
      apiKey: sensitiveApiKey,
      model: 'grok-beta',
      maxRetries: 0,
      fetchImpl: fakeFetchAuthErr,
    });

    try {
      await provider2.analyze(dummyRequest);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as Error).message).not.toContain(sensitiveApiKey);
    }
  });

  it('sleep is called with 500 then 1000', async () => {
    const fakeFetch: typeof fetch = async () => {
      return new Response('503 Service Unavailable', { status: 503 });
    };

    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const provider = createGrokProvider({
      apiKey: 'key',
      model: 'grok-beta',
      maxRetries: 2,
      fetchImpl: fakeFetch,
      sleep: sleepMock,
    });

    await expect(provider.analyze(dummyRequest)).rejects.toMatchObject({
      code: 'SERVER',
    });

    expect(sleepMock).toHaveBeenCalledTimes(2);
    expect(sleepMock.mock.calls[0][0]).toBe(500);
    expect(sleepMock.mock.calls[1][0]).toBe(1000);
  });

  it('healthCheck returns available and vision false without network call', async () => {
    const fakeFetch = vi.fn();
    const provider = createGrokProvider({
      apiKey: 'some-key',
      model: 'grok-beta',
      fetchImpl: fakeFetch,
    });

    const health = await provider.healthCheck();
    expect(health).toEqual({
      available: true,
      model: 'grok-beta',
      capabilities: { vision: false },
    });
    expect(fakeFetch).not.toHaveBeenCalled();

    const emptyKeyProvider = createGrokProvider({
      apiKey: '',
      model: 'grok-beta',
      fetchImpl: fakeFetch,
    });
    const emptyHealth = await emptyKeyProvider.healthCheck();
    expect(emptyHealth.available).toBe(false);
  });
});
