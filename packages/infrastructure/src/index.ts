import type { ULID, monotonicFactory } from "ulidx";

const ulidGenerator = monotonicFactory();

export function generateULID(): ULID {
  return ulidGenerator();
}
