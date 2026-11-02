import { describe, expect, test } from "bun:test";
import { treaty } from "@elysia/eden";
import { createApp, type Logger } from "./app";
import type { AuthService } from "./auth";
import type {
  CreateProjectInput,
  ProjectDto,
  ProjectRepository,
  UpdateProjectInput,
} from "./projects";

const silentLogger: Logger = { info() {}, warn() {}, error() {} };
const testUserId = "test-user-1";
const allowedOrigin = "http://localhost:3000";

function testAuth(userId: string | null = testUserId): AuthService {
  return {
    emailEnabled: false,
    handler: async () => new Response("Not found", { status: 404 }),
    getSession: async () =>
      userId
        ? {
            user: { id: userId, email: `${userId}@example.test`, name: userId },
            session: { id: "test-session", userId },
          }
        : null,
  };
}

function memoryRepository(): ProjectRepository {
  const records = new Map<string, { ownerId: string; project: ProjectDto }>();

  return {
    async list(ownerId) {
      return [...records.values()]
        .filter((record) => record.ownerId === ownerId)
        .map((record) => record.project);
    },
    async find(ownerId, id) {
      const record = records.get(id);
      return record?.ownerId === ownerId ? record.project : null;
    },
    async create(ownerId: string, input: CreateProjectInput) {
      const now = new Date().toISOString();
      const project: ProjectDto = {
        id: crypto.randomUUID(),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        createdAt: now,
        updatedAt: now,
      };
      records.set(project.id, { ownerId, project });
      return project;
    },
    async update(ownerId: string, id: string, input: UpdateProjectInput) {
      const record = records.get(id);
      if (!record || record.ownerId !== ownerId) return null;
      const existing = record.project;
      const updated: ProjectDto = {
        ...existing,
        name: input.name?.trim() ?? existing.name,
        description:
          input.description === undefined
            ? existing.description
            : input.description?.trim() || null,
        updatedAt: new Date().toISOString(),
      };
      records.set(id, { ownerId, project: updated });
      return updated;
    },
    async remove(ownerId, id) {
      if (records.get(id)?.ownerId !== ownerId) return false;
      return records.delete(id);
    },
  };
}

function testApp(
  repository = memoryRepository(),
  userId: string | null = testUserId,
) {
  return createApp({
    projects: repository,
    auth: testAuth(userId),
    allowedOrigins: [allowedOrigin],
    logger: silentLogger,
  });
}

