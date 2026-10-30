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
import { buildScope, detokenize, type ScopeItemInput } from '../../ai/gateway/minimizer';

// Import prompts to ensure registration
import '../../ai/prompts/extraction.v1';
import '../../ai/prompts/contradiction.v1';
import '../../ai/prompts/reportDraft.v1';

export interface RealGatewayOptions {
  provider?: AIProvider;
  fixturesDir?: string;
  checkConsent?: (caseId: string) => Promise<{ ok: boolean; reason?: string }>;
}

function detokenizeDeep<T>(value: T, placeholders: Map<string, string>): T {
  if (placeholders.size === 0 || value === undefined || value === null) return value;
  const json = JSON.stringify(value);
  const detokenizedJson = detokenize(json, placeholders);
  try {
    return JSON.parse(detokenizedJson);
  } catch {
    return value;
  }
}

/**
 * RealGatewayAdapter — Adapts the Master Spec v1.4 Gateway & Provider architecture
 * to the AIGatewayInterface consumed by AnalysisWorker.
 *
 * Enforces Invariant §15.2 (Consent & Minimization):
 * - Evidence text is strictly minimized (PII/emails/phones masked, secrets/footers stripped)
 *   via buildScope before being sent to any provider or prompt.
 * - Returned candidate assertions are detokenized locally before envelope validation.
 * - Raw evidence is NEVER transmitted to external model providers.
 */
export class RealGatewayAdapter implements AIGatewayInterface {
  private readonly provider: AIProvider;
  private readonly checkConsentFn?: (caseId: string) => Promise<{ ok: boolean; reason?: string }>;

