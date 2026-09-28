import { defineConfig } from "@trigger.dev/sdk";

const projectRef = process.env.TRIGGER_PROJECT_REF;
if (!projectRef) {
  throw new Error("TRIGGER_PROJECT_REF is required to run Trigger.dev tasks");
}

export default defineConfig({
  project: projectRef,
  dirs: ["./src/trigger"],
  runtime: "bun",
  maxDuration: 60,
});
