import { createBillingService, readBillingEnvironment } from "@starter/billing";
import { createCache } from "@starter/cache";
import { createDatabase } from "@starter/db";
import { createApp, jsonLogger } from "./app";
import { createAuthService } from "./auth";
import { readApiEnvironment } from "./env";
import { createProjectRepository } from "./projects";

const environment = readApiEnvironment(process.env);
const billingEnvironment = readBillingEnvironment(process.env);
const cache = createCache({ env: process.env });
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
});
app = createApp({
  projects: createProjectRepository(connection.db),
  billing,
  auth,
  allowedOrigins: environment.allowedOrigins,
  getClientIp: (request) => app?.server?.requestIP(request)?.address ?? null,
});

app.listen({ hostname: environment.host, port: environment.port });
jsonLogger.info({
  event: "server_started",
  host: environment.host,
  port: environment.port,
});

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  jsonLogger.info({ event: "server_stopping", signal });
  try {
    await app?.server?.stop();
    await connection.close();
    jsonLogger.info({ event: "server_stopped" });
  } catch (error) {
    jsonLogger.error({
      event: "shutdown_error",
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
