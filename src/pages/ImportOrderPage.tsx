import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Screen } from "../components/ui/Screen";
import { Button } from "../components/ui/Button";
import { Receipt, TinyStar } from "../components/design/Art";
import { importBill } from "../parse/pipeline";
import { createDraft } from "../db/repositories/orders";
import { newId } from "../domain/id";
import type { DraftItem } from "../domain/types";
import type { ParsedItem } from "../parse/types";

const SCAN_NOTES = [
  "Scanning item names…",
  "Checking prices…",
  "Adding everything up…",
];

function parseDateSafe(iso: string | null): string {
  if (iso) return iso;
  return new Date().toISOString();
}

export function ImportOrderPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState(SCAN_NOTES[0]);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    let note = 0;
    const tick = window.setInterval(() => {
      note = (note + 1) % SCAN_NOTES.length;
      setScanNote(SCAN_NOTES[note]);
    }, 1800);
    try {
      const res = await importBill(file);
      await persistDraft(file, res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this file. PDFs work best with a text layer; other formats may need OCR.");
    } finally {
      window.clearInterval(tick);
      setBusy(false);
    }
  }

  async function persistDraft(file: File, res: Awaited<ReturnType<typeof importBill>>) {
    const image = file.type.startsWith("image/") ? file : undefined;
    const items: DraftItem[] = res.parsed.items.map((i: ParsedItem) => ({
      id: newId(),
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal ?? 0,
    }));
    const draft = await createDraft({
      sourceType: res.sourceKind === "ocr" ? "screenshot" : "pdf",
      sourceName: file.name,
      rawText: res.text,
      image,
      platform: res.parsed.platform ?? "other",
      orderedAt: parseDateSafe(res.parsed.orderedAt),
      items,
      subtotal: res.parsed.subtotal ?? 0,
      deliveryFee: res.parsed.deliveryFee ?? 0,
      handlingFee: res.parsed.handlingFee ?? 0,
      packagingFee: res.parsed.packagingFee ?? 0,
      tax: res.parsed.tax ?? 0,
      discount: res.parsed.discount ?? 0,
      total: res.parsed.total ?? 0,
      warnings: res.warnings,
    });
    navigate(`/review/${draft.id}`);
  }

  const fileInputs = (
    value: "both" | "image" | "pdf",
  ) =>
    value === "both" ? "image/*,application/pdf" : value === "image" ? "image/*" : "application/pdf";

  return (
    <Screen plain>
      <p className="kicker text-muted">Import</p>
      <h1 className="mt-1 font-display text-4xl font-black leading-[1.02] tracking-tight text-ink">
        Add from
        <br />
        your bill
      </h1>
      <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-soft">
        <span className="h-2 w-2 rounded-full bg-leaf" aria-hidden="true" />
        Stays on your device — nothing is uploaded.
      </p>

      {busy ? (
        <div className="mt-10 flex flex-col items-center">
          <div className="relative h-40 w-40 animate-float" aria-hidden="true">
            <Receipt className="h-40 w-40" />
            <span className="absolute left-4 right-4 top-3 h-1.5 rounded-full bg-tomato animate-scan" />
            <TinyStar className="absolute -left-3 top-2 h-6 w-6 animate-spark" />
            <TinyStar className="absolute -right-2 bottom-6 h-5 w-5" color="var(--fo-teal, #118c74)" />
          </div>
          <h2 className="mt-4 font-display text-2xl font-black tracking-tight text-ink">
            Reading your bill
          </h2>
          <p className="mt-1 text-sm font-semibold text-soft" role="status">
            {scanNote}
          </p>
        </div>
      ) : error ? (
        <div className="mt-8 rounded-md border-2 border-danger bg-surface px-5 py-7 text-center shadow-[4px_5px_0_0_rgb(42_28_14/0.12)]">
          <h2 className="font-display text-2xl font-black tracking-tight text-ink">
            Couldn't read that bill
          </h2>
          <p className="mt-2 text-sm text-soft">Try another photo or enter the order manually.</p>
          {error ? <p className="mt-2 text-xs text-muted">Details: {error}</p> : null}
          <div className="mt-5 flex flex-col gap-3">
            <Button size="lg" onClick={() => setError(null)}>
              Try again
            </Button>
            <Link to="/new/manual">
              <Button variant="secondary" size="lg" className="w-full">
                Enter manually
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-8">
          <label
            className="relative block cursor-pointer rounded-md border-2 border-dashed border-ink/40 bg-surface px-5 py-9 text-center shadow-[4px_5px_0_0_rgb(42_28_14/0.14)] transition-colors hover:bg-surface-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
          >
            <TinyStar
              className="absolute left-5 top-4 h-4 w-4"
              color="var(--fo-gold, #f2a71b)"
            />
            <div className="mx-auto w-fit animate-float">
              <Receipt className="h-24 w-24" />
            </div>
            <p className="mt-4 font-display text-2xl font-black tracking-tight text-ink">
              Drop the bill here
            </p>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-soft">
              Screenshot, image or PDF. Blinkit, Zepto, Instamart, BigBasket, Amazon or any receipt.
            </p>
            <input
              type="file"
              accept={fileInputs("both")}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </label>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="cursor-pointer">
              <span className="flex h-12 items-center justify-center gap-2 rounded-md border-2 border-ink bg-surface-2 px-4 text-sm font-extrabold text-ink shadow-[3px_4px_0_0_var(--fo-ink)] transition-transform active:translate-y-[2px] active:shadow-none">
                Camera / Photos
              </span>
              <input
                type="file"
                accept={fileInputs("image")}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </label>
            <label className="cursor-pointer">
              <span className="flex h-12 items-center justify-center gap-2 rounded-md border-2 border-ink bg-surface-2 px-4 text-sm font-extrabold text-ink shadow-[3px_4px_0_0_var(--fo-ink)] transition-transform active:translate-y-[2px] active:shadow-none">
                Choose a PDF
              </span>
              <input
                type="file"
                accept={fileInputs("pdf")}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </label>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-muted">
            Extracted text is parsed locally. The original image is kept only until you confirm or
            discard the draft.
          </p>
        </div>
      )}
    </Screen>
  );
}