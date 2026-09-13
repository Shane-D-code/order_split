import type { DeviceIdentity, FamilyMember } from "../domain/types";
import {
  decryptJson,
  derivePairingKey,
  encryptJson,
  publicKeyToB64Jwk,
} from "../crypto/crypto";
import type { EncryptedPayload } from "../domain/types";
import type { PairingAckEnvelope } from "../sync/relay-client";

/**
 * Pairing invitation encoded into a QR code (or copied as text).
 * Carried in the clear — it is only good for the short invite window and
 * grants nothing beyond the ability to request a pairing.
 */
export interface PairInvite {
  v: 1;
  type: "pair-invite";
  pairingCode: string;
  deviceId: string;
  displayName: string;
  publicKeyJwkB64: string;
  pairingSeedB64: string;
  relayUrl: string;
  homeUrl: string;
  createdAt: string;
}

function defaultHomeUrl(): string {
  return typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "/";
}

export function buildPairInvite(
  identity: DeviceIdentity,
  pairingCode: string,
  relayUrl: string,
  pairingSeedB64: string,
): PairInvite {
  return {
    v: 1,
    type: "pair-invite",
    pairingCode,
    deviceId: identity.deviceId,
    displayName: identity.displayName,
    publicKeyJwkB64: publicKeyToB64Jwk(identity.publicKeyJwk),
    pairingSeedB64,
    relayUrl,
    homeUrl: defaultHomeUrl(),
    createdAt: new Date().toISOString(),
  };
}

export function parsePairInvite(text: string): PairInvite | null {
  try {
    const parsed = JSON.parse(text.trim()) as Partial<PairInvite>;
    if (
      parsed.v === 1 &&
      parsed.type === "pair-invite" &&
      typeof parsed.pairingCode === "string" &&
      typeof parsed.deviceId === "string" &&
      typeof parsed.publicKeyJwkB64 === "string" &&
      typeof parsed.pairingSeedB64 === "string"
    ) {
      return parsed as PairInvite;
    }
    return null;
  } catch {
    return null;
  }
}

export function inviteToText(invite: PairInvite): string {
  return JSON.stringify(invite);
}

/** The parent side: encrypt an ACK with the invite seed and deliver it. */
export async function buildPairingAck(
  invite: PairInvite,
  parentIdentity: DeviceIdentity,
): Promise<EncryptedPayload> {
  const key = await derivePairingKey(invite.pairingSeedB64);
  const envelope: PairingAckEnvelope = {
    v: 1,
    type: "pairing-ack",
    deviceId: parentIdentity.deviceId,
    publicKeyJwk: parentIdentity.publicKeyJwk,
    displayName: parentIdentity.displayName,
    createdAt: new Date().toISOString(),
  };
  return encryptJson(key, envelope);
}

/** Child side: decrypt the incoming ACK and store the parent as family. */
export async function finalizePairing(
  pairingSeedB64: string,
  ack: EncryptedPayload,
): Promise<FamilyMember> {
  const key = await derivePairingKey(pairingSeedB64);
  const envelope = await decryptJson<PairingAckEnvelope>(key, ack);
  if (envelope.v !== 1 || envelope.type !== "pairing-ack") {
    throw new Error("Malformed pairing acknowledgement");
  }
  return {
    deviceId: envelope.deviceId,
    role: "peer",
    displayName: envelope.displayName,
    publicKeyJwk: envelope.publicKeyJwk,
    pairingStatus: "connected",
    createdAt: envelope.createdAt,
    pairedAt: envelope.createdAt,
  };
}