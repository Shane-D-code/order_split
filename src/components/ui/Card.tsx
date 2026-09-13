import type { HTMLAttributes, ReactNode } from "react";

export function Card({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={`rounded-md border-2 border-ink/75 bg-surface shadow-[4px_5px_0_0_rgb(42_28_14/0.12)] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4">
      <div>
        <h3 className="text-lg font-black tracking-tight text-ink">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-soft">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}