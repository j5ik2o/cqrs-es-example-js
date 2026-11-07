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

## Recovery task

```shell
$ node dist/index.js recoverReadModel
```

The task reads up to `RMU_RECOVERY_BATCH_SIZE` rows (default 100), oldest first. Running it again is safe: every apply is idempotent and the position never moves backwards. It exits non-zero when a row could not be recovered, so a scheduler can alert.

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

### Consumer choices

- A scheduled job that runs `recoverReadModel` every few minutes. This is the simplest production setup and does not depend on the queue.
- A Lambda or ECS worker that receives one message and runs `recoverReadModel`, or invokes it for the message's projection. The task is idempotent, so a redelivery is safe.
- An alert that fires when `ApproximateNumberOfMessagesVisible` is greater than zero.

Keep the schedule even when a queue consumer exists. The schedule is the fallback when a notification is lost.

### LocalStack

```shell
$ pnpm create-dead-letter-queue-localstack
# Add the printed URL to common.env, then start Compose.
RMU_DEAD_LETTER_QUEUE_URL=http://localhost:34566/000000000000/read-model-dead-letters
```

The local RMU and the Lambda deployment script both read the same variables.

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
- Within one batch, only the first failure of an aggregate is dead-lettered; later events are reported as failed and redelivered. A later event that arrives in another batch gets its own row. Recovery of `seq_nr N` heals its row, and the provider retry or the next head image applies `N+1` and later. A head image always contains the full event list, so any later write to the aggregate re-delivers the range.
- The recovery task does not repair the journal. It replays what the journal contains.
