# RMU の DLQ 復旧と SQS 通知

リードモデル更新処理（RMU）は、投影できないイベントを飛ばしません。恒久的な失敗は `read_model_dead_letters` の行として保存し、`recoverReadModel` が journal から読み直して再適用します。この文書では、失敗の種類、SQS 通知トランスポート、運用の手順を説明します。

## 失敗の分類

`packages/rmu/src/failures.ts` が投影の失敗を分類します。

| 失敗種別 | 意味 | 先に再試行するか | DLQ に保存するか |
| --- | --- | --- | --- |
| `transient` | スロットリング、接続断、Prisma の初期化失敗など、ストア全体の障害 | する | しない。配信ループが退避する |
| `journal-gap` | head が見せたイベントが journal に無い | しない | する |
| `projection-gap` | トランザクション中に位置行が動いた | する | 解消しなければ保存する |
| `projection-error` | 上記以外の恒久的な投影失敗 | する | する |
| `projection-blocked` | 同じ集約の先行イベントが失敗したため、適用しなかった | しない | する。バッチの上限まで |
| `payload-decode` | 保存用のエンベロープは読めたが、ドメインの payload を復号できなかった | しない | する |

DLQ の行には、ストア識別子、投影の名前と版、集約 ID、`seq_nr`、失敗種別、エラーメッセージ、試行回数、`occurred_at`、manifest、配信レコード ID を保存します。イベント本文は保存しません。復旧時は journal にある正本の payload を読み直します。

## payload の復号失敗

head の各イベントは、エンベロープ（`seq_nr`、`occurred_at`、`manifest`、payload）を head アイテムの中に持ちます。payload を復号できないとき、アダプタはエンベロープを残したまま例外を投げず、復号失敗の入力として返します。

1. 失敗したイベントより前の、復号できたイベントは通常どおり適用します。
2. 復号失敗は `failure_type = payload-decode`、`attempts = 1` で `read_model_dead_letters` に保存します。再配信されると同じ行を上書きし、`attempts` を加算します。
3. その集約の位置は進めません。同じ集約の後続イベントは適用せず、失敗として報告してプロバイダに再配信させます。
4. DLQ 行を保存できないときは配信を失敗させます。恒久的なタスクが無い状態では、イベントを安全に飛ばせないからです。

復号失敗では、配信ループは journal を読みません。`recoverReadModel` が現在位置から失敗した `seq_nr` までを journal から昇順に読み、順に適用します。位置が目標に達したことを確認してから行を削除します。journal の payload も復号できないときは行を残し、復旧の失敗として報告します。

古い重複は無視します。位置が失敗した `seq_nr` 以上になっていれば、再配信された復号失敗は行を追加せずに飛ばすため、復旧後の再試行は成功します。

## バッチ内の記録と上限

head イメージは集約のイベントを全件持つため、投影できないイベントが1つあると、その後のイベントも適用できません。updater は最初の失敗を保存し、そのあとに続く止まったイベントを `projection-blocked` として保存します。`error_message` には元の失敗を書きます。

`RMU_DEAD_LETTER_BATCH_LIMIT`（既定 100）が、1回の `apply` で集約ごとに書く行数の上限です。最初の失敗は必ず保存します。上限を超えた止まったイベントは失敗として報告し、再配信します。次回の配信で、位置が進んだあとに保存します。この上限により、長い head イメージがテーブルを埋めるのを防ぎます。

`projection-blocked` の復旧も他の行と同じです。現在位置から止まった `seq_nr` まで journal を再適用します。先行する失敗を直して適用できれば、止まっていた行は何もせずに削除されます。

## Lambda の起動時照合

ローカルの Streams 読み取りは、開始前に head テーブルを全件照合します。Lambda ハンドラも、コンテナ内の最初の呼び出しで同じ処理を行います。

1. ハンドラは head テーブルを `ConsistentRead` で全ページ Scan します。
2. 復号した head イベントを、通常と同じ位置ガードで適用します。これにより、各集約のリードモデル位置から journal までを補い、重複を捨てます。
3. Scan はコンテナごとに1回だけ実行します。成功した実行は記憶し、失敗した実行は忘れて次の呼び出しでやり直します。
4. Scan が成功してから、ストリームのバッチを処理します。

これにより、イベントソースマッピングの開始前に書かれた集約のイベントと、Streams の保持期間を超えた長い停止を補います。適用できないイベントは通常の配信と同じく DLQ に保存します。一時的な Scan の失敗は呼び出しを失敗させ、Lambda が再試行します。

## 復旧タスク

```shell
$ node dist/index.js recoverReadModel
```

