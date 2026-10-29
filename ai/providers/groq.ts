import { createGrokProvider } from './grok';
import type { CreateGrokProviderOptions } from './grok';
import type {
  AIProvider,
  CanonicalAnalysisRequest,
  CanonicalAnalysisResponse,
} from './interface';
import { ProviderError } from './interface';

export interface CreateGroqProviderOptions
  extends Omit<CreateGrokProviderOptions, 'baseUrl' | 'providerName' | 'apiKey'> {
  apiKey?: string;
  apiKeys?: string[];
}

/**
 * Creates a Groq AI provider with built-in multi-key pooling,
 * round-robin distribution, and automatic failover on HTTP 429 (Rate Limit).
 */
export function createGroqProvider(options: CreateGroqProviderOptions): AIProvider {
  // 1. Collect all available keys (from options or env vars)
  const envKeysRaw = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '';
  const parsedEnvKeys = envKeysRaw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  const directKeys = options.apiKeys || (options.apiKey ? options.apiKey.split(',').map((k) => k.trim()).filter(Boolean) : []);
  const allKeys = Array.from(new Set([...directKeys, ...parsedEnvKeys]));

  if (allKeys.length === 0) {
    return {
      async analyze() {
        throw new ProviderError(
          'AUTH',
          'AI_PROVIDER=groq requires at least one GROQ_API_KEY or GROQ_API_KEYS configured.'

        );
      },
      async healthCheck() {
        return {
          available: false,
          model: options.model || 'qwen/qwen3.8-27b',
          capabilities: { vision: false },
        };
      },
    };
  }

  // 2. Pre-create underlying providers for each key
  const providers = allKeys.map((key) =>
    createGrokProvider({
      ...options,
      apiKey: key,
      providerName: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
    })
  );

  let keyCounter = 0;

  return {
    async analyze(request: CanonicalAnalysisRequest): Promise<CanonicalAnalysisResponse> {
      const startIndex = keyCounter % providers.length;
      keyCounter++;

      let lastError: unknown;

      // Try each key starting from round-robin index
      for (let attempt = 0; attempt < providers.length; attempt++) {
        const currentIndex = (startIndex + attempt) % providers.length;
        const currentProvider = providers[currentIndex];
        const currentKeyMasked = allKeys[currentIndex].slice(0, 8) + '...';

        try {
          const response = await currentProvider.analyze(request);
          return response;
        } catch (err: unknown) {
          lastError = err;

          // If it's a rate limit error (HTTP 429) and we have other keys, try the next key
          if (
            err instanceof ProviderError &&
            err.code === 'RATE_LIMIT' &&
            providers.length > 1 &&
            attempt < providers.length - 1
          ) {
            console.warn(
              `[GroqPool] Key ${currentKeyMasked} hit rate limit. Failing over to next key in pool...`
            );
            continue;
          }

          // For other errors (or last key), rethrow
          throw err;
        }
      }

      throw lastError;
    },

    async healthCheck(): Promise<{ available: boolean; model: string; capabilities: { vision: boolean } }> {
      return providers[0].healthCheck();
    },
  };
}
