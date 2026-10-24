import Link from 'next/link';

interface ShellProps {
  currentCaseId?: string;
  caseDisplayId?: string;
  children: React.ReactNode;
}

export function Shell({ currentCaseId, caseDisplayId, children }: ShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <header className="border-b border-hairline px-6 py-3.5 flex items-center justify-between bg-paper sticky top-0 z-20 backdrop-blur-sm bg-opacity-90">
        <div className="flex items-center gap-6">
          <Link href="/cases" className="text-sm font-semibold tracking-[0.18em] uppercase font-mono text-ink hover:text-copper transition-colors">
            DATATRACE
          </Link>

          {currentCaseId && (
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-muted-ink">/</span>
              <span className="font-semibold px-2 py-0.5 bg-paper-2 rounded border border-hairline">
                {caseDisplayId || currentCaseId.slice(0, 8)}
              </span>
            </div>
          )}
        </div>

        {currentCaseId && (
          <nav className="flex items-center gap-1 text-[11px] uppercase tracking-[0.12em] font-mono">
            <Link
              href={`/cases/${currentCaseId}`}
              className="px-3 py-1.5 rounded hover:bg-paper-2 text-muted-ink hover:text-ink transition-colors"
            >
              Overview
            </Link>
            <Link
              href={`/cases/${currentCaseId}/evidence`}
              className="px-3 py-1.5 rounded hover:bg-paper-2 text-muted-ink hover:text-ink transition-colors"
            >
              Evidence
            </Link>
            <Link
              href={`/cases/${currentCaseId}/findings`}
              className="px-3 py-1.5 rounded hover:bg-paper-2 text-muted-ink hover:text-ink transition-colors"
            >
              Findings
            </Link>
            <Link
              href={`/cases/${currentCaseId}/matrix`}
              className="px-3 py-1.5 rounded hover:bg-paper-2 text-muted-ink hover:text-ink transition-colors"
            >
              Matrix
            </Link>
            <Link
              href={`/cases/${currentCaseId}/report`}
              className="px-3 py-1.5 rounded hover:bg-paper-2 text-muted-ink hover:text-ink transition-colors"
            >
              Report
            </Link>
            <Link
              href={`/cases/${currentCaseId}/audit`}
              className="px-3 py-1.5 rounded hover:bg-paper-2 text-muted-ink hover:text-ink transition-colors"
            >
              Audit
            </Link>
          </nav>
        )}

        <div className="flex items-center gap-3">
          <Link
            href="/auth"
            className="text-[11px] uppercase tracking-[0.12em] font-mono text-muted-ink hover:text-ink px-2 py-1 rounded"
          >
            Account
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
