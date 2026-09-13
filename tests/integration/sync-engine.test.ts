// jsdom provides atob/btoa and fake-indexeddb; WebCrypto ships with Node.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { createDeviceIdentity } from "../../src/crypto/crypto";
import { saveDeviceIdentity, getDeviceIdentity } from "../../src/db/repositories/identity";
import { addFamilyMember, clearFamily } from "../../src/db/repositories/family";
import { setRelayUrl } from "../../src/db/repositories/settings";
import { createOrder, deleteOrder } from "../../src/db/repositories/orders";
import { getReceivedOrder } from "../../src/db/repositories/received";
import { enqueueOrderForSync, flushOutbox, pollInbox } from "../../src/sync/engine";
import { buildOrder, createOrderItem } from "../../src/domain/order";
import type { DeviceIdentity } from "../../src/domain/types";

/** In-memory relay twin matching the Cloudflare Worker contract. */
class FakeRelay {
  private byRecipient = new Map<
    string,
    Array<{ id: string; type: string; senderDeviceId: string; payload: unknown }>
  >();
  private tokens = new Map<string, string>();
  private failAckWith: number | null = null;

  constructor(devices: DeviceIdentity[]) {
    for (const d of devices) this.tokens.set(d.deviceId, d.secret);
  }

  /** Simulate the relay not receiving an ACK the first time. */
  setAckFailure(status: number) {
    this.failAckWith = status;
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const token = (init?.headers as Record<string, string> | undefined)?.["X-Device-Token"];
    if (!token) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    const deviceId = [...this.tokens.entries()].find(([, s]) => s === token)?.[0];
    if (!deviceId) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

    if (url.endsWith("/messages") && (init?.method ?? "GET") === "POST") {
      const body = JSON.parse(String(init?.body)) as {
        recipientDeviceId: string;
        type: string;
        senderDeviceId: string;
        payload: unknown;
      };
      const list = this.byRecipient.get(body.recipientDeviceId) ?? [];
      list.push({
        id: `m${list.length + 1}`,
        type: body.type,
        senderDeviceId: body.senderDeviceId,
        payload: body.payload,
      });
      this.byRecipient.set(body.recipientDeviceId, list);
      return new Response(JSON.stringify({ messageId: `m${list.length}` }), { status: 201 });
    }
    if (url.endsWith("/messages") && init?.method === "GET") {
      const list = this.byRecipient.get(deviceId) ?? [];
      return new Response(JSON.stringify({ messages: list }), { status: 200 });
    }
    const ack = /\/messages\/([^/]+)\/ack$/.exec(url);
    if (ack && init?.method === "POST") {
      if (this.failAckWith) {
        return new Response(JSON.stringify({ error: "slow down" }), { status: this.failAckWith });
      }
      const id = ack[1];
      const list = this.byRecipient.get(deviceId) ?? [];
      this.byRecipient.set(deviceId, list.filter((m) => m.id !== id));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  };
}

let relay: FakeRelay;
let a: DeviceIdentity;
let b: DeviceIdentity;

async function switchTo(identity: DeviceIdentity, peers: DeviceIdentity[]): Promise<void> {
  await saveDeviceIdentity(identity);
  await clearFamily();
  for (const peer of peers) {
    await addFamilyMember({
      deviceId: peer.deviceId,
      role: "peer",
      displayName: peer.displayName,
      publicKeyJwk: peer.publicKeyJwk,
      pairingStatus: "connected",
      createdAt: new Date().toISOString(),
    });
  }
}

beforeEach(async () => {
  a = await createDeviceIdentity("Amaan");
  b = await createDeviceIdentity("Bina");
  await setRelayUrl("https://relay.test.workers.dev");
  relay = new FakeRelay([a, b]);
  globalThis.fetch = relay.fetch;
});

function sampleOrder(time: string) {
  return buildOrder({
    platform: "blinkit",
    orderedAt: time,
    items: [createOrderItem({ name: "Milk", quantity: 1, unitPrice: 6000 })],
    subtotal: 6000,
    deliveryFee: 0,
    handlingFee: 0,
    packagingFee: 0,
    tax: 0,
    discount: 0,
    sourceType: "manual",
  });
}

describe("sync engine over a fake relay", () => {
  it("flushes an order to the peer and stores it on the other device", async () => {
    await switchTo(a, [b]);
    const order = sampleOrder("2026-09-12T10:00:00");
    await createOrder(order);
    await enqueueOrderForSync(order);

    const out = await flushOutbox();
    expect(out.sent).toBe(1);
    expect(out.failed).toBe(0);

    // Simulate the sender's phone: it already has the order locally; the
    // receiving phone is a separate device with its own empty store.
    await deleteOrder(order.id);

    await switchTo(b, [a]);
    const inbox = await pollInbox();
    expect(inbox.received).toBe(1);
    expect(inbox.acked).toBe(1);

    const received = await getReceivedOrder(order.id);
    expect(received).not.toBeNull();
    expect(received!.platform).toBe("blinkit");
    expect(received!.fromDeviceId).toBe(a.deviceId);
    const replacedSelf = await getDeviceIdentity();
    expect(received!.fromDeviceId).not.toBe(replacedSelf!.deviceId);
  });

  it("acknowledges a duplicate redelivery without adding a second order", async () => {
    await switchTo(a, [b]);
    const order = sampleOrder("2026-09-12T11:00:00");
    await createOrder(order);
    await enqueueOrderForSync(order);
    await flushOutbox();

    // Simulate the sender's phone: it already has the order locally; the
    // receiving phone is a separate device with its own empty store.
    await deleteOrder(order.id);

    await switchTo(b, [a]);
    // First attempt: stored but the relay never got the ACK.
    relay.setAckFailure(503);
    const first = await pollInbox();
    expect(first.received).toBe(1);
    expect(first.acked).toBe(0);

    // Second attempt, ACK succeeds. The message redelivers but is a duplicate.
    relay.setAckFailure(null);
    const second = await pollInbox();
    expect(second.received).toBe(0);
    expect(second.acked).toBe(1);

    const received = await getReceivedOrder(order.id);
    expect(received).not.toBeNull();
    expect(received!.items).toHaveLength(1);
  });

  it("stays quiet when no peers are paired", async () => {
    await switchTo(a, []);
    const order = buildOrder({
      platform: "other",
      orderedAt: "2026-09-12T12:00:00",
      items: [],
      subtotal: 0,
      deliveryFee: 0,
      handlingFee: 0,
      packagingFee: 0,
      tax: 0,
      discount: 0,
      total: 0,
      sourceType: "manual",
    });
    await enqueueOrderForSync(order);
    const out = await flushOutbox();
    expect(out.sent).toBe(0);

    const inbox = await pollInbox();
    expect(inbox.received).toBe(0);
    expect(inbox.acked).toBe(0);
  });
});