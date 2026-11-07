import { NaiveDateTime, formatNaiveDateTime } from "./graphql/naive-date-time";

describe("NaiveDateTime", () => {
  test("formats a Date as ISO 8601 without a timezone", () => {
    expect(formatNaiveDateTime(new Date("2026-11-07T07:18:08.000Z"))).toEqual(
      "2026-11-07T07:18:08",
    );
    expect(formatNaiveDateTime(new Date("2026-11-07T07:18:08.123Z"))).toEqual(
      "2026-11-07T07:18:08.123",
    );
  });

  test("serializes a Date through the GraphQL scalar", () => {
    expect(
      NaiveDateTime.serialize(new Date("2026-11-07T07:18:08.000Z")),
    ).toEqual("2026-11-07T07:18:08");
  });

  test("keeps an already naive ISO 8601 string", () => {
    expect(NaiveDateTime.serialize("2026-11-07T07:18:08")).toEqual(
      "2026-11-07T07:18:08",
    );
  });

  test("rejects an invalid Date", () => {
    expect(() => NaiveDateTime.serialize(new Date("not-a-date"))).toThrow(
      "NaiveDateTime cannot represent an invalid Date",
    );
  });

  test("rejects a non ISO 8601 value", () => {
    expect(() => NaiveDateTime.serialize("2026-11-07 07:18:08")).toThrow(
      "NaiveDateTime cannot represent a non ISO 8601 value",
    );
  });
});
