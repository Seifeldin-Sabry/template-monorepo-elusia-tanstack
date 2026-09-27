import { treaty } from "@elysia/eden";
import type { App, ProjectDto } from "@starter/api/contract";
import { createIsomorphicFn } from "@tanstack/react-start";
import { httpOrigin } from "./http-origin";

export type Project = ProjectDto;

const apiOrigin = createIsomorphicFn()
  .server(() =>
    httpOrigin(
      process.env.API_INTERNAL_ORIGIN ?? process.env.API_ORIGIN,
      "API_INTERNAL_ORIGIN or API_ORIGIN",
    ),
  )
  .client(() => httpOrigin(import.meta.env.VITE_API_ORIGIN, "VITE_API_ORIGIN"));

const requestHeaders = createIsomorphicFn()
  .server(async () => {
    const { getRequestHeaders } = await import("@tanstack/react-start/server");
    const cookie = getRequestHeaders().get("cookie");
    return {
      origin: httpOrigin(process.env.APP_ORIGIN, "APP_ORIGIN"),
      ...(cookie ? { cookie } : {}),
    };
  })
  .client(async () => ({}));

export async function getApiClient() {
  const headers = await requestHeaders();
  return treaty<App>(apiOrigin(), {
    fetch: { credentials: "include" },
    headers,
  });
}

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const value = "value" in error ? error.value : error;
    if (value && typeof value === "object") {
      const payload = "error" in value ? value.error : value;
      if (
        payload &&
        typeof payload === "object" &&
        "message" in payload &&
        typeof payload.message === "string"
      ) {
        return payload.message;
      }
    }
  }

  return fallback;
}

export async function listProjects(): Promise<Project[]> {
  const api = await getApiClient();
  const { data, error } = await api.projects.get();
  if (error)
    throw new Error(apiErrorMessage(error, "Could not load projects."));
  if (!data) throw new Error("Projects response was empty.");
  return data.projects;
}

export async function createProject(input: {
  name: string;
  description?: string;
}): Promise<Project> {
  const api = await getApiClient();
  const { data, error } = await api.projects.post(input);
  if (error)
    throw new Error(apiErrorMessage(error, "Could not create project."));
  if (!data) throw new Error("Create response was empty.");
  return data;
}

export async function updateProject(
  id: string,
  input: { name?: string; description?: string },
): Promise<Project> {
  const api = await getApiClient();
  const { data, error } = await api.projects({ id }).patch(input);
  if (error)
    throw new Error(apiErrorMessage(error, "Could not update project."));
  if (!data) throw new Error("Update response was empty.");
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  const api = await getApiClient();
  const { data, error } = await api.projects({ id }).delete();
  if (error)
    throw new Error(apiErrorMessage(error, "Could not delete project."));
  if (!data?.success) throw new Error("Delete response was empty.");
}
