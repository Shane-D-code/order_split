import type { SVGProps } from "react";

/**
 * Small original illustration language for Family Orders.
 * Hand-drawn strokes, flat warm fills, thick ink outlines.
 * Colours resolve through the design tokens (CSS variables) so the
 * same stickers stay cohesive in both schemes. These are lightweight
 * inline SVGs — no image requests, no bundles.
 */

const ink = "var(--fo-ink, #2a1c0e)";
const cream = "var(--fo-cream, #fff9ea)";
const surface2 = "var(--fo-surface-2, #fffdf5)";
const gold = "var(--fo-gold, #f2a71b)";
const sun = "var(--fo-sun, #ffc33c)";
const tint = "var(--fo-tint, #f7d88a)";
const tomato = "var(--fo-tomato, #ef4020)";
const teal = "var(--fo-teal, #118c74)";
const leaf = "var(--fo-leaf, #6fa23e)";

type Art = SVGProps<SVGSVGElement>;

export function Sparkle(props: Art) {
  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true" {...props}>
      <path
        d="M50 10c4 22 18 36 40 40-22 4-36 18-40 40-4-22-18-36-40-40 22-4 36-18 40-40Z"
        fill={tomato}
        stroke={ink}
        strokeWidth="5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Four-point star sticker; `color` overrides the fill. */
export function TinyStar({
  color = tomato,
  ...props
}: Art & { color?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true" {...props}>
      <path
        d="M50 12c3 21 17 35 38 38-21 3-35 17-38 38-3-21-17-35-38-38 21-3 35-17 38-38Z"
        fill={color}
        stroke={ink}
        strokeWidth="5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DotSpark(props: Art) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" {...props}>
      <circle cx="20" cy="20" r="9" fill={gold} stroke={ink} strokeWidth="4" />
      <path d="M20 0v7M20 33v7M0 20h7M33 20h7" stroke={ink} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Squiggle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 12" fill="none" className={className} aria-hidden="true" preserveAspectRatio="none">
      <path
        d="M3 9C25 2 41 11 61 6S99 2 117 8"
        stroke={tomato}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Three loose motion strokes used as speed/scan accents. */
export function SwooshLine(props: Art) {
  return (
    <svg viewBox="0 0 120 60" fill="none" aria-hidden="true" {...props}>
      <path d="M14 46C40 30 84 30 112 12" stroke={ink} strokeWidth="5" strokeLinecap="round" opacity="0.55" />
      <path d="M22 54C46 40 86 40 106 26" stroke={tomato} strokeWidth="4" strokeLinecap="round" opacity="0.4" />
      <path d="M30 14C56 22 74 12 92 4" stroke={teal} strokeWidth="4" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

export function SunBurst(props: Art) {
  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true" {...props}>
      <path
        d="M50 8 56 28 70 16 73 38 95 34 84 54 98 64 78 76 80 97 62 84 56 100 48 84 42 100 26 89 20 92 20 66 2 62 14 50 2 40 26 38 26 12 40 26 50 8Z"
        fill={gold}
        stroke={ink}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="50" r="9" fill={cream} stroke={ink} strokeWidth="4" />
    </svg>
  );
}

/** Half-orange fruit slice accent. */
export function OrangeSlice(props: Art) {
  return (
    <svg viewBox="0 0 80 80" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 68C4 48 10 22 30 12c26-12 42 6 34 30-6 18-22 28-52 26Z"
        fill={gold}
        stroke={ink}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path d="M16 62C22 48 34 32 52 24" stroke={ink} strokeWidth="4" strokeLinecap="round" opacity="0.45" />
      <path d="M24 66c6-10 16-20 28-26M34 72c6-4 16-10 24-14" stroke={ink} strokeWidth="3.5" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

/** Small leaf/cucumber accent. */
export function LeafDot(props: Art) {
  return (
    <svg viewBox="0 0 60 60" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 44C6 34 10 14 28 8c20-7 26 8 18 24-6 12-22 18-34 12Z"
        fill={leaf}
        stroke={ink}
        strokeWidth="4.5"
        strokeLinejoin="round"
      />
      <path d="M16 40C30 34 42 20 46 12" stroke={ink} strokeWidth="3.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

export function GroceryBag(props: Art) {
  return (
    <svg viewBox="0 0 124 124" fill="none" aria-hidden="true" {...props}>
      <path
        d="M32 42h56l-5 56c-1 9-7 14-16 14H53c-9 0-15-5-16-14l-5-56Z"
        fill={surface2}
        stroke={ink}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d="M46 42c0-14 6-24 16-24s16 10 16 24"
        stroke={ink}
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M44 60h32M44 74h32M44 88h22" stroke={ink} strokeWidth="4" strokeLinecap="round" opacity="0.4" />
      <path
        d="M66 96c1-7-5-10-10-8 0 0 7-9 12-6 6 2 2 14-2 14Z"
        fill={leaf}
        stroke={ink}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <circle cx="86" cy="52" r="6.5" fill={tomato} stroke={ink} strokeWidth="4" />
      <circle cx="34" cy="50" r="5.5" fill={teal} stroke={ink} strokeWidth="4" />
      <path
        d="M96 40c2-9 9-16 17-17M112 30c-9 1-16 8-17 17"
        stroke={tomato}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="M16 36c2-7 8-12 15-14M30 26c-7 2-13 7-15 14" stroke={teal} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Receipt(props: Art) {
  return (
    <svg viewBox="0 0 120 150" fill="none" aria-hidden="true" {...props}>
      <path
        d="M36 8h48c5 0 9 4 9 9v116l-9-5-8 5-8-5-9 5-9-5-9 5-8-5-9 5V17c0-5 4-9 9-9Z"
        fill={surface2}
        stroke={ink}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d="M46 30h28M46 44h28M46 58h28M46 72h18"
        stroke={ink}
        strokeWidth="4.5"
        strokeLinecap="round"
        opacity="0.35"
      />
      <path d="M60 96 72 108 92 88" stroke={leaf} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 34c-6-6-10-4-10-10M4 22c5-3 8-1 9 4 1 5-2 8-6 8" stroke={tomato} strokeWidth="4" strokeLinecap="round" />
      <path d="M112 66c2-8 8-12 12-12M122 60c-1 7-5 12-13 14" stroke={gold} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Basket(props: Art) {
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden="true" {...props}>
      <path d="M12 44h96l-8 54c-2 12-14 12-24 12l6-54" fill={tint} stroke={ink} strokeWidth="5" strokeLinejoin="round" />
      <path d="M32 48c0-16 10-28 28-28s28 12 28 28" stroke={ink} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path
        d="M40 78c6 0 6-9 12-9s6 9 12 9 6-9 12-9 4 9 8 9"
        stroke={ink}
        strokeWidth="4.5"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path d="M60 52 74 38M60 52 46 38" stroke={leaf} strokeWidth="5" strokeLinecap="round" />
      <circle cx="30" cy="66" r="7" fill={tomato} stroke={ink} strokeWidth="4" />
      <circle cx="90" cy="66" r="7" fill={teal} stroke={ink} strokeWidth="4" />
      <path d="M82 22c3-8 10-10 14-8M96 18c-7-2-11-8-10-14" stroke={gold} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function PhonePair(props: Art) {
  return (
    <svg viewBox="0 0 140 100" fill="none" aria-hidden="true" {...props}>
      <rect x="6" y="12" width="40" height="72" rx="9" fill={surface2} stroke={ink} strokeWidth="5" />
      <path d="M20 18h12" stroke={ink} strokeWidth="4" strokeLinecap="round" opacity="0.4" />
      <path d="M18 40h16M18 52h16M18 64h10" stroke={ink} strokeWidth="4" strokeLinecap="round" opacity="0.45" />
      <path d="M26 78c-4 0-4 6 0 6s4-6 0-6Z" fill={leaf} stroke={ink} strokeWidth="3" />
      <rect x="94" y="12" width="40" height="72" rx="9" fill={surface2} stroke={ink} strokeWidth="5" />
      <path d="M114 78c-4 0-4 6 0 6s4-6 0-6Z" fill={leaf} stroke={ink} strokeWidth="3" />
      <path d="M96 72h12" stroke={leaf} strokeWidth="5" strokeLinecap="round" />
      <path
        d="M46 48h6l7-12 8 22 7-14 4 4h8"
        stroke={ink}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M56 60 66 40l9 26 5-10 9 6" stroke={gold} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M120 98v-8M124 94h-8" stroke={tomato} strokeWidth="4" strokeLinecap="round" />
      <path d="M8 8c6-4 12-2 14 4M2 20c-6-4-4-12 2-14" stroke={teal} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function HeadlineDoodle(props: Art) {
  return (
    <svg viewBox="0 0 180 40" fill="none" aria-hidden="true" {...props}>
      <path d="M10 12c40-12 120-12 160 0" stroke={gold} strokeWidth="6" strokeLinecap="round" />
      <path d="M40 30c30-7 70-7 100 0" stroke={tomato} strokeWidth="4" strokeLinecap="round" opacity="0.8" />
      <circle cx="12" cy="12" r="4" fill={tomato} stroke={ink} strokeWidth="2.5" />
      <circle cx="168" cy="12" r="4" fill={teal} stroke={ink} strokeWidth="2.5" />
    </svg>
  );
}

export function ArrowDoodle(props: Art) {
  return (
    <svg viewBox="0 0 80 40" fill="none" aria-hidden="true" {...props}>
      <path d="M6 20C26 6 54 6 72 20" stroke={ink} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M64 10l10 10-12 12" stroke={ink} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Blob(props: Art) {
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden="true" {...props}>
      <path
        d="M60 6c14 0 22 10 34 12 12 2 22 8 20 22-2 12 4 20 0 32-5 15-18 18-32 20-12 2-18 14-32 12-14-2-18-14-32-16C4 86 2 72 6 60c4-12-2-22 6-32 10-13 24-6 36-18 2-2 6-4 12-4Z"
        fill={tint}
        stroke={ink}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path d="M38 34h44M38 48h32" stroke={ink} strokeWidth="4" strokeLinecap="round" opacity="0.3" />
      <circle cx="34" cy="86" r="5" fill={sun} stroke={ink} strokeWidth="3" />
      <circle cx="84" cy="24" r="4" fill={tomato} stroke={ink} strokeWidth="3" />
    </svg>
  );
}

export function StampCheck(props: Art) {
  return (
    <svg viewBox="0 0 100 100" fill="none" aria-hidden="true" {...props}>
      <circle cx="50" cy="50" r="42" fill={leaf} stroke={ink} strokeWidth="5" />
      <path d="M32 52l12 12 24-28" stroke={cream} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 24c6-8 14-8 20-12M90 76c-6 8-14 8-20 12" stroke={gold} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}