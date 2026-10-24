export interface FrameworkEntry {
  framework: string;
  articleTitle: string;
  deadlineDays?: number;
  sectionTemplate: string;
  humanReviewed: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
}

export const SAMPLE_FRAMEWORKS: FrameworkEntry[] = [
  {
    framework: 'SAMPLE_ACT_2025',
    articleTitle: 'Article 12 - Data Access and Portability Rights',
    deadlineDays: 30,
    sectionTemplate: 'The data principal submitted an access request under Article 12 of the Sample Framework.',
    humanReviewed: true,
    reviewedBy: 'legal-reviewer-1',
    reviewedAt: '2025-01-15T00:00:00Z',
  },
  {
    framework: 'UNREVIEWED_DRAFT_ACT',
    articleTitle: 'Article 99 - Provisional Deletion Obligation',
    deadlineDays: 45,
    sectionTemplate: 'Preliminary draft template for unreviewed deletion claims.',
    humanReviewed: false,
  },
];

export const FRAMEWORK_ENTRIES = SAMPLE_FRAMEWORKS;
