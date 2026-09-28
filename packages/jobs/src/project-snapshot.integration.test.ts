import { expect, test } from "bun:test";
import { createDatabase, projects, user } from "@starter/db";
import { eq } from "drizzle-orm";
import { loadProjectSnapshot } from "./project-snapshot";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = databaseUrl ? test : test.skip;

integrationTest("task reads committed project and verifies owner", async () => {
  if (!databaseUrl) return;
  const { db, close } = createDatabase(databaseUrl);
  const ownerId = `jobs-${crypto.randomUUID()}`;

  try {
    await db.insert(user).values({
      id: ownerId,
      name: "Jobs test",
      email: `${crypto.randomUUID()}@example.test`,
    });
    const [project] = await db
      .insert(projects)
      .values({ ownerId, name: "Committed project" })
      .returning({ id: projects.id });
    if (!project) throw new Error("Test project was not inserted");

    const snapshot = await loadProjectSnapshot(db, {
      ownerId,
      projectId: project.id,
    });
    expect(snapshot).toMatchObject({
      projectId: project.id,
      ownerId,
      name: "Committed project",
    });
    expect(snapshot?.createdAt).toBeString();

    expect(
      await loadProjectSnapshot(db, {
        ownerId: "another-owner",
        projectId: project.id,
      }),
    ).toBeNull();

    await db.delete(projects).where(eq(projects.id, project.id));
    expect(
      await loadProjectSnapshot(db, { ownerId, projectId: project.id }),
    ).toBeNull();
  } finally {
    await db.delete(user).where(eq(user.id, ownerId));
    await close();
  }
});
