'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { MatrixResponse } from '@/lib/types';
import { Shell } from '@/components/Shell';
import { MatrixTable } from '@/components/MatrixTable';
import { DisclaimerFooter } from '@/components/DisclaimerFooter';

export default function MatrixPage() {
  const params = useParams();
  const caseId = params.id as string;

  const [matrixData, setMatrixData] = useState<MatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMatrix = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.matrix.get(caseId);
        setMatrixData(data);
      } catch (err: any) {
        if (err.code === 'UNAUTHENTICATED' || err.status === 401) {
          window.location.href = '/auth';
          return;
        }
        setError(err.message || 'Error loading request-response matrix');
      } finally {
        setLoading(false);
      }
    };

    fetchMatrix();
  }, [caseId]);

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
          <div className="flex items-baseline justify-between">
            <div>
              <h1 className="text-3xl font-serif font-normal text-ink">Request-Response Matrix</h1>
              <p className="text-xs font-sans text-muted-ink mt-1">
                Deterministic correlation between rights requests and corporate correspondence.
              </p>
            </div>
            {matrixData?.summary && (
              <div className="text-right text-xs font-mono text-muted-ink">
                <div>Requests: <strong className="text-ink">{matrixData.summary.totalRequests}</strong></div>
                <div>Responses: <strong className="text-ink">{matrixData.summary.totalResponses}</strong></div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-sans rounded-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center font-mono text-xs text-muted-ink">
            Evaluating deterministic matrix correlations...
          </div>
        ) : !matrixData ? (
          <div className="py-20 text-center text-xs font-mono text-muted-ink">
            No matrix data available.
          </div>
        ) : (
          <MatrixTable matrix={matrixData.matrix} />
        )}
      </div>

      <DisclaimerFooter />
    </Shell>
  );
}
