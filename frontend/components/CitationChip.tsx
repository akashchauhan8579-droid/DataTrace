import Link from 'next/link';
import type { Citation } from '../lib/types';

interface CitationChipProps {
  citation: Citation;
  caseId: string;
}

export function CitationChip({ citation, caseId }: CitationChipProps) {
  // Label format e.g. "EV-101 #3" or "EV-101"
  const label = `EV-${citation.evidence_id.slice(0, 4)} #${citation.segment_id.slice(0, 2)}`;

  return (
    <Link
      href={`/cases/${caseId}/evidence/${citation.evidence_id}#seg-${citation.segment_id}`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-hairline bg-paper text-[10px] font-mono text-muted-ink hover:text-ink hover:border-amber transition-colors"
      title={citation.quoted_text || 'View cited segment'}
    >
      <span>📎</span>
      <span>{label}</span>
    </Link>
  );
}
