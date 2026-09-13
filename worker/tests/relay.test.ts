import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleApi, generatePairingCode, minuteKey } from "../src/relay";
import type { Env, KVPutOptions, KVStore } from "../src/env";

class InMemoryKV implements KVStore {
  private map = new Map<string, { value: string; ttl?: number }>();
  get(key: string): Promise<string | null>;
  get(key: string, type: "text"): Promise<string | null>;
  get(key: string, type: "json"): Promise<unknown>;
  async get(key: string, type?: "text" | "json"): Promise<string | null | unknown> {
    const entry = this.map.get(key);
    if (!entry) return null;
    return type === "json" ? JSON.parse(entry.value) : entry.value;
  }
  async put(key: string, value: string, opts?: KVPutOptions): Promise<void> {
    this.map.set(key, { value, ttl: opts?.expirationTtl });
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
  async list(opts: { prefix: string }): Promise<{ keys: Array<{ name: string }> }> {
    const keys = [...this.map.keys()].filter((k) => k.startsWith(opts.prefix)).map((name) => ({ name }));
    return { keys };
  }
  keysWith(prefix: string): string[] {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix));
  }
}

const h = (method: string, path: string, token?: string, body?: unknown): Request => {
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Device-Token": token } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
  return new Request(`https://relay.example.workers.dev${path}`, init);
};

async function response(request: Request, kv: InMemoryKV): Promise<{ status: number; data: unknown }> {
  const env: Env = { MAILBOX: kv };
  const res = await handleApi(request, env);
  const data = (await res.json()) as unknown;
  return { status: res.status, data };
}

function seal(): { ciphertext: string; iv: string; salt: string } {
  return { ciphertext: "c0", iv: "i0", salt: "s0" };
}

let kv: InMemoryKV;

beforeEach(() => {
  kv = new InMemoryKV();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generation helpers", () => {
  it("produces unambiguous short codes", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generatePairingCode()));
    expect(codes.size).toBe(500);
    for (const c of codes) expect(/^[A-HJ-KM-NP-Z2-9]{8}$/.test(c)).toBe(true);
  });

  it("minuteKey is stable within a minute", () => {
    expect(minuteKey(new Date("2026-09-12T10:11:12Z"))).toBe("202609121011");
  });
});

describe("pairing", () => {
  it("initiates a code and lets the peer deliver an ACK to the owner mailbox", async () => {
    const owner = h("POST", "/pair/initiate", "tokenA", { deviceId: "deviceA", displayName: "A" });
    const initiated = await response(owner, kv);
    if (initiated.status !== 201) console.log("PROBE2", initiated.status, initiated.data);
    expect(initiated.status).toBe(201);
    const code = (initiated.data as { pairingCode: string }).pairingCode;
    expect(code).toHaveLength(8);

    const codes = kv.keysWith("pair:");
    expect(codes).toHaveLength(1);

    const peer = h("POST", "/pair/complete", "tokenB", {
      pairingCode: code,
      fromDeviceId: "deviceB",
      ack: seal(),
    });
    const completed = await response(peer, kv);
    expect(completed.status).toBe(201);

    // The ACK lands in the owner's mailbox, and the code is single-use.
    const ownerMail = kv.keysWith("mail:deviceA:");
    expect(ownerMail).toHaveLength(1);
    expect(kv.keysWith("pair:")).toHaveLength(0);
  });

  it("rejects a used/expired pairing code with 410", async () => {
    const owner = h("POST", "/pair/initiate", "tokenA", { deviceId: "deviceA", displayName: "A" });
    const { data } = await response(owner, kv);
    const code = (data as { pairingCode: string }).pairingCode;

    const peer = h("POST", "/pair/complete", "tokenB", { pairingCode: code, fromDeviceId: "deviceB", ack: seal() });
    expect((await response(peer, kv)).status).toBe(201);

    const second = h("POST", "/pair/complete", "tokenB", { pairingCode: code, fromDeviceId: "deviceB", ack: seal() });
    expect((await response(second, kv)).status).toBe(410);
  });

  it("prevents pairing with yourself", async () => {
    const owner = h("POST", "/pair/initiate", "tokenA", { deviceId: "deviceA", displayName: "A" });
    const { data } = await response(owner, kv);
    const code = (data as { pairingCode: string }).pairingCode;
    const selfie = h("POST", "/pair/complete", "tokenB", { pairingCode: code, fromDeviceId: "deviceA", ack: seal() });
    expect((await response(selfie, kv)).status).toBe(400);
  });

  it("requires credentials", async () => {
    const anon = h("POST", "/pair/initiate", undefined, { deviceId: "deviceA" });
    expect((await response(anon, kv)).status).toBe(401);
  });
});

