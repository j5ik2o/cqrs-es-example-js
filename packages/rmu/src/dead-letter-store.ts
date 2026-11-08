import type { PrismaClient } from "@prisma/client";
import type { FailureType } from "./failures";

/**
 * Durable recovery task for one event that could not be projected. It carries
 * identifiers and diagnostics only: the event body stays in the journal, and
 * the recovery task re-reads it from there. Any notification transport (SQS)
 * is thus limited to delivering the identity of the task.
 */
export type DeadLetterRecord = {
  storeId: string;
  projectionName: string;
  projectionVersion: string;
  aggregateId: string;
  seqNr: number;
  failureType: FailureType;
  errorMessage: string;
  attempts: number;
  occurredAt?: Date;
  manifest?: string;
  recordIdentifier?: string;
  createdAt: Date;
};

export type DeadLetterStore = {
  save(record: DeadLetterRecord): Promise<void>;
  /** Lists recovery tasks, optionally limited to one projection. */
  list(limit: number, projectionName?: string): Promise<DeadLetterRecord[]>;
  /** The task for one event identity, or undefined when it was already solved. */
  find(
    projectionName: string,
    aggregateId: string,
    seqNr: number,
  ): Promise<DeadLetterRecord | undefined>;
  /** Number of unresolved recovery tasks, for reporting after a batch. */
  count(projectionName?: string): Promise<number>;
  delete(record: DeadLetterRecord): Promise<void>;
};

/**
 * The subset of `PrismaClient` used here. Raw SQL keeps the recovery tables out
 * of the shared generated Prisma client, which the read side regenerates from
 * its own schema.
 */
export type SqlClient = Pick<
  PrismaClient,
  "$executeRawUnsafe" | "$queryRawUnsafe"
>;

const SELECT_COLUMNS = `SELECT projection_name, projection_version, store_id,
          aggregate_id, seq_nr, failure_type, error_message, attempts,
          occurred_at, manifest, record_identifier, created_at
     FROM read_model_dead_letters`;

type DeadLetterRow = {
  projection_name: string;
  projection_version: string;
  store_id: string;
  aggregate_id: string;
  seq_nr: number;
  failure_type: string;
  error_message: string;
  attempts: number;
  occurred_at: Date | string | null;
  manifest: string | null;
  record_identifier: string | null;
  created_at: Date | string;
};

export namespace DeadLetterStore {
  export function createSql(client: SqlClient): DeadLetterStore {
    return Object.freeze({
      async save(record: DeadLetterRecord): Promise<void> {
        const now = record.createdAt;
        await client.$executeRawUnsafe(
          `INSERT INTO read_model_dead_letters
             (projection_name, projection_version, store_id, aggregate_id,
              seq_nr, failure_type, error_message, attempts, occurred_at,
              manifest, record_identifier, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             failure_type = VALUES(failure_type),
             error_message = VALUES(error_message),
             attempts = attempts + VALUES(attempts),
             occurred_at = VALUES(occurred_at),
             manifest = VALUES(manifest),
             record_identifier = VALUES(record_identifier),
             updated_at = VALUES(updated_at)`,
          record.projectionName,
          record.projectionVersion,
          record.storeId,
          record.aggregateId,
          record.seqNr,
          record.failureType,
          record.errorMessage,
          record.attempts,
          record.occurredAt ?? null,
          record.manifest ?? null,
          record.recordIdentifier ?? null,
          now,
          now,
        );
      },

      async list(
        limit: number,
        projectionName?: string,
      ): Promise<DeadLetterRecord[]> {
        const rows =
          projectionName === undefined
            ? await client.$queryRawUnsafe<DeadLetterRow[]>(
                `${SELECT_COLUMNS}
            ORDER BY created_at ASC
            LIMIT ?`,
                limit,
              )
            : await client.$queryRawUnsafe<DeadLetterRow[]>(
                `${SELECT_COLUMNS}
            WHERE projection_name = ?
            ORDER BY created_at ASC
            LIMIT ?`,
                projectionName,
                limit,
              );
        return rows.map(rowToRecord);
      },

      async find(
        projectionName: string,
        aggregateId: string,
        seqNr: number,
      ): Promise<DeadLetterRecord | undefined> {
        const rows = await client.$queryRawUnsafe<DeadLetterRow[]>(
          `${SELECT_COLUMNS}
            WHERE projection_name = ? AND aggregate_id = ? AND seq_nr = ?
            LIMIT 1`,
          projectionName,
          aggregateId,
          seqNr,
        );
        return rows[0] === undefined ? undefined : rowToRecord(rows[0]);
      },

      async count(projectionName?: string): Promise<number> {
        const rows =
          projectionName === undefined
            ? await client.$queryRawUnsafe<{ total: number | bigint }[]>(
                "SELECT COUNT(*) AS total FROM read_model_dead_letters",
              )
            : await client.$queryRawUnsafe<{ total: number | bigint }[]>(
                `SELECT COUNT(*) AS total FROM read_model_dead_letters
                  WHERE projection_name = ?`,
                projectionName,
              );
        return Number(rows[0]?.total ?? 0);
      },

      async delete(record: DeadLetterRecord): Promise<void> {
        await client.$executeRawUnsafe(
          `DELETE FROM read_model_dead_letters
            WHERE projection_name = ? AND aggregate_id = ? AND seq_nr = ?`,
          record.projectionName,
          record.aggregateId,
          record.seqNr,
        );
      },
    });
  }
}

function rowToRecord(row: DeadLetterRow): DeadLetterRecord {
  return {
    storeId: row.store_id,
    projectionName: row.projection_name,
    projectionVersion: row.projection_version,
    aggregateId: row.aggregate_id,
    seqNr: Number(row.seq_nr),
    failureType: row.failure_type as FailureType,
    errorMessage: row.error_message,
    attempts: Number(row.attempts),
    occurredAt: toDateOrUndefined(row.occurred_at),
    manifest: row.manifest ?? undefined,
    recordIdentifier: row.record_identifier ?? undefined,
    createdAt: toDate(row.created_at),
  };
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toDateOrUndefined(value: Date | string | null): Date | undefined {
  if (value === null) {
    return undefined;
  }
  return toDate(value);
}
