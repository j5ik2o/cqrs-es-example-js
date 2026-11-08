import { loadRmuRuntimeConfig } from "./rmu-config";

describe("RMU runtime config", () => {
  test("uses the recovery and dead-letter defaults", () => {
    const config = loadRmuRuntimeConfig({});

    expect(config.recoveryBatchSize).toEqual(100);
    expect(config.deadLetterBatchLimit).toEqual(100);
    expect(config.deadLetterConsume).toEqual({
      maxMessages: 10,
      waitTimeSeconds: 20,
      visibilityTimeoutSeconds: 60,
    });
    expect(config.deadLetterQueueUrl).toBeUndefined();
  });

  test("clamps SQS receive tuning to the provider limits", () => {
    const config = loadRmuRuntimeConfig({
      RMU_DEAD_LETTER_CONSUME_MAX_MESSAGES: "50",
      RMU_DEAD_LETTER_CONSUME_WAIT_TIME_SECONDS: "99",
      RMU_DEAD_LETTER_CONSUME_VISIBILITY_TIMEOUT_SECONDS: "0",
      RMU_DEAD_LETTER_BATCH_LIMIT: "0",
    });

    expect(config.deadLetterConsume.maxMessages).toEqual(10);
    expect(config.deadLetterConsume.waitTimeSeconds).toEqual(20);
    expect(config.deadLetterConsume.visibilityTimeoutSeconds).toEqual(1);
    expect(config.deadLetterBatchLimit).toEqual(1);
  });

  test("reads the queue URL, group id and region", () => {
    const config = loadRmuRuntimeConfig({
      RMU_DEAD_LETTER_QUEUE_URL:
        "http://localhost:34566/000000000000/read-model-dead-letters",
      RMU_DEAD_LETTER_MESSAGE_GROUP_ID: "dead-letters",
      AWS_REGION: "ap-northeast-1",
    });

    expect(config.deadLetterQueueUrl).toEqual(
      "http://localhost:34566/000000000000/read-model-dead-letters",
    );
    expect(config.deadLetterMessageGroupId).toEqual("dead-letters");
    expect(config.sqsRegion).toEqual("ap-northeast-1");
  });
});