describe("API contract", () => {
  test("returns health without a database query", async () => {
    const response = await testApp().handle(
      new Request("http://localhost/health"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  test("rejects invalid project input before repository work", async () => {
    let writes = 0;
    const repository = memoryRepository();
    const create = repository.create;
    repository.create = async (ownerId, input) => {
      writes += 1;
      return create(ownerId, input);
    };
    const app = testApp(repository);

    for (const body of [
      { name: "   " },
      { name: "" },
      { name: "x".repeat(121) },
    ]) {
      const response = await app.handle(
        new Request("http://localhost/projects", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: allowedOrigin,
          },
          body: JSON.stringify(body),
        }),
      );
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request failed validation.",
        },
      });
    }

    expect(writes).toBe(0);

    const badId = await app.handle(
      new Request("http://localhost/projects/not-a-uuid"),
    );
    expect(badId.status).toBe(422);

    const emptyPatch = await app.handle(
      new Request(`http://localhost/projects/${crypto.randomUUID()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Origin: allowedOrigin },
        body: "{}",
      }),
    );
    expect(emptyPatch.status).toBe(422);
  });

  test("supports typed Eden Treaty create, list, update, and delete", async () => {
    const client = treaty(testApp(), { headers: { Origin: allowedOrigin } });

    const created = await client.projects.post({
      name: "  Example  ",
      description: "  First  ",
    });
    expect(created.status).toBe(201);
    expect(created.error).toBeNull();
    if (!created.data || "error" in created.data)
      throw new Error("Project creation failed");
    const id = created.data.id;
    expect(created.data.name).toBe("Example");

    const listed = await client.projects.get();
    expect(listed.data?.projects.map((project) => project.id)).toContain(id);

    const updated = await client.projects({ id }).patch({ description: "" });
    expect(updated.status).toBe(200);
    expect(
      updated.data && "description" in updated.data
        ? updated.data.description
        : undefined,
    ).toBeNull();

    const removed = await client.projects({ id }).delete();
    expect(removed.status).toBe(200);
    expect(removed.data).toEqual({ success: true });

    const missing = await client.projects({ id }).get();
    expect(missing.status).toBe(404);
  });

  test("requires a session for every project route", async () => {
    const app = testApp(memoryRepository(), null);
    const routes: [string, string][] = [
      ["/projects", "GET"],
      ["/projects", "POST"],
      [`/projects/${crypto.randomUUID()}`, "GET"],
      [`/projects/${crypto.randomUUID()}`, "PATCH"],
      [`/projects/${crypto.randomUUID()}`, "DELETE"],
    ];
    for (const [path, method] of routes) {
      const response = await app.handle(
        new Request(`http://localhost${path}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            Origin: allowedOrigin,
          },
          ...(method === "POST" || method === "PATCH"
            ? { body: JSON.stringify({ name: "Protected" }) }
            : {}),
        }),
      );
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: "UNAUTHORIZED", message: "Sign in required." },
      });
    }
  });

  test("isolates project records by authenticated owner", async () => {
    const repository = memoryRepository();
    const first = treaty(testApp(repository, "owner-one"), {
      headers: { Origin: allowedOrigin },
    });
    const second = treaty(testApp(repository, "owner-two"), {
      headers: { Origin: allowedOrigin },
    });
    const created = await first.projects.post({ name: "Private project" });
    if (!created.data || "error" in created.data)
      throw new Error("Create failed");
    const id = created.data.id;

    const listed = await second.projects.get();
    expect(listed.data?.projects).toEqual([]);
    expect((await second.projects({ id }).get()).status).toBe(404);
    expect(
      (await second.projects({ id }).patch({ name: "Stolen" })).status,
    ).toBe(404);
    expect((await second.projects({ id }).delete()).status).toBe(404);
    expect((await first.projects({ id }).get()).status).toBe(200);
  });

  test("allows only configured browser origins", async () => {
    const app = testApp();
    const allowed = await app.handle(
      new Request("http://localhost/health", {
        headers: { Origin: "http://localhost:3000" },
      }),
    );
    const denied = await app.handle(
      new Request("http://localhost/health", {
        headers: { Origin: "https://untrusted.example" },
      }),
    );

    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
    expect(allowed.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("rejects missing and foreign Origin on project mutations", async () => {
    let writes = 0;
    const repository = memoryRepository();
    repository.create = async () => {
      writes += 1;
      throw new Error("Mutation should not run");
    };
    const app = testApp(repository);

    for (const origin of [undefined, "https://attacker.example"]) {
      const response = await app.handle(
        new Request("http://localhost/projects", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(origin ? { Origin: origin } : {}),
          },
          body: JSON.stringify({ name: "Blocked" }),
        }),
      );
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: { code: "INVALID_ORIGIN", message: "Origin not allowed." },
      });
    }
    expect(writes).toBe(0);
  });

  test("hides unexpected errors behind a stable response", async () => {
    const repository = memoryRepository();
    repository.list = async () => {
      throw new Error("database password should stay private");
    };
    const response = await testApp(repository).handle(
      new Request("http://localhost/projects"),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error." },
    });
  });

  test("logs actual response status and a request ID, including mounted auth", async () => {
    const entries: Record<string, unknown>[] = [];
    const logger: Logger = {
      info: (entry) => entries.push(entry),
      warn: (entry) => entries.push(entry),
      error: (entry) => entries.push(entry),
    };
    const repository = memoryRepository();
    repository.list = async () => {
      throw new Error("secret database detail");
    };
    const app = createApp({
      projects: repository,
      auth: {
        ...testAuth(),
        handler: async () => new Response("Denied", { status: 418 }),
      },
      allowedOrigins: [allowedOrigin],
      logger,
    });

    for (const [path, expectedStatus] of [
      ["/health?ignore=secret", 200],
      ["/projects", 500],
      ["/api/auth/example", 418],
    ] as const) {
      const response = await app.handle(new Request(`http://localhost${path}`));
      expect(response.status).toBe(expectedStatus);
      expect(response.headers.get("x-request-id")).toBeTruthy();
    }
    await Bun.sleep(5);

    const completed = entries.filter(
      (entry) => entry.event === "request_complete",
    );
    expect(completed.map((entry) => entry.status)).toEqual([200, 500, 418]);
    expect(completed[0]?.path).toBe("/health");
    for (const entry of completed) {
      expect(typeof entry.requestId).toBe("string");
      expect(typeof entry.durationMs).toBe("number");
    }
    const exception = entries.find((entry) => entry.event === "request_error");
    expect(exception?.err).toBeInstanceOf(Error);
  });

  test("leaves project creation successful if optional job enqueue fails", async () => {
    const warnings: Record<string, unknown>[] = [];
    const logger: Logger = {
      info() {},
      warn: (entry) => warnings.push(entry),
      error() {},
    };
    const app = createApp({
      projects: memoryRepository(),
      auth: testAuth(),
      allowedOrigins: [allowedOrigin],
      logger,
      onProjectCreated: async () => {
        throw new Error("Queue unavailable");
      },
    });

    const created = await app.handle(
      new Request("http://localhost/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: allowedOrigin },
        body: JSON.stringify({ name: "Persisted" }),
      }),
    );
    expect(created.status).toBe(201);
    const project = await created.json();
    expect(
      (await app.handle(new Request("http://localhost/projects"))).status,
    ).toBe(200);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.event).toBe("project_job_enqueue_failed");
    expect(warnings[0]?.projectId).toBe(project.id);
  });

  test("job callbacks require a valid QStash signature and payload", async () => {
    const repository = memoryRepository();
    const project = await repository.create(testUserId, { name: "Queued" });
    const processed: Record<string, unknown>[] = [];
    const app = createApp({
      projects: repository,
      auth: testAuth(null),
      allowedOrigins: [allowedOrigin],
      logger: { info: (entry) => processed.push(entry), warn() {}, error() {} },
      jobs: {
        enabled: true,
        verify: async (_job, signature) => signature === "valid",
      },
    });
    const callback = (signature: string | null, body: unknown) =>
      app.handle(
        new Request("http://localhost/jobs/project-created", {
          method: "POST",
          headers: signature ? { "Upstash-Signature": signature } : {},
          body: JSON.stringify(body),
        }),
      );
    const payload = { projectId: project.id, ownerId: testUserId };

    expect((await callback(null, payload)).status).toBe(401);
    expect((await callback("forged", payload)).status).toBe(401);
    expect((await callback("valid", { projectId: "bad" })).status).toBe(422);
    const accepted = await callback("valid", payload);
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ received: true });
    expect(
      processed.find((entry) => entry.event === "project_job_processed")
        ?.projectId,
    ).toBe(project.id);
  });

  test("job callbacks report unavailable when queue is off", async () => {
    const app = createApp({
      projects: memoryRepository(),
      auth: testAuth(),
      allowedOrigins: [allowedOrigin],
      logger: silentLogger,
    });
    const response = await app.handle(
      new Request("http://localhost/jobs/project-created", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(response.status).toBe(503);
  });

  test("advertises optional email capability without exposing credentials", async () => {
    const app = createApp({
      projects: memoryRepository(),
      auth: { ...testAuth(), emailEnabled: true },
      allowedOrigins: [allowedOrigin],
      logger: silentLogger,
    });
    const response = await app.handle(
      new Request("http://localhost/auth/capabilities"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ emailEnabled: true });
  });
});
