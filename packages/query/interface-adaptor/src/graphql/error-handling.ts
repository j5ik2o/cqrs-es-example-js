import { GraphQLError } from "graphql";
import { type ILogObj, Logger } from "tslog";

const logger: Logger<ILogObj> = new Logger();

// The read model is the only data source of the Read API. A query that returns
// no row is a client-visible 404; any other failure is a server-side 500 and
// must not leak database details to the caller.
function notFoundError(resource: string): GraphQLError {
  return new GraphQLError(`${resource} not found.`, {
    extensions: { code: "404" },
  });
}

function readModelError(resource: string, error: unknown): GraphQLError {
  logger.error(`Failed to read ${resource} from the read model`, error);
  return new GraphQLError("Internal server error", {
    extensions: { code: "500" },
  });
}

async function queryReadModel<T>(
  resource: string,
  query: Promise<T>,
): Promise<T> {
  try {
    return await query;
  } catch (error) {
    throw readModelError(resource, error);
  }
}

export { notFoundError, queryReadModel, readModelError };
