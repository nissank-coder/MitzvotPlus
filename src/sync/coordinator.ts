import type { SyncStatus } from './engine';

/**
 * Round 12.5 – who may sync, and when. One run at a time per data space and session generation;
 * every sign-out, account switch or consent change starts a new generation, and a run of an older
 * generation is "not current" any more: whatever it still receives is dropped.
 */
export function createSyncCoordinator() {
  let generation = 0;
  let running: { key: string; promise: Promise<SyncStatus> } | null = null;
  return {
    /** Invalidates every run in flight (their later responses are not applied). */
    cancel() {
      generation += 1;
    },
    get generation() {
      return generation;
    },
    /**
     * Starts `job` for `space`, or joins the run already in progress for the same space and
     * generation. `job` gets isCurrent() to check before applying anything.
     */
    run(space: string, currentSpace: () => string, job: (isCurrent: () => boolean) => Promise<SyncStatus>): Promise<SyncStatus> {
      const gen = generation;
      const key = `${space}#${gen}`;
      if (running?.key === key) return running.promise;
      const isCurrent = () => generation === gen && currentSpace() === space;
      const promise = job(isCurrent).finally(() => {
        if (running?.key === key) running = null;
      });
      running = { key, promise };
      return promise;
    },
  };
}
