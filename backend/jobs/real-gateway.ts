import { createHash } from 'node:crypto';
import * as path from 'node:path';
import type { AIGatewayInterface, QueuedTask, TaskResult } from './types';
import type { ScopeMap } from '../../ai/gateway/scope';
import { getPrompt } from '../../ai/prompts/registry';
import { createMockProvider, loadFixtures } from '../../ai/providers/mock';
import { createGrokProvider } from '../../ai/providers/grok';
import { createGroqProvider } from '../../ai/providers/groq';
import type { AIProvider } from '../../ai/providers/interface';
import { parseEnvelope } from '../../contracts/schemas/findings';

// Import prompts to ensure registration
import '../../ai/prompts/extraction.v1';
import '../../ai/prompts/contradiction.v1';
import '../../ai/prompts/reportDraft.v1';

export interface RealGatewayOptions {
  provider?: AIProvider;
  fixturesDir?: string;
}

/**
 * RealGatewayAdapter — Adapts the Master Spec v1.4 Gateway & Provider architecture
 * to the AIGatewayInterface consumed by AnalysisWorker.
 *
 * It uses the registered prompt registry and either:
 * - GroqProvider (when AI_PROVIDER=groq and GROQ_API_KEY is configured)
 * - GrokProvider (when AI_PROVIDER=grok and XAI_API_KEY is configured)
 * - MockProvider (replaying recorded fixtures deterministically offline)
 */
export class RealGatewayAdapter implements AIGatewayInterface {
  private readonly provider: AIProvider;

  constructor(options: RealGatewayOptions = {}) {
    if (options.provider) {
      this.provider = options.provider;
    } else {
      const provider = process.env.AI_PROVIDER ?? 'mock';
      const timeoutMs = Number(process.env.AI_TIMEOUT_MS) || 30000;
      const maxRetries = Number(process.env.AI_MAX_RETRIES) || 2;

      if (provider === 'groq') {
        const apiKey = process.env.GROQ_API_KEY?.trim();
        if (!apiKey) {
          throw new Error('AI_PROVIDER=groq requires GROQ_API_KEY to be configured.');
        }
        this.provider = createGroqProvider({
          apiKey,
          model: process.env.GROQ_MODEL || process.env.AI_MODEL || 'qwen/qwen3.8-27b',
          timeoutMs,
          maxRetries,
        });
      } else if (provider === 'grok') {
        const apiKey = process.env.XAI_API_KEY?.trim();
        if (!apiKey) {
          throw new Error('AI_PROVIDER=grok requires XAI_API_KEY to be configured.');
        }
        this.provider = createGrokProvider({
          apiKey,
          model: process.env.AI_MODEL || 'grok-beta',
          timeoutMs,
          maxRetries,
        });
      } else if (provider === 'mock') {
        const fixturesDir =
          options.fixturesDir ?? path.resolve(__dirname, '../../tests/synthetic/fixtures');
        this.provider = createMockProvider({ fixtures: loadFixtures(fixturesDir) });
      } else {
        throw new Error(`Unsupported AI_PROVIDER "${provider}". Use "groq", "grok", or "mock".`);
      }
    }
  }

  async run(
    task: QueuedTask,
    _scopeMap: ScopeMap,
    segments: Array<{
      evidence_display_id: string;
      ordinal: number;
      segment_text: string;
      locator_type: string;
      locator: unknown;
    }>
  ): Promise<TaskResult> {
    const start = Date.now();

    // 1. Group segments by evidence display id to form prompt scope
    const scopeByEvidence = new Map<
      string,
      Array<{
        ordinal: number;
        locatorType: string;
        locator: Record<string, unknown>;
        text: string;
      }>
    >();

    for (const seg of segments) {
      const list = scopeByEvidence.get(seg.evidence_display_id) ?? [];
      list.push({
        ordinal: seg.ordinal,
        locatorType: seg.locator_type,
        locator: (seg.locator ?? {}) as Record<string, unknown>,
        text: seg.segment_text,
      });
      scopeByEvidence.set(seg.evidence_display_id, list);
    }

    const promptScope = Array.from(scopeByEvidence.entries()).map(([dispId, segs]) => ({
      evidenceDisplayId: dispId,
      segments: segs,
    }));

    // 2. Resolve prompt from registry
    let promptId = task.prompt_id;
    let promptVersion = task.prompt_version;
    if (promptId.includes('.')) {
      const parts = promptId.split('.');
      promptId = parts[0];
      promptVersion = parts[1] || 'v1';
    }

    const promptDef =
      getPrompt(promptId, promptVersion) ??
      getPrompt(task.task_type, 'v1');

    const renderedPrompt = promptDef
      ? promptDef.build({ scope: promptScope })
      : {
          system: 'You are an extraction engine for DataTrace.',
          user: `Task: extract candidate findings from ${segments.length} segments.`,
        };

    // 3. Invoke provider
    const canonicalReq = {
      taskType: task.task_type,
      schema: { name: task.schema_name, version: task.schema_version },
      prompt: {
        id: promptDef?.id ?? promptId,
        version: promptDef?.version ?? promptVersion,
      },
      evidenceScope: promptScope,
      minimizedInput: {},
      renderedPrompt,
    };

    const providerResp = await this.provider.analyze(canonicalReq);

    // 4. Validate output envelope
    const parsedEnv = parseEnvelope({ candidates: providerResp.candidates });
    if (!parsedEnv.ok) {
      throw new Error(`AI provider returned an invalid candidates envelope: ${parsedEnv.detail ?? 'invalid envelope'}`);
    }
    const validated_output = { candidates: parsedEnv.value };

    const outputJson = JSON.stringify(validated_output);
    const output_sha256 = createHash('sha256').update(outputJson, 'utf8').digest('hex');
    const latency_ms = providerResp.rawProviderMetadata?.latencyMs ?? Date.now() - start;

    return {
      validated_output,
      output_sha256,
      tokens_in: providerResp.rawProviderMetadata?.tokensIn ?? 0,
      tokens_out: providerResp.rawProviderMetadata?.tokensOut ?? 0,
      latency_ms,
      fallback_used: false,
    };
  }
}
