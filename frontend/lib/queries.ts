'use client';

import { useEffect } from 'react';
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { api } from './api';
import type {
  AnalysisRun,
  AuditEvent,
  Case,
  EvidenceDetail,
  EvidenceItem,
  Finding,
  MatrixResponse,
  Report,
} from './types';

// ─── Query keys ───────────────────────────────────────────────────────────────
// Tab keys intentionally match the granular keys where the payloads are the
// same shape (findings/matrix/audit), so prefetching one tab warms the others.

export const queryKeys = {
  case: (caseId: string) => ['case', caseId] as const,
  tab: (caseId: string, tab: CaseTab) => ['case', caseId, tab] as const,
  detail: (caseId: string) => ['case', caseId, 'detail'] as const,
  evidence: (caseId: string) => ['case', caseId, 'evidence'] as const,
  findings: (caseId: string) => ['case', caseId, 'findings'] as const,
  runs: (caseId: string) => ['case', caseId, 'runs'] as const,
  matrix: (caseId: string) => ['case', caseId, 'matrix'] as const,
  reports: (caseId: string) => ['case', caseId, 'reports'] as const,
  audit: (caseId: string) => ['case', caseId, 'audit'] as const,
  evidenceDetail: (evidenceId: string) => ['evidence', evidenceId] as const,
};

// ─── Tab payloads ─────────────────────────────────────────────────────────────

export const CASE_TABS = [
  'findings',
  'timeline',
  'graph',
  'matrix',
  'report',
  'audit',
] as const;

export type CaseTab = (typeof CASE_TABS)[number];

/** Tabs warmed as soon as a case opens. */
export const PREFETCH_TABS: readonly CaseTab[] = [
  'findings',
  'timeline',
  'graph',
  'matrix',
  'report',
];

export interface CaseTabDataMap {
  findings: { findings: Finding[] };
  timeline: { caseData: Case; evidence: EvidenceItem[]; findings: Finding[] };
  graph: { caseData: Case; evidence: EvidenceItem[]; findings: Finding[] };
  matrix: MatrixResponse;
  report: { reports: Report[]; findings: Finding[]; evidence: EvidenceItem[] };
  audit: { events: AuditEvent[] };
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

/**
 * Builds a tab payload from the granular case queries. `fetchQuery` shares and
 * de-duplicates the underlying requests, so warming every tab does not refetch
 * case detail, evidence and findings once per tab.
 */
export async function fetchTab<T extends CaseTab>(
  queryClient: QueryClient,
  caseId: string,
  tab: T
): Promise<CaseTabDataMap[T]> {
  switch (tab) {
    case 'findings':
      return (await api.findings.list(caseId)) as CaseTabDataMap[T];

    case 'timeline': {
      const [caseData, evidence, findings] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: queryKeys.detail(caseId),
          queryFn: () => api.cases.get(caseId),
        }),
        queryClient.fetchQuery({
          queryKey: queryKeys.evidence(caseId),
          queryFn: () => api.evidence.list(caseId),
        }),
        queryClient.fetchQuery({
          queryKey: queryKeys.findings(caseId),
          queryFn: () => api.findings.list(caseId),
        }),
      ]);

      return {
        caseData,
        evidence: evidence.evidence ?? [],
        findings: findings.findings ?? [],
      } as CaseTabDataMap[T];
    }

    case 'graph': {
      const [caseData, evidence, findings] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: queryKeys.detail(caseId),
          queryFn: () => api.cases.get(caseId),
        }),
        queryClient.fetchQuery({
          queryKey: queryKeys.evidence(caseId),
          queryFn: () => api.evidence.list(caseId),
        }),
        queryClient.fetchQuery({
          queryKey: queryKeys.findings(caseId),
          queryFn: () => api.findings.list(caseId),
        }),
      ]);

      return {
        caseData,
        evidence: evidence.evidence ?? [],
        findings: findings.findings ?? [],
      } as CaseTabDataMap[T];
    }

    case 'matrix':
      return (await api.matrix.get(caseId)) as CaseTabDataMap[T];

    case 'report': {
      const [reports, findings, evidence] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: queryKeys.reports(caseId),
          queryFn: () => api.reports.list(caseId),
        }),
        queryClient.fetchQuery({
          queryKey: queryKeys.findings(caseId),
          queryFn: () => api.findings.list(caseId),
        }),
        queryClient.fetchQuery({
          queryKey: queryKeys.evidence(caseId),
          queryFn: () => api.evidence.list(caseId),
        }),
      ]);

      const evidenceList = evidence.evidence ?? [];
      const firstEvidence = evidenceList[0];
      if (firstEvidence) {
        // Warm the reference panel without blocking the report payload.
        void queryClient.prefetchQuery({
          queryKey: queryKeys.evidenceDetail(firstEvidence.id),
          queryFn: () => api.evidence.get(firstEvidence.id),
        });
      }

      return {
        reports: reports.reports ?? [],
        findings: findings.findings ?? [],
        evidence: evidenceList,
      } as CaseTabDataMap[T];
    }

    case 'audit':
      return (await api.audit.list(caseId)) as CaseTabDataMap[T];

    default:
      throw new Error(`Unknown case tab: ${String(tab)}`);
  }
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useCaseTab<T extends CaseTab>(caseId: string, tab: T) {
  const queryClient = useQueryClient();

  return useQuery<CaseTabDataMap[T]>({
    queryKey: queryKeys.tab(caseId, tab),
    queryFn: () => fetchTab(queryClient, caseId, tab),
    enabled: Boolean(caseId),
  });
}

export function useCaseDetail(caseId: string) {
  return useQuery({
    queryKey: queryKeys.detail(caseId),
    queryFn: () => api.cases.get(caseId),
    enabled: Boolean(caseId),
  });
}

export function useEvidenceList(caseId: string) {
  return useQuery({
    queryKey: queryKeys.evidence(caseId),
    queryFn: () => api.evidence.list(caseId),
    enabled: Boolean(caseId),
  });
}

export function useFindings(caseId: string) {
  return useQuery({
    queryKey: queryKeys.findings(caseId),
    queryFn: () => api.findings.list(caseId),
    enabled: Boolean(caseId),
  });
}

export function useRuns(caseId: string) {
  return useQuery<{ runs: AnalysisRun[] }>({
    queryKey: queryKeys.runs(caseId),
    queryFn: () => api.analysis.listRuns(caseId),
    enabled: Boolean(caseId),
  });
}

export function useEvidenceDetail(evidenceId: string | null | undefined) {
  return useQuery<EvidenceDetail>({
    queryKey: queryKeys.evidenceDetail(evidenceId ?? ''),
    queryFn: () => api.evidence.get(evidenceId as string),
    enabled: Boolean(evidenceId),
  });
}

/** Warms every tab as soon as a case is opened. */
export function usePrefetchCaseTabs(caseId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!caseId) return;

    for (const tab of PREFETCH_TABS) {
      void queryClient.prefetchQuery({
        queryKey: queryKeys.tab(caseId, tab),
        queryFn: () => fetchTab(queryClient, caseId, tab),
      });
    }
  }, [caseId, queryClient]);
}

/** Keeps the existing page-level 401 → /auth behaviour for query errors. */
export function useRedirectOnAuthError(error: unknown) {
  useEffect(() => {
    if (!error) return;
    const candidate = error as { code?: string; status?: number };
    if (candidate.code === 'UNAUTHENTICATED' || candidate.status === 401) {
      window.location.href = '/auth';
    }
  }, [error]);
}
