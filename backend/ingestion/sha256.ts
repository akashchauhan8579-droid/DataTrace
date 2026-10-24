import { createHash } from 'node:crypto';

/**
 * Computes a standard SHA-256 hex digest over raw bytes.
 * Master Spec v1.4 §5.2: Preserved original evidence integrity mechanism.
 */
export function computeSha256(content: Buffer | Uint8Array | string): string {
  const hash = createHash('sha256');
  if (typeof content === 'string') {
    hash.update(content, 'utf8');
  } else {
    hash.update(content);
  }
  return hash.digest('hex');
}
