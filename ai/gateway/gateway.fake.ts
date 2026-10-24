import type { GatewayStore } from './gateway';
import type { ScopeItemInput } from './minimizer';
import type { ResolvedCandidate } from './resolver';

export interface FakeGatewayStore extends GatewayStore {
  quarantined: string[];
  tasks: Map<
    string,
    {
      taskId: string;
      caseId: string;
      taskType: string;
      promptId: string;
      promptVersion: string;
      status?: 'COMPLETED' | 'FAILED';
      failure?: string;
      accepted?: number;
      rejected?: unknown[];
      metadata?: Record<string, unknown>;
    }
  >;
  persisted: Array<{ caseId: string; taskId: string; items: ResolvedCandidate[] }>;
  owners: Map<string, string>;
  consents: Map<string, { policyVersion: string; revokedAt?: string | null }>;
  evidence: Map<string, ScopeItemInput[]>;
  nextDisplayIdNum: number;
  setOwner(caseId: string, userId: string): void;
  setConsent(
    caseId: string,
    consent: { policyVersion: string; revokedAt?: string | null } | null,
  ): void;
  setEvidence(caseId: string, items: ScopeItemInput[]): void;
}

export function createFakeGatewayStore(): FakeGatewayStore {
  const quarantined: string[] = [];
  const tasks = new Map<string, any>();
  const persisted: Array<{ caseId: string; taskId: string; items: ResolvedCandidate[] }> = [];
  const owners = new Map<string, string>();
  const consents = new Map<string, { policyVersion: string; revokedAt?: string | null }>();
  const evidence = new Map<string, ScopeItemInput[]>();
  let taskIdCounter = 1;
  let nextDisplayIdNum = 101;

  return {
    quarantined,
    tasks,
    persisted,
    owners,
    consents,
    evidence,
    nextDisplayIdNum,

    setOwner(caseId: string, userId: string): void {
      owners.set(caseId, userId);
    },

    setConsent(
      caseId: string,
      consent: { policyVersion: string; revokedAt?: string | null } | null,
    ): void {
      if (consent) {
        consents.set(caseId, consent);
      } else {
        consents.delete(caseId);
      }
    },

    setEvidence(caseId: string, items: ScopeItemInput[]): void {
      evidence.set(caseId, items);
    },

    isCaseOwner(caseId: string, userId: string): boolean {
      return owners.get(caseId) === userId;
    },

    getConsent(caseId: string): { policyVersion: string; revokedAt?: string | null } | null {
      return consents.get(caseId) ?? null;
    },

    loadEvidenceForScope(caseId: string, _itemIds?: string[]): ScopeItemInput[] {
      return evidence.get(caseId) ?? [];
    },

    quarantine(evidenceId: string): void {
      quarantined.push(evidenceId);
    },

    createTask(t: { caseId: string; taskType: string; promptId: string; promptVersion: string }): { taskId: string } {
      const taskId = `task-${taskIdCounter++}`;
      tasks.set(taskId, { ...t, taskId });
      return { taskId };
    },

    finishTask(
      taskId: string,
      r: {
        status: 'COMPLETED' | 'FAILED';
        failure?: string;
        accepted: number;
        rejected: unknown[];
        metadata: Record<string, unknown>;
      },
    ): void {
      const existing = tasks.get(taskId) ?? { taskId };
      tasks.set(taskId, { ...existing, ...r });
    },

    persistFindings(
      caseId: string,
      taskId: string,
      items: ResolvedCandidate[],
    ): { displayIds: string[] } {
      persisted.push({ caseId, taskId, items: [...items] });
      const displayIds: string[] = [];
      for (let i = 0; i < items.length; i++) {
        displayIds.push(`FND-${nextDisplayIdNum++}`);
      }
      return { displayIds };
    },
  };
}
