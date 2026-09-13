import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, Screen } from "../components/ui/Screen";
import { PlatformBadge } from "../components/orders/PlatformBadge";
import { Squiggle, Basket } from "../components/design/Art";
import { listAllOwnOrders } from "../db/repositories/orders";
import { listReceivedOrders } from "../db/repositories/received";
import type { Order, Platform, ReceivedOrder } from "../domain/types";
import { itemCount } from "../domain/order";
import { groupByBucket, type HistoryBucket, formatTime, formatDate } from "../lib/dates";
import { formatRupeeCompact } from "../money/format";

interface Merged {
  id: string;
  kind: "own" | "received";
  orderedAt: string;
  total: number;
  platform: Platform;
  count: number;
}

function buildMerged(own: Order[], recv: ReceivedOrder[]): Merged[] {
  return [
    ...own.map((o) => ({
      id: o.id,
      kind: "own" as const,
      orderedAt: o.orderedAt,
      total: o.total,
      platform: o.platform,
      count: itemCount(o.items),
    })),
    ...recv
      .filter((r) => !own.some((o) => o.id === r.id))
      .map((r) => ({
        id: r.id,
        kind: "received" as const,
        orderedAt: r.orderedAt,
        total: r.total,
        platform: r.platform,
        count: itemCount(r.items),
      })),
  ];
}

function ArchiveRow({ item }: { item: Merged }) {
  return (
    <li>
      <Link
        to={item.kind === "own" ? `/order/${item.id}` : `/received/${item.id}`}
        className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-tint/50"
      >
        <div className="min-w-0">
          <PlatformBadge platform={item.platform} />
          <p className="mt-0.5 text-xs font-semibold text-muted">
            {formatTime(item.orderedAt)} · {item.count} item{item.count === 1 ? "" : "s"}
          </p>
        </div>
        <span className="text-lg font-black tabular-nums text-ink transition-transform group-hover:translate-x-0.5">
          {formatRupeeCompact(item.total)}
        </span>
      </Link>
    </li>
  );
}

export function HistoryPage() {
  const [groups, setGroups] = useState<Array<{ bucket: HistoryBucket; items: Merged[] }>>([]);

  const load = useCallback(async () => {
    const [own, recv] = await Promise.all([listAllOwnOrders(), listReceivedOrders()]);
    const merged = buildMerged(own, recv);
    setGroups(groupByBucket(merged));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const count = groups.reduce((acc, g) => acc + g.items.length, 0);

  return (
    <Screen
      title="History"
      eyebrow={`${count} order${count === 1 ? "" : "s"} on record`}
    >
      {groups.length === 0 ? (
        <EmptyState
          title="No orders yet"
          body="Your family's orders will show up here once you start adding them."
          art={<Basket className="h-20 w-20" />}
        />
      ) : (
        <div className="space-y-9">
          {groups.map((group) => (
            <section key={group.bucket}>
              <div className="flex items-baseline gap-3">
                <h2 className="font-display text-[2rem] font-black leading-none tracking-tight text-ink sm:text-4xl">
                  {group.bucket}
                </h2>
                <span className="kicker text-muted">{formatDate(group.items[0].orderedAt).toUpperCase()}</span>
              </div>
              <Squiggle className="mt-2 h-2.5 w-24" />
              <ul className="mt-4 divide-y divide-dashed divide-ink/20 rounded-md border-2 border-ink/75 bg-surface shadow-[4px_5px_0_0_rgb(42_28_14/0.12)]">
                {group.items.map((item) => (
                  <ArchiveRow key={`${item.kind}:${item.id}`} item={item} />
                ))}
                <li aria-hidden="true" className="border-t border-dashed border-ink/20 px-4 py-2">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-muted">
                    {group.items.length} order{group.items.length === 1 ? "" : "s"}
                  </span>
                </li>
              </ul>
            </section>
          ))}
        </div>
      )}
    </Screen>
  );
}