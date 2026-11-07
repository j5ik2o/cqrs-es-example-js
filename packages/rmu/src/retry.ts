/**
 * Bounded retry with exponential backoff and jitter. The read-model projection
 * runs inside delivery loops that retry forever (Streams, Pub/Sub), so an
 * individual event needs its own ceiling: after `maxAttempts` or
 * `maxElapsedMs` the caller decides whether to dead-letter or back off.
 */
export type RetryPolicy = {
  /** Total attempts, including the first one. Must be at least 1. */
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  /** Ceiling on the total time spent retrying one event, backoff included. */
  maxElapsedMs: number;
  /** Fraction of the exponential delay added or subtracted at random. */
  jitterRatio: number;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = Object.freeze({
  maxAttempts: 5,
  initialDelayMs: 200,
  maxDelayMs: 10_000,
  maxElapsedMs: 30_000,
  jitterRatio: 0.2,
});

export type RetryContext = {
  attempt: number;
  elapsedMs: number;
  delayMs: number;
  error: unknown;
};

export type RetryOptions = {
  policy?: RetryPolicy;
  sleep?: (millis: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  /** Returning false aborts immediately (for failures that cannot heal). */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (context: RetryContext) => void;
};

export class RetryExhaustedError extends Error {
  readonly attempts: number;
  readonly elapsedMs: number;
  readonly lastError: unknown;

  constructor(lastError: unknown, attempts: number, elapsedMs: number) {
    super(
      `Retry exhausted after ${attempts} attempt(s) in ${elapsedMs}ms: ${errorMessage(lastError)}`,
    );
    this.name = "RetryExhaustedError";
    this.attempts = attempts;
    this.elapsedMs = elapsedMs;
    this.lastError = lastError;
  }
}

/**
 * Exponential delay with symmetric jitter. `attempt` is 1-based, so the first
 * retry waits `initialDelayMs`.
 */
export function backoffDelay(
  attempt: number,
  policy: RetryPolicy,
  random: () => number = Math.random,
): number {
  const exponent = Math.max(0, attempt - 1);
  const exponential = Math.min(
    policy.maxDelayMs,
    policy.initialDelayMs * 2 ** exponent,
  );
  const jitter = exponential * policy.jitterRatio * (random() * 2 - 1);
  return Math.max(0, Math.round(exponential + jitter));
}

export async function retryWithBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const policy = { ...DEFAULT_RETRY_POLICY, ...options.policy };
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const shouldRetry = options.shouldRetry ?? (() => true);
  const startedAt = now();
  let attempt = 1;

  for (;;) {
    try {
      return await operation(attempt);
    } catch (error) {
      const elapsedMs = now() - startedAt;
      if (
        attempt >= policy.maxAttempts ||
        elapsedMs >= policy.maxElapsedMs ||
        !shouldRetry(error, attempt)
      ) {
        throw new RetryExhaustedError(error, attempt, elapsedMs);
      }
      const delayMs = backoffDelay(attempt, policy, random);
      if (elapsedMs + delayMs >= policy.maxElapsedMs) {
        throw new RetryExhaustedError(error, attempt, elapsedMs);
      }
      options.onRetry?.({ attempt, elapsedMs, delayMs, error });
      await sleep(delayMs);
      attempt += 1;
    }
  }
}

function defaultSleep(millis: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, millis));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
