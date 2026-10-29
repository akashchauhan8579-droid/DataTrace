import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountExport, DeletionStatus } from '../../../contracts/schemas/account';
import { CONFIRMATION_PHRASE } from '../../../contracts/schemas/account';
import { accountRoutes } from './account';

vi.mock('../../account/exportBuilder', () => ({
  buildAccountExport: vi.fn(),
}));

vi.mock('../../account/purgeOrchestrator', () => ({
  computeSubjectHash: vi.fn(),
  orchestratePurge: vi.fn(),
}));

vi.mock('../../account/reauth', () => ({
  verifyPasswordForUser: vi.fn(),
}));

vi.mock('../../account/deletionControl', () => ({
  cancelRunningAnalysisForUser: vi.fn(),
}));

vi.mock('../client', () => ({
  createUserClient: vi.fn(() => ({})),
  getAdminClient: vi.fn(),
}));

vi.mock('../../account/deletionState', () => ({
  isDeletionPending: vi.fn(),
}));

import { buildAccountExport } from '../../account/exportBuilder';
import { computeSubjectHash, orchestratePurge } from '../../account/purgeOrchestrator';
import { verifyPasswordForUser } from '../../account/reauth';
import { cancelRunningAnalysisForUser } from '../../account/deletionControl';
import { getAdminClient } from '../client';
import { isDeletionPending } from '../../account/deletionState';
import { route } from '../router';
import type { RouteDef } from '../types';

const USER_ID = '11111111-1111-4111-a111-111111111111';
const SUBJECT_HASH = 'a'.repeat(64);

const STATUS: DeletionStatus = {
  id: '22222222-2222-4222-a222-222222222222',
  userId: USER_ID,
  state: 'REQUESTED',
  subjectHash: SUBJECT_HASH,
  attempts: 1,
  lastError: null,
  counts: {},
  createdAt: '2026-10-30T00:00:00.000Z',
  updatedAt: '2026-10-30T00:00:01.000Z',
  completedAt: null,
};

const EXPORT: AccountExport = {
  exportedAt: '2026-10-30T00:00:00.000Z',
  specVersion: '1.5.0',
  profile: {
    id: USER_ID,
    email: 'user@example.com',
    createdAt: '2026-10-01T00:00:00.000Z',
  },
  cases: [],
  evidence: [],
  segments: [],
  findings: [],
  citations: [],
  reports: [],
  audit: [],
  gmail: {
    connected: false,
    googleEmail: null,
    status: null,
  },
};

/**
 * Minimal chainable mock for:
 *   admin.from(table).select(...).eq(...).neq(...).maybeSingle()
 */
function makeAdmin(existing: Record<string, unknown> | null = null, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: existing, error });
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.neq = vi.fn(() => query);
  query.maybeSingle = maybeSingle;

  return {
    from: vi.fn(() => query),
    query,
    maybeSingle,
  };
}

function makeContext(options: {
  body?: Record<string, unknown>;
  admin?: ReturnType<typeof makeAdmin>;
} = {}) {
  return {
    req: new Request('http://localhost/api/account/deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
    }),
    params: {},
    user: { id: USER_ID, accessToken: 'test-token' },
    db: {},
    admin: options.admin ?? makeAdmin(),
  } as never;
}

