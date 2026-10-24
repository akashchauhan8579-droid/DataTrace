import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { StateBadge } from '../../components/StateBadge';
import { BasisBadge } from '../../components/BasisBadge';
import { CitationChip } from '../../components/CitationChip';

describe('Frontend Invariant Components (§23 & T19)', () => {
  it('renders StateBadge and BasisBadge as strictly separate visual elements', () => {
    const { container: stateContainer } = render(<StateBadge state="VERIFIED" />);
    const { container: basisContainer } = render(<BasisBadge basis="DIRECT" />);

    // Assert badges have distinct text and styling
    expect(screen.getByText('Verified')).toBeDefined();
    expect(screen.getByText('DIR')).toBeDefined();

    const stateElem = stateContainer.querySelector('span');
    const basisElem = basisContainer.querySelector('span');

    // Distinct CSS classes ensures they are never visually merged
    expect(stateElem?.className).toContain('font-medium');
    expect(basisElem?.className).toContain('text-[10px]');
  });

  it('renders CitationChip pointing to the correct segment anchor format', () => {
    const mockCitation = {
      id: 'cit-1',
      evidence_id: 'ev-12345678',
      segment_id: 'seg-42',
      locator_type: 'PARAGRAPH',
      locator: { paragraph: 2 },
      quoted_text: 'We hold your data.',
      validation_status: 'VALID',
    };

    render(<CitationChip citation={mockCitation} caseId="case-100" />);

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/cases/case-100/evidence/ev-12345678#seg-seg-42');
    expect(link.getAttribute('title')).toBe('We hold your data.');
  });
});
