## ADDED Requirements

### Requirement: Spanner production RMU topology
system SHALL Spanner production read-model update topology を Spanner Change Streams から Dataflow、Pub/Sub、Cloud Run functions または Cloud Functions への flow として定義しなければなりません。

#### Scenario: Journal event is written in production
- **WHEN** Spanner event store が domain event を `journal` table に insert する
- **THEN** `journal` に対する Spanner Change Stream SHALL downstream event の source でなければならない
- **AND** downstream path SHALL Pub/Sub 経由で RMU function に event を deliver しなければならない。

### Requirement: Spanner local RMU emulation
system SHALL production topology と同じ integration contract を維持する local Spanner verification path を提供しなければなりません。

#### Scenario: Journal event is written locally
- **WHEN** Spanner backend が local Docker Compose で動作する
- **THEN** flow SHALL Spanner emulator, local Change Stream bridge または Beam DirectRunner, Pub/Sub emulator, Functions Framework RMU, MySQL を通過しなければならない
- **AND** asynchronous flow の完了後、read API SHALL projected read model を観測できなければならない。

#### Scenario: Local flow bypasses Pub/Sub
- **WHEN** local implementation が Spanner journal rows を読み、DAO を直接呼び出す
- **THEN** required Spanner local verification path と同等とはみなす SHALL NOT。

### Requirement: Provider-neutral RMU event application
RMU SHALL source provider に依存しない shared projection logic を通じて decoded domain events を apply しなければなりません。

#### Scenario: DynamoDB stream event is received
- **WHEN** AWS adapter が DynamoDB stream event を受信する
- **THEN** stream record を 1 つ以上の domain events に decode SHALL しなければならない
- **AND** 各 provider payload を provider-neutral な `ReadModelUpdaterInput` または同等の wrapper に normalize SHALL しなければならない
- **AND** wrapper SHALL decoded `GroupChatEvent` に加え、ordering, idempotency, diagnostics に必要な metadata を含まなければならない
- **AND** projection を shared RMU application service に委譲 SHALL しなければならない。

#### Scenario: Pub/Sub event is received
- **WHEN** GCP adapter が Pub/Sub-triggered CloudEvent を受信する
- **THEN** Pub/Sub message を 1 つ以上の domain events に decode SHALL しなければならない
- **AND** 各 provider payload を AWS adapter と同じ provider-neutral な `ReadModelUpdaterInput` または同等の wrapper に normalize SHALL しなければならない
- **AND** wrapper SHALL decoded `GroupChatEvent` に加え、ordering, idempotency, diagnostics に必要な metadata を含まなければならない
- **AND** projection を shared RMU application service に委譲 SHALL しなければならない。

#### Scenario: Shared RMU service is invoked
- **WHEN** provider-specific adapters が shared RMU application service を呼び出す
- **THEN** service SHALL AWS `DynamoDBStreamEvent` や GCP Pub/Sub payload ではなく provider-neutral wrapper を受け取らなければならない
- **AND** provider-native payload types SHALL shared projection service の外側に留めなければならない。

#### Scenario: Provider handler contains projection logic
- **WHEN** AWS Lambda handler または GCP Functions Framework handler が provider event を受信する
- **THEN** handler SHALL trigger decoding, acknowledgement/error semantics, dependency composition に責務を限定しなければならない
- **AND** shared RMU application service の外側で provider-specific projection rules を実装 SHALL NOT してはならない。

### Requirement: Duplicate delivery tolerance
Spanner RMU path SHALL Pub/Sub と function retries による at-least-once delivery に耐えなければなりません。

#### Scenario: Same event is delivered more than once
- **WHEN** RMU が同じ aggregate id と sequence number の duplicate event を受信する
- **THEN** read-model update SHALL consistent なままでなければならない
- **AND** verification flow SHALL NOT exactly-once delivery に依存してはならない。
