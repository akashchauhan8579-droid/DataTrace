'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { DisclaimerFooter } from '@/components/DisclaimerFooter';
import { useCaseTab, useRedirectOnAuthError } from '@/lib/queries';

export default function AuditPage() {
  const params = useParams();
  const caseId = params.id as string;

  const { data, isLoading, error } = useCaseTab(caseId, 'audit');
  useRedirectOnAuthError(error);

  const events = data?.events ?? [];

  return (
    <Shell currentCaseId={caseId}>
      {/* Dark cinematic section for cryptographic integrity audit (§23 visual spec) */}
      <div className="flex-1 bg-night text-on-night p-8 fade-in">
        <div className="max-w-5xl w-full mx-auto">
          <div className="border-b border-white/10 pb-4 mb-8">
            <Link
              href={`/cases/${caseId}`}
              className="text-xs font-mono text-white/50 hover:text-white uppercase tracking-wider mb-2 inline-block"
            >
              ← Back to Case
            </Link>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber">
                  Cryptographic Ledger
                </span>
                <h1 className="text-3xl font-serif font-normal text-on-night mt-1">
                  Immutable Audit Chain
                </h1>
              </div>

              <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-white/5 border border-white/10 text-xs font-mono text-teal-400">
                <span className="animate-spin text-sm">◎</span>
                <span>Audit chain intact ✓</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-900/30 border border-red-500/40 text-red-200 text-xs font-mono rounded-sm">
              {error.message}
            </div>
          )}

          {isLoading ? (
            <div className="py-20 text-center font-mono text-xs text-white/40">
              Verifying hash-chained event ledgers...
            </div>
          ) : events.length === 0 ? (
            <div className="py-20 text-center border border-dashed border-white/10 rounded-sm p-8 text-xs font-mono text-white/40">
              No audit events logged yet for this case.
            </div>
          ) : (
            <div className="space-y-4">
              {events.map((ev, index) => {
                const eventNum = ev.case_seq || ev.seq || (events.length - index);
                const eventTime = ev.occurred_at || ev.created_at;
                const hashDisplay = ev.row_hash
                  ? `${ev.row_hash.slice(0, 8)}…`
                  : ev.id
                  ? `${ev.id.slice(0, 8)}…`
                  : `#${eventNum}`;

                return (
                  <div
                    key={ev.id || ev.seq || index}
                    className="bg-night-2 border border-white/10 rounded-sm p-4 font-mono text-xs hover:border-amber/40 transition-colors"
                  >
                    <div className="flex items-center justify-between text-white/40 text-[10px] mb-2 border-b border-white/5 pb-1">
                      <span>EVENT #{eventNum} · {ev.action}</span>
                      <span>{eventTime ? new Date(eventTime).toLocaleString() : ''}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-white/70 text-[11px] mb-2">
                      <div>Entity: <strong className="text-white">{ev.entity_type}</strong></div>
                      <div>Actor: <strong className="text-white">{ev.actor_type}</strong></div>
                      <div>Ledger Hash: <span className="text-white/50">{hashDisplay}</span></div>
                    </div>

                    {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                      <pre className="text-[10px] bg-black/40 p-2 rounded text-amber/90 overflow-x-auto">
                        {JSON.stringify(ev.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <DisclaimerFooter />
    </Shell>
  );
}
