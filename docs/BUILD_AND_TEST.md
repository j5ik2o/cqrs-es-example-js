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

## Read Model Updater Lambda (LocalStack)

This mirrors the Rust example: run the Read Model Updater as an AWS Lambda on LocalStack (DynamoDB stream → Lambda → MySQL).

1. Copy `common.env.default` to `common.env` at the repo root, or let `docker-compose-up.sh` / `docker-compose-e2e-test.sh` create it. `common.env` is gitignored.
2. From the host, point the AWS CLI at **`http://localhost:34566`** (Compose maps container `4566` to host `34566`). Inside Compose, services use `http://localstack:4566`.
3. Build the deployment zip (Docker `linux/amd64`, Prisma engines for Lambda):

   ```shell
   $ pnpm build-read-model-updater-lambda
   ```

   Output: `dist/lambda/read-model-updater/function.zip`.

4. `pnpm docker-compose-up` and `pnpm docker-compose-e2e-test` can build the zip (unless `DOCKER_COMPOSE_UP_BUILD_LAMBDA=0`), wait for LocalStack, run `deploy-read-model-updater-localstack.sh`, and by default stop the `read-model-updater-1` container to avoid double-processing the stream. Set `DOCKER_COMPOSE_UP_DEPLOY_LAMBDA=0` to skip deploy. The e2e script brings stacks up, deploys Lambda, then runs the `e2e-test` container (`profile: e2e`) so GraphQL is ready before `verify-group-chat.sh` runs.
5. To deploy manually after Compose is up:

   ```shell
   $ pnpm deploy-read-model-updater-localstack
   ```
