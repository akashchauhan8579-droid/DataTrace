'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Case, EvidenceItem, Finding, AnalysisRun } from '@/lib/types';
import { Shell } from '@/components/Shell';
import { EvidenceCard } from '@/components/EvidenceCard';
import { ConsentDialog } from '@/components/ConsentDialog';
import { DisclaimerFooter } from '@/components/DisclaimerFooter';
import {
  queryKeys,
  useCaseDetail,
  useEvidenceList,
  useFindings,
  useRedirectOnAuthError,
  useRuns,
} from '@/lib/queries';

export default function CaseDashboardPage() {
  const params = useParams();
  const caseId = params.id as string;
  const queryClient = useQueryClient();

  const caseQuery = useCaseDetail(caseId);
  const evidenceQuery = useEvidenceList(caseId);
  const findingsQuery = useFindings(caseId);
  const runsQuery = useRuns(caseId);

  useRedirectOnAuthError(caseQuery.error);
  useRedirectOnAuthError(evidenceQuery.error);
  useRedirectOnAuthError(findingsQuery.error);
  useRedirectOnAuthError(runsQuery.error);

  const currentCase: Case | null = caseQuery.data ?? null;
  const evidence: EvidenceItem[] = evidenceQuery.data?.evidence ?? [];
  const findings: Finding[] = findingsQuery.data?.findings ?? [];
  const runs: AnalysisRun[] = runsQuery.data?.runs ?? [];

  const loading =
    caseQuery.isLoading ||
    evidenceQuery.isLoading ||
    findingsQuery.isLoading ||
    runsQuery.isLoading;
  const error = caseQuery.error as Error | null;

  // Analysis / Consent state
  const [showConsent, setShowConsent] = useState(false);
  const [hasConsent, setHasConsent] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  // Polling for active run
  useEffect(() => {
    if (!activeRunId) return;

    const interval = setInterval(async () => {
      try {
        const { run } = await api.analysis.getRun(activeRunId);
        if (run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED') {
          setActiveRunId(null);
          setAnalyzing(false);
          await queryClient.invalidateQueries({ queryKey: queryKeys.findings(caseId) });
          await queryClient.invalidateQueries({ queryKey: queryKeys.runs(caseId) });
          await queryClient.invalidateQueries({ queryKey: queryKeys.case(caseId) });
        }
      } catch {
        setActiveRunId(null);
        setAnalyzing(false);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeRunId, caseId, queryClient]);

  const handleStartAnalysis = async () => {
    setAnalyzing(true);
    setShowConsent(false);
    setStartError(null);

    try {
      // Invariant §15.2: Explicitly record AI consent for this case.
      // If this call fails, HALT immediately — do NOT continue to start analysis!
      await api.analysis.setConsent(caseId);
      setHasConsent(true);

      const res = await api.analysis.start(caseId);

      // Tasks run inline on the server so the run may already be complete by
      // the time we get a response. Invalidate findings, runs, and the case
      // root immediately so all counters refresh without waiting for polling.
      await queryClient.invalidateQueries({ queryKey: queryKeys.findings(caseId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.runs(caseId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.case(caseId) });

      // Still set activeRunId so the polling effect can pick up any tasks
      // that are still in-flight (e.g. slow provider calls).
      setActiveRunId(res.runId);
    } catch (err: any) {
      setStartError(err.message || 'Failed to authorize and start analysis run');
      setAnalyzing(false);
    }
  };

  const verifiedCount = findings.filter((f) => f.verification_state === 'VERIFIED').length;
  const inferredCount = findings.filter(
    (f) => f.verification_state === 'AI_INFERRED' || f.evidence_basis === 'INFERRED' || f.verification_state === 'UNVERIFIED'
  ).length;
  const contradictionCount = findings.filter((f) => f.finding_type === 'CONTRADICTION').length;

  return (
    <Shell currentCaseId={caseId} caseDisplayId={currentCase?.displayId}>
      <div className="flex-1 flex flex-col p-8 max-w-7xl w-full mx-auto fade-in">
        {(startError || error) && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-sans rounded-sm">
            {startError || error?.message}
          </div>
        )}

        {loading ? (
          <div className="py-24 text-center font-mono text-xs text-muted-ink">
            Loading preserved case state...
          </div>
        ) : !currentCase ? (
          <div className="py-24 text-center text-sm font-sans text-muted-ink">
            Case record not found.
          </div>
        ) : (
          <>
            {/* Top Overview: Left metadata, Right Analysis Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-paper-2 rounded border border-hairline">
                    {currentCase.displayId}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-ink border px-1.5 py-0.5 rounded">
                    {currentCase.status}
                  </span>
                </div>

                <h1 className="text-3xl font-serif font-normal text-ink leading-tight">
                  {currentCase.title}
                </h1>

                {currentCase.description && (
                  <p className="text-xs font-sans text-muted-ink max-w-2xl leading-relaxed">
                    {currentCase.description}
                  </p>
                )}

                {/* Metric counters */}
                <div className="grid grid-cols-4 gap-4 pt-4 border-t border-hairline max-w-xl">
                  <div>
                    <span className="block text-[10px] font-mono uppercase tracking-wider text-muted-ink">
                      Evidence
                    </span>
                    <span className="text-xl font-serif text-ink">{evidence.length}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-mono uppercase tracking-wider text-muted-ink">
                      Verified
                    </span>
                    <span className="text-xl font-serif text-green-800">{verifiedCount}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-mono uppercase tracking-wider text-muted-ink">
                      Inferred
                    </span>
                    <span className="text-xl font-serif text-amber">{inferredCount}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-mono uppercase tracking-wider text-muted-ink">
                      Contradictions
                    </span>
                    <span className="text-xl font-serif text-red-700">{contradictionCount}</span>
                  </div>
                </div>
              </div>

              {/* Analysis Panel */}
              <div className="bg-paper-2 border border-hairline p-6 rounded-sm flex flex-col justify-between shadow-xs">
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-muted-ink mb-2">
                    <span className="uppercase tracking-widest text-[10px]">Intelligence Pipeline</span>
                    {activeRunId ? (
                      <span className="text-amber animate-pulse">Running…</span>
                    ) : (
                      <span>Idle</span>
                    )}
                  </div>
                  <h2 className="text-lg font-serif text-ink mb-2">Evidence-Scope Analysis</h2>
                  <p className="text-xs font-sans text-muted-ink leading-relaxed mb-4">
                    Executes minimal prompt extractions on ingested items. Generates candidate findings strictly backed by segment citations.
                  </p>

                  {runs.length > 0 && (
                    <div className="text-[11px] font-mono text-muted-ink space-y-1 mb-4 border-t border-hairline pt-3">
                      <div>Latest Run: {runs[0].status}</div>
                      <div>Tasks: {runs[0].tasks?.length || 0} queued/executed</div>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-hairline">
                  <button
                    onClick={() => setShowConsent(true)}
                    disabled={analyzing || evidence.length === 0}
                    className="w-full bg-copper text-paper py-2.5 px-4 text-xs font-mono uppercase tracking-wider font-semibold rounded-sm hover:bg-umber transition-colors disabled:opacity-50 shadow-xs"
                  >
                    {analyzing
                      ? 'Executing Tasks...'
                      : evidence.length === 0
                      ? 'Upload Evidence First'
                      : 'Run Model Analysis'}
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Rail: Evidence Filmstrip */}
            <div className="mt-auto pt-6 border-t border-hairline">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-ink">
                    Preserved Rail
                  </span>
                  <h2 className="text-xl font-serif text-ink">Evidence Items</h2>
                </div>
                <Link
                  href={`/cases/${caseId}/evidence`}
                  className="text-xs font-mono uppercase tracking-wider text-copper hover:underline"
                >
                  + Ingest New Item
                </Link>
              </div>

              {evidence.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-hairline rounded-sm bg-paper-2/30 text-xs font-sans text-muted-ink">
                  No evidence uploaded yet. Add an email (.eml), document (.pdf), or manual record to begin.
                </div>
              ) : (
                <div className="flex gap-4 overflow-x-auto pb-4 pt-1 scrollbar-thin">
                  {evidence.map((item) => (
                    <EvidenceCard key={item.id} item={item} caseId={caseId} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <ConsentDialog
        isOpen={showConsent}
        onClose={() => setShowConsent(false)}
        onConfirm={handleStartAnalysis}
        loading={analyzing}
      />

      <DisclaimerFooter />
    </Shell>
  );
}
