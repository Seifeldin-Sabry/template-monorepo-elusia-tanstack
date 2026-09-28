import { queryOptions } from "@tanstack/react-query";
import { getApiClient } from "./api";

async function getAuthCapabilities(): Promise<{ emailEnabled: boolean }> {
  const api = await getApiClient();
  const { data, error } = await api.auth.capabilities.get();
  if (error || !data) {
    throw new Error("Account service is unavailable. Try again shortly.");
  }
  return data;
}

export const authCapabilitiesQueryOptions = queryOptions({
  queryKey: ["auth", "capabilities"],
  queryFn: getAuthCapabilities,
  staleTime: 60_000,
  retry: false,
});
