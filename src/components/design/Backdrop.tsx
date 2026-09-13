import { SunBurst, Blob, Sparkle, DotSpark, TinyStar, Squiggle } from "./Art";

/**
 * Fixed decorative layer behind every screen. Organic blobs, stars and
 * sparkles make the golden canvas feel like an illustrated poster
 * without raster textures. Purely decorative (aria-hidden), cheap,
 * and consistent with the sticker language.
 */
export function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <SunBurst className="absolute -right-16 -top-10 hidden h-44 w-44 rotate-6 opacity-[0.16] sm:block" />
      <Blob className="absolute -left-16 top-[38%] hidden h-44 w-44 -rotate-12 opacity-[0.14] sm:block" />
      <TinyStar className="absolute left-[12%] top-[16%] h-6 w-6 opacity-40" />
      <TinyStar color="var(--fo-teal, #118c74)" className="absolute right-[16%] top-[38%] h-5 w-5 opacity-35" />
      <Sparkle className="absolute bottom-[30%] left-8 h-8 w-8 animate-spark opacity-[0.35]" />
      <DotSpark className="absolute bottom-[16%] right-8 h-9 w-9 opacity-30" />
      <Squiggle className="absolute bottom-[24%] left-1/3 h-2.5 w-24 opacity-30" />
      <span className="blob-corner absolute -bottom-10 left-1/2 h-32 w-40 bg-sun-pale/50" />
    </div>
  );
}