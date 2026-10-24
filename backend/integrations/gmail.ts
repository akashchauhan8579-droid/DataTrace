import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { GmailThreadList } from '../../contracts/schemas/gmail';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'mock-google-client-id';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'mock-google-client-secret';
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/gmail/callback';
const STATE_SECRET =
  process.env.GMAIL_STATE_SECRET || 'datatrace-synthetic-hmac-state-secret-32b';

/**
 * Creates an HMAC-signed state parameter bound to a specific user and expiring in 15 minutes.
 * Format: userId.timestamp.hmac(userId.timestamp)
 */
export function createSignedState(userId: string, customTimestamp?: number): string {
  const timestamp = (customTimestamp !== undefined ? customTimestamp : Date.now()).toString();
  const payload = `${userId}.${timestamp}`;
  const sig = createHmac('sha256', STATE_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/**
 * Verifies that the state parameter has not been tampered with, is bound to userId,
 * and has not expired (TTL = 15 minutes).
 */
export function verifySignedState(state: string, expectedUserId: string): boolean {
  try {
    const parts = state.split('.');
    if (parts.length !== 3) return false;
    const [userId, timestampStr, receivedSig] = parts;

    if (userId !== expectedUserId) return false;

    // Check expiration (15 minutes)
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp) || Date.now() - timestamp > 15 * 60 * 1000) {
      return false;
    }

    const payload = `${userId}.${timestampStr}`;
    const expectedSig = createHmac('sha256', STATE_SECRET).update(payload).digest('hex');

    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const receivedBuf = Buffer.from(receivedSig, 'hex');
    if (expectedBuf.length !== receivedBuf.length) return false;

    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

export interface GmailAuthResult {
  accessToken: string;
  refreshToken: string;
  email: string;
  expiresIn: number;
}

export interface GmailClient {
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<GmailAuthResult>;
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
      'https://www.googleapis.com/auth/gmail.readonly'
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
    };
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
      'https://www.googleapis.com/auth/gmail.readonly'
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

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Google OAuth code exchange failed (${res.status}): ${errBody}`);
    }

    const data = (await res.json()) as any;
    const accessToken = data.access_token;
    const refreshToken = data.refresh_token;

    // Fetch user email using userinfo endpoint
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userData = (await userRes.json()) as any;

    return {
      accessToken,
      refreshToken,
      email: userData.email || 'user@gmail.com',
      expiresIn: data.expires_in || 3600,
    };
  }

  async listThreads(accessToken: string, opts?: { q?: string; pageToken?: string }): Promise<GmailThreadList> {
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/threads');
    url.searchParams.set('maxResults', '10');
    if (opts?.q) url.searchParams.set('q', opts.q);
    if (opts?.pageToken) url.searchParams.set('pageToken', opts.pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Gmail API listThreads failed with status ${res.status}`);
    }

    const data = (await res.json()) as any;
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
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=minimal`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Gmail API getThread failed with status ${res.status}`);
    }

    const data = (await res.json()) as any;
    return (data.messages || []).map((m: any) => m.id);
  }

  async getRawMessage(accessToken: string, messageId: string): Promise<Uint8Array> {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=raw`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Gmail API getRawMessage failed with status ${res.status}`);
    }

    const data = (await res.json()) as any;
    if (!data.raw) {
      throw new Error('Message does not contain raw RFC-822 data');
    }

    // Google uses base64url encoding
    const b64 = data.raw.replace(/-/g, '+').replace(/_/g, '/');
    const buf = Buffer.from(b64, 'base64');
    return new Uint8Array(buf);
  }
}

export function getGmailClient(): GmailClient {
  const mode = process.env.GMAIL_MODE || 'mock';
  return mode === 'live' ? new LiveGmailClient() : new MockGmailClient();
}