  constructor(options: RealGatewayOptions = {}) {
    this.checkConsentFn = options.checkConsent;

    if (options.provider) {
      this.provider = options.provider;
    } else {
      const provider = process.env.AI_PROVIDER ?? 'mock';
      const timeoutMs = Number(process.env.AI_TIMEOUT_MS) || 30000;
      const maxRetries = Number(process.env.AI_MAX_RETRIES) || 2;

      if (provider === 'groq') {
        const apiKey = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY)?.trim();
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

    // 0. Defense-in-depth consent check if configured
    if (this.checkConsentFn) {
      if (!task.case_id) {
        throw new Error('AI consent verification requires the task case id');
      }
      const consentCheck = await this.checkConsentFn(task.case_id);
      if (!consentCheck.ok) {
        throw new Error(`AI consent verification failed: ${consentCheck.reason || 'NO_CONSENT'}`);
      }
    }

    // 1. Group segments by evidence display id to prepare for minimization
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

    // Convert into ScopeItemInput format for minimizer
    const scopeItemInputs: ScopeItemInput[] = Array.from(scopeByEvidence.entries()).map(
      ([displayId, segs]) => ({
        evidenceId: displayId,
        evidenceDisplayId: displayId,
        status: 'PROCESSED',
        hashOk: true,
        segments: segs.map((s) => ({
          segmentId: `${displayId}-${s.ordinal}`,
          ordinal: s.ordinal,
          locatorType: s.locatorType,
          locator: s.locator,
          text: s.text,
        })),
      })
    );

    // 2. Apply strict minimization (§15.2) before passing text to prompt or provider
    const scopeResult = buildScope(scopeItemInputs, {
      mode: 'MINIMIZE',
      allowRaw: false,
    });

    const minimizedScope = scopeResult.scope;

    // 3. Resolve prompt from registry
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

    // 4. Batch segments if needed to respect model token limits (e.g. Groq 7,000 ITPM)
    const CHUNK_SIZE = 80;

    // Flatten all segments with their evidenceDisplayId
    const flatSegments: Array<{
      evidenceDisplayId: string;
      segment: typeof minimizedScope[number]['segments'][number];
    }> = [];

    for (const item of minimizedScope) {
      for (const seg of item.segments) {
        flatSegments.push({ evidenceDisplayId: item.evidenceDisplayId, segment: seg });
      }
    }

    let allCandidates: unknown[] = [];
    let totalTokensIn = 0;
    let totalTokensOut = 0;

    if (flatSegments.length <= CHUNK_SIZE) {
      // Single call for small evidence scopes
      const renderedPrompt = promptDef
        ? promptDef.build({ scope: minimizedScope })
        : {
            system: 'You are an extraction engine for DataTrace.',
            user: `Task: extract candidate findings from ${minimizedScope.length} minimized evidence items.`,
          };

      const canonicalReq = {
        taskType: task.task_type,
        schema: { name: task.schema_name, version: task.schema_version },
        prompt: {
          id: promptDef?.id ?? promptId,
          version: promptDef?.version ?? promptVersion,
        },
        evidenceScope: minimizedScope,
        minimizedInput: {
          mode: 'MINIMIZE',
          counts: scopeResult.metadata.counts,
        },
        renderedPrompt,
      };

      const providerResp = await this.provider.analyze(canonicalReq);
      allCandidates = providerResp.candidates ?? [];
      totalTokensIn = providerResp.rawProviderMetadata?.tokensIn ?? 0;
      totalTokensOut = providerResp.rawProviderMetadata?.tokensOut ?? 0;
    } else {
      // Chunked extraction: process in slices to guarantee staying under rate & token limits
      for (let i = 0; i < flatSegments.length; i += CHUNK_SIZE) {
        const chunk = flatSegments.slice(i, i + CHUNK_SIZE);
        const chunkScopeMap = new Map<string, Array<typeof chunk[0]['segment']>>();
        for (const item of chunk) {
          const list = chunkScopeMap.get(item.evidenceDisplayId) ?? [];
          list.push(item.segment);
          chunkScopeMap.set(item.evidenceDisplayId, list);
        }

        const chunkScope = Array.from(chunkScopeMap.entries()).map(([displayId, segs]) => ({
          evidenceDisplayId: displayId,
          segments: segs,
        }));

        const renderedPrompt = promptDef
          ? promptDef.build({ scope: chunkScope })
          : {
              system: 'You are an extraction engine for DataTrace.',
              user: `Task: extract candidate findings from ${chunkScope.length} minimized evidence items.`,
            };

        const canonicalReq = {
          taskType: task.task_type,
          schema: { name: task.schema_name, version: task.schema_version },
          prompt: {
            id: promptDef?.id ?? promptId,
            version: promptDef?.version ?? promptVersion,
          },
          evidenceScope: chunkScope,
          minimizedInput: {
            mode: 'MINIMIZE',
            counts: scopeResult.metadata.counts,
          },
          renderedPrompt,
        };

        const providerResp = await this.provider.analyze(canonicalReq);
        if (Array.isArray(providerResp.candidates)) {
          allCandidates.push(...providerResp.candidates);
        }
        totalTokensIn += providerResp.rawProviderMetadata?.tokensIn ?? 0;
        totalTokensOut += providerResp.rawProviderMetadata?.tokensOut ?? 0;
      }
    }

    // 5. Detokenize returned candidates to restore masked placeholders locally (§15.2)
    const detokenizedCandidates = detokenizeDeep(
      allCandidates,
      scopeResult.placeholders
    );

    // 6. Validate output envelope with detokenized candidates
    const parsedEnv = parseEnvelope({ candidates: detokenizedCandidates });
    if (!parsedEnv.ok) {
      throw new Error(`AI provider returned an invalid candidates envelope: ${parsedEnv.detail ?? 'invalid envelope'}`);
    }
    const validated_output = { candidates: parsedEnv.value };

    const outputJson = JSON.stringify(validated_output);
    const output_sha256 = createHash('sha256').update(outputJson, 'utf8').digest('hex');
    const latency_ms = Date.now() - start;

    return {
      validated_output,
      output_sha256,
      tokens_in: totalTokensIn,
      tokens_out: totalTokensOut,
      latency_ms,
      fallback_used: false,
    };
  }
}
