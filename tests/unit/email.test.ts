import { describe, expect, it } from "vitest";
import { getAllowedEmailDomain } from "@/lib/env";
import { isAllowedEmail } from "@/lib/auth/email";

const D = "gradeup.solutions";

describe("isAllowedEmail", () => {
  it("izinli alan adını kabul eder", () => {
    expect(isAllowedEmail("ece@gradeup.solutions", D)).toBe(true);
  });
  it("büyük harf ve boşluğu normalleştirir", () => {
    expect(isAllowedEmail("  Ece@GradeUp.Solutions ", D)).toBe(true);
  });
  it.each([
    "ece@gmail.com",
    "ece@evilgradeup.solutions",
    "ece@gradeup.solutions.evil.com",
    "ece@mail.gradeup.solutions",
    "a@b@gradeup.solutions",
    "@gradeup.solutions",
    "gradeup.solutions",
    "",
  ])("reddeder: %s", (email) => {
    expect(isAllowedEmail(email, D)).toBe(false);
  });
  it("boş değerleri reddeder", () => {
    expect(isAllowedEmail(null, D)).toBe(false);
    expect(isAllowedEmail(undefined, D)).toBe(false);
  });
});

describe("getAllowedEmailDomain", () => {
  it("sır olmadan yalnızca alan adını okur", () => {
    expect(getAllowedEmailDomain({ ALLOWED_EMAIL_DOMAIN: "Ornek.com" })).toBe("ornek.com");
    expect(getAllowedEmailDomain({})).toBe("gradeup.solutions");
  });
});
