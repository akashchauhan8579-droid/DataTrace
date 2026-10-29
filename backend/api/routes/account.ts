import type { RouteDef } from '../types';
import {
  CONFIRMATION_PHRASE,
  DeletionRequestBodySchema,
  DeletionStatusSchema,
} from '../../../contracts/schemas/account';
import { buildAccountExport } from '../../account/exportBuilder';
import {
  computeSubjectHash,
  orchestratePurge,
} from '../../account/purgeOrchestrator';
import { verifyPasswordForUser } from '../../account/reauth';
import { cancelRunningAnalysisForUser } from '../../account/deletionControl';

/** Default serverless budget for one deletion invocation (maxDuration is 60s). */
const DEFAULT_TIME_BUDGET_MS = 45_000;
const MAX_TIME_BUDGET_MS = 55_000;
const MIN_TIME_BUDGET_MS = 1_000;

function errorResponse(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getTimeBudgetMs(): number {
  const raw = Number(process.env.ACCOUNT_DELETION_TIME_BUDGET_MS ?? DEFAULT_TIME_BUDGET_MS);
  if (!Number.isFinite(raw)) return DEFAULT_TIME_BUDGET_MS;
  return Math.min(Math.max(Math.trunc(raw), MIN_TIME_BUDGET_MS), MAX_TIME_BUDGET_MS);
}

function exportFilename(now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `datatrace-account-export-${stamp}.json`;
}

export const accountRoutes: RouteDef[] = [
  // 1. GET /account/export — server-built GDPR Art. 15/17 JSON export (D5)
  {
    method: 'GET',
    pattern: '/account/export',
    auth: 'user',
    handler: async ({ user, admin }) => {
      const data = await buildAccountExport(user.id, admin);
      const filename = exportFilename(new Date());

      return new Response(JSON.stringify(data, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    },
  },

  // 2. POST /account/deletion — initiate irreversible erasure (D2, D3, D4)
  {
    method: 'POST',
    pattern: '/account/deletion',
    auth: 'user',
    input: DeletionRequestBodySchema,
    output: DeletionStatusSchema,
    allowDuringDeletion: true,
    handler: async ({ user, admin, req }) => {
      const body = await req.json();
      const input = DeletionRequestBodySchema.parse(body);

      // D4: exact phrase check before touching anything.
      if (input.confirmationPhrase !== CONFIRMATION_PHRASE) {
        return errorResponse(
          'CONFIRMATION_MISMATCH',
          `Confirmation phrase must be exactly "${CONFIRMATION_PHRASE}"`,
          400
        );
      }

      // Only one active request per user. A second click resumes via /continue.
      const { data: existing, error: existingError } = await admin
        .from('account_deletion_requests')
        .select('id')
        .eq('user_id', user.id)
        .neq('state', 'COMPLETE')
        .maybeSingle();

      if (existingError) {
        throw new Error(`Failed to check pending account deletion: ${existingError.message}`);
      }

      if (existing) {
        return errorResponse(
          'ACCOUNT_DELETION_PENDING',
          'An account deletion request is already in progress',
          409
        );
      }

      // D4: server-side password re-authentication.
      const reauth = await verifyPasswordForUser(user.id, input.password, admin);
      if (!reauth.ok) {
        return errorResponse('REAUTH_FAILED', 'Password re-authentication failed', 401);
      }

      // D6: HMAC subject hash is computed while the raw user id still exists.
      // Compute it before cancelling analysis so a missing/invalid
      // ERASURE_RECEIPT_KEY fails fast without disrupting the user's jobs.
      const subjectHash = computeSubjectHash(user.id);

      // D3: cancel in-flight analysis before the state machine starts purging.
      await cancelRunningAnalysisForUser(admin, user.id);

      return orchestratePurge(
        user.id,
        subjectHash,
        { timeBudgetMs: getTimeBudgetMs() },
        admin
      );
    },
  },

  // 3. POST /account/deletion/continue — resume an interrupted purge (D2)
  {
    method: 'POST',
    pattern: '/account/deletion/continue',
    auth: 'user',
    input: undefined,
    output: DeletionStatusSchema,
    allowDuringDeletion: true,
    handler: async ({ user, admin }) => {
      const { data: existing, error } = await admin
        .from('account_deletion_requests')
        .select('subject_hash')
        .eq('user_id', user.id)
        .neq('state', 'COMPLETE')
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to load pending account deletion: ${error.message}`);
      }

      if (!existing?.subject_hash) {
        return errorResponse(
          'NOT_FOUND',
          'No pending account deletion request for this user',
          404
        );
      }

      return orchestratePurge(
        user.id,
        existing.subject_hash as string,
        { timeBudgetMs: getTimeBudgetMs() },
        admin
      );
    },
  },
];
