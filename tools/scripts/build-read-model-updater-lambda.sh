#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "${ROOT}"

IMAGE="${LAMBDA_BUILD_IMAGE:-node:22-bookworm}"

docker run --rm --platform linux/amd64 \
  -v "${ROOT}:/workspace" -w /workspace \
  "${IMAGE}" \
  bash /workspace/tools/scripts/build-read-model-updater-lambda.docker-inner.sh
