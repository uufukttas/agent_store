import { z } from "zod";

// Boş string (.env.example'daki boş satırlar) eksik sayılır.
const required = z.string().trim().min(1);
const optional = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.string().trim().min(1).optional(),
);

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: required,
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: required,
  ALLOWED_EMAIL_DOMAIN: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z0-9-]+(\.[a-z0-9-]+)+$/,
        "@ işareti olmadan alan adı olmalı, örn. gradeup.solutions",
      )
      .default("gradeup.solutions"),
  ),
  ANTHROPIC_API_KEY: optional,
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;
type Source = Record<string, string | undefined>;

function parse<T extends z.ZodType>(schema: T, source: Source, label: string): z.infer<T> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const lines = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
  throw new Error(`Geçersiz ${label} ortam değişkenleri:\n${lines.join("\n")}\nBkz. .env.example`);
}

export const parsePublicEnv = (source: Source): PublicEnv =>
  parse(publicSchema, source, "herkese açık");
export const parseServerEnv = (source: Source): ServerEnv => parse(serverSchema, source, "sunucu");

/**
 * Next, istemci paketine yalnızca doğrudan yazılmış `process.env.NEXT_PUBLIC_*` ifadelerini
 * koyar. Bu yüzden anahtarlar burada tek tek yazılır, `process.env` toptan geçirilmez.
 */
export function getPublicEnv(): PublicEnv {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

/** Yalnızca alan adı gerekiyorsa (örn. proxy) tüm sunucu sırlarını doğrulamadan okur. */
export function getAllowedEmailDomain(source: Source = process.env): string {
  return parse(serverSchema.pick({ ALLOWED_EMAIL_DOMAIN: true }), source, "sunucu")
    .ALLOWED_EMAIL_DOMAIN;
}

/** Yalnızca sunucuda çağır. Tarayıcıda çağrılırsa hata verir, anahtar sızmaz. */
export function getServerEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv istemcide çağrılamaz.");
  }
  return parseServerEnv(process.env);
}
