'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { SourceType } from '@/lib/types';
import { Shell } from '@/components/Shell';
import { DisclaimerFooter } from '@/components/DisclaimerFooter';

export default function EvidenceUploadPage() {
  const params = useParams();
  const caseId = params.id as string;

  const [mode, setMode] = useState<'FILE' | 'MANUAL'>('FILE');
  const [sourceType, setSourceType] = useState<SourceType>('EMAIL');

  // File upload state
  const [file, setFile] = useState<File | null>(null);

  // Manual log state
  const [manualTitle, setManualTitle] = useState('');
  const [manualContent, setManualContent] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    displayId: string;
    sha256: string;
    segmentCount: number;
  } | null>(null);

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
        </div>

        {mode === 'FILE' ? (
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
              className="bg-ink text-paper px-6 py-2.5 text-xs font-mono uppercase tracking-wider rounded-sm hover:bg-neutral-800 transition-colors disabled:opacity-50"
            >
              {loading ? 'Ingesting & Hashing...' : 'Ingest Evidence'}
            </button>
          </form>
        ) : (
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
              className="bg-ink text-paper px-6 py-2.5 text-xs font-mono uppercase tracking-wider rounded-sm hover:bg-neutral-800 transition-colors disabled:opacity-50"
            >
              {loading ? 'Ingesting Record...' : 'Preserve Manual Log'}
            </button>
          </form>
        )}
      </div>

      <DisclaimerFooter />
    </Shell>
  );
}
