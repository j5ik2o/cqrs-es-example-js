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

if [ "${DOCKER_COMPOSE_UP_BUILD_LAMBDA:-1}" != "0" ]; then
  if [ ! -f "${ROOT}/dist/lambda/read-model-updater/function.zip" ] || \
     [ "${ROOT}/packages/bootstrap/src/lambda-rmu-handler.ts" -nt "${ROOT}/dist/lambda/read-model-updater/function.zip" ] || \
     [ "${ROOT}/packages/rmu/prisma/schema.prisma" -nt "${ROOT}/dist/lambda/read-model-updater/function.zip" ]; then
    (cd "${ROOT}" && ./tools/scripts/build-read-model-updater-lambda.sh)
  fi
fi

export ARCH=$(uname -m)
echo "ARCH=${ARCH}"

if [ "$ARCH" = "x86_64" ]; then
  ARCH="amd64"
fi

if [ "$ARCH" = "aarch64" ]; then
  ARCH="arm64"
fi

F_OPTION="-f ../docker-compose/docker-compose-applications.yml"

while getopts d OPT; do
  # shellcheck disable=SC2220
  case ${OPT} in
  "d") F_OPTION="" ;;
  esac
done

# Remove processed options from $@
shift $(($OPTIND - 1))

docker compose -p cqrs-es-example-js -f ../docker-compose/docker-compose-databases.yml ${F_OPTION} down -v --remove-orphans
# docker compose -p cqrs-es-example-go -f ../docker-compose/docker-compose-databases.yml ${F_OPTION} build --no-cache
docker compose -p cqrs-es-example-js -f ../docker-compose/docker-compose-databases.yml ${F_OPTION} up --remove-orphans --force-recreate --renew-anon-volumes -d "$@"

if [ "${DOCKER_COMPOSE_UP_DEPLOY_LAMBDA:-1}" != "0" ]; then
  if command -v aws >/dev/null 2>&1; then
    (cd "${ROOT}" && ./tools/scripts/deploy-read-model-updater-localstack.sh)
  else
    echo "Skipping Lambda deploy to LocalStack: aws CLI not found. Install it or set DOCKER_COMPOSE_UP_DEPLOY_LAMBDA=0." >&2
  fi
fi
