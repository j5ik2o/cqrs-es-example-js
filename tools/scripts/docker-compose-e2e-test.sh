#!/usr/bin/env bash
# Runs the Docker Compose e2e: the main Write -> RMU -> Read scenario, then a
# resilience scenario that stops, starts and restarts the local RMU around the
# writes. Every wait is a poll on an observable result; no fixed sleep proves
# success.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "${SCRIPT_DIR}" || exit 1

PROJECT_NAME="${COMPOSE_PROJECT_NAME:-cqrs-es-example-js}"
RESILIENCE_GROUP_CHAT_NAME="${RESILIENCE_GROUP_CHAT_NAME:-resilience-check}"
WAIT_REPLAY_ATTEMPTS="${WAIT_REPLAY_ATTEMPTS:-30}"
WAIT_REPLAY_SLEEP_SEC="${WAIT_REPLAY_SLEEP_SEC:-1}"

# The e2e uses DynamoDB and DynamoDB Streams only. Loading Lambda, IAM and
# CloudWatch costs memory and none of them is needed by the containerized RMU.
export LOCALSTACK_SERVICES="${LOCALSTACK_SERVICES:-dynamodb,dynamodbstreams}"
export LOCALSTACK_DEBUG="${LOCALSTACK_DEBUG:-0}"
export LOCALSTACK_EAGER_SERVICE_LOADING="${LOCALSTACK_EAGER_SERVICE_LOADING:-0}"

E2E_SERVICES=(
  localstack
  mysql
  migration
  dynamodb-setup
  write-api-server-1
  dynamodb-read-model-updater-1
  read-api-server-1
)

COMPOSE_FILES=(
  -f ../docker-compose/docker-compose-databases.yml
  -f ../docker-compose/docker-compose-applications.yml
  -f ../docker-compose/docker-compose-e2e-test.yml
)

compose() {
  docker compose -p "${PROJECT_NAME}" "${COMPOSE_FILES[@]}" "$@"
}

fail() {
  echo "Error: $*" >&2
  exit 1
}

dump_logs() {
  echo "=== Compose ps ===" >&2
  compose ps >&2 || true
  echo "=== Compose logs ===" >&2
  compose logs --no-color --tail=400 >&2 || true
}

on_exit() {
  local status=$?
  if [ "${status}" -ne 0 ]; then
    dump_logs
  fi
  exit "${status}"
}
trap on_exit EXIT

if ! docker image inspect e2e-test-js:latest >/dev/null 2>&1; then
  fail "e2e-test-js:latest is missing. Run: pnpm docker-build-e2e-test"
fi

compose down -v --remove-orphans
compose up --remove-orphans --force-recreate --renew-anon-volumes -d "${E2E_SERVICES[@]}"

assert_no_published_host_ports() {
  local containers
  local container
  local published
  containers=$(compose ps -aq) || fail "could not list the e2e stack containers"
  [ -n "${containers}" ] || fail "the e2e stack has no containers to check"
  for container in ${containers}; do
    published=$(docker port "${container}") || fail "could not read the published ports of ${container}"
    if [ -n "${published}" ]; then
      fail "$(docker inspect --format '{{.Name}}' "${container}") publishes host ports in the e2e stack: ${published}"
    fi
  done
}
assert_no_published_host_ports

run_main() {
  compose --profile e2e run --no-deps --rm e2e-test
}

run_resilience() {
  local scenario="$1"
  compose --profile e2e run --no-deps --rm \
    --entrypoint bash \
    -e E2E_SCENARIO="${scenario}" \
    -e RESILIENCE_GROUP_CHAT_NAME="${RESILIENCE_GROUP_CHAT_NAME}" \
    e2e-test /e2e/verify-resilience.sh
}

mysql_query() {
  compose exec -T mysql mysql -uroot -ppasswd -N -B ceer -e "$1" 2>/dev/null
}

read_resilience_state() {
  mysql_query "SELECT gc.disabled, rp.last_processed_sequence_number,
      (SELECT COUNT(*) FROM members m WHERE m.group_chat_id = gc.id AND m.disabled = 0),
      (SELECT COUNT(*) FROM messages m WHERE m.group_chat_id = gc.id AND m.disabled = 0)
    FROM group_chats gc
    JOIN read_model_positions rp ON rp.aggregate_id = gc.id
    WHERE gc.name = '${RESILIENCE_GROUP_CHAT_NAME}'"
}

assert_resilience_state() {
  local expected
  local state
  expected=$(printf '0\t5\t2\t2')
  state=$(read_resilience_state)
  if [ "${state}" != "${expected}" ]; then
    fail "unexpected read model state for ${RESILIENCE_GROUP_CHAT_NAME}: got [${state}], want [disabled=0 position=5 members=2 messages=2]"
  fi
  echo "Read model state OK (disabled=0 position=5 members=2 messages=2)"
}

rmu_stream_record_count() {
  local count
  count=$(compose logs --no-color --no-log-prefix dynamodb-read-model-updater-1 2>/dev/null | grep -c 'keys = ' || true)
  echo "${count:-0}"
}

# The local RMU re-reads the head stream from TRIM_HORIZON and dedupes through
# read_model_positions. After a restart, require it to observe more records,
# then assert the read model still has exactly one row per event.
wait_for_replay() {
  local before="$1"
  local i
  local after
  for i in $(seq 1 "${WAIT_REPLAY_ATTEMPTS}"); do
    after=$(rmu_stream_record_count)
    if [ "${after}" -ge $((before + 5)) ]; then
      echo "RMU replayed $((after - before)) head-stream records after restart"
      return 0
    fi
    sleep "${WAIT_REPLAY_SLEEP_SEC}"
  done
  fail "RMU did not replay the retained head stream after restart"
}

echo "=== main scenario ==="
run_main

echo "=== resilience scenario: write while the RMU is stopped ==="
compose stop dynamodb-read-model-updater-1
run_resilience write

echo "=== resilience scenario: RMU catches up after start ==="
# `docker compose start` would re-run the service_completed_successfully
# dependencies, so start only the RMU and leave the one-shot setup alone.
compose up -d --no-deps dynamodb-read-model-updater-1
run_resilience verify
assert_resilience_state

echo "=== resilience scenario: replay after restart is idempotent ==="
before=$(rmu_stream_record_count)
compose restart --no-deps dynamodb-read-model-updater-1
wait_for_replay "${before}"
run_resilience verify
assert_resilience_state

echo "=== e2e completed ==="
