import type { VerificationState } from '../lib/types';

const STATE_CONFIG: Record<
  VerificationState,
  { label: string; icon: string; className: string }
> = {
  UNVERIFIED: {
    label: 'Unverified',
    icon: '○',
    className: 'bg-gray-100 text-gray-600 border-gray-300',
  },
  AI_INFERRED: {
    label: 'AI Inferred',
    icon: '◈',
    className: 'bg-amber-50 text-amber-700 border-amber-300',
  },
  CORROBORATED: {
    label: 'Corroborated',
    icon: '◎',
    className: 'bg-teal-50 text-teal-700 border-teal-300',
  },
  VERIFIED: {
    label: 'Verified',
    icon: '✓',
    className: 'bg-green-50 text-green-800 border-green-400',
  },
  CONTRADICTED: {
    label: 'Contradicted',
    icon: '✕',
    className: 'bg-red-50 text-red-700 border-red-300',
  },
};

interface StateBadgeProps {
  state: VerificationState;
}

/**
 * StateBadge — shows verification state.
 * ALWAYS paired with text label + icon. Never colour alone. (§23 hard rule)
 * Never merged with BasisBadge — these are TWO separate concepts.
 */
export function StateBadge({ state }: StateBadgeProps) {
  const config = STATE_CONFIG[state] ?? STATE_CONFIG.UNVERIFIED;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-mono font-medium ${config.className}`}
      aria-label={`Verification state: ${config.label}`}
    >
      <span aria-hidden="true">{config.icon}</span>
      {config.label}
    </span>
  );
}
