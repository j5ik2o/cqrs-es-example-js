import "reflect-metadata";
import { type ILogObj, Logger } from "tslog";
import * as yargs from "yargs";
import { dynamodbLocalRmuMain } from "./dynamodb-local-rmu-main";
import { readApiMain } from "./read-api-main";
import { spannerChangeStreamBridgeMain } from "./spanner-change-stream-bridge-main";
import { spannerSetupMain } from "./spanner-setup-main";
import { writeApiMain } from "./write-api-main";
export const logger: Logger<ILogObj> = new Logger();
async function main() {
  const argv = yargs
    .command("writeApi", "write api server")
    .command("readApi", "read api server")
    .command("dynamodbLocalRmu", "local read model updater (DynamoDB streams)")
    .command("spannerSetup", "create Spanner schema/change-stream + Pub/Sub")
    .command("spannerBridge", "local Spanner change-stream -> Pub/Sub bridge")
    .demandCommand(1)
    .help()
    .parseSync();

  switch (argv._[0]) {
    case "writeApi":
      await writeApiMain();
      break;
    case "readApi":
      await readApiMain();
      break;
    case "dynamodbLocalRmu":
      await dynamodbLocalRmuMain();
      break;
    case "spannerSetup":
      await spannerSetupMain();
      break;
    case "spannerBridge":
      await spannerChangeStreamBridgeMain();
      break;
  }
}

main().catch(logger.error);
