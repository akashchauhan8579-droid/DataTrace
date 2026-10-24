import { describe, expect, it } from 'vitest';

import { checkConsent } from './consent.js';

describe('checkConsent', () => {
  it('T04 rejects when consent is absent', () => {
    expect(checkConsent(null, '2026-01')).toEqual({ ok: false, reason: 'NO_CONSENT' });
  });

  it('T04 rejects revoked consent', () => {
    expect(checkConsent({ policyVersion: '2026-01', revokedAt: '2026-02-01T00:00:00Z' }, '2026-01')).toEqual({
      ok: false,
      reason: 'REVOKED',
    });
  });

  it('T04 rejects an outdated policy version', () => {
    expect(checkConsent({ policyVersion: '2025-01' }, '2026-01')).toEqual({
      ok: false,
      reason: 'POLICY_OUTDATED',
    });
  });

  it('T04 returns the active policy version', () => {
    expect(checkConsent({ policyVersion: '2026-01', revokedAt: null }, '2026-01')).toEqual({
      ok: true,
      value: { policyVersion: '2026-01' },
    });
  });
});
