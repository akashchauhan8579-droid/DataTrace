import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { GmailThreadList } from '../../contracts/schemas/gmail';
import { GmailIdSchema } from '../../contracts/schemas/gmail';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'mock-google-client-id';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'mock-google-client-secret';
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/gmail/callback';
const STATE_SECRET =
  process.env.GMAIL_STATE_SECRET || 'datatrace-synthetic-hmac-state-secret-32b';

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export function createSignedState(userId: string, customTimestamp?: number): string {
  const payload = Buffer.from(JSON.stringify({
    userId,
    issuedAt: customTimestamp ?? Date.now(),
    nonce: randomBytes(32).toString('base64url'),
  })).toString('base64url');
  const signature = createHmac('sha256', STATE_SECRET).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

export function verifySignedState(state: string, expectedUserId: string): boolean {
  try {
    const parts = state.split('.');
    if (parts.length !== 2) return false;
    const [payload, receivedSig] = parts;
    if (!/^[a-f0-9]{64}$/.test(receivedSig)) return false;
    const expectedSig = createHmac('sha256', STATE_SECRET).update(payload).digest();
    const suppliedSig = Buffer.from(receivedSig, 'hex');
    if (!timingSafeEqual(expectedSig, suppliedSig)) return false;

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      userId?: unknown;
      issuedAt?: unknown;
      nonce?: unknown;
    };
    if (
      decoded.userId !== expectedUserId ||
      typeof decoded.issuedAt !== 'number' ||
      !Number.isSafeInteger(decoded.issuedAt) ||
      typeof decoded.nonce !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(decoded.nonce)
    ) return false;

    const age = Date.now() - decoded.issuedAt;
    return age >= 0 && age <= OAUTH_STATE_TTL_MS;
  } catch {
    return false;
  }
}

export class GmailClientError extends Error {
  constructor(public readonly code: 'AUTH_EXPIRED' | 'UPSTREAM') {
    super(code === 'AUTH_EXPIRED' ? 'Gmail authorization expired' : 'Gmail service request failed');
    this.name = 'GmailClientError';
  }
}

async function fetchGoogle(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new GmailClientError('UPSTREAM');
  }
}

async function readGoogleJson<T>(res: Response): Promise<T> {
  try {
    return await res.json() as T;
  } catch {
    throw new GmailClientError('UPSTREAM');
  }
}

export interface GmailAuthResult {
  accessToken: string;
  refreshToken: string;
  email: string;
  expiresIn: number;
  scope: string;
}

export interface GmailClient {
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<GmailAuthResult>;
  refreshAccessToken(refreshToken: string): Promise<string>;
  listThreads(accessToken: string, opts?: { q?: string; pageToken?: string }): Promise<GmailThreadList>;
  getThreadMessageIds(accessToken: string, threadId: string): Promise<string[]>;
  getRawMessage(accessToken: string, messageId: string): Promise<Uint8Array>;
}

// ─── MOCK IMPLEMENTATION (Used in CI, testing, and offline rehearsals) ──────────

export class MockGmailClient implements GmailClient {
  private getSyntheticEml(filename: string): Uint8Array {
    const filePath = path.join(__dirname, '..', '..', 'tests', 'synthetic', 'acme-deletion', filename);
    if (fs.existsSync(filePath)) {
      return new Uint8Array(fs.readFileSync(filePath));
    }
    // Fallback in-memory RFC-822 bytes if file path differs
    return new TextEncoder().encode(
      `From: privacy@acme.example\nTo: user@example.com\nSubject: GDPR Erasure Request\nDate: Mon, 01 Mar 2026 10:00:00 +0000\nMessage-ID: <${filename}@acme.example>\n\nWe have deleted your personal data from our systems.`
    );
  }

  getAuthUrl(state: string): string {
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(
      GOOGLE_REDIRECT_URI
    )}&response_type=code&scope=${encodeURIComponent(
      GMAIL_SCOPE
    )}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
  }

  async exchangeCode(code: string): Promise<GmailAuthResult> {
    if (code === 'invalid_grant' || code === 'mock-fail-code') {
      const err = new Error('invalid_grant');
      (err as any).status = 400;
      throw err;
    }
    return {
      accessToken: 'mock-gmail-access-token',
      refreshToken: 'mock-gmail-refresh-token-xyz',
      email: 'jane.doe.test@gmail.com',
      expiresIn: 3600,
      scope: GMAIL_SCOPE,
    };
  }

  async refreshAccessToken(_refreshToken: string): Promise<string> {
    return 'mock-gmail-access-token';
  }

  async listThreads(_token: string, _opts?: { q?: string; pageToken?: string }): Promise<GmailThreadList> {
    return {
      threads: [
        {
          threadId: 'th_acme_erasure_01',
          subject: 'GDPR Article 17 Erasure Request',
          from: 'Jane Doe <jane.doe@example.com>',
          snippet: 'I hereby request the immediate and permanent deletion of all personal data...',
          messageCount: 3,
          lastMessageAt: '2026-03-01T10:00:00Z',
        },
      ],
    };
  }

  async getThreadMessageIds(_token: string, threadId: string): Promise<string[]> {
    if (threadId === 'th_acme_erasure_01') {
      return ['msg_acme_001', 'msg_acme_002', 'msg_acme_003'];
    }
    return ['msg_single_default'];
  }

  async getRawMessage(_token: string, messageId: string): Promise<Uint8Array> {
    if (messageId === 'msg_acme_001') {
      return this.getSyntheticEml('01-initial-erasure-request.eml');
    }
    if (messageId === 'msg_acme_002') {
      return this.getSyntheticEml('02-acme-deletion-confirmation.eml');
    }
    if (messageId === 'msg_acme_003') {
      return this.getSyntheticEml('03-acme-contradictory-denial.eml');
    }
    return this.getSyntheticEml('01-initial-erasure-request.eml');
  }
}

