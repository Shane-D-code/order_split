import { Link } from "react-router-dom";
import { Screen } from "../components/ui/Screen";
import { Receipt, Basket, Sparkle, TinyStar } from "../components/design/Art";

function OptionCard({
  to,
  kicker,
  title,
  body,
  accent,
  art,
  label,
}: {
  to: string;
  kicker: string;
  title: string;
  body: string;
  accent: string;
  art: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className={`group relative block rounded-md border-2 border-ink bg-surface px-5 py-5 shadow-[4px_5px_0_0_var(--fo-ink)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[5px_7px_0_0_var(--fo-ink)] active:translate-y-[2px] active:shadow-none`}
    >
      <span
        aria-hidden="true"
        className={`absolute right-3 top-3 h-3.5 w-3.5 rounded-full ${accent}`}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="kicker text-muted">{kicker}</p>
          <h2 className="mt-1.5 font-display text-2xl font-black leading-none tracking-tight text-ink">
            {title}
          </h2>
          <p className="mt-2 text-sm font-medium leading-relaxed text-soft">{body}</p>
          <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-extrabold uppercase tracking-[0.12em] text-coral-deep transition-transform group-hover:translate-x-1">
            {label} <span aria-hidden="true">→</span>
          </p>
        </div>
        <div className="shrink-0 animate-float">{art}</div>
      </div>
    </Link>
  );
}

export function NewOrderPage() {
  return (
    <Screen plain>
      <div className="relative">
        <Sparkle className="absolute right-6 top-0 h-8 w-8 animate-spark" />
        <p className="kicker text-muted">New order</p>
        <h1 className="mt-1 font-display text-4xl font-black leading-[1.02] tracking-tight text-ink">
          What are we
          <br />
          buying?
        </h1>
      </div>

      <div className="mt-7 space-y-5">
        <OptionCard
          to="/import"
          kicker="Give me the bill"
          title="From your bill"
          body="Screenshot or PDF. I'll read it and add everything up."
          accent="bg-gold"
          art={
            <div className="relative">
              <Receipt className="h-16 w-16" />
              <TinyStar
                className="absolute -right-2 -top-2 h-5 w-5"
                color="var(--fo-gold, #f2a71b)"
              />
            </div>
          }
          label="Choose"
        />
        <OptionCard
          to="/new/manual"
          kicker="By hand"
          title="Manual entry"
          body="Type the items yourself — great for cash tells and missed bills."
          accent="bg-teal"
          art={
            <div className="relative">
              <Basket className="h-16 w-16" />
              <TinyStar
                className="absolute -right-2 -top-2 h-5 w-5"
                color="var(--fo-teal, #118c74)"
              />
            </div>
          }
          label="Choose"
        />
      </div>
    </Screen>
  );
}