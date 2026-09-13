import type { ReactNode } from "react";

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="kicker text-muted">
      <span aria-hidden="true" className="mr-2 text-tomato">●</span>
      {children}
    </h3>
  );
}