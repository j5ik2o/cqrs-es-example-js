#!/usr/bin/env bash
# Run inside Docker (linux/amd64) — invoked by build-read-model-updater-lambda.sh
#
# /workspace is a bind-mount of the host repo. To avoid overwriting host
# node_modules with Linux-specific binaries, we copy the source tree to
# /build and perform all work there. Only the final zip is written back
# to /workspace/dist/.
set -euo pipefail

export CI=true

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq zip rsync

corepack enable && corepack prepare pnpm@9.15.9 --activate

# --- Copy source to isolated build directory ---
BUILD=/build
rm -rf "${BUILD}"
rsync -a --exclude node_modules --exclude .turbo --exclude dist /workspace/ "${BUILD}/"
cd "${BUILD}"

pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm exec turbo build --filter=cqrs-es-example-js-rmu --filter=cqrs-es-example-js-bootstrap

STAGE="${BUILD}/dist/lambda/read-model-updater/stage"
ZIP_TMP="${BUILD}/dist/lambda/read-model-updater/function.zip"
rm -rf "${STAGE}" "${ZIP_TMP}"
mkdir -p "${STAGE}/node_modules"

pnpm dlx esbuild@0.25.0 "${BUILD}/packages/bootstrap/src/lambda-rmu-handler.ts" \
  --bundle \
  --platform=node \
  --target=node18 \
  --outfile="${STAGE}/index.js" \
  --external:@prisma/client

NM="$(node -p "const p=require('path');const x=require.resolve('@prisma/client/package.json',{paths:['${BUILD}/packages/bootstrap']});p.join(p.dirname(x),'..','..')")"
cp -r "${NM}/@prisma" "${STAGE}/node_modules/"
cp -r "${NM}/.prisma" "${STAGE}/node_modules/"

# Lambda (Amazon Linux 2) に不要な Prisma ネイティブバイナリを除去してサイズ削減
find "${STAGE}/node_modules" -name "libquery_engine-*" -not -name "*rhel-openssl-1.0.x*" -delete
find "${STAGE}/node_modules" -name "schema-engine-*" -delete 2>/dev/null || true
find "${STAGE}/node_modules" -name "introspection-engine-*" -delete 2>/dev/null || true
find "${STAGE}/node_modules" -name "migration-engine-*" -delete 2>/dev/null || true

cd "${STAGE}"
zip -q -r "${ZIP_TMP}" .

# --- Write only the final artifact back to the host mount ---
OUT_DIR="/workspace/dist/lambda/read-model-updater"
mkdir -p "${OUT_DIR}"
cp "${ZIP_TMP}" "${OUT_DIR}/function.zip"

echo "Wrote ${OUT_DIR}/function.zip"
ls -la "${OUT_DIR}/function.zip"
