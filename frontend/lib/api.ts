import { createClient } from './supabase';
import { ApiResponseError } from './types';

/**
 * apiFetch — the single gateway for all backend calls.
 *
 * Rules (from spec §7.2 / prompt hard rules):
 *   - Attaches the Supabase access token as Bearer header.
 *   - Parses the standard error envelope { error: { code, message, details? } }.
 *   - Components NEVER call fetch('/api/...') directly.
 *   - Components NEVER import a Storage or Supabase DB client.
 */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  const res = await fetch(`/api/${path.replace(/^\//, '')}`, {
    ...init,
    headers,
  });

  // Parse JSON
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiResponseError(
      'PARSE_ERROR',
      `Server returned non-JSON response (status ${res.status})`,
      undefined,
      res.status
    );
  }

  // Handle error envelope
  if (!res.ok) {
    const err = (body as any)?.error;
    if (err?.code) {
      throw new ApiResponseError(err.code, err.message, err.details, res.status);
    }
    throw new ApiResponseError(
      'UNKNOWN_ERROR',
      `Request failed with status ${res.status}`,
      body,
      res.status
    );
  }

  return body as T;
}

// ─── Typed API helpers ────────────────────────────────────────────────────────

import type {
  Case,
  EvidenceItem,
  EvidenceDetail,
  DownloadResult,
  Finding,
  AnalysisRun,
  MatrixResponse,
  Report,
  ValidationDetails,
  AuditEvent,
  UploadEvidenceInput,
  ReportContent,
} from './types';

// Cases
export const api = {
  cases: {
    list: () => apiFetch<{ cases: Case[] }>('cases'),
    get: (id: string) => apiFetch<Case>(`cases/${id}`),
    create: (body: { title: string; description?: string }) =>
      apiFetch<Case>('cases', { method: 'POST', body: JSON.stringify(body) }),
  },

  evidence: {
    list: (caseId: string) =>
      apiFetch<{ evidence: EvidenceItem[] }>(`cases/${caseId}/evidence`),
    get: (evidenceId: string) =>
      apiFetch<EvidenceDetail>(`evidence/${evidenceId}`),
    upload: (caseId: string, body: UploadEvidenceInput) =>
      apiFetch<{ id: string; displayId: string; sha256: string; segmentCount: number }>(
        `cases/${caseId}/evidence`,
        { method: 'POST', body: JSON.stringify(body) }
      ),
    download: (evidenceId: string) =>
      apiFetch<DownloadResult>(`evidence/${evidenceId}/download`),
  },

  findings: {
    list: (caseId: string) =>
      apiFetch<{ findings: Finding[] }>(`cases/${caseId}/findings`),
    confirm: (findingId: string, mode: 'READING_CONFIRMED' | 'USER_CONFIRMED') =>
      apiFetch<{ success: boolean; confirmedAt: string }>(
        `findings/${findingId}/confirm`,
        { method: 'POST', body: JSON.stringify({ mode }) }
      ),
  },

  analysis: {
    start: (caseId: string, body?: { taskTypes?: string[]; evidenceIds?: string[] }) =>
      apiFetch<{ runId: string; status: string; taskCount: number }>(
        `cases/${caseId}/analyze`,
        { method: 'POST', body: JSON.stringify(body ?? {}) }
      ),
    getRun: (runId: string) =>
      apiFetch<{ run: AnalysisRun }>(`analysis-runs/${runId}`),
    listRuns: (caseId: string) =>
      apiFetch<{ runs: AnalysisRun[] }>(`cases/${caseId}/runs`),
    // Consent endpoints — not yet implemented in backend (§15.2 gap)
    setConsent: (caseId: string) =>
      apiFetch<{ success: boolean }>(`cases/${caseId}/consent`, { method: 'POST' }),
    revokeConsent: (caseId: string) =>
      apiFetch<{ success: boolean }>(`cases/${caseId}/consent`, { method: 'DELETE' }),
  },

  matrix: {
    get: (caseId: string) =>
      apiFetch<MatrixResponse>(`cases/${caseId}/request-response-matrix`),
  },

  reports: {
    list: (caseId: string) =>
      apiFetch<{ reports: Report[] }>(`cases/${caseId}/reports`),
    get: (reportId: string) =>
      apiFetch<{ report: Report }>(`reports/${reportId}`),
    create: (caseId: string, body: { lens: 'EVIDENCE' | 'FINDINGS' | 'COMPLAINT'; framework?: string }) =>
      apiFetch<{ report: Report }>(`cases/${caseId}/reports`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (reportId: string, content: ReportContent) =>
      apiFetch<{ report: Report }>(`reports/${reportId}`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }),
    validate: (reportId: string) =>
      apiFetch<{ reportId: string; validationStatus: string; details: ValidationDetails }>(
        `reports/${reportId}/validate`,
        { method: 'POST' }
      ),
    export: (reportId: string) =>
      apiFetch<{ reportId: string; markdown: string; json: unknown; exportedAt: string }>(
        `reports/${reportId}/export`
      ),
  },

  audit: {
    list: (caseId: string) =>
      apiFetch<{ events: AuditEvent[] }>(`cases/${caseId}/audit`),
  },

  gmail: {
    getStatus: () =>
      apiFetch<{ connected: boolean; googleEmail?: string; status?: 'ACTIVE' | 'EXPIRED' }>('gmail/status'),
    connect: () =>
      apiFetch<{ authUrl: string; state: string }>('gmail/connect', { method: 'POST' }),
    listThreads: (q?: string, pageToken?: string) => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (pageToken) params.set('pageToken', pageToken);
      const qs = params.toString();
      return apiFetch<{
        threads: Array<{
          threadId: string;
          subject: string;
          from: string;
          snippet: string;
          messageCount: number;
          lastMessageAt: string;
        }>;
        nextPageToken?: string;
      }>(`gmail/threads${qs ? `?${qs}` : ''}`);
    },
    importThread: (caseId: string, threadId: string, maxMessages = 10) =>
      apiFetch<{
        items: Array<{
          id: string;
          displayId: string;
          sha256: string;
          duplicate: boolean;
        }>;
        truncated: boolean;
      }>(`cases/${caseId}/evidence/gmail`, {
        method: 'POST',
        body: JSON.stringify({ threadId, maxMessages }),
      }),
    disconnect: () =>
      apiFetch<{ disconnected: boolean }>('gmail/connection', { method: 'DELETE' }),
  },
};
