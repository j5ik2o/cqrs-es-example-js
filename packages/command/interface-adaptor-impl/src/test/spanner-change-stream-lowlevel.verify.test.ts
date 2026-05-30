import {
  type Database,
  type Instance,
  Spanner,
  v1,
} from "@google-cloud/spanner";
// Deep import: chunk-assembly + value decoding for the low-level streaming SQL
// (the high-level client cannot issue single-use change-stream reads).
import { partialResultStream } from "@google-cloud/spanner/build/src/partial-result-stream";
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from "testcontainers";

/**
 * Proves the local Spanner CDC read path: the change stream can be read from the
 * emulator using a low-level single-use ExecuteStreamingSql call (the high-level
 * run/runStream cannot — see spanner-change-stream.verify.test.ts). This is the
 * read primitive the change-stream bridge uses.
 */
describe("Spanner emulator change-stream low-level read", () => {
  const TIMEOUT = 120 * 1000;
  const GRPC_PORT = 9010;
  const REST_PORT = 9020;
  const PROJECT_ID = "test-project";
  const INSTANCE_ID = "ll-instance";
  const DATABASE_ID = "ll-db";
  const STREAM = "journal_stream";

  let started: StartedTestContainer | undefined;
  let spanner: Spanner | undefined;
  let database: Database | undefined;
  const prevHost = process.env.SPANNER_EMULATOR_HOST;

  afterAll(async () => {
    await database?.close().catch(() => undefined);
    spanner?.close();
    if (prevHost === undefined) {
      Reflect.deleteProperty(process.env, "SPANNER_EMULATOR_HOST");
    } else {
      process.env.SPANNER_EMULATOR_HOST = prevHost;
    }
    await started?.stop().catch(() => undefined);
  }, TIMEOUT);

  test(
    "reads the inserted journal row as a data change record",
    async () => {
      started = await new GenericContainer(
        "gcr.io/cloud-spanner-emulator/emulator",
      )
        .withExposedPorts(GRPC_PORT, REST_PORT)
        .withWaitStrategy(Wait.forLogMessage("gRPC server listening"))
        .start();

      process.env.SPANNER_EMULATOR_HOST = `localhost:${started.getMappedPort(
        GRPC_PORT,
      )}`;
      process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID;
      process.env.GCLOUD_PROJECT = PROJECT_ID;
      process.env.METADATA_SERVER_DETECTION = "none";

      spanner = new Spanner({ projectId: PROJECT_ID });
      const [instance, instanceOp] = await spanner.createInstance(INSTANCE_ID, {
        config: "emulator-config",
        nodes: 1,
        displayName: "ll",
      });
      await instanceOp.promise();
      const [db, dbOp] = await (instance as Instance).createDatabase(
        DATABASE_ID,
        {
          schema: [
            `CREATE TABLE journal (
              shard_id INT64 NOT NULL,
              aggregate_id STRING(MAX) NOT NULL,
              sequence_number INT64 NOT NULL,
              payload BYTES(MAX) NOT NULL,
              occurred_at TIMESTAMP NOT NULL
            ) PRIMARY KEY (shard_id, aggregate_id, sequence_number)`,
          ],
        },
      );
      await dbOp.promise();
      database = db as Database;
      const [csOp] = await database.updateSchema([
        `CREATE CHANGE STREAM ${STREAM} FOR journal`,
      ]);
      await csOp.promise();

      const start = new Date();
      const payloadText = JSON.stringify({ type: "X", data: { v: 1 } });
      await database.table("journal").insert([
        {
          shard_id: 1,
          aggregate_id: "GroupChat-ll",
          sequence_number: 1,
          payload: Buffer.from(payloadText, "utf-8"),
          occurred_at: new Date().toISOString(),
        },
      ]);

      // Give the change stream a moment, then read a bounded window.
      await new Promise((r) => setTimeout(r, 1500));
      const end = new Date(Date.now() + 1000);

      const dataRecords = await readAllDataChangeRecords(
        spanner,
        PROJECT_ID,
        INSTANCE_ID,
        DATABASE_ID,
        STREAM,
        start.toISOString(),
        end.toISOString(),
      );

      // The inserted journal row must surface as a data change record whose
      // new_values carry the base64 payload — exactly what the bridge publishes.
      expect(dataRecords.length).toBeGreaterThan(0);
      const journalInsert = dataRecords.find(
        (r) => r.table_name === "journal" && r.mod_type === "INSERT",
      );
      expect(journalInsert).toBeDefined();
      const mod = journalInsert?.mods[0];
      const keys = asObject(mod?.keys);
      const newValues = asObject(mod?.new_values);
      expect(keys.aggregate_id).toEqual("GroupChat-ll");
      const decoded = Buffer.from(String(newValues.payload), "base64").toString(
        "utf-8",
      );
      expect(decoded).toEqual(payloadText);
      console.log("low-level single-use change-stream read OK:", decoded);
    },
    TIMEOUT,
  );
});

