import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Screen, Spinner, EmptyState } from "../components/ui/Screen";
import { OrderView } from "../components/orders/OrderView";
import { getReceivedOrder, deleteReceivedOrder } from "../db/repositories/received";
import { getFamilyMember } from "../db/repositories/family";
import { memberDisplayName } from "../domain/family";
import type { ReceivedOrder } from "../domain/types";
import { formatDateTime } from "../lib/dates";

export function ReceivedDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<ReceivedOrder | null | undefined>(undefined);
  const [senderName, setSenderName] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const found = await getReceivedOrder(id!);
      if (!alive) return;
      setOrder(found);
      if (found) {
        const member = await getFamilyMember(found.fromDeviceId);
        if (alive) setSenderName(memberDisplayName(member));
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  async function handleDelete() {
    if (!order) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await deleteReceivedOrder(order.id);
    window.history.back();
  }

  if (order === undefined) return <Screen><Spinner label="Loading order…" /></Screen>;
  if (order === null) {
    return (
      <Screen title="Shared order">
        <EmptyState title="Order not found" />
      </Screen>
    );
  }

  return (
    <Screen
      title="Shared order"
      actions={
        <span className="rounded-full border border-teal/50 bg-teal/10 px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide text-teal-deep">
          shared
        </span>
      }
    >
      <p className="mb-1 text-xs font-extrabold uppercase tracking-[0.14em] text-coral-deep">
        From {senderName ?? "…"}
      </p>
      <p className="mb-3 text-sm font-semibold text-soft">
        Received {formatDateTime(order.receivedAt)}
      </p>
      <OrderView
        order={order}
        onDelete={handleDelete}
        footer={
          confirming ? (
            <div className="rounded-md border-2 border-danger bg-danger/10 p-3 text-sm font-semibold text-danger">
              Remove this shared order?{" "}
              <button className="underline underline-offset-2" onClick={handleDelete}>
                Yes, remove
              </button>
            </div>
          ) : null
        }
      />
    </Screen>
  );
}