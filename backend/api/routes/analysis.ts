import { z } from 'zod';
import type { RouteDef } from '../types';
import { checkConsent } from '../../../ai/gateway/consent';
import { assertCaseOwner } from '../../../database/security/assertCaseOwner';

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
  // 1. GET /cases/:id/consent — Check active AI consent for a case (§15.2)
  {
    method: 'GET',
    pattern: '/cases/:id/consent',
    auth: 'user',
    handler: async ({ user, db, params }) => {
      const check = await assertCaseOwner(db, params.id, user.id);
      if (!check.ok) return check.response;

      const { data: consent, error } = await db
        .from('ai_consents')
        .select('id, policy_version, provider, scope, granted_at, revoked_at')
        .eq('case_id', params.id)
        .is('revoked_at', null)
        .order('granted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to read AI consent for case ${params.id}: ${error.message}`);
      }
      if (!consent) {
        return { consented: false };
      }

      const validCheck = checkConsent(
        { policyVersion: consent.policy_version, revokedAt: consent.revoked_at },
        '1.0'
      );

      return {
        consented: validCheck.ok,
        policyVersion: consent.policy_version,
        provider: consent.provider,
        grantedAt: consent.granted_at,
        scope: consent.scope,
      };
    },
  },

  // 2. POST /cases/:id/consent — Authorize AI model analysis for a case (§15.2)
  {
    method: 'POST',
    pattern: '/cases/:id/consent',
    auth: 'user',
    handler: async ({ user, db, admin, params }) => {
      const check = await assertCaseOwner(db, params.id, user.id);
      if (!check.ok) return check.response;

      const provider = process.env.AI_PROVIDER || 'mock';

      const { data: consent, error: insertError } = await admin
        .from('ai_consents')
        .insert({
          case_id: params.id,
          user_id: user.id,
          policy_version: '1.0',
          provider,
          scope: { mode: 'MINIMIZE' },
          granted_at: new Date().toISOString(),
          revoked_at: null,
        })
        .select()
        .single();

      if (insertError || !consent) {
        throw new Error(`Failed to record AI consent: ${insertError?.message}`);
      }

      const { error: auditError } = await admin.from('audit_events').insert({
        case_id: params.id,
        actor_type: 'USER',
        actor_id: user.id,
        entity_type: 'AI_CONSENT',
        entity_id: consent.id,
        action: 'AI_CONSENT_GRANTED',
        metadata: {
          policyVersion: '1.0',
          provider,
          scope: { mode: 'MINIMIZE' },
        },
      });
      if (auditError) {
        throw new Error(`Failed to record AI consent grant audit event: ${auditError.message}`);
      }

      return {
        success: true,
        consented: true,
        policyVersion: '1.0',
        grantedAt: consent.granted_at,
      };
    },
  },

  // 3. DELETE /cases/:id/consent — Revoke AI consent and immediately terminate tasks (§15.2)
  {
    method: 'DELETE',
    pattern: '/cases/:id/consent',
    auth: 'user',
    handler: async ({ user, db, admin, params }) => {
      const check = await assertCaseOwner(db, params.id, user.id);
      if (!check.ok) return check.response;

      const revokedAt = new Date().toISOString();

      const { error: updateError } = await admin
        .from('ai_consents')
        .update({ revoked_at: revokedAt })
        .eq('case_id', params.id)
        .is('revoked_at', null);

      if (updateError) {
        throw new Error(`Failed to revoke AI consent: ${updateError.message}`);
      }

      // Spec §15.2: Revocation terminates running and queued tasks for the case immediately
      const { data: runs, error: runsError } = await admin
        .from('analysis_runs')
        .select('id')
        .eq('case_id', params.id)
        .in('status', ['PENDING', 'RUNNING']);

      if (runsError) {
        throw new Error(`Failed to find active analysis runs for case ${params.id}: ${runsError.message}`);
      }
      if (runs && runs.length > 0) {
        const runIds = runs.map((run: { id: string }) => run.id);
        const { error: tasksError } = await admin
          .from('analysis_tasks')
          .update({
            status: 'FAILED',
            failure_reason: 'Consent revoked by user (§15.2)',
          })
          .in('run_id', runIds)
          .in('status', ['QUEUED', 'RUNNING']);
        if (tasksError) {
          throw new Error(`Failed to stop analysis tasks after consent revocation: ${tasksError.message}`);
        }

        const { error: runUpdateError } = await admin
          .from('analysis_runs')
          .update({
            status: 'FAILED',
            completed_at: revokedAt,
          })
          .in('id', runIds);
        if (runUpdateError) {
          throw new Error(`Failed to stop analysis runs after consent revocation: ${runUpdateError.message}`);
        }
      }

      const { error: auditError } = await admin.from('audit_events').insert({
        case_id: params.id,
        actor_type: 'USER',
        actor_id: user.id,
        entity_type: 'AI_CONSENT',
        entity_id: params.id,
        action: 'AI_CONSENT_REVOKED',
        metadata: {
          revokedAt,
        },
      });
      if (auditError) {
        throw new Error(`Failed to record AI consent revocation audit event: ${auditError.message}`);
      }

      return {
        success: true,
        consented: false,
        revoked: true,
      };
    },
  },

  // 4. GET /cases/:id/runs — List analysis runs for a case
  {
    method: 'GET',
    pattern: '/cases/:id/runs',
    auth: 'user',
    handler: async ({ user, db, params }) => {
      const check = await assertCaseOwner(db, params.id, user.id);
      if (!check.ok) return check.response;

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

      const formattedRuns = (runs || []).map((r: any) => ({
        ...r,
        tasks: r.analysis_tasks || [],
      }));

      return { runs: formattedRuns };
    },
  },

  // 5. GET /analysis-runs/:id — Get single analysis run with task progress
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

  // 6. POST /cases/:id/runs — Start / trigger new analysis run (§10, §11, §15.2, §17.4)
  {
    method: 'POST',
    pattern: '/cases/:id/runs',
    auth: 'user',
    input: StartAnalysisInputSchema,
    handler: async ({ user, db, admin, params, req }) => {
      const body = await req.json().catch(() => ({}));
      const input = StartAnalysisInputSchema.parse(body || {});

      // 1. Verify case ownership
      const check = await assertCaseOwner(db, params.id, user.id);
      if (!check.ok) return check.response;

      // 2. Invariant §15.2: Verify active AI consent exists for this case before queuing any tasks
      const { data: consentRow, error: consentError } = await db
        .from('ai_consents')
        .select('policy_version, revoked_at')
        .eq('case_id', params.id)
        .is('revoked_at', null)
        .order('granted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (consentError) {
        throw new Error(`Failed to verify AI consent for case ${params.id}: ${consentError.message}`);
      }
      const consentResult = checkConsent(
        consentRow ? { policyVersion: consentRow.policy_version, revokedAt: consentRow.revoked_at } : null,
        '1.0'
      );

      if (!consentResult.ok) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'CONSENT_REQUIRED',
              message: `AI analysis requires active consent (§15.2). Reason: ${consentResult.reason}`,
            },
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 3. Load evidence items for the case
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

      // Build evidence scope array (array of display IDs for worker scope parser)
      const evidenceScope = eligibleEvidence.map((e) => e.display_id);

      // 4. Create analysis_runs record
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

      // 5. Default task pipeline if not specified (only queue registered prompts)
      const taskTypes = input.taskTypes && input.taskTypes.length > 0
        ? input.taskTypes
        : ['extraction', 'contradiction_consolidation'];

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
          minimization_metadata: { mode: 'MINIMIZE', evidenceCount: evidenceScope.length },
        };
      });

      const { data: createdTasks, error: tasksError } = await admin
        .from('analysis_tasks')
        .insert(tasksToInsert)
        .select();

      if (tasksError) {
        throw new Error(`Failed to queue analysis tasks: ${tasksError.message}`);
      }

      // 6. Emit audit event
      const { error: auditError } = await admin.from('audit_events').insert({
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
      if (auditError) {
        throw new Error(`Failed to record analysis run audit event: ${auditError.message}`);
      }

      return {
        runId: run.id,
        status: run.status,
        taskCount: createdTasks?.length || 0,
        tasks: createdTasks || [],
      };
    },
  },

  // 7. Alias POST /cases/:id/analyze -> starts analysis run
  {
    method: 'POST',
    pattern: '/cases/:id/analyze',
    auth: 'user',
    input: StartAnalysisInputSchema,
    handler: async (ctx) => {
      const runsHandler = analysisRoutes.find((r) => r.method === 'POST' && r.pattern === '/cases/:id/runs')!;
      return runsHandler.handler(ctx);
    },
  },
];