// ─── LIVE IMPLEMENTATION (Calls Google OAuth & Gmail REST API) ──────────────────

export class LiveGmailClient implements GmailClient {
  getAuthUrl(state: string): string {
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(
      GOOGLE_REDIRECT_URI
    )}&response_type=code&scope=${encodeURIComponent(
      GMAIL_SCOPE
    )}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
  }

  async exchangeCode(code: string): Promise<GmailAuthResult> {
    const params = new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    const res = await fetchGoogle('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await this.readTokenResponse(res);
    const accessToken = this.requireString(data.access_token);
    const refreshToken = this.requireString(data.refresh_token);
    const scope = this.requireString(data.scope);
    if (scope.trim().split(/\s+/).join(' ') !== GMAIL_SCOPE) {
      throw new GmailClientError('UPSTREAM');
    }

    // Fetch user email using userinfo endpoint
    const userRes = await fetchGoogle('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) throw new GmailClientError('UPSTREAM');
    const userData = await readGoogleJson<{ email?: unknown }>(userRes);
    if (typeof userData.email !== 'string') throw new GmailClientError('UPSTREAM');

    return {
      accessToken,
      refreshToken,
      email: userData.email,
      expiresIn: typeof data.expires_in === 'number' ? data.expires_in : 3600,
      scope,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    const params = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    });
    const res = await fetchGoogle('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await this.readTokenResponse(res);
    return this.requireString(data.access_token);
  }

  private async readTokenResponse(res: Response): Promise<Record<string, unknown>> {
    let data: Record<string, unknown>;
    try {
      data = await res.json() as Record<string, unknown>;
    } catch {
      throw new GmailClientError('UPSTREAM');
    }
    if (!res.ok) {
      if (data.error === 'invalid_grant') throw new GmailClientError('AUTH_EXPIRED');
      throw new GmailClientError('UPSTREAM');
    }
    return data;
  }

  private requireString(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new GmailClientError('UPSTREAM');
    }
    return value;
  }

  async listThreads(accessToken: string, opts?: { q?: string; pageToken?: string }): Promise<GmailThreadList> {
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/threads');
    url.searchParams.set('maxResults', '10');
    if (opts?.q) url.searchParams.set('q', opts.q);
    if (opts?.pageToken) url.searchParams.set('pageToken', opts.pageToken);

    const res = await fetchGoogle(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new GmailClientError(res.status === 401 ? 'AUTH_EXPIRED' : 'UPSTREAM');
    }

    const data = await readGoogleJson<any>(res);
    const rawThreads = data.threads || [];

    const summaries = rawThreads.map((t: any) => ({
      threadId: t.id,
      subject: t.snippet?.slice(0, 80) || '(No Subject)',
      from: 'Sender',
      snippet: t.snippet?.slice(0, 300) || '',
      messageCount: 1,
      lastMessageAt: new Date().toISOString(),
    }));

    return {
      threads: summaries,
      nextPageToken: data.nextPageToken,
    };
  }

  async getThreadMessageIds(accessToken: string, threadId: string): Promise<string[]> {
    if (!GmailIdSchema.safeParse(threadId).success) throw new GmailClientError('UPSTREAM');
    const res = await fetchGoogle(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=minimal`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new GmailClientError(res.status === 401 ? 'AUTH_EXPIRED' : 'UPSTREAM');
    }

    const data = await readGoogleJson<any>(res);
    return (data.messages || []).map((m: any) => m.id);
  }

  async getRawMessage(accessToken: string, messageId: string): Promise<Uint8Array> {
    if (!GmailIdSchema.safeParse(messageId).success) throw new GmailClientError('UPSTREAM');
    const res = await fetchGoogle(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=raw`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new GmailClientError(res.status === 401 ? 'AUTH_EXPIRED' : 'UPSTREAM');
    }

    const data = await readGoogleJson<any>(res);
    if (!data.raw) {
      throw new GmailClientError('UPSTREAM');
    }

    // Google uses base64url encoding
    const b64 = data.raw.replace(/-/g, '+').replace(/_/g, '/');
    const buf = Buffer.from(b64, 'base64');
    return new Uint8Array(buf);
  }
}

export function getGmailClient(): GmailClient {
  if (process.env.NODE_ENV === 'test' || process.env.CI === 'true' || process.env.DEMO_MODE === 'true') {
    return new MockGmailClient();
  }
  const mode = process.env.GMAIL_MODE || 'mock';
  if (mode === 'live') return new LiveGmailClient();
  if (mode === 'mock') return new MockGmailClient();
  throw new Error('GMAIL_MODE must be either "live" or "mock"');
}
