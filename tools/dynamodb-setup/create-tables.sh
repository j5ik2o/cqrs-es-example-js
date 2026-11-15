#!/bin/sh

set -e

# shellcheck disable=SC2046
cd $(dirname "$0") && pwd

# shellcheck disable=SC2039
if [ $# == 0 ]; then
  echo "Parameters are empty."
  exit 1
fi

while getopts e: OPT; do
  # shellcheck disable=SC2220
  case ${OPT} in
  "e") ENV_NAME="$OPTARG" ;;
  esac
done

export AWS_DEFAULT_REGION=${AWS_REGION:-${AWS_DEFAULT_REGION}}
export AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID:-x}
export AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY:-x}
export AWS_PAGER=""

ENDPOINT_URL_OPTION=""
DYNAMODB_ENDPOINT=${DYNAMODB_ENDPOINT:-localhost:31566}

JOURNAL_TABLE_NAME=${JOURNAL_TABLE_NAME:-"journal"}
SNAPSHOT_TABLE_NAME=${SNAPSHOT_TABLE_NAME:-"snapshot"}
HEAD_TABLE_NAME=${HEAD_TABLE_NAME:-"head"}
SNAPSHOT_HISTORY_INDEX_NAME=${SNAPSHOT_HISTORY_INDEX_NAME:-"snapshot-history-index"}

echo "DYNAMODB_ENDPOINT = ${DYNAMODB_ENDPOINT}"
echo "JOURNAL_TABLE_NAME = ${JOURNAL_TABLE_NAME}"
echo "SNAPSHOT_TABLE_NAME = ${SNAPSHOT_TABLE_NAME}"
echo "HEAD_TABLE_NAME = ${HEAD_TABLE_NAME}"
echo "SNAPSHOT_HISTORY_INDEX_NAME = ${SNAPSHOT_HISTORY_INDEX_NAME}"

if [ "${ENV_NAME}" = "dev" ]; then
  # shellcheck disable=SC2034
  ENDPOINT_URL_OPTION=" --endpoint-url http://${DYNAMODB_ENDPOINT} "

  # Wait for LocalStack to accept DynamoDB requests before creating tables.
  retries=0
  until aws dynamodb list-tables ${ENDPOINT_URL_OPTION} >/dev/null 2>&1; do
    retries=$((retries + 1))
    if [ "${retries}" -ge 60 ]; then
      echo "LocalStack did not become ready at ${DYNAMODB_ENDPOINT}" >&2
      exit 1
    fi
    sleep 2
  done
fi

# ESA v5 layout: journal is keyed by aid + seq_nr and has no GSI. Journal
# Streams stay disabled because per-aggregate order is not guaranteed there
# (DY-3); the head table is the change feed.
# shellcheck disable=SC2086
aws dynamodb create-table \
  ${ENDPOINT_URL_OPTION} \
  --table-name "${JOURNAL_TABLE_NAME}" \
  --attribute-definitions \
    AttributeName=aid,AttributeType=S \
    AttributeName=seq_nr,AttributeType=N \
  --key-schema \
    AttributeName=aid,KeyType=HASH \
    AttributeName=seq_nr,KeyType=RANGE \
  --provisioned-throughput \
    ReadCapacityUnits=10,WriteCapacityUnits=10

# shellcheck disable=SC2086
aws dynamodb create-table \
  ${ENDPOINT_URL_OPTION} \
  --table-name "${SNAPSHOT_TABLE_NAME}" \
  --attribute-definitions \
    AttributeName=aid,AttributeType=S \
    AttributeName=skey,AttributeType=N \
    AttributeName=active_history_seq_nr,AttributeType=N \
  --key-schema \
    AttributeName=aid,KeyType=HASH \
    AttributeName=skey,KeyType=RANGE \
  --provisioned-throughput \
    ReadCapacityUnits=10,WriteCapacityUnits=10 \
  --global-secondary-indexes \
  "[
    {
      \"IndexName\": \"${SNAPSHOT_HISTORY_INDEX_NAME}\",
      \"KeySchema\": [{\"AttributeName\":\"aid\",\"KeyType\":\"HASH\"},
                      {\"AttributeName\":\"active_history_seq_nr\",\"KeyType\":\"RANGE\"}],
      \"Projection\":{
        \"ProjectionType\":\"KEYS_ONLY\"
      },
      \"ProvisionedThroughput\": {
        \"ReadCapacityUnits\": 10,
        \"WriteCapacityUnits\": 10
      }
    }
  ]"

# The head table is the ESA v5 change feed (DY-12).
# shellcheck disable=SC2086
aws dynamodb create-table \
  ${ENDPOINT_URL_OPTION} \
  --table-name "${HEAD_TABLE_NAME}" \
  --attribute-definitions \
    AttributeName=aid,AttributeType=S \
  --key-schema \
    AttributeName=aid,KeyType=HASH \
  --provisioned-throughput \
    ReadCapacityUnits=10,WriteCapacityUnits=10 \
  --stream-specification StreamEnabled=true,StreamViewType=NEW_IMAGE

# ESA v5 reads one configuration item from each table and requires the same
# store_id and layout_version=1 in all three. Creating them here makes the
# precondition explicit instead of relying on the first write to create them.
STORE_ID="${STORE_ID:-local-e2e}"
for table in "${JOURNAL_TABLE_NAME}" "${SNAPSHOT_TABLE_NAME}" "${HEAD_TABLE_NAME}"; do
  case "${table}" in
  "${JOURNAL_TABLE_NAME}")
    item="{\"aid\":{\"S\":\"__config__\"},\"seq_nr\":{\"N\":\"0\"},\"store_id\":{\"S\":\"${STORE_ID}\"},\"layout_version\":{\"N\":\"1\"}}"
    ;;
  "${SNAPSHOT_TABLE_NAME}")
    item="{\"aid\":{\"S\":\"__config__\"},\"skey\":{\"N\":\"0\"},\"store_id\":{\"S\":\"${STORE_ID}\"},\"layout_version\":{\"N\":\"1\"}}"
    ;;
  *)
    item="{\"aid\":{\"S\":\"__config__\"},\"store_id\":{\"S\":\"${STORE_ID}\"},\"layout_version\":{\"N\":\"1\"}}"
    ;;
  esac
  # shellcheck disable=SC2086
  aws dynamodb put-item \
    ${ENDPOINT_URL_OPTION} \
    --table-name "${table}" \
    --item "${item}"
done
