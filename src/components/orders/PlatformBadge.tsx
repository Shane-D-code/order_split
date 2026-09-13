import { PLATFORM_LABELS, type Platform } from "../../domain/types";

const DOT: Record<Platform, string> = {
  blinkit: "bg-gold",
  zepto: "bg-tomato",
  instamart: "bg-teal",
  bigbasket: "bg-leaf",
  amazon: "bg-ink",
  other: "bg-muted",
};

export function PlatformBadge({
  platform,
  className = "",
}: {
  platform: Platform;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border border-ink/25 bg-surface-2 px-2 py-0.5 font-extrabold uppercase tracking-[0.08em] text-ink ${className}`}
      aria-label={PLATFORM_LABELS[platform]}
    >
      <span className={`h-2 w-2 rounded-full ${DOT[platform]}`} aria-hidden="true" />
      {PLATFORM_LABELS[platform]}
    </span>
  );
}