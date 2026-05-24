## ADDED Requirements

### Requirement: Runtime backend selection
The system SHALL allow the write API to select either the DynamoDB event-store backend or the Spanner event-store backend through runtime configuration without changing application packages.

#### Scenario: DynamoDB backend selected
- **WHEN** the write API starts with the DynamoDB backend selected
- **THEN** it SHALL construct a DynamoDB event store using the `event-store-adapter-js` 3.0.0 object-input API
- **AND** it SHALL preserve the existing DynamoDB table and stream configuration contract.

#### Scenario: Spanner backend selected
- **WHEN** the write API starts with the Spanner backend selected
- **THEN** it SHALL construct a Spanner event store using the `event-store-adapter-js` 3.0.0 object-input API
- **AND** it SHALL use caller-managed Spanner database configuration.

#### Scenario: Unsupported backend selected
- **WHEN** the write API starts with an empty or unknown `PERSISTENCE_BACKEND` value
- **THEN** startup SHALL fail fast with a clear error message that identifies the invalid value and lists `dynamodb` and `spanner` as supported backends
- **AND** it SHALL fail before constructing any DynamoDB or Spanner event store through the `event-store-adapter-js` 3.0.0 object-input API
- **AND** it SHALL NOT fall back implicitly to either supported backend.

### Requirement: Shared command application
The system SHALL keep command-domain, command-processor, repository, and GraphQL behavior shared across DynamoDB and Spanner backends.

#### Scenario: Same command flow across backends
- **WHEN** a group chat command is executed against either supported backend
- **THEN** the command processor SHALL use the same domain model and repository interface
- **AND** only the event-store infrastructure SHALL vary by backend.

### Requirement: DynamoDB compatibility preservation
The system SHALL preserve the existing DynamoDB local verification path while adding Spanner support.

#### Scenario: Existing DynamoDB E2E flow
- **WHEN** the DynamoDB local stack is started
- **THEN** the existing write API, DynamoDB stream, RMU, MySQL read model, and read API flow SHALL remain verifiable end to end.
