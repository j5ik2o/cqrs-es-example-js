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

The e2e starts Docker Compose and LocalStack, then verifies Write API, the local RMU and Read API in that order. The RMU runs in the `dynamodb-read-model-updater-1` container; the Lambda variant is not used.

Build the images first, then run the suite.

```shell
$ pnpm docker-build
$ pnpm docker-build-e2e-test
$ pnpm docker-compose-e2e-test
```

`pnpm docker-compose-e2e-test` runs two scenarios in order.

1. Main scenario: run all eight mutations and check the Read API results. The mutations are `createGroupChat`, `addMember`, `postMessage`, `editMessage`, `renameGroupChat`, `deleteMessage`, `removeMember` and `deleteGroupChat`. After each delete mutation, the script waits until the Read API stops returning the target.
2. Restart scenario: write events while the RMU is stopped, then check that it catches up after start. Restart the RMU and check that replaying the head Streams does not duplicate rows.

Every read-model check polls. Set `WAIT_READ_MODEL_ATTEMPTS` and `WAIT_READ_MODEL_SLEEP_SEC` to change the attempts and interval.

After the restart scenario, the script reads MySQL directly and checks the following state.

- `read_model_positions.last_processed_sequence_number` is 5.
- `members` has two rows and `messages` has two rows.

On failure, `tools/scripts/docker-compose-e2e-test.sh` prints the Compose state and logs.

Unit tests cover duplicate, out-of-order, gap, mid-batch failure and restart cases in `packages/rmu/src/read-model-updater.integration.test.ts`. The Compose e2e does not cover out-of-order and gap cases because they need fault injection.

## Read Model Updater Lambda (LocalStack)

This mirrors the Rust example: run the Read Model Updater as an AWS Lambda on LocalStack (DynamoDB stream → Lambda → MySQL).

1. Copy `common.env.default` to `common.env` at the repo root, or let `docker-compose-up.sh` create it. `common.env` is gitignored.
2. From the host, point the AWS CLI at **`http://localhost:34566`** (Compose maps container `4566` to host `34566`). Inside Compose, services use `http://localstack:4566`.
3. Build the deployment zip (Docker `linux/amd64`, Prisma engines for Lambda):

   ```shell
   $ pnpm build-dynamodb-read-model-updater-lambda
   ```

   Output: `dist/lambda/dynamodb-read-model-updater/function.zip`.

4. `pnpm docker-compose-up` can build the zip (unless `DOCKER_COMPOSE_UP_BUILD_LAMBDA=0`), wait for LocalStack, run `deploy-dynamodb-read-model-updater-localstack.sh`, and by default stop the `dynamodb-read-model-updater-1` container to avoid double-processing the stream. Set `DOCKER_COMPOSE_UP_DEPLOY_LAMBDA=0` to skip deploy. `pnpm docker-compose-e2e-test` does not use Lambda; it verifies the containerized RMU.
5. To deploy manually after Compose is up:

   ```shell
   $ pnpm deploy-dynamodb-read-model-updater-localstack
   ```
