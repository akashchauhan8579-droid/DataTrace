'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DisclaimerFooter } from '../components/DisclaimerFooter';

export default function LandingPage() {
  // Interactive Live Workbench Demo State (Avoids Trope 18: "no real product demos")
  const [activeTab, setActiveTab] = useState<'evidence' | 'candidate' | 'verification' | 'report'>('evidence');
  const [simulateUngrounded, setSimulateUngrounded] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink selection:bg-amber/25 selection:text-ink font-sans">
      {/* Top Archival Header */}
      <header className="border-b border-hairline px-6 py-4 flex items-center justify-between sticky top-0 z-40 bg-paper/95 backdrop-blur-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-semibold tracking-[0.2em] uppercase font-mono text-ink hover:text-copper transition-colors group"
          >
            <span className="w-2 h-2 rounded-full bg-amber inline-block group-hover:scale-125 transition-transform" />
            <span>DATATRACE</span>
          </Link>
          <span className="text-[10px] font-mono text-muted-ink uppercase tracking-widest hidden sm:inline-block border-l border-hairline pl-3">
            Evidence-Centred Rights Engine · Master Spec v1.4.2
          </span>
        </div>

        <nav className="flex items-center gap-5 text-xs font-mono uppercase tracking-wider">
          <a href="#workbench" className="hidden md:inline-block text-muted-ink hover:text-ink transition-colors">
            Forensic Workbench
          </a>
          <a href="#ladder" className="hidden md:inline-block text-muted-ink hover:text-ink transition-colors">
            Verification Ladder
          </a>
          <a href="#manifesto" className="hidden md:inline-block text-muted-ink hover:text-ink transition-colors">
            Axioms
          </a>
          <Link
            href="/auth"
            className="text-muted-ink hover:text-ink px-2 py-1 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/cases"
            className="bg-copper text-paper font-semibold px-4 py-2 rounded-sm hover:bg-umber transition-colors shadow-xs"
          >
            Case Registry →
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="pt-16 pb-20 px-6 border-b border-hairline bg-paper">
        <div className="max-w-6xl mx-auto">
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-sm border border-hairline bg-paper-2 text-ink text-[11px] font-mono tracking-widest uppercase mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-copper" />
            <span>Deterministic Privacy Verification</span>
            <span className="text-muted-ink">·</span>
            <span className="text-muted-ink">RFC-822 / PDF / Storage Invariants</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            {/* Left Hero Narrative */}
            <div className="lg:col-span-6 space-y-6">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif font-normal text-ink tracking-tight leading-[1.08]">
                Evidence, <br />
                <span className="italic text-copper">one layer</span> at a time.
              </h1>

              <p className="text-base sm:text-lg font-sans text-muted-ink leading-relaxed font-normal max-w-xl">
                When corporate data-rights responses stall, deflect, or contradict, DataTrace preserves original records unmodified, deterministically verifies findings against exact text segments, and grounds actionable complaint drafts.
              </p>

              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <Link
                  href="/cases"
                  className="px-7 py-3.5 bg-ink text-paper font-mono text-xs uppercase tracking-widest font-semibold rounded-sm hover:bg-neutral-800 transition-colors text-center shadow-xs"
                >
                  Open Case Registry →
                </Link>
                <a
                  href="#workbench"
                  className="px-7 py-3.5 bg-paper-2 border border-hairline text-ink font-mono text-xs uppercase tracking-widest rounded-sm hover:border-ink/50 transition-colors text-center"
                >
                  Inspect Live Workbench ↓
                </a>
              </div>

              {/* Axiomatic summary chips */}
              <div className="pt-6 border-t border-hairline flex flex-wrap gap-x-6 gap-y-2 text-[11px] font-mono text-muted-ink">
                <span>[01] Preserved Original Bytes</span>
                <span>[02] Orthogonal Basis & State</span>
                <span>[03] Fail-Closed Grounding</span>
              </div>
            </div>

            {/* Right Hero Centerpiece: Live Interactive Forensic Workbench (Avoids Trope 18) */}
            <div id="workbench" className="lg:col-span-6">
              <div className="bg-paper-2 border border-hairline rounded-sm overflow-hidden shadow-xs">
                {/* Workbench Title Bar */}
                <div className="bg-paper border-b border-hairline px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 bg-paper-2 rounded border border-hairline text-ink">
                      CASE-101
                    </span>
                    <span className="text-xs font-mono text-ink font-medium">Acme Corp Deletion Dispute</span>
                  </div>
                  <span className="text-[9px] font-mono uppercase tracking-wider text-green-800 bg-green-50 border border-green-300 px-1.5 py-0.5 rounded-sm">
                    Live Demo Flow
                  </span>
                </div>

                {/* Workbench Stage Tabs */}
                <div className="flex border-b border-hairline bg-paper-2/80 text-[10px] font-mono uppercase tracking-wider">
                  <button
                    onClick={() => setActiveTab('evidence')}
                    className={`flex-1 py-2 px-3 text-center border-r border-hairline transition-colors ${
                      activeTab === 'evidence'
                        ? 'bg-paper text-copper font-semibold border-b-2 border-b-copper'
                        : 'text-muted-ink hover:text-ink'
                    }`}
                  >
                    1. Ingestion
                  </button>
                  <button
                    onClick={() => setActiveTab('candidate')}
                    className={`flex-1 py-2 px-3 text-center border-r border-hairline transition-colors ${
                      activeTab === 'candidate'
                        ? 'bg-paper text-amber font-semibold border-b-2 border-b-amber'
                        : 'text-muted-ink hover:text-ink'
                    }`}
                  >
                    2. Proposal
                  </button>
                  <button
                    onClick={() => setActiveTab('verification')}
                    className={`flex-1 py-2 px-3 text-center border-r border-hairline transition-colors ${
                      activeTab === 'verification'
                        ? 'bg-paper text-green-800 font-semibold border-b-2 border-b-green-700'
                        : 'text-muted-ink hover:text-ink'
                    }`}
                  >
                    3. Rule Verify
                  </button>
                  <button
                    onClick={() => setActiveTab('report')}
                    className={`flex-1 py-2 px-3 text-center transition-colors ${
                      activeTab === 'report'
                        ? 'bg-paper text-ink font-semibold border-b-2 border-b-ink'
                        : 'text-muted-ink hover:text-ink'
                    }`}
                  >
                    4. Report
                  </button>
                </div>

                {/* Workbench Interactive Body */}
                <div className="p-5 min-h-[300px] flex flex-col justify-between bg-paper">
                  {/* Step 1: Ingestion View */}
                  {activeTab === 'evidence' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[11px] font-mono text-muted-ink border-b border-hairline/60 pb-2">
                        <span>Original: <strong className="text-ink">01-initial-erasure-request.eml</strong></span>
                        <span className="text-green-800 bg-green-50 px-1 rounded border border-green-200">SHA-256 SEALED</span>
                      </div>
                      <div className="text-[10px] font-mono text-muted-ink space-y-0.5 bg-paper-2 p-2.5 rounded-sm border border-hairline">
                        <div>From: privacy-user@personal.example</div>
                        <div>To: privacy-desk@acme.example</div>
                        <div>SHA-256: d4f89a1c6204b7e80129f1092a488e04b79c31327...</div>
                      </div>
                      <div className="p-3 bg-paper-2/60 border border-hairline rounded-sm">
                        <span className="text-[9px] font-mono text-muted-ink block mb-1">SEGMENT #01 [PAGE 1, CHARS 0–94]</span>
                        <p className="text-xs font-serif text-ink italic leading-relaxed">
                          "I hereby request the immediate deletion of all personal data and associated accounts held by Acme Corp under GDPR Article 17."
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Step 2: AI Candidate Proposal */}
                  {activeTab === 'candidate' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[11px] font-mono text-muted-ink border-b border-hairline/60 pb-2">
                        <span>Extraction Task: <strong className="text-ink">extraction.v1</strong></span>
                        <span className="text-amber bg-amber/10 px-1 rounded border border-amber/30">AI_INFERRED</span>
                      </div>
                      <div className="p-3 bg-paper-2 border border-amber/30 rounded-sm space-y-2">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="font-semibold text-ink">CANDIDATE PROPOSAL: FND-201</span>
                          <span className="text-muted-ink">Model Confidence: 95%</span>
                        </div>
                        <p className="text-xs font-sans text-ink leading-relaxed">
                          User requested erasure of all personal data from Acme Corp.
                        </p>
                        <div className="pt-2 border-t border-hairline/60 flex items-center justify-between text-[10px] font-mono text-muted-ink">
                          <span>Target: EV-101 #01</span>
                          <span className="text-copper">Normalized: [USER, deletes_data, personal data]</span>
                        </div>
                      </div>
                      <p className="text-[11px] font-sans text-muted-ink italic">
                        Notice: AI confidence is not verification. Candidate remains unverified until deterministic rules evaluate citations.
                      </p>
                    </div>
                  )}

                  {/* Step 3: Deterministic Rule Verification */}
                  {activeTab === 'verification' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[11px] font-mono text-muted-ink border-b border-hairline/60 pb-2">
                        <span>Rule: <strong className="text-ink">claim_verification.v1</strong></span>
                        <span className="text-green-800 bg-green-50 px-1 rounded border border-green-300">PASS (PROMOTED)</span>
                      </div>
                      <div className="p-3 bg-paper-2 border border-hairline rounded-sm space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded border border-ink/20 text-[10px] font-mono font-medium text-muted-ink uppercase bg-transparent">
                            DIR
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-mono font-medium bg-green-50 text-green-800 border-green-400">
                            ✓ Verified
                          </span>
                        </div>
                        <p className="text-xs font-sans text-ink leading-relaxed">
                          "I hereby request the immediate deletion of all personal data..."
                        </p>
                        <div className="text-[10px] font-mono text-green-900 bg-green-50/60 p-2 rounded border border-green-200">
                          <div>Predicate cue matched: "deletion of all personal data"</div>
                          <div>Object anchor confirmed: 100% token overlap</div>
                          <div>Hedge check: No future or non-committal tokens detected</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 4: Grounded Report */}
                  {activeTab === 'report' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[11px] font-mono text-muted-ink border-b border-hairline/60 pb-2">
                        <span>Report Lens: <strong className="text-ink">COMPLAINT DRAFT</strong></span>
                        <span className={simulateUngrounded ? 'text-red-700 bg-red-50 border border-red-200 px-1 rounded' : 'text-green-800 bg-green-50 border border-green-200 px-1 rounded'}>
                          {simulateUngrounded ? 'EXPORT BLOCKED' : 'GROUNDED'}
                        </span>
                      </div>

                      <div className={`p-3 rounded-sm border transition-colors ${simulateUngrounded ? 'bg-red-50/50 border-red-300' : 'bg-paper-2 border-hairline'}`}>
                        <div className="text-[10px] font-mono uppercase text-muted-ink mb-1">Formal Assertion</div>
                        <p className="text-xs font-sans text-ink leading-relaxed">
                          The Data Subject submitted an unequivocal request for erasure under GDPR Article 17 on 2024-03-01.
                        </p>
                        {!simulateUngrounded && (
                          <div className="mt-2 pt-2 border-t border-hairline/60 text-[10px] font-mono text-copper">
                            Grounded to Finding: [FND-201] · Citation: [EV-101 #01]
                          </div>
                        )}
                        {simulateUngrounded && (
                          <div className="mt-2 pt-2 border-t border-red-200 text-[10px] font-mono text-red-700 font-semibold">
                            FAIL-CLOSED: Unverified assertion has no backing finding token. Export refused.
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <button
                          onClick={() => setSimulateUngrounded(!simulateUngrounded)}
                          className="text-[10px] font-mono text-muted-ink hover:text-ink underline"
                        >
                          {simulateUngrounded ? 'Reset Grounding' : 'Simulate Hallucinated / Ungrounded Assertion'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step Control Buttons */}
                  <div className="pt-4 border-t border-hairline flex items-center justify-between text-xs font-mono">
                    <span className="text-[10px] text-muted-ink">Step {activeTab === 'evidence' ? '1' : activeTab === 'candidate' ? '2' : activeTab === 'verification' ? '3' : '4'} of 4</span>
                    <button
                      onClick={() => {
                        if (activeTab === 'evidence') setActiveTab('candidate');
                        else if (activeTab === 'candidate') setActiveTab('verification');
                        else if (activeTab === 'verification') setActiveTab('report');
                        else setActiveTab('evidence');
                      }}
                      className="px-3 py-1 bg-ink text-paper rounded-sm hover:bg-neutral-800 transition-colors uppercase text-[10px] tracking-wider"
                    >
                      Next Step →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Epistemic Manifesto Section (Spec §1.5) */}
      <section id="manifesto" className="py-20 px-6 border-b border-hairline bg-paper-2">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl mb-12">
            <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-copper block mb-2">
              The Architecture of Truth
            </span>
            <h2 className="text-3xl sm:text-4xl font-serif text-ink leading-tight">
              AI proposes. Evidence supports. Deterministic logic verifies. DataTrace explains. The user decides.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* The Failure of Unconstrained LLMs */}
            <div className="bg-paper border border-hairline p-6 rounded-sm space-y-4">
              <div className="flex items-center justify-between text-xs font-mono text-muted-ink border-b border-hairline pb-2">
                <span>CONVENTIONAL AI TOOLS</span>
                <span className="text-red-700 bg-red-50 border border-red-200 px-1 rounded text-[10px]">UNRELIABLE</span>
              </div>
              <h3 className="text-xl font-serif text-ink">Treating Hypotheses as Facts</h3>
              <p className="text-xs font-sans text-muted-ink leading-relaxed">
                Generic language models invent quotes, state legal compliance conclusions without checking rules, and silently turn ambiguity into false certainty. They produce allegations they cannot substantiate in formal dispute.
              </p>
              <div className="space-y-1.5 text-xs font-mono text-muted-ink pt-2 border-t border-hairline">
                <div>✕ Confuses AI confidence with proof</div>
                <div>✕ Fabricates citation references</div>
                <div>✕ Cannot provide cryptographic integrity</div>
              </div>
            </div>

            {/* The DataTrace Protocol */}
            <div className="bg-paper border border-hairline p-6 rounded-sm space-y-4">
              <div className="flex items-center justify-between text-xs font-mono text-muted-ink border-b border-hairline pb-2">
                <span>THE DATATRACE STANDARD</span>
                <span className="text-green-800 bg-green-50 border border-green-200 px-1 rounded text-[10px]">DETERMINISTIC</span>
              </div>
              <h3 className="text-xl font-serif text-ink">Orthogonal Evidence & Logic</h3>
              <p className="text-xs font-sans text-muted-ink leading-relaxed">
                DataTrace treats the model strictly as a proposal generator. State transitions (UNVERIFIED → AI_INFERRED → CORROBORATED → VERIFIED → CONTRADICTED) are executed exclusively by pure TypeScript rules evaluating preserved evidence bytes.
              </p>
              <div className="space-y-1.5 text-xs font-mono text-green-900 pt-2 border-t border-hairline">
                <div>✓ Original evidence bytes preserved via SHA-256</div>
                <div>✓ Model citations resolved from human display IDs</div>
                <div>✓ Fail-closed grounding blocks unbacked claims</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The 4-Tier Epistemic Ladder Section (Spec §1.5) */}
      <section id="ladder" className="py-20 px-6 border-b border-hairline bg-paper">
        <div className="max-w-6xl mx-auto space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-hairline pb-4">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-copper block mb-1">
                Forensic Methodology
              </span>
              <h2 className="text-3xl font-serif text-ink">The 4-Tier Epistemic Ladder</h2>
            </div>
            <p className="text-xs font-mono text-muted-ink max-w-md">
              Every assertion in a DataTrace case record must ascend through distinct verification gates before entering a complaint.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Tier 1 */}
            <div className="bg-paper-2 border border-hairline p-5 rounded-sm flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-muted-ink border-b border-hairline pb-1">
                  <span>TIER 01</span>
                  <span>PRESERVED ORIGINAL</span>
                </div>
                <h3 className="text-base font-serif text-ink">Raw Evidence</h3>
                <p className="text-xs font-sans text-muted-ink leading-relaxed">
                  RFC-822 emails, text-PDFs, and manual notes are buffered, hashed with SHA-256, and sealed in private case storage. Original bytes are never modified.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-hairline text-[10px] font-mono text-ink">
                Invariant: Byte-Identical Hashing
              </div>
            </div>

            {/* Tier 2 */}
            <div className="bg-paper-2 border border-hairline p-5 rounded-sm flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-muted-ink border-b border-hairline pb-1">
                  <span>TIER 02</span>
                  <span>AI PROPOSAL</span>
                </div>
                <h3 className="text-base font-serif text-ink">Candidate Extractions</h3>
                <p className="text-xs font-sans text-muted-ink leading-relaxed">
                  Under strict user consent and privacy minimization, models propose claims, entities, and events citing human-readable display IDs (EV-101 #03).
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-hairline text-[10px] font-mono text-amber">
                State: AI_INFERRED
              </div>
            </div>

            {/* Tier 3 */}
            <div className="bg-paper-2 border border-hairline p-5 rounded-sm flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-muted-ink border-b border-hairline pb-1">
                  <span>TIER 03</span>
                  <span>DETERMINISM</span>
                </div>
                <h3 className="text-base font-serif text-ink">Deterministic Rules</h3>
                <p className="text-xs font-sans text-muted-ink leading-relaxed">
                  Pure code rules check citation validity, exact quote substrings, object/subject anchors, and hedge words. Only DIRECT claims reach VERIFIED.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-hairline text-[10px] font-mono text-green-800">
                State: VERIFIED / CONTRADICTED
              </div>
            </div>

            {/* Tier 4 */}
            <div className="bg-paper-2 border border-hairline p-5 rounded-sm flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-muted-ink border-b border-hairline pb-1">
                  <span>TIER 04</span>
                  <span>ACTION</span>
                </div>
                <h3 className="text-base font-serif text-ink">Grounded Action Report</h3>
                <p className="text-xs font-sans text-muted-ink leading-relaxed">
                  The complaint draft links assertions to verified findings. Fail-closed grounding prevents unbacked assertions from being exported.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-hairline text-[10px] font-mono text-copper">
                Integrity: Fail-Closed Export
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Forensic Capabilities Section (Spec §13 & §14) */}
      <section className="py-20 px-6 border-b border-hairline bg-paper-2">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-copper">
              Core Capabilities
            </span>
            <h2 className="text-3xl font-serif text-ink">
              Structured Tools for Data-Rights Disputes
            </h2>
            <p className="text-xs font-sans text-muted-ink">
              Designed specifically for individuals and compliance advocates navigating stall tactics, evasions, and contradictions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Capability 1: Request-Response Matrix */}
            <div className="bg-paper border border-hairline p-6 rounded-sm space-y-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-ink">01 / CORRELATION</div>
              <h3 className="text-xl font-serif text-ink">Request-Response Matrix</h3>
              <p className="text-xs font-sans text-muted-ink leading-relaxed">
                Automatically maps each data-access or deletion demand to corporate replies. Unanswered requests are explicitly designated with verified timestamps and the spec-mandated standard phrasing:
              </p>
              <div className="p-3 bg-paper-2 border border-hairline rounded-sm text-xs font-mono text-red-700">
                "No response found in case record"
              </div>
              <p className="text-[11px] font-mono text-muted-ink pt-1">
                Evaluates coverage: FULL, PARTIAL, DEFLECTED, or UNCLEAR. Flags chronologically impossible responses.
              </p>
            </div>

            {/* Capability 2: Bilateral Contradiction Engine */}
            <div className="bg-paper border border-hairline p-6 rounded-sm space-y-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-ink">02 / DETECTION</div>
              <h3 className="text-xl font-serif text-ink">Bilateral Contradiction Engine</h3>
              <p className="text-xs font-sans text-muted-ink leading-relaxed">
                When an organization provides conflicting claims across separate emails (e.g. stating data was deleted, then later claiming retention), DataTrace displays both verified passages side-by-side with original citations:
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono p-2 bg-paper-2 border border-hairline rounded-sm">
                <div className="border-r border-hairline pr-2 text-ink">
                  <span className="text-[9px] uppercase text-muted-ink block">Claim A (March)</span>
                  "All user data deleted."
                </div>
                <div className="pl-2 text-red-700">
                  <span className="text-[9px] uppercase text-muted-ink block">Claim B (April)</span>
                  "Account suspended; data retained."
                </div>
              </div>
              <p className="text-[11px] font-mono text-muted-ink pt-1">
                Mechanical contradictions resolve via normalized opposite polarity; ambiguous pairs require human confirmation.
              </p>
            </div>
          </div>

          {/* Capability 3: Tamper-Evident Audit Ledger Banner */}
          <div className="bg-paper border border-hairline p-6 rounded-sm flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1 max-w-2xl">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-ink">03 / PROVENANCE</span>
              <h3 className="text-xl font-serif text-ink">Cryptographic Hash-Chained Audit Ledger</h3>
              <p className="text-xs font-sans text-muted-ink leading-relaxed">
                Every file upload, extraction, state transition, and report export appends to a gap-free PostgreSQL hash chain. Tampering with any historical row breaks the cryptographic chain head.
              </p>
            </div>
            <Link
              href="/cases"
              className="px-6 py-3 bg-ink text-paper font-mono text-xs uppercase tracking-wider rounded-sm hover:bg-neutral-800 transition-colors whitespace-nowrap"
            >
              Open Active Case Registry →
            </Link>
          </div>
        </div>
      </section>

      {/* Disclaimer and Protocols Footer */}
      <DisclaimerFooter />
    </div>
  );
}
