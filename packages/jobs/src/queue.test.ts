import { describe, expect, test } from "bun:test";
import { createJobQueue } from "./queue";

const apiOrigin = "https://api.example.test";
const payload = {
  projectId: "17dd315b-749a-48e8-956b-10a23b48b0e8",
  ownerId: "user_123",
};
const credentials = {
  QSTASH_TOKEN: "token",
  QSTASH_CURRENT_SIGNING_KEY: "current",
  QSTASH_NEXT_SIGNING_KEY: "next",
};

describe("optional QStash job queue", () => {
  test("missing credentials disable delivery without network calls", async () => {
    const queue = createJobQueue({ apiOrigin, env: {} });
    expect(queue.enabled).toBe(false);
    expect(await queue.publishProjectCreated(payload)).toEqual({
      status: "disabled",
    });
    expect(await queue.verify("project-created", "sig", "{}")).toBe(false);
  });

  test("partial credentials fail at startup", () => {
    expect(() =>
      createJobQueue({ apiOrigin, env: { QSTASH_TOKEN: "token" } }),
    ).toThrow("Set QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY");
  });

  test("publishes validated IDs to the job URL with a stable dedup key", async () => {
    const calls: unknown[] = [];
    const queue = createJobQueue({
      apiOrigin,
      env: credentials,
      publish: async (request) => {
        calls.push(request);
        return { messageId: "msg_123" };
      },
    });

    expect(queue.enabled).toBe(true);
    expect(await queue.publishProjectCreated(payload)).toEqual({
      status: "queued",
      messageId: "msg_123",
    });
    expect(calls).toEqual([
      {
        url: `${apiOrigin}/jobs/project-created`,
        body: payload,
        deduplicationId: `project-created:${payload.projectId}`,
        retries: 3,
      },
    ]);
    expect(
      queue.publishProjectCreated({ ...payload, projectId: "bad" }),
    ).rejects.toThrow();
  });

  test("verifies signatures against the public job URL", async () => {
    const seen: unknown[] = [];
    const queue = createJobQueue({
      apiOrigin,
      env: credentials,
      verifySignature: async (request) => {
        seen.push(request);
        return request.signature === "good";
      },
    });

    expect(await queue.verify("project-created", "good", "{}")).toBe(true);
    expect(await queue.verify("project-created", "bad", "{}")).toBe(false);
    expect(seen[0]).toEqual({
      signature: "good",
      body: "{}",
      url: `${apiOrigin}/jobs/project-created`,
    });
  });
});
