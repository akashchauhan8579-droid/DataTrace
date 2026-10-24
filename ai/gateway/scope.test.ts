import { describe, it, expect } from 'vitest';
import { scopeKey } from './scope';

describe('scopeKey', () => {
  it('joins display id and ordinal with #', () => {
    expect(scopeKey('EV-101', 3)).toBe('EV-101#3');
  });
});
