import { z } from 'zod';
import type { RouteDef } from '../types';

export const StartAnalysisInputSchema = z.object({
  taskTypes: z
    .array(
      z.enum([
        'extraction',
        'response_analysis',
        'friction_analysis',
        'contradiction_consolidation',
        'report_draft',
        'vision_transcription',
      ]),
    )
    .optional(),
  evidenceIds: z.array(z.string()).optional(),
}).strict();

export const analysisRoutes: RouteDef[] = [
  // List analysis runs for a case
  {
    method: 'GET',
    pattern: '/cases/:id/runs',
    auth: 'user',
    handler: async ({ user, db, params }) => {
      // Verify case ownership
      const { data: caseRow } = await db
        .from('cases')
        .select('id')
        .eq('id', params.id)
        .eq('owner_id', user.id)
        .single();

      if (!caseRow) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: `Case ${params.id} not found` } }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const { data: runs, error } = await db
        .from('analysis_runs')
        .select(`
          id, case_id, status, requested_by, configuration_version, started_at, completed_at,
          analysis_tasks (
            id, task_type, status, provider, model, tokens_in, tokens_out, latency_ms, retry_count, failure_reason, created_at
          )
        `)
        .eq('case_id', params.id)
        .order('started_at', { ascending: false });

      if (error) {
        throw new Error(`Database error listing analysis runs: ${error.message}`);
      }

      return { runs: runs || [] };
    },
  },

  // Get single analysis run with task progress
  {
    method: 'GET',
    pattern: '/analysis-runs/:id',
    auth: 'user',
    handler: async ({ user, db, params }) => {
      const { data: run, error } = await db
        .from('analysis_runs')
        .select(`
          id, case_id, status, requested_by, configuration_version, started_at, completed_at,
          cases!inner(owner_id),
          analysis_tasks (
            id, task_type, status, prompt_id, prompt_version, provider, model,
            tokens_in, tokens_out, latency_ms, retry_count, fallback_used, failure_reason, created_at
          )
        `)
        .eq('id', params.id)
        .single();

      if (error || !run || (run.cases as any)?.owner_id !== user.id) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: `Analysis run ${params.id} not found` } }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const tasks = (run as any).analysis_tasks || [];
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter((t: any) => t.status === 'COMPLETED').length;
      const failedTasks = tasks.filter((t: any) => t.status === 'FAILED').length;
      const runningTasks = tasks.filter((t: any) => t.status === 'RUNNING').length;
      const queuedTasks = tasks.filter((t: any) => t.status === 'QUEUED').length;

      return {
        run: {
          id: run.id,
          caseId: run.case_id,
          status: run.status,
          startedAt: run.started_at,
          completedAt: run.completed_at,
          progress: {
            total: totalTasks,
            completed: completedTasks,
            failed: failedTasks,
            running: runningTasks,
            queued: queuedTasks,
          },
          tasks,
        },
      };
    },
  },

  // Start / trigger new analysis run (§10, §11, §17.4)
  {
    method: 'POST',
    pattern: '/cases/:id/runs',
    auth: 'user',
    input: StartAnalysisInputSchema,
    handler: async ({ user, db, admin, params, req }) => {
      const body = await req.json().catch(() => ({}));
      const input = StartAnalysisInputSchema.parse(body || {});

      // 1. Verify case ownership
      const { data: caseRow } = await db
        .from('cases')
        .select('id')
        .eq('id', params.id)
        .eq('owner_id', user.id)
        .single();

      if (!caseRow) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: `Case ${params.id} not found` } }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 2. Load evidence items for the case
      let query = db
        .from('evidence_items')
        .select('id, display_id, processing_status, deleted_at')
        .eq('case_id', params.id)
        .is('deleted_at', null);

      if (input.evidenceIds && input.evidenceIds.length > 0) {
        query = query.in('id', input.evidenceIds);
      }

      const { data: evidenceList, error: evError } = await query;
      if (evError) {
        throw new Error(`Failed to load evidence for analysis: ${evError.message}`);
      }

      const eligibleEvidence = (evidenceList || []).filter(
        (e) => e.processing_status === 'PROCESSED',
      );

      if (eligibleEvidence.length === 0) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'NO_ELIGIBLE_EVIDENCE',
              message: 'Case contains no processed evidence eligible for analysis.',
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Build evidence scope array
      const evidenceScope = eligibleEvidence.map((e) => ({
        evidenceDisplayId: e.display_id,
      }));

      // 3. Create analysis_runs record
      const { data: run, error: runError } = await admin
        .from('analysis_runs')
        .insert({
          case_id: params.id,
          requested_by: user.id,
          status: 'PENDING',
          configuration_version: '1.0',
        })
        .select()
        .single();

      if (runError || !run) {
        throw new Error(`Failed to create analysis run: ${runError?.message}`);
      }

      // 4. Default task pipeline if not specified
      const taskTypes = input.taskTypes && input.taskTypes.length > 0
        ? input.taskTypes
        : ['extraction', 'response_analysis', 'friction_analysis', 'contradiction_consolidation'];

      const provider = process.env.AI_PROVIDER || 'mock';
      const model = process.env.GROQ_MODEL || process.env.AI_MODEL || 'qwen/qwen3.8-27b';

      const tasksToInsert = taskTypes.map((taskType) => {
        let promptId = `${taskType}.v1`;
        let schemaName = 'candidate-finding';
        if (taskType === 'report_draft') {
          promptId = 'reportDraft.v1';
          schemaName = 'report-draft';
        } else if (taskType === 'contradiction_consolidation') {
          promptId = 'contradiction.v1';
          schemaName = 'contradiction';
        }

        return {
          run_id: run.id,
          task_type: taskType,
          status: 'QUEUED',
          input_evidence_scope: evidenceScope,
          prompt_id: promptId,
          prompt_version: 'v1',
          schema_name: schemaName,
          schema_version: 'v1',
          provider,
          model,
          minimization_metadata: { evidenceCount: evidenceScope.length },
        };
      });

      const { data: createdTasks, error: tasksError } = await admin
        .from('analysis_tasks')
        .insert(tasksToInsert)
        .select();

      if (tasksError) {
        throw new Error(`Failed to queue analysis tasks: ${tasksError.message}`);
      }

      // 5. Emit audit event
      await admin.from('audit_events').insert({
        case_id: params.id,
        actor_type: 'USER',
        actor_id: user.id,
        entity_type: 'ANALYSIS_RUN',
        entity_id: run.id,
        action: 'ANALYSIS_RUN_REQUESTED',
        metadata: {
          runId: run.id,
          taskCount: createdTasks?.length || 0,
          taskTypes,
          evidenceCount: evidenceScope.length,
        },
      });

      return {
        runId: run.id,
        status: run.status,
        taskCount: createdTasks?.length || 0,
        tasks: createdTasks || [],
      };
    },
  },

  // Alias POST /cases/:id/analyze -> starts analysis run
  {
    method: 'POST',
    pattern: '/cases/:id/analyze',
    auth: 'user',
    input: StartAnalysisInputSchema,
    handler: async (ctx) => {
      // Delegate to /cases/:id/runs handler
      const runsHandler = analysisRoutes.find((r) => r.method === 'POST' && r.pattern === '/cases/:id/runs')!;
      return runsHandler.handler(ctx);
    },
  },
];
