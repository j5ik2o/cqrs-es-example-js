## ADDED Requirements

### Requirement: Runtime backend selection
system SHALL application packages を変更せずに、runtime configuration によって write API が DynamoDB event-store backend または Spanner event-store backend を選択できるようにしなければなりません。

#### Scenario: DynamoDB backend selected
- **WHEN** write API が DynamoDB backend を選択した状態で起動する
- **THEN** `event-store-adapter-js` 3.0.0 の object-input API を使って DynamoDB event store を構築 SHALL しなければならない
- **AND** 既存の DynamoDB table と stream configuration contract を維持 SHALL しなければならない。

#### Scenario: Spanner backend selected
- **WHEN** write API が Spanner backend を選択した状態で起動する
- **THEN** `event-store-adapter-js` 3.0.0 の object-input API を使って Spanner event store を構築 SHALL しなければならない
- **AND** caller-managed Spanner database configuration を使う SHALL。

#### Scenario: Unsupported backend selected
- **WHEN** write API が空または未知の `PERSISTENCE_BACKEND` value で起動する
- **THEN** startup SHALL invalid value を示し、supported backends として `dynamodb` と `spanner` を列挙する明確な error message で fail fast しなければならない
- **AND** `event-store-adapter-js` 3.0.0 の object-input API によって DynamoDB または Spanner event store を構築する前に失敗 SHALL しなければならない
- **AND** supported backend のいずれにも暗黙的に fallback SHALL NOT してはならない。

### Requirement: Shared command application
system SHALL DynamoDB と Spanner backends の間で command-domain, command-processor, repository, GraphQL behavior を共有しなければなりません。

#### Scenario: Same command flow across backends
- **WHEN** group chat command がいずれかの supported backend に対して実行される
- **THEN** command processor SHALL 同じ domain model と repository interface を使わなければならない
- **AND** backend-specific event-store construction SHALL interface adapters と composition wiring に隔離しなければならない。
- **AND** backend selection SHALL NOT domain services や command handlers に漏れてはならない。

### Requirement: DynamoDB compatibility preservation
system SHALL Spanner support を追加しながら、既存の DynamoDB local verification path を維持しなければなりません。

#### Scenario: Existing DynamoDB E2E flow
- **WHEN** DynamoDB local stack が起動される
- **THEN** 既存の write API, DynamoDB stream, RMU, MySQL read model, read API flow SHALL end to end で検証可能なままでなければならない。
