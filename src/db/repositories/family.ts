import { db, type FamilyMemberRow } from "../database";
import type { FamilyMember } from "../../domain/types";

export async function addFamilyMember(member: FamilyMember): Promise<void> {
  const row: FamilyMemberRow = {
    deviceId: member.deviceId,
    role: member.role,
    displayName: member.displayName,
    publicKeyJwk: member.publicKeyJwk,
    pairingStatus: "connected",
    createdAt: member.createdAt,
    pairedAt: member.pairedAt,
  };
  await db.family.put(row);
}

export async function listFamilyMembers(): Promise<FamilyMember[]> {
  const rows = await db.family.toArray();
  return rows.map((r) => ({
    deviceId: r.deviceId,
    role: r.role,
    displayName: r.displayName,
    publicKeyJwk: r.publicKeyJwk,
    pairingStatus: r.pairingStatus,
    createdAt: r.createdAt,
    pairedAt: r.pairedAt,
  }));
}

export async function getFamilyMember(deviceId: string): Promise<FamilyMember | null> {
  const row = await db.family.get(deviceId);
  if (!row) return null;
  return {
    deviceId: row.deviceId,
    role: row.role,
    displayName: row.displayName,
    publicKeyJwk: row.publicKeyJwk,
    pairingStatus: row.pairingStatus,
    createdAt: row.createdAt,
    pairedAt: row.pairedAt,
  };
}

export async function removeFamilyMember(deviceId: string): Promise<void> {
  await db.family.delete(deviceId);
}

export async function countFamilyMembers(): Promise<number> {
  return db.family.count();
}

export async function clearFamily(): Promise<void> {
  await db.family.clear();
}