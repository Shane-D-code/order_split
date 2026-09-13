/** Date helpers. Ordered timestamps are local-ISO strings like 2026-08-12T14:14:00. */

export function parseOrderDate(iso: string): Date {
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) return d;
  return new Date();
}

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function localDayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatTime(iso: string): string {
  return parseOrderDate(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDate(iso: string): string {
  return parseOrderDate(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

export function isToday(iso: string): boolean {
  return dayKey(iso) === localDayKey();
}

export function isYesterday(iso: string): boolean {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return dayKey(iso) === localDayKey(y);
}

/** Monday-based start of the current week (local). */
export function startOfWeek(now: Date = new Date()): Date {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysAgo(days: number, now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export type HistoryBucket = "Today" | "Yesterday" | "This week" | "Older";

export function bucketFor(iso: string, now: Date = new Date()): HistoryBucket {
  if (isToday(iso)) return "Today";
  if (isYesterday(iso)) return "Yesterday";
  const d = parseOrderDate(iso);
  if (d >= startOfWeek(now)) return "This week";
  return "Older";
}

export function groupByBucket<T extends { orderedAt: string }>(
  items: T[],
  now: Date = new Date(),
): Array<{ bucket: HistoryBucket; items: T[] }> {
  const order: HistoryBucket[] = ["Today", "Yesterday", "This week", "Older"];
  const map = new Map<HistoryBucket, T[]>();
  for (const item of items) {
    const bucket = bucketFor(item.orderedAt, now);
    const list = map.get(bucket) ?? [];
    list.push(item);
    map.set(bucket, list);
  }
  return order
    .filter((b) => (map.get(b)?.length ?? 0) > 0)
    .map((b) => ({ bucket: b, items: map.get(b)! }));
}

export function retentionCutoffIso(days: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}