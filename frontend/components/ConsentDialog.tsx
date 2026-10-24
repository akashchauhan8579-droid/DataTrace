interface ConsentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

export function ConsentDialog({ isOpen, onClose, onConfirm, loading }: ConsentDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-night/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-xl bg-paper border border-hairline p-6 rounded-sm shadow-2xl">
        <div className="mb-4">
          <span className="text-[11px] uppercase tracking-[0.14em] font-mono text-amber">
            Privacy Invariant §15.2
          </span>
          <h2 className="text-xl font-serif text-ink mt-1">
            Enable Model Analysis for this Case
          </h2>
        </div>

        <div className="space-y-3 text-xs font-sans text-muted-ink leading-relaxed border-y border-hairline py-4 my-4">
          <p>
            <strong className="text-ink">What is sent:</strong> Minimised text segments extracted from processed case evidence, stripped of non-relevant context.
          </p>
          <p>
            <strong className="text-ink">Purpose:</strong> Extraction of candidate privacy assertions, entities, dates, and contradiction detection.
          </p>
          <p>
            <strong className="text-ink">Provider:</strong> Groq (running open-weights models) or local mock provider configured by the environment.
          </p>
          <p>
            <strong className="text-ink">Notice on retention:</strong> While minimal scoped text is transmitted over TLS, provider-side retention and processing policies are outside DataTrace's cryptographic control. We do not make claims of zero-retention on external APIs.
          </p>
          <p className="italic text-ink/80 pt-1">
            AI proposals are candidate findings only. Every candidate must satisfy deterministic citation integrity rules before it can be marked verified.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-mono uppercase text-muted-ink hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="bg-ink text-paper px-4 py-2 text-xs font-mono uppercase tracking-wider rounded-sm hover:bg-neutral-800 transition-colors disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Authorize & Start Analysis'}
          </button>
        </div>
      </div>
    </div>
  );
}
