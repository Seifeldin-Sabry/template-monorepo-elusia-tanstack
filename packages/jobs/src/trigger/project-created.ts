import { createDatabase } from "@starter/db";
import { logger, schemaTask } from "@trigger.dev/sdk";
import { projectCreatedPayloadSchema } from "../project-event";
import { loadProjectSnapshot } from "../project-snapshot";

export const projectCreatedTask = schemaTask({
  id: "project-created",
  description: "Record a committed project creation in the jobs dashboard",
  schema: projectCreatedPayloadSchema,
  retry: { maxAttempts: 3 },
  run: async ({ projectId, ownerId }) => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL is required in the Trigger.dev environment",
      );
    }

    const { db, close } = createDatabase(databaseUrl);
    try {
      const snapshot = await loadProjectSnapshot(db, { projectId, ownerId });
      if (!snapshot) {
        // Project may have been deleted before the worker ran. No retry can
        // recover it; report that outcome instead of failing the task.
        logger.info("Project no longer exists", { projectId, ownerId });
        return { status: "missing" as const, projectId };
      }

      logger.info("Project creation recorded", snapshot);
      return { status: "recorded" as const, snapshot };
    } finally {
      await close();
    }
  },
});
