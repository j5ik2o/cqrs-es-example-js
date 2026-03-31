#!/usr/bin/env bash

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${SCRIPT_DIR}" || exit

if [ -f "${ROOT}/common.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/common.env"
  set +a
elif [ -f "${ROOT}/common.env.default" ]; then
  cp "${ROOT}/common.env.default" "${ROOT}/common.env"
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/common.env"
  set +a
fi

export LOCALSTACK_ENDPOINT_URL="${LOCALSTACK_ENDPOINT_URL:-http://localhost:34566}"

export ARCH=$(uname -m)
echo "ARCH=${ARCH}"

if [ "$ARCH" = "x86_64" ]; then
  ARCH="amd64"
fi

if [ "$ARCH" = "aarch64" ]; then
  ARCH="arm64"
fi

F_OPTION="-f ../docker-compose/docker-compose-applications.yml -f ../docker-compose/docker-compose-e2e-test.yml"
# pnpm は `script -- -l` のように先頭に `--` を付ける。getopts は `--` で止まるため除去する
while [ $# -gt 0 ] && [ "$1" = "--" ]; do
  shift
done

SKIP_LAMBDA_BUILD=0
while getopts dl OPT; do
  # shellcheck disable=SC2220
  case ${OPT} in
  "d") F_OPTION="" ;;
  "l") SKIP_LAMBDA_BUILD=1 ;;
  esac
done

# Remove processed options from $@
shift $(($OPTIND - 1))

if [ "${SKIP_LAMBDA_BUILD}" != "1" ] && [ "${DOCKER_COMPOSE_UP_BUILD_LAMBDA:-1}" != "0" ]; then
  (cd "${ROOT}" && ./tools/scripts/build-read-model-updater-lambda.sh)
fi

docker compose -p cqrs-es-example-js -f ../docker-compose/docker-compose-databases.yml ${F_OPTION} down -v --remove-orphans
# e2e-test は profile `e2e` のためここでは起動しない（アプリと DB の準備 → Lambda デプロイ → その後に検証）
docker compose -p cqrs-es-example-js -f ../docker-compose/docker-compose-databases.yml ${F_OPTION} up --remove-orphans --force-recreate --renew-anon-volumes -d "$@"

if [ "${DOCKER_COMPOSE_UP_DEPLOY_LAMBDA:-1}" != "0" ]; then
  if command -v aws >/dev/null 2>&1; then
    (cd "${ROOT}" && ./tools/scripts/deploy-read-model-updater-localstack.sh)
  else
    echo "Skipping Lambda deploy to LocalStack: aws CLI not found. Install it or set DOCKER_COMPOSE_UP_DEPLOY_LAMBDA=0." >&2
  fi
fi

# GraphQL API が応答してから E2E（compose run はデプロイ後に一度だけ実行）
# --no-deps: depends_on のサービスを再度起動しない（run 時に write/read が再起動すると接続に失敗する）
docker compose -p cqrs-es-example-js -f ../docker-compose/docker-compose-databases.yml ${F_OPTION} --profile e2e run --no-deps --rm e2e-test
