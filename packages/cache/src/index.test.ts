import { describe, expect, test } from "bun:test";
import { type CacheClient, createCache } from "./index";

function memoryClient() {
  const values = new Map<string, string>();
  const expirations = new Map<string, number>();
  const client: CacheClient = {
    get: async (key) => values.get(key) ?? null,
    getdel: async (key) => {
      const value = values.get(key) ?? null;
      values.delete(key);
      return value;
    },
    set: async (key, value, options) => {
      values.set(key, value);
      if (options) expirations.set(key, options.ex);
      return "OK";
    },
    del: async (key) => Number(values.delete(key)),
    eval: async (_script, [key], [ttl]) => {
      if (!key) throw new Error("Missing key");
      const count = Number(values.get(key) ?? "0") + 1;
      values.set(key, String(count));
      if (count === 1 && ttl) expirations.set(key, Number(ttl));
      return count;
    },
  };
  return { client, values, expirations };
}

describe("optional Upstash cache", () => {
  test("missing credentials disable cache without external calls", async () => {
    const cache = createCache({ env: {} });
    expect(cache.enabled).toBe(false);
    expect(cache.redis).toBeNull();
    expect(cache.secondaryStorage).toBeUndefined();
    expect(await cache.get("missing")).toBeNull();
    expect(await cache.set("key", { value: 1 }, 60)).toBe(false);
    expect(await cache.delete("key")).toBe(false);
  });

  test("partial credentials fail before an Upstash request", () => {
    expect(() =>
      createCache({
        env: { UPSTASH_REDIS_REST_URL: "https://example.upstash.io" },
      }),
    ).toThrow("Set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN");
  });

  test("cache values round-trip with TTL inside their own namespace", async () => {
    const { client, values, expirations } = memoryClient();
    const cache = createCache({ env: {}, namespace: "myapp", client });
    expect(cache.enabled).toBe(true);
    await cache.set("projects:1", { name: "Example" }, 120);
    expect(values.get("myapp:cache:projects:1")).toBe('{"name":"Example"}');
    expect(expirations.get("myapp:cache:projects:1")).toBe(120);
    expect(await cache.get<{ name: string }>("projects:1")).toEqual({
      name: "Example",
    });
    expect(await cache.delete("projects:1")).toBe(true);
    expect(await cache.get("projects:1")).toBeNull();
    expect(cache.set("invalid", "value", 0)).rejects.toThrow("Redis TTL");
  });

  test("Better Auth storage preserves raw JSON strings and atomically increments counters", async () => {
    const { client, values, expirations } = memoryClient();
    const cache = createCache({ env: {}, namespace: "myapp", client });
    if (!cache.enabled) throw new Error("Expected enabled cache");

    const session = '{"userId":"user_1"}';
    await cache.secondaryStorage.set("session:1", session, 300);
    expect(values.get("myapp:auth:session:1")).toBe(session);
    expect(await cache.secondaryStorage.getAndDelete("session:1")).toBe(
      session,
    );
    expect(await cache.secondaryStorage.get("session:1")).toBeNull();
    expect(await cache.secondaryStorage.increment("ratelimit:1", 60)).toBe(1);
    expect(await cache.secondaryStorage.increment("ratelimit:1", 60)).toBe(2);
    expect(expirations.get("myapp:auth:ratelimit:1")).toBe(60);
  });
});
