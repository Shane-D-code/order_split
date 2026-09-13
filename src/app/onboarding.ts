import { useEffect, useState } from "react";
import type { DeviceIdentity } from "../domain/types";
import { createDeviceIdentity } from "../crypto/crypto";
import {
  getDeviceIdentity,
  saveDeviceIdentity,
} from "../db/repositories/identity";
import { getDisplayName, setDisplayName } from "../db/repositories/settings";

/**
 * Ensure a device identity exists. This is the local "account": a random
 * secret + ECDH key pair. Nothing is ever exported; the human-readable
 * display name is stored locally and shared through pairing invites only.
 */
export function useIdentity() {
  const [identity, setIdentity] = useState<DeviceIdentity | null | undefined>(undefined);
  const [name, setName] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const id = await getDeviceIdentity();
      let display = await getDisplayName();
      if (id && !display) {
        display = id.displayName;
        await setDisplayName(display);
      }
      if (alive) {
        setIdentity(id);
        setName(display);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function createIdentity(displayName: string) {
    const trimmed = displayName.trim() || "Me";
    const id = await createDeviceIdentity(trimmed);
    await saveDeviceIdentity(id);
    await setDisplayName(trimmed);
    setIdentity(id);
    setName(trimmed);
    return id;
  }

  async function rename(displayName: string) {
    await setDisplayName(displayName.trim());
    setName(displayName.trim());
    if (identity) {
      await saveDeviceIdentity({ ...identity, displayName: displayName.trim() });
      setIdentity({ ...identity, displayName: displayName.trim() });
    }
  }

  return {
    /** true while loading, null when none exists, DeviceIdentity when ready */
    identity,
    name,
    createIdentity,
    rename,
  };
}