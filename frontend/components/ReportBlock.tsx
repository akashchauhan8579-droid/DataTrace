import type { ReportBlock as IReportBlock } from '../lib/types';

interface ReportBlockProps {
  block: IReportBlock;
  index: number;
  isFailing?: boolean;
}

export function ReportBlock({ block, isFailing }: ReportBlockProps) {
  if (block.kind === 'heading') {
    return (
      <h2 className="text-xl font-serif font-normal text-ink mt-6 mb-2 border-b border-hairline/60 pb-1">
        {block.text}
      </h2>
    );
  }

  if (block.kind === 'notice') {
    return (
      <blockquote className="p-3 bg-paper-2 border-l-2 border-muted-ink text-xs font-serif italic text-muted-ink my-3">
        {block.text}
      </blockquote>
    );
  }

  if (block.kind === 'user_note') {
    return (
      <div className="p-3 bg-paper border border-hairline rounded-sm my-3">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-ink block mb-1">
          Author's statement (not evidence-backed)
        </span>
        <p className="text-xs font-sans text-ink">{block.notes || block.text}</p>
      </div>
    );
  }

  // Assertion block
  return (
    <div
      className={`p-3 rounded-sm my-3 border transition-colors ${
        isFailing
          ? 'bg-red-50 border-red-300 ring-1 ring-red-300'
          : 'bg-paper-2 border-hairline'
      }`}
    >
      <div className="flex items-center justify-between text-[10px] font-mono text-muted-ink mb-1">
        <span>ASSERTION</span>
        {isFailing && <span className="text-red-700 font-semibold">GROUNDING CHECK FAILED</span>}
      </div>

      <p className="text-xs font-sans text-ink leading-relaxed mb-2">
        {block.text}
      </p>

      {block.findingIds && block.findingIds.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-hairline/40">
          <span className="text-[9px] font-mono text-muted-ink uppercase">Grounding Tokens:</span>
          {block.findingIds.map((id) => (
            <span
              key={id}
              className="text-[10px] font-mono bg-paper px-1.5 py-0.2 rounded border border-hairline text-ink"
            >
              [{id.slice(0, 8)}]
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