type DataChangeRecord = {
  table_name: string;
  mod_type: string;
  // The change stream puts non-key columns (payload, occurred_at) in new_values
  // and the primary key (shard_id, aggregate_id, sequence_number) in keys.
  mods: { keys: unknown; new_values: unknown }[];
};

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    return JSON.parse(value) as Record<string, unknown>;
  }
  return (value ?? {}) as Record<string, unknown>;
}

type ChangeRecord = {
  data_change_record?: DataChangeRecord[];
  child_partitions_record?: {
    start_timestamp: string | Date;
    child_partitions: { token: string }[];
  }[];
};

function toIso(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

/**
 * Walks the change-stream partition token tree within [start, end] using
 * low-level single-use ExecuteStreamingSql reads, returning all data change
 * records found. The TVF output (ARRAY<STRUCT<...>>) is flattened to scalar
 * columns with UNNEST + TO_JSON_STRING (the emulator does not support
 * TO_JSON_STRING on the whole ChangeRecord), so result assembly stays trivial.
 * This is the core read algorithm the bridge reuses.
 */
async function readAllDataChangeRecords(
  spanner: Spanner,
  projectId: string,
  instanceId: string,
  databaseId: string,
  streamName: string,
  start: string,
  end: string,
): Promise<DataChangeRecord[]> {
  // Reuse the resolved connection options (emulator insecure creds, or real
  // Spanner credentials) the high-level client computed.
  // biome-ignore lint/suspicious/noExplicitAny: low-level v1 client + proto types
  const client: any = new v1.SpannerClient(
    // biome-ignore lint/suspicious/noExplicitAny: options is not on the public type
    (spanner as any).options,
  );
  const databasePath = client.databasePath(projectId, instanceId, databaseId);
  const [session] = await client.createSession({ database: databasePath });

  const out: DataChangeRecord[] = [];
  const seen = new Set<string>();
  const queue: { token: string | null; startTs: string }[] = [
    { token: null, startTs: start },
  ];
  let budget = 50;
  try {
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

      const records = await readPartitionRecords(
        client,
        session.name,
        streamName,
        item.token,
        item.startTs,
        end,
      );
      for (const record of records) {
        for (const dataChange of record.data_change_record ?? []) {
          out.push(dataChange);
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
  } finally {
    await client.deleteSession({ name: session.name }).catch(() => undefined);
    await client.close().catch(() => undefined);
  }
  return out;
}

/**
 * Single partition read. The emulator only accepts the bare form
 * `SELECT ChangeRecord FROM READ_<stream>(...)`, so the complex
 * `ARRAY<STRUCT<...>>` result is decoded by the Spanner client's
 * `partialResultStream` (chunk-assembly + value decode + resume).
 */
function readPartitionRecords(
  // biome-ignore lint/suspicious/noExplicitAny: low-level v1 client
  client: any,
  sessionName: string,
  streamName: string,
  partitionToken: string | null,
  start: string,
  end: string,
): Promise<ChangeRecord[]> {
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
