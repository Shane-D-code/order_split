import "fake-indexeddb/auto";
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { db } from "../../src/db/database";
import { addFamilyMember, listFamilyMembers } from "../../src/db/repositories/family";
import {
  tryInsertReceivedOrder,
  getReceivedOrder,
  orderDedupKey,
} from "../../src/db/repositories/received";
import { createOrder, getOrder } from "../../src/db/repositories/orders";
import { buildOrder, createOrderItem } from "../../src/domain/order";
import {
  senderName,
  UNKNOWN_SENDER_LABEL,
} from "../../src/domain/family";
import { ReceivedDetailPage } from "../../src/pages/ReceivedDetailPage";
import { OrderDetailPage } from "../../src/pages/OrderDetailPage";
import { OrderCard } from "../../src/components/orders/OrderCard";
import { TodayPage } from "../../src/pages/TodayPage";
import { HistoryPage } from "../../src/pages/HistoryPage";
import { SyncProvider } from "../../src/app/SyncContext";
import { localDayKey } from "../../src/lib/dates";
import { stopSyncLoopForTests } from "../../src/sync/sync-store";
import type { ReceivedOrder, FamilyMember } from "../../src/domain/types";

afterEach(() => {
  stopSyncLoopForTests();
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function addPeerMember(overrides: {
  deviceId: string;
  displayName: string;
}): Promise<FamilyMember> {
  const member: FamilyMember = {
    deviceId: overrides.deviceId,
    role: "peer",
    displayName: overrides.displayName,
    publicKeyJwk: { key_ops: [] } as unknown as JsonWebKey,
    pairingStatus: "connected",
    createdAt: new Date().toISOString(),
  };
  await addFamilyMember(member);
  return member;
}

function sampleReceived(overrides: Partial<ReceivedOrder> = {}): ReceivedOrder {
  const base = buildOrder({
    id: "order-1",
    platform: "blinkit",
    orderedAt: "2026-09-13T09:42:00",
    items: [createOrderItem({ name: "Eggs", quantity: 1, unitPrice: 18600 })],
    subtotal: 18600,
    deliveryFee: 0,
    handlingFee: 0,
    packagingFee: 0,
    tax: 0,
    discount: 0,
    sourceType: "screenshot",
  });
  return {
    ...base,
    receivedAt: "2026-09-13T09:45:00",
    fromDeviceId: "dev-shantanu",
    dedupKey: orderDedupKey(base.id, "msg-1"),
    syncMessageId: "msg-1",
    ...overrides,
  };
}

/* -------------------------------------------------------------- */
/* Data-layer tests                                               */
/* -------------------------------------------------------------- */

describe("received order sender identity (data)", () => {
  it("stores fromDeviceId with the received order and round-trips through the repository", async () => {
    const received = sampleReceived();
    const inserted = await tryInsertReceivedOrder(received);
    expect(inserted).not.toBeNull();

    const reloaded = await getReceivedOrder(received.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.fromDeviceId).toBe("dev-shantanu");
  });

  it("resolves senderDeviceId to the correct FamilyMember.name after a reload", async () => {
    await addPeerMember({ deviceId: "dev-shantanu", displayName: "Shantanu" });
    await tryInsertReceivedOrder(sampleReceived());

    const reloaded = await getReceivedOrder("order-1");
    expect(reloaded).not.toBeNull();

    const members = await listFamilyMembers();
    expect(senderName(reloaded!.fromDeviceId, members)).toBe("Shantanu");
  });

  it("sender name survives page refresh/reopen (fresh DB reads)", async () => {
    await addPeerMember({ deviceId: "dev-shantanu", displayName: "Shantanu" });
    await tryInsertReceivedOrder(sampleReceived());

    const freshMembers = await listFamilyMembers();
    expect(senderName("dev-shantanu", freshMembers)).toBe("Shantanu");
  });

  it("unresolved sender has a safe fallback", async () => {
    await tryInsertReceivedOrder(
      sampleReceived({ fromDeviceId: "dev-orphan", id: "order-orphan" }),
    );
    const members = await listFamilyMembers();
    const received = await getReceivedOrder("order-orphan");
    expect(senderName(received!.fromDeviceId, members)).toBe(UNKNOWN_SENDER_LABEL);
  });

  it("own orders are not affected by the sender model", async () => {
    const ownOrder = buildOrder({
      id: "own-1",
      platform: "blinkit",
      orderedAt: "2026-09-13T10:00:00",
      items: [createOrderItem({ name: "Milk", quantity: 1, unitPrice: 4500 })],
      subtotal: 4500,
      deliveryFee: 0,
      handlingFee: 0,
      packagingFee: 0,
      tax: 0,
      discount: 0,
      sourceType: "manual",
    });
    await createOrder(ownOrder);

    // Own order is in the orders table, not receivedOrders. Verify no fromDeviceId.
    const own = await getOrder("own-1");
    expect(own).not.toBeNull();
    expect(own!).not.toHaveProperty("fromDeviceId");
  });
});

/* -------------------------------------------------------------- */
/* UI tests                                                       */
/* -------------------------------------------------------------- */

describe("received order sender display (UI)", () => {
  it("ReceivedDetailPage shows 'From <member name>'", async () => {
    await addPeerMember({ deviceId: "dev-shantanu", displayName: "Shantanu" });
    await tryInsertReceivedOrder(sampleReceived());

    render(
      <MemoryRouter initialEntries={["/received/order-1"]}>
        <Routes>
          <Route path="/received/:id" element={<ReceivedDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/From Shantanu/)).toBeTruthy();
    });
  });

  it("ReceivedDetailPage shows safe fallback for unknown sender", async () => {
    await tryInsertReceivedOrder(
      sampleReceived({ fromDeviceId: "dev-orphan", id: "order-orphan" }),
    );

    render(
      <MemoryRouter initialEntries={["/received/order-orphan"]}>
        <Routes>
          <Route path="/received/:id" element={<ReceivedDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(new RegExp(UNKNOWN_SENDER_LABEL))).toBeTruthy();
    });
  });

  it("OrderCard renders 'From <name>' only when from prop is provided", async () => {
    const { unmount } = render(
      <MemoryRouter>
        <OrderCard
          platform="blinkit"
          orderedAt="2026-09-13T09:42:00"
          total={18600}
          itemCount={2}
          to="/x"
          from="Shantanu"
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/From Shantanu/)).toBeTruthy();

    unmount();

    render(
      <MemoryRouter>
        <OrderCard
          platform="blinkit"
          orderedAt="2026-09-13T09:42:00"
          total={18600}
          itemCount={2}
          to="/x"
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/From\s/)).toBeNull();
  });

  it("own order detail page does not show a sender", async () => {
    const ownOrder = buildOrder({
      id: "own-1",
      platform: "blinkit",
      orderedAt: "2026-09-13T10:00:00",
      items: [createOrderItem({ name: "Milk", quantity: 1, unitPrice: 4500 })],
      subtotal: 4500,
      deliveryFee: 0,
      handlingFee: 0,
      packagingFee: 0,
      tax: 0,
      discount: 0,
      sourceType: "manual",
    });
    await createOrder(ownOrder);

    render(
      <MemoryRouter initialEntries={["/order/own-1"]}>
        <Routes>
          <Route path="/order/:id" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Order" })).toBeTruthy();
    });
    expect(screen.queryByText(/From\s/)).toBeNull();
  });

  it("TodayPage shows 'From <member name>' on received cards", async () => {
    await addPeerMember({ deviceId: "dev-shantanu", displayName: "Shantanu" });
    await tryInsertReceivedOrder(
      sampleReceived({ orderedAt: `${localDayKey()}T09:42:00` }),
    );

    render(
      <SyncProvider>
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<TodayPage />} />
          </Routes>
        </MemoryRouter>
      </SyncProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/From Shantanu/)).toBeTruthy();
    });
  });

  it("HistoryPage shows 'From <member name>' on received rows", async () => {
    await addPeerMember({ deviceId: "dev-shantanu", displayName: "Shantanu" });
    await tryInsertReceivedOrder(sampleReceived());

    render(
      <MemoryRouter initialEntries={["/history"]}>
        <Routes>
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/From Shantanu/)).toBeTruthy();
    });
  });
});
