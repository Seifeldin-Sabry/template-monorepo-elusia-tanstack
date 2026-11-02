import { cors } from "@elysia/cors";
import type { BillingService } from "@starter/billing";
import { type JobQueue, projectCreatedPayloadSchema } from "@starter/jobs";
import { Elysia, t } from "elysia";
import type { AuthService } from "./auth";
import { createBillingRoutes } from "./billing";
import { jsonLogger, type Logger } from "./logger";
import type { ProjectRepository } from "./projects";

export type { Logger } from "./logger";
export type { ProjectDto } from "./projects";

export type AppOptions = {
  projects: ProjectRepository;
  auth: AuthService;
  billing?: BillingService | null;
  /** QStash queue whose signed callbacks land on POST /jobs/:name. */
  jobs?: Pick<JobQueue, "enabled" | "verify"> | null;
  allowedOrigins: string[];
  getClientIp?: (request: Request) => string | null;
  logger?: Logger;
  onProjectCreated?: (event: {
    projectId: string;
    ownerId: string;
  }) => void | Promise<void>;
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
  jobs,
  allowedOrigins,
  getClientIp,
  logger = jsonLogger,
  onProjectCreated,
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
        err: error,
      });
      return status(500, {
        error: { code: "INTERNAL_ERROR", message: "Unexpected server error." },
      });
    })
    .onAfterResponse(({ request, set, responseValue }) => {
      const details = requestDetails.get(request);
      const status =
        responseValue instanceof Response
          ? responseValue.status
          : typeof set.status === "number"
            ? set.status
            : 200;
      logger.info({
        event: "request_complete",
        requestId: details?.id,
        method: request.method,
        path: new URL(request.url).pathname,
        status,
        durationMs: details
          ? Math.round(performance.now() - details.startedAt)
          : undefined,
      });
      requestDetails.delete(request);
    })
    .get("/auth/capabilities", () => ({ emailEnabled: auth.emailEnabled }))
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
    .post(
      "/jobs/project-created",
      async ({ request, status }) => {
        if (!jobs?.enabled) {
          return status(503, {
            error: {
              code: "JOBS_NOT_CONFIGURED",
              message: "Jobs are not configured for this deployment.",
            },
          });
        }
        const body = await request.text();
        const signature = request.headers.get("upstash-signature");
        if (
          !signature ||
          !(await jobs.verify("project-created", signature, body))
        ) {
          return status(401, {
            error: {
              code: "INVALID_JOB_SIGNATURE",
              message: "Job signature verification failed.",
            },
          });
        }
        const payload = projectCreatedPayloadSchema.safeParse(parseJson(body));
        if (!payload.success) {
          // Non-2xx makes QStash retry, then park the message in its DLQ.
          return status(422, {
            error: {
              code: "INVALID_JOB_PAYLOAD",
              message: "Job payload failed validation.",
            },
          });
        }
        // Re-read committed state: the project may have changed or been deleted.
        const project = await projects.find(
          payload.data.ownerId,
          payload.data.projectId,
        );
        logger.info({
          event: project
            ? "project_job_processed"
            : "project_job_target_missing",
          projectId: payload.data.projectId,
        });
        return { received: true as const };
      },
      { parse: "none" },
    )
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
        try {
          await onProjectCreated?.({ projectId: project.id, ownerId: user.id });
        } catch (err) {
          logger.warn({
            event: "project_job_enqueue_failed",
            projectId: project.id,
            err,
          });
        }
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

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export type App = ReturnType<typeof createApp>;
