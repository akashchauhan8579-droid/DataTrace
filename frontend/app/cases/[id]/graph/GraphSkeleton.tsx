'use client';

import { useParams } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { DisclaimerFooter } from '@/components/DisclaimerFooter';

export function GraphSkeleton() {
  const params = useParams();
  const caseId = (params?.id as string | undefined) ?? undefined;

  return (
    <Shell currentCaseId={caseId}>
      <div className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-8">
        {/* Header */}
        <div className="border-b border-hairline pb-4 mb-6 space-y-3">
          <div className="skeleton h-3 w-56" />
          <div className="skeleton h-8 w-80 max-w-full" />
          <div className="skeleton h-3 w-full max-w-2xl" />
          <div className="skeleton h-3 w-3/4 max-w-xl" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="p-4 bg-paper-2 border border-hairline rounded-sm space-y-3">
              <div className="skeleton h-2.5 w-24" />
              <div className="skeleton h-7 w-12" />
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 p-3 bg-paper-2 border border-hairline rounded-sm mb-6">
          <div className="skeleton h-3 w-24 mr-1" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-6 w-20" />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Canvas */}
          <div className="lg:col-span-2 bg-paper-2 border border-hairline rounded-sm relative min-h-[560px] flex items-center justify-center p-4 overflow-hidden">
            <div className="relative w-full max-w-[520px] h-[420px]">
              <div className="skeleton absolute left-1/2 top-1/2 h-12 w-36 -translate-x-1/2 -translate-y-1/2" />
              <div className="skeleton absolute left-[4%] top-1/2 h-12 w-32 -translate-y-1/2" />
              <div className="skeleton absolute right-[6%] top-[12%] h-12 w-32" />
              <div className="skeleton absolute right-[10%] bottom-[10%] h-12 w-32" />
              <div className="skeleton absolute left-[24%] bottom-[4%] h-12 w-28" />
              <div className="skeleton absolute inset-x-0 top-1/2 h-px" />
            </div>
            <div className="absolute bottom-3 left-3 flex items-center gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-4 w-20" />
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div className="bg-paper-2 border border-hairline rounded-sm p-6 space-y-6">
            <div className="border-b border-hairline pb-3 space-y-2">
              <div className="skeleton h-2.5 w-28" />
              <div className="skeleton h-6 w-48 max-w-full" />
            </div>
            <div className="space-y-3">
              <div className="skeleton h-3 w-32" />
              <div className="skeleton h-3 w-full" />
              <div className="skeleton h-3 w-5/6" />
              <div className="skeleton h-12 w-full" />
            </div>
            <div className="space-y-2">
              <div className="skeleton h-3 w-28" />
              <div className="skeleton h-16 w-full" />
            </div>
          </div>
        </div>
      </div>

      <DisclaimerFooter />
    </Shell>
  );
}
