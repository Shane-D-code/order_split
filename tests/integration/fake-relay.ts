import type { DeviceIdentity } from "../../src/domain/types";

/**
 * In-memory relay twin matching the Cloudflare Worker contract, including
 * the pairing handshake routes (initiate/complete) and the message mailbox.
 */
interface StoredMail {
  id: string;
  type: string;
  senderDeviceId: string;
  payload: unknown;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export class FakeRelay {
  private byRecipient = new Map<string, StoredMail[]>();
  private tokens = new Map<string, string>();
  private pairCodes = new Map<string, { ownerDeviceId: string; createdAt: string }>();
  private failAckWith: number | null = null;
  private codeCounter = 0;

  constructor(devices: DeviceIdentity[]) {
    for (const d of devices) this.tokens.set(d.deviceId, d.secret);
  }

  /** Simulate the relay not delivering an ACK the first time(s). */
  setAckFailure(status: number | null) {
    this.failAckWith = status;
  }

  generatePairingCode(): string {
    this.codeCounter += 1;
    return `CODE${this.codeCounter}`;
  }

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const token = (init?.headers as Record<string, string> | undefined)?.["X-Device-Token"];
    if (!token) return json(401, { error: "unauthorized" });
    const deviceId = [...this.tokens.entries()].find(([, s]) => s === token)?.[0];
    if (!deviceId) return json(401, { error: "unauthorized" });

    if (url.endsWith("/pair/initiate") && method === "POST") {
      const pairingCode = this.generatePairingCode();
      this.pairCodes.set(pairingCode, { ownerDeviceId: deviceId, createdAt: new Date().toISOString() });
      return json(201, { pairingCode });
    }

    if (url.endsWith("/pair/complete") && method === "POST") {
      const body = JSON.parse(String(init?.body)) as {
        pairingCode: string;
        fromDeviceId: string;
        ack: unknown;
      };
      const pair = this.pairCodes.get(body.pairingCode);
      if (!pair) return json(410, { error: "Pairing code expired" });
      if (pair.ownerDeviceId === body.fromDeviceId) {
        return json(400, { error: "Cannot pair with yourself" });
      }
      const list = this.byRecipient.get(pair.ownerDeviceId) ?? [];
      list.push({
        id: `pair-${body.pairingCode}`,
        type: "pairing-ack",
        senderDeviceId: body.fromDeviceId,
        payload: body.ack,
      });
      this.byRecipient.set(pair.ownerDeviceId, list);
      this.pairCodes.delete(body.pairingCode);
      return json(201, { ok: true });
    }

    if (url.endsWith("/messages") && method === "POST") {
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
      return json(201, { messageId: `m${list.length}` });
    }

    if (url.endsWith("/messages") && method === "GET") {
      const list = this.byRecipient.get(deviceId) ?? [];
      return json(200, { messages: list });
    }

    const ack = /\/messages\/([^/]+)\/ack$/.exec(url);
    if (ack && method === "POST") {
      if (this.failAckWith !== null) {
        return json(this.failAckWith, { error: "slow down" });
      }
      const id = ack[1];
      const list = this.byRecipient.get(deviceId) ?? [];
      this.byRecipient.set(deviceId, list.filter((m) => m.id !== id));
      return json(200, { ok: true });
    }

    return json(404, { error: "not found" });
  };
}