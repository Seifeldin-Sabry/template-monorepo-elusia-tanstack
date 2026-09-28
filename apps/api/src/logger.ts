import pino, { type DestinationStream } from "pino";

export type LogLevel =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error"
  | "fatal"
  | "silent";

export type LogEntry = { event: string } & Record<string, unknown>;

export type Logger = {
  info(entry: LogEntry): void;
  warn(entry: LogEntry): void;
  error(entry: LogEntry): void;
};

/** Keep exception names and call sites while excluding messages and causes. */
export function serializeError(value: unknown) {
  if (!(value instanceof Error)) return { name: "UnknownError" };

  const code = (value as Error & { code?: unknown }).code;
  const frames = value.stack
    ?.split("\n")
    .filter((line) => /^\s+at\s/.test(line))
    .slice(0, 12);

  return {
    name: value.name,
    ...(typeof code === "string" && /^[A-Z0-9_]{1,32}$/i.test(code)
      ? { code }
      : {}),
    ...(frames?.length ? { stack: frames.join("\n") } : {}),
  };
}

export function createLogger(
  level: LogLevel,
  destination?: DestinationStream,
): Logger {
  const options = {
    level,
    base: { service: "api" },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label: string) => ({ level: label }) },
    serializers: { err: serializeError },
    redact: {
      paths: [
        "password",
        "secret",
        "token",
        "apiKey",
        "authorization",
        "cookie",
        "headers.authorization",
        "headers.cookie",
        "*.password",
        "*.secret",
        "*.token",
        "*.apiKey",
        "*.authorization",
        "*.cookie",
      ],
      censor: "[Redacted]",
    },
  };

  const engine = destination ? pino(options, destination) : pino(options);
  return {
    info(entry) {
      engine.info(entry);
    },
    warn(entry) {
      engine.warn(entry, "API warning");
    },
    error(entry) {
      // Pino otherwise derives msg from err.message, which can contain secrets.
      engine.error(entry, "API error");
    },
  };
}

export const jsonLogger = createLogger("info");
