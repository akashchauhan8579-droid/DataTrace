import { createGrokProvider } from './grok';
import type { CreateGrokProviderOptions } from './grok';
import type { AIProvider } from './interface';

export type CreateGroqProviderOptions = Omit<CreateGrokProviderOptions, 'baseUrl' | 'providerName'>;

export function createGroqProvider(options: CreateGroqProviderOptions): AIProvider {
  return createGrokProvider({
    ...options,
    providerName: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
  });
}