未解決の行を古い順に最大 `RMU_RECOVERY_BATCH_SIZE` 件（既定 100）読みます。結果は `recovered`、`failed`、`remaining` で返します。`remaining` は、その回に読んだ件数ではなく、実行後に残っている未解決タスクの総数です。何度実行しても安全です。適用は冪等で、位置は戻りません。復旧できなかった行があれば終了コードは 0 以外になるので、スケジューラから検知できます。

実行するのは次の3つの場面です。

- 定期的に実行する。たとえば5分ごとです。これにより、運用者が気づかなくても DLQ が解消します。
- 原因を直したあとに実行する。journal の payload を修正した、投影の不具合を直してデプロイした、といった場合です。
- SQS 通知を受けた消費者から実行する。

## SQS 通知トランスポート

SQS は任意の高速化手段です。MySQL の行が恒久的なタスクであり、通知が失われても、重複しても、遅れても、復旧が遅れるだけです。通知の失敗は `onNotificationError` に渡し、配信ループでは再試行しません。

### 設定

| 環境変数 | 用途 |
| --- | --- |
| `RMU_DEAD_LETTER_QUEUE_URL` | キューの URL。空なら通知しない |
| `RMU_DEAD_LETTER_MESSAGE_GROUP_ID` | FIFO キューのグループ ID。標準キューでは空にする |
| `RMU_DEAD_LETTER_QUEUE_REGION` | SQS のリージョン。既定は `AWS_REGION` |
| `AWS_SQS_ENDPOINT_URL` | 接続先の上書き。LocalStack では `AWS_DYNAMODB_ENDPOINT_URL` にフォールバックする |
| `RMU_DEAD_LETTER_CONSUME_MAX_MESSAGES` | ワーカーが1回に受け取る件数。上限は 10 |
| `RMU_DEAD_LETTER_CONSUME_WAIT_TIME_SECONDS` | ロングポーリングの待ち時間。上限は 20 秒 |
| `RMU_DEAD_LETTER_CONSUME_VISIBILITY_TIMEOUT_SECONDS` | 復旧に失敗したメッセージを再配信するまでの時間 |

AWS では SDK の既定の認証情報チェーンを使います。LocalStack では `AWS_DYNAMODB_ACCESS_KEY_ID` と `AWS_DYNAMODB_SECRET_ACCESS_KEY` を使います。

### メッセージの形

本文は識別情報だけの JSON です。イベント本文は含めません。

```json
{
  "deadLetterId": "group-chat-read-model:GroupChat-01H...:4",
  "storeId": "dynamodb-head",
  "projectionName": "group-chat-read-model",
  "projectionVersion": "1",
  "aggregateId": "GroupChat-01H...",
  "seqNr": 4,
  "failureType": "payload-decode",
  "attempts": 1,
  "occurredAt": "2026-11-08T00:00:00.000Z",
  "manifest": "GroupChatRenamed@1",
  "recordIdentifier": "record-1"
}
```

メッセージ属性は `projection_name`、`failure_type`、`aggregate_id`、`seq_nr` です。消費者は本文を解析せずにこれらで絞り込めます。

`deadLetterId` は（投影、集約、`seq_nr`）の組に対して変わりません。消費者はこれで重複を排除できます。FIFO キューには `MessageGroupId` と `MessageDeduplicationId = deadLetterId` を設定します。標準キューにはどちらも設定しません。標準キューはこれらの項目を受け付けないためです。

### キューの作成

標準キューで足ります。復旧は冪等で、順序を必要としないからです。消費者が集約ごとの順序を必要とする場合だけ FIFO を使います。

```shell
$ aws sqs create-queue \
    --queue-name read-model-dead-letters \
    --attributes VisibilityTimeout=30,MessageRetentionPeriod=1209600,SqsManagedSseEnabled=true
```

通知側にはキュー ARN に対する `sqs:SendMessage` が要ります。カスタマー管理の KMS キーを使う場合は `kms:Decrypt` と `kms:GenerateDataKey` も加えます。

### 復旧ワーカー

消費者は `packages/rmu/src/dead-letter-consumer.ts` です。メッセージは起動の合図だけです。消費者は（投影、集約、`seq_nr`）で永続行を読み、復旧タスクが journal からイベント本文を読み直します。行がすでに無いメッセージは古い通知として確認応答します。復旧に失敗したメッセージは再配信に残します。不正なメッセージはログに残して確認応答します。参照していた行は定期実行が解消します。

同じ消費者を2つの実行形態が使います。

