import type { Spanner } from "@google-cloud/spanner";
import { v1 } from "@google-cloud/spanner";
// Deep import: PartialResultSet chunk-assembly + value decoding + resume. The
// high-level run/runStream cannot issue the single-use reads the Spanner
// emulator requires for change streams, so we drive the low-level streaming SQL
// directly and reuse the client's decoder.
import { partialResultStream } from "@google-cloud/spanner/build/src/partial-result-stream";

/**
 * One decoded data-change-record mod from a Spanner change stream. The change
 * stream puts non-key columns (e.g. `payload`, `occurred_at`) in `newValues`
 * and the primary key (`shard_id`, `aggregate_id`, `sequence_number`) in `keys`.
 */
export type ChangeStreamDataRecord = {
  tableName: string;
  modType: string;
  commitTimestamp: string;
  keys: Record<string, unknown>;
  newValues: Record<string, unknown>;
};

export type ChangeStreamReader = {
  readWindow(start: string, end: string): Promise<ChangeStreamDataRecord[]>;
  close(): Promise<void>;
};

type ChangeRecord = {
  data_change_record?: {
    commit_timestamp: string | Date;
    table_name: string;
    mod_type: string;
    mods: { keys: unknown; new_values: unknown }[];
  }[];
  child_partitions_record?: {
    start_timestamp: string | Date;
    child_partitions: { token: string }[];
  }[];
};

const MAX_PARTITIONS_PER_WINDOW = 200;

/**
 * Reads a Spanner change stream over a time window using low-level single-use
 * ExecuteStreamingSql (emulator- and real-Spanner-compatible), walking the
 * partition-token tree. Reuses a single v1 client + session across calls.
 */
function createChangeStreamReader(
  spanner: Spanner,
  input: {
    projectId: string;
    instanceId: string;
    databaseId: string;
    streamName: string;
  },
): ChangeStreamReader {
  // Reuse the resolved connection options (emulator insecure creds, or real
  // Spanner credentials) the high-level client computed.
  // biome-ignore lint/suspicious/noExplicitAny: low-level v1 client + proto types
  const client: any = new v1.SpannerClient(
    // biome-ignore lint/suspicious/noExplicitAny: options is not on the public type
    (spanner as any).options,
  );
  const databasePath = client.databasePath(
    input.projectId,
    input.instanceId,
    input.databaseId,
  );
  let sessionNamePromise: Promise<string> | undefined;

  function sessionName(): Promise<string> {
    const existing = sessionNamePromise;
    if (existing !== undefined) {
      return existing;
    }
    const created: Promise<string> = client
      .createSession({ database: databasePath })
      // biome-ignore lint/suspicious/noExplicitAny: proto Session
      .then(([session]: [any]) => session.name as string);
    sessionNamePromise = created;
    return created;
  }

  async function readWindow(
    start: string,
    end: string,
  ): Promise<ChangeStreamDataRecord[]> {
    const name = await sessionName();
    const out: ChangeStreamDataRecord[] = [];
    const seen = new Set<string>();
    const queue: { token: string | null; startTs: string }[] = [
      { token: null, startTs: start },
    ];
    let budget = MAX_PARTITIONS_PER_WINDOW;
    while (queue.length > 0 && budget-- > 0) {
      const item = queue.shift();
      if (item === undefined) {
        break;
      }
      const key = item.token ?? "__ROOT__";
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const records = await readPartition(
        client,
        name,
        input.streamName,
        item.token,
        item.startTs,
        end,
      );
      for (const record of records) {
        for (const dataChange of record.data_change_record ?? []) {
          for (const mod of dataChange.mods) {
            out.push({
              tableName: dataChange.table_name,
              modType: dataChange.mod_type,
              commitTimestamp: toIso(dataChange.commit_timestamp),
              keys: asObject(mod.keys),
              newValues: asObject(mod.new_values),
            });
          }
        }
        for (const childRecord of record.child_partitions_record ?? []) {
          for (const child of childRecord.child_partitions) {
            if (!seen.has(child.token)) {
              queue.push({
                token: child.token,
                startTs: toIso(childRecord.start_timestamp),
              });
            }
          }
        }
      }
    }
    return out;
  }

  async function close(): Promise<void> {
    if (sessionNamePromise !== undefined) {
      const name = await sessionNamePromise.catch(() => undefined);
      if (name !== undefined) {
        await client.deleteSession({ name }).catch(() => undefined);
      }
    }
    await client.close().catch(() => undefined);
  }

  return Object.freeze({ readWindow, close });
}

function readPartition(
  // biome-ignore lint/suspicious/noExplicitAny: low-level v1 client
  client: any,
  sessionName: string,
  streamName: string,
  partitionToken: string | null,
  start: string,
  end: string,
): Promise<ChangeRecord[]> {
  // The emulator only accepts the bare `SELECT ChangeRecord FROM READ_<stream>()`
  // form (no UNNEST / TO_JSON_STRING).
  const baseRequest = {
    session: sessionName,
    sql: `SELECT ChangeRecord FROM READ_${streamName}(
            start_timestamp => @start,
            end_timestamp => @end,
            partition_token => @token,
            heartbeat_milliseconds => @heartbeat
          )`,
    params: {
      fields: {
        start: { stringValue: start },
        end: { stringValue: end },
        token:
          partitionToken === null
            ? { nullValue: "NULL_VALUE" }
            : { stringValue: partitionToken },
        heartbeat: { stringValue: "10000" },
      },
    },
    paramTypes: {
      start: { code: "TIMESTAMP" },
      end: { code: "TIMESTAMP" },
      token: { code: "STRING" },
      heartbeat: { code: "INT64" },
    },
    transaction: { singleUse: { readOnly: { strong: true } } },
  };
  // biome-ignore lint/suspicious/noExplicitAny: gax RequestFunction signature
  const requestFn: any = (resumeToken: Uint8Array) =>
    client.executeStreamingSql({ ...baseRequest, resumeToken });
  return new Promise<ChangeRecord[]>((resolve, reject) => {
    const records: ChangeRecord[] = [];
    partialResultStream(requestFn, { json: true })
      .on("data", (row: { ChangeRecord?: ChangeRecord[] } | ChangeRecord[]) => {
        const cr = Array.isArray(row) ? row[0] : row.ChangeRecord;
        if (Array.isArray(cr)) {
          records.push(...cr);
        }
      })
      .on("error", reject)
      .on("end", () => resolve(records));
  });
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    return JSON.parse(value) as Record<string, unknown>;
  }
  return (value ?? {}) as Record<string, unknown>;
}

function toIso(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export { createChangeStreamReader };
