/**
 * ESA core-contract T-9 caps sequence numbers at 2^53 - 1 so that every value
 * read from storage can be represented exactly as a JavaScript number. The
 * `last_processed_sequence_number` columns are BIGINT, which can hold larger
 * values, so every conversion across the storage boundary is validated here
 * instead of trusting the database.
 */
const MAX_SEQUENCE_NUMBER = Number.MAX_SAFE_INTEGER;

class SequenceNumberOutOfRangeError extends Error {
  readonly value: number | bigint;

  constructor(value: number | bigint) {
    super(
      `Sequence number ${String(value)} is outside the T-9 range [0, ${MAX_SEQUENCE_NUMBER}]`,
    );
    this.name = "SequenceNumberOutOfRangeError";
    this.value = value;
  }
}

/**
 * Validates a sequence number received from the application layer and converts
 * it to the `bigint` Prisma expects for a BIGINT column. Values above the T-9
 * limit, non-integers, NaN and negative values are rejected before any write.
 */
function toBigIntSequenceNumber(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SequenceNumberOutOfRangeError(value);
  }
  return BigInt(value);
}

/**
 * Converts a BIGINT column back to the JavaScript number used by the
 * application. Only values within the T-9 limit are accepted; a larger stored
 * value would lose precision, so it is reported instead of being truncated.
 */
function fromBigIntSequenceNumber(value: bigint): number {
  const converted = Number(value);
  if (
    !Number.isSafeInteger(converted) ||
    converted < 0 ||
    BigInt(converted) !== value
  ) {
    throw new SequenceNumberOutOfRangeError(value);
  }
  return converted;
}

export {
  MAX_SEQUENCE_NUMBER,
  SequenceNumberOutOfRangeError,
  fromBigIntSequenceNumber,
  toBigIntSequenceNumber,
};
