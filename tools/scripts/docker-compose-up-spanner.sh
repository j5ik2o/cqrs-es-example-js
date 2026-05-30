#!/usr/bin/env bash
#
# Bring up the Spanner backend local pipeline:
#   MySQL + migration (databases compose) and the Spanner emulator, Pub/Sub
#   emulator, schema/change-stream/topic setup, write API (PERSISTENCE_BACKEND
#   =spanner), change-stream bridge, Functions Framework RMU, and read API
#   (spanner compose).
#
# See docs/spanner-local-pipeline.md for the architecture and the documented
# Spanner-emulator change-stream read limitation.

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${SCRIPT_DIR}" || exit

if [ -f "${ROOT}/common.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/common.env"
  set +a
fi

PROJECT="${COMPOSE_PROJECT:-cqrs-es-example-js}"
DATABASES="-f ../docker-compose/docker-compose-databases.yml"
SPANNER="-f ../docker-compose/docker-compose-spanner.yml"

# Only the database services (MySQL + migration) are needed from the databases
# compose for the Spanner path; the read model lives in the same MySQL.
docker compose -p "${PROJECT}" ${DATABASES} ${SPANNER} down -v --remove-orphans

docker compose -p "${PROJECT}" ${DATABASES} up --remove-orphans -d mysql migration

docker compose -p "${PROJECT}" ${SPANNER} up --remove-orphans --force-recreate -d "$@"

echo ""
echo "Spanner pipeline is starting."
echo "  write API: http://localhost:48080"
echo "  read  API: http://localhost:48082"
echo "Run with PERSISTENCE_BACKEND=spanner. See docs/spanner-local-pipeline.md."
