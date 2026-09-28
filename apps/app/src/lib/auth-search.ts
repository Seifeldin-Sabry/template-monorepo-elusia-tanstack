export function isSearchFlagTrue(value: unknown): boolean {
  return value === true || value === 1 || value === "true" || value === "1";
}
