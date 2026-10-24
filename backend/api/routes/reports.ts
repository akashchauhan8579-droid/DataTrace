import { z } from 'zod';
import type { RouteDef } from '../types';
import { validateReport } from '../../../verification/rules/reportGrounding';
import type { FindingView } from '../../../verification/types';

export const DraftReportInputSchema = z.object({
  lens: z.enum(['EVIDENCE', 'FINDINGS', 'COMPLAINT']).default('EVIDENCE'),
  framework: z.string().optional(),
}).strict();

export const UpdateReportInputSchema = z.object({
  content: z.object({
    lens: z.string().optional(),
    framework: z.string().optional(),
    blocks: z.array(
      z.object({
        id: z.string().optional(),
        kind: z.string(),
        text: z.string().optional(),
        findingIds: z.array(z.string()).optional(),
        notes: z.string().optional(),
      }).passthrough()
    ),
  }),
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
          {
            id: 'disclaimer-1',
            kind: 'notice',
            text: 'DataTrace identifies evidence-related gaps and prepares a reviewable draft; it does not determine legal compliance or provide legal advice.',
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

  // Update report content / edited blocks (§14, §15.2)
  {
    method: 'PUT',
    pattern: '/reports/:id',
    auth: 'user',
    input: UpdateReportInputSchema,
    handler: async ({ user, db, admin, params, req }) => {
      const body = await req.json();
      const input = UpdateReportInputSchema.parse(body);

      // Verify report and ownership
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

      const now = new Date().toISOString();

      const { data: updatedReport, error: updateError } = await admin
        .from('case_reports')
        .update({
          content: input.content,
          edited_after_draft: true,
          author_id: user.id,
          validation_status: 'PENDING',
          updated_at: now,
        })
        .eq('id', params.id)
        .select()
        .single();

      if (updateError || !updatedReport) {
        throw new Error(`Failed to update report: ${updateError?.message}`);
      }

      await admin.from('audit_events').insert({
        case_id: report.case_id,
        actor_type: 'USER',
        actor_id: user.id,
        entity_type: 'REPORT',
        entity_id: report.id,
        action: 'REPORT_EDITED',
        metadata: { blockCount: input.content.blocks.length },
      });

      return { report: updatedReport };
    },
  },

  // Validate report grounding (§14.2, §15.2)
  {
    method: 'POST',
    pattern: '/reports/:id/validate',
    auth: 'user',
    handler: async ({ user, db, admin, params }) => {
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

      // Load all case findings
      const { data: rawFindings, error: fError } = await db
        .from('findings')
        .select('id, case_id, display_id, finding_type, evidence_basis, verification_state, source_unavailable, statement, structured_payload')
        .eq('case_id', report.case_id);

      if (fError) {
        throw new Error(`Failed to load findings for report validation: ${fError.message}`);
      }

      const findingsList: FindingView[] = (rawFindings || []).map((f: any) => ({
        id: f.id,
        caseId: f.case_id,
        displayId: f.display_id,
        findingType: f.finding_type,
        evidenceBasis: f.evidence_basis,
        verificationState: f.verification_state,
        sourceUnavailable: !!f.source_unavailable,
        statement: f.statement,
        structuredPayload: f.structured_payload,
        citations: [],
      }));

      // Run pure deterministic validation
      const validation = validateReport(report.content as any, findingsList);
      const passed = validation.status === 'VALIDATED';
      const validationStatus = passed ? 'PASSED' : 'FAILED';

      await admin
        .from('case_reports')
        .update({
          validation_status: validationStatus,
          validation_details: validation,
          status: passed ? 'VALIDATED' : report.status,
        })
        .eq('id', report.id);

      await admin.from('audit_events').insert({
        case_id: report.case_id,
        actor_type: 'USER',
        actor_id: user.id,
        entity_type: 'REPORT',
        entity_id: report.id,
        action: 'REPORT_VALIDATED',
        metadata: {
          status: validationStatus,
          failingBlockCount: validation.failingBlockIds.length,
          editedAssertionCount: validation.editedAssertionCount,
        },
      });

      return {
        reportId: report.id,
        validationStatus,
        details: validation,
      };
    },
  },

  // Export report as Markdown & JSON (§14.3, §15.2 - fail-closed if ungrounded)
  {
    method: 'GET',
    pattern: '/reports/:id/export',
    auth: 'user',
    handler: async ({ user, db, admin, params }) => {
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

      // Load findings to check grounding
      const { data: rawFindings } = await db
        .from('findings')
        .select('id, case_id, display_id, finding_type, evidence_basis, verification_state, source_unavailable, statement, structured_payload')
        .eq('case_id', report.case_id);

      const findingsList: FindingView[] = (rawFindings || []).map((f: any) => ({
        id: f.id,
        caseId: f.case_id,
        displayId: f.display_id,
        findingType: f.finding_type,
        evidenceBasis: f.evidence_basis,
        verificationState: f.verification_state,
        sourceUnavailable: !!f.source_unavailable,
        statement: f.statement,
        structuredPayload: f.structured_payload,
        citations: [],
      }));

      // Strict fail-closed grounding check
      const validation = validateReport(report.content as any, findingsList);
      if (validation.status !== 'VALIDATED') {
        return new Response(
          JSON.stringify({
            error: {
              code: 'REPORT_UNGROUNDED',
              message: 'Export blocked: report contains ungrounded assertions without verified citations.',
              failingBlockIds: validation.failingBlockIds,
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const content = report.content as any;
      const blocks: any[] = content?.blocks || [];

      // Generate Markdown
      let markdown = `# DataTrace Case Report — ${report.active_lens || 'EVIDENCE'} Lens\n\n`;
      markdown += `> *Notice: DataTrace identifies evidence-related gaps and prepares a reviewable draft; it does not determine legal compliance or provide legal advice.*\n\n`;
      markdown += `**Report ID:** \`${report.id}\` | **Case ID:** \`${report.case_id}\`\n\n---\n\n`;

      for (const block of blocks) {
        if (block.kind === 'heading') {
          markdown += `## ${block.text || ''}\n\n`;
        } else if (block.kind === 'notice') {
          markdown += `> ${block.text || ''}\n\n`;
        } else if (block.kind === 'assertion') {
          const cites = (block.findingIds || []).map((id: string) => `[Finding ${id.slice(0, 8)}]`).join(' ');
          markdown += `${block.text || ''} ${cites}\n\n`;
        } else {
          markdown += `${block.text || ''}\n\n`;
        }
      }

      const exportedAt = new Date().toISOString();

      await admin
        .from('case_reports')
        .update({ status: 'EXPORTED' })
        .eq('id', report.id);

      await admin.from('audit_events').insert({
        case_id: report.case_id,
        actor_type: 'USER',
        actor_id: user.id,
        entity_type: 'REPORT',
        entity_id: report.id,
        action: 'REPORT_EXPORTED',
        metadata: { format: 'markdown_and_json', lens: report.active_lens },
      });

      return {
        reportId: report.id,
        activeLens: report.active_lens,
        markdown,
        json: {
          report,
          validation,
          exportedAt,
        },
        exportedAt,
      };
    },
  },
];
