import Link from 'next/link';
import type { Citation } from '../lib/types';

interface CitationChipProps {
  citation: Citation;
  caseId: string;
}

export function CitationChip({ citation, caseId }: CitationChipProps) {
  // Label format e.g. "EV-101 #3" or "EV-101"
  const segPart = citation.segment_id ? ` #${citation.segment_id.slice(0, 4)}` : '';
  const label = `EV-${(citation.evidence_id || '').slice(0, 4)}${segPart}`;

  const href = citation.segment_id
    ? `/cases/${caseId}/evidence/${citation.evidence_id}#seg-${citation.segment_id}`
    : `/cases/${caseId}/evidence/${citation.evidence_id}`;

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-hairline bg-paper text-[10px] font-mono text-muted-ink hover:text-ink hover:border-amber transition-colors"
      title={citation.quoted_text || 'View cited segment'}
    >
      <span>📎</span>
      <span>{label}</span>
    </Link>
  );
}
