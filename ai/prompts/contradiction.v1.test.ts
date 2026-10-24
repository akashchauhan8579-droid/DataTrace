import { describe, it, expect } from 'vitest';
import { getPrompt, registerPrompt } from './registry';
import {
  CONTRADICTION_PROMPT_ID,
  CONTRADICTION_PROMPT_VERSION,
  contradictionPrompt,
} from './contradiction.v1';

describe('contradiction.v1 prompt', () => {
  it('is registered in the registry under contradiction@v1', () => {
    const p = getPrompt(CONTRADICTION_PROMPT_ID, CONTRADICTION_PROMPT_VERSION);
    expect(p).toBeDefined();
    expect(p?.taskType).toBe('contradiction_consolidation');
  });

  it('throws on duplicate registration attempt', () => {
    expect(() => registerPrompt(contradictionPrompt)).toThrowError(/already registered/i);
  });

  it('renders a prompt containing no UUIDs', () => {
    const rendered = contradictionPrompt.build({
      scope: [],
      findingContext: [
        {
          displayId: 'FND-101',
          statement: 'We deleted your data.',
          normalizedClaim: {
            subject: 'Acme Corp',
            predicate: 'deletes_data',
            object: 'personal data',
            polarity: 'AFFIRMS',
          },
        },
        {
          displayId: 'FND-102',
          statement: 'We retain your data.',
          normalizedClaim: {
            subject: 'Acme Corp',
            predicate: 'deletes_data',
            object: 'personal data',
            polarity: 'DENIES',
          },
        },
      ],
    });

    const fullText = `${rendered.system}\n${rendered.user}`;
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    expect(fullText).not.toMatch(uuidRegex);
  });

  it('mentions only VERIFIED claims and includes untrusted-data warning', () => {
    const rendered = contradictionPrompt.build({
      scope: [],
      findingContext: [
        {
          displayId: 'FND-101',
          statement: 'We deleted your data.',
        },
      ],
    });

    expect(rendered.system).toContain('VERIFIED');
    expect(rendered.system).toContain('untrusted data');
    expect(rendered.user).toContain('VERIFIED');
    expect(rendered.user).toContain('untrusted data');
  });
});
