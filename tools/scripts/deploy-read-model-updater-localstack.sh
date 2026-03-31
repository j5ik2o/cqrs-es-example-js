#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "${ROOT}"

ZIP="${ROOT}/dist/lambda/read-model-updater/function.zip"
if [ ! -f "${ZIP}" ]; then
  echo "Missing ${ZIP}. Run: pnpm build-read-model-updater-lambda" >&2
  exit 1
fi

# shellcheck disable=SC1091
[ -f "${ROOT}/common.env" ] && set -a && source "${ROOT}/common.env" && set +a

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-x}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-x}"
export AWS_DEFAULT_REGION="${AWS_REGION:-ap-northeast-1}"

LOCALSTACK_ENDPOINT_URL="${LOCALSTACK_ENDPOINT_URL:-http://localhost:34566}"
FUNCTION_NAME="${FUNCTION_NAME:-read-model-updater-rmu}"
STREAM_JOURNAL_TABLE_NAME="${STREAM_JOURNAL_TABLE_NAME:-journal}"
ROLE_ARN="${LAMBDA_ROLE_ARN:-arn:aws:iam::000000000000:role/lambda-role}"
# LocalStack 2.x community image may not list nodejs20.x; use nodejs18.x unless overridden.
RUNTIME="${LAMBDA_RUNTIME:-nodejs18.x}"

DATABASE_URL_LAMBDA="${DATABASE_URL_LAMBDA:-mysql://ceer:ceer@mysql-local:3306/ceer}"
STREAM_MAX_ITEM_COUNT="${STREAM_MAX_ITEM_COUNT:-32}"

