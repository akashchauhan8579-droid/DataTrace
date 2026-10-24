import { describe, it, expect } from 'vitest';
import { convertDraft } from './reportConverter';
import { getPrompt } from '../prompts/registry';
import {
  REPORT_DRAFT_PROMPT_ID,
  REPORT_DRAFT_PROMPT_VERSION,
  STANDARD_DISCLAIMER,
  reportDraftPrompt,
} from '../prompts/reportDraft.v1';
import { SAMPLE_FRAMEWORKS } from '../../contracts/schemas/frameworks';

describe('reportConverter (Step 12)', () => {
  const eligibleFindings = [
    { id: '11111111-1111-4111-8111-111111111111', displayId: 'FND-101' },
    { id: '22222222-2222-4222-8222-222222222222', displayId: 'FND-102' },
  ];

  it('T07: AI draft containing a user_note block fails schema validation and converts nothing', () => {
    const rawWithUserNote = {
      blocks: [
        {
          kind: 'user_note',
          text: 'AI trying to write a user note.',
          authorId: '33333333-3333-4333-8333-333333333333',
        },
      ],
    };

    const res = convertDraft(rawWithUserNote, { eligibleFindings });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('SCHEMA');
    }
  });

  it('T07: AI draft containing extra keys fails schema validation', () => {
    const rawWithExtraKey = {
      blocks: [
        {
          kind: 'heading',
          text: 'Heading',
          unauthorizedField: 'bad',
        },
      ],
    };

    const res = convertDraft(rawWithExtraKey, { eligibleFindings });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('SCHEMA');
    }
  });

  it('rejects the WHOLE draft if any assertion cites an ineligible or unknown display ID', () => {
    const raw = {
      blocks: [
        {
          kind: 'heading',
          text: 'Introduction',
        },
        {
          kind: 'assertion',
          text: 'Valid assertion',
          findingDisplayIds: ['FND-101'],
        },
        {
          kind: 'assertion',
          text: 'Invalid assertion citing unmentioned finding',
          findingDisplayIds: ['FND-999'],
        },
      ],
    };

    const res = convertDraft(raw, { eligibleFindings });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('INELIGIBLE_FINDING');
      expect(res.detail).toContain('FND-999');
    }
  });

  it('converts valid AI draft to ReportBlocks with assigned IDs, origin AI, and editedAfterDraft false', () => {
    const raw = {
      blocks: [
        {
          kind: 'heading',
          text: 'Summary of Evidence',
        },
        {
          kind: 'assertion',
          text: 'Acme Corp retained records despite erasure demand.',
          findingDisplayIds: ['FND-101', 'FND-102'],
        },
      ],
    };

    const res = convertDraft(raw, { eligibleFindings });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toHaveLength(2);

      const heading = res.value[0];
      expect(heading.kind).toBe('heading');
      expect(heading.id).toBeTruthy();
      expect((heading as any).text).toBe('Summary of Evidence');

      const assertion = res.value[1];
      expect(assertion.kind).toBe('assertion');
      if (assertion.kind === 'assertion') {
        expect(assertion.findingIds).toEqual([
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
        ]);
        expect(assertion.origin).toBe('AI');
        expect(assertion.editedAfterDraft).toBe(false);
      }
    }
  });
});

describe('reportDraft.v1 prompt (Step 12)', () => {
  it('is registered in registry under reportDraft@v1', () => {
    const p = getPrompt(REPORT_DRAFT_PROMPT_ID, REPORT_DRAFT_PROMPT_VERSION);
    expect(p).toBeDefined();
    expect(p?.taskType).toBe('report_draft');
  });

  it('contains standard disclaimer text and no UUIDs', () => {
    const rendered = reportDraftPrompt.build({
      scope: [],
      findingContext: [
        {
          displayId: 'FND-101',
          statement: 'Data was processed on servers.',
        },
      ],
      extra: {
        frameworkEntries: SAMPLE_FRAMEWORKS,
      },
    });

    const fullText = `${rendered.system}\n${rendered.user}`;
    expect(fullText).toContain(STANDARD_DISCLAIMER);

    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    expect(fullText).not.toMatch(uuidRegex);
  });

  it('unreviewed framework entry gives deadline not confirmed and is not passed as a deadline', () => {
    const rendered = reportDraftPrompt.build({
      scope: [],
      extra: {
        frameworkEntries: SAMPLE_FRAMEWORKS,
      },
    });

    expect(rendered.user).toContain('deadline not confirmed');
    // Ensure the 45 days from unreviewed framework is not rendered as "Deadline: 45 days"
    expect(rendered.user).not.toContain('Deadline: 45 days');
    // The reviewed framework with 30 days is rendered as "Deadline: 30 days"
    expect(rendered.user).toContain('Deadline: 30 days');
  });
});
