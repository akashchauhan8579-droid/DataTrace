import { z } from 'zod';
import type { RouteDef } from '../types';

export const ConfirmFindingInputSchema = z.object({
  mode: z.enum(['READING_CONFIRMED', 'USER_CONFIRMED']).default('READING_CONFIRMED'),
}).strict();

export const findingsRoutes: RouteDef[] = [
  // List findings for a case
  {
    method: 'GET',
    pattern: '/cases/:id/findings',
    auth: 'user',
    handler: async ({ user, db, params }) => {
      // Check ownership
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

      const { data, error } = await db
        .from('findings')
        .select(`
          id, display_id, finding_type, statement, structured_payload,
          evidence_basis, verification_state, candidate_confidence,
          source_unavailable, human_confirmed_at,
          citations (
            id, evidence_id, segment_id, locator_type, locator, quoted_text, validation_status
          )
        `)
        .eq('case_id', params.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Database error listing findings: ${error.message}`);
      }

      return { findings: data || [] };
    },
  },

  // User confirms a reading or contradiction (§12.1, §13.4)
  {
    method: 'POST',
    pattern: '/findings/:id/confirm',
    auth: 'user',
    input: ConfirmFindingInputSchema,
    handler: async ({ user, db, admin, params, req }) => {
      const body = await req.json();
      const input = ConfirmFindingInputSchema.parse(body);

      // Verify finding exists and user owns the case
      const { data: finding } = await db
        .from('findings')
        .select('*, cases!inner(owner_id)')
        .eq('id', params.id)
        .single();

      if (!finding || (finding.cases as any)?.owner_id !== user.id) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: `Finding ${params.id} not found` } }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const now = new Date().toISOString();

      if (finding.finding_type === 'CONTRADICTION' && input.mode === 'USER_CONFIRMED') {
        // Contradiction confirmation requires both claims to be currently VERIFIED
        const payload = finding.structured_payload || {};
        const { claimARef, claimBRef } = payload;

        const { data: claimA } = await db.from('findings').select('verification_state').eq('case_id', finding.case_id).eq('display_id', claimARef).single();
        const { data: claimB } = await db.from('findings').select('verification_state').eq('case_id', finding.case_id).eq('display_id', claimBRef).single();

        if (claimA?.verification_state !== 'VERIFIED' || claimB?.verification_state !== 'VERIFIED') {
          return new Response(
            JSON.stringify({
              error: {
                code: 'PRECONDITION_FAILED',
                message: 'Contradiction confirmation requires both referenced claims to be VERIFIED.',
              },
            }),
            { status: 412, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Update contradiction resolution
        const updatedPayload = {
          ...payload,
          resolution: {
            mode: 'USER_CONFIRMED',
            confirmedBy: user.id,
            confirmedAt: now,
          },
        };

        await admin.from('findings').update({
          structured_payload: updatedPayload,
          verification_state: 'CONTRADICTED',
          human_confirmed_by: user.id,
          human_confirmed_at: now,
        }).eq('id', finding.id);
      } else {
        // Standard reading confirmation
        await admin.from('findings').update({
          human_confirmed_by: user.id,
          human_confirmed_at: now,
        }).eq('id', finding.id);
      }

      // Audit event
      await admin.from('audit_events').insert({
        case_id: finding.case_id,
        actor_type: 'USER',
        actor_id: user.id,
        entity_type: 'FINDING',
        entity_id: finding.id,
        action: 'FINDING_CONFIRMED_BY_USER',
        metadata: { displayId: finding.display_id, mode: input.mode },
      });

      return { success: true, confirmedAt: now };
    },
  },
];
