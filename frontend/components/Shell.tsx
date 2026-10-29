'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface ShellProps {
  currentCaseId?: string;
  caseDisplayId?: string;
  children: React.ReactNode;
}

export function Shell({ currentCaseId, caseDisplayId, children }: ShellProps) {
  const pathname = usePathname();

  // ── Sliding indicator state ──────────────────────────────────────────────
  const [indicator, setIndicator] = useState<{ left: number; width: number; ready: boolean }>(
    { left: 0, width: 0, ready: false }
  );
  const containerRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const hasMounted = useRef(false);

  const navItems = currentCaseId
    ? [
        { label: 'Overview', href: `/cases/${currentCaseId}` },
        { label: 'Evidence', href: `/cases/${currentCaseId}/evidence` },
        { label: 'Findings', href: `/cases/${currentCaseId}/findings` },
        { label: 'Timeline', href: `/cases/${currentCaseId}/timeline` },
        { label: 'Graph', href: `/cases/${currentCaseId}/graph` },
        { label: 'Matrix', href: `/cases/${currentCaseId}/matrix` },
        { label: 'Report', href: `/cases/${currentCaseId}/report` },
        { label: 'Audit Ledger', href: `/cases/${currentCaseId}/audit` },
      ]
    : [];

  // Update indicator position when pathname or caseId changes
  useEffect(() => {
    if (!currentCaseId) return;
    const update = () => {
      const activeItem = navItems.find((item) =>
        item.href === `/cases/${currentCaseId}`
          ? pathname === item.href
          : pathname.startsWith(item.href)
      );
      if (!activeItem) { setIndicator((p) => ({ ...p, ready: false })); return; }
      const el = tabRefs.current.get(activeItem.href);
      const nav = containerRef.current;
      if (el && nav) {
        setIndicator({ left: el.offsetLeft, width: el.offsetWidth, ready: true });
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, currentCaseId]);

  // Mark mounted after first indicator paint (prevents slide-in on load)
  useEffect(() => {
    if (indicator.ready) {
      const id = requestAnimationFrame(() => { hasMounted.current = true; });
      return () => cancelAnimationFrame(id);
    }
  }, [indicator.ready]);

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink selection:bg-amber/25 selection:text-ink">
      <header className="border-b border-hairline px-6 py-3.5 flex items-center justify-between bg-paper sticky top-0 z-30">
        <div className="flex items-center gap-5">
          <Link
            href="/cases"
            className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] uppercase font-mono text-ink hover:text-copper transition-colors group"
          >
            <span className="w-2 h-2 rounded-full bg-amber inline-block group-hover:scale-110 transition-transform" />
            <span>DATATRACE</span>
          </Link>

          {currentCaseId && (
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-muted-ink/50">/</span>
              <span className="font-semibold px-2 py-0.5 bg-paper-2 rounded border border-hairline text-ink">
                {caseDisplayId || currentCaseId.slice(0, 8)}
              </span>
            </div>
          )}
        </div>

        {currentCaseId && (
          <nav
            ref={containerRef as React.RefObject<HTMLElement>}
            className="hidden md:flex items-center gap-1 text-[11px] uppercase tracking-[0.12em] font-mono relative"
          >
            {/* Sliding indicator pill */}
            {indicator.ready && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: indicator.left,
                  width: indicator.width,
                  height: '100%',
                  borderRadius: '2px',
                  pointerEvents: 'none',
                  zIndex: 0,
                  transition: hasMounted.current
                    ? 'left 300ms cubic-bezier(0.4,0,0.2,1), width 300ms cubic-bezier(0.4,0,0.2,1)'
                    : 'none',
                  // @ts-ignore — CSS custom props
                  '--tw-bg-opacity': '1',
                }}
                className="bg-paper-2 border-b-2 border-copper [@media(prefers-reduced-motion:reduce)]:transition-none"
              />
            )}

            {navItems.map((item) => {
              const isActive =
                item.href === `/cases/${currentCaseId}`
                  ? pathname === item.href
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  ref={(el) => {
                    if (el) tabRefs.current.set(item.href, el);
                    else tabRefs.current.delete(item.href);
                  }}
                  className={`relative z-10 px-3 py-1.5 rounded-sm
                    transition-[color,background-color,opacity] duration-200 ease-out
                    active:scale-[0.97] active:transition-transform active:duration-100
                    focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-copper/50
                    [@media(prefers-reduced-motion:reduce)]:transition-none
                    ${
                      isActive
                        ? 'text-ink font-semibold'
                        : 'text-muted-ink hover:text-ink hover:bg-paper-2/50'
                    }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="hidden sm:flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-ink">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-700" />
            <span>RLS Active</span>
          </div>

          <Link
            href="/account"
            className={`text-[11px] uppercase tracking-[0.14em] font-mono px-2.5 py-1 rounded-sm border transition-colors ${
              pathname.startsWith('/account')
                ? 'text-ink border-copper bg-paper-2'
                : 'text-muted-ink hover:text-ink border-hairline hover:border-ink/40 bg-paper-2/50'
            }`}
          >
            Account
          </Link>

          <Link
            href="/auth"
            className="text-[11px] uppercase tracking-[0.14em] font-mono text-muted-ink hover:text-ink px-2.5 py-1 rounded-sm border border-hairline hover:border-ink/40 transition-colors bg-paper-2/50"
          >
            Session
          </Link>
        </div>
      </header>

      {/* Mobile nav for cases */}
      {currentCaseId && (
        <div className="md:hidden border-b border-hairline bg-paper-2 px-4 py-2 flex items-center gap-2 overflow-x-auto text-[10px] font-mono uppercase tracking-wider">
          {navItems.map((item) => {
            const isActive =
              item.href === `/cases/${currentCaseId}`
                ? pathname === item.href
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-2.5 py-1 rounded-sm whitespace-nowrap ${
                  isActive ? 'bg-paper text-ink font-bold border-b border-copper' : 'text-muted-ink'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}

      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
