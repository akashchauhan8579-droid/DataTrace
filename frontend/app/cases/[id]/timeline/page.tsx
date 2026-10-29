'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { Case, EvidenceItem, Finding } from '@/lib/types';
import { Shell } from '@/components/Shell';
import { DisclaimerFooter } from '@/components/DisclaimerFooter';
import { useCaseTab, useRedirectOnAuthError } from '@/lib/queries';

interface TimelineEvent {
  id: string;
  timestamp: string;
  isUncertainDate: boolean;
  category: 'EVIDENCE' | 'REQUEST' | 'RESPONSE' | 'CONTRADICTION' | 'FINDING';
  title: string;
  summary: string;
  displayId: string;
  basis?: string;
  state?: string;
  evidenceId?: string;
  segmentId?: string;
  sourceType?: string;
}

function buildTimeline(evidence: EvidenceItem[], findings: Finding[]): TimelineEvent[] {
  const timelineList: TimelineEvent[] = [];

  // 1. Evidence items
  for (const item of evidence) {
    const date = item.captured_at || item.uploaded_at;
    timelineList.push({
      id: `ev-${item.id}`,
      timestamp: date,
      isUncertainDate: !item.captured_at,
      category: 'EVIDENCE',
      title: `Preserved Evidence: ${item.original_filename}`,
      summary: `Format: ${item.mime_type} • SHA-256: ${item.sha256.slice(0, 16)}...`,
      displayId: item.display_id,
      evidenceId: item.id,
      sourceType: item.source_type,
    });
  }

  // 2. Findings
  for (const f of findings) {
    let category: TimelineEvent['category'] = 'FINDING';
    const typeUpper = (f.finding_type || '').toUpperCase();
    if (typeUpper.includes('REQUEST')) category = 'REQUEST';
    else if (typeUpper.includes('RESPONSE')) category = 'RESPONSE';
    else if (f.evidence_basis === 'CONFLICTING' || f.verification_state === 'CONTRADICTED') category = 'CONTRADICTION';

    const payload = f.structured_payload || {};
    // Extract date from payload or fallback to current time
    const eventDate = (payload as any).occurredAt || (payload as any).date || new Date().toISOString();
    const isUncertain = !(payload as any).occurredAt;

    const firstCitation = f.citations?.[0];

    timelineList.push({
      id: `fnd-${f.id}`,
      timestamp: eventDate,
      isUncertainDate: isUncertain,
      category,
      title: (payload as any).summary || (payload as any).title || `${f.finding_type}: ${f.display_id}`,
      summary: f.statement || (payload as any).details || 'Extracted case statement',
      displayId: f.display_id,
      basis: f.evidence_basis,
      state: f.verification_state,
      evidenceId: firstCitation?.evidence_id,
      segmentId: firstCitation?.segment_id,
    });
  }

  return timelineList;
}