wait_for_localstack() {
  local i
  for i in $(seq 1 90); do
    if aws dynamodb list-tables \
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

if ! aws iam get-role \
  --role-name lambda-role \
  --endpoint-url "${LOCALSTACK_ENDPOINT_URL}" \
  --region "${AWS_DEFAULT_REGION}" \
  >/dev/null 2>&1; then
  aws iam create-role \
    --role-name lambda-role \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
    --endpoint-url "${LOCALSTACK_ENDPOINT_URL}" \
    --region "${AWS_DEFAULT_REGION}" \
    >/dev/null 2>&1 || true
fi

STREAM_ARN="$(aws dynamodb describe-table \
  --table-name "${STREAM_JOURNAL_TABLE_NAME}" \
  --endpoint-url "${LOCALSTACK_ENDPOINT_URL}" \
  --region "${AWS_DEFAULT_REGION}" \
  --query 'Table.LatestStreamArn' \
  --output text)"

if [ "${STREAM_ARN}" = "None" ] || [ -z "${STREAM_ARN}" ]; then
  echo "Could not read DynamoDB stream ARN for table ${STREAM_JOURNAL_TABLE_NAME}" >&2
  exit 1
fi

ENV_FILE="$(mktemp)"
trap 'rm -f "${ENV_FILE}"' EXIT

python3 - <<PY > "${ENV_FILE}"
import json
print(json.dumps({
  "Variables": {
    "DATABASE_URL": "${DATABASE_URL_LAMBDA}",
    "AWS_REGION": "${AWS_DEFAULT_REGION}",
    "AWS_DYNAMODB_ENDPOINT_URL": "http://localstack:4566",
    "AWS_DYNAMODB_ACCESS_KEY_ID": "${AWS_ACCESS_KEY_ID}",
    "AWS_DYNAMODB_SECRET_ACCESS_KEY": "${AWS_SECRET_ACCESS_KEY}",
    "STREAM_JOURNAL_TABLE_NAME": "${STREAM_JOURNAL_TABLE_NAME}",
    "STREAM_MAX_ITEM_COUNT": "${STREAM_MAX_ITEM_COUNT}",
  }
}))
PY

create_or_update_function() {
  set +e
  aws lambda get-function \
    --function-name "${FUNCTION_NAME}" \
    --endpoint-url "${LOCALSTACK_ENDPOINT_URL}" \
    --region "${AWS_DEFAULT_REGION}" \
    >/dev/null 2>&1
  local exists=$?
  set -e

  if [ "${exists}" -ne 0 ]; then
    aws lambda create-function \
      --function-name "${FUNCTION_NAME}" \
      --runtime "${RUNTIME}" \
      --handler index.handler \
      --role "${ROLE_ARN}" \
      --zip-file "fileb://${ZIP}" \
      --timeout 120 \
      --memory-size 512 \
      --environment "file://${ENV_FILE}" \
      --endpoint-url "${LOCALSTACK_ENDPOINT_URL}" \
      --region "${AWS_DEFAULT_REGION}"
  else
    aws lambda update-function-code \
      --function-name "${FUNCTION_NAME}" \
      --zip-file "fileb://${ZIP}" \
      --endpoint-url "${LOCALSTACK_ENDPOINT_URL}" \
      --region "${AWS_DEFAULT_REGION}"
    aws lambda update-function-configuration \
      --function-name "${FUNCTION_NAME}" \
      --environment "file://${ENV_FILE}" \
      --timeout 120 \
      --memory-size 512 \
      --endpoint-url "${LOCALSTACK_ENDPOINT_URL}" \
      --region "${AWS_DEFAULT_REGION}"
  fi
}

create_or_update_function

# Lambda が Active になるまで待機
wait_for_lambda_active() {
  local i
  for i in $(seq 1 60); do
    local state
    state=$(aws lambda get-function \
      --function-name "${FUNCTION_NAME}" \
      --endpoint-url "${LOCALSTACK_ENDPOINT_URL}" \
      --region "${AWS_DEFAULT_REGION}" \
      --query 'Configuration.State' \
      --output text 2>/dev/null) || true
    if [ "${state}" = "Active" ]; then
      echo "Lambda ${FUNCTION_NAME} is Active"
      return 0
    fi
    sleep 2
  done
  echo "Timeout waiting for Lambda ${FUNCTION_NAME} to become Active" >&2
  return 1
}

wait_for_lambda_active

# Event source mapping (idempotent: delete existing for this function + stream if any)
while read -r uuid; do
  [ -z "${uuid}" ] && continue
  aws lambda delete-event-source-mapping \
    --uuid "${uuid}" \
    --endpoint-url "${LOCALSTACK_ENDPOINT_URL}" \
    --region "${AWS_DEFAULT_REGION}" \
    >/dev/null 2>&1 || true
done < <(aws lambda list-event-source-mappings \
  --function-name "${FUNCTION_NAME}" \
  --endpoint-url "${LOCALSTACK_ENDPOINT_URL}" \
  --region "${AWS_DEFAULT_REGION}" \
  --query 'EventSourceMappings[].UUID' \
  --output text 2>/dev/null | tr '\t' '\n')

# DynamoDB Stream が利用可能になるまでリトライ
create_event_source_mapping() {
  local i
  for i in $(seq 1 30); do
    ESM_OUTPUT=$(aws lambda create-event-source-mapping \
      --function-name "${FUNCTION_NAME}" \
      --event-source-arn "${STREAM_ARN}" \
      --batch-size 10 \
      --starting-position TRIM_HORIZON \
      --endpoint-url "${LOCALSTACK_ENDPOINT_URL}" \
      --region "${AWS_DEFAULT_REGION}" 2>&1) && break
    echo "Waiting for DynamoDB stream to become available (attempt ${i}/30)..." >&2
    sleep 2
  done
  echo "${ESM_OUTPUT}"
}

ESM_OUTPUT=$(create_event_source_mapping)

ESM_UUID=$(echo "${ESM_OUTPUT}" | python3 -c "import sys,json; print(json.load(sys.stdin)['UUID'])")

# Event Source Mapping が Enabled になるまで待機
wait_for_esm_enabled() {
  local i
  for i in $(seq 1 60); do
    local state
    state=$(aws lambda get-event-source-mapping \
      --uuid "${ESM_UUID}" \
      --endpoint-url "${LOCALSTACK_ENDPOINT_URL}" \
      --region "${AWS_DEFAULT_REGION}" \
      --query 'State' \
      --output text 2>/dev/null) || true
    if [ "${state}" = "Enabled" ]; then
      echo "Event source mapping ${ESM_UUID} is Enabled"
      return 0
    fi
    sleep 2
  done
  echo "Timeout waiting for event source mapping to become Enabled" >&2
  return 1
}

wait_for_esm_enabled

if [ "${STOP_LOCAL_RMU_AFTER_LAMBDA_DEPLOY:-1}" != "0" ]; then
  COMPOSE_PROJECT="${COMPOSE_PROJECT:-cqrs-es-example-js}"
  COMPOSE_FILES=(
    -f "${ROOT}/tools/docker-compose/docker-compose-databases.yml"
    -f "${ROOT}/tools/docker-compose/docker-compose-applications.yml"
  )
  docker compose -p "${COMPOSE_PROJECT}" "${COMPOSE_FILES[@]}" stop read-model-updater-1 || true
fi

echo "Deployed Lambda ${FUNCTION_NAME} with stream ${STREAM_ARN}"
