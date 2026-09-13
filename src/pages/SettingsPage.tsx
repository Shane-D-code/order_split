import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Screen } from "../components/ui/Screen";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, TextInput } from "../components/ui/Field";
import { SectionLabel } from "../components/ui/SectionLabel";
import { SyncPill } from "../components/ui/SyncPill";
import { useIdentity } from "../app/onboarding";
import { useTheme } from "../app/ThemeProvider";
import { listFamilyMembers, removeFamilyMember } from "../db/repositories/family";
import {
  getRelayUrl,
  setRelayUrl,
  getRetentionDays,
  setRetentionDays,
} from "../db/repositories/settings";
import type { FamilyMember } from "../domain/types";
import { useSync } from "../app/SyncContext";

function shortId(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;
}

const iconInk = "var(--fo-tomato, #f4512c)";
const iconLine = "var(--fo-ink, #2a1c0e)";

function RowIcon({ variant }: { variant: "theme" | "device" | "member" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      aria-hidden="true"
      stroke={iconLine}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {variant === "theme" ? (
        <>
          <path d="M12 3.5a8.5 8.5 0 1 0 0 17 7 7 0 0 1 0-14 7 7 0 0 1 1.5-3Z" fill={iconInk} />
          <path d="M15.5 8h.01M17.5 5.5h.01M20 9h.01" />
        </>
      ) : null}
      {variant === "device" ? (
        <>
          <rect x="7" y="3.5" width="10" height="17" rx="2.5" />
          <path d="M10.5 17.5h3" />
        </>
      ) : null}
      {variant === "member" ? (
        <>
          <circle cx="12" cy="9" r="3.2" />
          <path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" />
        </>
      ) : null}
    </svg>
  );
}

function SettingsRow({
  icon,
  title,
  trailing,
  children,
}: {
  icon: "theme" | "device" | "member";
  title: string;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center gap-3 border-b border-dashed border-line/70 px-4 py-3 last:border-b-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/20 bg-sun/40">
        <RowIcon variant={icon} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-ink">{title}</p>
        {children}
      </div>
      {trailing}
    </div>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-pressed={theme === "light"}
        onClick={() => setTheme("light")}
        className={`rounded-md border-2 border-ink px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide transition-all active:translate-y-[2px] active:shadow-none ${
          theme === "light"
            ? "bg-gold text-ink-fixed shadow-[2px_3px_0_0_var(--fo-ink)]"
            : "bg-surface text-muted"
        }`}
      >
        ☀ Sun
      </button>
      <button
        type="button"
        aria-pressed={theme === "dark"}
        onClick={() => setTheme("dark")}
        className={`rounded-md border-2 border-ink px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide transition-all active:translate-y-[2px] active:shadow-none ${
          theme === "dark"
            ? "bg-gold text-ink-fixed shadow-[2px_3px_0_0_var(--fo-ink)]"
            : "bg-surface text-muted"
        }`}
      >
        ☾ Night
      </button>
    </div>
  );
}

export function SettingsPage() {
  const identity = useIdentity();
  const { run, refresh, syncing } = useSync();
  const [relay, setRelay] = useState("");
  const [retention, setRetention] = useState("");
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState(false);

  useEffect(() => {
    void (async () => {
      setRelay(await getRelayUrl());
      setRetention(String(await getRetentionDays()));
      setFamily(await listFamilyMembers());
    })();
  }, []);

  async function saveRelay() {
    setSaving(true);
    setSavedNote(false);
    try {
      await setRelayUrl(relay);
      setSavedNote(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Settings" eyebrow="This device">
      <div className="space-y-5">
        <Card>
          <div className="px-4 pt-4">
            <SectionLabel>Appearance</SectionLabel>
          </div>
          <div className="mt-2">
            <SettingsRow
              icon="theme"
              title="Theme"
              trailing={<ThemeToggle />}
            >
              <p className="mt-0.5 text-xs text-muted">Sunny by default — choose Night for a warm dark look.</p>
            </SettingsRow>
          </div>
        </Card>

        <Card>
          <div className="px-4 pt-4">
            <SectionLabel>This device</SectionLabel>
          </div>
          <div className="space-y-4 px-4 py-4">
            <Field label="Your name">
              <TextInput
                value={identity.name}
                onChange={(e) => void identity.rename(e.target.value)}
              />
            </Field>
            <p className="text-xs text-muted">
              This name is shown only to the family you pair with. Device ID{" "}
              {identity.identity ? shortId(identity.identity.deviceId) : "—"}
            </p>
          </div>
        </Card>

        <Card>
          <div className="px-4 pt-4">
            <SectionLabel>Family</SectionLabel>
          </div>
          {family.length === 0 ? (
            <p className="px-4 pb-4 pt-1 text-sm text-soft">No devices paired yet.</p>
          ) : (
            <ul className="mt-1">
              {family.map((m) => (
                <SettingsRow
                  key={m.deviceId}
                  icon="member"
                  title={m.displayName}
                  trailing={
                    <button
                      className="text-xs font-extrabold uppercase tracking-wide text-danger"
                      onClick={() =>
                        void removeFamilyMember(m.deviceId).then(() =>
                          setFamily((f) => f.filter((x) => x.deviceId !== m.deviceId)),
                        )
                      }
                    >
                      Remove
                    </button>
                  }
                />
              ))}
            </ul>
          )}
          <div className="p-4 pt-1">
            <Link to="/settings/pair">
              <Button variant="secondary" className="w-full">
                Connect another phone
              </Button>
            </Link>
          </div>
        </Card>

        <Card>
          <div className="px-4 pt-4">
            <SectionLabel>Sync</SectionLabel>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-4">
            <SyncPill
              syncing={syncing}
              failed={run.failed}
              hasRun={run.sent + run.received + run.acked > 0}
            />
            <Button variant="secondary" size="sm" onClick={() => void refresh()}>
              Sync now
            </Button>
          </div>
          <p className="px-4 pb-4 text-xs text-muted">
            Orders stay on this phone first. Sharing happens through an encrypted mailbox — no
            plaintext ever leaves a device.
          </p>
        </Card>

        <Card>
          <div className="px-4 pt-4">
            <SectionLabel>Storage</SectionLabel>
          </div>
          <div className="space-y-3 px-4 py-4">
            <Field
              label="Retention (days)"
              hint="Orders older than this are deleted locally. Received orders follow the same window."
            >
              <TextInput
                type="number"
                min="1"
                value={retention}
                onChange={(e) => {
                  setRetention(e.target.value);
                  void setRetentionDays(Number(e.target.value) || 30);
                }}
              />
            </Field>
          </div>
        </Card>

        <Card>
          <div className="px-4 pt-4">
            <SectionLabel>Relay · advanced</SectionLabel>
          </div>
          <div className="space-y-3 px-4 py-4">
            <Field
              label="Relay URL"
              hint="Where your encrypted mailbox lives. See docs/deployment.md after running worker:deploy."
            >
              <TextInput
                value={relay}
                onChange={(e) => setRelay(e.target.value)}
                placeholder="https://relay.example.workers.dev"
                inputMode="url"
              />
            </Field>
            <Button variant="secondary" className="w-full" disabled={saving} onClick={() => void saveRelay()}>
              {saving ? "Saving…" : savedNote ? "Saved ✓" : "Save relay URL"}
            </Button>
          </div>
        </Card>

        <p className="px-2 text-center text-xs text-muted">
          Family Orders · local-first · works offline · no account needed
        </p>
      </div>
    </Screen>
  );
}