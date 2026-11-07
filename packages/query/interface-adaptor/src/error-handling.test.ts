import {
  notFoundError,
  queryReadModel,
  readModelError,
} from "./graphql/error-handling";

describe("read model errors", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test("maps a missing row to a 404", () => {
    const error = notFoundError("GroupChat");
    expect(error.message).toEqual("GroupChat not found.");
    expect(error.extensions.code).toEqual("404");
  });

  test("maps a database failure to a 500 without leaking its message", () => {
    const error = readModelError(
      "GroupChat",
      new Error("dial tcp 10.0.0.1:3306: connect: connection refused"),
    );
    expect(error.message).toEqual("Internal server error");
    expect(error.extensions.code).toEqual("500");
    expect(error.message).not.toContain("10.0.0.1");
  });

  test("wraps a rejected query as a 500", async () => {
    await expect(
      queryReadModel("Message", Promise.reject(new Error("boom"))),
    ).rejects.toMatchObject({
      message: "Internal server error",
      extensions: { code: "500" },
    });
  });

  test("passes through a resolved query", async () => {
    await expect(
      queryReadModel("Message", Promise.resolve([1])),
    ).resolves.toEqual([1]);
  });
});
