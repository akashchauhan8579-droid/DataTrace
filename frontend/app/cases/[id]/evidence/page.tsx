'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { SourceType } from '@/lib/types';
import { Shell } from '@/components/Shell';
import { DisclaimerFooter } from '@/components/DisclaimerFooter';

interface GmailThreadSummary {
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  messageCount: number;
  lastMessageAt: string;
}

export default function EvidenceUploadPage() {
  const params = useParams();
  const caseId = params.id as string;

  const [mode, setMode] = useState<'FILE' | 'MANUAL' | 'GMAIL'>('FILE');
  const [sourceType, setSourceType] = useState<SourceType>('EMAIL');

  // File upload state
  const [file, setFile] = useState<File | null>(null);

  // Manual log state
  const [manualTitle, setManualTitle] = useState('');
  const [manualContent, setManualContent] = useState('');

  // Gmail import state
  const [gmailStatus, setGmailStatus] = useState<{
    connected: boolean;
    googleEmail?: string;
    status?: 'ACTIVE' | 'EXPIRED';
  } | null>(null);
  const [checkingGmail, setCheckingGmail] = useState(false);
  const [gmailSearch, setGmailSearch] = useState('privacy OR deletion OR erasure OR GDPR');
  const [gmailThreads, setGmailThreads] = useState<GmailThreadSummary[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [importingThreadId, setImportingThreadId] = useState<string | null>(null);
  const [gmailImportResult, setGmailImportResult] = useState<{
    items: Array<{ id: string; displayId: string; sha256: string; duplicate: boolean }>;
    truncated: boolean;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    displayId: string;
    sha256: string;
    segmentCount: number;
  } | null>(null);

  // Fetch Gmail status when switching to GMAIL tab
  useEffect(() => {
    if (mode === 'GMAIL' && !gmailStatus) {
      loadGmailStatus();
    }
  }, [mode, gmailStatus]);

  async function loadGmailStatus() {
    setCheckingGmail(true);
    setError(null);
    try {
      const status = await api.gmail.getStatus();
      setGmailStatus(status);
      if (status.connected && status.status === 'ACTIVE') {
        searchThreads('privacy OR deletion OR erasure OR GDPR');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to check Gmail connection status');
    } finally {
      setCheckingGmail(false);
    }
  }

  async function handleGmailConnect() {
    try {
      setLoading(true);
      setError(null);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('gmail_import_return_case', caseId);
      }
      const { authUrl } = await api.gmail.connect();
      window.location.href = authUrl;
    } catch (err: any) {
      setError(err.message || 'Failed to initiate Gmail authorization');
      setLoading(false);
    }
  }

  async function handleGmailDisconnect() {
    try {
      setLoading(true);
      await api.gmail.disconnect();
      setGmailStatus({ connected: false });
      setGmailThreads([]);
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect Gmail');
    } finally {
      setLoading(false);
    }
  }

  async function searchThreads(q: string) {
    setLoadingThreads(true);
    setError(null);
    try {
      const res = await api.gmail.listThreads(q);
      setGmailThreads(res.threads || []);
    } catch (err: any) {
      setError(err.message || 'Failed to list Gmail threads');
    } finally {
      setLoadingThreads(false);
    }
  }

  async function handleImportThread(threadId: string) {
    setImportingThreadId(threadId);
    setError(null);
    setGmailImportResult(null);
    try {
      const res = await api.gmail.importThread(caseId, threadId);
      setGmailImportResult(res);
    } catch (err: any) {
      setError(err.message || 'Failed to import messages from thread');
    } finally {
      setImportingThreadId(null);
    }
  }

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const isPdf = file.name.endsWith('.pdf') || file.type === 'application/pdf';
      const isBase64 = isPdf;

      let contentStr = '';
      if (isBase64) {
        const arrayBuf = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        contentStr = btoa(binary);
      } else {
        contentStr = await file.text();
      }

      let detectedSource: SourceType = sourceType;
      if (file.name.endsWith('.eml')) detectedSource = 'EMAIL';
      else if (file.name.endsWith('.pdf')) detectedSource = 'DOCUMENT';

      const res = await api.evidence.upload(caseId, {
        sourceType: detectedSource,
        filename: file.name,
        mimeType: file.type || (file.name.endsWith('.eml') ? 'message/rfc822' : 'text/plain'),
        content: contentStr,
        isBase64,
      });

      setResult({
        displayId: res.displayId,
        sha256: res.sha256,
        segmentCount: res.segmentCount,
      });
      setFile(null);
    } catch (err: any) {
      setError(err.message || 'Evidence upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleManualUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim() || !manualContent.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await api.evidence.upload(caseId, {
        sourceType: 'MANUAL_LOG',
        filename: `${manualTitle.trim().replace(/\s+/g, '_')}.txt`,
        mimeType: 'text/plain',
        content: manualContent,
        isBase64: false,
      });

      setResult({
        displayId: res.displayId,
        sha256: res.sha256,
        segmentCount: res.segmentCount,
      });
      setManualTitle('');
      setManualContent('');
    } catch (err: any) {
      setError(err.message || 'Failed to save manual log');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Shell currentCaseId={caseId}>
      <div className="flex-1 max-w-4xl w-full mx-auto p-8">
        <div className="border-b border-hairline pb-4 mb-8">
          <Link
            href={`/cases/${caseId}`}
            className="text-xs font-mono text-muted-ink hover:text-ink uppercase tracking-wider mb-2 inline-block"
          >
            ← Back to Case
          </Link>
          <h1 className="text-3xl font-serif font-normal text-ink">Preserve New Evidence</h1>
          <p className="text-xs font-sans text-muted-ink mt-1">
            Raw bytes are hashed (SHA-256) and saved untouched in private storage. Segments are extracted for citation grounding.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-sans rounded-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="mb-8 p-6 bg-paper-2 border border-green-500/40 rounded-sm shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono text-green-800 uppercase font-semibold">
                ✓ Item Ingested Successfully
              </span>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 bg-paper rounded border border-hairline">
                {result.displayId}
              </span>
            </div>
            <div className="text-xs font-mono text-muted-ink space-y-1">
              <div>SHA-256: <span className="text-ink break-all select-all">{result.sha256}</span></div>
              <div>Segments Extracted: <span className="text-ink font-semibold">{result.segmentCount}</span></div>
            </div>
            <div className="mt-4 pt-3 border-t border-hairline flex gap-3">
              <Link
                href={`/cases/${caseId}`}
                className="text-xs font-mono uppercase tracking-wider text-copper hover:underline"
              >
                Return to Dashboard →
              </Link>
            </div>
          </div>
        )}

        {/* Tab selection */}
        <div className="flex border-b border-hairline mb-6 text-xs font-mono uppercase tracking-wider">
          <button
            onClick={() => setMode('FILE')}
            className={`px-4 py-2 border-b-2 font-medium transition-colors ${
              mode === 'FILE'
                ? 'border-ink text-ink'
                : 'border-transparent text-muted-ink hover:text-ink'
            }`}
          >
            File Upload (.eml / .pdf / .txt)
          </button>
          <button
            onClick={() => setMode('MANUAL')}
            className={`px-4 py-2 border-b-2 font-medium transition-colors ${
              mode === 'MANUAL'
                ? 'border-ink text-ink'
                : 'border-transparent text-muted-ink hover:text-ink'
            }`}
          >
            Manual Log Entry
          </button>
          <button
            onClick={() => setMode('GMAIL')}
            className={`px-4 py-2 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
              mode === 'GMAIL'
                ? 'border-copper text-copper font-semibold'
                : 'border-transparent text-muted-ink hover:text-ink'
            }`}
          >
            <span>Import from Gmail</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-paper-2 border border-hairline rounded text-muted-ink">
              §10.6
            </span>
          </button>
        </div>

        {mode === 'FILE' && (
          <form onSubmit={handleFileUpload} className="space-y-6">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-muted-ink mb-2">
                Source Type
              </label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as SourceType)}
                className="bg-paper-2 border border-hairline px-3 py-2 text-xs font-mono rounded-sm focus:outline-none focus:border-amber"
              >
                <option value="EMAIL">Email Message (.eml / rfc822)</option>
                <option value="DOCUMENT">Formal Document (.pdf / text)</option>
                <option value="SCREENSHOT">Screenshot / Image Document</option>
              </select>
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0]) {
                  setFile(e.dataTransfer.files[0]);
                }
              }}
              className="border-2 border-dashed border-hairline p-8 text-center rounded-sm bg-paper-2/40 hover:bg-paper-2 transition-colors cursor-pointer"
            >
              <input
                type="file"
                accept=".eml,.pdf,.txt,text/*,*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-xs font-mono text-muted-ink file:mr-4 file:py-2 file:px-4 file:rounded-sm file:border-0 file:text-xs file:font-mono file:bg-ink file:text-paper hover:file:bg-neutral-800 cursor-pointer"
              />
              <p className="text-[11px] font-sans text-muted-ink mt-2">
                Supported formats: RFC-822 Email (.eml), Adobe PDF (.pdf), Plain text (.txt). Drag & drop any file here.
              </p>
              {file && (
                <div className="mt-3 p-2 bg-paper border border-amber/60 rounded text-xs font-mono text-ink">
                  Selected file: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !file}
              className="bg-copper text-paper px-6 py-2.5 text-xs font-mono uppercase tracking-wider font-semibold rounded-sm hover:bg-umber transition-colors disabled:opacity-50 shadow-xs"
            >
              {loading ? 'Ingesting & Hashing...' : 'Ingest Evidence'}
            </button>
          </form>
        )}

        {mode === 'MANUAL' && (
          <form onSubmit={handleManualUpload} className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-muted-ink mb-1">
                Log Title / Reference
              </label>
              <input
                type="text"
                required
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="Phone conversation notes with DPO"
                className="w-full bg-paper-2 border border-hairline px-3 py-2 text-sm font-sans rounded-sm focus:outline-none focus:border-amber"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-muted-ink mb-1">
                Log Content / Statement
              </label>
              <textarea
                required
                rows={8}
                value={manualContent}
                onChange={(e) => setManualContent(e.target.value)}
                placeholder="Date: 2026-10-14. Called customer privacy line. Agent stated that deletion takes up to 90 days."
                className="w-full bg-paper-2 border border-hairline px-3 py-2 text-sm font-sans rounded-sm focus:outline-none focus:border-amber"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bg-copper text-paper px-6 py-2.5 text-xs font-mono uppercase tracking-wider font-semibold rounded-sm hover:bg-umber transition-colors disabled:opacity-50 shadow-xs"
            >
              {loading ? 'Ingesting Record...' : 'Preserve Manual Log'}
            </button>
          </form>
        )}

        {mode === 'GMAIL' && (
          <div className="space-y-6">
            {checkingGmail ? (
              <div className="p-8 text-center font-mono text-xs text-muted-ink">
                VERIFYING VAULT CREDENTIALS...
              </div>
            ) : !gmailStatus?.connected || gmailStatus.status === 'EXPIRED' ? (
              <div className="bg-paper-2 border border-ink/20 p-6 rounded-sm space-y-6">
                <div className="flex items-center justify-between border-b border-ink/10 pb-4">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-copper font-semibold">
                      OAuth Delegation • Read-Only Scoped
                    </span>
                    <h3 className="text-xl font-serif text-ink mt-0.5">
                      Connect Gmail for Selective Import
                    </h3>
                  </div>
                  <span className="px-2 py-1 bg-paper border border-ink/10 text-muted-ink font-mono text-[10px] uppercase">
                    Zero Sync Architecture
                  </span>
                </div>

                <p className="text-xs font-sans text-ink leading-relaxed">
                  DataTrace does not sync, continuously scan, or store your mailbox. Authentication grants one-time, read-only access to import specific message threads into this case dossier as verified evidence items.
                </p>
                <p className="text-xs font-mono text-amber-900 bg-amber-50 border border-amber-200 p-3">
                  Testing only: connect synthetic test accounts. Do not use a personal or production mailbox.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                  <div className="p-3 bg-paper border border-ink/10 rounded-sm">
                    <div className="font-semibold text-ink mb-1">Strict Scope</div>
                    <div className="text-[11px] text-muted-ink">
                      gmail.readonly only. Cannot send, alter, or delete messages.
                    </div>
                  </div>
                  <div className="p-3 bg-paper border border-ink/10 rounded-sm">
                    <div className="font-semibold text-ink mb-1">Encrypted Vault</div>
                    <div className="text-[11px] text-muted-ink">
                      Refresh tokens sealed with AES-256-GCM. Plaintext never stored.
                    </div>
                  </div>
                  <div className="p-3 bg-paper border border-ink/10 rounded-sm">
                    <div className="font-semibold text-ink mb-1">Immutable Hash</div>
                    <div className="text-[11px] text-muted-ink">
                      Raw RFC-822 bytes stored byte-for-byte with verifiable SHA-256.
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleGmailConnect}
                    disabled={loading}
                    className="bg-copper text-paper px-6 py-2.5 text-xs font-mono uppercase tracking-wider font-semibold rounded-sm hover:bg-umber transition-colors disabled:opacity-50 shadow-xs flex items-center gap-2"
                  >
                    <span>Authorize Gmail Access →</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Connected status bar */}
                <div className="p-4 bg-paper-2 border border-ink/20 rounded-sm flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-600" />
                    <div>
                      <div className="text-xs font-mono text-ink">
                        Connected: <strong className="font-semibold">{gmailStatus.googleEmail}</strong>
                      </div>
                      <div className="text-[11px] font-mono text-muted-ink">
                        Scope: gmail.readonly • Status: ACTIVE • AES-256-GCM Vault
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleGmailDisconnect}
                    disabled={loading}
                    className="text-xs font-mono text-red-700 hover:text-red-900 border border-red-300 bg-paper px-3 py-1 rounded hover:bg-red-50 transition-colors uppercase tracking-wider"
                  >
                    Revoke & Disconnect
                  </button>
                </div>

                {/* Import result report */}
                {gmailImportResult && (
                  <div className="p-5 bg-green-50 border border-green-500/30 rounded-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-green-900 uppercase">
                        ✓ Gmail Import Complete ({gmailImportResult.items.length} messages)
                      </span>
                      {gmailImportResult.truncated && (
                        <span className="text-[10px] font-mono bg-amber/20 text-amber px-2 py-0.5 rounded">
                          Capped at 10 items (§10.6 limit)
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5 font-mono text-xs">
                      {gmailImportResult.items.map((it) => (
                        <div
                          key={it.id}
                          className="flex items-center justify-between p-2 bg-paper border border-hairline rounded"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink">{it.displayId}</span>
                            <span className="text-[11px] text-muted-ink select-all">
                              {it.sha256.slice(0, 16)}...
                            </span>
                          </div>
                          {it.duplicate ? (
                            <span className="text-[10px] font-medium text-amber uppercase">
                              Previously Preserved (Duplicate)
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-green-800 uppercase">
                              Preserved
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="pt-2 flex gap-4 text-xs font-mono">
                      <Link
                        href={`/cases/${caseId}`}
                        className="text-copper hover:underline uppercase tracking-wider font-medium"
                      >
                        Return to Case Dashboard →
                      </Link>
                    </div>
                  </div>
                )}

                {/* Search input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    searchThreads(gmailSearch);
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={gmailSearch}
                    onChange={(e) => setGmailSearch(e.target.value)}
                    placeholder="Search query (e.g. subject:deletion OR from:dpo@)"
                    className="flex-1 bg-paper-2 border border-hairline px-3 py-2 text-xs font-mono rounded-sm focus:outline-none focus:border-amber"
                  />
                  <button
                    type="submit"
                    disabled={loadingThreads}
                    className="bg-ink text-paper px-4 py-2 text-xs font-mono uppercase tracking-wider font-semibold rounded-sm hover:bg-neutral-800 transition-colors disabled:opacity-50"
                  >
                    {loadingThreads ? 'Searching...' : 'Search'}
                  </button>
                </form>

                {/* Thread results list */}
                <div className="space-y-2">
                  <div className="text-[11px] font-mono text-muted-ink uppercase tracking-wider">
                    Discovered Threads ({gmailThreads.length})
                  </div>

                  {gmailThreads.length === 0 && !loadingThreads && (
                    <div className="p-8 text-center bg-paper-2 border border-hairline rounded-sm text-xs font-mono text-muted-ink">
                      No threads matched &quot;{gmailSearch}&quot;. Try a different query.
                    </div>
                  )}

                  {gmailThreads.map((thread) => (
                    <div
                      key={thread.threadId}
                      className="p-4 bg-paper-2 border border-hairline hover:border-ink/30 transition-colors rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-serif font-medium text-ink truncate text-sm">
                            {thread.subject}
                          </span>
                          <span className="text-[10px] font-mono text-muted-ink px-1.5 py-0.5 bg-paper rounded border border-hairline whitespace-nowrap">
                            {thread.messageCount} msg{thread.messageCount > 1 ? 's' : ''}
                          </span>
                        </div>
                        <p className="text-xs font-sans text-muted-ink line-clamp-2">
                          {thread.snippet}
                        </p>
                        <div className="text-[11px] font-mono text-muted-ink">
                          From: {thread.from} • {new Date(thread.lastMessageAt).toLocaleDateString()}
                        </div>
                      </div>

                      <button
                        onClick={() => handleImportThread(thread.threadId)}
                        disabled={importingThreadId === thread.threadId}
                        className="bg-copper text-paper px-4 py-2 text-xs font-mono uppercase tracking-wider font-semibold rounded-sm hover:bg-umber transition-colors disabled:opacity-50 whitespace-nowrap self-start sm:self-center shadow-xs"
                      >
                        {importingThreadId === thread.threadId ? 'Importing...' : 'Import Thread'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <DisclaimerFooter />
    </Shell>
  );
}
