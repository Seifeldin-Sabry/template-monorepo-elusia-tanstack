import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { createDatabase, projects, user } from "./index";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const { db, close } = createDatabase(databaseUrl);

try {
  const seedUserEmail = process.env.SEED_USER_EMAIL?.trim().toLowerCase();

  if (!seedUserEmail) {
    console.info(
      JSON.stringify({
        event: "database.seed.skipped",
        reason: "Set SEED_USER_EMAIL to an existing registered user's email.",
      }),
    );
  } else {
    const [owner] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, seedUserEmail))
      .limit(1);

    if (!owner) {
      throw new Error(`No registered user found for SEED_USER_EMAIL.`);
    }

    // Stable ID makes rerunning the seed safe without restricting project names.
    const hash = createHash("sha256")
      .update(`sample:${owner.id}`)
      .digest("hex");
    const sampleId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;

    await db
      .insert(projects)
      .values({
        id: sampleId,
        ownerId: owner.id,
        name: "First project",
        description:
          "A small example you can edit or remove as your product grows.",
      })
      .onConflictDoNothing();

    console.info(JSON.stringify({ event: "database.seed.complete" }));
  }
} finally {
  await close();
}