function getRoute(pattern: string) {
  const found = accountRoutes.find((routeDef) => routeDef.pattern === pattern);
  if (!found) throw new Error(`Route ${pattern} is not registered`);
  return found;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(computeSubjectHash).mockReturnValue(SUBJECT_HASH);
  vi.mocked(orchestratePurge).mockResolvedValue(STATUS);
  vi.mocked(verifyPasswordForUser).mockResolvedValue({ ok: true });
  vi.mocked(cancelRunningAnalysisForUser).mockResolvedValue({
    runsCancelled: 0,
    tasksCancelled: 0,
    caseIds: [],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /account/deletion', () => {
  it('rejects a mismatched confirmation phrase before re-authentication or deletion', async () => {
    const admin = makeAdmin(null);
    const handler = getRoute('/account/deletion').handler;

    const response = (await handler(
      makeContext({
        body: { password: 'correct-password', confirmationPhrase: 'delete my account' },
        admin,
      })
    )) as Response;

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'CONFIRMATION_MISMATCH',
        message: `Confirmation phrase must be exactly "${CONFIRMATION_PHRASE}"`,
      },
    });
    expect(verifyPasswordForUser).not.toHaveBeenCalled();
    expect(cancelRunningAnalysisForUser).not.toHaveBeenCalled();
    expect(orchestratePurge).not.toHaveBeenCalled();
  });

  it('returns REAUTH_FAILED and performs no destructive work when the password is wrong', async () => {
    vi.mocked(verifyPasswordForUser).mockResolvedValue({ ok: false, reason: 'invalid login' });
    const admin = makeAdmin(null);
    const handler = getRoute('/account/deletion').handler;

    const response = (await handler(
      makeContext({
        body: { password: 'wrong-password', confirmationPhrase: CONFIRMATION_PHRASE },
        admin,
      })
    )) as Response;

    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'REAUTH_FAILED'
    );
    expect(verifyPasswordForUser).toHaveBeenCalledWith(USER_ID, 'wrong-password', admin);
    expect(cancelRunningAnalysisForUser).not.toHaveBeenCalled();
    expect(orchestratePurge).not.toHaveBeenCalled();
  });

  it('returns ACCOUNT_DELETION_PENDING when an active request already exists', async () => {
    const admin = makeAdmin({ id: STATUS.id });
    const handler = getRoute('/account/deletion').handler;

    const response = (await handler(
      makeContext({
        body: { password: 'correct-password', confirmationPhrase: CONFIRMATION_PHRASE },
        admin,
      })
    )) as Response;

    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'ACCOUNT_DELETION_PENDING'
    );
    expect(verifyPasswordForUser).not.toHaveBeenCalled();
    expect(orchestratePurge).not.toHaveBeenCalled();
  });

  it('cancels analysis and starts the resumable purge after re-authentication', async () => {
    const admin = makeAdmin(null);
    const handler = getRoute('/account/deletion').handler;

    const result = await handler(
      makeContext({
        body: { password: 'correct-password', confirmationPhrase: CONFIRMATION_PHRASE },
        admin,
      })
    );

    expect(result).toEqual(STATUS);
    expect(cancelRunningAnalysisForUser).toHaveBeenCalledWith(admin, USER_ID);
    expect(computeSubjectHash).toHaveBeenCalledWith(USER_ID);
    expect(orchestratePurge).toHaveBeenCalledWith(
      USER_ID,
      SUBJECT_HASH,
      { timeBudgetMs: expect.any(Number) },
      admin
    );
  });

  it('clamps ACCOUNT_DELETION_TIME_BUDGET_MS into the serverless-safe range', async () => {
    vi.stubEnv('ACCOUNT_DELETION_TIME_BUDGET_MS', '999999');
    const handler = getRoute('/account/deletion').handler;

    await handler(
      makeContext({
        body: { password: 'correct-password', confirmationPhrase: CONFIRMATION_PHRASE },
        admin: makeAdmin(null),
      })
    );

    expect(orchestratePurge).toHaveBeenCalledWith(
      USER_ID,
      SUBJECT_HASH,
      { timeBudgetMs: 55_000 },
      expect.anything()
    );
  });
});

describe('POST /account/deletion/continue', () => {
  it('returns NOT_FOUND when there is no pending request', async () => {
    const handler = getRoute('/account/deletion/continue').handler;

    const response = (await handler(makeContext({ admin: makeAdmin(null) }))) as Response;

    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND');
    expect(orchestratePurge).not.toHaveBeenCalled();
  });

  it('resumes the purge using the stored subject hash', async () => {
    const admin = makeAdmin({ subject_hash: SUBJECT_HASH });
    const handler = getRoute('/account/deletion/continue').handler;

    const result = await handler(makeContext({ admin }));

    expect(result).toEqual(STATUS);
    expect(orchestratePurge).toHaveBeenCalledWith(
      USER_ID,
      SUBJECT_HASH,
      { timeBudgetMs: expect.any(Number) },
      admin
    );
  });
});

describe('GET /account/export', () => {
  it('returns a non-cacheable JSON attachment without validating it through the router', async () => {
    vi.mocked(buildAccountExport).mockResolvedValue(EXPORT);
    const handler = getRoute('/account/export').handler;

    const response = (await handler(makeContext({ admin: makeAdmin() }))) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="datatrace-account-export-.+\.json"$/
    );
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(await response.json()).toEqual(EXPORT);
    expect(buildAccountExport).toHaveBeenCalledWith(USER_ID, expect.anything());
  });
});

describe('Account deletion write freeze (Spec §15.5.1 D3)', () => {
  const mutatingRoute: RouteDef = {
    method: 'POST',
    pattern: '/cases',
    auth: 'user',
    handler: async () => ({ created: true }),
  };

  const deletionRoute: RouteDef = {
    method: 'POST',
    pattern: '/account/deletion/continue',
    auth: 'user',
    allowDuringDeletion: true,
    handler: async () => ({ resumed: true }),
  };

  function request(path: string) {
    return new Request(`http://localhost/api/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer test-token-${USER_ID}` },
    });
  }

  beforeEach(() => {
    vi.mocked(getAdminClient).mockReturnValue({} as never);
  });

  it('blocks mutating routes with 409 while a deletion is pending', async () => {
    vi.mocked(isDeletionPending).mockResolvedValue(true);

    const response = await route(request('cases'), ['cases'], [mutatingRoute]);

    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'ACCOUNT_DELETION_PENDING'
    );
    expect(isDeletionPending).toHaveBeenCalledWith(expect.anything(), USER_ID);
  });

  it('allows deletion endpoints to run while a deletion is pending', async () => {
    vi.mocked(isDeletionPending).mockResolvedValue(true);

    const response = await route(
      request('account/deletion/continue'),
      ['account', 'deletion', 'continue'],
      [deletionRoute]
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ resumed: true });
    expect(isDeletionPending).not.toHaveBeenCalled();
  });

  it('leaves mutating routes open when no deletion is pending', async () => {
    vi.mocked(isDeletionPending).mockResolvedValue(false);

    const response = await route(request('cases'), ['cases'], [mutatingRoute]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ created: true });
  });
});
