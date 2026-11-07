import { GraphQLError, GraphQLScalarType, Kind, type ValueNode } from "graphql";

// ISO 8601 combined date and time without a timezone, matching the
// NaiveDateTime scalar in the shared GraphQL schema.
const NAIVE_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

function formatNaiveDateTime(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    throw new GraphQLError("NaiveDateTime cannot represent an invalid Date");
  }
  // A JS Date has millisecond precision. Strip the timezone marker, and drop
  // the fractional part when it is zero, as the Go implementation does.
  const withoutTimezone = value.toISOString().slice(0, -1);
  return withoutTimezone.endsWith(".000")
    ? withoutTimezone.slice(0, -4)
    : withoutTimezone;
}

function parseNaiveDateTime(value: unknown): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new GraphQLError("NaiveDateTime cannot represent an invalid Date");
    }
    return value;
  }
  if (typeof value === "string" && NAIVE_DATE_TIME_PATTERN.test(value)) {
    const parsed = new Date(`${value}Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  throw new GraphQLError(
    `NaiveDateTime cannot represent a non ISO 8601 value: ${String(value)}`,
  );
}

const NaiveDateTime = new GraphQLScalarType({
  name: "NaiveDateTime",
  description: "ISO 8601 combined date and time without timezone.",
  serialize(value) {
    if (value instanceof Date) {
      return formatNaiveDateTime(value);
    }
    if (typeof value === "string" && NAIVE_DATE_TIME_PATTERN.test(value)) {
      return value;
    }
    throw new GraphQLError(
      `NaiveDateTime cannot represent a non ISO 8601 value: ${String(value)}`,
    );
  },
  parseValue: parseNaiveDateTime,
  parseLiteral(ast: ValueNode) {
    if (ast.kind !== Kind.STRING) {
      throw new GraphQLError("NaiveDateTime must be a string");
    }
    return parseNaiveDateTime(ast.value);
  },
});

export { NaiveDateTime, formatNaiveDateTime };
