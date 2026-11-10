# ローカルDynamoDBの実行設定

[English](LOCAL_RUNTIME_CONFIG.md)

DynamoDBのCompose構成で動くWrite API、ローカルRead Model Updater（RMU）、Read APIの設定資料です。値はmain `951364a284205c856e4b886179234a25f31ed182` と照合しています。

## ポートと接続先

| アプリ | Composeサービス / コマンド | ホストからの接続先 | コンテナ間の接続先 |
| --- | --- | --- | --- |
| Write API | `write-api-server-1` / `writeApi` | `http://localhost:38080/` | `http://write-api-server-1:3000/` |
| ローカルRMU | `dynamodb-read-model-updater-1` / `dynamodbLocalRmu` | `38081:8080` の割当のみ | HTTP待受もGraphQLエンドポイントもなし |
| Read API | `read-api-server-1` / `readApi` | `http://localhost:38082/` | `http://read-api-server-1:3000/` |

両APIのGraphQLパスは `/` です。 [e2eのHTTPヘルパー](../tools/e2e-test/lib.sh)もAPIのルートへPOSTします。WriteはMutation、ReadはQueryを扱います。RMUは `head` テーブルのDynamoDB Streamsを購読し、シーケンスの欠落をjournalから補完してMySQLのリードモデルを更新します。起動時とストリームの長時間停止後にはheadテーブルを再照合します。Composeにはポート割当と環境変数がありますが、RMUは `API_HOST` と `API_PORT` を読みません。

ポート割当の参照元は[アプリCompose](../tools/docker-compose/docker-compose-applications.yml)です。[DB Compose](../tools/docker-compose/docker-compose-databases.yml)はLocalStackのホスト `34566` をコンテナ `4566` へ、MySQLのホスト `33306` をコンテナ `3306` へ割り当てます。ホストのプロセスは `http://localhost:34566` と `mysql://ceer:ceer@localhost:33306/ceer`、コンテナは `http://localstack:4566` と `mysql://ceer:ceer@mysql-local:3306/ceer` を使います。

[e2e用の上書き設定](../tools/docker-compose/docker-compose-e2e-test.yml)はホストへのポート公開を解除します。e2eはホストの38080、38082ではなくコンテナ間の接続先を使います。

## APIと永続化の環境変数

「既定値」は変数を省略した場合のアプリの値です。Composeの値は明示設定であり、アプリの既定値とは区別します。任意の変数を省略できるのは、既定値やSDKの設定が用途に合う場合です。

| 変数 | 利用アプリと意味 | 必須・任意とアプリの既定値 | ローカルComposeの値 |
| --- | --- | --- | --- |
| `API_HOST` | WriteとReadの待受アドレス | 任意、`localhost` | `0.0.0.0` |
| `API_PORT` | WriteとReadの待受ポート | 任意、両方とも `3000` | 両方とも `3000` |
| `API_ALLOW_ORIGINS` | 両APIのComposeに存在するが、これらの起動処理では未参照 | これらの起動処理では未使用 | `http://localhost:38080,http://localhost:38082,http://localhost:8888` |
| `PERSISTENCE_BACKEND` | Writeのイベントストア選択 | 任意、`dynamodb` | `dynamodb` |
| `PERSISTENCE_JOURNAL_TABLE_NAME` | Writeのイベントjournal | 任意、`journal` | `journal` |
| `PERSISTENCE_SNAPSHOT_TABLE_NAME` | Writeのsnapshotテーブル | 任意、`snapshot` | `snapshot` |
| `PERSISTENCE_HEAD_TABLE_NAME` | Writeの集約headテーブル | 任意、`head` | `head` |
| `PERSISTENCE_SNAPSHOT_HISTORY_INDEX_NAME` | Writeのsnapshot履歴GSI | 任意、`snapshot-history-index` | `snapshot-history-index` |
| `DATABASE_URL` | ReadとRMUがPrismaで使うMySQL接続先 | 必須、既定値なし。未設定・空文字では起動失敗 | `mysql://ceer:ceer@mysql-local:3306/ceer` |

参照元は[Write起動処理](../packages/bootstrap/src/write-api-main.ts)、[Read起動処理](../packages/bootstrap/src/read-api-main.ts)、[RMU起動処理](../packages/bootstrap/src/dynamodb-local-rmu-main.ts)、[Prisma datasource](../packages/rmu/prisma/schema.prisma)です。WriteではAPI設定とテーブル設定の空文字も省略と同じ扱いです。ReadのAPI設定は未設定の場合だけ既定値になります。ホストで直接起動する場合は両APIの既定ポートが3000なので、Writeに `API_PORT=38080`、Readに `API_PORT=38082` など、異なるポートを指定します。

[テーブル作成スクリプト](../tools/dynamodb-setup/create-tables.sh)はDB Composeが渡す名前でテーブル、snapshot GSI、`NEW_IMAGE` のheadストリームを作ります。Writeの `PERSISTENCE_HEAD_TABLE_NAME` とRMUの `STREAM_HEAD_TABLE_NAME` は同じテーブルを指す必要があります。journal名も揃える必要があります。Readは `PERSISTENCE_*`、`AWS_DYNAMODB_*`、`STREAM_*` を使いません。RMUはWriteの `PERSISTENCE_*` を使いません。`PERSISTENCE_SPANNER_*` は別の[Spannerパイプライン資料](spanner-local-pipeline.md)を参照してください。

## WriteとRMUのAWS環境変数

