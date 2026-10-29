'use client';

import { useParams } from 'next/navigation';
import { Shell } from './Shell';
import { DisclaimerFooter } from './DisclaimerFooter';

export type CaseTabSkeletonVariant =
  | 'overview'
  | 'evidence'
  | 'findings'
  | 'timeline'
  | 'matrix'
  | 'report'
  | 'audit';

const WRAPPER: Record<CaseTabSkeletonVariant, string> = {
  overview: 'flex-1 flex flex-col p-8 max-w-7xl w-full mx-auto',
  evidence: 'flex-1 max-w-4xl w-full mx-auto p-8',
  findings: 'flex-1 max-w-6xl w-full mx-auto p-8',
  timeline: 'flex-1 max-w-5xl w-full mx-auto p-6 md:p-8',
  matrix: 'flex-1 max-w-6xl w-full mx-auto p-8',
  report: 'flex-1 max-w-7xl w-full mx-auto p-8',
  audit: '',
};

function HeaderSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div className="border-b border-hairline pb-4 mb-6 space-y-3">
      <div className="skeleton h-3 w-24" />
      <div className={`skeleton h-8 ${wide ? 'w-96' : 'w-72'} max-w-full`} />
      <div className="skeleton h-3 w-full max-w-2xl" />
      <div className="skeleton h-3 w-3/4 max-w-xl" />
    </div>
  );
}

function FindingsSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="flex gap-1 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-7 w-24" />
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border border-hairline rounded-sm p-5 bg-paper-2 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="skeleton h-3 w-32" />
              <div className="skeleton h-5 w-24" />
            </div>
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-5/6" />
            <div className="flex gap-2">
              <div className="skeleton h-5 w-16" />
              <div className="skeleton h-5 w-20" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function TimelineSkeleton() {
  return (
    <>
      <HeaderSkeleton wide />
      <div className="skeleton h-12 w-full mb-8" />
      <div className="relative pl-6 md:pl-8 border-l-2 border-hairline ml-4 md:ml-6 space-y-8">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-paper-2 border border-hairline rounded-sm p-5 space-y-3">
            <div className="flex items-center justify-between gap-3 border-b border-hairline/60 pb-2">
              <div className="skeleton h-3 w-40" />
              <div className="flex gap-2">
                <div className="skeleton h-5 w-16" />
                <div className="skeleton h-5 w-16" />
              </div>
            </div>
            <div className="skeleton h-5 w-2/3" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-4/5" />
          </div>
        ))}
      </div>
    </>
  );
}

function MatrixSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="border border-hairline rounded-sm overflow-hidden">
        <div className="skeleton h-10 w-full rounded-none" />
        <div className="divide-y divide-hairline">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="grid grid-cols-3 gap-4 p-4">
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ReportSkeleton() {
  return (
    <>
      <HeaderSkeleton wide />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="skeleton h-3 w-48" />
          <div className="border border-hairline rounded-sm p-5 space-y-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-4 w-full" />
            ))}
            <div className="skeleton h-24 w-full" />
          </div>
        </div>
        <div className="border-l border-hairline pl-8 space-y-4">
          <div className="skeleton h-3 w-56" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="border border-hairline rounded-sm p-4 space-y-2">
              <div className="skeleton h-3 w-32" />
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-5/6" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function OverviewSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex gap-3">
            <div className="skeleton h-5 w-20" />
            <div className="skeleton h-5 w-16" />
          </div>
          <div className="skeleton h-9 w-2/3 max-w-lg" />
          <div className="skeleton h-3 w-full max-w-xl" />
          <div className="skeleton h-3 w-5/6 max-w-lg" />
          <div className="grid grid-cols-4 gap-4 pt-4 border-t border-hairline max-w-xl">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="skeleton h-2.5 w-16" />
                <div className="skeleton h-7 w-10" />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-paper-2 border border-hairline rounded-sm p-6 space-y-5">
          <div className="skeleton h-2.5 w-32" />
          <div className="skeleton h-6 w-48" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-5/6" />
          <div className="skeleton h-10 w-full mt-6" />
        </div>
      </div>
      <div className="pt-6 border-t border-hairline space-y-4">
        <div className="skeleton h-2.5 w-28" />
        <div className="skeleton h-6 w-40" />
        <div className="flex gap-4 overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-36 w-64 shrink-0" />
          ))}
        </div>
      </div>
    </>
  );
}

function EvidenceSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="flex gap-2 border-b border-hairline mb-6 pb-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-7 w-32" />
        ))}
      </div>
      <div className="space-y-5">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-10 w-56" />
        <div className="skeleton h-44 w-full" />
        <div className="skeleton h-10 w-40" />
      </div>
    </>
  );
}

function AuditSkeleton() {
  return (
    <div className="flex-1 bg-night text-on-night p-8">
      <div className="max-w-5xl w-full mx-auto">
        <div className="border-b border-white/10 pb-4 mb-8 space-y-3">
          <div className="skeleton h-2.5 w-32 opacity-25" />
          <div className="skeleton h-8 w-80 max-w-full opacity-25" />
        </div>
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-night-2 border border-white/10 rounded-sm p-4 space-y-3">
              <div className="skeleton h-2.5 w-48 opacity-25" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="skeleton h-3 w-full opacity-25" />
                <div className="skeleton h-3 w-full opacity-25" />
                <div className="skeleton h-3 w-2/3 opacity-25" />
              </div>
              <div className="skeleton h-14 w-full opacity-25" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CaseTabSkeleton({ variant }: { variant: CaseTabSkeletonVariant }) {
  const params = useParams();
  const caseId = (params?.id as string | undefined) ?? undefined;

  return (
    <Shell currentCaseId={caseId}>
      <div className={WRAPPER[variant]}>
        {variant === 'overview' && <OverviewSkeleton />}
        {variant === 'evidence' && <EvidenceSkeleton />}
        {variant === 'findings' && <FindingsSkeleton />}
        {variant === 'timeline' && <TimelineSkeleton />}
        {variant === 'matrix' && <MatrixSkeleton />}
        {variant === 'report' && <ReportSkeleton />}
        {variant === 'audit' && <AuditSkeleton />}
      </div>
      <DisclaimerFooter />
    </Shell>
  );
}
