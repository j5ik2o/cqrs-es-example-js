import * as yargs from "yargs";
import { writeApiMain } from "./write-api-main";
import {localRmuMain} from "./local-rmu-main";

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
    console.log("readApi");
    break;
  case "localRmu":
    localRmuMain();
    break;
}
