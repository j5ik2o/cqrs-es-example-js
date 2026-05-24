## Context

The current application is wired around DynamoDB as the event-store backend. The write API creates an `EventStoreFactory.ofDynamoDB(...)` instance, the RMU consumes DynamoDB stream records, and local end-to-end verification relies on LocalStack Lambda or a local RMU process to update the MySQL read model.

`event-store-adapter-js` 3.0.0 changes the public API to `EventStore.ofDynamoDB(input)` and adds `EventStore.ofSpanner(input)`. Spanner support is only meaningful for this example if it demonstrates the same write-model to read-model flow as the DynamoDB version.

## Goals / Non-Goals

**Goals:**

- Keep a single application/package layout and select the event-store backend at runtime.
- Maintain DynamoDB behavior and local verification.
- Add a Spanner backend that reaches the MySQL read model through an asynchronous event stream.
- Make the Spanner local path realistic enough to verify the same integration contract as production.
- Keep RMU business logic provider-neutral.

**Non-Goals:**

- Do not split the application into backend-specific packages.
- Do not use a poller as the accepted Spanner architecture if it bypasses the Change Streams/Pub/Sub contract.
- Do not require managed Dataflow for local development.
- Do not adopt Spanner Queue for this change; it requires adapter-level queue send support and is not the selected path.

## Decisions

### Backend Selection

Use a runtime environment variable such as `PERSISTENCE_BACKEND=dynamodb|spanner`.

- `dynamodb` constructs `EventStore.ofDynamoDB({ ... })`.
- `spanner` constructs `EventStore.ofSpanner({ ... })`.
- Existing domain, command processor, repository, and GraphQL wiring remain shared.

This keeps the example focused on backend substitution rather than duplicate application layouts.

### DynamoDB RMU Path

Keep the current AWS-compatible path:

`LocalStack DynamoDB -> DynamoDB Streams -> LocalStack Lambda/localRmu -> MySQL`

The current Lambda-style handler remains useful, but its event decoding should delegate to a shared RMU application service.

### Spanner Production RMU Path

Use the GCP path:

`Spanner journal -> Spanner Change Streams -> Dataflow -> Pub/Sub -> Cloud Run functions / Cloud Functions -> MySQL`

The Change Stream must watch `journal`, not `snapshot`, so only domain event inserts drive read-model updates.

### Spanner Local RMU Path

Use local emulators and a local bridge:

`Spanner emulator -> local Change Stream bridge or Beam DirectRunner -> Pub/Sub emulator -> Functions Framework RMU -> MySQL`

The local bridge is the replacement for managed Dataflow in development. It must preserve the Pub/Sub message contract consumed by the Functions Framework RMU. Pub/Sub emulator push subscriptions can deliver messages to an HTTP endpoint, which is the local equivalent of a Pub/Sub-triggered function.

### RMU Core Shape

Split RMU into:

- provider-specific input adapters:
  - DynamoDB Stream event adapter
  - Pub/Sub/CloudEvent adapter
- shared event application service:
  - accepts decoded `GroupChatEvent` values
  - applies them through `GroupChatDao`

This avoids duplicating projection rules and makes retries/idempotency behavior easier to reason about.

### Local Verification

Both backend paths must support an end-to-end verification command that creates a group chat through the write API and confirms the read API observes the projected read model.

For Spanner, the verification is valid only when the flow crosses the Pub/Sub/function boundary; a direct journal poller calling the DAO is not sufficient.

## Risks / Trade-offs

- Spanner emulator support for Change Streams must be validated early. If the emulator cannot execute the required `CREATE CHANGE STREAM` and `READ_<stream>` workflow, the local bridge cannot faithfully consume native Change Streams.
- Managed Dataflow has no LocalStack-style emulator. A local Beam DirectRunner or bridge process is necessary, and it becomes part of the example's development infrastructure.
- Pub/Sub and function delivery are at-least-once. The RMU must tolerate duplicate deliveries, using event identity such as aggregate id and sequence number where the read model needs idempotency.
- Dataflow template payloads may not match the ideal RMU payload shape. The bridge/function adapter must define and document the accepted Pub/Sub message schema.
