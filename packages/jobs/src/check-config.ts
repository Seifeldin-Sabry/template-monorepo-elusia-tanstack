import { createProjectEventPublisher } from "./publisher";

const publisher = createProjectEventPublisher();
if (!publisher.enabled) {
  throw new Error(
    "Set TRIGGER_PROJECT_REF and TRIGGER_SECRET_KEY before running Trigger.dev",
  );
}
