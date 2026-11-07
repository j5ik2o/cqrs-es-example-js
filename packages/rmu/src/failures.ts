/**
 * Failure taxonomy for the read-model projection.
 *
 * The delivery loop must react differently to two families of failure:
 * infrastructure failures (a database outage, throttling) heal by themselves and
 * must never be dead-lettered, while a single event that cannot be projected
 * (a journal gap, an unknown event, a broken payload) needs a durable recovery
 * task so the aggregate's position stops advancing instead of silently skipping
 * the event.
 */
export type FailureType =
  | "journal-gap"
  | "projection-gap"
  | "projection-error"
  | "transient";

export type FailureClassification = {
  type: FailureType;
  /** Whether retrying the same input can succeed without external action. */
  retryable: boolean;
  /** True for infrastructure failures that belong to the whole store. */
  transient: boolean;
};

/** The journal does not contain an event the head already exposed. */
export class JournalGapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JournalGapError";
  }
}

/** The position row moved under us; re-reading the position can heal it. */
export class ProjectionGapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectionGapError";
  }
}

/** The failure could not be dead-lettered, so the original delivery must retry. */
export class DeadLetterWriteError extends Error {
  readonly originalError: unknown;
  readonly deadLetterError: unknown;

  constructor(originalError: unknown, deadLetterError: unknown) {
    super(
      `Failed to persist the dead letter for a projection failure: ${errorMessage(
        deadLetterError,
      )}`,
    );
    this.name = "DeadLetterWriteError";
    this.originalError = originalError;
    this.deadLetterError = deadLetterError;
  }
}

const TRANSIENT_ERROR_NAMES = new Set([
  "ThrottlingException",
  "Throttling",
  "ProvisionedThroughputExceededException",
  "RequestLimitExceeded",
  "InternalServerError",
  "InternalFailure",
  "ServiceUnavailable",
  "ServiceUnavailableException",
  "TimeoutError",
  "RequestTimeout",
  "RequestTimeoutException",
  "AbortError",
  "NetworkingError",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "PrismaClientInitializationError",
  "PrismaClientRustPanicError",
]);

const TRANSIENT_PRISMA_CODES = new Set([
  "P1001",
  "P1002",
  "P1008",
  "P1017",
  "P2024",
  "P2034",
]);

export function isTransientError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if (isErrorWithName(error)) {
    if (TRANSIENT_ERROR_NAMES.has(error.name)) {
      return true;
    }
  }
  if ("retryable" in error && error.retryable === true) {
    return true;
  }
  if ("code" in error && typeof error.code === "string") {
    if (TRANSIENT_ERROR_NAMES.has(error.code)) {
      return true;
    }
    if (TRANSIENT_PRISMA_CODES.has(error.code)) {
      return true;
    }
  }
  return false;
}

export function classifyFailure(error: unknown): FailureClassification {
  if (error instanceof JournalGapError) {
    // The head and the journal are written atomically, so a missing journal
    // event will not appear by retrying; record it for the recovery task.
    return { type: "journal-gap", retryable: false, transient: false };
  }
  if (error instanceof ProjectionGapError) {
    return { type: "projection-gap", retryable: true, transient: false };
  }
  if (isTransientError(error)) {
    return { type: "transient", retryable: true, transient: true };
  }
  return { type: "projection-error", retryable: true, transient: false };
}

function isErrorWithName(error: object): error is { name: string } {
  return "name" in error && typeof error.name === "string";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
