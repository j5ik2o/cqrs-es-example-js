## ビルド方法

ビルドを行う前に、Dockerを必ず起動してください。

```shell
$ pnpm install # 初回だけ
$ pnpm prisma:generate # 初回だけ
$ pnpm build
```

## テスト方法

## 単体テスト

事前にDockerを必ず起動してください。

```shell
$ pnpm test
```

## E2Eテスト

Docker Compose と LocalStack を起動し、Write API、ローカル RMU、Read API の順に処理が流れることを検証します。RMU はコンテナ `dynamodb-read-model-updater-1` で動かし、Lambda 版は使いません。

イメージをビルドしてから実行します。

```shell
$ pnpm docker-build
$ pnpm docker-build-e2e-test
$ pnpm docker-compose-e2e-test
```

`pnpm docker-compose-e2e-test` は次の2つを順に実行します。

1. メインシナリオ: 8つの Mutation を実行し、Read API が返す値を確認します。対象は `createGroupChat`、`addMember`、`postMessage`、`editMessage`、`renameGroupChat`、`deleteMessage`、`removeMember`、`deleteGroupChat` です。削除系の Mutation のあとは、Read API が対象を返さなくなるまで待ちます。
2. 再起動シナリオ: RMU を止めた状態でイベントを書き、起動後にリードモデルへ追いつくことを確認します。さらに RMU を再起動し、head の Streams を再読込しても行が重複しないことを確認します。

Read Model の反映待ちはポーリングです。`WAIT_READ_MODEL_ATTEMPTS` で試行回数、`WAIT_READ_MODEL_SLEEP_SEC` で間隔を変えられます。

再起動シナリオのあとは、MySQL を直接読んで次の状態を確認します。

- `read_model_positions.last_processed_sequence_number` が 5 である。
- `members` が2行、`messages` が2行のままである。

失敗したときは、`tools/scripts/docker-compose-e2e-test.sh` が compose の状態とログを出力します。

単体テストには、重複、逆順、欠番、処理途中の失敗、再起動の検証が `packages/rmu/src/read-model-updater.integration.test.ts` にあります。compose の e2e では、障害を注入しないと再現できない逆順と欠番は扱いません。

## 復旧

RMU は失敗したイベントを捨てず、再試行・退避・再同期で復旧します。

再試行はイベント単位で行います。試行回数と最大経過時間を決め、上限まで指数バックオフとジッターで間隔を広げます。ローカルの Streams 読み取りは、失敗したパス全体を外側の指数バックオフで繰り返します。Lambda は `BisectBatchOnFunctionError` と `ReportBatchItemFailures` を使い、失敗したレコードだけを再試行します。

上限を超えた恒久障害は `read_model_dead_letters` に保存します。レコードはストア識別子、投影の名前と版、集約ID、seq_nr、失敗種別、試行回数を持ちます。イベント本文は保存せず、復旧時に journal から読み直します。DB 全体の障害は DLQ に入れず、配信ループの退避に任せます。

payload を復号できない head イベントは、失敗種別 `payload-decode` で保存します。アダプタがエンベロープを残すため、タスクには集約IDと seq_nr が入ります。復旧時は journal から payload を読み直します。`RMU_DEAD_LETTER_QUEUE_URL` を設定すると、タスクの識別情報を SQS にも送ります。この通知が届かなくても復旧が遅れるだけで、イベント本文は含みません。正本は MySQL の行です。メッセージの形、キューの設定、運用の手順は [DEAD_LETTER_RECOVERY.ja.md](DEAD_LETTER_RECOVERY.ja.md) にあります。

同じバッチでは、集約ごとに最初の失敗と、`RMU_DEAD_LETTER_BATCH_LIMIT` 件までの止まったイベントを保存します。上限を超えたイベントは失敗として報告し、次の配信で保存します。

Lambda ハンドラは、コンテナ内の最初の呼び出しで head テーブルを全件照合します。位置ガードはローカルの読み取りと同じです。照合はコンテナごとに1回で、失敗したときは次の呼び出しでやり直します。

SQS の復旧ワーカーは `node dist/index.js sqsDeadLetterWorker` か SQS の Lambda ハンドラで動きます。メッセージは起動の合図だけで、ワーカーは永続行を読み、journal を再適用します。重複したメッセージや古いメッセージでも安全です。

復旧タスクは `node dist/index.js recoverReadModel` で実行します。未解決の DLQ を読み、現在位置から対象の seq_nr まで journal を昇順に適用し、位置が到達したことを確認してからレコードを削除します。何度実行しても結果は変わりません。

再同期は、起動時、最後の処理から24時間を超えたとき、`TrimmedDataAccessException` を受けたときに行います。head を `ConsistentRead` で全件 Scan し、位置が遅れている集約だけ journal から補います。`ExpiredIteratorException` はイベントが消えたことを意味しないので、全件を読み直さず、シャードの最後のシーケンス番号から読み直します。

リードモデルの更新と位置行の更新は同じトランザクションで確定します。適用するのは「現在位置+1」のイベントだけで、journal に欠番があれば位置を進めずに失敗させます。

`recovery.test.ts` は再試行、DLQ、payload の復号失敗、止まったイベントの記録、復旧のバッチ上限、再同期、ストリームの失敗種別を確認します。`dead-letter-notifier.test.ts` と `dead-letter-consumer.test.ts` は SQS のメッセージの形と冪等な消費を確認します。`startup-resynchronizer.test.ts` は Lambda の起動時照合が1回だけ走り、失敗後にやり直すことを確認します。`read-model-updater.integration.test.ts` は実 MySQL で重複、逆順、欠番、途中の失敗、再起動、復号失敗、同時適用を確認します。

## Read Model Updater Lambda（LocalStack）

Rust 版と同様に、Read Model Updater を LocalStack 上の Lambda（DynamoDB ストリーム → Lambda → MySQL）として動かす手順です。

1. リポジトリルートに `common.env.default` を `common.env` としてコピーするか、`docker-compose-up.sh` に任せて自動生成する。`common.env` は `.gitignore` されます。
2. ホストから AWS CLI で LocalStack に接続するときは **`http://localhost:34566`** を使います（Compose がコンテナの `4566` をホストの `34566` に公開）。Compose 内のサービスからは `http://localstack:4566` です。
3. デプロイ用 zip（Docker `linux/amd64`、Prisma の Lambda 用バイナリを含む）のビルド:

   ```shell
   $ pnpm build-dynamodb-read-model-updater-lambda
   ```

   成果物は `dist/lambda/dynamodb-read-model-updater/function.zip` です。

4. `pnpm docker-compose-up` は、必要に応じて zip をビルドし、LocalStack 待機後に `deploy-dynamodb-read-model-updater-localstack.sh` を実行し、既定でコンテナ `dynamodb-read-model-updater-1` を停止します（ストリームの二重処理を防ぐため）。`DOCKER_COMPOSE_UP_DEPLOY_LAMBDA=0` や `DOCKER_COMPOSE_UP_BUILD_LAMBDA=0` でスキップできます。`pnpm docker-compose-e2e-test` は Lambda を使わず、コンテナの RMU で検証します。
5. Compose 起動後に手動デプロイする場合:

   ```shell
   $ pnpm deploy-dynamodb-read-model-updater-localstack
   ```