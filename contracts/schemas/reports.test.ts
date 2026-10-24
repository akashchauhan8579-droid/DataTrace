import { describe, it, expect } from 'vitest';
import { AIReportDraftSchema, ReportBlockSchema } from './reports';

const heading = { kind: 'heading', text: 'Summary' };
const assertion = { kind: 'assertion', text: 'Acme holds personal data.', findingDisplayIds: ['FND-1'] };
const uuid = '3f2b8c1e-5a4d-4c3b-9e2f-1a2b3c4d5e6f';

describe('T07 AI cannot generate user_note (AIReportDraftSchema)', () => {
  it('accepts heading plus assertion', () => {
    expect(AIReportDraftSchema.safeParse({ blocks: [heading, assertion] }).success).toBe(true);
  });
  it('rejects a user_note block', () => {
    const note = { kind: 'user_note', id: 'b1', text: 'hi', authorId: uuid };
    expect(AIReportDraftSchema.safeParse({ blocks: [heading, note] }).success).toBe(false);
    expect(AIReportDraftSchema.safeParse({ blocks: [{ kind: 'user_note', text: 'hi' }] }).success).toBe(false);
  });
  it('rejects any extra key (top level and block level)', () => {
    expect(AIReportDraftSchema.safeParse({ blocks: [heading], extra: 1 }).success).toBe(false);
    expect(AIReportDraftSchema.safeParse({ blocks: [{ ...heading, id: 'b1' }] }).success).toBe(false);
    expect(AIReportDraftSchema.safeParse({ blocks: [{ ...assertion, origin: 'AI' }] }).success).toBe(false);
  });
  it('rejects an empty blocks array', () => {
    expect(AIReportDraftSchema.safeParse({ blocks: [] }).success).toBe(false);
  });
  it('rejects an assertion with zero findingDisplayIds', () => {
    expect(AIReportDraftSchema.safeParse({ blocks: [{ ...assertion, findingDisplayIds: [] }] }).success).toBe(false);
  });
  it('rejects UUIDs in findingDisplayIds', () => {
    expect(AIReportDraftSchema.safeParse({ blocks: [{ ...assertion, findingDisplayIds: [uuid] }] }).success).toBe(false);
  });
});

describe('ReportBlockSchema', () => {
  it('accepts a user_note', () => {
    expect(ReportBlockSchema.safeParse({ kind: 'user_note', id: 'b1', text: 'My note', authorId: uuid }).success).toBe(true);
  });
  it('requires findingIds on a persisted assertion', () => {
    const a = { kind: 'assertion', id: 'b2', text: 't', findingIds: [], origin: 'AI', editedAfterDraft: false };
    expect(ReportBlockSchema.safeParse(a).success).toBe(false);
    expect(ReportBlockSchema.safeParse({ ...a, findingIds: [uuid] }).success).toBe(true);
  });
});