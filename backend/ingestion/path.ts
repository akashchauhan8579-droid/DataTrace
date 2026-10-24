const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVIDENCE_PATH_REGEX = /^cases\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/evidence\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/original$/i;

export interface ParsedEvidencePath {
  caseId: string;
  evidenceId: string;
}

export class MalformedPathError extends Error {
  code = 'MALFORMED_PATH';
  constructor(message: string) {
    super(message);
    this.name = 'MalformedPathError';
  }
}

/**
 * Strict parser for evidence storage paths per Master Spec v1.4 §5.2.
 * Valid format: `cases/{case_id}/evidence/{evidence_id}/original`
 * Throws MalformedPathError if the path is invalid, non-UUID, or contains traversal attempts.
 */
export function parseEvidencePath(storagePath: string): ParsedEvidencePath {
  if (!storagePath || typeof storagePath !== 'string') {
    throw new MalformedPathError('Storage path must be a non-empty string');
  }

  const match = storagePath.match(EVIDENCE_PATH_REGEX);
  if (!match) {
    throw new MalformedPathError(`Malformed storage path: "${storagePath}". Expected "cases/{caseId}/evidence/{evidenceId}/original" with valid UUIDs.`);
  }

  const [, caseId, evidenceId] = match;
  return { caseId, evidenceId };
}

/**
 * Constructs the canonical storage path for an evidence item.
 */
export function buildEvidencePath(caseId: string, evidenceId: string): string {
  if (!UUID_REGEX.test(caseId)) {
    throw new MalformedPathError(`Invalid caseId UUID: "${caseId}"`);
  }
  if (!UUID_REGEX.test(evidenceId)) {
    throw new MalformedPathError(`Invalid evidenceId UUID: "${evidenceId}"`);
  }
  return `cases/${caseId}/evidence/${evidenceId}/original`;
}
