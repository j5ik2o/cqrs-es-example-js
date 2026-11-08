import {
  MAX_SEQUENCE_NUMBER,
  SequenceNumberOutOfRangeError,
  fromBigIntSequenceNumber,
  toBigIntSequenceNumber,
} from "./sequence-number";

describe("sequence number T-9 conversion", () => {
  test("round-trips values up to the T-9 limit", () => {
    for (const value of [
      0,
      1,
      2147483647,
      2147483648,
      9007199254740990,
      MAX_SEQUENCE_NUMBER,
    ]) {
      const stored = toBigIntSequenceNumber(value);
      expect(stored).toEqual(BigInt(value));
      expect(fromBigIntSequenceNumber(stored)).toEqual(value);
      expect(Number.isSafeInteger(value)).toBe(true);
    }
  });

  test("rejects numbers outside the T-9 limit", () => {
    for (const value of [
      9007199254740992,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(() => toBigIntSequenceNumber(value)).toThrow(
        SequenceNumberOutOfRangeError,
      );
    }
  });

  test("rejects stored bigints outside the T-9 limit", () => {
    for (const value of [BigInt("9007199254740992"), BigInt(-1)]) {
      expect(() => fromBigIntSequenceNumber(value)).toThrow(
        SequenceNumberOutOfRangeError,
      );
    }
  });
});
