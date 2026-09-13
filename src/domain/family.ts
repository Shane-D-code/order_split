import type { FamilyMember } from "./types";

/**
 * Label shown when a received order's sender cannot be matched to a paired
 * FamilyMember. Kept in the domain layer so every surface (Today, History,
 * received detail) shows the same fallback.
 */
export const UNKNOWN_SENDER_LABEL = "Family member";

/** Resolve a FamilyMember (or nothing) to its human-readable display name. */
export function memberDisplayName(member: FamilyMember | null | undefined): string {
  return member?.displayName || UNKNOWN_SENDER_LABEL;
}

/**
 * Resolve a received order's senderDeviceId against the paired family list.
 * Never infers the sender from order contents; returns the safe fallback
 * when the device is no longer paired.
 */
export function senderName(fromDeviceId: string | undefined, members: FamilyMember[]): string {
  if (!fromDeviceId) return UNKNOWN_SENDER_LABEL;
  const member = members.find((m) => m.deviceId === fromDeviceId);
  return member?.displayName || UNKNOWN_SENDER_LABEL;
}