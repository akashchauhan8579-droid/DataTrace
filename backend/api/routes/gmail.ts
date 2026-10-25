import type { RouteDef } from '../types';
import {
  GmailIdSchema,
  GmailStatusSchema,
  GmailCallbackRequestSchema,
  GmailImportRequestSchema,
} from '../../../contracts/schemas/gmail';
import {
  getGmailClient,
  GmailClientError,
  createSignedState,
  verifySignedState,
} from '../../integrations/gmail';
import { encryptToken, decryptToken } from '../../integrations/tokenVault';
import { assertCaseOwner } from '../../../database/security/assertCaseOwner';
import {
  computeSha256,
  parseEmail,
  buildEvidencePath,
} from '../../ingestion';

const DEFAULT_GMAIL_MAX_MESSAGES_PER_IMPORT = 10;
const GMAIL_MAX_MESSAGES_HARD_LIMIT = 10;
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

function errorResponse(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getMaxUploadBytes(): number {
  const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || '20');
  if (!Number.isFinite(maxUploadMb) || maxUploadMb <= 0) {
    throw new Error('MAX_UPLOAD_MB must be a positive number');
  }
  return maxUploadMb * 1024 * 1024;
}

function getMaxMessagesPerImport(): number {
  const configured = Number(
    process.env.GMAIL_MAX_MESSAGES_PER_IMPORT || DEFAULT_GMAIL_MAX_MESSAGES_PER_IMPORT
  );
  if (
    !Number.isInteger(configured) ||
    configured < 1 ||
    configured > GMAIL_MAX_MESSAGES_HARD_LIMIT
  ) {
    throw new Error('GMAIL_MAX_MESSAGES_PER_IMPORT must be an integer between 1 and 10');
  }
  return configured;
}

async function handleGmailClientError(
  error: unknown,
  admin: Parameters<RouteDef['handler']>[0]['admin'],
  userId: string
): Promise<Response> {
  if (!(error instanceof GmailClientError)) throw error;
  if (error.code === 'AUTH_EXPIRED') {
    const { error: updateError } = await admin
      .from('gmail_connections')
      .update({ status: 'EXPIRED' })
      .eq('user_id', userId);
    if (updateError) throw new Error(`Failed to expire Gmail connection: ${updateError.message}`);
    return errorResponse('GMAIL_AUTH_EXPIRED', 'Gmail authorization expired; please reconnect', 409);
  }
  if (error.code === 'AUTH_CODE_INVALID') {
    return errorResponse('GMAIL_AUTH_FAILED', 'Google authorization could not be completed; please reconnect', 400);
  }
  return errorResponse('GMAIL_UPSTREAM', 'Gmail service is temporarily unavailable', 502);
}

