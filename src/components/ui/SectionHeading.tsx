import type { ReactNode } from "react";
import { Squiggle } from "../design/Art";

export function SectionHeading({
  children,
  action,
  className = "",
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex items-end justify-between gap-3 ${className}`}>
      <div>
        <h2 className="font-display text-3xl font-black leading-none tracking-tight text-ink">
          {children}
        </h2>
        <Squiggle className="mt-2 h-2.5 w-28" />
      </div>
      {action ? <div className="shrink-0 pb-0.5">{action}</div> : null}
    </header>
  );
}