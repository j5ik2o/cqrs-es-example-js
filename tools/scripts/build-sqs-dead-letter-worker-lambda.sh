#!/usr/bin/env bash
# Builds the SQS dead-letter recovery worker zip with the same isolated Docker
# build path as the RMU Lambda.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "${ROOT}"

IMAGE="${LAMBDA_BUILD_IMAGE:-node:22-bookworm}"

docker run --rm --platform linux/amd64 \
  -v "${ROOT}:/workspace" -w /workspace \
  -e LAMBDA_ENTRY=packages/bootstrap/src/sqs-dead-letter-handler.ts \
  -e LAMBDA_ARTIFACT=sqs-dead-letter-worker \
  "${IMAGE}" \
  bash /workspace/tools/scripts/build-dynamodb-read-model-updater-lambda.docker-inner.sh
