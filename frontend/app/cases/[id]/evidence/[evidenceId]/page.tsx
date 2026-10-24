'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { EvidenceDetail } from '@/lib/types';
import { Shell } from '@/components/Shell';
import { SegmentView } from '@/components/SegmentView';
import { DisclaimerFooter } from '@/components/DisclaimerFooter';

export default function EvidenceViewerPage() {
  const params = useParams();
  const caseId = params.id as string;
  const evidenceId = params.evidenceId as string;

  const [detail, setDetail] = useState<EvidenceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const fetchEvidence = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.evidence.get(evidenceId);
        setDetail(data);
      } catch (err: any) {
        if (err.code === 'UNAUTHENTICATED' || err.status === 401) {
          window.location.href = '/auth';
          return;
        }
        setError(err.message || 'Error loading evidence');
      } finally {
        setLoading(false);
      }
    };

    fetchEvidence();
  }, [evidenceId]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await api.evidence.download(evidenceId);
      window.open(res.url, '_blank');
    } catch (err: any) {
      alert(`Download authorization refused: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Shell currentCaseId={caseId}>
      <div className="flex-1 max-w-6xl w-full mx-auto p-8">
        <div className="border-b border-hairline pb-4 mb-6">
          <Link
            href={`/cases/${caseId}`}
            className="text-xs font-mono text-muted-ink hover:text-ink uppercase tracking-wider mb-2 inline-block"
          >
            ← Back to Case
          </Link>

          {detail && (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-2">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-paper-2 rounded border border-hairline">
                    {detail.item.display_id}
                  </span>
                  <span className="text-xs font-mono text-green-800 bg-green-50 px-2 py-0.5 rounded border border-green-300">
                    INTEGRITY VERIFIED
                  </span>
                </div>
                <h1 className="text-2xl font-serif text-ink">{detail.item.original_filename}</h1>
                <div className="text-xs font-mono text-muted-ink mt-1 space-x-2">
                  <span>SHA-256: <strong className="text-ink select-all">{detail.item.sha256}</strong></span>
                  <span>·</span>
                  <span>{(detail.item.size_bytes / 1024).toFixed(1)} KB</span>
                </div>
              </div>

              <button
                onClick={handleDownload}
                disabled={downloading}
                className="bg-paper-2 border border-hairline hover:border-ink px-4 py-2 text-xs font-mono uppercase tracking-wider text-ink rounded-sm transition-colors"
              >
                {downloading ? 'Authorizing…' : 'Download Original ↓'}
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-sans rounded-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center font-mono text-xs text-muted-ink">
            Loading segments and content ledger...
          </div>
        ) : !detail ? (
          <div className="py-20 text-center text-xs text-muted-ink">
            Evidence item not found.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Main content: Segments */}
            <div className="lg:col-span-3 space-y-4">
              <div className="flex items-center justify-between text-xs font-mono text-muted-ink pb-2 border-b border-hairline">
                <span>EXTRACTED NORMALIZED SEGMENTS</span>
                <span>{detail.segments.length} segments</span>
              </div>

              {detail.segments.length === 0 ? (
                <div className="p-8 text-center bg-paper-2 border border-hairline text-xs font-mono text-muted-ink">
                  No text segments extracted for this item.
                </div>
              ) : (
                detail.segments.map((seg: any) => (
                  <SegmentView key={seg.id} segment={seg} />
                ))
              )}
            </div>

            {/* Sidebar: Metadata */}
            <div className="space-y-6">
              <div className="bg-paper-2 border border-hairline p-4 rounded-sm">
                <h3 className="text-xs font-mono uppercase tracking-wider text-muted-ink mb-3">
                  Provenance Details
                </h3>
                <dl className="text-xs font-mono space-y-2 text-muted-ink">
                  <div>
                    <dt className="text-[10px] text-muted-ink/80">Source Type</dt>
                    <dd className="text-ink font-semibold">{detail.item.source_type}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-muted-ink/80">MIME Type</dt>
                    <dd className="text-ink truncate">{detail.item.mime_type}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-muted-ink/80">Ingested At</dt>
                    <dd className="text-ink">{new Date(detail.item.uploaded_at).toLocaleString()}</dd>
                  </div>
                </dl>
              </div>

              {detail.artifacts.length > 0 && (
                <div className="bg-paper-2 border border-hairline p-4 rounded-sm">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-muted-ink mb-2">
                    Artifacts
                  </h3>
                  <div className="space-y-1">
                    {detail.artifacts.map((art: any) => (
                      <div key={art.id} className="text-[11px] font-mono text-muted-ink border-b border-hairline/40 py-1">
                        <span className="text-ink">{art.artifact_type}</span> ({art.extraction_method})
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <DisclaimerFooter />
    </Shell>
  );
}
