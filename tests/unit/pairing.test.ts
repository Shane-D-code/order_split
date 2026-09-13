// jsdom provides atob/btoa; WebCrypto is available via the Node runtime.
import { describe, it, expect } from "vitest";
import {
  buildPairInvite,
  parsePairInvite,
  inviteToText,
  buildPairingAck,
  finalizePairing,
} from "../../src/pairing/pairing";
import { createDeviceIdentity, derivePairingKey, encryptJson } from "../../src/crypto/crypto";

function stubIdentity(name = "Test") {
  return createDeviceIdentity(name);
}

describe("pairing protocol (crypto roundtrip)", () => {
  it("invite text survives a QR roundtrip", async () => {
    const identity = await stubIdentity("Shantanu");
    const invite = buildPairInvite(
      identity,
      "AB12CD",
      "https://relay.example.workers.dev",
      "c2VlZA",
    );
    const text = inviteToText(invite);
    const parsed = parsePairInvite(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.pairingCode).toBe("AB12CD");
    expect(parsed!.deviceId).toBe(identity.deviceId);
    expect(parsed!.relayUrl).toBe("https://relay.example.workers.dev");
    expect(parsed!.homeUrl).toBeTruthy();
  });

  it("rejects junk and unrelated JSON as invites", () => {
    expect(parsePairInvite("hello")).toBeNull();
    expect(parsePairInvite('{"v":2,"type":"pair-invite"}')).toBeNull();
    expect(parsePairInvite("")).toBeNull();
  });

  it("child can decrypt the ACK the parent encrypts via the invite seed", async () => {
    const child = await stubIdentity("Child");
    const parent = await stubIdentity("Parent");
    const seed = "c2VlZDEyMzQ1Njc=";

    const invite = buildPairInvite(child, "CODE1", "https://relay.example.workers.dev", seed);
    expect(invite).toBeTruthy();

    // Parent side: read the invite, agree with the seed, encrypt the ACK.
    const rehydrated = parsePairInvite(inviteToText(invite))!;
    const ack = await buildPairingAck(rehydrated, parent);

    // Child side: derive the same key and decrypt.
    const member = await finalizePairing(seed, ack);
    expect(member.deviceId).toBe(parent.deviceId);
    expect(member.displayName).toBe("Parent");
    expect(member.publicKeyJwk).toEqual(parent.publicKeyJwk);
    expect(member.pairingStatus).toBe("connected");
  });

  it("wrong seed cannot decrypt the ACK", async () => {
    const parent = await stubIdentity("Parent");
    const invite = buildPairInvite(
      await stubIdentity("Child"),
      "CODE2",
      "https://relay.example.workers.dev",
      "c2VlZEE=" /* base64url for seedA */,
    );
    const ack = await buildPairingAck(invite, parent);
    await expect(finalizePairing("c2VlZEI=" /* seedB */, ack)).rejects.toThrow();
  });

  it("seeds can also be passed by value (symmetric agreement)", async () => {
    const key = await derivePairingKey("shared-seed");
    expect(key).toBeDefined();
    const payload = await encryptJson(key, { hello: "world" });
    expect(payload.ciphertext.length).toBeGreaterThan(10);
  });
});