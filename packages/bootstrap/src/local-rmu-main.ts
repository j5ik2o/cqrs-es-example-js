import { ILogObj, Logger } from "tslog";

function localRmuMain() {
  const logger: Logger<ILogObj> = new Logger();
  logger.info("Starting local read model updater");
}

export { localRmuMain };
