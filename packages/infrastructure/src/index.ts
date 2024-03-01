import { monotonicFactory, ULID } from "ulidx";

const ulidGenerator = monotonicFactory();

export function generateULID(): ULID {
  return ulidGenerator();
}
