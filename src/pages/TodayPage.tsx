import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { OrderCard } from "../components/orders/OrderCard";
import { EmptyState, Skeleton } from "../components/ui/Screen";
import { Button } from "../components/ui/Button";
import { Wordmark } from "../components/brand/Wordmark";
import { SyncPill } from "../components/ui/SyncPill";
import { SectionHeading } from "../components/ui/SectionHeading";
import {
  GroceryBag,
  SunBurst,
  Sparkle,
  TinyStar,
  LeafDot,
  Receipt,
  DotSpark,
  SwooshLine,
} from "../components/design/Art";
import { listOrdersForDay } from "../db/repositories/orders";
import { listReceivedOrders } from "../db/repositories/received";
import type { Order, Platform, ReceivedOrder } from "../domain/types";
import { formatRupee } from "../money/format";
import { localDayKey } from "../lib/dates";
import { useSync } from "../app/SyncContext";
import { itemCount } from "../domain/order";

interface Merged {
  id: string;
  kind: "own" | "received";
  orderedAt: string;
  total: number;
  platform: Platform;
  count: number;
}

function mergeCards(own: Order[], received: ReceivedOrder[]): Merged[] {
  const ownCards: Merged[] = own.map((o) => ({
    id: o.id,
    kind: "own",
    orderedAt: o.orderedAt,
    total: o.total,
    platform: o.platform,
    count: itemCount(o.items),
  }));
  const recvCards: Merged[] = received
    .filter((r) => !own.some((o) => o.id === r.id))
    .map((r) => ({
      id: r.id,
      kind: "received",
      orderedAt: r.orderedAt,
      total: r.total,
      platform: r.platform,
      count: itemCount(r.items),
    }));
  return [...ownCards, ...recvCards].sort((a, b) => b.orderedAt.localeCompare(a.orderedAt));
}

function todayEyebrow(): string {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function TodayPage() {
  const { run, syncing } = useSync();
  const [today, setToday] = useState<Order[]>([]);
  const [received, setReceived] = useState<ReceivedOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const day = localDayKey();
    const [own, recv] = await Promise.all([
      listOrdersForDay(day),
      listReceivedOrders({ from: day }),
    ]);
    setToday(own);
    setReceived(recv);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, run]);

  const cards = mergeCards(today, received);
  const dayTotal = cards.reduce((acc, c) => acc + c.total, 0);

  return (
    <div className="animate-fade-up">
      <header className="app-max px-4 pt-safe">
        <div className="flex items-center justify-between gap-3 pb-1 pt-4">
          <Wordmark />
          <SyncPill
            syncing={syncing}
            failed={run.failed}
            hasRun={run.sent + run.received + run.acked > 0}
          />
        </div>
      </header>

      {/* ——— Illustrated poster hero : cream paper ring, gold sheet, ink stickers ———
          Mobile-first two-zone composition: date / headline / ₹ total / label on the
          left, grocery illustration anchored bottom-right. Financial info always has
          full width so it never clips on a 375-412px phone. */}
      <section className="app-max px-4 pt-4">
        <div className="relative">
          <span
            aria-hidden="true"
            className="absolute -right-5 -top-7 h-28 w-28 rounded-full bg-sun/70"
          />

          <div className="relative rounded-[2.75rem] border-2 border-ink bg-surface p-2 shadow-[6px_7px_0_0_var(--fo-ink)]">
            <div className="grain relative overflow-hidden rounded-[2.25rem] bg-gold px-5 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-6">
              <SwooshLine className="absolute left-10 top-4 h-9 w-24 opacity-40" />
              <Sparkle className="absolute right-4 top-3 h-6 w-6 animate-spark" />
              <DotSpark className="absolute left-3 top-12 h-5 w-5 opacity-70" />
              <span
                aria-hidden="true"
                className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-sun/60"
              />

              <p className="kicker text-ink-fixed/80">
                {todayEyebrow().toUpperCase()}
              </p>

              <div className="min-w-0">
                <p className="mt-3 font-display text-[2.5rem] font-black leading-[1.05] tracking-tight text-ink-fixed sm:text-[2.75rem]">
                  {cards.length > 0 ? (
                    <>
                      What did we
                      <br />
                      order today?
                    </>
                  ) : (
                    "Nothing yet."
                  )}
                </p>
                <p className="mt-3 text-[3rem] font-black tabular-nums leading-none tracking-tight text-ink-fixed sm:mt-4 sm:text-[3.5rem]">
                  {cards.length > 0 ? formatRupee(dayTotal) : "₹0"}
                </p>
              </div>

              <div className="mt-3 flex items-end justify-between gap-4">
                <p className="min-w-0 text-xs font-extrabold uppercase tracking-[0.14em] text-ink-fixed/80">
                  Spent today · {cards.length} order{cards.length === 1 ? "" : "s"}
                </p>
                <div className="relative shrink-0">
                  <div className="animate-float">
                    {cards.length > 0 ? (
                      <SunBurst className="h-24 w-24 sm:h-28 sm:w-28" />
                    ) : (
                      <GroceryBag className="h-24 w-24 sm:h-28 sm:w-28" />
                    )}
                  </div>
                  <TinyStar className="absolute -left-2 top-2 h-5 w-5 animate-spark" />
                  <TinyStar
                    className="absolute bottom-0 right-0 h-4 w-4"
                    color="var(--fo-teal, #118c74)"
                  />
                  <LeafDot className="absolute -bottom-2 -left-4 h-5 w-5 opacity-80" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ——— Today's orders : editorial heading + cream paper list ——— */}
      <section className="app-max px-4 pt-8">
        <SectionHeading>Today's orders</SectionHeading>

        {loading ? (
          <div className="mt-4 space-y-4">
            <Skeleton className="h-24 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
        ) : cards.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No orders yet today"
              body="Add an order from a screenshot, PDF, or by hand. Your family's orders will show up here too."
              art={<Receipt className="h-20 w-20 animate-float sm:h-24 sm:w-24" />}
              action={
                <Link to="/new">
                  <Button size="lg" className="animate-float">
                    + Add your first order
                  </Button>
                </Link>
              }
            />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {cards.map((c, i) => (
              <OrderCard
                key={`${c.kind}:${c.id}`}
                platform={c.platform}
                orderedAt={c.orderedAt}
                total={c.total}
                itemCount={c.count}
                to={c.kind === "own" ? `/order/${c.id}` : `/received/${c.id}`}
                badge={c.kind === "received" ? "Shared" : undefined}
                tilt={i % 2 === 1 ? 0.5 : -0.4}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}