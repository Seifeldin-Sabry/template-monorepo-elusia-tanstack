/**
 * Decrypts a dotenvx file and stages every value as a Fly secret, one argv entry
 * per secret so values never pass through shell quoting.
 *
 *   bun run secrets:fly [fly-config] [env-file]
 *   defaults: fly.api.toml .env.production
 *
 * Decryption needs .env.keys locally or DOTENV_PRIVATE_KEY_PRODUCTION in CI.
 * Secrets are staged; the next `fly deploy` applies them.
 */
const [config = "fly.api.toml", file = ".env.production"] = Bun.argv.slice(2);

const decrypted = Bun.spawnSync(
  ["dotenvx", "get", "-f", file, "--format", "json", "--strict", "--no-native"],
  { stderr: "inherit" },
);
if (!decrypted.success) process.exit(decrypted.exitCode ?? 1);

const values = JSON.parse(decrypted.stdout.toString()) as Record<
  string,
  string
>;
const secrets = Object.entries(values).filter(
  ([key]) => !key.startsWith("DOTENV_PUBLIC_KEY"),
);

const stillEncrypted = secrets.filter(([, value]) =>
  value.startsWith("encrypted:"),
);
if (stillEncrypted.length > 0) {
  console.error(
    `Could not decrypt ${stillEncrypted.map(([key]) => key).join(", ")}; provide .env.keys or DOTENV_PRIVATE_KEY_* for ${file}`,
  );
  process.exit(1);
}
if (secrets.length === 0) {
  console.error(`${file} has no secrets`);
  process.exit(1);
}

const imported = Bun.spawnSync(
  [
    "fly",
    "secrets",
    "set",
    "--stage",
    "-c",
    config,
    ...secrets.map(([key, value]) => `${key}=${value}`),
  ],
  { stdout: "inherit", stderr: "inherit" },
);
if (!imported.success) process.exit(imported.exitCode ?? 1);

console.log(
  `Staged ${secrets.length} secrets from ${file} for ${config}: ${secrets.map(([key]) => key).join(", ")}`,
);
