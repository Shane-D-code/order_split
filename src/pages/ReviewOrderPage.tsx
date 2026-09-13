import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Screen, Spinner, EmptyState } from "../components/ui/Screen";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, TextInput, Select } from "../components/ui/Field";
import { SectionLabel } from "../components/ui/SectionLabel";
import { PlatformBadge } from "../components/orders/PlatformBadge";
import { Squiggle } from "../components/design/Art";
import {
  getDraft,
  updateDraft,
  deleteDraft,
  createOrder,
} from "../db/repositories/orders";
import type { DraftRow } from "../db/database";
import type { DraftItem, Platform } from "../domain/types";
import { PLATFORMS, PLATFORM_LABELS } from "../domain/types";
import { orderFromDraft } from "../domain/order";
import { formatRupee } from "../money/format";
import { parseRupeeInput } from "../money/format";
import { validateDraft, hasBlockingErrors } from "../parse/validate-import";
import type { ValidationWarning } from "../parse/types";
import { useSync } from "../app/SyncContext";
import { newId } from "../domain/id";

function rupeeInput(value: number): string {
  return (value / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function parseInput(value: string): number {
  return value.trim() === "" ? 0 : parseRupeeInput(value);
}

const WARNING_ICON: Record<ValidationWarning["severity"], string> = {
  error: "bg-tomato text-on-ink",
  warning: "bg-sun text-on-gold",
  info: "bg-teal text-on-ink",
};

function WarningCard({
  warning,
  checked,
  onToggle,
}: {
  warning: ValidationWarning;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-md border-2 px-4 py-3 shadow-[3px_4px_0_0_rgb(42_28_14/0.1)] ${
        warning.severity === "error"
          ? "border-tomato bg-tomato/10"
          : warning.severity === "warning"
            ? "border-sun bg-sun/25"
            : "border-line bg-surface"
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-black ${WARNING_ICON[warning.severity]}`}
      >
        {warning.severity === "info" ? "i" : "!"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-snug text-ink">{warning.message}</p>
        {warning.allowOverride ? (
          <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-soft">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={checked}
              onChange={onToggle}
            />
            I checked this
          </label>
        ) : null}
      </div>
    </div>
  );
}

export function ReviewOrderPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const navigate = useNavigate();
  const { enqueue } = useSync();
  const [draft, setDraft] = useState<DraftRow | null | undefined>(undefined);
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    void getDraft(draftId!).then(setDraft);
  }, [draftId]);

  const warnings = draft ? validateDraft(draft) : [];
  const blocking = draft ? hasBlockingErrors(warnings, overrides) : true;

  const patch = useCallback(
    (update: Partial<DraftRow>) => {
      setDraft((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...update, updatedAt: new Date().toISOString() };
        void updateDraft(next.id, {
          items: next.items,
          subtotal: next.subtotal,
          deliveryFee: next.deliveryFee,
          handlingFee: next.handlingFee,
          packagingFee: next.packagingFee,
          tax: next.tax,
          discount: next.discount,
          total: next.total,
          platform: next.platform,
          orderedAt: next.orderedAt,
          warnings: [],
        }).catch(() => undefined);
        return next;
      });
    },
    [],
  );

  function patchItem(itemId: string, part: Partial<DraftItem>) {
    if (!draft) return;
    const items = draft.items.map((i) => (i.id === itemId ? { ...i, ...part } : i));
    patch({ items });
  }

  function toggleOverride(warningId: string) {
    setOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(warningId)) next.delete(warningId);
      else next.add(warningId);
      return next;
    });
  }

  async function confirm() {
    if (!draft) return;
    setConfirming(true);
    try {
      const order = orderFromDraft({
        platform: draft.platform,
        orderedAt: draft.orderedAt,
        items: draft.items,
        subtotal: draft.subtotal,
        deliveryFee: draft.deliveryFee,
        handlingFee: draft.handlingFee,
        packagingFee: draft.packagingFee,
        tax: draft.tax,
        discount: draft.discount,
        total: draft.total,
        sourceType: draft.sourceType,
        sourceName: draft.sourceName,
        createdAt: draft.createdAt,
      });
      await createOrder(order);
      await deleteDraft(draft.id);
      await enqueue(order);
      navigate("/", { replace: true });
    } finally {
      setConfirming(false);
    }
  }

  async function discard() {
    if (!draft) return;
    await deleteDraft(draft.id);
    navigate("/new", { replace: true });
  }

  if (draft === undefined) return <Screen><Spinner label="Loading draft…" /></Screen>;
  if (draft === null) {
    return (
      <Screen title="Review">
        <EmptyState title="Draft not found" />
      </Screen>
    );
  }

  const itemsTotal = draft.items.reduce((acc, i) => acc + i.lineTotal, 0);
  const itemQuantities = draft.items.reduce((acc, i) => acc + i.quantity, 0);

  const confirmLabel = blocking
    ? "Fix issues to confirm"
    : confirming
      ? "Saving…"
      : `✓ Confirm · ${formatRupee(draft.total)}`;

  return (
    <Screen
      title="Review order"
      eyebrow="Almost there"
      actions={
        <button
          className="text-sm font-extrabold uppercase tracking-wide text-danger"
          onClick={() => void discard()}
        >
          Discard
        </button>
      }
      footer={
        <Button
          className="w-full"
          size="lg"
          disabled={blocking || confirming}
          onClick={() => void confirm()}
        >
          {confirmLabel}
        </Button>
      }
    >
      <div className="space-y-6">
        <section className="rounded-md border-2 border-ink bg-surface p-1.5 shadow-[5px_6px_0_0_var(--fo-ink)]">
          <div className="grain relative overflow-hidden rounded-sm bg-gold px-5 py-5">
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <PlatformBadge platform={draft.platform} />
              <span className="kicker text-ink-fixed/80">
                {new Date(draft.orderedAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                })} ·{" "}
                {new Date(draft.orderedAt).toLocaleTimeString("en-IN", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
              </span>
            </div>
            <p className="kicker mt-4 text-ink-fixed/80">
              Check the order · {itemQuantities} item{itemQuantities === 1 ? "" : "s"}
            </p>
            <p className="mt-2 text-4xl font-black tabular-nums tracking-tight text-ink-fixed">
              {formatRupee(draft.total)}
            </p>
            <Squiggle className="mt-2 h-2.5 w-24" />
          </div>
          </div>
        </section>

        {warnings.length > 0 ? (
          <section className="space-y-2.5">
            <h2 className="font-display text-xl font-black tracking-tight text-ink">
              Check these
            </h2>
            {warnings.map((w) => (
              <WarningCard
                key={w.id}
                warning={w}
                checked={overrides.has(w.id)}
                onToggle={() => toggleOverride(w.id)}
              />
            ))}
          </section>
        ) : null}

        <Card className="space-y-4 p-4">
          <SectionLabel>The order</SectionLabel>
          <Field label="Platform">
            <Select
              value={draft.platform}
              onChange={(e) => patch({ platform: e.target.value as Platform })}
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ordered at">
            <TextInput
              type="datetime-local"
              value={draft.orderedAt.slice(0, 16)}
              onChange={(e) => patch({ orderedAt: new Date(e.target.value).toISOString() })}
            />
          </Field>
        </Card>

        <Card className="space-y-4 p-4">
          <SectionLabel>Items · {itemQuantities}</SectionLabel>
          {draft.items.map((item) => (
            <div key={item.id} className="space-y-3 rounded-sm border-2 border-line/70 bg-tint/40 p-3">
              <Field label="Name">
                <TextInput
                  value={item.name}
                  onChange={(e) => patchItem(item.id, { name: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Qty">
                  <TextInput
                    type="number"
                    min="1"
                    value={String(item.quantity)}
                    onChange={(e) => patchItem(item.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </Field>
                <Field label="Unit (₹)">
                  <TextInput
                    inputMode="decimal"
                    placeholder="—"
                    value={item.unitPrice === null ? "" : rupeeInput(item.unitPrice)}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      patchItem(item.id, {
                        unitPrice: v === "" ? null : parseInput(v),
                        lineTotal:
                          v === "" ? item.lineTotal : parseInput(v) * item.quantity,
                      });
                    }}
                  />
                </Field>
                <Field label="Line total (₹)">
                  <TextInput
                    inputMode="decimal"
                    value={rupeeInput(item.lineTotal)}
                    onChange={(e) => patchItem(item.id, { lineTotal: parseInput(e.target.value) })}
                  />
                </Field>
              </div>
              <button
                className="text-xs font-extrabold uppercase tracking-wide text-danger"
                onClick={() =>
                  patch({
                    items: draft.items.filter((i) => i.id !== item.id),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() =>
              patch({
                items: [
                  ...draft.items,
                  {
                    id: newId(),
                    name: "",
                    quantity: 1,
                    unitPrice: null,
                    lineTotal: 0,
                  },
                ],
              })
            }
          >
            + Add item
          </Button>
        </Card>

        <Card className="space-y-4 p-4">
          <SectionLabel>Totals</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Subtotal (₹)"><TextInput inputMode="decimal" value={rupeeInput(draft.subtotal)} onChange={(e) => patch({ subtotal: parseInput(e.target.value) })} /></Field>
            <Field label="Delivery (₹)"><TextInput inputMode="decimal" value={rupeeInput(draft.deliveryFee)} onChange={(e) => patch({ deliveryFee: parseInput(e.target.value) })} /></Field>
            <Field label="Handling (₹)"><TextInput inputMode="decimal" value={rupeeInput(draft.handlingFee)} onChange={(e) => patch({ handlingFee: parseInput(e.target.value) })} /></Field>
            <Field label="Packaging (₹)"><TextInput inputMode="decimal" value={rupeeInput(draft.packagingFee)} onChange={(e) => patch({ packagingFee: parseInput(e.target.value) })} /></Field>
            <Field label="Tax (₹)"><TextInput inputMode="decimal" value={rupeeInput(draft.tax)} onChange={(e) => patch({ tax: parseInput(e.target.value) })} /></Field>
            <Field label="Discount (₹)"><TextInput inputMode="decimal" value={rupeeInput(draft.discount)} onChange={(e) => patch({ discount: parseInput(e.target.value) })} /></Field>
          </div>
          <div className="flex items-center justify-between rounded-md border-2 border-ink bg-gold px-4 py-3 shadow-[3px_4px_0_0_var(--fo-ink)]">
            <span className="kicker text-ink-fixed">Total</span>
            <span className="text-xl font-black tabular-nums text-ink-fixed">{formatRupee(draft.total)}</span>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            Items add up to {formatRupee(itemsTotal)} · bill subtotal{" "}
            {formatRupee(draft.subtotal)}. The total stays exactly as the bill or you stated —
            review only surfaces differences, it never silently changes values.
          </p>
        </Card>
      </div>
    </Screen>
  );
}