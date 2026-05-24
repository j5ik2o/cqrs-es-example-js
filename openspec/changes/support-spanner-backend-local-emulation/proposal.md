## Why

`event-store-adapter-js` 3.0.0 adds Cloud Spanner support and changes the public construction API. This example project must demonstrate the updated library with both DynamoDB and Spanner while preserving the current CQRS/ES read-model flow, not only write-side persistence.

## What Changes

- Update the proposed runtime contract from a DynamoDB-only event store to a selectable `dynamodb` or `spanner` persistence backend.
- Preserve the existing DynamoDB path with LocalStack DynamoDB Streams and the existing RMU behavior.
- Add a Spanner path whose production architecture is `Spanner Change Streams -> Dataflow -> Pub/Sub -> Cloud Run functions / Cloud Functions -> MySQL read model`.
- Add a local Spanner emulation path that verifies the same integration contract with `Spanner emulator -> local Change Stream bridge or Beam DirectRunner -> Pub/Sub emulator -> Functions Framework RMU -> MySQL`.
- Refactor the RMU plan so event-application logic is shared and cloud-provider handlers are thin adapters.
- Document startup and verification commands for both backends.

## Capabilities

### New Capabilities

- `event-store-backend-selection`: Runtime selection and construction of DynamoDB and Spanner event stores using `event-store-adapter-js` 3.0.0.
- `spanner-rmu-pipeline`: Spanner read-model update pipeline with production GCP topology and equivalent local emulation.

### Modified Capabilities

- None.

## Impact

- Affected packages: `packages/bootstrap`, `packages/rmu`, `packages/command/interface-adaptor-impl`, and integration scripts under `tools/`.
- Affected infrastructure: LocalStack DynamoDB, Cloud Spanner emulator, Pub/Sub emulator, MySQL, Functions Framework, and a local Change Stream bridge or Beam DirectRunner process.
- Affected documentation: build/test docs, local startup docs, and production architecture notes for the Spanner path.
- Dependency impact: `event-store-adapter-js` 3.0.0, `@google-cloud/spanner`, Pub/Sub client/runtime dependencies, and Functions Framework dependencies where needed.
