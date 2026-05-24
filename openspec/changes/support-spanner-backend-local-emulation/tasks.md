## 1. Platform Assumptions の検証

- [ ] 1.1 DynamoDB と Spanner での `event-store-adapter-js` 3.0.0 API usage を検証する。
- [ ] 1.2 Cloud Spanner emulator が adapter に必要な event-store tables を作成できることを検証する。
- [ ] 1.3 local bridge のために、Cloud Spanner emulator が `CREATE CHANGE STREAM` と `READ_<stream>` を support するか検証する。
- [ ] 1.4 Pub/Sub emulator の push subscriptions が Docker Compose 内の Functions Framework endpoint に deliver できることを検証する。

## 2. Event Store Backend Selection

- [ ] 2.1 `PERSISTENCE_BACKEND=dynamodb|spanner` の runtime configuration を追加する。
- [ ] 2.2 deprecated な `EventStoreFactory.ofDynamoDB(...)` calls を `EventStore.ofDynamoDB({ ... })` に置き換える。
- [ ] 2.3 Spanner client/database construction と `EventStore.ofSpanner({ ... })` wiring を追加する。
- [ ] 2.4 repository integration tests を更新し、DynamoDB と Spanner の event-store construction の両方を cover する。
- [ ] 2.5 backend selection は interface-adapter/composition wiring の内側に保ち、command handlers と domain services を backend-agnostic のままにする。

## 3. RMU Refactoring

- [ ] 3.1 DynamoDB stream parsing から provider-neutral event application logic を抽出する。
- [ ] 3.2 AWS Lambda/DynamoDB stream handler は thin adapter として維持する。
- [ ] 3.3 Functions Framework を使い、GCP RMU path 用の Pub/Sub/CloudEvent handler を追加する。
- [ ] 3.4 explicit idempotent projection logic、または existing guarantees が duplicate event delivery に耐えることを証明する automated verification artifact により、検証可能な duplicate-delivery handling を追加する。
- [ ] 3.5 decoded `GroupChatEvent` と ordering/idempotency/diagnostic metadata を持つ provider-neutral な `ReadModelUpdaterInput` または同等の wrapper を定義する。
- [ ] 3.6 shared RMU application service を変更し、`DynamoDBStreamEvent` ではなく provider-neutral wrapper を受け取るようにする。
- [ ] 3.7 equivalent domain events に対して AWS/GCP RMU adapters が同じ wrapper shape を生成することを証明する shared adapter contract tests または fixtures を追加する。

## 4. Local Spanner Pipeline

- [ ] 4.1 Spanner emulator service と、`journal`, `snapshot`, `journal` change stream の schema setup を追加する。
- [ ] 4.2 Pub/Sub emulator topic と push subscription setup を追加する。
- [ ] 4.3 journal changes を Pub/Sub に publish する local Change Stream bridge または Beam DirectRunner process を追加する。
- [ ] 4.4 Pub/Sub push messages を consume して MySQL を更新する Functions Framework RMU service を追加する。
- [ ] 4.5 Spanner backend path を起動する Docker Compose scripts を追加する。

## 5. Verification And Documentation

- [ ] 5.1 DynamoDB の `verify-group-chat` flow と同等の Spanner backend end-to-end verification command を追加する。
- [ ] 5.2 DynamoDB と Spanner の local startup commands を文書化する。
- [ ] 5.3 production GCP topology として、Spanner Change Streams, Dataflow, Pub/Sub, Cloud Run functions / Cloud Functions を文書化する。
- [ ] 5.4 emulator で native Change Streams が利用できない場合の fallback guidance を文書化する。
