'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { createClient } from '@/lib/supabase';
import type { AccountDeletionState, DeletionStatus } from '@/lib/types';
import { Shell } from '@/components/Shell';
import { DisclaimerFooter } from '@/components/DisclaimerFooter';

const CONFIRMATION_PHRASE = 'DELETE MY ACCOUNT';
const PENDING_STORAGE_KEY = 'datatrace_deletion_pending';

const DELETION_STEPS: Array<{
  state: AccountDeletionState;
  label: string;
  detail: string;
}> = [
  {
    state: 'REQUESTED',
    label: 'Request sealed',
    detail: 'Re-authenticated and write freeze applied',
  },
  {
    state: 'STORAGE_PURGED',
    label: 'Evidence binaries purged',
    detail: 'Private Storage objects removed and verified empty',
  },
  {
    state: 'GMAIL_REVOKED',
    label: 'Gmail access revoked',
    detail: 'Google token revoked; connection row dropped',
  },
  {
    state: 'DB_PURGED',
    label: 'Case records destroyed',
    detail: 'Cases, evidence, findings, reports and audit rows deleted',
  },
  {
    state: 'AUTH_DELETED',
    label: 'Identity deleted',
    detail: 'Supabase auth user removed',
  },
  {
    state: 'COMPLETE',
    label: 'Erasure receipt written',
    detail: 'Anonymised HMAC receipt retained; no PII remains',
  },
];

function stepIndex(state: AccountDeletionState | null | undefined): number {
  if (!state) return -1;
  return DELETION_STEPS.findIndex((step) => step.state === state);
}

function mapDeletionError(err: any): string {
  switch (err?.code) {
    case 'REAUTH_FAILED':
      return 'Password re-authentication failed. Nothing was deleted.';
    case 'CONFIRMATION_MISMATCH':
      return `Type the exact phrase "${CONFIRMATION_PHRASE}" to continue.`;
    case 'ACCOUNT_DELETION_PENDING':
      return 'A deletion request is already in progress. Resume it below.';
    case 'UNAUTHENTICATED':
      return 'Your session has expired. Sign in again before deleting your account.';
    case 'NOT_FOUND':
      return 'No pending deletion request was found for this account.';
    default:
      return err?.message || 'Account deletion could not be started. Nothing was deleted.';
  }
}

