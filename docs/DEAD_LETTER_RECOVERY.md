# Dead-letter recovery and SQS notifications

The read model updater (RMU) never skips an event it cannot project. A permanent failure becomes a row in `read_model_dead_letters`, and `recoverReadModel` replays that event from the journal. This document covers the failure paths, the SQS notification transport, and the operator runbook.

## Failure classification

`packages/rmu/src/failures.ts` classifies every projection failure.

| Failure type | Meaning | Retried first | Dead-lettered |
| --- | --- | --- | --- |
| `transient` | Store-wide outage: throttling, connection loss, Prisma initialization | Yes | No. The delivery loop backs off |
| `journal-gap` | The head exposed an event the journal does not contain | No | Yes |
| `projection-gap` | The position row moved under the transaction | Yes | Yes if it persists |
| `projection-error` | Any other permanent projection failure | Yes | Yes |
| `projection-blocked` | An earlier event of the same aggregate failed, so this one was not applied | No | Yes, within the batch limit |
| `payload-decode` | The storage envelope was readable, the domain payload was not | No | Yes |

A dead letter stores the store id, projection name and version, aggregate id, `seq_nr`, failure type, error message, attempt count, `occurred_at`, manifest, and delivery record id. It never stores the event body. Recovery reads the authoritative payload from the journal.

## Payload decode failures

A head event carries its envelope (`seq_nr`, `occurred_at`, `manifest`, payload) inside the head item. When the payload cannot be decoded, the adapter keeps the envelope and emits a decode-failure input instead of throwing.

1. The projection applies every decodable event before the failure.
2. The decode failure is written to `read_model_dead_letters` with `failure_type = payload-decode` and `attempts = 1`. A redelivery upserts the same row and adds to `attempts`.
3. The aggregate stops advancing. Later events of the same aggregate are not applied; they are reported as failed so the provider redelivers them.
4. If the dead-letter row cannot be written, the delivery fails. Without a durable task the event cannot be skipped safely.

The delivery loop does not read the journal for a decode failure. `recoverReadModel` re-reads the journal range from the current position through the failed `seq_nr`, applies it in order, verifies the position reached the target, and deletes the row. If the journal payload is also undecodable, the row stays and recovery reports a failure.

A stale duplicate is ignored. When the position is already at or past the failed `seq_nr`, a redelivered decode failure is skipped without writing another row, so a retry after recovery succeeds.

## Batch recording and limits

A head image carries every event of the aggregate, so one unprojectable event leaves a tail that cannot be applied either. The updater records the first failure, then records each blocked event as `projection-blocked` with the originating failure in `error_message`.

`RMU_DEAD_LETTER_BATCH_LIMIT` (default 100) caps the rows written per aggregate in one `apply` call. The first failure is always recorded. Blocked events beyond the cap are still reported as failed and redelivered, so the next delivery records them after the position advances. The cap keeps one long head image from flooding the table.

Recovery of a `projection-blocked` row is the same as any other row: it replays the journal range from the current position through the blocked `seq_nr`. Once the earlier failure is fixed and applied, the blocked rows become no-ops and are deleted.

## Lambda cold-start reconciliation

The local stream reader reconciles the whole head table before it starts. The Lambda handler does the same on the first invocation in a container.

1. The handler scans the head table with `ConsistentRead`, following every page.
2. It applies the decoded head events through the normal position guard. This fills each aggregate from its read-model position through the journal and drops duplicates.
3. The scan runs once per container. A successful run is remembered; a failed run is forgotten so the next invocation retries it.
4. Only after the scan succeeds does the handler process the stream batch.

This covers an aggregate whose events were written before the event source mapping started, and a long gap beyond the Streams retention window. A scan that cannot apply an event is dead-lettered like any delivery; a transient scan failure rejects the invocation so Lambda retries it.

## Recovery task

```shell
$ node dist/index.js recoverReadModel
```

The task reads up to `RMU_RECOVERY_BATCH_SIZE` rows (default 100), oldest first. It reports `recovered`, `failed`, and `remaining`; `remaining` is the total unresolved count after the run, not just the fetched batch. Running it again is safe: every apply is idempotent and the position never moves backwards. It exits non-zero when a row could not be recovered, so a scheduler can alert.

Run it in three situations.

- On a schedule, for example every five minutes, so a dead letter heals without an operator.
- After an operator fixes the cause: a corrected journal payload, a projection bug fix, or a deployment.
- After an SQS notification, if a consumer invokes the task.

## SQS notification transport

SQS is an optional accelerator. The MySQL row is the durable task; a lost, duplicated, or delayed notification only delays recovery. A notification failure is reported to `onNotificationError` and is not retried in the delivery loop.

### Configuration

| Variable | Purpose |
| --- | --- |
| `RMU_DEAD_LETTER_QUEUE_URL` | Queue URL. Empty disables notifications. |
| `RMU_DEAD_LETTER_MESSAGE_GROUP_ID` | FIFO queue group id. Leave empty for a standard queue. |
| `RMU_DEAD_LETTER_QUEUE_REGION` | SQS region. Defaults to `AWS_REGION`. |
| `AWS_SQS_ENDPOINT_URL` | Endpoint override. Falls back to `AWS_DYNAMODB_ENDPOINT_URL` for LocalStack. |
| `RMU_DEAD_LETTER_CONSUME_MAX_MESSAGES` | Worker receive batch, capped at 10. |
| `RMU_DEAD_LETTER_CONSUME_WAIT_TIME_SECONDS` | Long-poll wait, capped at 20 seconds. |
| `RMU_DEAD_LETTER_CONSUME_VISIBILITY_TIMEOUT_SECONDS` | Delay before a failed recovery is redelivered. |

