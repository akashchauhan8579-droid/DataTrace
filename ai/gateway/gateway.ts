import { parseEnvelope } from '../../contracts/schemas/findings';
import { checkConsent } from './consent';
import { buildScope, detokenize, MinimizationMode, ScopeItemInput } from './minimizer';
import { resolveCandidates, ResolvedCandidate, ResolverStore } from './resolver';
import { getPrompt } from '../prompts/registry';
import type {
  AIProvider,
  AnalysisTaskType,
  CanonicalAnalysisRequest,
  CanonicalAnalysisResponse,
} from '../providers/interface';
import { ProviderError } from '../providers/interface';

export interface GatewayStore {
  isCaseOwner(caseId: string, userId: string): boolean;
  getConsent(caseId: string): { policyVersion: string; revokedAt?: string | null } | null;
  loadEvidenceForScope(caseId: string, itemIds?: string[]): ScopeItemInput[];
  quarantine(evidenceId: string): void;
  createTask(t: { caseId: string; taskType: string; promptId: string; promptVersion: string }): { taskId: string };
  finishTask(
    taskId: string,
    r: {
      status: 'COMPLETED' | 'FAILED';
      failure?: string;
      accepted: number;
      rejected: unknown[];
      metadata: Record<string, unknown>;
    },
  ): void;
  persistFindings(
    caseId: string,
    taskId: string,
    items: ResolvedCandidate[],
  ): { displayIds: string[] };
}

export interface AuditPort {
  append(e: { type: string; caseId: string; payload: Record<string, unknown> }): void;
}

export interface GatewayDeps {
  store: GatewayStore;
  resolverStore: ResolverStore;
  provider: AIProvider;
  fallbackProvider?: AIProvider;
  audit: AuditPort;
  clock: () => Date;
  policyVersion: string;
  tokenBudget: number;
}

export type GatewayFailure =
  | 'NOT_OWNER'
  | 'NO_CONSENT'
  | 'POLICY_OUTDATED'
  | 'REVOKED'
  | 'RAW_NOT_AUTHORIZED'
  | 'NO_SCOPE'
  | 'TOKEN_BUDGET'
  | 'PROVIDER_ERROR'
  | 'ENVELOPE_INVALID'
  | 'ALL_CANDIDATES_INVALID';

export interface RunAnalysisRequest {
  caseId: string;
  userId: string;
  taskType: AnalysisTaskType;
  promptId: string;
  promptVersion: string;
  mode: MinimizationMode;
  allowRawEvidence?: boolean;
}

export interface RunAnalysisResult {
  status: 'COMPLETED' | 'FAILED';
  taskId?: string;
  accepted: number;
  rejected: Array<{ index: number; reason: string }>;
  failure?: GatewayFailure;
  fallbackUsed: boolean;
  retryCount: number;
}

