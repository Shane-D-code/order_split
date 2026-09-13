import { useState, type ReactNode } from "react";
import { useIdentity } from "./onboarding";
import { Button } from "../components/ui/Button";
import { Field, TextInput } from "../components/ui/Field";
import { Spinner } from "../components/ui/Screen";
import { Wordmark } from "../components/brand/Wordmark";
import { GroceryBag, Sparkle } from "../components/design/Art";

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { identity, createIdentity } = useIdentity();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  if (identity === undefined) {
    return (
      <div className="app-max mx-auto flex min-h-dvh items-center justify-center">
        <Spinner label="Preparing your device…" />
      </div>
    );
  }

  if (identity) return <>{children}</>;

  return (
    <div className="app-max mx-auto flex min-h-dvh flex-col justify-center px-6">
      <div className="pt-safe absolute inset-x-0 top-0 px-6 pt-6">
        <Wordmark />
      </div>

      <div className="relative mx-auto w-full max-w-md">
        <div className="relative rounded-[2.5rem] border-2 border-ink bg-surface p-2 shadow-[6px_7px_0_0_var(--fo-ink)]">
          <div className="grain relative overflow-hidden rounded-[2rem] bg-gold px-6 pb-7 pt-7">
            <Sparkle className="absolute right-5 top-4 h-6 w-6 animate-spark" />
            <GroceryBag className="absolute -top-7 right-6 h-14 w-14 animate-float" />
            <span aria-hidden="true" className="absolute -bottom-9 -left-9 h-28 w-28 rounded-full bg-sun/60" />
            <p className="kicker text-ink-fixed/80">Family orders</p>
            <h1 className="mt-1.5 font-display text-4xl font-black leading-[1.02] tracking-tight text-ink-fixed">
              Welcome!
            </h1>
            <p className="mt-3 max-w-xs text-sm font-medium leading-relaxed text-ink-fixed/80">
              This phone keeps your family's order record — completely on-device. Give it a name;
              it's shown only to family you pair with.
            </p>

            <form
              className="mt-6"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await createIdentity(draft);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label="Your name on this device" labelClass="text-ink-fixed">
                <TextInput
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="e.g. Shantanu"
                  autoFocus
                />
              </Field>
              <Button type="submit" className="mt-4 w-full" size="lg" loading={busy} disabled={busy}>
                {busy ? "Setting up…" : "Start using"}
              </Button>
            </form>
          </div>
        </div>
      </div>

      <p className="mt-7 text-center text-xs leading-relaxed text-muted">
        Everything stays on this phone until you pair another device. No account, no server, no
        cloud.
      </p>
    </div>
  );
}