export default function AccountPage() {
  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportedAt, setExportedAt] = useState<string | null>(null);

  // Deletion dialog state
  const [modalOpen, setModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [phrase, setPhrase] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletionError, setDeletionError] = useState<string | null>(null);

  // State machine / resume state
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [completed, setCompleted] = useState(false);
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [resuming, setResuming] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(PENDING_STORAGE_KEY) === '1') {
      setResumeAvailable(true);
    }
    return () => {
      if (pollRef.current !== null) {
        window.clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const finishDeletion = useCallback(async () => {
    if (pollRef.current !== null) {
      window.clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    localStorage.removeItem(PENDING_STORAGE_KEY);
    setCompleted(true);
    setDeleting(false);
    setResuming(false);
    setResumeAvailable(false);
    setModalOpen(false);
    setPassword('');
    setPhrase('');
    try {
      await createClient().auth.signOut();
    } catch {
      // The auth identity may already be gone; that is the expected end state.
    }
  }, []);

  const beginPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearTimeout(pollRef.current);
      pollRef.current = null;
    }

    let attempts = 0;

    // Schedule the next attempt only after the previous request settles. Each
    // continue call may run the purge for up to ~45s, so setInterval would
    // overlap invocations and race the state machine.
    const poll = async () => {
      attempts += 1;
      try {
        const next = await api.account.continueDeletion();
        setStatus(next);

        if (next.state === 'COMPLETE') {
          await finishDeletion();
          return;
        }
      } catch (err: any) {
        // A deleted auth identity makes the access token invalid. Treat that as
        // the terminal success condition rather than a failed deletion.
        if (err?.code === 'UNAUTHENTICATED' || err?.status === 401) {
          await finishDeletion();
          return;
        }
        if (err?.code === 'NOT_FOUND') {
          await finishDeletion();
          return;
        }
        if (attempts > 30) {
          pollRef.current = null;
          setDeletionError(mapDeletionError(err));
          setDeleting(false);
          return;
        }
      }

      if (attempts > 30) {
        pollRef.current = null;
        setDeleting(false);
        setDeletionError(
          'Deletion is still running on the server. Reload this page and choose “Resume deletion”.'
        );
        return;
      }

      pollRef.current = window.setTimeout(poll, 2_000);
    };

    pollRef.current = window.setTimeout(poll, 2_000);
  }, [finishDeletion]);

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const data = await api.account.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `datatrace-account-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setExportedAt(new Date().toISOString());
    } catch (err: any) {
      if (err?.code === 'UNAUTHENTICATED' || err?.status === 401) {
        window.location.href = '/auth';
        return;
      }
      setExportError(err?.message || 'Could not build the account export.');
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async (event: React.FormEvent) => {
    event.preventDefault();
    setDeletionError(null);

    if (phrase !== CONFIRMATION_PHRASE) {
      setDeletionError(`Type the exact phrase "${CONFIRMATION_PHRASE}" to continue.`);
      return;
    }
    if (!password) {
      setDeletionError('Enter your password to re-authenticate.');
      return;
    }
    if (!acknowledged) {
      setDeletionError('Confirm that you understand the deletion is permanent.');
      return;
    }

    setDeleting(true);
    try {
      const next = await api.account.initiateDeletion({
        password,
        confirmationPhrase: phrase,
      });
      setStatus(next);
      localStorage.setItem(PENDING_STORAGE_KEY, '1');
      setResumeAvailable(true);

      if (next.state === 'COMPLETE') {
        await finishDeletion();
      } else {
        beginPolling();
      }
    } catch (err: any) {
      setDeletionError(mapDeletionError(err));
      setDeleting(false);
      if (err?.code === 'ACCOUNT_DELETION_PENDING') {
        setResumeAvailable(true);
      }
    }
  };

  const handleResume = async () => {
    setResuming(true);
    setDeletionError(null);
    try {
      const next = await api.account.continueDeletion();
      setStatus(next);
      setModalOpen(true);
      if (next.state === 'COMPLETE') {
        await finishDeletion();
      } else {
        setDeleting(true);
        beginPolling();
      }
    } catch (err: any) {
      if (err?.code === 'UNAUTHENTICATED' || err?.status === 401) {
        await finishDeletion();
        return;
      }
      setDeletionError(mapDeletionError(err));
    } finally {
      setResuming(false);
    }
  };

  const currentStep = stepIndex(status?.state);
  const counts = status?.counts ?? {};
  const deletionStarted = deleting || (status !== null && status.state !== 'COMPLETE');

  if (completed) {
    return (
      <Shell>
        <div className="flex-1 w-full max-w-3xl mx-auto px-6 py-20">
          <div className="bg-paper-2 border border-green-700/30 rounded-sm p-8 sm:p-12 text-center shadow-xs">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-50 border border-green-700/30 flex items-center justify-center text-green-800 text-xl mb-5">
              ✓
            </div>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-green-800 block mb-2">
              GDPR Art. 17 · Erasure Complete
            </span>
            <h1 className="text-3xl font-serif text-ink mb-3">Your account has been deleted.</h1>
            <p className="text-sm font-sans text-muted-ink leading-relaxed max-w-xl mx-auto">
              Your profile, cases, evidence, findings, reports and audit ledger rows have been
              permanently destroyed. Only an anonymised HMAC erasure receipt remains, containing no
              personal data.
            </p>

            {Object.keys(counts).length > 0 && (
              <div className="mt-6 mx-auto max-w-md text-left bg-paper border border-hairline rounded-sm p-4">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-ink mb-2">
                  Destruction receipt
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono text-ink">
                  {Object.entries(counts).map(([table, count]) => (
                    <div key={table} className="flex items-center justify-between gap-3">
                      <span className="text-muted-ink truncate">{table}</span>
                      <span>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Link
              href="/"
              className="inline-block mt-8 px-6 py-2.5 bg-ink text-paper text-xs font-mono uppercase tracking-wider rounded-sm hover:bg-neutral-800 transition-colors"
            >
              Return to DataTrace →
            </Link>
          </div>
        </div>
        <DisclaimerFooter />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex-1 w-full max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="border-b border-hairline pb-6 mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-copper font-semibold">
              Account &amp; Data Sovereignty
            </span>
            <span className="text-muted-ink text-xs">/</span>
            <span className="text-[10px] font-mono text-muted-ink uppercase">
              GDPR Art. 17 · Right to Erasure
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif font-normal text-ink">
            Your data. Your decision.
          </h1>
          <p className="text-sm font-sans text-muted-ink mt-3 max-w-3xl leading-relaxed">
            DataTrace exists to help you exercise control over your personal data. You can take a
            complete copy with you, or permanently destroy everything held in this account. Deletion
            is server-enforced, irreversible and does not require a support request.
          </p>
        </div>

        {/* Resume banner for an interrupted purge */}
        {resumeAvailable && (
          <div className="mb-6 p-4 bg-amber/10 border border-amber/40 rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-amber font-semibold mb-1">
                Deletion in progress
              </div>
              <p className="text-xs font-sans text-ink">
                A previous erasure request has not finished. Resume the idempotent state machine
                safely — no step will run twice.
              </p>
            </div>
            <button
              onClick={handleResume}
              disabled={resuming}
              className="self-start sm:self-auto px-4 py-2 bg-ink text-paper text-[11px] font-mono uppercase tracking-wider rounded-sm hover:bg-neutral-800 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {resuming ? 'Resuming…' : 'Resume deletion →'}
            </button>
          </div>
        )}

        {deletionError && !modalOpen && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-sans rounded-sm">
            {deletionError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Export card */}
          <section className="bg-paper-2 border border-hairline rounded-sm p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-hairline pb-2 mb-4">
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-ink">
                  01 / Portability
                </span>
                <span className="text-[10px] font-mono text-green-800 bg-green-50 border border-green-300 px-1.5 py-0.5 rounded-sm">
                  NO SECRETS · NO BINARIES
                </span>
              </div>
              <h2 className="text-2xl font-serif text-ink mb-2">Take your full record with you</h2>
              <p className="text-xs font-sans text-muted-ink leading-relaxed">
                Download a single server-built JSON document containing your profile metadata,
                cases, evidence metadata and SHA-256 hashes, segments, findings, citations, reports,
                audit events with chain-head hashes, and Gmail connection status.
              </p>

              <ul className="mt-4 space-y-1.5 text-[11px] font-mono text-muted-ink">
                <li>✓ Original filenames, sizes, MIME types and ingest sources</li>
                <li>✓ Every finding, citation and verification state</li>
                <li>✓ Audit ledger events and per-case chain integrity</li>
                <li>✕ Never access tokens, refresh tokens, secrets or raw binaries</li>
              </ul>

              {exportError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-sans rounded-sm">
                  {exportError}
                </div>
              )}

              {exportedAt && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 text-green-800 text-[11px] font-mono rounded-sm">
                  Export downloaded at {new Date(exportedAt).toLocaleString()}.
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-hairline">
              <button
                onClick={handleExport}
                disabled={exporting}
                className="w-full sm:w-auto px-5 py-2.5 bg-ink text-paper text-xs font-mono uppercase tracking-wider rounded-sm hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                {exporting ? 'Building export…' : 'Download full JSON export ↓'}
              </button>
            </div>
          </section>

          {/* Danger zone */}
          <section className="bg-paper border border-red-300/70 rounded-sm p-6 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-red-600/70" />
            <div>
              <div className="flex items-center justify-between border-b border-hairline pb-2 mb-4">
                <span className="text-[10px] font-mono uppercase tracking-widest text-red-700 font-semibold">
                  02 / Erasure · Danger Zone
                </span>
                <span className="text-[10px] font-mono text-red-700 bg-red-50 border border-red-300 px-1.5 py-0.5 rounded-sm">
                  IRREVERSIBLE
                </span>
              </div>
              <h2 className="text-2xl font-serif text-ink mb-2">Nuke this account</h2>
              <p className="text-xs font-sans text-muted-ink leading-relaxed">
                Permanently destroy your user profile, every case, all evidence and original
                binaries, findings, citations, reports, Gmail connection and the hash-chained audit
                ledger. This is a true erasure, not an archive.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] font-mono">
                {['Profile', 'Cases', 'Evidence', 'Segments', 'Findings', 'Reports', 'Audit logs', 'Gmail token'].map(
                  (item) => (
                    <div
                      key={item}
                      className="flex items-center gap-1.5 text-red-800 bg-red-50/60 border border-red-200/70 rounded-sm px-2 py-1"
                    >
                      <span>✕</span>
                      <span>{item}</span>
                    </div>
                  )
                )}
              </div>

              <p className="mt-4 text-[11px] font-sans text-muted-ink leading-relaxed">
                An anonymised erasure receipt (HMAC-SHA256 of your user id, timestamp and row
                counts) is retained to prove compliance. It contains no personal data and cannot be
                linked back to you without the server key.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-hairline">
              <button
                onClick={() => {
                  setDeletionError(null);
                  setModalOpen(true);
                }}
                className="w-full sm:w-auto px-5 py-2.5 bg-red-700 text-white text-xs font-mono uppercase tracking-wider font-semibold rounded-sm hover:bg-red-800 transition-colors shadow-xs"
              >
                Nuke / Delete Account
              </button>
            </div>
          </section>
        </div>

        {/* Sovereignty footer strip */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-[10px] font-mono text-muted-ink">
          <div className="border border-hairline bg-paper-2/60 rounded-sm p-3">
            <span className="text-ink font-semibold block mb-1">RE-AUTHENTICATION</span>
            Password is verified server-side before any destructive step.
          </div>
          <div className="border border-hairline bg-paper-2/60 rounded-sm p-3">
            <span className="text-ink font-semibold block mb-1">RESUMABLE PURGE</span>
            Six idempotent stages survive serverless timeouts; the client drives resume.
          </div>
          <div className="border border-hairline bg-paper-2/60 rounded-sm p-3">
            <span className="text-ink font-semibold block mb-1">NO HIDDEN RETENTION</span>
            No soft-deleted copies, no shadow profile, no re-created audit rows.
          </div>
        </div>
      </div>

      {/* Deletion confirmation dialog */}
      {modalOpen && (
        <div className="fixed inset-0 bg-ink/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-paper border border-red-300 rounded-sm shadow-2xl">
            <div className="sticky top-0 bg-paper border-b border-hairline px-6 py-4 flex items-center justify-between z-10">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-red-700 font-semibold block">
                  Right to Erasure · Confirmation
                </span>
                <span className="text-[10px] font-mono text-muted-ink">
                  Spec §15.5.1 D4 · Two-factor confirmation
                </span>
              </div>
              {!deletionStarted && (
                <button
                  onClick={() => {
                    setModalOpen(false);
                    setDeletionError(null);
                  }}
                  className="text-xs font-mono text-muted-ink hover:text-ink"
                >
                  [CLOSE ✕]
                </button>
              )}
            </div>

            {deletionStarted ? (
              <div className="p-6 space-y-5">
                <div className="p-4 bg-red-50 border border-red-200 rounded-sm">
                  <div className="flex items-center gap-2 text-red-800 font-mono text-xs font-semibold mb-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                    ERASURE IN PROGRESS — DO NOT CLOSE THIS WINDOW
                  </div>
                  <p className="text-xs font-sans text-red-800/90 leading-relaxed">
                    Each stage is idempotent. If the serverless function times out, this page will
                    resume from the recorded state automatically.
                  </p>
                </div>

                <div className="space-y-2">
                  {DELETION_STEPS.map((step, index) => {
                    const isDone = currentStep >= index;
                    const isCurrent = currentStep === index;
                    return (
                      <div
                        key={step.state}
                        className={`flex items-start gap-3 p-3 rounded-sm border ${
                          isDone
                            ? 'bg-green-50/60 border-green-300'
                            : 'bg-paper-2 border-hairline'
                        }`}
                      >
                        <span
                          className={`mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-mono border ${
                            isDone
                              ? 'bg-green-700 text-white border-green-700'
                              : isCurrent
                                ? 'bg-amber text-ink border-amber'
                                : 'bg-paper text-muted-ink border-hairline'
                          }`}
                        >
                          {isDone ? '✓' : index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-mono font-semibold text-ink">
                            {step.label}
                            {isCurrent && !isDone && (
                              <span className="ml-2 text-[9px] uppercase text-amber">current</span>
                            )}
                          </div>
                          <div className="text-[11px] font-sans text-muted-ink">{step.detail}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {Object.keys(counts).length > 0 && (
                  <div className="p-3 bg-paper-2 border border-hairline rounded-sm">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-ink mb-2">
                      Rows destroyed so far
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono">
                      {Object.entries(counts).map(([table, count]) => (
                        <div key={table} className="flex justify-between gap-3">
                          <span className="text-muted-ink truncate">{table}</span>
                          <span className="text-ink">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {deletionError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-sans rounded-sm">
                    {deletionError}
                  </div>
                )}

                <div className="text-[10px] font-mono text-muted-ink border-t border-hairline pt-3 flex items-center justify-between">
                  <span>STATE: {status?.state ?? 'REQUESTED'}</span>
                  <span>ATTEMPTS: {status?.attempts ?? 0}</span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleDelete} className="p-6 space-y-5">
                <div className="p-4 bg-red-50 border border-red-300 rounded-sm">
                  <div className="text-red-800 font-mono text-xs font-semibold mb-1">
                    THIS CANNOT BE UNDONE
                  </div>
                  <p className="text-xs font-sans text-red-800/90 leading-relaxed">
                    There is no archive, no recovery window and no support override. Once the state
                    machine reaches COMPLETE, your account identity no longer exists.
                  </p>
                </div>

                {/* Export offer inside the dialog (D5) */}
                <div className="border border-hairline rounded-sm p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-ink mb-1">
                        Recommended before deletion
                      </div>
                      <p className="text-xs font-sans text-ink">
                        Download your complete JSON export. It takes seconds and is the only copy
                        you will have.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleExport}
                      disabled={exporting}
                      className="self-start sm:self-auto px-4 py-2 border border-ink text-ink text-[11px] font-mono uppercase tracking-wider rounded-sm hover:bg-paper-2 transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      {exporting ? 'Building…' : 'Export JSON ↓'}
                    </button>
                  </div>
                  {exportedAt && (
                    <div className="mt-3 text-[10px] font-mono text-green-800">
                      ✓ Export downloaded at {new Date(exportedAt).toLocaleString()}
                    </div>
                  )}
                  {exportError && (
                    <div className="mt-3 text-[11px] font-sans text-red-700">{exportError}</div>
                  )}
                </div>

                {/* Destruction manifest */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] font-sans">
                  <div className="border border-red-200 bg-red-50/40 rounded-sm p-3">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-red-700 mb-2">
                      Permanently destroyed
                    </div>
                    <ul className="space-y-1 text-red-900/90">
                      <li>• Profile and auth identity</li>
                      <li>• Every case and description</li>
                      <li>• Evidence rows and original binaries</li>
                      <li>• Segments, artifacts and citations</li>
                      <li>• Findings, verification results and reports</li>
                      <li>• Hash-chained audit ledger rows</li>
                      <li>• Gmail connection and refresh token</li>
                    </ul>
                  </div>
                  <div className="border border-hairline bg-paper-2 rounded-sm p-3">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-ink mb-2">
                      What remains
                    </div>
                    <ul className="space-y-1 text-muted-ink">
                      <li>• Anonymised erasure receipt (HMAC + timestamp)</li>
                      <li>• Per-table row counts, with zero PII</li>
                      <li>• Encrypted backups age out on schedule</li>
                      <li>• Files you already downloaded locally</li>
                      <li>• Emails in your own mailbox (untouched)</li>
                    </ul>
                  </div>
                </div>

                {/* Honest limits (D7) */}
                <div className="border border-amber/40 bg-amber/10 rounded-sm p-3">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-amber font-semibold mb-1">
                    Honest limits
                  </div>
                  <ul className="text-[11px] font-sans text-ink/90 space-y-1 leading-relaxed">
                    <li>
                      • AI provider transit logs follow provider policy; DataTrace requests Zero
                      Data Retention where available.
                    </li>
                    <li>• Previously downloaded exports or files cannot be revoked.</li>
                    <li>• Encrypted database backups age out on their normal retention schedule.</li>
                    <li>
                      • Gmail messages stay in your mailbox; only DataTrace&apos;s access token is
                      revoked.
                    </li>
                  </ul>
                </div>

                {/* Re-auth + phrase */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-muted-ink mb-1">
                      Password re-authentication <span className="text-red-700">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your current password"
                      className="w-full bg-paper-2 border border-hairline px-3 py-2 text-sm font-sans rounded-sm focus:outline-none focus:border-red-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-muted-ink mb-1">
                      Type <span className="text-red-700 font-bold">{CONFIRMATION_PHRASE}</span>{' '}
                      <span className="text-red-700">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      autoComplete="off"
                      spellCheck={false}
                      value={phrase}
                      onChange={(e) => setPhrase(e.target.value)}
                      placeholder={CONFIRMATION_PHRASE}
                      className="w-full bg-paper-2 border border-hairline px-3 py-2 text-sm font-mono tracking-wider rounded-sm focus:outline-none focus:border-red-600"
                    />
                    {phrase.length > 0 && phrase !== CONFIRMATION_PHRASE && (
                      <div className="mt-1 text-[10px] font-mono text-red-700">
                        Phrase does not match exactly.
                      </div>
                    )}
                  </div>

                  <label className="flex items-start gap-2 text-xs font-sans text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                      className="mt-0.5 accent-red-700"
                    />
                    <span>
                      I understand that my profile, cases, evidence, findings, reports and audit
                      logs will be permanently destroyed, and that this action cannot be undone.
                    </span>
                  </label>
                </div>

                {deletionError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-sans rounded-sm">
                    {deletionError}
                  </div>
                )}

                <div className="pt-2 flex flex-col sm:flex-row justify-end gap-3 border-t border-hairline">
                  <button
                    type="button"
                    onClick={() => {
                      setModalOpen(false);
                      setDeletionError(null);
                    }}
                    className="px-4 py-2 border border-hairline text-xs font-mono uppercase text-muted-ink hover:text-ink rounded-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      deleting ||
                      !password ||
                      phrase !== CONFIRMATION_PHRASE ||
                      !acknowledged
                    }
                    className="px-5 py-2 bg-red-700 text-white text-xs font-mono uppercase tracking-wider font-semibold rounded-sm hover:bg-red-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {deleting ? 'Nuking account…' : 'Nuke / Delete Account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <DisclaimerFooter />
    </Shell>
  );
}
