FROM node:20-alpine AS base

FROM base AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY . /app

RUN pnpm install -g turbo && pnpm install && pnpm build

FROM base AS runner
WORKDIR /app/packages/bootstrap

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 hono

COPY --from=builder --chown=hono:nodejs /app/node_modules /app/node_modules
COPY --from=builder --chown=hono:nodejs /app/package.json /app/package.json

COPY --from=builder --chown=hono:nodejs /app/packages/bootstrap/node_modules /app/packages/bootstrap/node_modules
COPY --from=builder --chown=hono:nodejs /app/packages/bootstrap/dist /app/packages/bootstrap/dist
COPY --from=builder --chown=hono:nodejs /app/packages/bootstrap/package.json /app/packages/bootstrap/package.json

COPY --from=builder --chown=hono:nodejs /app/packages/command/domain/node_modules /app/packages/command/domain/node_modules
COPY --from=builder --chown=hono:nodejs /app/packages/command/domain/dist /app/packages/command/domain/dist
COPY --from=builder --chown=hono:nodejs /app/packages/command/domain/package.json /app/packages/command/domain/package.json

COPY --from=builder --chown=hono:nodejs /app/packages/command/interface-adaptor-if/node_modules /app/packages/command/interface-adaptor-if/node_modules
COPY --from=builder --chown=hono:nodejs /app/packages/command/interface-adaptor-if/dist /app/packages/command/interface-adaptor-if/dist
COPY --from=builder --chown=hono:nodejs /app/packages/command/interface-adaptor-if/package.json /app/packages/command/interface-adaptor-if/package.json

COPY --from=builder --chown=hono:nodejs /app/packages/command/interface-adaptor-impl/node_modules /app/packages/command/interface-adaptor-impl/node_modules
COPY --from=builder --chown=hono:nodejs /app/packages/command/interface-adaptor-impl/dist /app/packages/command/interface-adaptor-impl/dist
COPY --from=builder --chown=hono:nodejs /app/packages/command/interface-adaptor-impl/package.json /app/packages/command/interface-adaptor-impl/package.json

COPY --from=builder --chown=hono:nodejs /app/packages/command/use-case/node_modules /app/packages/command/use-case/node_modules
COPY --from=builder --chown=hono:nodejs /app/packages/command/use-case/dist /app/packages/command/use-case/dist
COPY --from=builder --chown=hono:nodejs /app/packages/command/use-case/package.json /app/packages/command/use-case/package.json

USER hono
EXPOSE 3000

ENTRYPOINT ["node", "./dist/index.js"]
