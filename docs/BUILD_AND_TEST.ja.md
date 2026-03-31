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

docker composeで起動したアプリケーションに対してE2Eテストを実行します。

```shell
$ pnpm docker-build
$ pnpm docker-compose-up
$ pnpm verify-group-chat # E2E
```

## Read Model Updater Lambda（LocalStack）

Rust 版と同様に、Read Model Updater を LocalStack 上の Lambda（DynamoDB ストリーム → Lambda → MySQL）として動かす手順です。

1. リポジトリルートに `common.env.default` を `common.env` としてコピーするか、`docker-compose-up.sh` / `docker-compose-e2e-test.sh` に任せて自動生成する。`common.env` は `.gitignore` されます。
2. ホストから AWS CLI で LocalStack に接続するときは **`http://localhost:34566`** を使います（Compose がコンテナの `4566` をホストの `34566` に公開）。Compose 内のサービスからは `http://localstack:4566` です。
3. デプロイ用 zip（Docker `linux/amd64`、Prisma の Lambda 用バイナリを含む）のビルド:

   ```shell
   $ pnpm build-read-model-updater-lambda
   ```

   成果物は `dist/lambda/read-model-updater/function.zip` です。

4. `pnpm docker-compose-up` および `pnpm docker-compose-e2e-test` は、必要に応じて zip をビルドし、LocalStack 待機後に `deploy-read-model-updater-localstack.sh` を実行し、既定でコンテナ `read-model-updater-1` を停止します（ストリームの二重処理を防ぐため）。`DOCKER_COMPOSE_UP_DEPLOY_LAMBDA=0` や `DOCKER_COMPOSE_UP_BUILD_LAMBDA=0` でスキップできます。E2E 用コンテナは `profile: e2e` とし、スタック起動と Lambda デプロイの後に `verify-group-chat.sh` が走るようにしています。
5. Compose 起動後に手動デプロイする場合:

   ```shell
   $ pnpm deploy-read-model-updater-localstack
   ```