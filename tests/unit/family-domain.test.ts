import { describe, it, expect } from "vitest";
import {
  senderName,
  memberDisplayName,
  UNKNOWN_SENDER_LABEL,
} from "../../src/domain/family";
import type { FamilyMember } from "../../src/domain/types";

function member(deviceId: string, displayName: string): FamilyMember {
  return {
    deviceId,
    role: "peer",
    displayName,
    publicKeyJwk: { key_ops: [] } as unknown as JsonWebKey,
    pairingStatus: "connected",
    createdAt: new Date().toISOString(),
  };
}

describe("senderName", () => {
  it("resolves senderDeviceId to the matching FamilyMember name", () => {
    const members = [
      member("dev-a", "Shantanu"),
      member("dev-b", "Amaan"),
    ];
    expect(senderName("dev-a", members)).toBe("Shantanu");
  });

  it("falls back safely when the sender is no longer paired", () => {
    const members = [member("dev-a", "Shantanu")];
    expect(senderName("dev-gone", members)).toBe(UNKNOWN_SENDER_LABEL);
  });

  it("falls back safely when no fromDeviceId is present", () => {
    expect(senderName(undefined, [member("dev-a", "Shantanu")])).toBe(UNKNOWN_SENDER_LABEL);
  });

  it("falls back safely on an empty paired list", () => {
    expect(senderName("dev-a", [])).toBe(UNKNOWN_SENDER_LABEL);
  });
});

describe("memberDisplayName", () => {
  it("returns the member display name", () => {
    expect(memberDisplayName(member("dev-a", "Bina"))).toBe("Bina");
  });

  it("falls back for a missing member", () => {
    expect(memberDisplayName(null)).toBe(UNKNOWN_SENDER_LABEL);
    expect(memberDisplayName(undefined)).toBe(UNKNOWN_SENDER_LABEL);
  });
});