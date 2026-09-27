import { cors } from "@elysia/cors";
import type { BillingService } from "@starter/billing";
import { Elysia, t } from "elysia";
import type { AuthService } from "./auth";
import { createBillingRoutes } from "./billing";
import type { ProjectRepository } from "./projects";

export type { ProjectDto } from "./projects";

type LogEntry = Record<string, string | number | boolean | null | undefined>;

export type Logger = {
  info(entry: LogEntry): void;
  error(entry: LogEntry): void;
};

export const jsonLogger: Logger = {
  info: (entry) => console.info(JSON.stringify({ level: "info", ...entry })),
  error: (entry) => console.error(JSON.stringify({ level: "error", ...entry })),
};

export type AppOptions = {
  projects: ProjectRepository;
  auth: AuthService;
  billing?: BillingService | null;
  allowedOrigins: string[];
  getClientIp?: (request: Request) => string | null;
  logger?: Logger;
};

const nameSchema = t.String({ minLength: 1, maxLength: 120, pattern: "\\S" });
const descriptionSchema = t.Union([t.String({ maxLength: 500 }), t.Null()]);
const idSchema = t.Object({
  id: t.String({
    pattern:
      "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
  }),
});

export function createApp({
  projects,
  auth,
  billing,
  allowedOrigins,
  getClientIp,
  logger = jsonLogger,
}: AppOptions) {
  const requestDetails = new WeakMap<
    Request,
    { id: string; startedAt: number }
  >();

  return new Elysia({ name: "starter-api" })
    .use(
      cors({
        origin: allowedOrigins,
        methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        exposeHeaders: ["X-Request-ID"],
        credentials: true,
      }),
    )
    .onRequest(({ request, set }) => {
      // Only Bun's socket address may populate the header consumed by Better Auth.
      request.headers.delete("x-real-ip");
      const clientIp = getClientIp?.(request);
      if (clientIp) request.headers.set("x-real-ip", clientIp);
      const id = crypto.randomUUID();
      requestDetails.set(request, { id, startedAt: performance.now() });
      set.headers["x-request-id"] = id;
    })
    .onError(({ code, error, request, status }) => {
      const requestId = requestDetails.get(request)?.id;

      if (code === "VALIDATION") {
        return status(422, {
          error: {
            code: "VALIDATION_ERROR",
            message: "Request failed validation.",
          },
        });
      }

      if (code === "PARSE") {
        return status(400, {
          error: {
            code: "INVALID_JSON",
            message: "Request body could not be parsed.",
          },
        });
      }

      if (code === "NOT_FOUND") {
        return status(404, {
          error: { code: "NOT_FOUND", message: "Route not found." },
        });
      }

      logger.error({
        event: "request_error",
        requestId,
        method: request.method,
        path: new URL(request.url).pathname,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return status(500, {
        error: { code: "INTERNAL_ERROR", message: "Unexpected server error." },
      });
    })
    .onAfterResponse(({ request, set }) => {
      const details = requestDetails.get(request);
      logger.info({
        event: "request_complete",
        requestId: details?.id,
        method: request.method,
        path: new URL(request.url).pathname,
        status: typeof set.status === "number" ? set.status : 200,
        durationMs: details
          ? Math.round(performance.now() - details.startedAt)
          : undefined,
      });
    })
    .mount(auth.handler)
    .macro({
      auth: {
        async resolve({ status, request: { headers } }) {
          const current = await auth.getSession(headers);
          if (!current) {
            return status(401, {
              error: { code: "UNAUTHORIZED", message: "Sign in required." },
            });
          }
          return current;
        },
      },
    })
    .macro({
      mutationOrigin: {
        beforeHandle({ request, status }) {
          const origin = request.headers.get("origin");
          if (!origin || !allowedOrigins.includes(origin)) {
            return status(403, {
              error: { code: "INVALID_ORIGIN", message: "Origin not allowed." },
            });
          }
        },
      },
    })
    .use(
      createBillingRoutes({
        billing: billing ?? null,
        allowedOrigins,
        getUser: async (headers) =>
          (await auth.getSession(headers))?.user ?? null,
      }),
    )
    .get("/health", () => ({ status: "ok" as const }))
    .get(
      "/projects",
      async ({ user }) => ({ projects: await projects.list(user.id) }),
      { auth: true },
    )
    .get(
      "/projects/:id",
      async ({ params, status, user }) => {
        const project = await projects.find(user.id, params.id);
        if (!project) {
          return status(404, {
            error: { code: "PROJECT_NOT_FOUND", message: "Project not found." },
          });
        }
        return project;
      },
      { params: idSchema, auth: true },
    )
    .post(
      "/projects",
      async ({ body, status, user }) => {
        const project = await projects.create(user.id, body);
        return status(201, project);
      },
      {
        body: t.Object(
          {
            name: nameSchema,
            description: t.Optional(descriptionSchema),
          },
          { additionalProperties: false },
        ),
        auth: true,
        mutationOrigin: true,
      },
    )
    .patch(
      "/projects/:id",
      async ({ params, body, status, user }) => {
        const project = await projects.update(user.id, params.id, body);
        if (!project) {
          return status(404, {
            error: { code: "PROJECT_NOT_FOUND", message: "Project not found." },
          });
        }
        return project;
      },
      {
        params: idSchema,
        body: t.Object(
          {
            name: t.Optional(nameSchema),
            description: t.Optional(descriptionSchema),
          },
          { minProperties: 1, additionalProperties: false },
        ),
        auth: true,
        mutationOrigin: true,
      },
    )
    .delete(
      "/projects/:id",
      async ({ params, status, user }) => {
        const removed = await projects.remove(user.id, params.id);
        if (!removed) {
          return status(404, {
            error: { code: "PROJECT_NOT_FOUND", message: "Project not found." },
          });
        }
        return { success: true as const };
      },
      { params: idSchema, auth: true, mutationOrigin: true },
    );
}

export type App = ReturnType<typeof createApp>;
