import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScopeMap } from '../../ai/gateway/scope';
import { scopeKey } from '../../ai/gateway/scope';

export type TaskType =
  | 'extraction'
  | 'response_analysis'
  | 'friction_analysis'
  | 'contradiction_consolidation'
  | 'report_draft'
  | 'vision_transcription';

export type TaskStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface QueuedTask {
  id: string;
  run_id: string;
  task_type: TaskType;
  status: TaskStatus;
  input_evidence_scope: unknown;
  prompt_id: string;
  prompt_version: string;
  schema_name: string;
  schema_version: string;
  provider: string;
  model: string;
  minimization_metadata: unknown;
  retry_count: number;
  created_at: string;
  claim_token: string;
}

export interface TaskResult {
  validated_output: unknown;
  output_sha256: string;
  tokens_in?: number;
  tokens_out?: number;
  latency_ms?: number;
  fallback_used: boolean;
}

/**
 * Gateway interface: Member D will implement the full gateway.
 * Until then, the worker uses this interface to call the mock stub.
 * At hackathon, swap MockGateway -> RealGateway without changing the worker.
 */
export interface AIGatewayInterface {
  run(
    task: QueuedTask,
    scopeMap: ScopeMap,
    segments: Array<{
      evidence_display_id: string;
      ordinal: number;
      segment_text: string;
      locator_type: string;
      locator: unknown;
    }>
  ): Promise<TaskResult>;
}
