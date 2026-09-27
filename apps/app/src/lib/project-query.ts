import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { listProjects } from "./api";

export const projectKeys = {
  all: ["projects"] as const,
  list: () => ["projects", "list"] as const,
};

export const projectsQueryOptions = queryOptions({
  queryKey: projectKeys.list(),
  queryFn: listProjects,
});

export function invalidateProjects(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: projectKeys.list() });
}
