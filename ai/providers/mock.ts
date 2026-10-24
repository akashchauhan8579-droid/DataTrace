import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AIProvider,
  CanonicalAnalysisRequest,
  CanonicalAnalysisResponse,
  ProviderError,
} from './interface';

export interface MockProviderOptions {
  fixtures?: Record<string, unknown[]>;
  failWith?: Error;
}

export interface MockProvider extends AIProvider {
  calls: CanonicalAnalysisRequest[];
}

export function loadFixtures(dir: string): Record<string, unknown[]> {
  const fixtures: Record<string, unknown[]> = {};
  if (!fs.existsSync(dir)) {
    return fixtures;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      const fullPath = path.join(dir, entry.name);
      const raw = fs.readFileSync(fullPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(parsed)
        ? parsed
        : (Array.isArray(parsed?.candidates) ? parsed.candidates : []);

      const key = entry.name.slice(0, -5);
      fixtures[key] = candidates;

      if (entry.name.endsWith('.sample.json')) {
        const baseKey = entry.name.slice(0, -('.sample.json'.length));
        if (!fixtures[baseKey]) {
          fixtures[baseKey] = candidates;
        }
      }
    }
  }

  return fixtures;
}

export function createMockProvider(options: MockProviderOptions = {}): MockProvider {
  const calls: CanonicalAnalysisRequest[] = [];
  const fixtures = options.fixtures ?? {};

  return {
    calls,
    async analyze(request: CanonicalAnalysisRequest): Promise<CanonicalAnalysisResponse> {
      calls.push(request);

      if (options.failWith) {
        throw options.failWith;
      }

      const key = `${request.prompt.id}.${request.prompt.version}`;
      const fixture = fixtures[key];
      if (!fixture) {
        throw new ProviderError('UNSUPPORTED', `No fixture found for prompt key: ${key}`);
      }

      return {
        taskType: request.taskType,
        schemaName: request.schema.name,
        schemaVersion: request.schema.version,
        candidates: structuredClone(fixture),
        rawProviderMetadata: {
          provider: 'mock',
          model: 'mock-1',
          tokensIn: 0,
          tokensOut: 0,
          latencyMs: 0,
        },
      };
    },
    async healthCheck() {
      return {
        available: true,
        model: 'mock-1',
        capabilities: { vision: true },
      };
    },
  };
}
