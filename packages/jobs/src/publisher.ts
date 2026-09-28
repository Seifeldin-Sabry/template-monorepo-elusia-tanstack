import {
  type ProjectCreatedPayload,
  projectCreatedPayloadSchema,
} from "./project-event";
import type { projectCreatedTask } from "./trigger/project-created";

export type ProjectPublishResult =
  | { status: "disabled" }
  | { status: "queued"; runId: string };

export type ProjectEventPublisher = {
  enabled: boolean;
  publishProjectCreated(
    payload: ProjectCreatedPayload,
  ): Promise<ProjectPublishResult>;
};

type TriggerProjectCreated = (
  payload: ProjectCreatedPayload,
  options: { idempotencyKey: string },
) => Promise<{ id: string }>;

type CreateProjectEventPublisherOptions = {
  env?: Record<string, string | undefined>;
  /** Injectable Trigger client for focused tests. */
  trigger?: TriggerProjectCreated;
};

/**
 * Server-only publisher. No Trigger credentials means a no-op; half-configured
 * credentials fail during application startup instead of silently dropping work.
 */
export function createProjectEventPublisher(
  options: CreateProjectEventPublisherOptions = {},
): ProjectEventPublisher {
  const env = options.env ?? process.env;
  const projectRef = env.TRIGGER_PROJECT_REF?.trim();
  const secretKey = env.TRIGGER_SECRET_KEY?.trim();

  if (Boolean(projectRef) !== Boolean(secretKey)) {
    throw new Error(
      "Set both TRIGGER_PROJECT_REF and TRIGGER_SECRET_KEY, or neither",
    );
  }

  if (!projectRef || !secretKey) {
    return {
      enabled: false,
      async publishProjectCreated(payload) {
        projectCreatedPayloadSchema.parse(payload);
        return { status: "disabled" };
      },
    };
  }

  const trigger: TriggerProjectCreated =
    options.trigger ??
    (async (payload, triggerOptions) => {
      // Type-only task import above keeps the worker and its DB connection out
      // of the API bundle. Trigger.dev resolves this ID in the deployed worker.
      const { tasks } = await import("@trigger.dev/sdk");
      return tasks.trigger<typeof projectCreatedTask>(
        "project-created",
        payload,
        triggerOptions,
      );
    });

  return {
    enabled: true,
    async publishProjectCreated(payload) {
      const parsed = projectCreatedPayloadSchema.parse(payload);
      const run = await trigger(parsed, {
        idempotencyKey: `project-created:${parsed.projectId}`,
      });
      return { status: "queued", runId: run.id };
    },
  };
}
