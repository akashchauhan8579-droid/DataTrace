import { z } from 'zod';
import type { RouteDef } from '../types';

export const DraftReportInputSchema = z.object({
  lens: z.enum(['EVIDENCE', 'FINDINGS', 'COMPLAINT']).default('EVIDENCE'),
  framework: z.string().optional(),
}).strict();

export const reportsRoutes: RouteDef[] = [
  // List case reports
  {
    method: 'GET',
    pattern: '/cases/:id/reports',
    auth: 'user',
    handler: async ({ user, db, params }) => {
      const { data, error } = await db
        .from('case_reports')
        .select('*')
        .eq('case_id', params.id);

      if (error) {
        throw new Error(`Database error listing reports: ${error.message}`);
      }

      return { reports: data || [] };
    },
  },

  // Get single report
  {
    method: 'GET',
    pattern: '/reports/:id',
    auth: 'user',
    handler: async ({ user, db, params }) => {
      const { data: report } = await db
        .from('case_reports')
        .select('*, cases!inner(owner_id)')
        .eq('id', params.id)
        .single();

      if (!report || (report.cases as any)?.owner_id !== user.id) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: `Report ${params.id} not found` } }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return { report };
    },
  },

  // Create initial report draft
  {
    method: 'POST',
    pattern: '/cases/:id/reports',
    auth: 'user',
    input: DraftReportInputSchema,
    handler: async ({ user, db, admin, params, req }) => {
      const body = await req.json();
      const input = DraftReportInputSchema.parse(body);

      // Verify case
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

      const initialContent = {
        lens: input.lens,
        framework: input.framework || 'GDPR',
        blocks: [
          {
            id: 'heading-1',
            kind: 'heading',
            text: `DataTrace Case Report — ${input.lens} Lens`,
          },
        ],
      };

      const { data: report, error } = await admin
        .from('case_reports')
        .insert({
          case_id: params.id,
          active_lens: input.lens,
          status: 'DRAFT',
          content: initialContent,
          validation_status: 'PENDING',
        })
        .select()
        .single();

      if (error || !report) {
        throw new Error(`Failed to create report: ${error?.message}`);
      }

      await admin.from('audit_events').insert({
        case_id: params.id,
        actor_type: 'USER',
        actor_id: user.id,
        entity_type: 'REPORT',
        entity_id: report.id,
        action: 'REPORT_DRAFTED',
        metadata: { lens: input.lens },
      });

      return { report };
    },
  },
];
