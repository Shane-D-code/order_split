import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold" | "sun";
type Size = "md" | "lg" | "sm";

const base =
  "inline-flex select-none items-center justify-center gap-2 rounded-md font-extrabold tracking-tight whitespace-nowrap transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none active:translate-y-[2px] active:shadow-none";

const variants: Record<Variant, string> = {
  /* Coral sticker CTA — dark ink text reads on the bright fill. */
  primary: "bg-tomato text-ink-fixed shadow-[3px_4px_0_0_var(--fo-ink)] hover:-translate-y-0.5",
  secondary:
    "border-2 border-ink bg-surface-2 text-ink shadow-[3px_4px_0_0_var(--fo-ink)] hover:-translate-y-0.5",
  sun: "bg-sun text-ink-fixed shadow-[3px_4px_0_0_var(--fo-ink)] hover:-translate-y-0.5",
  gold: "bg-gold text-ink-fixed shadow-[3px_4px_0_0_var(--fo-ink)] hover:-translate-y-0.5",
  ghost: "bg-transparent text-soft hover:bg-tint/60 hover:text-ink",
  danger: "bg-danger text-on-ink shadow-[3px_4px_0_0_var(--fo-tomato)] hover:-translate-y-0.5",
};

const sizes: Record<Size, string> = {
  sm: "h-11 px-4 text-sm",
  md: "h-12 px-5 text-base",
  lg: "h-14 px-6 text-lg",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </button>
  );
}