'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { MatrixTable } from '@/components/MatrixTable';
import { DisclaimerFooter } from '@/components/DisclaimerFooter';
import { useCaseTab, useRedirectOnAuthError } from '@/lib/queries';

export default function MatrixPage() {
  const params = useParams();
  const caseId = params.id as string;

  const { data: matrixData, isLoading, error } = useCaseTab(caseId, 'matrix');
  useRedirectOnAuthError(error);

  return (
    <Shell currentCaseId={caseId}>
      <div className="flex-1 max-w-6xl w-full mx-auto p-8 fade-in">
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
            {error.message}
          </div>
        )}

        {isLoading ? (
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
