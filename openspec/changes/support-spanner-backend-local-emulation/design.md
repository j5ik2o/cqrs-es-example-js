## Context

現在の application は event-store backend として DynamoDB を中心に配線されています。write API は `EventStoreFactory.ofDynamoDB(...)` instance を作成し、RMU は DynamoDB stream records を消費します。local end-to-end verification は、MySQL read model を更新するために LocalStack Lambda または local RMU process に依存しています。

`event-store-adapter-js` 3.0.0 では public API が `EventStore.ofDynamoDB(input)` に変わり、`EventStore.ofSpanner(input)` が追加されます。この example における Spanner support は、DynamoDB 版と同じ write-model から read-model までの flow を示せる場合にだけ意味があります。

## Goals / Non-Goals

**Goals:**

- application/package layout は 1 つに保ち、event-store backend を runtime に選択します。
- DynamoDB behavior と local verification を維持します。
- asynchronous event stream を通じて MySQL read model に到達する Spanner backend を追加します。
- Spanner local path は、production と同じ integration contract を検証できる程度に現実的なものにします。
- RMU business logic は provider-neutral に保ちます。
- AWS/GCP の差分は domain や application services ではなく、interface adapters と composition wiring に隔離します。

**Non-Goals:**

- application を backend-specific packages に分割しません。
- Change Streams/Pub/Sub contract を迂回する poller は、Spanner architecture として採用しません。
- local development で managed Dataflow を必須にしません。
- この change では Spanner Queue を採用しません。adapter-level の queue send support が必要であり、選択した path ではありません。

## Decisions

### Backend Selection

`PERSISTENCE_BACKEND=dynamodb|spanner` のような runtime environment variable を使います。

- `dynamodb` は `EventStore.ofDynamoDB({ ... })` を構築します。
- `spanner` は `EventStore.ofSpanner({ ... })` を構築します。
- 既存の domain, command processor, repository contracts, GraphQL behavior は共有したままにします。

これにより、example の焦点を application layout の重複ではなく backend substitution に置けます。
provider-specific な event-store construction は interface-adapter/composition boundary に置き、backend selection が command handlers や domain services に漏れないようにします。

### DynamoDB RMU Path

現在の AWS-compatible path を維持します。

`LocalStack DynamoDB -> DynamoDB Streams -> LocalStack Lambda/dynamodbLocalRmu -> MySQL`

現在の Lambda-style handler は引き続き有用ですが、event decoding 後の処理は shared RMU application service に委譲します。

### Spanner Production RMU Path

GCP path は次の構成にします。

`Spanner journal -> Spanner Change Streams -> Dataflow -> Pub/Sub -> Cloud Run functions / Cloud Functions -> MySQL`

Change Stream は `snapshot` ではなく `journal` を watch します。これにより、domain event inserts だけが read-model updates を駆動します。

### Spanner Local RMU Path

local emulators と local bridge を使います。

`Spanner emulator -> local Change Stream bridge or Beam DirectRunner -> Pub/Sub emulator -> Functions Framework RMU -> MySQL`

local bridge は development における managed Dataflow の代替です。Functions Framework RMU が消費する Pub/Sub message contract を維持しなければなりません。Pub/Sub emulator の push subscriptions は HTTP endpoint に message を配信できるため、これは Pub/Sub-triggered function の local equivalent になります。

### RMU Core Shape

RMU は次のように分割します。

- provider-specific interface adapters:
  - DynamoDB Stream event adapter
  - Pub/Sub/CloudEvent adapter
- shared event application service:
  - provider-neutral な `ReadModelUpdaterInput` values を受け取る
  - `GroupChatDao` を通じて適用する

これにより projection rules の重複を避け、retries/idempotency behavior を推論しやすくします。
target となる internal RMU input shape は `DynamoDBStreamEvent` ではなく provider-neutral wrapper です。名前は `ReadModelUpdaterInput` または同等のものにします。decoded `GroupChatEvent` に加えて、ordering, idempotency, diagnostics に必要な metadata を持たせます。例えば aggregate id, sequence number, source provider, observed timestamp, 利用可能な場合は provider position や retry information です。
`ReadModelUpdater.updateFromDynamoDBStream(DynamoDBStreamEvent)` と `ReadModelUpdater.updateFromSpannerPubSub(SpannerPubSubMessage)` は provider-specific adapters の入口に限定します。AWS/GCP adapters は shared service を呼び出す前に provider payloads を `ReadModelUpdaterInput` に normalize します。Lambda と Functions Framework handlers は trigger decoding, acknowledgement/error semantics, dependency composition に限定します。

### Local Verification

両 backend path は、write API で group chat を作成し、read API が projected read model を観測できることを確認する end-to-end verification command を持たなければなりません。

Spanner では、flow が Pub/Sub/function boundary を通過した場合にだけ verification として有効です。journal を直接 poll して DAO を呼び出す実装では不十分です。

## Risks / Trade-offs

- Spanner emulator の Change Streams support は早期に検証する必要があります。emulator が必要な `CREATE CHANGE STREAM` と `READ_<stream>` workflow を実行できない場合、local bridge は native Change Streams を忠実に consume できません。
- Managed Dataflow には LocalStack-style emulator がありません。local Beam DirectRunner または bridge process が必要であり、それは example の development infrastructure の一部になります。
- Pub/Sub と function delivery は at-least-once です。RMU は duplicate deliveries に耐える必要があります。read model が idempotency を必要とする箇所では、aggregate id や sequence number などの event identity を使います。
- Dataflow template payloads は理想的な RMU payload shape と一致しない可能性があります。bridge/function adapter は、受け付ける Pub/Sub message schema を定義し文書化する必要があります。
