## Why

`event-store-adapter-js` 3.0.0 では Cloud Spanner 対応が追加され、公開されている構築 API も変更されました。この example project では、write-side persistence だけでなく、現在の CQRS/ES read-model flow を保ったまま DynamoDB と Spanner の両方で更新後のライブラリを示す必要があります。

## What Changes

- runtime contract を DynamoDB-only event store から、`dynamodb` または `spanner` を選択できる persistence backend に更新します。
- LocalStack DynamoDB Streams と既存 RMU behavior を含む DynamoDB path は維持します。
- Spanner path を追加します。production architecture は `Spanner Change Streams -> Dataflow -> Pub/Sub -> Cloud Run functions / Cloud Functions -> MySQL read model` です。
- Spanner の local emulation path を追加します。`Spanner emulator -> local Change Stream bridge or Beam DirectRunner -> Pub/Sub emulator -> Functions Framework RMU -> MySQL` により、同じ integration contract を検証します。
- event-application logic を共有し、cloud-provider handler を薄い adapter にするよう RMU plan をリファクタリングします。
- 両 backend の起動・検証コマンドを文書化します。

## Capabilities

### New Capabilities

- `event-store-backend-selection`: `event-store-adapter-js` 3.0.0 を使い、DynamoDB と Spanner の event store を runtime に選択・構築します。
- `spanner-rmu-pipeline`: production GCP topology と同等の local emulation を持つ Spanner read-model update pipeline です。

### Modified Capabilities

- なし。

## Impact

- 影響を受ける packages: `packages/bootstrap`, `packages/rmu`, `packages/command/interface-adaptor-impl`, `tools/` 配下の integration scripts。
- 影響を受ける infrastructure: LocalStack DynamoDB, Cloud Spanner emulator, Pub/Sub emulator, MySQL, Functions Framework, local Change Stream bridge または Beam DirectRunner process。
- 影響を受ける documentation: build/test docs, local startup docs, Spanner path の production architecture notes。
- dependency への影響: `event-store-adapter-js` 3.0.0, `@google-cloud/spanner`, Pub/Sub client/runtime dependencies, 必要に応じた Functions Framework dependencies。
