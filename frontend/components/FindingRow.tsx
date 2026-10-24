'use client';

import { useState } from 'react';
import type { Finding } from '../lib/types';
import { StateBadge } from './StateBadge';
import { BasisBadge } from './BasisBadge';
import { CitationChip } from './CitationChip';

interface FindingRowProps {
  finding: Finding;
  caseId: string;
  onConfirm?: (findingId: string) => void;
  confirming?: boolean;
}

export function FindingRow({ finding, caseId, onConfirm, confirming }: FindingRowProps) {
  const [expanded, setExpanded] = useState(false);

  const isContradiction = finding.finding_type === 'CONTRADICTION';
  const payload = (finding.structured_payload || {}) as Record<string, any>;

  return (
    <div className="bg-paper-2 border border-hairline rounded-sm p-4 hover:border-hairline/80 transition-colors">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-2">
        <div className="space-y-1.5 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-paper rounded border border-hairline">
              {finding.display_id}
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-ink">
              {finding.finding_type}
            </span>

            {/* TWO separate badges strictly unmerged (§23) */}
            <BasisBadge basis={finding.evidence_basis} />
            <StateBadge state={finding.verification_state} />

            {finding.candidate_confidence !== null && finding.candidate_confidence !== undefined && (
              <span className="text-[10px] font-mono text-muted-ink bg-paper px-1.5 py-0.2 rounded border border-hairline">
                model confidence: {(finding.candidate_confidence * 100).toFixed(0)}%
              </span>
            )}

            {finding.source_unavailable && (
              <span className="text-[10px] font-mono text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.2 rounded">
                source no longer available
              </span>
            )}
          </div>

          <p className="text-sm font-sans text-ink leading-relaxed">
            {finding.statement}
          </p>

          {/* Citations row */}
          {finding.citations?.length > 0 && (
            <div className="flex items-center gap-1.5 pt-1 flex-wrap">
              <span className="text-[10px] font-mono text-muted-ink uppercase">Citations:</span>
              {finding.citations.map((cite) => (
                <CitationChip key={cite.id} citation={cite} caseId={caseId} />
              ))}
            </div>
          )}
        </div>

        {/* Action button */}
        <div className="flex items-center gap-2 flex-shrink-0 mt-2 md:mt-0">
          {finding.verification_state !== 'VERIFIED' && onConfirm && (
            <button
              onClick={() => onConfirm(finding.id)}
              disabled={confirming}
              className="bg-paper border border-hairline hover:border-ink px-2.5 py-1 text-[11px] font-mono uppercase text-ink rounded-sm transition-colors disabled:opacity-50"
            >
              {confirming ? 'Confirming…' : 'Confirm Reading'}
            </button>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] font-mono text-muted-ink hover:text-ink px-2 py-1 rounded hover:bg-paper"
          >
            {expanded ? 'Hide Details' : 'View Details'}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-4 pt-3 border-t border-hairline/60 space-y-3">
          {/* Quotes */}
          {finding.citations?.some((c) => c.quoted_text) && (
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-ink block mb-1">
                Extracted Supporting Quote
              </span>
              <div className="space-y-1">
                {finding.citations.map((c) =>
                  c.quoted_text ? (
                    <blockquote
                      key={c.id}
                      className="border-l-2 border-amber pl-3 text-xs font-serif italic text-ink/90 bg-paper/50 py-1"
                    >
                      "{String(c.quoted_text)}"
                    </blockquote>
                  ) : null
                )}
              </div>
            </div>
          )}

          {/* Contradiction Specific side-by-side view (§13.4) */}
          {isContradiction && payload.claimARef && payload.claimBRef && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-red-50/40 border border-red-200/60 rounded-sm">
              <div>
                <span className="text-[10px] font-mono uppercase text-muted-ink block">Claim A ({String(payload.claimARef)})</span>
                <p className="text-xs font-sans text-ink mt-1 italic">
                  "{String(payload.claimAQuote || 'Quote reference in finding')}"
                </p>
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-muted-ink block">Claim B ({String(payload.claimBRef)})</span>
                <p className="text-xs font-sans text-ink mt-1 italic">
                  "{String(payload.claimBQuote || 'Quote reference in finding')}"
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
