import type { SupabaseClient } from '@supabase/supabase-js';

export interface AnalysisCancellationResult {
  runsCancelled: number;
  tasksCancelled: number;
  caseIds: string[];
}

/**
 * Immediately freezes the user's analysis pipeline when account deletion starts (D3).
 *
 * - Every PENDING/RUNNING analysis run owned by the user is moved to CANCELLED.
 * - Every QUEUED/RUNNING task belonging to those runs is moved to CANCELLED and
 *   its worker lease is released (required by analysis_tasks_lease_consistent).
 *
 * Idempotent: re-running with nothing active is a safe no-op.
 */
export async function cancelRunningAnalysisForUser(
  admin: SupabaseClient,
  userId: string
): Promise<AnalysisCancellationResult> {
  const { data: casesData, error: casesError } = await admin
    .from('cases')
    .select('id')
    .eq('owner_id', userId);

  if (casesError) {
    throw new Error(`Failed to load cases for analysis cancellation: ${casesError.message}`);
  }

  const caseIds = (casesData ?? []).map((c: { id: string }) => c.id);
  if (caseIds.length === 0) {
    return { runsCancelled: 0, tasksCancelled: 0, caseIds: [] };
  }

  // Cancel any run that could still write results.
  const { data: cancelledRuns, error: runsError } = await admin
    .from('analysis_runs')
    .update({
      status: 'CANCELLED',
      completed_at: new Date().toISOString(),
    })
    .in('status', ['PENDING', 'RUNNING'])
    .in('case_id', caseIds)
    .select('id');

  if (runsError) {
    throw new Error(`Failed to cancel running analysis runs: ${runsError.message}`);
  }

  const runIds = (cancelledRuns ?? []).map((r: { id: string }) => r.id);
  if (runIds.length === 0) {
    return { runsCancelled: 0, tasksCancelled: 0, caseIds };
  }

  // Release the lease while cancelling so analysis_tasks_lease_consistent holds.
  const { data: cancelledTasks, error: tasksError } = await admin
    .from('analysis_tasks')
    .update({
      status: 'CANCELLED',
      claimed_at: null,
      claim_token: null,
      failure_reason: 'Account deletion in progress',
    })
    .in('status', ['QUEUED', 'RUNNING'])
    .in('run_id', runIds)
    .select('id');

  if (tasksError) {
    throw new Error(`Failed to cancel running analysis tasks: ${tasksError.message}`);
  }

  return {
    runsCancelled: runIds.length,
    tasksCancelled: (cancelledTasks ?? []).length,
    caseIds,
  };
}
