import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getPrompt, jsonSchemaFor, registerPrompt, renderSegments } from './registry';
import type { PromptDefinition } from './registry';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function makeDef(id: string, version: string): PromptDefinition {
  return {
    id,
    version,
    taskType: 'test',
    build: () => ({ system: `s-${version}`, user: `u-${version}` }),
    outputSchema: z.object({}),
  };
}

describe('renderSegments header format', () => {
  it('renders a PAGE locator header exactly', () => {
    const out = renderSegments([
      {
        evidenceDisplayId: 'EV-101',
        segments: [{ ordinal: 3, locatorType: 'PAGE', locator: { page: 2 }, text: 'We hold your data.' }],
      },
    ]);
    expect(out).toContain('[EV-101 #3 PAGE {"page":2}]\nWe hold your data.');
  });

  it('renders a LINE_NUMBER locator header exactly', () => {
    const out = renderSegments([
      {
        evidenceDisplayId: 'EV-102',
        segments: [
          { ordinal: 1, locatorType: 'LINE_NUMBER', locator: { lineStart: 4, lineEnd: 6 }, text: 'Line text.' },
        ],
      },
    ]);
    expect(out).toContain('[EV-102 #1 LINE_NUMBER {"lineStart":4,"lineEnd":6}]\nLine text.');
  });

  it('wraps everything in one evidence_data block', () => {
    const out = renderSegments([
      {
        evidenceDisplayId: 'EV-101',
        segments: [
          { ordinal: 1, locatorType: 'PAGE', locator: { page: 1 }, text: 'a' },
          { ordinal: 2, locatorType: 'PAGE', locator: { page: 1 }, text: 'b' },
        ],
      },
    ]);
    expect(out.startsWith('<evidence_data>\n')).toBe(true);
    expect(out.endsWith('\n</evidence_data>')).toBe(true);
    expect(out.split('</evidence_data>').length - 1).toBe(1);
  });

  it('ignores extra fields on scope objects (no UUID leaks)', () => {
    const uuid = '123e4567-e89b-42d3-a456-426614174000';
    const withExtras = {
      scope: [
        {
          evidenceDisplayId: 'EV-101',
          evidenceId: uuid,
          segments: [
            {
              ordinal: 3,
              locatorType: 'PAGE',
              locator: { page: 2 },
              text: 'Hello',
              segmentId: uuid,
            },
          ],
        },
      ],
    };
    const out = renderSegments(withExtras.scope);
    expect(UUID_RE.test(out)).toBe(false);
  });

  it('renders an empty block for an empty scope', () => {
    expect(renderSegments([])).toBe('<evidence_data>\n</evidence_data>');
  });
});

describe('prompt registry', () => {
  it('throws when the same id and version are registered twice', () => {
    registerPrompt(makeDef('dup.test', 'v1'));
    expect(() => registerPrompt(makeDef('dup.test', 'v1'))).toThrow();
  });

  it('lets different versions of the same id coexist', () => {
    registerPrompt(makeDef('multi.test', 'v1'));
    registerPrompt(makeDef('multi.test', 'v2'));
    expect(getPrompt('multi.test', 'v1')?.build({ scope: [] }).system).toBe('s-v1');
    expect(getPrompt('multi.test', 'v2')?.build({ scope: [] }).system).toBe('s-v2');
  });

  it('returns undefined for an unknown prompt', () => {
    expect(getPrompt('nope.test', 'v9')).toBeUndefined();
  });
});

describe('jsonSchemaFor', () => {
  it('produces an object JSON Schema from a small Zod object', () => {
    const schema = jsonSchemaFor(z.object({ name: z.string(), age: z.number().optional() }));
    expect(schema.type).toBe('object');
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(['age', 'name']);
    expect(schema.required).toEqual(['name']);
  });
});