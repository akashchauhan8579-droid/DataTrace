'use client';

import React from 'react';

/**
 * AuroraHeroBackground
 *
 * Implements the Electric-Teal (#00A6A6) Aurora Borealis effect for the DataTrace landing hero:
 * 1. Broad, soft aurora ribbon entering from upper-right edge and flowing diagonally toward the workbench.
 * 2. Secondary subtle light curtain near the lower-left edge of the hero section.
 * 3. Soft atmospheric backlight glow centered behind the live verification workbench.
 * 4. Multi-layered translucent opacities, feathered curves, and slow organic animation (25–45s).
 * 5. Strict pointer-events: none and z-0 positioning to preserve 100% interactive integrity.
 */
export function AuroraHeroBackground() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden pointer-events-none z-0 select-none"
    >
      {/* ── Layer 1: Ambient Atmospheric Glow behind Workbench ── */}
      <div
        className="absolute -top-12 -right-16 sm:right-[2%] lg:right-[6%] top-[12%] w-[380px] sm:w-[540px] lg:w-[660px] h-[340px] sm:h-[460px] lg:h-[540px] rounded-full aurora-animate-backlight"
        style={{
          background:
            'radial-gradient(ellipse 65% 55% at 55% 48%, rgba(0, 166, 166, 0.22) 0%, rgba(0, 115, 115, 0.10) 42%, rgba(0, 166, 166, 0.03) 70%, transparent 85%)',
          filter: 'blur(55px)',
        }}
      />

      {/* ── Layer 2: Primary Upper-Right Flowing Aurora Curtain (SVG ribbon) ── */}
      <div className="absolute -top-24 right-0 w-[600px] sm:w-[850px] lg:w-[1050px] h-[550px] sm:h-[750px] lg:h-[900px] aurora-animate-upper opacity-90">
        <svg
          viewBox="0 0 1000 850"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
          style={{ filter: 'blur(45px)' }}
        >
          <defs>
            <linearGradient id="aurora-upper-primary" x1="100%" y1="0%" x2="20%" y2="85%">
              <stop offset="0%" stopColor="#00A6A6" stopOpacity="0.42" />
              <stop offset="35%" stopColor="#00A6A6" stopOpacity="0.30" />
              <stop offset="68%" stopColor="#007373" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#00A6A6" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* S-curved ribbon entering from top right and sweeping toward workbench */}
          <path
            d="M1050,-40 C920,80 840,240 720,380 C600,510 520,590 440,680 C490,720 590,660 710,540 C830,410 940,230 1080,40 Z"
            fill="url(#aurora-upper-primary)"
          />
        </svg>
      </div>

      {/* ── Layer 3: Secondary Upper-Right Curtain Fold (Depth & Interference) ── */}
      <div className="absolute -top-12 -right-12 w-[500px] sm:w-[720px] lg:w-[880px] h-[480px] sm:h-[680px] lg:h-[820px] aurora-animate-secondary opacity-80">
        <svg
          viewBox="0 0 900 800"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
          style={{ filter: 'blur(52px)' }}
        >
          <defs>
            <linearGradient id="aurora-upper-secondary" x1="95%" y1="5%" x2="25%" y2="95%">
              <stop offset="0%" stopColor="#00A6A6" stopOpacity="0.34" />
              <stop offset="42%" stopColor="#007373" stopOpacity="0.22" />
              <stop offset="78%" stopColor="#00A6A6" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#00A6A6" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Complementary ribbon offset slightly higher, creating true curtain folds */}
          <path
            d="M960,-80 C850,50 750,210 650,340 C540,460 560,520 480,630 C530,660 620,580 730,440 C850,310 930,130 1020,-10 Z"
            fill="url(#aurora-upper-secondary)"
          />
        </svg>
      </div>

      {/* ── Layer 4: Lower-Left Gentle Aurora Curtain ── */}
      <div className="absolute -bottom-20 -left-20 w-[420px] sm:w-[580px] lg:w-[700px] h-[360px] sm:h-[480px] lg:h-[580px] aurora-animate-left opacity-85">
        <svg
          viewBox="0 0 700 600"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
          style={{ filter: 'blur(50px)' }}
        >
          <defs>
            <linearGradient id="aurora-lower-left" x1="0%" y1="100%" x2="70%" y2="20%">
              <stop offset="0%" stopColor="#00A6A6" stopOpacity="0.32" />
              <stop offset="40%" stopColor="#007373" stopOpacity="0.18" />
              <stop offset="75%" stopColor="#00A6A6" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#00A6A6" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Gentle rising light curtain along lower left edge */}
          <path
            d="M-60,550 C60,460 160,490 240,580 C300,660 260,740 320,820 C220,840 120,770 40,690 C-40,620 -60,580 -60,550 Z"
            fill="url(#aurora-lower-left)"
          />
        </svg>
      </div>
    </div>
  );
}

