import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { scopeKey } from '../../ai/gateway/scope';
import type { ScopeMap } from '../../ai/gateway/scope';
import { parseEvidenceScope } from './evidence-scope';
import type { AIGatewayInterface, QueuedTask } from './types';
import { MockGateway } from './mock-gateway';
import { RealGatewayAdapter } from './real-gateway';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role-key';
const POLL_INTERVAL_MS = Number.parseInt(process.env.WORKER_POLL_INTERVAL_MS || '3000', 10);
const MAX_RETRIES = 3;
const LEASE_TIMEOUT_MS = 5 * 60 * 1000;
const LEASE_HEARTBEAT_MS = 60 * 1000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Analysis task worker. Claims tasks using a database lease, limits provider
 * input to the evidence scope recorded on the task, and commits results with
 * their audit event in one database transaction.
 */
export class AnalysisWorker {
  private readonly admin;
  private readonly gateway: AIGatewayInterface;
  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(gateway?: AIGatewayInterface) {
    this.admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const provider = process.env.AI_PROVIDER ?? 'mock';
    this.gateway = gateway ?? (
      provider === 'mock' ? new MockGateway() : new RealGatewayAdapter()
    );
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log(`[Worker] Started. Polling every ${POLL_INTERVAL_MS}ms.`);
    this.scheduleNextPoll();
  }

  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('[Worker] Stopped.');
  }

  private scheduleNextPoll(): void {
    if (!this.running) return;
    this.pollTimer = setTimeout(() => this.poll(), POLL_INTERVAL_MS);
  }

  private async poll(): Promise<void> {
    try {
      await this.recoverExpiredTasks();
      await this.claimAndProcess();
    } catch (error) {
      console.error('[Worker] Poll error:', errorMessage(error));
    } finally {
      this.scheduleNextPoll();
    }
  }

  private async recoverExpiredTasks(): Promise<void> {
    const cutoff = new Date(Date.now() - LEASE_TIMEOUT_MS).toISOString();
    const staleFilter = `claimed_at.is.null,claimed_at.lt.${cutoff}`;
    const { data: staleTasks, error: selectError } = await this.admin
      .from('analysis_tasks')
      .select('id, run_id, retry_count')
      .eq('status', 'RUNNING')
      .or(staleFilter);

    if (selectError) {
      throw new Error(`Failed to find expired task leases: ${selectError.message}`);
    }

    for (const task of staleTasks ?? []) {
      const retryCount = task.retry_count + 1;
      const isFinal = retryCount >= MAX_RETRIES;
      const { data, error } = await this.admin
        .from('analysis_tasks')
        .update({
          status: isFinal ? 'FAILED' : 'QUEUED',
          retry_count: retryCount,
          failure_reason: 'Worker lease expired before task completion',
          claimed_at: null,
          claim_token: null,
        })
        .eq('id', task.id)
        .eq('status', 'RUNNING')
        .eq('retry_count', task.retry_count)
        .or(staleFilter)
        .select('id')
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to recover expired task ${task.id}: ${error.message}`);
      }

      if (data && isFinal) {
        await this.finalizeRun(task.run_id);
      }
    }
  }

  private async claimAndProcess(): Promise<void> {
    const claimToken = randomUUID();
    const { data, error } = await this.admin.rpc('claim_analysis_task', {
      p_claim_token: claimToken,
    });

    if (error) {
      throw new Error(`Failed to claim task: ${error.message}`);
    }

    const taskRecord = Array.isArray(data) ? data[0] : data;
    if (!taskRecord) return;

    const task = taskRecord as QueuedTask;
    console.log(`[Worker] Processing task ${task.id} type=${task.task_type}`);

    const heartbeat = setInterval(() => {
      void this.renewLease(task);
    }, LEASE_HEARTBEAT_MS);

    try {
      await this.processTask(task);
    } catch (error) {
      const reason = errorMessage(error);
      console.error(`[Worker] Task ${task.id} failed:`, reason);
      await this.failTask(task, reason);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async renewLease(task: QueuedTask): Promise<void> {
    const { data, error } = await this.admin
      .from('analysis_tasks')
      .update({ claimed_at: new Date().toISOString() })
      .eq('id', task.id)
      .eq('status', 'RUNNING')
      .eq('claim_token', task.claim_token)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error(`[Worker] Failed to renew lease for task ${task.id}:`, error.message);
    } else if (!data) {
      console.error(`[Worker] Lease for task ${task.id} is no longer owned by this worker.`);
    }
  }

  private async processTask(task: QueuedTask): Promise<void> {
    const { data: run, error: runError } = await this.admin
      .from('analysis_runs')
      .select('case_id')
      .eq('id', task.run_id)
      .single();

    if (runError) {
      throw new Error(`Failed to load analysis run ${task.run_id}: ${runError.message}`);
    }
    if (!run) {
      throw new Error(`Analysis run ${task.run_id} not found`);
    }

    const requestedScope = parseEvidenceScope(task.input_evidence_scope);
    const requestedById = new Map(requestedScope.map((entry) => [entry.evidenceDisplayId, entry]));
    const scopeMap: ScopeMap = new Map();
    const segments: Array<{
      evidence_display_id: string;
      ordinal: number;
      segment_text: string;
      locator_type: string;
      locator: unknown;
    }> = [];

    if (requestedScope.length > 0) {
      const { data: evidenceItems, error: evidenceError } = await this.admin
        .from('evidence_items')
        .select('id, display_id')
        .eq('case_id', run.case_id)
        .in('display_id', requestedScope.map((entry) => entry.evidenceDisplayId))
        .is('deleted_at', null)
        .neq('processing_status', 'QUARANTINED');

      if (evidenceError) {
        throw new Error(`Failed to load scoped evidence: ${evidenceError.message}`);
      }

      const foundSegmentOrdinals = new Map<string, Set<number>>();
      for (const evidence of evidenceItems ?? []) {
        const scope = requestedById.get(evidence.display_id);
        if (!scope) continue;

        const { data: evidenceSegments, error: segmentsError } = await this.admin
          .from('evidence_segments')
          .select('id, ordinal, locator_type, locator, segment_text')
          .eq('evidence_id', evidence.id)
          .order('ordinal', { ascending: true });

        if (segmentsError) {
          throw new Error(`Failed to load segments for ${evidence.display_id}: ${segmentsError.message}`);
        }

        const foundOrdinals = new Set<number>();
        for (const segment of evidenceSegments ?? []) {
          if (scope.segmentOrdinals && !scope.segmentOrdinals.includes(segment.ordinal)) continue;

          foundOrdinals.add(segment.ordinal);
          scopeMap.set(scopeKey(evidence.display_id, segment.ordinal), {
            evidenceId: evidence.id,
            segmentId: segment.id,
            locatorType: segment.locator_type,
            locator: segment.locator,
          });
          segments.push({
            evidence_display_id: evidence.display_id,
            ordinal: segment.ordinal,
            segment_text: segment.segment_text,
            locator_type: segment.locator_type,
            locator: segment.locator,
          });
        }
        foundSegmentOrdinals.set(evidence.display_id, foundOrdinals);
      }

      for (const scope of requestedScope) {
        const found = foundSegmentOrdinals.get(scope.evidenceDisplayId);
        if (!found || found.size === 0) {
          throw new Error(`No eligible segments found for scoped evidence ${scope.evidenceDisplayId}`);
        }

        const missingOrdinal = scope.segmentOrdinals?.find((ordinal) => !found.has(ordinal));
        if (missingOrdinal !== undefined) {
          throw new Error(
            `Scoped segment ${scope.evidenceDisplayId}#${missingOrdinal} was not found or is unavailable`
          );
        }
      }
    }

    const result = await this.gateway.run(task, scopeMap, segments);
    const serializedOutput = JSON.stringify(result.validated_output);
    if (serializedOutput === undefined) {
      throw new Error('Gateway returned output that cannot be serialized as JSON');
    }

    const computedHash = createHash('sha256').update(serializedOutput, 'utf8').digest('hex');
    if (computedHash !== result.output_sha256) {
      throw new Error(`Output hash mismatch! Expected=${result.output_sha256} Got=${computedHash}`);
    }

    const { data: completed, error: completionError } = await this.admin.rpc(
      'complete_analysis_task',
      {
        p_task_id: task.id,
        p_claim_token: task.claim_token,
        p_validated_output: result.validated_output,
        p_output_sha256: result.output_sha256,
        p_tokens_in: result.tokens_in ?? 0,
        p_tokens_out: result.tokens_out ?? 0,
        p_latency_ms: result.latency_ms ?? 0,
        p_fallback_used: result.fallback_used,
        p_scope_map_size: scopeMap.size,
      }
    );

    if (completionError) {
      throw new Error(`Failed to persist task and audit event: ${completionError.message}`);
    }
    if (completed !== true) {
      throw new Error(`Task ${task.id} is no longer owned by this worker`);
    }

    console.log(`[Worker] Task ${task.id} COMPLETED (latency=${result.latency_ms ?? 0}ms)`);
  }

  private async failTask(task: QueuedTask, reason: string): Promise<void> {
    const retryCount = task.retry_count + 1;
    const isFinal = retryCount >= MAX_RETRIES;
    const { data, error } = await this.admin
      .from('analysis_tasks')
      .update({
        status: isFinal ? 'FAILED' : 'QUEUED',
        retry_count: retryCount,
        failure_reason: reason,
        claimed_at: null,
        claim_token: null,
      })
      .eq('id', task.id)
      .eq('status', 'RUNNING')
      .eq('claim_token', task.claim_token)
      .select('id')
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to record failure for task ${task.id}: ${error.message}`);
    }
    if (!data) {
      console.warn(`[Worker] Task ${task.id} failure was not recorded because its lease was lost.`);
      return;
    }

    if (isFinal) {
      console.warn(`[Worker] Task ${task.id} FAILED after ${MAX_RETRIES} attempts: ${reason}`);
      await this.finalizeRun(task.run_id);
    } else {
      console.warn(`[Worker] Task ${task.id} re-queued for retry ${retryCount}/${MAX_RETRIES}`);
    }
  }

  private async finalizeRun(runId: string): Promise<void> {
    const { error } = await this.admin.rpc('finalize_analysis_run', { p_run_id: runId });
    if (error) {
      throw new Error(`Failed to finalize analysis run ${runId}: ${error.message}`);
    }
  }
}
