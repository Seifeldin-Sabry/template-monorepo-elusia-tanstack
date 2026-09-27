export function httpOrigin(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required.`);

  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must use HTTP or HTTPS.`);
  }

  return url.origin;
}
