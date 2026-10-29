import { randomUUID } from 'node:crypto';

export interface SendEmailOptions {
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  coverNote?: string;
  markdownBody: string;
  caseId: string;
  caseDisplayId?: string;
  reportId: string;
  auditHeadHash?: string;
}

export interface SendEmailResult {
  dispatchId: string;
  status: 'SENT' | 'SIMULATED' | 'FAILED';
  dispatchedAt: string;
  recipientEmail: string;
  subject: string;
  mailtoUrl: string;
  formattedBody: string;
}

export interface EmailDispatcher {
  send(options: SendEmailOptions): Promise<SendEmailResult>;
}

export const LEGAL_DISCLAIMER =
  'DataTrace identifies evidence-related gaps and prepares a reviewable draft; it does not determine legal compliance or provide legal advice.';

/**
 * Builds the plain text / markdown email body combining user cover note,
 * verified report draft, audit integrity hash, and mandatory disclaimer.
 */
export function buildDispatchEmailBody(options: SendEmailOptions): string {
  const parts: string[] = [];

  // 1. Cover note from user if provided
  if (options.coverNote?.trim()) {
    parts.push(options.coverNote.trim());
    parts.push('\n---\n');
  }

  // 2. Optional recipient label and case/report metadata
  if (options.recipientName?.trim()) {
    parts.push(`Recipient: ${options.recipientName.trim().replace(/[\r\n]+/g, ' ')}`);
    parts.push('\n');
  }

  const caseLabel = options.caseDisplayId || options.caseId;
  parts.push(`[DataTrace Case: ${caseLabel} | Report ID: ${options.reportId}]`);
  parts.push('\n');

  // 3. Grounded Report Markdown
  parts.push(options.markdownBody.trim());

  // 4. Provenance & Audit ledger hash if present
  if (options.auditHeadHash) {
    parts.push('\n---\n');
    parts.push(`Audit Ledger Chain-Head Hash: ${options.auditHeadHash}`);
    parts.push('(Tamper-evident verification proof recorded in DataTrace case ledger)');
  }

  // 5. Mandatory Disclaimer
  parts.push('\n---\n');
  parts.push(`Notice: ${LEGAL_DISCLAIMER}`);

  return parts.join('\n');
}

/**
 * Encodes a standard mailto: link so users can review and dispatch directly
 * through their native desktop or web email client (Gmail, Outlook, Apple Mail).
 */
export function buildMailtoUrl(recipient: string, subject: string, body: string): string {
  const params = new URLSearchParams();
  params.set('subject', subject);
  // URLSearchParams uses '+' for spaces by default; replace with '%20' for RFC-compliant mailto URIs
  params.set('body', body);
  return `mailto:${encodeURIComponent(recipient)}?${params.toString().replace(/\+/g, '%20')}`;
}

/**
 * Mock email dispatcher for local development, demo mode, and synthetic tests.
 * Never performs network calls, safe by default.
 */
export class MockEmailDispatcher implements EmailDispatcher {
  public sentHistory: Array<SendEmailResult & { rawOptions: SendEmailOptions }> = [];

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    const dispatchId = randomUUID();
    const dispatchedAt = new Date().toISOString();
    const formattedBody = buildDispatchEmailBody(options);
    const mailtoUrl = buildMailtoUrl(options.recipientEmail, options.subject, formattedBody);

    const result: SendEmailResult = {
      dispatchId,
      status: 'SIMULATED',
      dispatchedAt,
      recipientEmail: options.recipientEmail,
      subject: options.subject,
      mailtoUrl,
      formattedBody,
    };

    this.sentHistory.push({ ...result, rawOptions: options });
    return result;
  }
}

/**
 * Uses the safe mail-client handoff until a server-side provider is configured.
 */
export function createEmailDispatcher(): EmailDispatcher {
  return new MockEmailDispatcher();
}
