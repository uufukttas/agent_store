import { z } from "zod";

// Boş string (.env.example'daki boş satırlar) eksik sayılır.
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);
const required = z.string().trim().min(1);
const optional = z.preprocess(emptyToUndefined, z.string().trim().min(1).optional());
const optionalSecret = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(16, "en az 16 karakter olmalı").optional(),
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
  // Webhook imza anahtarı (`whsec_...`, Console'da uç nokta oluşturulurken bir kez gösterilir).
  ANTHROPIC_WEBHOOK_SIGNING_KEY: optionalSecret,
  // Uzlaştırma uç noktasını çağıran zamanlanmış fonksiyonun taşıdığı gizli anahtar.
  CRON_SECRET: optionalSecret,
  // Çalıştırma başına varsayılan bütçe (sent). Yazım hatası maliyete dönüşmesin diye 100 dolara kadar.
  RUN_DEFAULT_BUDGET_CENTS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(10).max(10_000).default(400),
  ),
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

type OptionalSecretName = "ANTHROPIC_API_KEY" | "ANTHROPIC_WEBHOOK_SIGNING_KEY" | "CRON_SECRET";

/**
 * P0'da boş kalabilen anahtarlar, ilgili özellik çalışırken zorunludur. Eksikse hangisinin
 * eksik olduğunu söyler; değeri hata mesajına yazmaz.
 */
export function requireSecret(name: OptionalSecretName, source: Source = process.env): string {
  const value = parse(
    serverSchema.pick({ [name]: true } as Record<OptionalSecretName, true>),
    source,
    "sunucu",
  )[name];
  if (!value) throw new Error(`${name} tanımlı değil. Bkz. .env.example`);
  return value;
}

/** Yalnızca sunucuda çağır. Tarayıcıda çağrılırsa hata verir, anahtar sızmaz. */
export function getServerEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv istemcide çağrılamaz.");
  }
  return parseServerEnv(process.env);
}
