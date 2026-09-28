import { createBillingService, readBillingEnvironment } from "@starter/billing";
import { createCache } from "@starter/cache";
import { createDatabase } from "@starter/db";
import { createEmailService } from "@starter/email";
import { createProjectEventPublisher } from "@starter/jobs";
import { createApp } from "./app";
import { createAuthService } from "./auth";
import { readApiEnvironment } from "./env";
import { createLogger } from "./logger";
import { createProjectRepository } from "./projects";

const environment = readApiEnvironment(process.env);
const logger = createLogger(environment.logLevel);
const billingEnvironment = readBillingEnvironment(process.env);
const cache = createCache({ env: process.env });
const email = createEmailService({ env: process.env });
const jobs = createProjectEventPublisher({ env: process.env });
const connection = createDatabase(environment.databaseUrl);
const billing = billingEnvironment
  ? createBillingService(connection.db, billingEnvironment)
  : null;
let app: ReturnType<typeof createApp> | undefined;
const auth = createAuthService(connection.db, {
  apiOrigin: environment.apiOrigin,
  secret: environment.authSecret,
  trustedOrigins: environment.allowedOrigins,
  ...(environment.authCookieDomain
    ? { cookieDomain: environment.authCookieDomain }
    : {}),
  ...(cache.enabled ? { secondaryStorage: cache.secondaryStorage } : {}),
  getClientIp: (request) => request.headers.get("x-real-ip"),
  email,
  logger,
});
app = createApp({
  projects: createProjectRepository(connection.db),
  billing,
  auth,
  allowedOrigins: environment.allowedOrigins,
  getClientIp: (request) => app?.server?.requestIP(request)?.address ?? null,
  logger,
  ...(jobs.enabled
    ? {
        onProjectCreated: async (event: {
          projectId: string;
          ownerId: string;
        }) => {
          const result = await jobs.publishProjectCreated(event);
          if (result.status === "queued") {
            logger.info({
              event: "project_job_enqueued",
              projectId: event.projectId,
              runId: result.runId,
            });
          }
        },
      }
    : {}),
});

app.listen({ hostname: environment.host, port: environment.port });
logger.info({
  event: "server_started",
  host: environment.host,
  port: environment.port,
  integrations: {
    billing: Boolean(billing),
    cache: cache.enabled,
    email: email.enabled,
    jobs: jobs.enabled,
  },
});

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ event: "server_stopping", signal });
  try {
    await app?.server?.stop();
    await connection.close();
    logger.info({ event: "server_stopped" });
  } catch (error) {
    logger.error({
      event: "shutdown_error",
      err: error,
    });
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
