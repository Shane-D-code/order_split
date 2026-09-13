import type { SyncRun } from "../domain/types";
import {
  pump,
  setSyncListener,
  startSyncLoop as engineStartSyncLoop,
  stopSyncLoop as engineStopSyncLoop,
} from "./engine";

let currentRun: SyncRun | null = null;
const subscribers = new Set<(run: SyncRun | null) => void>();

function notify(run: SyncRun | null): void {
  currentRun = run;
  for (const fn of subscribers) fn(run);
}

export function getSyncRunSnapshot(): SyncRun | null {
  return currentRun;
}

export function subscribeToSyncState(fn: (run: SyncRun | null) => void): () => void {
  subscribers.add(fn);
  fn(currentRun);
  return () => {
    subscribers.delete(fn);
  };
}

export function triggerSync(): Promise<SyncRun> {
  return pump().then((run) => {
    notify(run);
    return run;
  });
}

let loopStarted = false;

/** Begins the polling loop guarded against double-start. */
export function ensureSyncLoop(): void {
  if (loopStarted) return;
  loopStarted = true;
  setSyncListener(notify);
  engineStartSyncLoop();
}

export function stopSyncLoopForTests(): void {
  engineStopSyncLoop();
  loopStarted = false;
}