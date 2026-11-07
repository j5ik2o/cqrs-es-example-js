export type StartupResynchronizer = {
  /** Runs the full reconciliation once; later calls are no-ops. */
  run(): Promise<void>;
};

/**
 * Memoizes a cold-start reconciliation for the lifetime of one process. A
 * successful run is kept, so warm Lambda invocations do not rescan the head
 * table. A failed run is forgotten, so the next invocation retries it instead
 * of failing forever on a cached rejection.
 */
export function createStartupResynchronizer(
  resynchronize: () => Promise<void>,
): StartupResynchronizer {
  let inFlight: Promise<void> | undefined;
  let completed = false;

  return Object.freeze({
    async run(): Promise<void> {
      if (completed) {
        return;
      }
      if (inFlight !== undefined) {
        return inFlight;
      }
      inFlight = resynchronize()
        .then(() => {
          completed = true;
        })
        .finally(() => {
          inFlight = undefined;
        });
      return inFlight;
    },
  });
}
