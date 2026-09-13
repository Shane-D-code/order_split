import { Link } from "react-router-dom";
import type { Platform } from "../../domain/types";
import { formatRupeeCompact } from "../../money/format";
import { formatTime } from "../../lib/dates";
import { TinyStar } from "../design/Art";
import { PlatformBadge } from "./PlatformBadge";

interface OrderCardProps {
  platform: Platform;
  orderedAt: string;
  total: number;
  itemCount: number;
  to: string;
  badge?: string;
  /** Sender display name for shared orders; own orders pass nothing. */
  from?: string;
  /** Alternating composition keeps the feed editorial without chaos. */
  tilt?: number;
}

export function OrderCard({
  platform,
  orderedAt,
  total,
  itemCount,
  to,
  badge,
  from,
  tilt = 0,
}: OrderCardProps) {
  const time = formatTime(orderedAt);
  return (
    <Link
      to={to}
      style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined}
      className="group relative block rounded-md border-2 border-ink bg-surface px-4 py-4 shadow-[4px_5px_0_0_var(--fo-ink)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[5px_7px_0_0_var(--fo-ink)] active:translate-y-[3px] active:shadow-none"
    >
      <TinyStar
        className="absolute -top-2 -right-1.5 h-4 w-4 opacity-90"
        color="var(--fo-tomato, #ef4020)"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PlatformBadge platform={platform} />
            {badge ? (
              <span className="rounded-full border border-teal/60 bg-teal/10 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-teal-deep">
                {badge}
              </span>
            ) : null}
          </div>
          {from ? (
            <p className="mt-1 text-xs font-extrabold tracking-[0.14em] text-coral-deep">
              From {from}
            </p>
          ) : null}
          <p className="mt-1.5 text-sm font-semibold text-soft">
            {time} · {itemCount} item{itemCount === 1 ? "" : "s"}
          </p>
        </div>
        <span className="shrink-0 text-2xl font-black tabular-nums leading-none text-ink">
          {formatRupeeCompact(total)}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-dashed border-ink/25 pt-2">
        <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-muted transition-colors group-hover:text-coral-deep">
          View order
        </span>
        <span className="text-tomato transition-transform duration-150 group-hover:translate-x-1" aria-hidden="true">
          ↗
        </span>
      </div>
    </Link>
  );
}