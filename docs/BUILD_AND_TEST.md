## Build

Before building, make sure Docker is up and running.

```shell
$ pnpm install # first time only
$ pnpm prisma:generate # first time only
$ pnpm build
```

## Testing

## Unit Tests

Ensure Docker is running beforehand.

```shell
$ pnpm test
```

## E2E Tests

Executes E2E tests against the application started with docker compose.

```shell
$ pnpm docker-build
$ pnpm docker-compose-up
$ pnpm verify-group-chat # E2E
```
