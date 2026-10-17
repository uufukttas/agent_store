import { describe, expect, it } from "vitest";
import { parsePublicEnv, parseServerEnv, requireSecret } from "@/lib/env";

const validPublic = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
};
const validServer = { SUPABASE_SERVICE_ROLE_KEY: "service-key" };

describe("parsePublicEnv", () => {
  it("geçerli değerleri kabul eder", () => {
    expect(parsePublicEnv(validPublic)).toEqual(validPublic);
  });

  it("eksik değişkende hangisinin eksik olduğunu söyler", () => {
    expect(() =>
      parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: validPublic.NEXT_PUBLIC_SUPABASE_URL }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("boş string'i eksik sayar", () => {
    expect(() => parsePublicEnv({ ...validPublic, NEXT_PUBLIC_SUPABASE_ANON_KEY: "" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    );
  });

  it("URL olmayan değeri reddeder", () => {
    expect(() => parsePublicEnv({ ...validPublic, NEXT_PUBLIC_SUPABASE_URL: "abc" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });
});

describe("parseServerEnv", () => {
  it("alan adı verilmezse gradeup.solutions olur", () => {
    expect(parseServerEnv(validServer).ALLOWED_EMAIL_DOMAIN).toBe("gradeup.solutions");
  });

  it("boş alan adını varsayılana çevirir", () => {
    expect(parseServerEnv({ ...validServer, ALLOWED_EMAIL_DOMAIN: "" }).ALLOWED_EMAIL_DOMAIN).toBe(
      "gradeup.solutions",
    );
  });

  it("alan adını küçük harfe çevirir", () => {
    expect(
      parseServerEnv({ ...validServer, ALLOWED_EMAIL_DOMAIN: "GradeUp.Solutions" })
        .ALLOWED_EMAIL_DOMAIN,
    ).toBe("gradeup.solutions");
  });

  it("@ içeren alan adını reddeder", () => {
    expect(() =>
      parseServerEnv({ ...validServer, ALLOWED_EMAIL_DOMAIN: "@gradeup.solutions" }),
    ).toThrow(/ALLOWED_EMAIL_DOMAIN/);
  });

  it("service role anahtarı zorunludur", () => {
    expect(() => parseServerEnv({})).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("Anthropic anahtarı P0'da isteğe bağlıdır", () => {
    expect(
      parseServerEnv({ ...validServer, ANTHROPIC_API_KEY: "" }).ANTHROPIC_API_KEY,
    ).toBeUndefined();
    expect(parseServerEnv({ ...validServer, ANTHROPIC_API_KEY: "sk-x" }).ANTHROPIC_API_KEY).toBe(
      "sk-x",
    );
  });

  it("hata mesajı gizli değer içermez", () => {
    try {
      parseServerEnv({ SUPABASE_SERVICE_ROLE_KEY: "", ALLOWED_EMAIL_DOMAIN: "gizli-deger@" });
    } catch (e) {
      expect(String(e)).not.toContain("gizli-deger@");
    }
  });
});

describe("P1 değişkenleri", () => {
  it("bütçe verilmezse 400 sent olur", () => {
    expect(parseServerEnv(validServer).RUN_DEFAULT_BUDGET_CENTS).toBe(400);
    expect(
      parseServerEnv({ ...validServer, RUN_DEFAULT_BUDGET_CENTS: "" }).RUN_DEFAULT_BUDGET_CENTS,
    ).toBe(400);
  });

  it("bütçeyi sayıya çevirir", () => {
    expect(
      parseServerEnv({ ...validServer, RUN_DEFAULT_BUDGET_CENTS: "250" }).RUN_DEFAULT_BUDGET_CENTS,
    ).toBe(250);
  });

  it.each(["abc", "5", "10001", "4.5", "-1"])("geçersiz bütçeyi reddeder: %s", (v) => {
    expect(() => parseServerEnv({ ...validServer, RUN_DEFAULT_BUDGET_CENTS: v })).toThrow(
      /RUN_DEFAULT_BUDGET_CENTS/,
    );
  });

  it("kısa gizli anahtarı reddeder, boşu eksik sayar", () => {
    expect(() => parseServerEnv({ ...validServer, CRON_SECRET: "kisa" })).toThrow(/CRON_SECRET/);
    expect(parseServerEnv({ ...validServer, CRON_SECRET: "" }).CRON_SECRET).toBeUndefined();
  });

  it("requireSecret: değer varsa döner, yoksa adını söyler, değeri sızdırmaz", () => {
    const secret = "a".repeat(20);
    expect(requireSecret("CRON_SECRET", { ...validServer, CRON_SECRET: secret })).toBe(secret);
    expect(() => requireSecret("ANTHROPIC_API_KEY", validServer)).toThrow(/ANTHROPIC_API_KEY/);
    try {
      requireSecret("CRON_SECRET", { ...validServer, CRON_SECRET: "kisa" });
    } catch (e) {
      expect(String(e)).not.toContain("kisa\n");
    }
  });
});
