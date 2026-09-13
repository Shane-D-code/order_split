import { TinyStar } from "../design/Art";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <p
      className={`font-display text-[1.65rem] font-black leading-none tracking-tight text-ink sm:text-2xl ${className}`}
      aria-label="Family Orders"
    >
      Family{" "}
      <span className="relative ml-1.5 inline-block rounded-lg border-2 border-ink bg-surface-2 px-2 py-1 align-middle text-ink shadow-[2px_3px_0_0_var(--fo-ink)]">
        <span className="leading-none">Orders</span>
        <TinyStar
          className="absolute -right-1.5 -top-1.5 h-3.5 w-3.5"
          color="var(--fo-tomato, #ef4020)"
        />
      </span>
    </p>
  );
}