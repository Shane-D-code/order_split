import type { DeviceIdentity, EncryptedPayload } from "../domain/types";

/**
 * Typed client for the Cloudflare Worker relay. The relay is a dumb
 * encrypted mailbox: it sees only routing ids, encrypted payloads and
 * timestamps. All requests are authenticated with the device secret.
 */

export class RelayError extends Error {
  constructor(
    message: string,
    public readonly kind: "network" | "auth" | "http" | "expired",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "RelayError";
  }
}

export interface RelayMessage {
  id: string;
  type: "order" | "pairing-ack";
  senderDeviceId: string;
  payload: EncryptedPayload;
}

export interface RelayHttp {
  baseUrl: string;
  identity: DeviceIdentity;
}

export function createRelayClient(relay: RelayHttp) {
  const base = relay.baseUrl.replace(/\/+$/, "");

  async function request(
    method: string,
    path: string,
    opts: { body?: unknown; deviceToken?: string; timeoutMs?: number } = {},
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(opts.deviceToken ? { "X-Device-Token": opts.deviceToken } : {}),
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: controller.signal,
      });
    } catch (err) {
      const e = err as Error;
      throw new RelayError(
        e.name === "AbortError" ? "Relay request timed out" : "Network error reaching relay",
        e.name === "AbortError" ? "network" : "network",
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) {
      throw new RelayError("Relay rejected device credentials", "auth", res.status);
    }
    if (res.status === 410) {
      throw new RelayError("Message or pairing code expired", "expired", res.status);
    }
    if (!res.ok) {
      throw new RelayError(`Relay error ${res.status}`, "http", res.status);
    }
    try {
      return await res.json();
    } catch {
      return undefined;
    }
  }

  return {
    async initiatePairing() {
      const data = (await request("POST", "/pair/initiate", {
        deviceToken: relay.identity.secret,
        body: {
          deviceId: relay.identity.deviceId,
          displayName: relay.identity.displayName,
        },
      })) as { pairingCode: string };
      return data.pairingCode;
    },

    async completePairing(pairingCode: string, ack: EncryptedPayload) {
      await request("POST", "/pair/complete", {
        deviceToken: relay.identity.secret,
        body: {
          pairingCode,
          fromDeviceId: relay.identity.deviceId,
          // The ACK is already encrypted to the invite owner on-device.
          ack,
        },
      });
    },

    async sendMessage(recipientDeviceId: string, message: RelayMessage) {
      await request("POST", "/messages", {
        deviceToken: relay.identity.secret,
        body: {
          messageId: message.id,
          recipientDeviceId,
          type: message.type,
          senderDeviceId: message.senderDeviceId,
          payload: message.payload,
        },
      });
    },

    async fetchMessages(): Promise<RelayMessage[]> {
      const data = (await request("GET", "/messages", {
        deviceToken: relay.identity.secret,
      })) as { messages: RelayMessage[] };
      return data.messages ?? [];
    },

    async acknowledgeMessage(messageId: string) {
      await request("POST", `/messages/${encodeURIComponent(messageId)}/ack`, {
        deviceToken: relay.identity.secret,
      });
    },
  };
}

export type RelayClient = ReturnType<typeof createRelayClient>;

/** The payload envelope placed inside an encrypted message body. */
export interface OrderEnvelope {
  v: 1;
  type: "order";
  senderDeviceId: string;
  senderDisplayName?: string;
  orderId: string;
  sentAt: string;
  order: import("../domain/types").Order;
}

export interface PairingAckEnvelope {
  v: 1;
  type: "pairing-ack";
  deviceId: string;
  publicKeyJwk: JsonWebKey;
  displayName: string;
  createdAt: string;
}