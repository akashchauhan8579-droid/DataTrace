import type { ScopeMap } from './scope';
import { scopeKey } from './scope';

export type MinimizationMode = 'MINIMIZE' | 'REDACT' | 'RAW' | 'LOCAL_ONLY';

export interface ScopeSegmentInput {
  segmentId: string;
  ordinal: number;
  locatorType: string;
  locator: Record<string, unknown>;
  text: string;
}

export interface ScopeItemInput {
  evidenceId: string;
  evidenceDisplayId: string;
  status: 'PROCESSED' | 'QUARANTINED' | 'DELETED' | 'PENDING';
  hashOk: boolean;
  segments: ScopeSegmentInput[];
}

export type MinimizedScope = Array<{
  evidenceDisplayId: string;
  segments: Array<{
    ordinal: number;
    locatorType: string;
    locator: Record<string, unknown>;
    text: string;
  }>;
}>;

export interface BuildScopeOptions {
  mode: MinimizationMode;
  knownNames?: string[];
  keepIdentifiers?: boolean;
  allowRaw?: boolean;
}

export interface BuildScopeResult {
  scope: MinimizedScope;
  scopeMap: ScopeMap;
  placeholders: Map<string, string>;
  skipped: Array<{
    evidenceDisplayId: string;
    reason: 'LOCAL_ONLY' | 'HASH_MISMATCH' | 'NOT_PROCESSED' | 'EMPTY';
  }>;
  metadata: {
    mode: MinimizationMode;
    counts: Record<string, number>;
  };
}

interface MinimizerState {
  placeholders: Map<string, string>;
  tokensByOriginal: Map<string, string>;
  counters: MinimizationCounts;
  nextPlaceholder: Record<PlaceholderKind, number>;
}

interface MinimizationCounts extends Record<string, number> {
  footersStripped: number;
  secretsStripped: number;
  cardsMasked: number;
  placeholdersCreated: number;
}

type PlaceholderKind = 'EMAIL' | 'PHONE' | 'NAME';

interface PreparedName {
  pattern: RegExp;
}

const footerMarkers = [
  'unsubscribe',
  'you are receiving this',
  'view in browser',
  'sent from my',
];

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phoneCandidatePattern = /(?<![\d+])\+?\d[\d\s().-]{7,}\d(?!\d)/g;
const cardCandidatePattern = /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const credentialAssignmentPattern = /\b(?:password|passwd|passcode|otp|api[_\s-]*key|private[_\s-]*key|access[_\s-]*key|client[_\s-]*secret|refresh[_\s-]*token|access[_\s-]*token|auth[_\s-]*token|token|secret)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const jwtPattern = /\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g;

function isFooterLine(line: string): boolean {
  const lower = line.toLowerCase();
  return footerMarkers.some((marker) => lower.includes(marker)) || /https?:\/\/\S*\butm_[a-z0-9_]+/i.test(line);
}

