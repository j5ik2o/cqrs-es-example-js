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