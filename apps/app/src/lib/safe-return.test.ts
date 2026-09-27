import { expect, test } from "bun:test";
import { normalizeReturnTo } from "./safe-return";

test("authentication return path stays within app", () => {
  expect(normalizeReturnTo("/billing?checkout=success")).toBe(
    "/billing?checkout=success",
  );
  expect(normalizeReturnTo("https://example.com")).toBe("/");
  expect(normalizeReturnTo("//example.com")).toBe("/");
  expect(normalizeReturnTo("/\\example.com")).toBe("/");
  expect(normalizeReturnTo(null)).toBe("/");
});
