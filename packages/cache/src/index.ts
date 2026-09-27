import { Redis } from "@upstash/redis";

const DEFAULT_NAMESPACE = "starter";
// Keep counter increment and initial expiry atomic, without extending its window.
const INCREMENT_WITH_TTL = `
local count = redis.call('INCR', KEYS[1])
local ttl = tonumber(ARGV[1])
if ttl and ttl > 0 and redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ttl)
end
return count
`;

export interface BetterAuthSecondaryStorage {
  get(key: string): Promise<string | null>;
  getAndDelete(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  increment(key: string, ttlSeconds?: number): Promise<number>;
}

export interface CacheClient {
  get(key: string): Promise<unknown>;
  getdel(key: string): Promise<unknown>;
  set(key: string, value: string, options?: { ex: number }): Promise<unknown>;
  del(key: string): Promise<number>;
  eval(script: string, keys: string[], args: unknown[]): Promise<unknown>;
}

export interface CreateCacheOptions {
  /** Defaults to process.env. Useful for deterministic setup and tests. */
  env?: Record<string, string | undefined>;
  /** Defaults to REDIS_KEY_NAMESPACE or "starter". */
  namespace?: string;
  /** An injected client can be used for local tests without Upstash credentials. */
  client?: CacheClient;
}

interface CacheOperations {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<boolean>;
  delete(key: string): Promise<boolean>;
}

export interface EnabledCache extends CacheOperations {
  enabled: true;
  redis: CacheClient;
  secondaryStorage: BetterAuthSecondaryStorage;
}

export interface DisabledCache extends CacheOperations {
  enabled: false;
  redis: null;
  secondaryStorage: undefined;
}

export type Cache = EnabledCache | DisabledCache;

function namespacedKey(
  namespace: string,
  scope: "cache" | "auth",
  key: string,
): string {
  if (!key || key.length > 1024) {
    throw new Error("Redis key must be between 1 and 1024 characters");
  }
  return `${namespace}:${scope}:${key}`;
}

function validatedTtl(ttlSeconds: number): number {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("Redis TTL must be a positive integer number of seconds");
  }
  return ttlSeconds;
}

function optionalTtl(
  ttlSeconds: number | undefined,
): { ex: number } | undefined {
  return ttlSeconds === undefined
    ? undefined
    : { ex: validatedTtl(ttlSeconds) };
}

function asRawString(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error("Redis secondary storage expected a string value");
  }
  return value;
}

/**
 * Upstash is optional. Missing credentials disable the cache, while an incomplete
 * credential pair fails fast. Keep this package on the server side only.
 */
export function createCache(options: CreateCacheOptions = {}): Cache {
  const env = options.env ?? process.env;
  const namespace =
    options.namespace ?? env.REDIS_KEY_NAMESPACE ?? DEFAULT_NAMESPACE;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(namespace)) {
    throw new Error(
      "REDIS_KEY_NAMESPACE must be 1–64 letters, numbers, dots, colons, dashes, or underscores",
    );
  }

  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!options.client && !url && !token) {
    return {
      enabled: false,
      redis: null,
      secondaryStorage: undefined,
      get: async () => null,
      set: async () => false,
      delete: async () => false,
    };
  }

  if (!options.client && (!url || !token)) {
    throw new Error(
      "Set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, or neither",
    );
  }

  if (url && new URL(url).protocol !== "https:") {
    throw new Error("UPSTASH_REDIS_REST_URL must use HTTPS");
  }

  // Raw strings are essential for Better Auth values. Cache values are encoded
  // explicitly below so JSON-looking strings round-trip without type changes.
  const redis: CacheClient =
    options.client ??
    new Redis({
      url: url as string,
      token: token as string,
      automaticDeserialization: false,
      enableTelemetry: false,
    });

  const cacheKey = (key: string) => namespacedKey(namespace, "cache", key);
  const authKey = (key: string) => namespacedKey(namespace, "auth", key);

  return {
    enabled: true,
    redis,
    async get<T>(key: string): Promise<T | null> {
      const raw = asRawString(await redis.get(cacheKey(key)));
      return raw === null ? null : (JSON.parse(raw) as T);
    },
    async set<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) {
        throw new Error("Cache value must be JSON serializable");
      }
      await redis.set(cacheKey(key), serialized, {
        ex: validatedTtl(ttlSeconds),
      });
      return true;
    },
    async delete(key: string): Promise<boolean> {
      return (await redis.del(cacheKey(key))) > 0;
    },
    secondaryStorage: {
      async get(key) {
        return asRawString(await redis.get(authKey(key)));
      },
      async getAndDelete(key) {
        return asRawString(await redis.getdel(authKey(key)));
      },
      async set(key, value, ttlSeconds) {
        await redis.set(authKey(key), value, optionalTtl(ttlSeconds));
      },
      async delete(key) {
        await redis.del(authKey(key));
      },
      async increment(key, ttlSeconds) {
        const ttl =
          ttlSeconds === undefined ? "" : String(validatedTtl(ttlSeconds));
        const count = await redis.eval(
          INCREMENT_WITH_TTL,
          [authKey(key)],
          [ttl],
        );
        if (typeof count !== "number") {
          throw new Error("Redis increment returned a non-numeric value");
        }
        return count;
      },
    },
  };
}
