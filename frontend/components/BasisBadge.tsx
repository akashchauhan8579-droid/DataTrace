import type { EvidenceBasis } from '../lib/types';

const BASIS_CONFIG: Record<EvidenceBasis, { label: string; abbr: string }> = {
  DIRECT: { label: 'Direct', abbr: 'DIR' },
  OBSERVED: { label: 'Observed', abbr: 'OBS' },
  INFERRED: { label: 'Inferred', abbr: 'INF' },
  CONFLICTING: { label: 'Conflicting', abbr: 'CFG' },
};

interface BasisBadgeProps {
  basis: EvidenceBasis;
}

/**
 * BasisBadge — shows evidence basis.
 * Outlined, neutral, SMALLER than StateBadge so the two never look alike. (§23)
 * Never merged with StateBadge — these are TWO separate concepts.
 */
export function BasisBadge({ basis }: BasisBadgeProps) {
  const config = BASIS_CONFIG[basis] ?? BASIS_CONFIG.INFERRED;
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded border border-ink/20 text-[10px] font-mono font-medium text-muted-ink uppercase tracking-widest bg-transparent"
      aria-label={`Evidence basis: ${config.label}`}
      title={config.label}
    >
      {config.abbr}
    </span>
  );
}
