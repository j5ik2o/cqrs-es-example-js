# Debugging on Docker Compose

## Build the image

```shell
$ pnpm docker-build
```

## Start docker-compose

```shell
$ pnpm docker-compose-up
```

The required database and tables will be created and the application will be started.
If you want to start only the database for development purposes, run `docker-compose-up-db` instead
of `docker-compose-up`.

### Stop docker-compose

```shell
$ pnpm docker-compose-down
```

## Verification

```shell
$ pnpm verify-group-chat
```



