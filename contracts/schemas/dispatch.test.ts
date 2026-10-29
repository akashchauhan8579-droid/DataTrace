import { describe, expect, it } from 'vitest';
import { DispatchEmailInputSchema, DispatchEmailOutputSchema } from './dispatch';

describe('email dispatch contracts', () => {
  it('defaults the optional audit summary on', () => {
    expect(
      DispatchEmailInputSchema.parse({
        recipientEmail: 'privacy@example.com',
        subject: 'DataTrace report',
      }).includeAuditSummary
    ).toBe(true);
  });

  it('rejects invalid addresses, oversize fields, and unexpected properties', () => {
    expect(
      DispatchEmailInputSchema.safeParse({
        recipientEmail: 'not-an-email',
        subject: 'Report',
      }).success
    ).toBe(false);
    expect(
      DispatchEmailInputSchema.safeParse({
        recipientEmail: 'privacy@example.com',
        subject: 'Report\r\nBcc: attacker@example.com',
      }).success
    ).toBe(false);
    expect(
      DispatchEmailInputSchema.safeParse({
        recipientEmail: 'privacy@example.com',
        subject: 'Report',
        extra: true,
      }).success
    ).toBe(false);
    expect(
      DispatchEmailInputSchema.safeParse({
        recipientEmail: 'privacy@example.com',
        subject: 'x'.repeat(201),
      }).success
    ).toBe(false);
  });

  it('validates a simulated dispatch response', () => {
    expect(
      DispatchEmailOutputSchema.safeParse({
        dispatchId: '5f30ce8d-a5a2-4c0a-b7c7-91822cc11b41',
        status: 'SIMULATED',
        dispatchedAt: '2026-10-30T00:00:00.000Z',
        recipientEmail: 'privacy@example.com',
        subject: 'DataTrace report',
        auditRowId: '5f30ce8d-a5a2-4c0a-b7c7-91822cc11b41',
        mailtoUrl: 'mailto:privacy%40example.com?subject=Report',
      }).success
    ).toBe(true);
  });
});
