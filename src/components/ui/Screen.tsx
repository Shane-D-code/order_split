import type { ReactNode } from "react";
import { Squiggle } from "../design/Art";

export function Screen({
  title,
  eyebrow,
  children,
  actions,
  footer,
  plain = false,
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  /** Skip the sticky header entirely (editorial pages build their own). */
  plain?: boolean;
}) {
  return (
    <div className="app-max flex min-h-full flex-col">
      {!plain && title ? (
        <header className="sticky top-0 z-20 border-b border-ink/15 bg-canvas/90 px-4 pb-2.5 pt-3 backdrop-blur">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              {eyebrow ? <p className="kicker text-muted">{eyebrow}</p> : null}
              <h1 className="font-display text-2xl font-black leading-none tracking-tight text-ink">
                {title}
              </h1>
              <Squiggle className="mt-1.5 h-2 w-20" />
            </div>
            {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
          </div>
        </header>
      ) : null}
      <main className="animate-swoosh flex-1 px-4 pb-8 pt-5">{children}</main>
      {footer ? (
        <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 mt-auto border-t border-ink/15 bg-canvas/95 px-4 pb-2 pt-3 backdrop-blur">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  art,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  art?: ReactNode;
}) {
  return (
    <div className="relative rounded-lg border-2 border-dashed border-ink/35 bg-surface px-5 py-6 text-center shadow-[4px_5px_0_0_rgb(42_28_14/0.14)] sm:px-8 sm:py-8">
      {art ? (
        <div className="mx-auto mb-3 flex w-fit items-center justify-center [&>svg]:h-auto [&>svg]:w-auto">
          {art}
        </div>
      ) : null}
      <p className="font-display text-[1.625rem] font-black leading-tight tracking-tight text-ink sm:text-[1.75rem]">{title}</p>
      {body ? <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-soft">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10" role="status">
      <span className="relative block h-9 w-9" aria-hidden="true">
        <span className="absolute inset-0 animate-spin-slow rounded-full border-[3px] border-tomato/40 border-t-ink" />
        <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold" />
      </span>
      {label ? (
        <span className="font-display text-base font-extrabold tracking-tight text-soft">
          {label}
        </span>
      ) : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-sm bg-line/50 ${className}`}
    />
  );
}