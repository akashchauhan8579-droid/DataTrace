import type { EvidenceSegment } from '../lib/types';

interface SegmentViewProps {
  segment: EvidenceSegment;
  isHighlighted?: boolean;
}

export function SegmentView({ segment, isHighlighted }: SegmentViewProps) {
  const locatorStr = segment.locator_type === 'EMAIL_BODY'
    ? 'BODY'
    : segment.locator?.page
    ? `PAGE ${segment.locator.page}`
    : segment.locator_type;

  return (
    <div
      data-segment-id={segment.id}
      id={`seg-${segment.id}`}
      className={`p-4 rounded-sm border transition-colors ${
        isHighlighted
          ? 'bg-amber/15 border-amber ring-2 ring-amber/30'
          : 'bg-paper-2 border-hairline hover:border-hairline/80'
      }`}
    >
      <div className="flex items-center justify-between text-[10px] font-mono text-muted-ink mb-2 select-none border-b border-hairline/40 pb-1">
        <span className="font-semibold text-ink">
          #{segment.ordinal} · {locatorStr}
        </span>
        <span className="text-[9px] uppercase tracking-wider">{segment.locator_type}</span>
      </div>

      <pre className="font-mono text-xs text-ink whitespace-pre-wrap break-words leading-relaxed">
        {segment.segment_text}
      </pre>
    </div>
  );
}