/**
 * AuroraTransitionRibbon
 *
 * Sits along the section boundary between Hero and Epistemic Manifesto:
 * Creates visual continuity instead of leaving a harsh or empty ivory break.
 */
export function AuroraTransitionRibbon() {
  return (
    <div
      aria-hidden="true"
      className="absolute -bottom-16 left-0 right-0 h-32 overflow-hidden pointer-events-none z-0 select-none opacity-75"
    >
      <div className="w-[120%] -ml-[10%] h-full aurora-animate-transition">
        <svg
          viewBox="0 0 1440 140"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
          preserveAspectRatio="none"
          style={{ filter: 'blur(35px)' }}
        >
          <defs>
            <linearGradient id="aurora-trans-gradient" x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor="#00A6A6" stopOpacity="0" />
              <stop offset="25%" stopColor="#00A6A6" stopOpacity="0.18" />
              <stop offset="50%" stopColor="#007373" stopOpacity="0.24" />
              <stop offset="75%" stopColor="#00A6A6" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#00A6A6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,70 Q360,20 720,75 T1440,60 L1440,140 L0,140 Z"
            fill="url(#aurora-trans-gradient)"
          />
        </svg>
      </div>
    </div>
  );
}

/**
 * AuroraSectionFragment
 *
 * Used sparingly in lower sections (Manifesto, Capabilities) for subtle editorial continuity.
 */
export function AuroraSectionFragment({
  position = 'right',
}: {
  position?: 'left' | 'right';
}) {
  const isRight = position === 'right';

  return (
    <div
      aria-hidden="true"
      className={`absolute ${isRight ? '-right-16 top-1/4' : '-left-16 top-1/3'} w-[340px] sm:w-[460px] h-[300px] sm:h-[400px] overflow-hidden pointer-events-none z-0 select-none opacity-50 aurora-animate-fragment`}
    >
      <div
        className="w-full h-full rounded-full"
        style={{
          background: `radial-gradient(ellipse at ${isRight ? '70% 50%' : '30% 50%'}, rgba(0, 166, 166, 0.16) 0%, rgba(0, 115, 115, 0.07) 45%, transparent 75%)`,
          filter: 'blur(45px)',
        }}
      />
    </div>
  );
}

/**
 * AuroraWorkbenchGlow
 *
 * Casts a soft, faint electric-teal halo directly behind the forensic workbench panel.
 * Keeps the panel background, text, borders, and status labels crisp and legible.
 */
export function AuroraWorkbenchGlow() {
  return (
    <div
      aria-hidden="true"
      className="absolute -inset-4 sm:-inset-6 lg:-inset-8 rounded-xl pointer-events-none z-0 select-none aurora-animate-backlight"
      style={{
        background:
          'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(0, 166, 166, 0.20) 0%, rgba(0, 115, 115, 0.08) 45%, rgba(0, 166, 166, 0.02) 70%, transparent 85%)',
        filter: 'blur(38px)',
      }}
    />
  );
}
