## 1. Validate Platform Assumptions

- [ ] 1.1 Verify `event-store-adapter-js` 3.0.0 API usage for DynamoDB and Spanner.
- [ ] 1.2 Verify Cloud Spanner emulator can create the event-store tables needed by the adapter.
- [ ] 1.3 Verify whether Cloud Spanner emulator supports `CREATE CHANGE STREAM` and `READ_<stream>` for the local bridge.
- [ ] 1.4 Verify Pub/Sub emulator push subscriptions can deliver to a Functions Framework endpoint inside Docker Compose.

## 2. Event Store Backend Selection

- [ ] 2.1 Add runtime configuration for `PERSISTENCE_BACKEND=dynamodb|spanner`.
- [ ] 2.2 Replace deprecated `EventStoreFactory.ofDynamoDB(...)` calls with `EventStore.ofDynamoDB({ ... })`.
- [ ] 2.3 Add Spanner client/database construction and `EventStore.ofSpanner({ ... })` wiring.
- [ ] 2.4 Update repository integration tests to cover both DynamoDB and Spanner event-store construction.

## 3. RMU Refactoring

- [ ] 3.1 Extract provider-neutral event application logic from DynamoDB stream parsing.
- [ ] 3.2 Keep the AWS Lambda/DynamoDB stream handler as a thin adapter.
- [ ] 3.3 Add a Pub/Sub/CloudEvent handler for the GCP RMU path using Functions Framework.
- [ ] 3.4 Add idempotency handling or document existing idempotency guarantees for duplicate event delivery.

## 4. Local Spanner Pipeline

- [ ] 4.1 Add Spanner emulator service and schema setup for `journal`, `snapshot`, and the `journal` change stream.
- [ ] 4.2 Add Pub/Sub emulator topic and push subscription setup.
- [ ] 4.3 Add a local Change Stream bridge or Beam DirectRunner process that publishes journal changes to Pub/Sub.
- [ ] 4.4 Add a Functions Framework RMU service that consumes Pub/Sub push messages and updates MySQL.
- [ ] 4.5 Add Docker Compose scripts for starting the Spanner backend path.

## 5. Verification And Documentation

- [ ] 5.1 Add a Spanner backend end-to-end verification command equivalent to the DynamoDB `verify-group-chat` flow.
- [ ] 5.2 Document DynamoDB and Spanner local startup commands.
- [ ] 5.3 Document the production GCP topology: Spanner Change Streams, Dataflow, Pub/Sub, and Cloud Run functions / Cloud Functions.
- [ ] 5.4 Document fallback guidance if native Change Streams are unavailable in the emulator.
