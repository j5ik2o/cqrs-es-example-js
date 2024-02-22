import "reflect-metadata";
import * as yargs from "yargs";
import { writeApiMain } from "./write-api-main";
import { localRmuMain } from "./local-rmu-main";
import { ILogObj, Logger } from "tslog";
import { readApiMain } from "./read-api-main";
export const logger: Logger<ILogObj> = new Logger();
async function main() {
  const argv = yargs
    .command("writeApi", "write api server")
    .command("readApi", "read api server")
    .command("localRmu", "local read model updater")
    .demandCommand(1)
    .help()
    .parseSync();

  switch (argv._[0]) {
    case "writeApi":
      writeApiMain();
      break;
    case "readApi":
      await readApiMain();
      break;
    case "localRmu":
      await localRmuMain();
      break;
  }
}

main().catch(console.error);
