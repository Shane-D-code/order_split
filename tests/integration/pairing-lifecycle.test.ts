// jsdom provides atob/btoa and fake-indexeddb; WebCrypto ships with Node.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import type { DeviceIdentity } from "../../src/domain/types";
import { createDeviceIdentity } from "../../src/crypto/crypto";
import { saveDeviceIdentity } from "../../src/db/repositories/identity";
import { clearFamily, listFamilyMembers, addFamilyMember } from "../../src/db/repositories/family";
import { setRelayUrl, getSetting } from "../../src/db/repositories/settings";
import { pollInbox, savePairingSeed } from "../../src/sync/engine";
import { createRelayClient } from "../../src/sync/relay-client";
import {
  buildPairInvite,
  buildPairingAck,
  inviteToText,
  parsePairInvite,
} from "../../src/pairing/pairing";
import { b64JwkToPublicKeyJwk } from "../../src/crypto/crypto";
import { FakeRelay } from "./fake-relay";

const RELAY = "https://relay.test.workers.dev";
const PAIRING_SEEDS_KEY = "pendingPairingSeeds";

let relay: FakeRelay;
let a: DeviceIdentity;
let b: DeviceIdentity;

async function asDevice(identity: DeviceIdentity): Promise<void> {
  await saveDeviceIdentity(identity);
  await clearFamily();
}

async function pendingSeeds(): Promise<string[]> {
  const raw = (await getSetting(PAIRING_SEEDS_KEY, "[]")) ?? "[]";
  return JSON.parse(raw) as string[];
}

/** Phone A (initiator): create an invite and persist the pairing seed. */
async function createInviteOnA(seedB64: string) {
  const code = await createRelayClient({ baseUrl: RELAY, identity: a }).initiatePairing();
  const invite = buildPairInvite(a, code, RELAY, seedB64);
  await savePairingSeed(seedB64);
  return { code, invite };
}

/** Phone B (acceptor): complete the handshake with the initiator's invite. */
async function acceptOnB(inviteText: string) {
  const invite = parsePairInvite(inviteText)!;
  const ack = await buildPairingAck(invite, b);
  const client = createRelayClient({ baseUrl: invite.relayUrl, identity: b });
  await client.completePairing(invite.pairingCode, ack);
  await addFamilyMember({
    deviceId: invite.deviceId,
    role: "peer",
    displayName: invite.displayName,
    publicKeyJwk: b64JwkToPublicKeyJwk(invite.publicKeyJwkB64),
    pairingStatus: "connected",
    createdAt: new Date().toISOString(),
    pairedAt: new Date().toISOString(),
  });
}

beforeEach(async () => {
  a = await createDeviceIdentity("Amaan");
  b = await createDeviceIdentity("Bina");
  await setRelayUrl(RELAY);
  relay = new FakeRelay([a, b]);
  globalThis.fetch = relay.fetch;
});

describe("pairing lifecycle over the relay", () => {
  it("initiator stays pending before the ack, both sides end connected with the same peers", async () => {
    await asDevice(a);
    const seed = "c2VlZA";
    const { code, invite } = await createInviteOnA(seed);

    // Before the ack: the initiator has no member yet and the invite is still pending.
    expect(await listFamilyMembers()).toHaveLength(0);
    expect(await pendingSeeds()).toContain(seed);

    // Phone B accepts by reading the invite out of the QR text.
    await asDevice(b);
    await acceptOnB(inviteToText(invite));

    const membersB = await listFamilyMembers();
    expect(membersB).toHaveLength(1);
    expect(membersB[0].deviceId).toBe(a.deviceId);
    expect(membersB[0].pairingStatus).toBe("connected");
    expect(membersB[0].publicKeyJwk).toEqual(a.publicKeyJwk);

    // Phone A polls its inbox and processes the pairing-ack.
    await asDevice(a);
    expect(await listFamilyMembers()).toHaveLength(0);
    const run = await pollInbox();
    expect(run.acked).toBe(1);
    expect(run.failed).toBe(0);

    const membersA = await listFamilyMembers();
    expect(membersA).toHaveLength(1);
    expect(membersA[0].deviceId).toBe(b.deviceId);
    expect(membersA[0].pairingStatus).toBe("connected");
    expect(membersA[0].publicKeyJwk).toEqual(b.publicKeyJwk);
    expect(membersA[0].displayName).toBe("Bina");

    // The invite is no longer pending once the ack was consumed by the relay.
    expect(await pendingSeeds()).not.toContain(seed);
    expect(code.length).toBeGreaterThan(0);
  });

  it("is idempotent when the ack is redelivered because the relay ACK failed", async () => {
    await asDevice(a);
    const seed = "c2VlZA";
    const { invite } = await createInviteOnA(seed);

    await asDevice(b);
    await acceptOnB(inviteToText(invite));

    // Phone A polls while the relay refuses to ACK: member is stored once,
    // the seed is kept so the redelivery can still be matched.
    await asDevice(a);
    relay.setAckFailure(503);
    const first = await pollInbox();
    expect(first.acked).toBe(0);
    expect(first.failed).toBe(1);
    expect(await listFamilyMembers()).toHaveLength(1);
    expect(await pendingSeeds()).toContain(seed);

    const second = await pollInbox();
    expect(second.acked).toBe(0);
    expect(await listFamilyMembers()).toHaveLength(1);

    // Once the relay accepts the ACK, the pending seed is consumed.
    relay.setAckFailure(null);
    const third = await pollInbox();
    expect(third.acked).toBe(1);
    expect(await listFamilyMembers()).toHaveLength(1);
    expect(await pendingSeeds()).not.toContain(seed);

    const members = await listFamilyMembers();
    expect(members[0].deviceId).toBe(b.deviceId);
    expect(members[0].pairingStatus).toBe("connected");
  });

  it("does not pair a device with itself", async () => {
    await asDevice(a);
    const seed = "c2VlZA";
    const { invite } = await createInviteOnA(seed);

    // The invite owner tries to accept its own code — the relay rejects it.
    const client = createRelayClient({ baseUrl: RELAY, identity: a });
    const ack = await buildPairingAck(invite, a);
    await expect(client.completePairing(invite.pairingCode, ack)).rejects.toThrow();
    expect(await listFamilyMembers()).toHaveLength(0);
  });
});