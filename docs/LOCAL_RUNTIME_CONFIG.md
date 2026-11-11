# Local DynamoDB runtime configuration

[日本語](LOCAL_RUNTIME_CONFIG.ja.md)

This reference covers the Write API, local Read Model Updater (RMU), and Read API in the DynamoDB Compose stack. Values below match main `951364a284205c856e4b886179234a25f31ed182`.

## Ports and endpoints

| Application | Compose service / command | Host endpoint | Container endpoint |
| --- | --- | --- | --- |
| Write API | `write-api-server-1` / `writeApi` | `http://localhost:38080/` | `http://write-api-server-1:3000/` |
| Local RMU | `dynamodb-read-model-updater-1` / `dynamodbLocalRmu` | Mapping `38081:8080` only | No HTTP listener or GraphQL endpoint |
| Read API | `read-api-server-1` / `readApi` | `http://localhost:38082/` | `http://read-api-server-1:3000/` |

Both APIs accept GraphQL at `/`. The [e2e HTTP helper](../tools/e2e-test/lib.sh) posts to the API root. Write handles mutations; Read handles queries. The RMU follows the `head` table's DynamoDB Streams, reads the journal to fill sequence gaps, and updates the MySQL read model. It also reconciles the head table at startup and after a stream stall. The RMU does not read `API_HOST` or `API_PORT`, despite the Compose mapping and environment entries.

[Application Compose](../tools/docker-compose/docker-compose-applications.yml) defines these mappings. [Database Compose](../tools/docker-compose/docker-compose-databases.yml) maps LocalStack host `34566` to container `4566`, and MySQL host `33306` to container `3306`. Host processes use `http://localhost:34566` and `mysql://ceer:ceer@localhost:33306/ceer`. Containers use `http://localstack:4566` and `mysql://ceer:ceer@mysql-local:3306/ceer`.

The [e2e override](../tools/docker-compose/docker-compose-e2e-test.yml) removes host port publication. Its tests use container endpoints, not host ports 38080 and 38082.

## API and persistence variables

“Default” means the application value when the variable is absent. Compose values are explicit overrides, not application defaults. Optional variables can be omitted only when their defaults or the SDK configuration are suitable.

| Variable | Consumer and meaning | Required / application default | Local Compose value |
| --- | --- | --- | --- |
| `API_HOST` | Write and Read bind address | Optional, `localhost` | `0.0.0.0` |
| `API_PORT` | Write and Read listening port | Optional, `3000` for both | `3000` for both |
| `API_ALLOW_ORIGINS` | Present in Compose for both APIs; these entry points do not read it | Unused by these entry points | `http://localhost:38080,http://localhost:38082,http://localhost:8888` |
| `PERSISTENCE_BACKEND` | Write event store selection | Optional, `dynamodb` | `dynamodb` |
| `PERSISTENCE_JOURNAL_TABLE_NAME` | Write event journal | Optional, `journal` | `journal` |
| `PERSISTENCE_SNAPSHOT_TABLE_NAME` | Write snapshot table | Optional, `snapshot` | `snapshot` |
| `PERSISTENCE_HEAD_TABLE_NAME` | Write aggregate head table | Optional, `head` | `head` |
| `PERSISTENCE_SNAPSHOT_HISTORY_INDEX_NAME` | Write snapshot history GSI | Optional, `snapshot-history-index` | `snapshot-history-index` |
| `DATABASE_URL` | Read and RMU Prisma MySQL connection | Required, no default; startup fails if absent or empty | `mysql://ceer:ceer@mysql-local:3306/ceer` |

Sources are [Write startup](../packages/bootstrap/src/write-api-main.ts), [Read startup](../packages/bootstrap/src/read-api-main.ts), [RMU startup](../packages/bootstrap/src/dynamodb-local-rmu-main.ts), and the [Prisma datasource](../packages/rmu/prisma/schema.prisma). Write treats empty API and table settings as absent. Read applies API defaults only when the variable is absent. Direct host execution needs distinct API ports, for example `API_PORT=38080` for Write and `API_PORT=38082` for Read, since both default to 3000.

The [table setup script](../tools/dynamodb-setup/create-tables.sh) creates the names supplied by Database Compose, including the snapshot GSI and the head stream with `NEW_IMAGE`. Write's `PERSISTENCE_HEAD_TABLE_NAME` and RMU's `STREAM_HEAD_TABLE_NAME` must identify the same table. Their journal names must also match. Read does not use `PERSISTENCE_*`, `AWS_DYNAMODB_*`, or `STREAM_*`; RMU does not use Write's `PERSISTENCE_*` settings. For `PERSISTENCE_SPANNER_*`, see the separate [Spanner pipeline reference](spanner-local-pipeline.md).

## AWS variables for Write and RMU

