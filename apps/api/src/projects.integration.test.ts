import { expect, test } from "bun:test";
import { createDatabase, user } from "@starter/db";
import { eq } from "drizzle-orm";
import { createApp } from "./app";
import { createAuthService } from "./auth";
import { createProjectRepository } from "./projects";

const databaseUrl = process.env.TEST_DATABASE_URL;
const authSecret = process.env.BETTER_AUTH_SECRET;
const integrationTest = databaseUrl && authSecret ? test : test.skip;
const apiOrigin = "http://localhost:3001";
const appOrigin = "http://localhost:3000";

function sessionCookie(response: Response): string {
  const cookies = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0]);
  if (cookies.length === 0)
    throw new Error("Auth response did not set a session cookie");
  return cookies.join("; ");
}

function request(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  cookie?: string,
  body?: Record<string, string>,
) {
  return app.handle(
    new Request(`${apiOrigin}${path}`, {
      method,
      headers: {
        Origin: appOrigin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
}

integrationTest(
  "authenticates and isolates PostgreSQL project CRUD by user",
  async () => {
    if (!databaseUrl || !authSecret) return;

    const connection = createDatabase(databaseUrl);
    const auth = createAuthService(connection.db, {
      apiOrigin,
      secret: authSecret,
      trustedOrigins: [appOrigin],
    });
    const app = createApp({
      projects: createProjectRepository(connection.db),
      auth,
      allowedOrigins: [appOrigin],
      logger: { info() {}, error() {} },
    });
    const userIds: string[] = [];

    async function signUp(label: string) {
      const response = await request(
        app,
        "POST",
        "/api/auth/sign-up/email",
        undefined,
        {
          name: label,
          email: `${crypto.randomUUID()}@example.test`,
          password: `Password-${crypto.randomUUID()}`,
        },
      );
      expect(response.status).toBe(200);
      const cookie = sessionCookie(response);
      const current = await auth.getSession(new Headers({ Cookie: cookie }));
      if (!current) throw new Error("Signup did not create a session");
      userIds.push(current.user.id);
      return cookie;
    }

    try {
      const unauthenticated = await request(app, "GET", "/projects");
      expect(unauthenticated.status).toBe(401);

      const firstCookie = await signUp("First user");
      const secondCookie = await signUp("Second user");

      const created = await request(app, "POST", "/projects", firstCookie, {
        name: "Integration project",
        description: "Stored in Postgres",
      });
      expect(created.status).toBe(201);
      const project = (await created.json()) as { id: string };

      const firstList = await request(app, "GET", "/projects", firstCookie);
      expect(
        (
          (await firstList.json()) as { projects: { id: string }[] }
        ).projects.some((item) => item.id === project.id),
      ).toBe(true);

      const secondList = await request(app, "GET", "/projects", secondCookie);
      expect(await secondList.json()).toEqual({ projects: [] });
      expect(
        (await request(app, "GET", `/projects/${project.id}`, secondCookie))
          .status,
      ).toBe(404);
      expect(
        (
          await request(app, "PATCH", `/projects/${project.id}`, secondCookie, {
            name: "Stolen",
          })
        ).status,
      ).toBe(404);
      expect(
        (await request(app, "DELETE", `/projects/${project.id}`, secondCookie))
          .status,
      ).toBe(404);

      const updated = await request(
        app,
        "PATCH",
        `/projects/${project.id}`,
        firstCookie,
        {
          name: "Updated project",
          description: "",
        },
      );
      expect(updated.status).toBe(200);
      expect(await updated.json()).toMatchObject({
        name: "Updated project",
        description: null,
      });

      const deleted = await request(
        app,
        "DELETE",
        `/projects/${project.id}`,
        firstCookie,
      );
      expect(deleted.status).toBe(200);

      const signedOut = await request(
        app,
        "POST",
        "/api/auth/sign-out",
        firstCookie,
        {},
      );
      expect(signedOut.status).toBe(200);
      expect((await request(app, "GET", "/projects", firstCookie)).status).toBe(
        401,
      );
    } finally {
      for (const id of userIds)
        await connection.db.delete(user).where(eq(user.id, id));
      await connection.close();
    }
  },
);
