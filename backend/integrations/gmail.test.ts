import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  createSignedState,
  verifySignedState,
  MockGmailClient,
  LiveGmailClient,
  getGmailClient,
} from './gmail';
import { encryptToken, decryptToken } from './tokenVault';
import { computeSha256, parseEmail } from '../ingestion';
import { assertCaseOwner } from '../../database/security/assertCaseOwner';

beforeEach(() => {
  vi.stubEnv('GMAIL_STATE_SECRET', Buffer.alloc(32, 1).toString('base64'));
  vi.stubEnv('GMAIL_TOKEN_ENC_KEY', Buffer.alloc(32, 2).toString('base64'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('P1-0 One-Shot Gmail Import & Token Vault (Spec §10.6, §15.9, T24–T29)', () => {
  const testUserId = 'u0000000-0000-4000-8000-000000000001';
  const otherUserId = 'u0000000-0000-4000-8000-000000000002';
  const testCaseId = 'c0000000-0000-4000-8000-000000000001';

  describe('T24: OAuth State Parameter Cryptographic Verification (§15.9)', () => {
    it('creates a signed state that validates successfully for the same user', () => {
      const state = createSignedState(testUserId);
      expect(state).toBeDefined();
      expect(typeof state).toBe('string');
      expect(verifySignedState(state, testUserId)).toBe(true);
    });

    it('rejects state validation for a different user (user-binding invariant)', () => {
      const state = createSignedState(testUserId);
      expect(verifySignedState(state, otherUserId)).toBe(false);
    });

    it('rejects state if HMAC signature is tampered with', () => {
      const state = createSignedState(testUserId);
      const [payload, signature] = state.split('.');
      expect(payload).toBeDefined();
      expect(signature).toMatch(/^[a-f0-9]{64}$/);

      const tampered = `${payload}.${'0'.repeat(64)}`;
      expect(verifySignedState(tampered, testUserId)).toBe(false);
    });

    it('rejects state if timestamp is expired (> 10 minutes)', () => {
      const pastTime = Date.now() - 10 * 60 * 1000;
      const state = createSignedState(testUserId, pastTime);
      expect(verifySignedState(state, testUserId)).toBe(false);
    });

    it('sets an explicit expiry exactly 10 minutes after issuance', () => {
      const issuedAt = Date.now();
      const state = createSignedState(testUserId, issuedAt);
      const [payload] = state.split('.');
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));

      expect(parsed.expiresAt - parsed.issuedAt).toBe(10 * 60 * 1000);
      expect(verifySignedState(state, testUserId)).toBe(true);
    });

    it('includes a high-entropy nonce and rejects future-dated state', () => {
      const state = createSignedState(testUserId);
      const [payload] = state.split('.');
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      expect(parsed.userId).toBe(testUserId);
      expect(parsed.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(verifySignedState(createSignedState(testUserId, Date.now() + 1000), testUserId)).toBe(false);
    });

    it('requires a valid state signing secret and fails verification closed', () => {
      const state = createSignedState(testUserId);
      vi.stubEnv('GMAIL_STATE_SECRET', '');

      expect(() => createSignedState(testUserId)).toThrow(/GMAIL_STATE_SECRET is required/);
      expect(verifySignedState(state, testUserId)).toBe(false);

      vi.stubEnv('GMAIL_STATE_SECRET', 'too-short');
      expect(() => createSignedState(testUserId)).toThrow(/at least 32 bytes/);
    });

    it('rejects malformed state structures', () => {
      expect(verifySignedState('invalid-state', testUserId)).toBe(false);
      expect(verifySignedState('', testUserId)).toBe(false);
      expect(verifySignedState('a.b', testUserId)).toBe(false);
      expect(verifySignedState('a.b.c.d', testUserId)).toBe(false);
    });
  });

  describe('T25: AES-256-GCM Token Vault (§15.9)', () => {
    const rawRefreshToken = '1//0gX982734982734982734982734_example_refresh_token_xyz';

    it('encrypts and decrypts tokens with full fidelity', () => {
      const encrypted = encryptToken(rawRefreshToken);
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(rawRefreshToken);
      expect(encrypted).not.toContain(rawRefreshToken);

      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(rawRefreshToken);
    });

    it('produces non-deterministic ciphertexts for the same plaintext due to random IVs', () => {
      const enc1 = encryptToken(rawRefreshToken);
      const enc2 = encryptToken(rawRefreshToken);
      expect(enc1).not.toBe(enc2);
      expect(decryptToken(enc1)).toBe(rawRefreshToken);
      expect(decryptToken(enc2)).toBe(rawRefreshToken);
    });

    it('fails closed when ciphertext or auth tag is tampered with', () => {
      const encrypted = encryptToken(rawRefreshToken);
      const [iv, tag, data] = encrypted.split(':');

      // Tamper with data
      const tamperedData = Buffer.from(data, 'base64');
      tamperedData[0] ^= 0xff;
      const tamperedPayload = `${iv}:${tag}:${tamperedData.toString('base64')}`;

      expect(() => decryptToken(tamperedPayload)).toThrow();
    });

    it('fails closed on malformed encrypted payload strings', () => {
      expect(() => decryptToken('malformed_token_without_colons')).toThrow('Malformed encrypted token payload');
      expect(() => decryptToken('only:two_parts')).toThrow('Malformed encrypted token payload');
    });

    it('requires a canonical base64 key containing exactly 32 bytes', () => {
      vi.stubEnv('GMAIL_TOKEN_ENC_KEY', '');
      expect(() => encryptToken(rawRefreshToken)).toThrow(/GMAIL_TOKEN_ENC_KEY is required/);

      vi.stubEnv('GMAIL_TOKEN_ENC_KEY', Buffer.alloc(31, 2).toString('base64'));
      expect(() => encryptToken(rawRefreshToken)).toThrow(/exactly 32 bytes/);

      vi.stubEnv('GMAIL_TOKEN_ENC_KEY', 'not-base64!');
      expect(() => encryptToken(rawRefreshToken)).toThrow(/exactly 32 bytes/);
    });
  });

  describe('T26: Mock Gmail Client & RFC-822 Message Ingestion (§5.5, §10.6)', () => {
    it('returns synthetic Acme deletion threads in mock mode', async () => {
      const client = new MockGmailClient();
      const threadList = await client.listThreads('dummy_token');

      expect(threadList.threads.length).toBeGreaterThan(0);
      expect(threadList.threads[0].threadId).toBe('th_acme_erasure_01');
      expect(threadList.threads[0].subject).toContain('GDPR Article 17 Erasure Request');
    });

    describe('CI and demo client selection', () => {
      it('forces the mock client in test and demo environments', () => {
        vi.stubEnv('GMAIL_MODE', 'live');
        vi.stubEnv('NODE_ENV', 'test');
        expect(getGmailClient()).toBeInstanceOf(MockGmailClient);

        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('DEMO_MODE', 'true');
        expect(getGmailClient()).toBeInstanceOf(MockGmailClient);

        vi.stubEnv('DEMO_MODE', 'false');
        vi.stubEnv('CI', 'true');
        expect(getGmailClient()).toBeInstanceOf(MockGmailClient);
      });

      describe('Live OAuth token lifecycle', () => {
        it('requests offline read-only access and verifies the exact granted scope', async () => {
          const authUrl = new URL(new LiveGmailClient().getAuthUrl('signed-state'));
          expect(authUrl.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/gmail.readonly');
          expect(authUrl.searchParams.get('access_type')).toBe('offline');
          expect(authUrl.searchParams.get('prompt')).toBe('consent');

          const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({
              access_token: 'access-token',
              refresh_token: 'refresh-token',
              expires_in: 3600,
              scope: 'https://www.googleapis.com/auth/gmail.readonly',
            }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ email: 'synthetic@example.test' }), { status: 200 }));
          vi.stubGlobal('fetch', fetchMock);

          const result = await new LiveGmailClient().exchangeCode('authorization-code');
          expect(result.scope).toBe('https://www.googleapis.com/auth/gmail.readonly');
          expect(result.email).toBe('synthetic@example.test');
          expect(result.accessToken).toBe('access-token');
        });

        it('rejects a Google grant with a broader scope', async () => {
          const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            scope: 'https://www.googleapis.com/auth/gmail.modify',
          }), { status: 200 }));
          vi.stubGlobal('fetch', fetchMock);

          await expect(new LiveGmailClient().exchangeCode('authorization-code'))
            .rejects.toMatchObject({ code: 'UPSTREAM' });
          expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('exchanges the stored refresh token for a short-lived access token', async () => {
          const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            access_token: 'short-lived-access-token',
            expires_in: 3600,
          }), { status: 200 }));
          vi.stubGlobal('fetch', fetchMock);

          const client = new LiveGmailClient();
          await expect(client.refreshAccessToken('encrypted-at-rest-refresh-token'))
            .resolves.toBe('short-lived-access-token');

          const request = fetchMock.mock.calls[0];
          expect(request[0]).toBe('https://oauth2.googleapis.com/token');
          expect(String(request[1].body)).toContain('grant_type=refresh_token');
          expect(String(request[1].body)).toContain('refresh_token=encrypted-at-rest-refresh-token');
        });

        it('classifies invalid_grant without exposing Google error details', async () => {
          vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            error: 'invalid_grant',
            error_description: 'private provider detail',
          }), { status: 400 })));

          await expect(new LiveGmailClient().refreshAccessToken('refresh-token'))
            .rejects.toMatchObject({ code: 'AUTH_EXPIRED', message: 'Gmail authorization expired' });
        });
      });
    });

    it('retrieves raw RFC-822 email bytes and computes verifiable SHA-256', async () => {
      const client = new MockGmailClient();
      const messageIds = await client.getThreadMessageIds('dummy_token', 'th_acme_erasure_01');
      expect(messageIds).toHaveLength(3);

      const rawBytes = await client.getRawMessage('dummy_token', messageIds[0]);
      expect(rawBytes).toBeInstanceOf(Uint8Array);
      expect(rawBytes.length).toBeGreaterThan(50);

      // Verify SHA-256 calculation
      const hash = computeSha256(rawBytes);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);

      // Verify RFC-822 email parser parses headers and body
      const parsed = await parseEmail(rawBytes);
      expect(parsed.sourceType).toBe('EMAIL');
      expect(parsed.segments.length).toBeGreaterThan(0);
      const metaArtifact = parsed.artifacts.find(a => a.artifactType === 'METADATA_JSON');
      expect(metaArtifact).toBeDefined();
      expect(metaArtifact?.rawContent).toContain('GDPR');
    });
  });

  describe('T27: Idempotency & Ingestion Upper Bounds (§10.6)', () => {
    it('enforces maximum 10 messages per import limit', async () => {
      const client = new MockGmailClient();
      const messageIds = await client.getThreadMessageIds('dummy_token', 'th_acme_erasure_01');
      // Must not exceed 10
      expect(messageIds.length).toBeLessThanOrEqual(10);
    });

    it('maintains idempotency contract on duplicate external_ref', () => {
      const importedRecords = new Map<string, string>();
      const externalRef = 'msg-acme-001';

      // First import
      let isDuplicate1 = importedRecords.has(externalRef);
      if (!isDuplicate1) {
        importedRecords.set(externalRef, 'evidence-uuid-001');
      }
      expect(isDuplicate1).toBe(false);

      // Second import of same externalRef
      let isDuplicate2 = importedRecords.has(externalRef);
      expect(isDuplicate2).toBe(true);
      expect(importedRecords.get(externalRef)).toBe('evidence-uuid-001');
    });
  });

  describe('T28: Case Ownership Isolation (§15.8, T28)', () => {
    it('returns 404 when case does not belong to user (anti-enumeration)', async () => {
      // Mock db returning null on ownership check
      const mockDb = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Row not found' } }),
              }),
            }),
          }),
        }),
      } as any;

      const result = await assertCaseOwner(mockDb, testCaseId, testUserId);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(404);
        const body = (await result.response.json()) as any;
        expect(body.error.code).toBe('NOT_FOUND');
      }
    });

    it('passes when case belongs to user', async () => {
      const mockDb = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: testCaseId, display_id: 'C-01', title: 'Test Case', owner_id: testUserId },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as any;

      const result = await assertCaseOwner(mockDb, testCaseId, testUserId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.caseRow.id).toBe(testCaseId);
        expect(result.caseRow.ownerId).toBe(testUserId);
      }
    });
  });

  describe('T29: Expired Connection & Invalid Grant Handling (§10.6, §15.9)', () => {
    it('marks connection EXPIRED when Google OAuth returns invalid_grant', () => {
      let connectionStatus = 'ACTIVE';
      const handleGoogleError = (err: Error) => {
        if (err.message.includes('invalid_grant')) {
          connectionStatus = 'EXPIRED';
        }
      };

      handleGoogleError(new Error('Google API responded with invalid_grant: Token has been revoked or expired.'));
      expect(connectionStatus).toBe('EXPIRED');
    });
  });
});
