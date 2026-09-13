import type { ReactNode } from "react";
import type { Order } from "../../domain/types";
import { formatRupee, formatDiscount } from "../../money/format";
import { formatDate, formatTime } from "../../lib/dates";
import { Button } from "../ui/Button";
import { PlatformBadge } from "./PlatformBadge";
import { Squiggle, Sparkle } from "../design/Art";

function BreakRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-line/80 py-2">
      <span className="kicker text-muted">{label}</span>
      <span className="text-sm font-extrabold tabular-nums text-soft">{value}</span>
    </div>
  );
}

export function OrderView({
  order,
  onDelete,
  footer,
}: {
  order: Order;
  onDelete?: () => void;
  footer?: ReactNode;
}) {
  const total = formatRupee(order.total);

  return (
    <div className="space-y-5">
      {/* Receipt masthead : cream paper, big ink total, coral squiggle */}
      <section className="paper-lines relative overflow-hidden rounded-md border-2 border-ink bg-surface px-5 py-5 shadow-[5px_6px_0_0_var(--fo-ink)]">
        <Sparkle className="absolute right-3 top-3 h-5 w-5 animate-spark" />
        <div className="flex items-start justify-between gap-3">
          <PlatformBadge platform={order.platform} />
          <span className="text-right text-xs font-bold uppercase tracking-wide text-soft">
            {formatDate(order.orderedAt)}
            <br />
            {formatTime(order.orderedAt)}
          </span>
        </div>
        <div className="mt-5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="kicker text-muted">Total</p>
            <p className="mt-1 text-5xl font-black tabular-nums leading-none tracking-tight text-ink">
              {total}
            </p>
          </div>
          <Squiggle className="mb-1 h-2.5 w-24 shrink-0" />
        </div>
        <p className="kicker mt-4 text-muted">
          {order.items.reduce((a, i) => a + i.quantity, 0)} items
        </p>
      </section>

      <section className="rounded-md border-2 border-ink/75 bg-surface px-4 py-4">
        <ul className="divide-y divide-dashed divide-line/80">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-4 py-2.5 first:pt-0">
              <div className="min-w-0">
                <p className="font-extrabold leading-snug text-ink">{item.name}</p>
                <p className="text-sm text-muted">
                  {item.quantity} × {formatRupee(item.unitPrice)}
                </p>
              </div>
              <span className="shrink-0 font-extrabold tabular-nums text-ink">
                {formatRupee(item.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-md border-2 border-ink/75 bg-surface px-4 py-4">
        <h3 className="kicker text-muted">Summary</h3>
        <div className="mt-3">
          <BreakRow label="Items total" value={formatRupee(order.subtotal)} />
          {order.deliveryFee > 0 ? <BreakRow label="Delivery" value={formatRupee(order.deliveryFee)} /> : null}
          {order.handlingFee > 0 ? <BreakRow label="Handling" value={formatRupee(order.handlingFee)} /> : null}
          {order.packagingFee > 0 ? <BreakRow label="Packaging" value={formatRupee(order.packagingFee)} /> : null}
          {order.tax > 0 ? <BreakRow label="Tax" value={formatRupee(order.tax)} /> : null}
          {order.discount > 0 ? <BreakRow label="Discount" value={formatDiscount(order.discount)} /> : null}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-md border-2 border-ink bg-gold px-4 py-3 shadow-[3px_4px_0_0_var(--fo-ink)]">
          <span className="kicker text-ink-fixed">Total</span>
          <span className="text-xl font-black tabular-nums text-ink-fixed">{total}</span>
        </div>
      </section>

      {onDelete ? (
        <Button variant="danger" className="w-full" onClick={onDelete}>
          Delete order
        </Button>
      ) : null}
      {footer}
    </div>
  );
}