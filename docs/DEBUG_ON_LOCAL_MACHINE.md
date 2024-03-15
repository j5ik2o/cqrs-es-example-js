# Debug on local machine.

## Run only database in docker-compose.

```shell
$ pnpm docker-compose-up-db
```

## Debug using IntelliJ IDEA.

The application is not running, so start it and debug it if necessary.

- write-api-server
  - `packages/bootstrap/src/write-api-main.ts`
- read-model-updater `(local-rmu)
  - `packages/bootstrap/src/local-rmu-main.ts`
- read-api-server
  - `packages/bootstrap/src/read-api-main.ts`

## check

```shell
$ pnpm verify-group-chat
```