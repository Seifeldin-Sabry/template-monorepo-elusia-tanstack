import { type Database, type Project, projects } from "@starter/db";
import { and, desc, eq } from "drizzle-orm";

export type ProjectDto = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateProjectInput = {
  name: string;
  description?: string | null;
};

export type UpdateProjectInput = {
  name?: string;
  description?: string | null;
};

export type ProjectRepository = {
  list(ownerId: string): Promise<ProjectDto[]>;
  find(ownerId: string, id: string): Promise<ProjectDto | null>;
  create(ownerId: string, input: CreateProjectInput): Promise<ProjectDto>;
  update(
    ownerId: string,
    id: string,
    input: UpdateProjectInput,
  ): Promise<ProjectDto | null>;
  remove(ownerId: string, id: string): Promise<boolean>;
};

function toDto(project: Project): ProjectDto {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function normalizeDescription(
  description: string | null | undefined,
): string | null {
  return description?.trim() || null;
}

export function createProjectRepository(db: Database): ProjectRepository {
  return {
    async list(ownerId) {
      const rows = await db
        .select()
        .from(projects)
        .where(eq(projects.ownerId, ownerId))
        .orderBy(desc(projects.createdAt), desc(projects.id));
      return rows.map(toDto);
    },

    async find(ownerId, id) {
      const [row] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.ownerId, ownerId), eq(projects.id, id)))
        .limit(1);
      return row ? toDto(row) : null;
    },

    async create(ownerId, input) {
      const [row] = await db
        .insert(projects)
        .values({
          ownerId,
          name: input.name.trim(),
          description: normalizeDescription(input.description),
        })
        .returning();

      if (!row) throw new Error("Project insert returned no row");
      return toDto(row);
    },

    async update(ownerId, id, input) {
      const changes: {
        name?: string;
        description?: string | null;
        updatedAt: Date;
      } = {
        updatedAt: new Date(),
      };

      if (input.name !== undefined) changes.name = input.name.trim();
      if (input.description !== undefined) {
        changes.description = normalizeDescription(input.description);
      }

      const [row] = await db
        .update(projects)
        .set(changes)
        .where(and(eq(projects.ownerId, ownerId), eq(projects.id, id)))
        .returning();
      return row ? toDto(row) : null;
    },

    async remove(ownerId, id) {
      const deleted = await db
        .delete(projects)
        .where(and(eq(projects.ownerId, ownerId), eq(projects.id, id)))
        .returning({ id: projects.id });
      return deleted.length > 0;
    },
  };
}
