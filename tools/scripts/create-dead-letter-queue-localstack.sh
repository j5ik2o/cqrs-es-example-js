#!/usr/bin/env bash
# Creates the SQS queue that receives RMU dead-letter notifications on
# LocalStack. Idempotent: running it again keeps the existing queue.
#
# The queue carries only the recovery-task identity. The MySQL task remains
# authoritative, so deleting or losing the queue never loses an event.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "${ROOT}"

# shellcheck disable=SC1091
[ -f "${ROOT}/common.env" ] && set -a && source "${ROOT}/common.env" && set +a

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-x}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-x}"
export AWS_DEFAULT_REGION="${AWS_REGION:-ap-northeast-1}"

LOCALSTACK_ENDPOINT_URL="${LOCALSTACK_ENDPOINT_URL:-http://localhost:34566}"
QUEUE_NAME="${RMU_DEAD_LETTER_QUEUE_NAME:-read-model-dead-letters}"

wait_for_localstack() {
  local i
  for i in $(seq 1 90); do
    if aws sqs list-queues \
      --endpoint-url "${LOCALSTACK_ENDPOINT_URL}" \
      --region "${AWS_DEFAULT_REGION}" \
      >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "LocalStack did not become ready at ${LOCALSTACK_ENDPOINT_URL}" >&2
  return 1
}

wait_for_localstack

ATTRIBUTES="VisibilityTimeout=30,MessageRetentionPeriod=1209600,SqsManagedSseEnabled=true"
if [[ "${QUEUE_NAME}" == *.fifo ]]; then
  # The notifier sends MessageGroupId and MessageDeduplicationId for FIFO
  # queues, so content-based deduplication stays off.
  ATTRIBUTES="${ATTRIBUTES},FifoQueue=true"
fi

QUEUE_URL=$(aws sqs create-queue \
  --queue-name "${QUEUE_NAME}" \
  --attributes "${ATTRIBUTES}" \
  --endpoint-url "${LOCALSTACK_ENDPOINT_URL}" \
  --region "${AWS_DEFAULT_REGION}" \
  --query QueueUrl \
  --output text)

echo "Created (or kept) SQS queue ${QUEUE_NAME}"
echo "Add this to common.env:"
echo "RMU_DEAD_LETTER_QUEUE_URL=${QUEUE_URL}"
