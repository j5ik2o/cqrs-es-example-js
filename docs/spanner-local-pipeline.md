# Persistence backends & the Spanner read-model pipeline

This project targets [event-store-adapter-js](https://github.com/j5ik2o/event-store-adapter-js)
**v3.1.0**, which exposes a functional, non-class API and supports both **DynamoDB**
and **Cloud Spanner** event stores. The write API selects the backend at runtime;
the rest of the application (domain, command processor, repository, GraphQL) is
backend-agnostic.

## Backend selection

The write API reads `PERSISTENCE_BACKEND`:

| Value      | Event store                       |
|------------|-----------------------------------|
| `dynamodb` | `EventStore.createDynamoDB({...})` |
| `spanner`  | `EventStore.createSpanner({...})`  |

An empty value falls back to `dynamodb` for backward compatibility. Any other
unknown value fails fast.

DynamoDB env: `PERSISTENCE_JOURNAL_TABLE_NAME`, `PERSISTENCE_SNAPSHOT_TABLE_NAME`,
`PERSISTENCE_JOURNAL_AID_INDEX_NAME`, `PERSISTENCE_SNAPSHOT_AID_INDEX_NAME`,
`PERSISTENCE_SNAPSHOT_ACTIVE_TTL_INDEX_NAME` (new in v3.1.0 — a KEYS_ONLY GSI on
`active_ttl_seq_nr` used by snapshot retention), `PERSISTENCE_SHARD_COUNT`,
plus the existing `AWS_*` settings.

Spanner env: `PERSISTENCE_SPANNER_PROJECT_ID`, `PERSISTENCE_SPANNER_INSTANCE_ID`,
`PERSISTENCE_SPANNER_DATABASE_ID`, `PERSISTENCE_JOURNAL_TABLE_NAME`,
`PERSISTENCE_SNAPSHOT_TABLE_NAME`, `PERSISTENCE_SHARD_COUNT`, and
`SPANNER_EMULATOR_HOST` when targeting the emulator.

## Read-model update (RMU)

RMU projection logic is **provider-neutral**. Provider adapters decode their
native payloads into a `ReadModelUpdaterInput` (decoded `GroupChatEvent` plus
aggregate id, sequence number, source provider, observed timestamp, and an
optional provider position), and the shared `applyReadModel` service applies it
through an idempotent `GroupChatDao` (so the projection tolerates at-least-once /
duplicate delivery).

- **AWS** (`decodeDynamoDBStreamEvent`): DynamoDB Streams → `ReadModelUpdaterInput`.
- **GCP** (`decodePubSubMessage`): Pub/Sub message → `ReadModelUpdaterInput`.

The AWS Lambda handler and the GCP Functions Framework handler are thin: they
only decode the trigger and forward to the shared service.

## DynamoDB path (unchanged behavior)

```text
LocalStack DynamoDB -> DynamoDB Streams -> local RMU / Lambda -> MySQL -> read API
```

Start it with `pnpm docker-compose-up` and verify with
`tools/e2e-test/verify-group-chat.sh`.

## Spanner production topology

```text
Spanner journal -> Change Streams -> Dataflow -> Pub/Sub -> Cloud Run / Cloud Functions (RMU) -> MySQL
```

The change stream watches **`journal` only**, so snapshot writes never drive
read-model updates.

## Spanner local pipeline

```text
Spanner emulator -> change-stream bridge -> Pub/Sub emulator -> Functions Framework RMU -> MySQL -> read API
```

The `spannerBridge` process is the local stand-in for the managed Dataflow stage:
it reads the `journal` change stream and republishes each event payload to a
Pub/Sub topic, preserving the message contract the Functions Framework RMU
consumes.

CLI commands (in `packages/bootstrap`):

- `spannerSetup` — idempotently create the Spanner instance/database, the
  journal/snapshot tables, the `journal_stream` change stream, and the Pub/Sub
  topic + push subscription.
- `spannerBridge` — run the change-stream → Pub/Sub bridge.
- the RMU function runs via `functions-framework --target=readModelUpdater
  --signature-type=cloudevent --source=dist/spanner-rmu-handler.js`.

Bring the whole pipeline up with:

```shell
tools/scripts/docker-compose-up-spanner.sh
```

(write API on `:48080`, read API on `:48082`).

## Spanner emulator change-stream reads (and why the bridge is low-level)

The Cloud Spanner **emulator** supports `CREATE CHANGE STREAM` and the
`READ_<stream>()` TVF, but with two constraints we hit and worked around:

1. **Single-use reads only.** Change-stream reads must be single-use strong reads
   via the ExecuteStreamingSql API:
   > Change stream queries are not supported for multi use transactions. Change
   > stream queries must be strong reads executed via single use transactions
   > using the ExecuteStreamingSql API.

   The high-level `@google-cloud/spanner` `run` / `runStream` always issue a
   pooled **multi-use** transaction (and ignore an inline single-use selector), so
   they cannot read change streams against the emulator.
2. **No SQL processing of the TVF.** Only the bare
   `SELECT ChangeRecord FROM READ_<stream>(...)` form is accepted — no `UNNEST`,
   no `TO_JSON_STRING` on the `ChangeRecord` `ARRAY<STRUCT<...>>`.

**How the bridge handles it** (`packages/bootstrap/src/spanner-change-stream-reader.ts`):

- Builds a low-level `v1.SpannerClient`, reusing the connection options the
  high-level client resolved (emulator insecure creds, or real Spanner creds).
- Issues `executeStreamingSql` with a `singleUse: { readOnly: { strong: true } }`
  transaction selector, decoding via the client's `partialResultStream`
  (chunk-assembly + value decode + resume).
- Walks the change-stream **partition-token tree** (root `NULL` → child tokens).
- Extracts the journal payload from each data change record's `new_values.payload`
  (non-key columns) and the aggregate id / sequence number from `keys`.

This works on **both the emulator and real Spanner**. (On real Spanner the
production topology would normally use Dataflow rather than this bridge; the bridge
is the local stand-in. It uses a simple windowed poll over `[watermark, now]` and
relies on the idempotent read-model DAO for at-least-once tolerance.)

The full write → change-stream → event read path is verified end-to-end in
`packages/bootstrap/src/spanner-change-stream-reader.integration.test.ts`.

## Verification matrix

| Path                                       | How it's verified                                              |
|--------------------------------------------|----------------------------------------------------------------|
| Functional domain + serialization          | `group-chat.test.ts`, `group-chat-serialization.test.ts`       |
| DynamoDB event store (v3.1.0)              | `group-chat-repository.test.ts` (LocalStack)                   |
| Spanner event store (v3.1.0)               | `group-chat-repository.spanner.test.ts` (emulator)             |
| Provider-neutral RMU adapters              | `adapter-contract.test.ts`                                     |
| Spanner emulator change-stream constraints | `spanner-change-stream.verify.test.ts`                         |
| Spanner CDC read (write → change stream)   | `spanner-change-stream-lowlevel.verify.test.ts`, `spanner-change-stream-reader.integration.test.ts` |
| DynamoDB end-to-end                        | `tools/e2e-test/verify-group-chat.sh`                          |