Credentials use the SDK default chain in AWS. LocalStack uses `AWS_DYNAMODB_ACCESS_KEY_ID` and `AWS_DYNAMODB_SECRET_ACCESS_KEY`.

### Message contract

The body is JSON with identity fields only. The event body is never included.

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

Message attributes are `projection_name`, `failure_type`, `aggregate_id`, and `seq_nr`. Consumers can filter on them without parsing the body.

`deadLetterId` is stable for a (projection, aggregate, `seq_nr`) task, so a consumer can deduplicate delivery. A FIFO queue receives `MessageGroupId` and `MessageDeduplicationId = deadLetterId`; a standard queue receives neither, because it rejects those fields.

### Queue setup

A standard queue is enough: recovery is idempotent and does not require ordering. Use FIFO only when a consumer needs per-aggregate order.

```shell
$ aws sqs create-queue \
    --queue-name read-model-dead-letters \
    --attributes VisibilityTimeout=30,MessageRetentionPeriod=1209600,SqsManagedSseEnabled=true
```

The notifier needs `sqs:SendMessage` on the queue ARN. With a customer-managed KMS key, add `kms:Decrypt` and `kms:GenerateDataKey`.

### Recovery worker

The consumer is `packages/rmu/src/dead-letter-consumer.ts`. The message is a trigger only: the consumer loads the durable row by (projection, aggregate, `seq_nr`) and the recovery task re-reads the event body from the journal. A message whose row is already gone is acknowledged as stale. A recovery failure leaves the message for redelivery. Invalid messages are logged and acknowledged; the scheduled task still heals any row they referenced.

Two runners use the same consumer.

- Lambda handler `packages/bootstrap/src/sqs-dead-letter-handler.ts`. Enable `ReportBatchItemFailures` on the event source mapping so only a failed recovery is retried.
- CLI worker `node dist/index.js sqsDeadLetterWorker`. It long-polls the queue and leaves a failed recovery unacknowledged for the visibility timeout.

Build the worker Lambda with `pnpm build-sqs-dead-letter-worker-lambda`. The zip is `dist/lambda/sqs-dead-letter-worker/function.zip`.

```shell
$ aws lambda create-function \
    --function-name sqs-dead-letter-worker \
    --runtime nodejs20.x --handler index.handler \
    --role <worker role> \
    --zip-file fileb://dist/lambda/sqs-dead-letter-worker/function.zip

$ aws lambda create-event-source-mapping \
    --function-name sqs-dead-letter-worker \
    --event-source-arn <queue arn> \
    --function-response-types ReportBatchItemFailures \
    --batch-size 10
```

The worker needs `sqs:ReceiveMessage`, `sqs:DeleteMessage`, and `sqs:GetQueueAttributes` on the queue. It also needs the same head/journal read access, `read_model_dead_letters`, and database connectivity as the RMU.

Keep the scheduled `recoverReadModel` even when the worker runs. The schedule is the fallback when a notification is lost.

### LocalStack

```shell
$ pnpm create-dead-letter-queue-localstack
# Add the printed URL to common.env, then start Compose.
RMU_DEAD_LETTER_QUEUE_URL=http://localhost:34566/000000000000/read-model-dead-letters
```

Start the optional local worker with:

```shell
$ docker compose --profile dead-letter-worker up sqs-dead-letter-worker-1
```

The local RMU, the worker and the Lambda deployment script all read the same variables.

## Provider-level failure destination

Two different safety nets exist.

- `LAMBDA_DEAD_LETTER_ARN` on the event source mapping (or the queue that receives Lambda `OnFailure`) holds records the invocation never handled or exhausted its retries for. It is tied to the provider invocation, not to an event.
- `read_model_dead_letters` holds application-level permanent failures with the aggregate id and `seq_nr`. It is the recovery source.

Keep both. The provider destination catches invocation-level loss; the application table makes recovery possible.

## Runbook

1. Alert on new rows or on a non-empty queue. Query the unresolved tasks.

   ```sql
   SELECT projection_name, aggregate_id, seq_nr, failure_type, attempts,
          occurred_at, manifest, record_identifier, error_message
     FROM read_model_dead_letters
    ORDER BY created_at ASC;
   ```

2. Find the cause from `failure_type` and `error_message`. A `payload-decode` row means the head or journal bytes are not valid for the current manifest.
3. Fix the cause. Deploy the projection fix, or repair the journal payload from a backup or snapshot.
4. Run `recoverReadModel`. Repeat until it exits zero or `RMU_RECOVERY_BATCH_SIZE` no longer limits the run.
5. Confirm the position and the read model.

   ```sql
   SELECT aggregate_id, last_processed_sequence_number
     FROM read_model_positions
    WHERE aggregate_id = '<aggregate id>';
   ```

6. If the journal payload cannot be repaired, decide with the owner of the data how to backfill the read model. Recovery cannot skip the event, by design.

## Limitations

- One run processes at most `RMU_RECOVERY_BATCH_SIZE` tasks. Run it repeatedly for a large backlog.
- Within one batch, the first failure and blocked events are dead-lettered up to a total of `RMU_DEAD_LETTER_BATCH_LIMIT` rows per aggregate. Events beyond the cap are reported as failed and redelivered, then recorded on a later delivery. Recovery of `seq_nr N` heals its row, and the provider retry or the next head image applies `N+1` and later. A head image always contains the full event list, so any later write to the aggregate re-delivers the range.
- The Lambda cold-start scan reads the whole head table with strong consistency. Its time and memory grow with the table size, so size the function timeout and memory for the largest expected table.
- The recovery task does not repair the journal. It replays what the journal contains.
