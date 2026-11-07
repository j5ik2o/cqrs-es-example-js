import type { DeadLetterRecord, DeadLetterStore } from "./dead-letter-store";
import type { JournalReader } from "./journal-reader";
import {
  type ReadModelUpdater,
  assertContiguous,
  journalEventToInput,
} from "./update-read-model";

/**
 * Recovery task for dead-lettered projections. A dead letter carries only the
 * event identity; this service re-reads the authoritative journal and replays
 * the range from the current position to the failed `seq_nr`, then verifies the
 * position reached the target before deleting the task. Re-running it is safe:
 * every applied event is idempotent and the position never moves backwards.
 */
export type DeadLetterRecoveryOptions = {
  batchSize?: number;
  /** Recover only this projection's tasks in a multi-projection deployment. */
  projectionName?: string;
};

export type RecoveryFailure = {
  record: DeadLetterRecord;
  error: unknown;
};

export type RecoveryOutcome = {
  recovered: number;
  failed: number;
  /** Tasks still unresolved in the store after this run, beyond the batch. */
  remaining: number;
  failures: RecoveryFailure[];
};

export type DeadLetterRecovery = {
  recover(record: DeadLetterRecord): Promise<boolean>;
  recoverAll(): Promise<RecoveryOutcome>;
};

const DEFAULT_BATCH_SIZE = 100;

export namespace DeadLetterRecovery {
  export function create(
    updater: ReadModelUpdater,
    journalReader: JournalReader,
    deadLetters: DeadLetterStore,
    options: DeadLetterRecoveryOptions = {},
  ): DeadLetterRecovery {
    async function recover(record: DeadLetterRecord): Promise<boolean> {
      const position = await updater.getPosition(record.aggregateId);
      if (position >= record.seqNr) {
        // Already applied by a normal delivery or an earlier recovery run.
        await deadLetters.delete(record);
        return true;
      }

      const events = await journalReader.readEvents(
        record.aggregateId,
        position + 1,
        record.seqNr,
      );
      assertContiguous(position + 1, record.seqNr, events);
      for (const event of events) {
        await updater.applyStrict(journalEventToInput(event));
      }

      const reached = await updater.getPosition(record.aggregateId);
      if (reached < record.seqNr) {
        throw new Error(
          `Recovery did not reach seq_nr ${record.seqNr} for ${record.aggregateId}: position is ${reached}`,
        );
      }
      await deadLetters.delete(record);
      return true;
    }

    async function recoverAll(): Promise<RecoveryOutcome> {
      const records = await deadLetters.list(
        options.batchSize ?? DEFAULT_BATCH_SIZE,
        options.projectionName,
      );
      let recovered = 0;
      const failures: RecoveryFailure[] = [];
      for (const record of records) {
        try {
          await recover(record);
          recovered += 1;
        } catch (error) {
          failures.push({ record, error });
        }
      }
      return {
        recovered,
        failed: failures.length,
        remaining: await deadLetters.count(options.projectionName),
        failures,
      };
    }

    return Object.freeze({ recover, recoverAll });
  }
}
