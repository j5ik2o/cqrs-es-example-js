import { createStartupResynchronizer } from "./startup-resynchronizer";

describe("startup resynchronizer", () => {
  test("runs the cold-start scan once across concurrent and later callers", async () => {
    let calls = 0;
    const resynchronizer = createStartupResynchronizer(async () => {
      calls += 1;
      await Promise.resolve();
    });

    await Promise.all([resynchronizer.run(), resynchronizer.run()]);
    await resynchronizer.run();

    expect(calls).toEqual(1);
  });

  test("forgets a failed run so the next invocation retries it", async () => {
    let calls = 0;
    const resynchronizer = createStartupResynchronizer(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("scan failed");
      }
    });

    await expect(resynchronizer.run()).rejects.toThrow("scan failed");
    await expect(resynchronizer.run()).resolves.toBeUndefined();
    await expect(resynchronizer.run()).resolves.toBeUndefined();

    expect(calls).toEqual(2);
  });

  test("shares one in-flight failure between concurrent callers", async () => {
    let calls = 0;
    const resynchronizer = createStartupResynchronizer(async () => {
      calls += 1;
      await Promise.resolve();
      throw new Error("scan failed");
    });

    const results = await Promise.allSettled([
      resynchronizer.run(),
      resynchronizer.run(),
    ]);

    expect(calls).toEqual(1);
    expect(results.map((result) => result.status)).toEqual([
      "rejected",
      "rejected",
    ]);
  });
});
