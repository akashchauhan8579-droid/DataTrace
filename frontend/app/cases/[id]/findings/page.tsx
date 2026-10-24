'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Finding } from '@/lib/types';
import { Shell } from '@/components/Shell';
import { FindingRow } from '@/components/FindingRow';
import { DisclaimerFooter } from '@/components/DisclaimerFooter';

export default function FindingsPage() {
  const params = useParams();
  const caseId = params.id as string;

  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const fetchFindings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.findings.list(caseId);
      setFindings(data.findings || []);
    } catch (err: any) {
      if (err.code === 'UNAUTHENTICATED' || err.status === 401) {
        window.location.href = '/auth';
        return;
      }
      setError(err.message || 'Failed to load findings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFindings();
  }, [caseId]);

  const handleConfirm = async (findingId: string) => {
    setConfirmingId(findingId);
    try {
      await api.findings.confirm(findingId, 'READING_CONFIRMED');
      await fetchFindings();
    } catch (err: any) {
      alert(`Confirmation failed: ${err.message}`);
    } finally {
      setConfirmingId(null);
    }
  };

  const filteredFindings = findings.filter((f) => {
    if (filterType === 'ALL') return true;
    if (filterType === 'CONTRADICTIONS') return f.finding_type === 'CONTRADICTION';
    if (filterType === 'VERIFIED') return f.verification_state === 'VERIFIED';
    if (filterType === 'INFERRED') return f.verification_state === 'AI_INFERRED';
    return true;
  });

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
          <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-4">
            <div>
              <h1 className="text-3xl font-serif font-normal text-ink">Structured Findings</h1>
              <p className="text-xs font-sans text-muted-ink mt-1">
                Every verified finding is deterministically grounded in quoted segment evidence.
              </p>
            </div>

            {/* Filter buttons */}
            <div className="flex gap-1 text-xs font-mono">
              {['ALL', 'VERIFIED', 'INFERRED', 'CONTRADICTIONS'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  className={`px-3 py-1 rounded-sm uppercase tracking-wider transition-colors ${
                    filterType === f
                      ? 'bg-ink text-paper font-medium'
                      : 'bg-paper-2 text-muted-ink hover:text-ink'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-sans rounded-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center font-mono text-xs text-muted-ink">
            Loading verified finding records...
          </div>
        ) : filteredFindings.length === 0 ? (
          <div className="py-20 text-center bg-paper-2/40 border border-dashed border-hairline rounded-sm p-8 text-xs font-mono text-muted-ink">
            No findings match the selected filter. Run analysis or upload more evidence to generate candidates.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredFindings.map((finding) => (
              <FindingRow
                key={finding.id}
                finding={finding}
                caseId={caseId}
                onConfirm={handleConfirm}
                confirming={confirmingId === finding.id}
              />
            ))}
          </div>
        )}
      </div>

      <DisclaimerFooter />
    </Shell>
  );
}
