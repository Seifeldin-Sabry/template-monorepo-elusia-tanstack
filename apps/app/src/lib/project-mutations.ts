import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createProject, deleteProject, updateProject } from "./api";
import { invalidateProjects } from "./project-query";

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSuccess: () => invalidateProjects(queryClient),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { name?: string; description?: string };
    }) => updateProject(id, input),
    onSuccess: () => invalidateProjects(queryClient),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteProject,
    onSuccess: () => invalidateProjects(queryClient),
  });
}
