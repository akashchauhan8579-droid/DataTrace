// The ONLY text and token normalization used by verification and contradiction matching.

const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'of', 'to', 'and', 'or', 'for', 'in', 'on', 'at', 'by', 'with',
  'your', 'our', 'my', 'we', 'you', 'i', 'is', 'are', 'was', 'were', 'be', 'been',
  'it', 'its', 'this', 'that', 'these', 'those', 'from', 'as',
]);

export function normalizeText(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")   // curly single quotes -> '
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')   // curly double quotes -> "
    .replace(/[\u2013\u2014]/g, '-')               // en/em dash -> -
    .replace(/[\u200B-\u200D\uFEFF]/g, '')         // zero-width characters
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeToken(s: string): string[] {
  const tokens = normalizeText(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(t => t.length > 0 && !STOPWORDS.has(t));
  return Array.from(new Set(tokens)).sort();
}

// Structural type; the real NormalizedClaim arrives in step 2.
export function claimKey(c: { predicate: string; subject: string; object: string }): string {
  return `${c.predicate}|${normalizeToken(c.subject).join(' ')}|${normalizeToken(c.object).join(' ')}`;
}
