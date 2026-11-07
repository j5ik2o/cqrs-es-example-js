import { DEFAULT_RETRY_POLICY, type RetryPolicy } from "cqrs-es-example-js-rmu";

/**
 * Recovery settings shared by the Lambda handler and the local stream reader.
 * The event-level retry ceiling keeps one bad event from holding a batch
 * forever; the stream-level policy is the outer backoff between failed passes.
 */
export type RmuRuntimeConfig = {
  storeId: string;
  projectionName: string;
  projectionVersion: string;
  retry: RetryPolicy;
  streamRetry: RetryPolicy;
  pollIntervalMs: number;
  streamRetentionMs: number;
  maxItemCount: number;
  recoveryBatchSize: number;
  headTableName: string;
  journalTableName: string;
};

const DEFAULT_STREAM_RETRY_POLICY: RetryPolicy = Object.freeze({
  maxAttempts: Number.MAX_SAFE_INTEGER,
  initialDelayMs: 1000,
  maxDelayMs: 60_000,
  maxElapsedMs: Number.MAX_SAFE_INTEGER,
  jitterRatio: 0.2,
});

export function loadRmuRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RmuRuntimeConfig {
  return {
    storeId: env.RMU_STORE_ID ?? "dynamodb-head",
    projectionName: env.RMU_PROJECTION_NAME ?? "group-chat-read-model",
    projectionVersion: env.RMU_PROJECTION_VERSION ?? "1",
    retry: {
      maxAttempts: integerFromEnv(env, "RMU_RETRY_MAX_ATTEMPTS", 5),
      initialDelayMs: integerFromEnv(
        env,
        "RMU_RETRY_INITIAL_DELAY_MS",
        DEFAULT_RETRY_POLICY.initialDelayMs,
      ),
      maxDelayMs: integerFromEnv(
        env,
        "RMU_RETRY_MAX_DELAY_MS",
        DEFAULT_RETRY_POLICY.maxDelayMs,
      ),
      maxElapsedMs: integerFromEnv(
        env,
        "RMU_RETRY_MAX_ELAPSED_MS",
        DEFAULT_RETRY_POLICY.maxElapsedMs,
      ),
      jitterRatio: numberFromEnv(
        env,
        "RMU_RETRY_JITTER_RATIO",
        DEFAULT_RETRY_POLICY.jitterRatio,
      ),
    },
    streamRetry: {
      maxAttempts: DEFAULT_STREAM_RETRY_POLICY.maxAttempts,
      initialDelayMs: integerFromEnv(
        env,
        "STREAM_RETRY_INITIAL_DELAY_MS",
        DEFAULT_STREAM_RETRY_POLICY.initialDelayMs,
      ),
      maxDelayMs: integerFromEnv(
        env,
        "STREAM_RETRY_MAX_DELAY_MS",
        DEFAULT_STREAM_RETRY_POLICY.maxDelayMs,
      ),
      maxElapsedMs: DEFAULT_STREAM_RETRY_POLICY.maxElapsedMs,
      jitterRatio: numberFromEnv(
        env,
        "STREAM_RETRY_JITTER_RATIO",
        DEFAULT_STREAM_RETRY_POLICY.jitterRatio,
      ),
    },
    pollIntervalMs: integerFromEnv(env, "STREAM_POLL_INTERVAL_MS", 200),
    streamRetentionMs: integerFromEnv(
      env,
      "STREAM_RETENTION_MS",
      24 * 60 * 60 * 1000,
    ),
    maxItemCount: clamp(
      integerFromEnv(env, "STREAM_MAX_ITEM_COUNT", 32),
      1,
      1000,
    ),
    recoveryBatchSize: Math.max(
      1,
      integerFromEnv(env, "RMU_RECOVERY_BATCH_SIZE", 100),
    ),
    headTableName: env.STREAM_HEAD_TABLE_NAME ?? "head",
    journalTableName: env.STREAM_JOURNAL_TABLE_NAME ?? "journal",
  };
}

function integerFromEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  return Math.trunc(numberFromEnv(env, name, fallback));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function numberFromEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number, got: ${raw}`);
  }
  return parsed;
}
