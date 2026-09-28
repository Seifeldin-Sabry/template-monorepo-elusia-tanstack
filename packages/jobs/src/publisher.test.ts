import { describe, expect, test } from "bun:test";
import { createProjectEventPublisher } from "./publisher";

const payload = {
  projectId: "17dd315b-749a-48e8-956b-10a23b48b0e8",
  ownerId: "user_123",
};

describe("optional Trigger.dev publisher", () => {
  test("missing credentials disable delivery without network calls", async () => {
    const publisher = createProjectEventPublisher({ env: {} });
    expect(publisher.enabled).toBe(false);
    expect(await publisher.publishProjectCreated(payload)).toEqual({
      status: "disabled",
    });
  });

  test("partial credentials fail at startup", () => {
    expect(() =>
      createProjectEventPublisher({
        env: { TRIGGER_PROJECT_REF: "proj_example" },
      }),
    ).toThrow("Set both TRIGGER_PROJECT_REF and TRIGGER_SECRET_KEY");
    expect(() =>
      createProjectEventPublisher({
        env: { TRIGGER_SECRET_KEY: "test_secret" },
      }),
    ).toThrow("Set both TRIGGER_PROJECT_REF and TRIGGER_SECRET_KEY");
  });

  test("configured publisher sends validated IDs with stable idempotency key", async () => {
    const calls: unknown[] = [];
    const publisher = createProjectEventPublisher({
      env: {
        TRIGGER_PROJECT_REF: "proj_example",
        TRIGGER_SECRET_KEY: "test_secret",
      },
      trigger: async (event, options) => {
        calls.push([event, options]);
        return { id: "run_123" };
      },
    });

    expect(publisher.enabled).toBe(true);
    expect(await publisher.publishProjectCreated(payload)).toEqual({
      status: "queued",
      runId: "run_123",
    });
    expect(calls).toEqual([
      [payload, { idempotencyKey: `project-created:${payload.projectId}` }],
    ]);
    expect(
      publisher.publishProjectCreated({ ...payload, projectId: "bad" }),
    ).rejects.toThrow();
  });
});
