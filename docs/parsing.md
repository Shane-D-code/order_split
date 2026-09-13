# Parsing bills (OCR / PDF / manual)

Orders are **imported** from screenshots, PDFs, or typed manually. The app
never scrapes grocery platforms and never calls provider APIs.

## Pipeline

```
file ──► extract(import) ──► orderParser(parse) ──► validate(import) ──► draft
              │                    │                       │
              │                    │                       └─ warnings/errors
              │                    └─ ParsedOrder (raw lines)
              └─ ExtractedInput (text, image blob, confidence)
```

- `src/parse/extractors/` — each extractor returns an `ExtractedInput`
  interface, so OCR/PDF implementations are swappable without touching the UI.
  - `ocr-extractor.ts`: tesseract.js, lazy-loaded on first use, with downloaded
    tessdata (CDN patched by a service-worker runtime cache).
  - `pdf-extractor.ts`: pdfjs-dist text layer first; OCR (ocr-extractor) only when
    a page has no usable text.
- `src/parse/order-parser.ts` — regex-driven line parser producing
  `ParsedOrder` (raw `lineNo`, `name`, `qty`, `unitPrice`, `lineTotal`,
  `platform`).
- `src/parse/validate-import.ts` — runs `validateParsedOrder` and emits
  per-line warnings/errors (tolerance ₹2 total, ₹1 per line; missing owner etc.
  handled upstream in drafts).

## Review rules (src/domain/order-v2 or validate-import)

Warnings and errors are **never auto-corrected**. The review screen shows a
valued warning per item with an override checkbox; the confirm action is
blocked until every **error**-severity issue is resolved or overridden.
`orderFromDraft` preserves subtotal, fees, tax, discount and total exactly as
stored; `unitPrice` is only ever derived as `round(lineTotal / qty)`.

## Accuracy guidance

- Screenshot must be sharp and reasonably high contrast; tesseract accuracy is
  best on plain receipts.
- PDFs with a real text layer skip OCR entirely (fast + exact).
- The parser is tolerant of `₹`/`Rs`/bare numbers and `x2`/`2 x` quantity
  styles; totals that don't match the sum are `warn`ed, never silently
  adjusted.

## Extending

1. Add/extend an extractor behind the `ExtractedInput` contract.
2. Extend `order-parser.ts` line regexes (existing patterns in
   `tests/unit/order-parser.test.ts` show the tidy cases).
3. Extend `validate-import.ts` rules; every rule ships with a test.