| Variable | Meaning | Required / application default | Local Compose value |
| --- | --- | --- | --- |
| `AWS_REGION` | DynamoDB and Streams region | No application default; region must resolve through configuration | Write uses `${AWS_REGION:-ap-northeast-1}`; RMU fixes `ap-northeast-1` |
| `AWS_DYNAMODB_ENDPOINT_URL` | DynamoDB endpoint; also Streams endpoint for RMU | No application default; set for LocalStack | `http://localstack:4566` |
| `AWS_DYNAMODB_ACCESS_KEY_ID` | Explicit local client access key | No application default; provide with secret | `x` |
| `AWS_DYNAMODB_SECRET_ACCESS_KEY` | Explicit local client secret | No application default; provide with access key | `x` |
| `AWS_REGION_NAME` | Legacy Compose entry | Not read by these startup paths | Same region as the service's `AWS_REGION` |

Write applies region and endpoint independently, and explicit credentials only when both key variables are set. RMU's [client factory](../packages/bootstrap/src/dynamodb-clients.ts) uses the custom configuration only when all four variables (`AWS_REGION` and the three `AWS_DYNAMODB_*` variables) are nonempty. Otherwise RMU creates default SDK clients, so even a supplied custom endpoint is ignored. For the local RMU, supply all four. Without explicit configuration, SDK region, endpoint, and credential resolution apply. `AWS_REGION_NAME` is not a substitute for `AWS_REGION`.

## Stream variables for the local RMU

All variables below are optional. Compose sets the first four to the application defaults and leaves the others unset. Write and Read do not consume them.

| Variable | Meaning | Application default |
| --- | --- | --- |
| `STREAM_HEAD_TABLE_NAME` | Head table whose Streams RMU follows | `head` |
| `STREAM_JOURNAL_TABLE_NAME` | Journal for strongly consistent gap recovery | `journal` |
| `STREAM_MAX_ITEM_COUNT` | Maximum records per page, clamped to 1–1000 | `32` |
| `STREAM_POLL_INTERVAL_MS` | Pause at the stream tail or after a failed batch | `200` |
| `STREAM_RETRY_INITIAL_DELAY_MS` | Initial outer stream failure backoff | `1000` |
| `STREAM_RETRY_MAX_DELAY_MS` | Maximum outer stream failure backoff | `60000` |
| `STREAM_RETRY_JITTER_RATIO` | Outer backoff jitter ratio | `0.2` |
| `STREAM_RETENTION_MS` | Stall duration before head resynchronization | `86400000` (24 hours) |

The [RMU config loader](../packages/bootstrap/src/rmu-config.ts) supplies these defaults. Empty numeric variables also use defaults; negative or nonfinite numbers fail configuration loading. Table names default only when absent. Recovery identity, event retries, and optional SQS notifications use `RMU_*` variables described in [dead-letter recovery](DEAD_LETTER_RECOVERY.md) and [common.env.default](../common.env.default). They are separate from stream polling.

## Configuration sources and existing procedures

[Application Compose](../tools/docker-compose/docker-compose-applications.yml) supplies each container's environment. [docker-compose-up.sh](../tools/scripts/docker-compose-up.sh) sources root `common.env`, creating it from [common.env.default](../common.env.default) when missing. This exports variables for shell scripts and Compose interpolation. It does not forward every variable into every container. Literal Compose entries remain fixed; only `${...}` entries use host values. Direct Node processes read their process environment and do not automatically load `common.env`.

The regular start script can build and deploy the Lambda RMU and stop the local RMU. For the three local applications, `DOCKER_COMPOSE_UP_BUILD_LAMBDA=0` and `DOCKER_COMPOSE_UP_DEPLOY_LAMBDA=0` in `common.env` disable that switch. See [the Lambda procedure](BUILD_AND_TEST.md#read-model-updater-lambda-localstack). E2e already uses the local RMU without Lambda. `LOCALSTACK_ENDPOINT_URL` in `common.env` is for host scripts, not the applications' `AWS_DYNAMODB_ENDPOINT_URL`.

- [Image build and Compose start](DEBUG_ON_DOCKER_COMPOSE.md#build-the-image).
- [Compose stop](DEBUG_ON_DOCKER_COMPOSE.md#stop-docker-compose).
- [Local machine debugging](DEBUG_ON_LOCAL_MACHINE.md).
> **E2e keeps local data.** The e2e script uses its own Compose project, `cqrs-es-example-js-e2e`, which `E2E_COMPOSE_PROJECT_NAME` can change. Its `down -v --remove-orphans` removes only that project's containers and volumes, not the regular stack `cqrs-es-example-js`. The e2e override also drops the fixed container names and the LocalStack bind mounts, so both stacks can run at the same time. The script refuses to run with the regular project name.

- [Build and e2e execution](BUILD_AND_TEST.md#e2e-tests).
- [Read-model database migrations](DATABASE_MIGRATIONS.md).

The start and stop scripts run `down -v`; starting the regular stack recreates containers and removes previous Compose data.
