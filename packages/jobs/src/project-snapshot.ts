import { type Database, projects } from "@starter/db";
import { and, eq } from "drizzle-orm";
import type { ProjectCreatedPayload } from "./project-event";

/** Project state may have changed or disappeared while a run waited in queue. */
export async function loadProjectSnapshot(
  db: Database,
  { projectId, ownerId }: ProjectCreatedPayload,
) {
  const [project] = await db
    .select({
      id: projects.id,
      ownerId: projects.ownerId,
      name: projects.name,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, ownerId)))
    .limit(1);

  return project
    ? {
        projectId: project.id,
        ownerId: project.ownerId,
        name: project.name,
        createdAt: project.createdAt.toISOString(),
      }
    : null;
}
