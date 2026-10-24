import type { NormalizedClaim, CandidateCitation } from '../../contracts';

export type AnalysisTaskType =
  | 'vision_transcription'
  | 'extraction'
  | 'response_analysis'
  | 'friction_analysis'
  | 'contradiction_consolidation'
  | 'report_draft';

export interface CanonicalAnalysisRequest {
  taskType: AnalysisTaskType;
  schema: { name: string; version: string };
  prompt: { id: string; version: string };
  evidenceScope: Array<{
    evidenceDisplayId: string;                               // "EV-101"
    segments: Array<{ ordinal: number; locatorType: string; locator: Record<string, unknown>; text: string }>;
    image?: { mimeType: string; base64: string };            // vision tasks only
  }>;
  findingContext?: Array<{
    displayId: string;
    statement: string;
    normalizedClaim?: NormalizedClaim;
    citations: CandidateCitation[];
  }>;                                                        // e.g. VERIFIED claims for contradiction_consolidation
  minimizedInput: Record<string, unknown>;
  renderedPrompt?: { system: string; user: string; jsonSchema?: unknown };
}

export interface CanonicalAnalysisResponse {
  taskType: AnalysisTaskType;
  schemaName: string;
  schemaVersion: string;
  candidates: unknown[];                                      // UNTRUSTED provider JSON; validated by the Gateway (§10.4)
  rawProviderMetadata: {
    provider: string;
    model: string;
    tokensIn?: number;
    tokensOut?: number;
    latencyMs: number;
    retryCount?: number;
  };
}

export interface AIProvider {
  analyze(request: CanonicalAnalysisRequest): Promise<CanonicalAnalysisResponse>;
  healthCheck(): Promise<{ available: boolean; model: string; capabilities: { vision: boolean } }>;
}

export type ProviderErrorCode =
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'SERVER'
  | 'NETWORK'
  | 'AUTH'
  | 'BAD_REQUEST'
  | 'UNSUPPORTED'
  | 'INVALID_ENVELOPE';

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;

  constructor(
    code: ProviderErrorCode,
    messageOrRetryable?: string | boolean,
    retryable?: boolean,
  ) {
    let message: string;
    let isRetryable: boolean;

    if (typeof messageOrRetryable === 'boolean') {
      message = code;
      isRetryable = messageOrRetryable;
    } else {
      message = messageOrRetryable ?? code;
      if (typeof retryable === 'boolean') {
        isRetryable = retryable;
      } else {
        isRetryable = ProviderError.defaultRetryable(code);
      }
    }

    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.retryable = isRetryable;
    Object.setPrototypeOf(this, ProviderError.prototype);
  }

  static defaultRetryable(code: ProviderErrorCode): boolean {
    switch (code) {
      case 'TIMEOUT':
      case 'RATE_LIMIT':
      case 'SERVER':
      case 'NETWORK':
        return true;
      case 'AUTH':
      case 'BAD_REQUEST':
      case 'UNSUPPORTED':
      case 'INVALID_ENVELOPE':
      default:
        return false;
    }
  }
}
