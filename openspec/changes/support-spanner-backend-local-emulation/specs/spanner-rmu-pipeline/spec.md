## ADDED Requirements

### Requirement: Spanner production RMU topology
The system SHALL define the Spanner production read-model update topology as Spanner Change Streams to Dataflow to Pub/Sub to Cloud Run functions or Cloud Functions.

#### Scenario: Journal event is written in production
- **WHEN** the Spanner event store inserts a domain event into the `journal` table
- **THEN** the Spanner Change Stream over `journal` SHALL be the source of the downstream event
- **AND** the downstream path SHALL deliver the event through Pub/Sub to the RMU function.

### Requirement: Spanner local RMU emulation
The system SHALL provide a local Spanner verification path that preserves the same integration contract as the production topology.

#### Scenario: Journal event is written locally
- **WHEN** the Spanner backend runs in local Docker Compose
- **THEN** the flow SHALL pass through Spanner emulator, a local Change Stream bridge or Beam DirectRunner, Pub/Sub emulator, Functions Framework RMU, and MySQL
- **AND** the read API SHALL observe the projected read model after the asynchronous flow completes.

#### Scenario: Local flow bypasses Pub/Sub
- **WHEN** a local implementation reads Spanner journal rows and calls the DAO directly
- **THEN** it SHALL NOT be considered equivalent to the required Spanner local verification path.

### Requirement: Provider-neutral RMU event application
The RMU SHALL apply decoded domain events through shared projection logic independent of the source provider.

#### Scenario: DynamoDB stream event is received
- **WHEN** the AWS adapter receives a DynamoDB stream event
- **THEN** it SHALL decode the stream record into one or more domain events
- **AND** it SHALL delegate projection to the shared RMU application service.

#### Scenario: Pub/Sub event is received
- **WHEN** the GCP adapter receives a Pub/Sub-triggered CloudEvent
- **THEN** it SHALL decode the Pub/Sub message into one or more domain events
- **AND** it SHALL delegate projection to the shared RMU application service.

### Requirement: Duplicate delivery tolerance
The Spanner RMU path SHALL tolerate at-least-once delivery from Pub/Sub and function retries.

#### Scenario: Same event is delivered more than once
- **WHEN** the RMU receives a duplicate event for the same aggregate id and sequence number
- **THEN** the read-model update SHALL remain consistent
- **AND** the verification flow SHALL not depend on exactly-once delivery.