function luhnIsValid(digits: string): boolean {
  let sum = 0;
  let shouldDouble = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    const digit = Number(digits[index]);
    let value = digit;
    if (shouldDouble) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

function placeholderFor(
  original: string,
  kind: PlaceholderKind,
  state: MinimizerState,
): string {
  const identity = `${kind}:${original}`;
  const existing = state.tokensByOriginal.get(identity);
  if (existing !== undefined) return existing;

  const number = state.nextPlaceholder[kind]++;
  const token = `[${kind}_${number}]`;
  state.tokensByOriginal.set(identity, token);
  state.placeholders.set(token, original);
  state.counters.placeholdersCreated += 1;
  return token;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function prepareNames(names: string[] = []): PreparedName[] {
  const unique = new Set<string>();
  const normalized = names
    .map((name) => name.normalize('NFKC').trim())
    .filter((name) => name.length > 0)
    .filter((name) => {
      const key = name.toLowerCase();
      if (unique.has(key)) return false;
      unique.add(key);
      return true;
    })
    .sort((left, right) => right.length - left.length);

  return normalized.map((name) => ({
    pattern: new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(name)}(?![\\p{L}\\p{N}_])`, 'giu'),
  }));
}

function modelLocatorValue(value: unknown): unknown {
  if (typeof value === 'string') return uuidPattern.test(value) ? '[REDACTED_UUID]' : value;
  if (Array.isArray(value)) return value.map(modelLocatorValue);
  if (value === null || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      key === 'evidenceId' || key === 'segmentId' ? [] : [[key, modelLocatorValue(child)]],
    ),
  );
}

function modelLocator(locator: Record<string, unknown>): Record<string, unknown> {
  // Locator values are echoed by the provider and checked for exact equality by
  // the resolver. Their schema is intentionally non-PII; only opaque IDs are
  // removed here. Sanitizing other values would make every citation invalid.
  return modelLocatorValue(locator) as Record<string, unknown>;
}

function minimizeText(
  text: string,
  options: BuildScopeOptions,
  state: MinimizerState,
  names: PreparedName[],
): string {
  let result = text
    .split(/\r?\n/)
    .filter((line) => {
      if (isFooterLine(line)) {
        state.counters.footersStripped += 1;
        return false;
      }
      return true;
    })
    .join('\n');

  // Strip large base64 data blobs to prevent HTTP 413 token blowup
  result = result.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]{60,}/g, '[REDACTED_IMAGE_DATA]');
  result = result.replace(/\b[A-Za-z0-9+/=]{250,}\b/g, '[REDACTED_BINARY_BLOB]');

  result = result.replace(/\bAuthorization\s*:\s*[^\r\n]*/gi, () => {
    state.counters.secretsStripped += 1;
    return 'Authorization: [REDACTED_SECRET]';
  });
  result = result.replace(bearerPattern, () => {
    state.counters.secretsStripped += 1;
    return 'Bearer [REDACTED_SECRET]';
  });
  result = result.replace(credentialAssignmentPattern, (_match, separator: string) => {
    state.counters.secretsStripped += 1;
    return `credential${separator}[REDACTED_SECRET]`;
  });
  result = result.replace(jwtPattern, () => {
    state.counters.secretsStripped += 1;
    return '[REDACTED_SECRET]';
  });

  result = result.replace(cardCandidatePattern, (candidate) => {
    const digits = candidate.replace(/[ -]/g, '');
    if (digits.length < 13 || digits.length > 19 || !luhnIsValid(digits)) return candidate;
    state.counters.cardsMasked += 1;
    return `[CARD ending ${digits.slice(-4)}]`;
  });

  if (!options.keepIdentifiers) {
    result = result.replace(emailPattern, (email) => placeholderFor(email, 'EMAIL', state));
    result = result.replace(phoneCandidatePattern, (phone) => {
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 9 || digits.length > 15) return phone;
      return placeholderFor(phone, 'PHONE', state);
    });
  }

  if (options.mode === 'REDACT') {
    for (const { pattern } of names) {
      result = result.replace(pattern, (matched) => placeholderFor(matched, 'NAME', state));
    }
  }

  return result;
}

export function buildScope(items: ScopeItemInput[], options: BuildScopeOptions): BuildScopeResult {
  if (options.mode === 'RAW' && options.allowRaw !== true) {
    throw new Error('RAW scope requires explicit allowRaw authorization.');
  }

  const scope: MinimizedScope = [];
  const scopeMap: ScopeMap = new Map();
  const skipped: BuildScopeResult['skipped'] = [];
  const state: MinimizerState = {
    placeholders: new Map(),
    tokensByOriginal: new Map(),
    counters: {
      footersStripped: 0,
      secretsStripped: 0,
      cardsMasked: 0,
      placeholdersCreated: 0,
    },
    nextPlaceholder: { EMAIL: 1, PHONE: 1, NAME: 1 },
  };
  const names = options.mode === 'REDACT' ? prepareNames(options.knownNames) : [];

  for (const item of items) {
    if (options.mode === 'LOCAL_ONLY') {
      skipped.push({ evidenceDisplayId: item.evidenceDisplayId, reason: 'LOCAL_ONLY' });
      continue;
    }
    if (!item.hashOk) {
      skipped.push({ evidenceDisplayId: item.evidenceDisplayId, reason: 'HASH_MISMATCH' });
      continue;
    }
    if (item.status !== 'PROCESSED') {
      skipped.push({ evidenceDisplayId: item.evidenceDisplayId, reason: 'NOT_PROCESSED' });
      continue;
    }

    const segments: MinimizedScope[number]['segments'] = [];
    for (const segment of item.segments) {
      const text = options.mode === 'RAW' ? segment.text : minimizeText(segment.text, options, state, names);
      if (text.trim().length === 0) continue;

      segments.push({
        ordinal: segment.ordinal,
        locatorType: segment.locatorType,
        locator: modelLocator(segment.locator),
        text,
      });
      scopeMap.set(scopeKey(item.evidenceDisplayId, segment.ordinal), {
        evidenceId: item.evidenceId,
        segmentId: segment.segmentId,
        locatorType: segment.locatorType,
        locator: segment.locator,
      });
    }

    if (segments.length === 0) {
      skipped.push({ evidenceDisplayId: item.evidenceDisplayId, reason: 'EMPTY' });
      continue;
    }
    scope.push({ evidenceDisplayId: item.evidenceDisplayId, segments });
  }

  return {
    scope,
    scopeMap,
    placeholders: state.placeholders,
    skipped,
    metadata: { mode: options.mode, counts: state.counters },
  };
}

export function detokenize(text: string, placeholders: Map<string, string>): string {
  if (placeholders.size === 0) return text;
  const pattern = new RegExp(
    [...placeholders.keys()].sort((left, right) => right.length - left.length).map(escapeRegExp).join('|'),
    'g',
  );
  return text.replace(pattern, (token) => placeholders.get(token) ?? token);
}