| 変数 | 意味 | 必須・任意とアプリの既定値 | ローカルComposeの値 |
| --- | --- | --- | --- |
| `AWS_REGION` | DynamoDBとStreamsのリージョン | アプリの既定値なし。設定からリージョンを解決できることが必要 | Writeは `${AWS_REGION:-ap-northeast-1}`、RMUは `ap-northeast-1` 固定 |
| `AWS_DYNAMODB_ENDPOINT_URL` | DynamoDB接続先。RMUではStreamsにも使用 | アプリの既定値なし。LocalStack利用時に指定 | `http://localstack:4566` |
| `AWS_DYNAMODB_ACCESS_KEY_ID` | ローカルクライアントに明示するアクセスキー | アプリの既定値なし。secretと組で指定 | `x` |
| `AWS_DYNAMODB_SECRET_ACCESS_KEY` | ローカルクライアントに明示するsecret | アプリの既定値なし。アクセスキーと組で指定 | `x` |
| `AWS_REGION_NAME` | Composeに残る旧設定 | これらの起動経路では未参照 | 各サービスの `AWS_REGION` と同じ |

Writeはリージョンと接続先を個別に適用し、認証情報はキーとsecretの両方がある場合だけ明示します。RMUの[クライアント生成処理](../packages/bootstrap/src/dynamodb-clients.ts)は `AWS_REGION` と3つの `AWS_DYNAMODB_*` の計4変数すべてが空でない場合だけカスタム設定を使います。それ以外はSDKの既定クライアントを作るため、指定したカスタム接続先も無視されます。ローカルRMUには4変数すべてを指定します。明示設定がなければSDKのリージョン、接続先、認証情報の解決が適用されます。`AWS_REGION_NAME` は `AWS_REGION` の代わりにはなりません。

## ローカルRMUのSTREAM環境変数

以下はすべて任意です。Composeは最初の4項目にアプリの既定値と同じ値を指定し、それ以外は未指定です。WriteとReadは使用しません。

| 変数 | 意味 | アプリの既定値 |
| --- | --- | --- |
| `STREAM_HEAD_TABLE_NAME` | RMUがStreamsを購読するheadテーブル | `head` |
| `STREAM_JOURNAL_TABLE_NAME` | 強い整合性の読み取りで欠落を補うjournal | `journal` |
| `STREAM_MAX_ITEM_COUNT` | 1ページの最大レコード数。1〜1000に制限 | `32` |
| `STREAM_POLL_INTERVAL_MS` | ストリーム末尾またはバッチ失敗後の待機時間 | `200` |
| `STREAM_RETRY_INITIAL_DELAY_MS` | ストリーム処理失敗時の初期待機時間 | `1000` |
| `STREAM_RETRY_MAX_DELAY_MS` | ストリーム処理失敗時の最大待機時間 | `60000` |
| `STREAM_RETRY_JITTER_RATIO` | ストリーム再試行の待機時間に加える揺らぎの比率 | `0.2` |
| `STREAM_RETENTION_MS` | head再同期を行うまでの無進捗時間 | `86400000`（24時間） |

既定値は[RMU設定読込処理](../packages/bootstrap/src/rmu-config.ts)にあります。数値変数は空文字でも既定値になり、負数や有限でない数値は設定読込時にエラーになります。テーブル名は未設定の場合だけ既定値になります。復旧対象の識別子、イベント単位の再試行、任意のSQS通知に使う `RMU_*` は[dead-letter復旧手順](DEAD_LETTER_RECOVERY.ja.md)と[common.env.default](../common.env.default)にあります。ストリームのポーリング設定とは別です。

## 設定の参照元と既存手順

[アプリCompose](../tools/docker-compose/docker-compose-applications.yml)が各コンテナの環境変数を指定します。[docker-compose-up.sh](../tools/scripts/docker-compose-up.sh)はルートの `common.env` を読み込み、なければ [common.env.default](../common.env.default) から作成します。読み込んだ値はシェルスクリプトとComposeの変数展開に渡ります。すべての変数が各コンテナに渡るわけではありません。Composeの固定値はそのままで、`${...}` の項目だけがホストの値を参照します。Nodeを直接起動する場合はプロセスの環境変数を使い、`common.env` は自動読込されません。

通常の起動スクリプトはLambda RMUをビルド・デプロイし、ローカルRMUを停止する場合があります。ローカル3アプリを使う場合、`common.env` の `DOCKER_COMPOSE_UP_BUILD_LAMBDA=0` と `DOCKER_COMPOSE_UP_DEPLOY_LAMBDA=0` でこの切替を無効にできます。[Lambda手順](BUILD_AND_TEST.ja.md)も参照してください。e2eは最初からLambdaを使わずローカルRMUを使います。`common.env` の `LOCALSTACK_ENDPOINT_URL` はホストのスクリプト向けで、アプリの `AWS_DYNAMODB_ENDPOINT_URL` とは別です。

- [イメージのビルドとCompose起動](DEBUG_ON_DOCKER_COMPOSE.ja.md#ビルドイメージ)。
- [Compose停止](DEBUG_ON_DOCKER_COMPOSE.ja.md#docker-composeの停止)。
- [ローカルマシンでのデバッグ](DEBUG_ON_LOCAL_MACHINE.ja.md)。
- [ビルドとe2e実行](BUILD_AND_TEST.ja.md#e2eテスト)。
- [リードモデルDBのマイグレーション](DATABASE_MIGRATIONS.ja.md)。

起動・停止スクリプトは `down -v` を実行します。通常構成の起動時にはコンテナを再作成し、以前のComposeデータを削除します。
