## Notes

- 実装は `event-store-adapter-js` **3.1.0** に対応。公開 API は spec 草案の `EventStore.ofDynamoDB/ofSpanner` ではなく **`EventStore.createDynamoDB/createSpanner/createMemory`**（object-input）。
- ドメイン/アプリ層は class/interface/fp-ts を廃し、関数型（plain object + namespace + free function）に全面書き換え。type-graphql のみ GraphQL 境界でクラスを許容。
- 検証済み: DynamoDB event store（LocalStack）、Spanner event store（emulator）、provider-neutral RMU アダプタ契約、ドメインのシリアライズ往復、**Spanner CDC read（write → change stream → event）の end-to-end**。
- **emulator の change-stream 制約と対応（1.3 の結果）**: emulator は `CREATE CHANGE STREAM` と `READ_<stream>` TVF をサポートするが、(a) 読み取りは single-use ExecuteStreamingSql 必須（高レベル `run`/`runStream` は multi-use で不可）、(b) `SELECT ChangeRecord FROM READ_<stream>(...)` の素の形のみ（UNNEST/TO_JSON_STRING 不可）。→ bridge は **low-level `v1.SpannerClient.executeStreamingSql` + single-use + `partialResultStream` デコード + partition-token walk** で実装し、**emulator・real Spanner 双方で動作**（`spanner-change-stream-reader.ts`、`docs/spanner-local-pipeline.md`）。

## 1. Platform Assumptions の検証

- [x] 1.1 DynamoDB と Spanner での `event-store-adapter-js` 3.1.0 API usage を検証する。（repository 統合テストで両 backend を確認）
- [x] 1.2 Cloud Spanner emulator が adapter に必要な event-store tables を作成できることを検証する。（`group-chat-repository.spanner.test.ts`）
- [x] 1.3 local bridge のために、Cloud Spanner emulator が `CREATE CHANGE STREAM` と `READ_<stream>` を support するか検証する。（`spanner-change-stream.verify.test.ts` — サポートするが single-use 読み取り必須という制約を確認）
- [~] 1.4 Pub/Sub emulator の push subscriptions が Docker Compose 内の Functions Framework endpoint に deliver できることを検証する。（compose/spannerSetup で構成。emulator の change-stream 読み取り制約により end-to-end の自動検証は未完。）

## 2. Event Store Backend Selection

- [x] 2.1 `PERSISTENCE_BACKEND=dynamodb|spanner` の runtime configuration を追加する。
- [x] 2.2 deprecated な `EventStoreFactory.ofDynamoDB(...)` calls を `EventStore.createDynamoDB({ ... })` に置き換える。
- [x] 2.3 Spanner client/database construction と `EventStore.createSpanner({ ... })` wiring を追加する。
- [x] 2.4 repository integration tests を更新し、DynamoDB と Spanner の event-store construction の両方を cover する。
- [x] 2.5 backend selection は interface-adapter/composition wiring の内側に保ち、command handlers と domain services を backend-agnostic のままにする。

## 3. RMU Refactoring

- [x] 3.1 DynamoDB stream parsing から provider-neutral event application logic を抽出する。（`apply-read-model.ts`）
- [x] 3.2 AWS Lambda/DynamoDB stream handler は thin adapter として維持する。
- [x] 3.3 Functions Framework を使い、Spanner RMU path 用の Pub/Sub/CloudEvent handler を追加する。（`spanner-rmu-handler.ts`）
- [x] 3.4 idempotent projection logic を追加する。（`GroupChatDao` を upsert/updateMany/deleteMany で冪等化）
- [x] 3.5 provider-neutral な `ReadModelUpdaterInput` を定義する。（event + aggregateId + sequenceNumber + sourceProvider + observedAt + position）
- [x] 3.6 shared RMU application service を provider-neutral wrapper を受け取るように変更する。
- [x] 3.7 AWS/GCP adapters が同じ wrapper shape を生成することを示す contract tests を追加する。（`adapter-contract.test.ts`）

## 4. Local Spanner Pipeline

- [x] 4.1 Spanner emulator service と、`journal`/`snapshot`/change stream の schema setup を追加する。（`docker-compose-spanner.yml` + `spannerSetup`）
- [x] 4.2 Pub/Sub emulator topic と push subscription setup を追加する。（`spannerSetup`）
- [x] 4.3 journal changes を Pub/Sub に publish する local Change Stream bridge を追加する。（`spanner-change-stream-bridge-main.ts` + `spanner-change-stream-reader.ts` — low-level single-use read で emulator・real 両対応、CDC read を end-to-end 検証済み）
- [x] 4.4 Pub/Sub push messages を consume して MySQL を更新する Functions Framework RMU service を追加する。
- [x] 4.5 Spanner backend path を起動する Docker Compose scripts を追加する。（`docker-compose-up-spanner.sh`）

## 5. Verification And Documentation

- [~] 5.1 Spanner backend end-to-end verification command。（write → Spanner journal → change stream → reader → event の CDC read を自動テストで検証済み。compose 全体（bridge→Pub/Sub→Functions→MySQL→read API）を1コマンドで通す verify-group-chat 相当は未整備。）
- [x] 5.2 DynamoDB と Spanner の local startup commands を文書化する。（`docs/spanner-local-pipeline.md`）
- [x] 5.3 production GCP topology を文書化する。
- [x] 5.4 emulator の change stream 制約（single-use / TVF 素形のみ）と、low-level single-use reader での解決を文書化する。
