import {
  AIProvider,
  CanonicalAnalysisRequest,
  CanonicalAnalysisResponse,
  ProviderError,
} from './interface';

export interface CreateGrokProviderOptions {
  apiKey: string;
  model: string;
  providerName?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export function createGrokProvider({
  apiKey,
  model,
  providerName = 'grok',
  baseUrl = 'https://api.x.ai/v1',
  timeoutMs = 30000,
  maxRetries = 2,
  fetchImpl = fetch,
  sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
}: CreateGrokProviderOptions): AIProvider {
  function redact(str: string): string {
    if (!apiKey || typeof str !== 'string') return str;
    return str.split(apiKey).join('[REDACTED]');
  }

  function wrapError(err: unknown): ProviderError {
    if (err instanceof ProviderError) {
      if (apiKey && err.message.includes(apiKey)) {
        return new ProviderError(err.code, redact(err.message), err.retryable);
      }
      return err;
    }
    if (err instanceof Error) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        return new ProviderError('TIMEOUT', redact(err.message || 'Request timed out'), true);
      }
      return new ProviderError('NETWORK', redact(err.message || 'Network request failed'), true);
    }
    return new ProviderError('NETWORK', 'Network request failed', true);
  }

  const trimmedBase = baseUrl.replace(/\/+$/, '');
  const endpoint = `${trimmedBase}/chat/completions`;

  return {
    async analyze(request: CanonicalAnalysisRequest): Promise<CanonicalAnalysisResponse> {
      if (!request.renderedPrompt) {
        throw new ProviderError('BAD_REQUEST', 'Missing renderedPrompt on CanonicalAnalysisRequest', false);
      }

      const requestBody = JSON.stringify({
        model,
        messages: [
          { role: 'system', content: request.renderedPrompt.system },
          { role: 'user', content: request.renderedPrompt.user },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      });

      const startTime = Date.now();
      let retryCount = 0;
      let lastError: ProviderError | undefined;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          retryCount++;
          const backoffMs = 500 * Math.pow(2, attempt - 1);
          await sleep(backoffMs);
        }

        try {
          const controller = new AbortController();
          let timer: ReturnType<typeof setTimeout> | undefined;

          if (timeoutMs > 0) {
            timer = setTimeout(() => {
              controller.abort();
            }, timeoutMs);
          }

          let res: Response;
          try {
            res = await fetchImpl(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
              },
              body: requestBody,
              signal: controller.signal,
            });
          } catch (fetchErr: unknown) {
            if (
              controller.signal.aborted ||
              (fetchErr instanceof Error && (fetchErr.name === 'AbortError' || fetchErr.name === 'TimeoutError'))
            ) {
              throw new ProviderError('TIMEOUT', redact(fetchErr instanceof Error ? fetchErr.message : 'Request timed out'), true);
            }
            throw wrapError(fetchErr);
          } finally {
            if (timer !== undefined) {
              clearTimeout(timer);
            }
          }

          if (!res.ok) {
            let detail = '';
            try {
              const errText = await res.text();
              const errObj = JSON.parse(errText);
              detail = errObj?.error?.message || errText;
            } catch {
              detail = '';
            }

            if (res.status === 429 || res.status === 413 || detail.toLowerCase().includes('rate limit') || detail.toLowerCase().includes('too large') || detail.toLowerCase().includes('tokens')) {
              throw new ProviderError('RATE_LIMIT', detail || `Rate or token limit exceeded (HTTP ${res.status})`, true);
            }
            if (res.status === 401 || res.status === 403) {
              throw new ProviderError('AUTH', detail || `Authentication failed (HTTP ${res.status})`, false);
            }
            if (res.status >= 500 && res.status < 600) {
              throw new ProviderError('SERVER', detail || `Server error (HTTP ${res.status})`, true);
            }
            if (res.status >= 400 && res.status < 500) {
              throw new ProviderError('BAD_REQUEST', detail || `Bad request (HTTP ${res.status})`, false);
            }
            throw new ProviderError('SERVER', detail || `Unexpected HTTP status ${res.status}`, true);
          }

          let responseJson: unknown;
          try {
            responseJson = await res.json();
          } catch {
            throw new ProviderError('INVALID_ENVELOPE', 'Response body is not valid JSON', false);
          }

          if (
            typeof responseJson !== 'object' ||
            responseJson === null ||
            !('choices' in responseJson) ||
            !Array.isArray((responseJson as Record<string, unknown>).choices)
          ) {
            throw new ProviderError('INVALID_ENVELOPE', 'Missing choices array in response', false);
          }

          const choices = (responseJson as { choices: unknown[] }).choices;
          if (choices.length === 0) {
            throw new ProviderError('INVALID_ENVELOPE', 'choices array is empty', false);
          }

          const firstChoice = choices[0];
          if (
            typeof firstChoice !== 'object' ||
            firstChoice === null ||
            !('message' in firstChoice)
          ) {
            throw new ProviderError('INVALID_ENVELOPE', 'Missing message in choices[0]', false);
          }

          const message = (firstChoice as { message: unknown }).message;
          if (
            typeof message !== 'object' ||
            message === null ||
            !('content' in message) ||
            typeof (message as { content: unknown }).content !== 'string'
          ) {
            throw new ProviderError('INVALID_ENVELOPE', 'Missing content string in choices[0].message', false);
          }

          const contentStr = (message as { content: string }).content;
          let parsedContent: unknown;
          try {
            parsedContent = JSON.parse(contentStr);
          } catch {
            throw new ProviderError('INVALID_ENVELOPE', 'choices[0].message.content is not valid JSON', false);
          }

          if (
            typeof parsedContent !== 'object' ||
            parsedContent === null ||
            Array.isArray(parsedContent) ||
            !('candidates' in parsedContent) ||
            !Array.isArray((parsedContent as Record<string, unknown>).candidates)
          ) {
            throw new ProviderError('INVALID_ENVELOPE', 'choices[0].message.content must be an object with an array candidates', false);
          }

          const candidates = (parsedContent as { candidates: unknown[] }).candidates;
          const usage = (responseJson as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } }).usage;
          const tokensIn = typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : undefined;
          const tokensOut = typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : undefined;

          return {
            taskType: request.taskType,
            schemaName: request.schema.name,
            schemaVersion: request.schema.version,
            candidates,
            rawProviderMetadata: {
              provider: providerName,
              model,
              tokensIn,
              tokensOut,
              latencyMs: Date.now() - startTime,
              retryCount,
            },
          };
        } catch (err: unknown) {
          const providerError = wrapError(err);
          lastError = providerError;

          if (!providerError.retryable || attempt === maxRetries) {
            throw providerError;
          }
        }
      }

      throw lastError ?? new ProviderError('SERVER', 'Request failed after retries', false);
    },

    async healthCheck(): Promise<{ available: boolean; model: string; capabilities: { vision: boolean } }> {
      return {
        available: Boolean(apiKey && apiKey.trim().length > 0),
        model,
        capabilities: { vision: false },
      };
    },
  };
}