export async function runAnalysis(
  req: RunAnalysisRequest,
  deps: GatewayDeps,
): Promise<RunAnalysisResult> {
  // 1. Ownership check
  if (!deps.store.isCaseOwner(req.caseId, req.userId)) {
    return {
      status: 'FAILED',
      failure: 'NOT_OWNER',
      accepted: 0,
      rejected: [],
      fallbackUsed: false,
      retryCount: 0,
    };
  }

  // 2. Consent check
  const consentRow = deps.store.getConsent(req.caseId);
  const consentRes = checkConsent(consentRow, deps.policyVersion);
  if (!consentRes.ok) {
    let failureReason: GatewayFailure = 'NO_CONSENT';
    if (consentRes.reason === 'REVOKED') failureReason = 'REVOKED';
    else if (consentRes.reason === 'POLICY_OUTDATED') failureReason = 'POLICY_OUTDATED';

    return {
      status: 'FAILED',
      failure: failureReason,
      accepted: 0,
      rejected: [],
      fallbackUsed: false,
      retryCount: 0,
    };
  }

  if (req.mode === 'RAW' && req.allowRawEvidence !== true) {
    return {
      status: 'FAILED',
      failure: 'RAW_NOT_AUTHORIZED',
      accepted: 0,
      rejected: [],
      fallbackUsed: false,
      retryCount: 0,
    };
  }

  // 3. Task selector / prompt registry
  const promptDef = getPrompt(req.promptId, req.promptVersion);
  if (!promptDef) {
    return {
      status: 'FAILED',
      failure: 'PROVIDER_ERROR',
      accepted: 0,
      rejected: [],
      fallbackUsed: false,
      retryCount: 0,
    };
  }

  // 4. Create task
  const { taskId } = deps.store.createTask({
    caseId: req.caseId,
    taskType: req.taskType,
    promptId: req.promptId,
    promptVersion: req.promptVersion,
  });

  // 5. Evidence loading, hash re-check and quarantine
  const loadedEvidence = deps.store.loadEvidenceForScope(req.caseId);
  const validEvidenceItems: ScopeItemInput[] = [];

  for (const item of loadedEvidence) {
    if (item.hashOk === false) {
      deps.store.quarantine(item.evidenceId ?? (item as any).id);
    } else {
      validEvidenceItems.push(item);
    }
  }

  // 6. Minimizer and scope building
  const scopeResult = buildScope(validEvidenceItems, {
    mode: req.mode,
    allowRaw: req.mode === 'RAW' && req.allowRawEvidence === true,
  });
  const hasSegments = scopeResult.scope.some((s) => s.segments.length > 0);

  if (!hasSegments || scopeResult.scope.length === 0) {
    deps.store.finishTask(taskId, {
      status: 'FAILED',
      failure: 'NO_SCOPE',
      accepted: 0,
      rejected: [],
      metadata: {},
    });
    deps.audit.append({
      type: 'AI_ANALYSIS_FAILED',
      caseId: req.caseId,
      payload: { taskId, reason: 'NO_SCOPE' },
    });
    return {
      status: 'FAILED',
      taskId,
      accepted: 0,
      rejected: [],
      failure: 'NO_SCOPE',
      fallbackUsed: false,
      retryCount: 0,
    };
  }

  // Render prompt
  const renderedPrompt = promptDef.build({ scope: scopeResult.scope });

  // 7. Token budget check (characters / 4)
  const estimatedInputTokens = Math.ceil(
    (renderedPrompt.system.length + renderedPrompt.user.length) / 4,
  );
  if (estimatedInputTokens > deps.tokenBudget) {
    deps.store.finishTask(taskId, {
      status: 'FAILED',
      failure: 'TOKEN_BUDGET',
      accepted: 0,
      rejected: [],
      metadata: { estimatedTokens: estimatedInputTokens, tokenBudget: deps.tokenBudget },
    });
    deps.audit.append({
      type: 'AI_ANALYSIS_FAILED',
      caseId: req.caseId,
      payload: { taskId, reason: 'TOKEN_BUDGET' },
    });
    return {
      status: 'FAILED',
      taskId,
      accepted: 0,
      rejected: [],
      failure: 'TOKEN_BUDGET',
      fallbackUsed: false,
      retryCount: 0,
    };
  }

  // 8. AI_ANALYSIS_STARTED audit
  deps.audit.append({
    type: 'AI_ANALYSIS_STARTED',
    caseId: req.caseId,
    payload: {
      taskId,
      taskType: req.taskType,
      prompt: { id: req.promptId, version: req.promptVersion },
      scopeSummary: scopeResult.scope.map((s) => ({
        evidenceDisplayId: s.evidenceDisplayId,
        segmentOrdinals: s.segments.map((seg) => seg.ordinal),
      })),
      provider: 'ai',
    },
  });

  // 9. Call provider (with fallback if primary fails with retryable error)
  const canonicalReq: CanonicalAnalysisRequest = {
    taskType: req.taskType,
    schema: { name: req.promptId, version: req.promptVersion },
    prompt: { id: req.promptId, version: req.promptVersion },
    evidenceScope: scopeResult.scope,
    minimizedInput: { mode: req.mode },
    renderedPrompt,
  };

  let fallbackUsed = false;
  let providerResponse: CanonicalAnalysisResponse;

  try {
    providerResponse = await deps.provider.analyze(canonicalReq);
  } catch (err: unknown) {
    if (
      err instanceof ProviderError &&
      err.retryable &&
      deps.fallbackProvider
    ) {
      try {
        fallbackUsed = true;
        providerResponse = await deps.fallbackProvider.analyze(canonicalReq);
      } catch (fallbackErr) {
        const failureReason: GatewayFailure =
          fallbackErr instanceof ProviderError && fallbackErr.code === 'INVALID_ENVELOPE'
            ? 'ENVELOPE_INVALID'
            : 'PROVIDER_ERROR';
        deps.store.finishTask(taskId, {
          status: 'FAILED',
          failure: failureReason,
          accepted: 0,
          rejected: [],
          metadata: { error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr) },
        });
        deps.audit.append({
          type: 'AI_ANALYSIS_FAILED',
          caseId: req.caseId,
          payload: { taskId, reason: failureReason },
        });
        return {
          status: 'FAILED',
          taskId,
          accepted: 0,
          rejected: [],
          failure: failureReason,
          fallbackUsed,
          retryCount: 0,
        };
      }
    } else {
      const failureReason: GatewayFailure =
        err instanceof ProviderError && err.code === 'INVALID_ENVELOPE'
          ? 'ENVELOPE_INVALID'
          : 'PROVIDER_ERROR';
      deps.store.finishTask(taskId, {
        status: 'FAILED',
        failure: failureReason,
        accepted: 0,
        rejected: [],
        metadata: { error: err instanceof Error ? err.message : String(err) },
      });
      deps.audit.append({
        type: 'AI_ANALYSIS_FAILED',
        caseId: req.caseId,
        payload: { taskId, reason: failureReason },
      });
      return {
        status: 'FAILED',
        taskId,
        accepted: 0,
        rejected: [],
        failure: failureReason,
        fallbackUsed: false,
        retryCount: 0,
      };
    }
  }

  // 10. Two-level validation
  // Level A: Envelope
  const envelopeInput =
    typeof providerResponse === 'object' &&
    providerResponse !== null &&
    'rawProviderMetadata' in providerResponse
      ? { candidates: (providerResponse as any).candidates }
      : providerResponse;
  const envelopeCheck = parseEnvelope(envelopeInput);
  if (!envelopeCheck.ok) {
    deps.store.finishTask(taskId, {
      status: 'FAILED',
      failure: 'ENVELOPE_INVALID',
      accepted: 0,
      rejected: [],
      metadata: { error: envelopeCheck.detail },
    });
    deps.audit.append({
      type: 'AI_ANALYSIS_FAILED',
      caseId: req.caseId,
      payload: { taskId, reason: 'ENVELOPE_INVALID' },
    });
    return {
      status: 'FAILED',
      taskId,
      accepted: 0,
      rejected: [],
      failure: 'ENVELOPE_INVALID',
      fallbackUsed,
      retryCount: providerResponse.rawProviderMetadata?.retryCount ?? 0,
    };
  }

  const rawCandidates = envelopeCheck.value;

  // Level B: Per candidate resolution
  const resolveResult = resolveCandidates(rawCandidates, {
    caseId: req.caseId,
    scopeMap: scopeResult.scopeMap,
    store: deps.resolverStore,
    detokenize: (text: string) => detokenize(text, scopeResult.placeholders),
  });

  if (rawCandidates.length > 0 && resolveResult.accepted.length === 0) {
    deps.store.finishTask(taskId, {
      status: 'FAILED',
      failure: 'ALL_CANDIDATES_INVALID',
      accepted: 0,
      rejected: resolveResult.rejected,
      metadata: {},
    });
    deps.audit.append({
      type: 'AI_ANALYSIS_FAILED',
      caseId: req.caseId,
      payload: { taskId, reason: 'ALL_CANDIDATES_INVALID' },
    });
    return {
      status: 'FAILED',
      taskId,
      accepted: 0,
      rejected: resolveResult.rejected,
      failure: 'ALL_CANDIDATES_INVALID',
      fallbackUsed,
      retryCount: providerResponse.rawProviderMetadata?.retryCount ?? 0,
    };
  }

  // 11. Persist findings & rewrite local refs in payloads
  const { displayIds } = deps.store.persistFindings(
    req.caseId,
    taskId,
    resolveResult.accepted,
  );

  // Build ref map for rewriting batch-local refs to assigned display IDs
  const localRefToDisplayId = new Map<string, string>();
  for (let i = 0; i < resolveResult.accepted.length; i++) {
    const item = resolveResult.accepted[i];
    const assignedDisplayId = displayIds[i];
    const localRef = item.candidate.ref;
    if (localRef && assignedDisplayId) {
      localRefToDisplayId.set(localRef, assignedDisplayId);
    }
  }

  function rewriteRef(val: unknown): unknown {
    if (typeof val === 'string' && localRefToDisplayId.has(val)) {
      return localRefToDisplayId.get(val)!;
    }
    return val;
  }

  function rewritePayloadRefs(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(rewritePayloadRefs);

    const record = obj as Record<string, unknown>;
    const updated: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
      if (
        key === 'fromRef' ||
        key === 'toRef' ||
        key === 'claimARef' ||
        key === 'claimBRef'
      ) {
        updated[key] = rewriteRef(value);
      } else if (key === 'addresses' || key === 'relatedRefs') {
        if (Array.isArray(value)) {
          updated[key] = value.map(rewriteRef);
        } else {
          updated[key] = value;
        }
      } else if (typeof value === 'object' && value !== null) {
        updated[key] = rewritePayloadRefs(value);
      } else {
        updated[key] = value;
      }
    }
    return updated;
  }

  for (const item of resolveResult.accepted) {
    if (item.candidate.structuredPayload) {
      item.candidate.structuredPayload = rewritePayloadRefs(
        item.candidate.structuredPayload,
      ) as any;
    }
  }

  // 12. AI_ANALYSIS_COMPLETED audit
  deps.audit.append({
    type: 'AI_ANALYSIS_COMPLETED',
    caseId: req.caseId,
    payload: {
      taskId,
      model: providerResponse.rawProviderMetadata.model,
      latencyMs: providerResponse.rawProviderMetadata.latencyMs,
      tokensIn: providerResponse.rawProviderMetadata.tokensIn,
      tokensOut: providerResponse.rawProviderMetadata.tokensOut,
      retryCount: providerResponse.rawProviderMetadata.retryCount ?? 0,
      fallbackUsed,
      accepted: resolveResult.accepted.length,
      rejected: resolveResult.rejected.length,
    },
  });

  // Finish task as COMPLETED
  deps.store.finishTask(taskId, {
    status: 'COMPLETED',
    accepted: resolveResult.accepted.length,
    rejected: resolveResult.rejected,
    metadata: {
      model: providerResponse.rawProviderMetadata.model,
      latencyMs: providerResponse.rawProviderMetadata.latencyMs,
    },
  });

  return {
    status: 'COMPLETED',
    taskId,
    accepted: resolveResult.accepted.length,
    rejected: resolveResult.rejected,
    fallbackUsed,
    retryCount: providerResponse.rawProviderMetadata.retryCount ?? 0,
  };
}
