import { describe, it, expect, vi } from 'vitest';
import { assertCaseOwner } from './assertCaseOwner';

describe('assertCaseOwner guard', () => {
  const caseId = 'c0000000-0000-0000-0000-000000000001';
  const ownerUserId = 'u0000000-0000-0000-0000-000000000001';
  const otherUserId = 'u0000000-0000-0000-0000-000000000002';

  const createMockDb = (mockCaseData: any | null) => {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((col1, val1) => ({
            eq: vi.fn().mockImplementation((col2, val2) => ({
              single: vi.fn().mockImplementation(async () => {
                if (
                  mockCaseData &&
                  ((col1 === 'id' && val1 === mockCaseData.id && col2 === 'owner_id' && val2 === mockCaseData.owner_id) ||
                   (col2 === 'id' && val2 === mockCaseData.id && col1 === 'owner_id' && val1 === mockCaseData.owner_id))
                ) {
                  return { data: mockCaseData, error: null };
                }
                return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
              }),
            })),
          })),
        }),
      }),
    } as any;
  };

  it('confirms ownership when user is the case owner (positional signature)', async () => {
    const mockDb = createMockDb({
      id: caseId,
      display_id: 'CASE-001',
      title: 'Investigation Alpha',
      owner_id: ownerUserId,
    });

    const result = await assertCaseOwner(mockDb, caseId, ownerUserId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.caseRow.id).toBe(caseId);
      expect(result.caseRow.displayId).toBe('CASE-001');
      expect(result.caseRow.title).toBe('Investigation Alpha');
      expect(result.caseRow.ownerId).toBe(ownerUserId);
    }
  });

  it('confirms ownership when user is the case owner (named object signature)', async () => {
    const mockDb = createMockDb({
      id: caseId,
      display_id: 'CASE-001',
      title: 'Investigation Alpha',
      owner_id: ownerUserId,
    });

    const result = await assertCaseOwner({ db: mockDb, caseId, userId: ownerUserId });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.caseRow.id).toBe(caseId);
      expect(result.caseRow.ownerId).toBe(ownerUserId);
    }
  });

  it('returns 404 NOT_FOUND for a missing case', async () => {
    const mockDb = createMockDb(null);

    const result = await assertCaseOwner(mockDb, 'non-existent-case', ownerUserId);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(404);
      const json = await result.response.json();
      expect(json).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'Case non-existent-case not found',
        },
      });
    }
  });

  it('returns 404 NOT_FOUND when another user accesses an existing case (zero leakage)', async () => {
    // The case exists in the database, but belongs to ownerUserId
    const mockDb = createMockDb({
      id: caseId,
      display_id: 'CASE-001',
      title: 'Investigation Alpha',
      owner_id: ownerUserId,
    });

    // otherUserId attempts access
    const result = await assertCaseOwner(mockDb, caseId, otherUserId);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(404);
      const json = await result.response.json();
      // Must return identical NOT_FOUND error as if the case did not exist at all
      expect(json).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: `Case ${caseId} not found`,
        },
      });
    }
  });
});
