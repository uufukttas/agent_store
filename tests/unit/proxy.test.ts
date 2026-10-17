import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

// Next, matcher'ı path-to-regexp ile işler; bu desen düz regex olarak da eşdeğerdir.
const matcher = new RegExp(`^${config.matcher[0]}$`);

describe("proxy matcher", () => {
  it.each(["/", "/login", "/leadler", "/calistirmalar/yeni", "/calistirmalar/abc"])(
    "giriş ister: %s",
    (path) => {
      expect(matcher.test(path)).toBe(true);
    },
  );

  it.each(["/api/webhooks/anthropic", "/api/internal/reconcile"])(
    "kendi doğrulaması olan uç noktayı atlar: %s",
    (path) => {
      expect(matcher.test(path)).toBe(false);
    },
  );

  it("diğer API yollarını korur", () => {
    expect(matcher.test("/api/baska")).toBe(true);
  });

  it("statik dosyaları atlar", () => {
    expect(matcher.test("/_next/static/chunk.js")).toBe(false);
    expect(matcher.test("/logo.png")).toBe(false);
  });
});
