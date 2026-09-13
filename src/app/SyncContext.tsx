import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Order, SyncRun } from "../domain/types";
import { enqueueOrderForSync, hasPendingSync } from "../sync/engine";
import {
  subscribeToSyncState,
  triggerSync,
  ensureSyncLoop,
} from "../sync/sync-store";

const DEFAULT_RUN: SyncRun = { sent: 0, received: 0, acked: 0, failed: 0 };

interface SyncContextValue {
  run: SyncRun;
  syncing: boolean;
  lastError: string | null;
  refresh: () => Promise<void>;
  enqueue: (order: Order) => Promise<boolean>;
  isPendingSync: (orderId: string) => Promise<boolean>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState<SyncRun>(DEFAULT_RUN);
  const [syncing, setSyncing] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToSyncState((r) => {
      if (r) {
        setRun(r);
        setLastError(r.failed > 0 ? "Some messages could not be synced yet" : null);
      } else {
        setSyncing(false);
      }
    });
    ensureSyncLoop();
    return unsub;
  }, []);

  const value: SyncContextValue = {
    run,
    syncing,
    lastError,
    refresh: async () => {
      setSyncing(true);
      try {
        await triggerSync();
      } finally {
        setSyncing(false);
      }
    },
    enqueue: (order) => enqueueOrderForSync(order),
    isPendingSync: (orderId) => hasPendingSync(orderId),
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within SyncProvider");
  return ctx;
}