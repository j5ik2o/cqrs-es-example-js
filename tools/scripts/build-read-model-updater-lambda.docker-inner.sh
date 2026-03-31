#!/usr/bin/env bash
# Run inside Docker (linux/amd64) — invoked by build-read-model-updater-lambda.sh
set -euo pipefail

cd /workspace

export CI=true

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq zip

corepack enable && corepack prepare pnpm@9.15.9 --activate

pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm exec turbo build --filter=cqrs-es-example-js-rmu --filter=cqrs-es-example-js-bootstrap

STAGE="/workspace/dist/lambda/read-model-updater/stage"
ZIP="/workspace/dist/lambda/read-model-updater/function.zip"
rm -rf "${STAGE}" "${ZIP}"
mkdir -p "${STAGE}/node_modules"

pnpm dlx esbuild@0.25.0 /workspace/packages/bootstrap/src/lambda-rmu-handler.ts \
  --bundle \
  --platform=node \
  --target=node18 \
  --outfile="${STAGE}/index.js" \
  --external:@prisma/client

NM="$(node -p "const p=require('path');const x=require.resolve('@prisma/client/package.json',{paths:['/workspace/packages/bootstrap']});p.join(p.dirname(x),'..','..')")"
cp -r "${NM}/@prisma" "${STAGE}/node_modules/"
cp -r "${NM}/.prisma" "${STAGE}/node_modules/"

# Lambda (Amazon Linux 2) に不要な Prisma ネイティブバイナリを除去してサイズ削減
find "${STAGE}/node_modules" -name "libquery_engine-*" -not -name "*rhel-openssl-1.0.x*" -delete
find "${STAGE}/node_modules" -name "schema-engine-*" -delete 2>/dev/null || true
find "${STAGE}/node_modules" -name "introspection-engine-*" -delete 2>/dev/null || true
find "${STAGE}/node_modules" -name "migration-engine-*" -delete 2>/dev/null || true

cd "${STAGE}"
zip -q -r "${ZIP}" .

echo "Wrote ${ZIP}"
ls -la "${ZIP}"
