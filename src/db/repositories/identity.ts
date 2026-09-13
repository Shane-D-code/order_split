import { db, type DeviceRow } from "../database";
import type { DeviceIdentity } from "../../domain/types";

export async function getDeviceIdentity(): Promise<DeviceIdentity | null> {
  const row = await db.devices.get("self");
  if (!row) return null;
  return {
    deviceId: row.deviceId,
    secret: row.secret,
    publicKeyJwk: row.publicKeyJwk,
    privateKeyJwk: row.privateKeyJwk,
    displayName: row.displayName,
    createdAt: row.createdAt,
  };
}

export async function saveDeviceIdentity(identity: DeviceIdentity): Promise<void> {
  const row: DeviceRow = {
    id: "self",
    deviceId: identity.deviceId,
    secret: identity.secret,
    publicKeyJwk: identity.publicKeyJwk,
    privateKeyJwk: identity.privateKeyJwk,
    displayName: identity.displayName,
    createdAt: identity.createdAt,
  };
  await db.devices.put(row);
}

export async function hasDeviceIdentity(): Promise<boolean> {
  return (await db.devices.get("self")) !== undefined;
}