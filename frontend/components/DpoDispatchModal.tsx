'use client';

import { useState } from 'react';
import { api } from '../lib/api';
import type { Report } from '../lib/types';
import type { DispatchEmailOutput } from '../../contracts';

interface DpoDispatchModalProps {
  report: Report;
  caseDisplayId?: string;
  suggestedEmails?: string[];
  onClose: () => void;
}

export function DpoDispatchModal({
  report,
  caseDisplayId,
  suggestedEmails = [],
  onClose,
}: DpoDispatchModalProps) {
  const [recipientEmail, setRecipientEmail] = useState(suggestedEmails[0] || '');
  const [recipientName, setRecipientName] = useState('');
  const [subject, setSubject] = useState(
    `[DataTrace ${caseDisplayId || 'CASE'}] Formal Privacy Notice — ${report.active_lens || 'EVIDENCE'} Lens Action Report`
  );
  const [coverNote, setCoverNote] = useState(
    'Dear Data Protection Officer / Grievance Officer,\n\nPlease review the enclosed verified Action Report regarding my data rights request. All cited facts are deterministically grounded against preserved case records.'
  );
  const [includeAuditSummary, setIncludeAuditSummary] = useState(true);

  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<DispatchEmailOutput | null>(null);

  const handleSend = async () => {
    if (!recipientEmail.trim() || !recipientEmail.includes('@')) {
      setError('Please provide a valid recipient email address.');
      return;
    }
    if (!subject.trim()) {
      setError('Subject line cannot be empty.');
      return;
    }

    setDispatching(true);
    setError(null);

    try {
      const res = await api.reports.dispatch(report.id, {
        recipientEmail: recipientEmail.trim(),
        recipientName: recipientName.trim() || undefined,
        subject: subject.trim(),
        coverNote: coverNote.trim() || undefined,
        includeAuditSummary,
      });

      setSuccessResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to prepare report email.');
    } finally {
      setDispatching(false);
    }
  };

  const handleOpenMailto = () => {
    if (successResult?.mailtoUrl) {
      window.location.href = successResult.mailtoUrl;
    }
  };

  return (
    <div className="fixed inset-0 bg-night/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-lg bg-paper border border-hairline p-6 rounded-sm shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="border-b border-hairline pb-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-serif text-ink">DPO Email Handoff</h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-green-300 bg-green-50 text-green-800 font-semibold uppercase">
              Grounding Verified ✓
            </span>
          </div>
          <p className="text-xs font-sans text-muted-ink mt-1">
            Prepare the verified report in your email client. Review and send it yourself; DataTrace does not transmit email.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-sans rounded-sm">
            {error}
          </div>
        )}

        {successResult ? (
          <div className="space-y-4 py-3">
            <div className={`p-4 border rounded-sm space-y-2 ${
              successResult.status === 'FAILED'
                ? 'bg-red-50 border-red-200 text-red-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold uppercase tracking-wider">
                  {successResult.status === 'FAILED'
                    ? 'Dispatch Failed'
                    : successResult.status === 'SENT'
                      ? 'Dispatch Sent'
                      : 'Email Prepared (SIMULATED)'}
                </span>
              </div>
              <p className="text-xs font-sans">
                {successResult.status === 'SIMULATED'
                  ? <>DataTrace did not send this email. The verified report is prepared for <strong>{successResult.recipientEmail}</strong>; open your email client and send it manually.</>
                  : successResult.status === 'SENT'
                    ? <>The report was sent to <strong>{successResult.recipientEmail}</strong>.</>
                    : <>The report email could not be sent to <strong>{successResult.recipientEmail}</strong>.</>}
                {' '}The attempt is recorded in the case audit ledger.
              </p>
              <div className="text-[11px] font-mono pt-1">
                Dispatch ID: {successResult.dispatchId.slice(0, 13)}…
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleOpenMailto}
                disabled={!successResult.mailtoUrl}
                className="px-3 py-1.5 bg-paper border border-hairline hover:border-ink text-xs font-mono uppercase rounded-sm text-ink transition-colors"
              >
                Review in Email Client ↗
              </button>
              <button
                type="button"
                onClick={onClose}
                className="bg-ink text-paper px-4 py-1.5 text-xs font-mono uppercase tracking-wider rounded-sm hover:bg-neutral-800 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Recipient DPO Email */}
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-muted-ink mb-1">
                Recipient DPO / Grievance Officer Email *
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                maxLength={254}
                placeholder="dpo@company.example or privacy@company.example"
                className="w-full bg-paper-2 border border-hairline px-3 py-1.5 text-xs font-mono rounded-sm focus:outline-none focus:border-copper"
              />
              {suggestedEmails.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5 items-center">
                  <span className="text-[10px] font-mono text-muted-ink">Suggested:</span>
                  {suggestedEmails.map((email) => (
                    <button
                      key={email}
                      type="button"
                      onClick={() => setRecipientEmail(email)}
                      className="text-[10px] font-mono px-1.5 py-0.5 bg-paper-2 border border-hairline hover:border-ink rounded text-ink"
                    >
                      {email}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Recipient Name */}
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-muted-ink mb-1">
                Recipient Name / Department (Optional)
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                maxLength={200}
                placeholder="Data Protection Officer — Legal Department"
                className="w-full bg-paper-2 border border-hairline px-3 py-1.5 text-xs font-sans rounded-sm focus:outline-none focus:border-copper"
              />
            </div>

            {/* Subject Line */}
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-muted-ink mb-1">
                Subject Line *
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                className="w-full bg-paper-2 border border-hairline px-3 py-1.5 text-xs font-mono rounded-sm focus:outline-none focus:border-copper"
              />
            </div>

            {/* Cover Note */}
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-muted-ink mb-1">
                Cover Message (Optional)
              </label>
              <textarea
                rows={4}
                value={coverNote}
                onChange={(e) => setCoverNote(e.target.value)}
                maxLength={2000}
                className="w-full bg-paper-2 border border-hairline p-2 text-xs font-sans rounded-sm focus:outline-none focus:border-copper"
              />
            </div>

            {/* Invariant check options */}
            <div className="pt-1 flex items-center justify-between text-xs font-sans text-muted-ink">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAuditSummary}
                  onChange={(e) => setIncludeAuditSummary(e.target.checked)}
                  className="rounded border-hairline"
                />
                <span className="text-[11px] font-mono">Include cryptographic audit chain-head hash</span>
              </label>
            </div>

            {/* Legal Notice Footer */}
            <div className="p-2.5 bg-paper-2/60 border border-hairline rounded-sm text-[10px] font-sans text-muted-ink italic">
              *Notice: DataTrace identifies evidence-related gaps and prepares a reviewable draft; it does not determine legal compliance or provide legal advice.
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-hairline">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={dispatching}
                  className="px-3 py-1.5 text-xs font-mono uppercase text-muted-ink hover:text-ink disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={dispatching || !recipientEmail.trim()}
                  className="bg-copper text-paper px-4 py-1.5 text-xs font-mono uppercase tracking-wider rounded-sm hover:bg-opacity-90 transition-colors disabled:opacity-50"
                >
                  {dispatching ? 'Preparing…' : 'Prepare Email ✉'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
