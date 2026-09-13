/**
 * Friendly sync status sticker. States keep the queue internals abstract:
 * synced / syncing / waiting / delayed. Healthy states stay quiet —
 * only warning/error states get prominent treatment.
 */
export function SyncPill({
  syncing,
  failed,
  hasRun,
}: {
  syncing: boolean;
  failed: number;
  hasRun: boolean;
}) {
  if (syncing) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-teal-deep/60 bg-surface px-2.5 py-1 text-xs font-extrabold text-teal-deep">
        <span className="h-2.5 w-2.5 animate-spin rounded-full border-[2px] border-teal-deep border-t-transparent" />
        Syncing…
      </span>
    );
  }
  if (failed > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-tomato bg-tomato/10 px-2.5 py-1 text-xs font-extrabold text-danger">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-tomato text-[10px] font-black text-on-ink">
          !
        </span>
        Sync delayed
      </span>
    );
  }
  if (hasRun) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-ink/25 bg-surface/80 px-2.5 py-1 text-xs font-extrabold text-muted">
        <span className="h-2 w-2 rounded-full bg-leaf" />
        Synced
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-ink/20 bg-surface/70 px-2.5 py-1 text-xs font-extrabold text-muted/80">
      <span className="h-2 w-2 rounded-full bg-muted" />
      Waiting for connection
    </span>
  );
}