import Link from 'next/link';
import { DisclaimerFooter } from '../components/DisclaimerFooter';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-night text-on-night selection:bg-amber/30 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-white/10 px-8 py-5 flex items-center justify-between sticky top-0 z-30 bg-night/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-sm font-semibold tracking-[0.2em] uppercase font-mono text-white hover:text-amber transition-colors"
          >
            DATATRACE
          </Link>
          <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest hidden sm:inline-block border-l border-white/20 pl-3">
            Evidence-Centred Rights Engine
          </span>
        </div>

        <nav className="flex items-center gap-4 text-xs font-mono uppercase tracking-wider">
          <Link
            href="/auth"
            className="text-white/60 hover:text-white transition-colors px-2 py-1"
          >
            Sign In
          </Link>
          <Link
            href="/cases"
            className="bg-amber/90 text-night font-semibold px-4 py-2 rounded-sm hover:bg-amber transition-colors shadow-sm"
          >
            Open a Case →
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-24 pb-32 px-6 flex flex-col items-center text-center">
        {/* Layered CSS Strata Gradient Background */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-40 -z-10"
          style={{
            background:
              'radial-gradient(circle at 50% 20%, rgba(217, 138, 78, 0.25) 0%, rgba(181, 86, 47, 0.15) 35%, rgba(110, 59, 42, 0.08) 65%, transparent 80%)',
          }}
        />

        {/* Cinematic Strata Bands */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-48 pointer-events-none -z-10 flex flex-col justify-end opacity-20"
        >
          <div className="h-6 w-full bg-gradient-to-r from-amber/20 via-copper/30 to-umber/20 blur-sm transform -skew-y-1" />
          <div className="h-10 w-full bg-gradient-to-r from-copper/20 via-umber/30 to-amber/20 blur-md transform skew-y-1" />
          <div className="h-14 w-full bg-gradient-to-r from-umber/30 via-night to-copper/30 blur-lg" />
        </div>

        <div className="max-w-4xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber/30 bg-amber/10 text-amber text-xs font-mono tracking-widest uppercase">
            <span>◈</span>
            <span>Deterministic Privacy Verification</span>
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-serif font-normal text-white tracking-tight leading-[1.1]">
            Evidence, <span className="italic font-normal text-amber">one layer</span> at a time.
          </h1>

          <p className="text-sm sm:text-base md:text-lg font-sans text-white/70 max-w-2xl mx-auto leading-relaxed font-light">
            When corporate GDPR, CCPA, and data-rights responses stall, deflect, or contradict,
            DataTrace preserves original evidence records, extracts verifiable claims, and grounds formal action drafts.
          </p>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/cases"
              className="w-full sm:w-auto px-8 py-3.5 bg-white text-night font-mono text-xs uppercase tracking-widest font-semibold rounded-sm hover:bg-paper transition-colors shadow-lg"
            >
              Open a Case
            </Link>
            <a
              href="#verification-ladder"
              className="w-full sm:w-auto px-8 py-3.5 bg-white/5 border border-white/20 text-white font-mono text-xs uppercase tracking-widest rounded-sm hover:bg-white/10 hover:border-white/40 transition-colors"
            >
              See how it verifies ↓
            </a>
          </div>
        </div>
      </section>

      {/* The 4-Tier Verification Ladder */}
      <section
        id="verification-ladder"
        className="py-24 px-6 border-t border-white/10 bg-night-2"
      >
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-16 space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-amber">
              The Architecture of Trust
            </span>
            <h2 className="text-3xl sm:text-4xl font-serif text-white">
              The Verification Ladder
            </h2>
            <p className="text-xs font-sans text-white/60 leading-relaxed">
              AI proposes candidates. Code deterministically verifies citations. The human decides what action to take.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Step 1: Raw Evidence */}
            <div className="bg-night border border-white/10 p-6 rounded-sm relative flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-white/40 mb-3 border-b border-white/10 pb-2">
                  <span>LAYER 01</span>
                  <span>PRESERVATION</span>
                </div>
                <h3 className="text-lg font-serif text-white mb-2">Raw Evidence</h3>
                <p className="text-xs font-sans text-white/60 leading-relaxed">
                  RFC-822 emails, documents, and logs are hashed (SHA-256) upon arrival. Original bytes remain cryptographically untouched in private storage.
                </p>
              </div>
              <div className="pt-4 mt-6 border-t border-white/5 text-[10px] font-mono text-amber">
                ✓ SHA-256 Immutability
              </div>
            </div>

            {/* Step 2: Candidate Extractions */}
            <div className="bg-night border border-white/10 p-6 rounded-sm relative flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-white/40 mb-3 border-b border-white/10 pb-2">
                  <span>LAYER 02</span>
                  <span>AI PROPOSAL</span>
                </div>
                <h3 className="text-lg font-serif text-white mb-2">Candidate Claims</h3>
                <p className="text-xs font-sans text-white/60 leading-relaxed">
                  Under strict user consent, open-weights models extract privacy claims, dates, and entities. Each candidate receives a labeled model confidence score.
                </p>
              </div>
              <div className="pt-4 mt-6 border-t border-white/5 text-[10px] font-mono text-amber">
                ◈ Zero-leakage Scopes
              </div>
            </div>

            {/* Step 3: Verified Findings */}
            <div className="bg-night border border-white/10 p-6 rounded-sm relative flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-white/40 mb-3 border-b border-white/10 pb-2">
                  <span>LAYER 03</span>
                  <span>DETERMINISM</span>
                </div>
                <h3 className="text-lg font-serif text-white mb-2">Verified Findings</h3>
                <p className="text-xs font-sans text-white/60 leading-relaxed">
                  Deterministic rules evaluate exact segment citations. Orthogonal badges display evidence basis (DIR/OBS/INF) separately from verification state (VERIFIED).
                </p>
              </div>
              <div className="pt-4 mt-6 border-t border-white/5 text-[10px] font-mono text-green-400">
                ✓ Citation Integrity
              </div>
            </div>

            {/* Step 4: Grounded Report */}
            <div className="bg-night border border-white/10 p-6 rounded-sm relative flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-white/40 mb-3 border-b border-white/10 pb-2">
                  <span>LAYER 04</span>
                  <span>ACTION</span>
                </div>
                <h3 className="text-lg font-serif text-white mb-2">Grounded Report</h3>
                <p className="text-xs font-sans text-white/60 leading-relaxed">
                  The action report editor grounds formal assertions to verified finding tokens. Fail-closed validation blocks export if unverified claims exist.
                </p>
              </div>
              <div className="pt-4 mt-6 border-t border-white/5 text-[10px] font-mono text-teal-400">
                ✓ Fail-Closed Grounding
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Principles Grid */}
      <section className="py-20 px-6 border-t border-white/10 bg-night">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="text-amber font-mono text-sm mb-2">01 / REQUEST MATRIX</div>
            <h4 className="text-base font-serif text-white mb-2">
              Request-Response Correlation
            </h4>
            <p className="text-xs font-sans text-white/60 leading-relaxed">
              Evaluates corporate replies against user data requests. Unanswered requests are strictly recorded with verified audit timestamps.
            </p>
          </div>

          <div>
            <div className="text-amber font-mono text-sm mb-2">02 / CONTRADICTION ENGINE</div>
            <h4 className="text-base font-serif text-white mb-2">
              Side-by-Side Review
            </h4>
            <p className="text-xs font-sans text-white/60 leading-relaxed">
              When an organization makes conflicting statements across multiple emails, DataTrace highlights both passages side-by-side with original citations.
            </p>
          </div>

          <div>
            <div className="text-amber font-mono text-sm mb-2">03 / AUDIT CHAIN</div>
            <h4 className="text-base font-serif text-white mb-2">
              Immutable Case Ledger
            </h4>
            <p className="text-xs font-sans text-white/60 leading-relaxed">
              Every upload, verification, viewing, and export operation appends to a hash-chained ledger, proving evidence tampering has not occurred.
            </p>
          </div>
        </div>

        <div className="text-center mt-16">
          <Link
            href="/cases"
            className="inline-block px-8 py-3 bg-amber text-night font-mono text-xs uppercase tracking-widest font-semibold rounded-sm hover:bg-opacity-90 transition-colors shadow-md"
          >
            Open DataTrace Registry →
          </Link>
        </div>
      </section>

      {/* Legal Disclaimer Footer */}
      <div className="border-t border-white/10 bg-night-2">
        <DisclaimerFooter />
      </div>
    </div>
  );
}