describe("mailbox", () => {
  it("sends, lists and acknowledges messages per device", async () => {
    await response(h("POST", "/pair/initiate", "tokenA", { deviceId: "deviceA", displayName: "A" }), kv);
    await response(h("POST", "/pair/initiate", "tokenB", { deviceId: "deviceB", displayName: "B" }), kv);

    const send = h("POST", "/messages", "tokenB", {
      messageId: "m-1",
      recipientDeviceId: "deviceA",
      type: "order",
      senderDeviceId: "deviceB",
      payload: seal(),
    });
    expect((await response(send, kv)).status).toBe(201);

    const list = await response(h("GET", "/messages", "tokenA"), kv);
    expect(list.status).toBe(200);
    const messages = (list.data as { messages: unknown[] }).messages;
    expect(messages).toHaveLength(1);
    expect((messages[0] as { type: string }).type).toBe("order");
    expect((messages[0] as { payload: { ciphertext: string } }).payload.ciphertext).toBe("c0");

    // The other device sees nothing.
    const other = await response(h("GET", "/messages", "tokenB"), kv);
    expect((other.data as { messages: unknown[] }).messages).toHaveLength(0);

    const ack = await response(h("POST", "/messages/m-1/ack", "tokenA"), kv);
    expect(ack.status).toBe(200);
    expect(kv.keysWith("mail:deviceA:")).toHaveLength(0);
  });

  it("rejects a sender that does not match the token", async () => {
    await response(h("POST", "/pair/initiate", "tokenA", { deviceId: "deviceA" }), kv);
    await response(h("POST", "/pair/initiate", "tokenB", { deviceId: "deviceB" }), kv);
    const spoofed = h("POST", "/messages", "tokenA", {
      messageId: "m-9",
      recipientDeviceId: "deviceB",
      type: "order",
      senderDeviceId: "deviceB",
      payload: seal(),
    });
    expect((await response(spoofed, kv)).status).toBe(403);
  });

  it("rate limits a device past the cap", async () => {
    await response(h("POST", "/pair/initiate", "tokenA", { deviceId: "deviceA" }), kv);
    const env: Env = { MAILBOX: kv, RATE_LIMIT_PER_MINUTE: 3 };
    let last: { status: number } | null = null;
    for (let i = 0; i < 4; i++) {
      const res = await handleApi(h("GET", "/messages", "tokenA"), env);
      last = { status: res.status };
    }
    expect(last!.status).toBe(429);
  });

  it("stores only ciphertext, never plaintext order fields", async () => {
    await response(h("POST", "/pair/initiate", "tokenA", { deviceId: "deviceA" }), kv);
    await response(h("POST", "/pair/initiate", "tokenB", { deviceId: "deviceB" }), kv);
    await response(
      h("POST", "/messages", "tokenB", {
        messageId: "m-001",
        recipientDeviceId: "deviceA",
        type: "order",
        senderDeviceId: "deviceB",
        payload: { ciphertext: "<encrypted-bytes>", iv: "iv", salt: "salt" },
      }),
      kv,
    );
    const persisted = kvStoreValue(kv, kv.keysWith("mail:deviceA:")[0]);
    const parsed = JSON.parse(persisted) as {
      type: string;
      payload: Record<string, unknown>;
      senderDeviceId: string;
    };
    expect(parsed.type).toBe("order");
    expect(parsed.senderDeviceId).toBe("deviceB");
    expect(Object.keys(parsed.payload).sort()).toEqual(["ciphertext", "iv", "salt"]);
    expect(persisted).not.toContain("₹");
  });
});

function kvStoreValue(kv: InMemoryKV, key: string): string {
  return (kv as unknown as { map: Map<string, { value: string }> }).map.get(key)!.value;
}