import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Screen } from "../components/ui/Screen";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, TextInput, Select } from "../components/ui/Field";
import { SectionLabel } from "../components/ui/SectionLabel";
import { PLATFORMS, PLATFORM_LABELS, type Platform } from "../domain/types";
import { formatRupee, parseRupeeInput } from "../money/format";
import { createDraft } from "../db/repositories/orders";
import { newId } from "../domain/id";
import { localDayKey } from "../lib/dates";
import { validateParsedOrder } from "../parse/validate-import";
import type { ParsedOrder } from "../parse/types";

interface Line {
  key: string;
  name: string;
  qty: string;
  unit: string;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

export function ManualOrderPage() {
  const navigate = useNavigate();
  const [platform, setPlatform] = useState<Platform>("other");
  const [orderedAt, setOrderedAt] = useState(() => toLocalInput(new Date().toISOString()));
  const [lines, setLines] = useState<Line[]>([{ key: newId(), name: "", qty: "1", unit: "" }]);
  const [fees, setFees] = useState({ delivery: "", handling: "", packaging: "", tax: "", discount: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patchLine(key: string, part: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...part } : l)));
  }

  function parseLine(l: Line): { name: string; quantity: number; unitPrice: number } | null {
    const name = l.name.trim();
    const qty = Number(l.qty);
    if (!name) return null;
    if (!Number.isFinite(qty) || qty <= 0) return null;
    let unitPrice = 0;
    try {
      unitPrice = l.unit.trim() === "" ? 0 : parseRupeeInput(l.unit);
    } catch {
      return null;
    }
    return { name, quantity: Math.round(qty), unitPrice };
  }

  const itemData = useMemo(
    () => lines.map(parseLine),
    [lines],
  );

  const validItemData = itemData.filter((v): v is NonNullable<typeof v> => v !== null);
  const itemsTotal = validItemData.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);

  function feeValue(v: string): number {
    if (v.trim() === "") return 0;
    try {
      return parseRupeeInput(v);
    } catch {
      return 0;
    }
  }

  const deliveryFee = feeValue(fees.delivery);
  const handlingFee = feeValue(fees.handling);
  const packagingFee = feeValue(fees.packaging);
  const tax = feeValue(fees.tax);
  const discount = feeValue(fees.discount);
  const total = Math.max(0, itemsTotal + deliveryFee + handlingFee + packagingFee + tax - discount);

  async function save() {
    setError(null);
    const items = itemData
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .map((i) => ({
        id: newId(),
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.unitPrice * i.quantity,
      }));
    if (items.length === 0) {
      setError("Add at least one item with a name.");
      return;
    }
    const now = new Date();
    const iso = orderedAt ? new Date(orderedAt).toISOString() : now.toISOString();

    const parsed: ParsedOrder = {
      platform,
      orderedAt: iso,
      items: items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.lineTotal,
      })),
      subtotal: itemsTotal,
      deliveryFee,
      handlingFee,
      packagingFee,
      tax,
      discount,
      unclassifiedFees: [],
      total,
    };
    const warnings = validateParsedOrder(parsed);

    setSaving(true);
    try {
      const draft = await createDraft({
        sourceType: "manual",
        platform,
        orderedAt: iso,
        items,
        subtotal: itemsTotal,
        deliveryFee,
        handlingFee,
        packagingFee,
        tax,
        discount,
        total,
        warnings,
      });
      navigate(`/review/${draft.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      title="Manual order"
      eyebrow="By hand"
      footer={
        <Button className="w-full" size="lg" loading={saving} disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : `Save draft · ${formatRupee(total)}`}
        </Button>
      }
    >
      <div className="space-y-5">
        <Card className="space-y-4 p-4">
          <SectionLabel>Where from</SectionLabel>
          <Field label="Platform">
            <Select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ordered at">
            <TextInput
              type="datetime-local"
              value={orderedAt}
              onChange={(e) => setOrderedAt(e.target.value)}
            />
          </Field>
        </Card>

        <Card className="space-y-4 p-4">
          <SectionLabel>Items</SectionLabel>
          {lines.map((line, idx) => (
            <div key={line.key} className="space-y-3 rounded-sm border-2 border-line/70 bg-tint/40 p-3">
              <Field label={`Item ${idx + 1} name`}>
                <TextInput
                  value={line.name}
                  placeholder="e.g. Loose onion 1 kg"
                  onChange={(e) => {
                    patchLine(line.key, { name: e.target.value });
                  }}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quantity">
                  <TextInput
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={line.qty}
                    onChange={(e) => patchLine(line.key, { qty: e.target.value })}
                  />
                </Field>
                <Field label="Unit price (₹)">
                  <TextInput
                    inputMode="decimal"
                    placeholder="32.50"
                    value={line.unit}
                    onChange={(e) => patchLine(line.key, { unit: e.target.value })}
                  />
                </Field>
              </div>
              <button
                type="button"
                className="-mx-2 inline-flex min-h-11 items-center rounded-sm px-2 text-xs font-extrabold uppercase tracking-wide text-danger"
                onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
              >
                Remove item
              </button>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() =>
              setLines((prev) => [...prev, { key: newId(), name: "", qty: "1", unit: "" }])
            }
          >
            + Add item
          </Button>
        </Card>

        <Card className="space-y-3 p-4">
          <SectionLabel>Fees &amp; totals</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Delivery fee (₹)"><TextInput inputMode="decimal" placeholder="0" value={fees.delivery} onChange={(e) => setFees((f) => ({ ...f, delivery: e.target.value }))} /></Field>
            <Field label="Handling fee (₹)"><TextInput inputMode="decimal" placeholder="0" value={fees.handling} onChange={(e) => setFees((f) => ({ ...f, handling: e.target.value }))} /></Field>
            <Field label="Packaging fee (₹)"><TextInput inputMode="decimal" placeholder="0" value={fees.packaging} onChange={(e) => setFees((f) => ({ ...f, packaging: e.target.value }))} /></Field>
            <Field label="Tax (₹)"><TextInput inputMode="decimal" placeholder="0" value={fees.tax} onChange={(e) => setFees((f) => ({ ...f, tax: e.target.value }))} /></Field>
            <Field label="Discount (₹)"><TextInput inputMode="decimal" placeholder="0" value={fees.discount} onChange={(e) => setFees((f) => ({ ...f, discount: e.target.value }))} /></Field>
          </div>
          <div className="flex items-center justify-between border-t-2 border-dashed border-line pt-3">
            <span className="kicker text-muted">Items · {validItemData.length}</span>
            <span className="text-lg font-black tabular-nums text-ink">{formatRupee(itemsTotal)}</span>
          </div>
        </Card>

        {error ? (
          <p className="rounded-sm border-2 border-danger bg-danger/10 p-3 text-sm font-semibold text-danger">
            {error}
          </p>
        ) : null}
        <p className="text-xs leading-relaxed text-muted">
          Recalled from memory for local day {localDayKey()}. Adjust the date above if needed.
        </p>
      </div>
    </Screen>
  );
}