- Lambda ハンドラ `packages/bootstrap/src/sqs-dead-letter-handler.ts`。イベントソースマッピングで `ReportBatchItemFailures` を有効にし、復旧に失敗したメッセージだけを再試行させます。
- CLI ワーカー `node dist/index.js sqsDeadLetterWorker`。キューをロングポーリングし、復旧に失敗したメッセージを可視性タイムアウトまで確認応答しません。

ワーカー Lambda は `pnpm build-sqs-dead-letter-worker-lambda` でビルドします。zip は `dist/lambda/sqs-dead-letter-worker/function.zip` です。

```shell
$ aws lambda create-function \
    --function-name sqs-dead-letter-worker \
    --runtime nodejs20.x --handler index.handler \
    --role <ワーカーのロール> \
    --zip-file fileb://dist/lambda/sqs-dead-letter-worker/function.zip

$ aws lambda create-event-source-mapping \
    --function-name sqs-dead-letter-worker \
    --event-source-arn <キューの ARN> \
    --function-response-types ReportBatchItemFailures \
    --batch-size 10
```

ワーカーにはキューに対する `sqs:ReceiveMessage`、`sqs:DeleteMessage`、`sqs:GetQueueAttributes` が要ります。RMU と同じく head と journal の読み取り、`read_model_dead_letters`、データベースへの接続も必要です。

ワーカーがあっても、定期実行は残します。通知が失われたときの代替になるからです。

### LocalStack

```shell
$ pnpm create-dead-letter-queue-localstack
# 表示された URL を common.env に追加してから Compose を起動する
RMU_DEAD_LETTER_QUEUE_URL=http://localhost:34566/000000000000/read-model-dead-letters
```

ローカルのワーカーは次のコマンドで起動します。

```shell
$ docker compose --profile dead-letter-worker up sqs-dead-letter-worker-1
```

ローカルの RMU、ワーカー、Lambda のデプロイスクリプトは、どれも同じ環境変数を読みます。

## プロバイダ側の失敗送信先との違い

安全網は2つあり、役割が違います。

- イベントソースマッピングの `LAMBDA_DEAD_LETTER_ARN`（または Lambda の `OnFailure` を受け取るキュー）は、呼び出しが処理しなかったレコードや、再試行を使い切ったレコードを保持します。単位はイベントではなく、プロバイダの呼び出しです。
- `read_model_dead_letters` は、集約 ID と `seq_nr` を持つアプリケーションの恒久障害を保持します。こちらが復旧の元です。

両方を残します。プロバイダ側の送信先は呼び出し単位の取りこぼしを拾い、アプリケーションのテーブルは復旧を可能にします。

## 運用手順

1. 新しい行、または空でないキューを検知してアラートを出します。未解決のタスクを確認します。

   ```sql
   SELECT projection_name, aggregate_id, seq_nr, failure_type, attempts,
          occurred_at, manifest, record_identifier, error_message
     FROM read_model_dead_letters
    ORDER BY created_at ASC;
   ```

2. `failure_type` と `error_message` から原因を特定します。`payload-decode` の行は、head または journal のバイト列が現在の manifest に対して正しくないことを意味します。
3. 原因を直します。投影の修正をデプロイするか、バックアップやスナップショットから journal の payload を復元します。
4. `recoverReadModel` を実行します。終了コードが0になるまで、または `RMU_RECOVERY_BATCH_SIZE` が処理の上限にならなくなるまで繰り返します。
5. 位置とリードモデルを確認します。

   ```sql
   SELECT aggregate_id, last_processed_sequence_number
     FROM read_model_positions
    WHERE aggregate_id = '<集約 ID>';
   ```

6. journal の payload を直せないときは、データの所有者と相談してリードモデルの埋め直し方法を決めます。復旧タスクは設計上、イベントを飛ばせません。

## 制約

- 1回の実行で処理するのは最大 `RMU_RECOVERY_BATCH_SIZE` 件です。大量にたまっているときは繰り返し実行します。
- 同じバッチの中では、集約ごとに最初の失敗と止まったイベントを合わせて `RMU_DEAD_LETTER_BATCH_LIMIT` 件まで DLQ に保存します。上限を超えたイベントは失敗として報告し、再配信のあとに保存します。`seq_nr N` を復旧するとその行は解消し、プロバイダの再試行か次の head イメージが `N+1` 以降を適用します。head イメージは常にイベントの全件を持つので、その集約に後から書き込みがあれば範囲が再配信されます。
- Lambda の起動時照合は、head テーブルを強整合で全件読みます。所要時間とメモリはテーブルの大きさに比例するので、想定する最大のテーブルに合わせて関数のタイムアウトとメモリを決めます。
- 復旧タスクは journal を修復しません。journal にある内容を再適用するだけです。