export const gmailRoutes: RouteDef[] = [
  // 1. GET /gmail/status — Check connection state (§16)
  {
    method: 'GET',
    pattern: '/gmail/status',
    auth: 'user',
    output: GmailStatusSchema,
    handler: async ({ user, admin }) => {
      const { data, error } = await admin
        .from('gmail_connections')
        .select('google_email, status')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to read Gmail connection: ${error.message}`);
      }
      if (!data) {
        return { connected: false };
      }

      return {
        connected: true,
        googleEmail: data.google_email,
        status: data.status as 'ACTIVE' | 'EXPIRED',
      };
    },
  },

  // 2. POST /gmail/connect — Start OAuth flow with signed state (§15.9, T24)
  {
    method: 'POST',
    pattern: '/gmail/connect',
    auth: 'user',
    handler: async ({ user }) => {
      const state = createSignedState(user.id);
      const client = getGmailClient();
      const authUrl = client.getAuthUrl(state);

      return { authUrl, state };
    },
  },

  // 3. POST /gmail/callback — Exchange code and store encrypted token (§15.9, T24, T25)
  {
    method: 'POST',
    pattern: '/gmail/callback',
    auth: 'user',
    input: GmailCallbackRequestSchema,
    handler: async ({ user, admin, req }) => {
      const body = await req.json();
      const input = GmailCallbackRequestSchema.parse(body);

      // Verify signed state parameter (anti-CSRF & user-binding)
      if (!verifySignedState(input.state, user.id)) {
        return errorResponse('VALIDATION', 'Invalid or expired OAuth state parameter', 400);
      }

      const client = getGmailClient();
      let authResult;
      try {
        authResult = await client.exchangeCode(input.code);
      } catch (error) {
        if (error instanceof GmailClientError) {
          return handleGmailClientError(error, admin, user.id);
        }
        throw error;
      }

      if (authResult.scope !== GMAIL_SCOPE || !authResult.refreshToken) {
        return errorResponse('GMAIL_UPSTREAM', 'Google did not grant the required Gmail access', 502);
      }
      // Encrypt refresh token with AES-256-GCM before database write
      const encryptedRefreshToken = encryptToken(authResult.refreshToken);

      const { error: upsertErr } = await admin
        .from('gmail_connections')
        .upsert(
          {
            user_id: user.id,
            google_email: authResult.email,
            scope: GMAIL_SCOPE,
            refresh_token_enc: encryptedRefreshToken,
            status: 'ACTIVE',
            connected_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (upsertErr) {
        throw new Error(`Failed to record Gmail connection: ${upsertErr.message}`);
      }

      return {
        connected: true,
        googleEmail: authResult.email,
      };
    },
  },

  // 4. GET /gmail/threads — List user threads (display-only, never stored)
  {
    method: 'GET',
    pattern: '/gmail/threads',
    auth: 'user',
    handler: async ({ user, admin, req }) => {
      // Fetch connection
      const { data: conn, error: connectionError } = await admin
        .from('gmail_connections')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (connectionError) {
        throw new Error(`Failed to read Gmail connection: ${connectionError.message}`);
      }

      if (!conn || conn.status !== 'ACTIVE') {
        return errorResponse('GMAIL_NOT_CONNECTED', 'Gmail mailbox is not connected', 409);
      }

      // Decrypt token
      let refreshToken: string;
      try {
        refreshToken = decryptToken(conn.refresh_token_enc);
      } catch {
        return errorResponse('GMAIL_AUTH_EXPIRED', 'Failed to decrypt token; please reconnect Gmail', 409);
      }

      const client = getGmailClient();
      const url = new URL(req.url);
      const q = url.searchParams.get('q') || undefined;
      const pageToken = url.searchParams.get('pageToken') || undefined;

      try {
        const accessToken = await client.refreshAccessToken(refreshToken);
        const threadList = await client.listThreads(accessToken, { q, pageToken });
        return threadList;
      } catch (error) {
        return handleGmailClientError(error, admin, user.id);
      }
    },
  },

  // 5. POST /cases/:id/evidence/gmail — Import thread messages into evidence pipeline (§5.5, T26, T27, T28)
  {
    method: 'POST',
    pattern: '/cases/:id/evidence/gmail',
    auth: 'user',
    input: GmailImportRequestSchema,
    handler: async ({ user, db, admin, params, req }) => {
      // 1. Assert case ownership
      const check = await assertCaseOwner(db, params.id, user.id);
      if (!check.ok) return check.response;

      // 2. Fetch connection and decrypt token
      const { data: conn, error: connectionError } = await admin
        .from('gmail_connections')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (connectionError) {
        throw new Error(`Failed to read Gmail connection: ${connectionError.message}`);
      }

      if (!conn || conn.status !== 'ACTIVE') {
        return errorResponse('GMAIL_NOT_CONNECTED', 'Gmail mailbox is not connected', 409);
      }

      let refreshToken: string;
      try {
        refreshToken = decryptToken(conn.refresh_token_enc);
      } catch {
        return errorResponse('GMAIL_AUTH_EXPIRED', 'Failed to decrypt token; please reconnect Gmail', 409);
      }

      const body = await req.json();
      const input = GmailImportRequestSchema.parse(body);

      const client = getGmailClient();
      let messageIds: string[];
      let accessToken: string;
      try {
        accessToken = await client.refreshAccessToken(refreshToken);
        messageIds = await client.getThreadMessageIds(accessToken, input.threadId);
      } catch (error) {
        return handleGmailClientError(error, admin, user.id);
      }

      const maxMessages = getMaxMessagesPerImport();
      const truncated = messageIds.length > maxMessages;
      const targetIds = messageIds.slice(0, maxMessages);

      const importedItems: Array<{
        id: string;
        displayId: string;
        sha256: string;
        duplicate: boolean;
      }> = [];

      for (const msgId of targetIds) {
        if (!GmailIdSchema.safeParse(msgId).success) {
          return errorResponse('GMAIL_UPSTREAM', 'Gmail returned an invalid message identifier', 502);
        }
        // Idempotency check: see if message was already imported into this case
        const { data: existing, error: existingError } = await admin
          .from('evidence_items')
          .select('id, display_id, sha256')
          .eq('case_id', params.id)
          .eq('external_ref', msgId)
          .maybeSingle();

        if (existingError) {
          throw new Error(`Failed to check imported Gmail message: ${existingError.message}`);
        }

        if (existing) {
          importedItems.push({
            id: existing.id,
            displayId: existing.display_id,
            sha256: existing.sha256,
            duplicate: true,
          });
          continue;
        }

        // Fetch raw RFC-822 bytes
        let rawBytes: Uint8Array;
        try {
          rawBytes = await client.getRawMessage(accessToken, msgId);
        } catch (error) {
          return handleGmailClientError(error, admin, user.id);
        }
        const rawBuffer = Buffer.from(rawBytes);
        if (rawBuffer.byteLength > getMaxUploadBytes()) {
          return errorResponse(
            'GMAIL_MESSAGE_TOO_LARGE',
            'A Gmail message exceeds the configured evidence upload size limit',
            413
          );
        }

        // Run through standard Ingestion pipeline (§5.4)
        const sha256 = computeSha256(rawBuffer);
        const ingestion = await parseEmail(rawBuffer);

        const evidenceId = crypto.randomUUID();
        const storagePath = buildEvidencePath(params.id, evidenceId);

        let storageUploaded = false;
        let evidenceCreated = false;
        let evidenceRow: any;
        try {
          const { error: storageErr } = await admin.storage
            .from('evidence')
            .upload(storagePath, rawBuffer, {
              contentType: 'message/rfc822',
              upsert: false,
            });

          if (storageErr) {
            throw new Error(`Failed to store imported raw message: ${storageErr.message}`);
          }
          storageUploaded = true;

          const filename = `gmail-${msgId.slice(0, 8)}.eml`;
          const { data, error: itemErr } = await admin
            .from('evidence_items')
            .insert({
              id: evidenceId,
              case_id: params.id,
              source_type: 'EMAIL',
              ingest_source: 'GMAIL_IMPORT',
              external_ref: msgId,
              original_filename: filename,
              mime_type: 'message/rfc822',
              size_bytes: rawBuffer.byteLength,
              storage_path: storagePath,
              sha256,
              captured_at: ingestion.capturedAt,
              processing_status: 'PROCESSED',
            })
            .select()
            .single();

          if (itemErr || !data) {
            throw new Error(`Failed to insert imported evidence row: ${itemErr?.message}`);
          }
          evidenceRow = data;
          evidenceCreated = true;

          for (const art of ingestion.artifacts) {
            const { data: artRow, error: artErr } = await admin
              .from('evidence_artifacts')
              .insert({
                evidence_id: evidenceRow.id,
                artifact_type: art.artifactType,
                extraction_method: art.extractionMethod,
                version: art.version,
                raw_content: art.rawContent,
                created_by_process: art.createdByProcess,
              })
              .select()
              .single();

            if (artErr || !artRow) {
              throw new Error(`Failed to insert imported evidence artifact: ${artErr?.message}`);
            }

            if (art.artifactType === 'NORMALIZED_TEXT') {
              for (const seg of ingestion.segments) {
                const { error: segmentError } = await admin.from('evidence_segments').insert({
                  evidence_id: evidenceRow.id,
                  artifact_id: artRow.id,
                  ordinal: seg.ordinal,
                  locator_type: seg.locatorType,
                  locator: seg.locator,
                  segment_text: seg.segmentText,
                });
                if (segmentError) {
                  throw new Error(`Failed to insert imported evidence segment: ${segmentError.message}`);
                }
              }
            }
          }

          const { error: auditError } = await admin.from('audit_events').insert({
            case_id: params.id,
            actor_type: 'USER',
            actor_id: user.id,
            entity_type: 'EVIDENCE',
            entity_id: evidenceRow.id,
            action: 'EVIDENCE_IMPORTED',
            metadata: {
              displayId: evidenceRow.display_id,
              sha256: evidenceRow.sha256,
              ingestSource: 'GMAIL_IMPORT',
            },
          });
          if (auditError) {
            throw new Error(`Failed to record Gmail evidence import audit event: ${auditError.message}`);
          }
        } catch (error) {
          const cleanupErrors: string[] = [];
          if (evidenceCreated) {
            const { error: deleteError } = await admin
              .from('evidence_items')
              .delete()
              .eq('id', evidenceId);
            if (deleteError) cleanupErrors.push(deleteError.message);
          }
          if (storageUploaded) {
            const { error: removeError } = await admin.storage
              .from('evidence')
              .remove([storagePath]);
            if (removeError) cleanupErrors.push(removeError.message);
          }
          if (cleanupErrors.length) {
            throw new Error(`Gmail import failed and cleanup was incomplete: ${cleanupErrors.join('; ')}`);
          }
          throw error;
        }

        importedItems.push({
          id: evidenceRow.id,
          displayId: evidenceRow.display_id,
          sha256: evidenceRow.sha256,
          duplicate: false,
        });
      }

      return {
        items: importedItems,
        truncated,
      };
    },
  },

  // 6. DELETE /gmail/connection — Revoke and disconnect mailbox
  {
    method: 'DELETE',
    pattern: '/gmail/connection',
    auth: 'user',
    handler: async ({ user, admin }) => {
      const { error } = await admin.from('gmail_connections').delete().eq('user_id', user.id);
      if (error) throw new Error(`Failed to disconnect Gmail: ${error.message}`);
      return { disconnected: true };
    },
  },
];
