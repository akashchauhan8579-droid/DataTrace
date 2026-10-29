import { describe, expect, it } from 'vitest';
import {
  buildDispatchEmailBody,
  buildMailtoUrl,
  LEGAL_DISCLAIMER,
  MockEmailDispatcher,
} from './emailDispatcher';

const emailOptions = {
  recipientEmail: 'privacy@example.com',
  recipientName: 'Privacy Team',
  subject: 'DataTrace report',
  coverNote: 'Please review this report.',
  markdownBody: '# Findings\n\nThe report is grounded.',
  caseId: 'case-123',
  caseDisplayId: 'CASE-101',
  reportId: 'report-456',
  auditHeadHash: 'abc123',
};

describe('email dispatcher', () => {
  it('builds a report email with case metadata, cover note, audit hash, and disclaimer', () => {
    const body = buildDispatchEmailBody(emailOptions);

    expect(body).toContain(emailOptions.coverNote);
    expect(body).toContain(`Recipient: ${emailOptions.recipientName}`);
    expect(body).toContain('[DataTrace Case: CASE-101 | Report ID: report-456]');
    expect(body).toContain(emailOptions.markdownBody);
    expect(body).toContain(`Audit Ledger Chain-Head Hash: ${emailOptions.auditHeadHash}`);
    expect(body).toContain(LEGAL_DISCLAIMER);
  });

  it('encodes the mailto recipient, subject, and body without form-style plus spaces', () => {
    const url = buildMailtoUrl('privacy+team@example.com', 'Review & reply', 'Line one\nLine two');
    const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));

    expect(url).toMatch(/^mailto:/);
    expect(url).not.toContain('+');
    expect(decodeURIComponent(url.slice('mailto:'.length, url.indexOf('?')))).toBe(
      'privacy+team@example.com'
    );
    expect(params.get('subject')).toBe('Review & reply');
    expect(params.get('body')).toBe('Line one\nLine two');
  });

  it('returns an explicitly simulated result and retains the prepared email in history', async () => {
    const dispatcher = new MockEmailDispatcher();
    const result = await dispatcher.send(emailOptions);

    expect(result.status).toBe('SIMULATED');
    expect(result.dispatchId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(Number.isNaN(Date.parse(result.dispatchedAt))).toBe(false);
    expect(result.recipientEmail).toBe(emailOptions.recipientEmail);
    expect(result.mailtoUrl).toContain('mailto:');
    expect(result.formattedBody).toContain(LEGAL_DISCLAIMER);
    expect(dispatcher.sentHistory).toHaveLength(1);
    expect(dispatcher.sentHistory[0].rawOptions).toEqual(emailOptions);
  });
});
