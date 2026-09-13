import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Screen, Spinner } from "../components/ui/Screen";
import { EmptyState } from "../components/ui/Screen";
import { OrderView } from "../components/orders/OrderView";
import { getOrder, deleteOrder } from "../db/repositories/orders";
import type { Order } from "../domain/types";

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    void getOrder(id!).then(setOrder);
  }, [id]);

  async function handleDelete() {
    if (!order) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await deleteOrder(order.id);
    navigate("/", { replace: true });
  }

  if (order === undefined) return <Screen><Spinner label="Loading order…" /></Screen>;
  if (order === null) {
    return (
      <Screen title="Order">
        <EmptyState title="Order not found" />
      </Screen>
    );
  }

  return (
    <Screen title="Order">
      <OrderView
        order={order}
        onDelete={handleDelete}
        footer={
          confirming ? (
            <div className="rounded-md border-2 border-danger bg-danger/10 p-3 text-sm font-semibold text-danger">
              Delete this order and its items permanently?{" "}
              <button className="underline underline-offset-2" onClick={handleDelete}>
                Yes, delete
              </button>
            </div>
          ) : null
        }
      />
    </Screen>
  );
}