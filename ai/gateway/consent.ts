import type { Result } from '../../contracts/result';

export interface Consent {
  policyVersion: string;
  revokedAt?: string | null;
}

export function checkConsent(
  consent: Consent | null,
  currentPolicyVersion: string,
): Result<{ policyVersion: string }, 'NO_CONSENT' | 'POLICY_OUTDATED' | 'REVOKED'> {
  if (consent === null) {
    return { ok: false, reason: 'NO_CONSENT' };
  }

  if (consent.revokedAt !== undefined && consent.revokedAt !== null) {
    return { ok: false, reason: 'REVOKED' };
  }

  if (consent.policyVersion !== currentPolicyVersion) {
    return { ok: false, reason: 'POLICY_OUTDATED' };
  }

  return { ok: true, value: { policyVersion: consent.policyVersion } };
}
