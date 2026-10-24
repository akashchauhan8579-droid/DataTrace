import { z } from 'zod';
import type { RouteDef } from '../types';
import {
  GmailStatusSchema,
  GmailCallbackRequestSchema,
  GmailImportRequestSchema,
} from '../../../contracts/schemas/gmail';
import {
  getGmailClient,
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

const GMAIL_MAX_MESSAGES_PER_IMPORT = 10;

export const gmailRoutes: RouteDef[] = [
  // 1. GET /gmail/status — Check connection state (§16)
  {
    method: 'GET',
    pattern: '/gmail/status',
    auth: 'user',
    output: GmailStatusSchema,
    handler: async ({ user, admin }) => {
      const { data } = await admin
        .from('gmail_connections')
        .select('google_email, status')
        .eq('user_id', user.id)
        .single();

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
      const isValidState = verifySignedState(input.state, user.id);
      if (!isValidState) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION',
              message: 'Invalid or expired OAuth state parameter',
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const client = getGmailClient();
      let authResult;
      try {
        authResult = await client.exchangeCode(input.code);
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'GMAIL_AUTH_FAILED',
              message: `OAuth code exchange failed: ${err.message}`,
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Encrypt refresh token with AES-256-GCM before database write
      const encryptedRefreshToken = encryptToken(authResult.refreshToken);

      const { error: upsertErr } = await admin
        .from('gmail_connections')
        .upsert(
          {
            user_id: user.id,
            google_email: authResult.email,
            scope: 'https://www.googleapis.com/auth/gmail.readonly',
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
        success: true,
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
      const { data: conn } = await admin
        .from('gmail_connections')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!conn || conn.status !== 'ACTIVE') {
        return new Response(
          JSON.stringify({
            error: {
              code: 'GMAIL_NOT_CONNECTED',
              message: 'Gmail mailbox is not connected',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Decrypt token
      let refreshToken: string;
      try {
        refreshToken = decryptToken(conn.refresh_token_enc);
      } catch {
        return new Response(
          JSON.stringify({
            error: {
              code: 'GMAIL_AUTH_EXPIRED',
              message: 'Failed to decrypt token; please reconnect Gmail',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const client = getGmailClient();
      const url = new URL(req.url);
      const q = url.searchParams.get('q') || undefined;
      const pageToken = url.searchParams.get('pageToken') || undefined;

      try {
        const threadList = await client.listThreads(refreshToken, { q, pageToken });
        return threadList;
      } catch (err: any) {
        if (err.message?.includes('invalid_grant')) {
          await admin.from('gmail_connections').update({ status: 'EXPIRED' }).eq('user_id', user.id);
          return new Response(
            JSON.stringify({
              error: {
                code: 'GMAIL_AUTH_EXPIRED',
                message: 'Gmail access grant expired; please reconnect',
              },
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw err;
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
      const { data: conn } = await admin
        .from('gmail_connections')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!conn || conn.status !== 'ACTIVE') {
        return new Response(
          JSON.stringify({
            error: {
              code: 'GMAIL_NOT_CONNECTED',
              message: 'Gmail mailbox is not connected',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }

      let refreshToken: string;
      try {
        refreshToken = decryptToken(conn.refresh_token_enc);
      } catch {
        return new Response(
          JSON.stringify({
            error: {
              code: 'GMAIL_AUTH_EXPIRED',
              message: 'Failed to decrypt token; please reconnect Gmail',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const body = await req.json();
      const input = GmailImportRequestSchema.parse(body);

      const client = getGmailClient();
      let messageIds: string[];
      try {
        messageIds = await client.getThreadMessageIds(refreshToken, input.threadId);
      } catch (err: any) {
        if (err.message?.includes('invalid_grant')) {
          await admin.from('gmail_connections').update({ status: 'EXPIRED' }).eq('user_id', user.id);
          return new Response(
            JSON.stringify({
              error: {
                code: 'GMAIL_AUTH_EXPIRED',
                message: 'Gmail authorization expired',
              },
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw err;
      }

      const truncated = messageIds.length > GMAIL_MAX_MESSAGES_PER_IMPORT;
      const targetIds = messageIds.slice(0, GMAIL_MAX_MESSAGES_PER_IMPORT);

      const importedItems: Array<{
        id: string;
        displayId: string;
        sha256: string;
        duplicate: boolean;
      }> = [];

      for (const msgId of targetIds) {
        // Idempotency check: see if message was already imported into this case
        const { data: existing } = await admin
          .from('evidence_items')
          .select('id, display_id, sha256')
          .eq('case_id', params.id)
          .eq('external_ref', msgId)
          .single();

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
        const rawBytes = await client.getRawMessage(refreshToken, msgId);
        const rawBuffer = Buffer.from(rawBytes);

        // Run through standard Ingestion pipeline (§5.4)
        const sha256 = computeSha256(rawBuffer);
        const ingestion = await parseEmail(rawBuffer);

        const evidenceId = crypto.randomUUID();
        const storagePath = buildEvidencePath(params.id, evidenceId);

        // Store raw original binary in private Storage
        const { error: storageErr } = await admin.storage
          .from('evidence')
          .upload(storagePath, rawBuffer, {
            contentType: 'message/rfc822',
            upsert: false,
          });

        if (storageErr) {
          throw new Error(`Failed to store imported raw message: ${storageErr.message}`);
        }

        // Insert into evidence_items
        const filename = `gmail-${msgId.slice(0, 8)}.eml`;
        const { data: evidenceRow, error: itemErr } = await admin
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

        if (itemErr || !evidenceRow) {
          throw new Error(`Failed to insert imported evidence row: ${itemErr?.message}`);
        }

        // Insert artifacts & segments
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

          if (artErr || !artRow) continue;

          if (art.artifactType === 'NORMALIZED_TEXT') {
            for (const seg of ingestion.segments) {
              await admin.from('evidence_segments').insert({
                evidence_id: evidenceRow.id,
                artifact_id: artRow.id,
                ordinal: seg.ordinal,
                locator_type: seg.locatorType,
                locator: seg.locator,
                segment_text: seg.segmentText,
              });
            }
          }
        }

        // Append EVIDENCE_IMPORTED audit event (§5.5, Rule 8)
        await admin.from('audit_events').insert({
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
            externalRef: msgId,
          },
        });

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
      await admin.from('gmail_connections').delete().eq('user_id', user.id);
      return { disconnected: true };
    },
  },
];
