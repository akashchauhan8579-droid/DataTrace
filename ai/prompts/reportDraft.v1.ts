import { z } from 'zod';
import { AIReportDraftSchema } from '../../contracts/schemas/reports';
import type { FrameworkEntry } from '../../contracts/schemas/frameworks';
import { jsonSchemaFor, registerPrompt } from './registry';
import type { PromptDefinition, PromptInput, PromptFindingContext } from './registry';

export const REPORT_DRAFT_PROMPT_ID = 'reportDraft';
export const REPORT_DRAFT_PROMPT_VERSION = 'v1';

export const STANDARD_DISCLAIMER =
  'DataTrace identifies evidence-related gaps and prepares a reviewable draft; it does not determine legal compliance or provide legal advice.';

const SYSTEM = [
  'You are a report drafting engine for DataTrace. You synthesize verified case findings into structured report drafts.',
  '',
  'LEGAL AND COMPLIANCE BOUNDARIES',
  `- ${STANDARD_DISCLAIMER}`,
  '- You never invent legal citations, legal articles, or compliance deadlines.',
  '- Legal article titles and deadlines must be sourced ONLY from the human-reviewed framework entries provided.',
  '- For any framework entry that is not human-reviewed, state "deadline not confirmed" and do not state a definite deadline.',
  '',
  'BLOCK STRUCTURE',
  '- You may generate ONLY heading and assertion blocks. You may NEVER generate user_note blocks (user_note is reserved for human authors).',
  '- Every assertion block MUST list at least one finding display ID in findingDisplayIds (for example ["FND-101"]).',
  '- Never invent internal IDs or UUIDs. Use only display IDs such as FND-101.',
  '',
  'OUTPUT',
  'Output only JSON matching { "blocks": [...] } conforming to the schema. No markdown fences, no explanatory text.',
].join('\n');

function renderEligibleFindings(findings?: PromptFindingContext[]): string {
  if (!findings || findings.length === 0) {
    return '<eligible_findings>\n(No findings provided)\n</eligible_findings>';
  }
  const lines = ['<eligible_findings>'];
  for (const f of findings) {
    lines.push(`[${f.displayId}]: "${f.statement}"`);
    if (f.normalizedClaim) {
      lines.push(`  Normalized: ${JSON.stringify(f.normalizedClaim)}`);
    }
  }
  lines.push('</eligible_findings>');
  return lines.join('\n');
}

function renderFrameworks(frameworks?: FrameworkEntry[]): string {
  if (!frameworks || frameworks.length === 0) {
    return '<framework_rules>\n(No legal framework specified)\n</framework_rules>';
  }

  const lines = ['<framework_rules>'];
  for (const fw of frameworks) {
    if (fw.humanReviewed) {
      lines.push(`Framework: ${fw.framework}`);
      lines.push(`  Article: ${fw.articleTitle}`);
      if (fw.deadlineDays !== undefined) {
        lines.push(`  Deadline: ${fw.deadlineDays} days`);
      }
      lines.push(`  Template: ${fw.sectionTemplate}`);
    } else {
      lines.push(`Framework: ${fw.framework}`);
      lines.push(`  Status: unreviewed (deadline not confirmed)`);
    }
  }
  lines.push('</framework_rules>');
  return lines.join('\n');
}

function build(input: PromptInput): { system: string; user: string } {
  const frameworks = (input.extra?.frameworkEntries as FrameworkEntry[]) ?? [];

  const user = [
    'Task: draft a report using the eligible findings and approved framework rules below.',
    '',
    renderFrameworks(frameworks),
    '',
    renderEligibleFindings(input.findingContext),
    '',
    `Reminder: ${STANDARD_DISCLAIMER}`,
    'Output only the JSON object { "blocks": [...] } containing heading and assertion blocks.',
  ].join('\n');

  return { system: SYSTEM, user };
}

export const reportDraftPrompt: PromptDefinition = {
  id: REPORT_DRAFT_PROMPT_ID,
  version: REPORT_DRAFT_PROMPT_VERSION,
  taskType: 'report_draft',
  build,
  outputSchema: AIReportDraftSchema,
};

export const reportDraftJsonSchema: Record<string, unknown> = jsonSchemaFor(AIReportDraftSchema);

registerPrompt(reportDraftPrompt);
