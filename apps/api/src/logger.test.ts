import { expect, test } from "bun:test";
import { createLogger, serializeError } from "./logger";

test("serializes exception type and stack frames without exception message", () => {
  const error = new Error("postgres://user:secret@private-host/db");
  const serialized = serializeError(error);
  expect(serialized.name).toBe("Error");
  expect(JSON.stringify(serialized)).not.toContain("secret");
});

test("emits structured JSON and redacts common credential fields", () => {
  const chunks: string[] = [];
  const logger = createLogger("info", {
    write(chunk) {
      chunks.push(chunk);
    },
  });

  logger.info({
    event: "redaction_test",
    password: "private-password",
    headers: { cookie: "session=private-cookie" },
    metadata: { token: "private-token" },
  });
  logger.error({
    event: "exception_test",
    err: new Error("database secret details"),
  });

  const output = chunks.join("");
  expect(output).not.toContain("private-password");
  expect(output).not.toContain("private-cookie");
  expect(output).not.toContain("private-token");
  expect(output).not.toContain("database secret details");
  const entries = chunks.map((chunk) => JSON.parse(chunk));
  expect(entries[0]).toMatchObject({
    level: "info",
    service: "api",
    event: "redaction_test",
    password: "[Redacted]",
  });
  expect(entries[1]).toMatchObject({
    level: "error",
    event: "exception_test",
    err: { name: "Error" },
  });
});
