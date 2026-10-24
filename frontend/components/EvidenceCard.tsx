import Link from 'next/link';
import type { EvidenceItem } from '../lib/types';

interface EvidenceCardProps {
  item: EvidenceItem;
  caseId: string;
}

export function EvidenceCard({ item, caseId }: EvidenceCardProps) {
  const shortSha = item.sha256 ? `${item.sha256.slice(0, 8)}…${item.sha256.slice(-6)}` : 'UNKNOWN';

  const statusColors: Record<string, string> = {
    PROCESSED: 'text-green-800 bg-green-50 border-green-300',
    PENDING: 'text-amber-800 bg-amber-50 border-amber-300',
    FAILED: 'text-red-800 bg-red-50 border-red-300',
    QUARANTINED: 'text-neutral-700 bg-neutral-200 border-neutral-400',
  };

  return (
    <Link
      href={`/cases/${caseId}/evidence/${item.id}`}
      className="flex-shrink-0 w-64 bg-paper-2 border border-hairline p-4 rounded-sm hover:border-amber transition-colors flex flex-col justify-between shadow-xs group"
    >
      <div>
        <div className="flex items-center justify-between text-[11px] font-mono text-muted-ink mb-2">
          <span className="font-semibold text-ink px-1.5 py-0.5 bg-paper rounded border border-hairline">
            {item.display_id}
          </span>
          <span className={`px-1.5 py-0.2 rounded border text-[9px] uppercase font-mono ${statusColors[item.processing_status] || 'bg-gray-100'}`}>
            {item.processing_status}
          </span>
        </div>

        <h3 className="text-xs font-mono font-medium text-ink truncate mb-1" title={item.original_filename}>
          {item.original_filename}
        </h3>

        <div className="text-[10px] text-muted-ink font-sans uppercase tracking-wider mb-2">
          {item.source_type} · {(item.size_bytes / 1024).toFixed(1)} KB
        </div>
      </div>

      <div className="pt-2 border-t border-hairline/60 flex items-center justify-between text-[10px] font-mono text-muted-ink">
        <span title={item.sha256}>SHA: {shortSha}</span>
        <span className="group-hover:translate-x-0.5 transition-transform text-ink">→</span>
      </div>
    </Link>
  );
}
