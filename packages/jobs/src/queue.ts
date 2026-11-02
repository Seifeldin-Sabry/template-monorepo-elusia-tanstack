import { Client, Receiver } from "@upstash/qstash";
import {
  type ProjectCreatedPayload,
  projectCreatedPayloadSchema,
} from "./project-event";

/** Each job is delivered by QStash to `POST {API_ORIGIN}/jobs/{name}`. */
export type JobName = "project-created";

export type JobPublishResult =
  | { status: "disabled" }
  | { status: "queued"; messageId: string };

export type JobQueue = {
  enabled: boolean;
  publishProjectCreated(
    payload: ProjectCreatedPayload,
  ): Promise<JobPublishResult>;
  /** Checks the Upstash-Signature JWT against the raw body and job URL. */
  verify(job: JobName, signature: string, body: string): Promise<boolean>;
};

type PublishJob = (request: {
  url: string;
  body: unknown;
  deduplicationId: string;
  retries: number;
}) => Promise<{ messageId: string }>;

type VerifySignature = (request: {
  signature: string;
  body: string;
  url: string;
}) => Promise<boolean>;

export type CreateJobQueueOptions = {
  /** Public API origin QStash calls back, e.g. https://api.example.com. */
  apiOrigin: string;
  /** Defaults to process.env. Useful for deterministic tests. */
  env?: Record<string, string | undefined>;
  /** Injectable transport and verifier keep tests free of network calls. */
  publish?: PublishJob;
  verifySignature?: VerifySignature;
};

const RETRIES = 3;

/**
 * Optional QStash integration. No credentials means a no-op; partial credentials
 * fail at startup instead of silently dropping work. `QSTASH_DEV=true` runs the
 * local QStash dev server with its deterministic keys.
 */
export function createJobQueue(options: CreateJobQueueOptions): JobQueue {
  const env = options.env ?? process.env;
  const devMode = ["true", "1"].includes(env.QSTASH_DEV?.trim() ?? "");
  const token = env.QSTASH_TOKEN?.trim();
  const currentSigningKey = env.QSTASH_CURRENT_SIGNING_KEY?.trim();
  const nextSigningKey = env.QSTASH_NEXT_SIGNING_KEY?.trim();
  const configured = [token, currentSigningKey, nextSigningKey].filter(Boolean);

  if (!devMode && configured.length > 0 && configured.length < 3) {
    throw new Error(
      "Set QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, and QSTASH_NEXT_SIGNING_KEY together, or none",
    );
  }

  if (!devMode && configured.length === 0) {
    return {
      enabled: false,
      async publishProjectCreated(payload) {
        projectCreatedPayloadSchema.parse(payload);
        return { status: "disabled" };
      },
      async verify() {
        return false;
      },
    };
  }

  const jobUrl = (job: JobName) => `${options.apiOrigin}/jobs/${job}`;

  const publish: PublishJob =
    options.publish ??
    (() => {
      const client = devMode
        ? new Client({ devMode })
        : new Client({ token: token as string });
      return (request) => client.publishJSON(request);
    })();

  const verifySignature: VerifySignature =
    options.verifySignature ??
    (() => {
      const receiver = devMode
        ? new Receiver({ devMode })
        : new Receiver({
            currentSigningKey: currentSigningKey as string,
            nextSigningKey: nextSigningKey as string,
          });
      return async (request) => {
        try {
          return await receiver.verify(request);
        } catch {
          // Receiver throws SignatureError for forged, expired, or mismatched URLs.
          return false;
        }
      };
    })();

  return {
    enabled: true,
    async publishProjectCreated(payload) {
      const parsed = projectCreatedPayloadSchema.parse(payload);
      const { messageId } = await publish({
        url: jobUrl("project-created"),
        body: parsed,
        deduplicationId: `project-created:${parsed.projectId}`,
        retries: RETRIES,
      });
      return { status: "queued", messageId };
    },
    verify(job, signature, body) {
      return verifySignature({ signature, body, url: jobUrl(job) });
    },
  };
}