export default function CaseTimelinePage() {
  const params = useParams();
  const caseId = params.id as string;

  const { data, isLoading, error } = useCaseTab(caseId, 'timeline');
  useRedirectOnAuthError(error);

  const caseData: Case | null = data?.caseData ?? null;
  const evidence = data?.evidence ?? [];
  const findings = data?.findings ?? [];

  const events = useMemo(() => buildTimeline(evidence, findings), [evidence, findings]);

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');

  const filteredEvents = events
    .filter((e) => {
      if (filterCategory === 'ALL') return true;
      if (filterCategory === 'EVIDENCE') return e.category === 'EVIDENCE';
      if (filterCategory === 'REQUESTS') return e.category === 'REQUEST';
      if (filterCategory === 'RESPONSES') return e.category === 'RESPONSE';
      if (filterCategory === 'CONTRADICTIONS') return e.category === 'CONTRADICTION';
      return true;
    })
    .sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sortOrder === 'ASC' ? timeA - timeB : timeB - timeA;
    });

  return (
    <Shell currentCaseId={caseId} caseDisplayId={caseData?.displayId}>
      <div className="flex-1 max-w-5xl w-full mx-auto p-6 md:p-8 fade-in">
        {/* Header */}
        <div className="border-b border-hairline pb-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-copper font-semibold">
                  Principle 8 • Chronological Record
                </span>
                <span className="text-muted-ink text-xs font-mono">•</span>
                <span className="text-xs font-mono text-muted-ink">
                  {caseData?.title || 'Case Dossier'}
                </span>
              </div>
              <h1 className="text-3xl font-serif font-normal text-ink">
                Chronological Case Timeline
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={`/cases/${caseId}/graph`}
                className="px-3 py-1.5 border border-hairline rounded-sm text-xs font-mono text-ink bg-paper-2 hover:bg-paper transition-colors uppercase tracking-wider"
              >
                View Entity Graph →
              </Link>
            </div>
          </div>
          <p className="text-xs font-sans text-muted-ink mt-2">
            Verifiable sequence of observed events, user requests, corporate communications, and contradicting statements. Uncertain or unverified dates are labelled explicitly per archival standards.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-xs font-sans rounded-sm">
            {error.message}
          </div>
        )}

        {/* Filter & Sorting Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-paper-2 border border-hairline rounded-sm mb-8 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-ink uppercase tracking-wider text-[11px] mr-1">
              Filter:
            </span>
            {(['ALL', 'EVIDENCE', 'REQUESTS', 'RESPONSES', 'CONTRADICTIONS'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-2.5 py-1 rounded text-[11px] uppercase tracking-wider transition-colors ${
                  filterCategory === cat
                    ? 'bg-ink text-paper font-semibold'
                    : 'bg-paper text-muted-ink hover:text-ink border border-hairline'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-muted-ink uppercase tracking-wider text-[11px]">
              Order:
            </span>
            <button
              onClick={() => setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC')}
              className="px-2.5 py-1 bg-paper border border-hairline text-ink rounded text-[11px] uppercase tracking-wider hover:bg-paper-2 transition-colors flex items-center gap-1 font-semibold"
            >
              <span>{sortOrder === 'ASC' ? 'Oldest First (↑)' : 'Newest First (↓)'}</span>
            </button>
          </div>
        </div>

        {/* Timeline View */}
        {isLoading ? (
          <div className="p-12 text-center font-mono text-xs text-muted-ink">
            ASSEMBLING CHRONOLOGICAL DOSSIER...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-12 text-center bg-paper-2 border border-hairline rounded-sm font-mono text-xs text-muted-ink">
            No chronological events found matching current filters.
          </div>
        ) : (
          <div className="relative pl-6 md:pl-8 border-l-2 border-hairline ml-4 md:ml-6 space-y-8 pb-12">
            {filteredEvents.map((evt) => {
              const dateObj = new Date(evt.timestamp);
              const formattedDate = isNaN(dateObj.getTime())
                ? evt.timestamp
                : `${dateObj.toISOString().slice(0, 10)} ${dateObj.toTimeString().slice(0, 8)} UTC`;

              return (
                <div key={evt.id} className="relative group">
                  {/* Timeline dot node */}
                  <div
                    className={`absolute -left-[31px] md:-left-[39px] top-1.5 w-4 h-4 rounded-full border-2 bg-paper transition-transform group-hover:scale-125 ${
                      evt.category === 'CONTRADICTION'
                        ? 'border-red-600 bg-red-100'
                        : evt.category === 'REQUEST'
                        ? 'border-copper bg-amber/20'
                        : evt.category === 'RESPONSE'
                        ? 'border-green-600 bg-green-100'
                        : evt.category === 'EVIDENCE'
                        ? 'border-ink bg-paper-2'
                        : 'border-muted-ink bg-paper'
                    }`}
                  />

                  {/* Event card */}
                  <div className="bg-paper-2 border border-hairline hover:border-ink/30 transition-colors p-5 rounded-sm space-y-3 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-ink">
                          {formattedDate}
                        </span>
                        {evt.isUncertainDate && (
                          <span className="px-1.5 py-0.5 bg-amber/20 border border-amber/40 text-amber text-[10px] font-mono uppercase tracking-wider rounded">
                            Uncertain Date (§8)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[10px] font-mono">
                        <span className="px-2 py-0.5 bg-paper rounded border border-hairline text-muted-ink font-semibold">
                          {evt.displayId}
                        </span>

                        {evt.basis && (
                          <span
                            className={`px-2 py-0.5 rounded uppercase font-semibold ${
                              evt.basis === 'DIRECT'
                                ? 'bg-copper/15 text-copper'
                                : evt.basis === 'CONFLICTING'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-paper text-muted-ink border border-hairline'
                            }`}
                          >
                            {evt.basis}
                          </span>
                        )}

                        {evt.state && (
                          <span
                            className={`px-2 py-0.5 rounded uppercase font-semibold ${
                              evt.state === 'VERIFIED'
                                ? 'bg-green-100 text-green-900 border border-green-300'
                                : evt.state === 'CONTRADICTED'
                                ? 'bg-red-100 text-red-900 border border-red-300'
                                : 'bg-paper text-muted-ink border border-hairline'
                            }`}
                          >
                            {evt.state}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <h3 className="font-serif text-lg font-medium text-ink">
                        {evt.title}
                      </h3>
                      <p className="font-sans text-xs text-muted-ink leading-relaxed">
                        {evt.summary}
                      </p>
                    </div>

                    {evt.evidenceId && (
                      <div className="pt-2 border-t border-hairline/50 flex items-center justify-between text-[11px] font-mono">
                        <span className="text-muted-ink">
                          CITATION ANCHOR: SEGMENT GROUNDED
                        </span>
                        <Link
                          href={`/cases/${caseId}/evidence/${evt.evidenceId}`}
                          className="text-copper hover:underline uppercase tracking-wider font-medium"
                        >
                          View Preserved Evidence Item →
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <DisclaimerFooter />
    </Shell>
  );
}
