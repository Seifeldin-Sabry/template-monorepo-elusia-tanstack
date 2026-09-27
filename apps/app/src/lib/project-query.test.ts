import { expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { invalidateProjects, projectKeys } from "./project-query";

test("project invalidation refetches active list without touching unrelated data", async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const unrelatedKey = ["billing", "overview"] as const;
  let reads = 0;
  const queryFn = async () => {
    reads += 1;
    return [`read-${reads}`];
  };

  await queryClient.fetchQuery({ queryKey: projectKeys.list(), queryFn });
  queryClient.setQueryData(unrelatedKey, { status: "untouched" });

  const observer = new QueryObserver(queryClient, {
    queryKey: projectKeys.list(),
    queryFn,
    staleTime: Infinity,
  });
  const unsubscribe = observer.subscribe(() => {});

  try {
    await invalidateProjects(queryClient);

    expect(reads).toBe(2);
    expect(queryClient.getQueryData<string[]>(projectKeys.list())).toEqual([
      "read-2",
    ]);
    expect(queryClient.getQueryData<{ status: string }>(unrelatedKey)).toEqual({
      status: "untouched",
    });
  } finally {
    unsubscribe();
    queryClient.clear();
  }
});
