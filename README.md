# GradeUp Agent Platformu

GradeUp ekibinin doğal dille agent oluşturduğu, çalıştırdığı ve izlediği iç panel. İlk iş alanı müşteri bulma. Ayrıntılı plan: [`docs/plan.md`](docs/plan.md).

## Gereksinimler

- Node 22 (`.nvmrc`) ve pnpm 10 (`corepack enable` ile gelir)
- Bir Supabase projesi (ücretsiz katman yeterli)

## Kurulum

```bash
pnpm install
cp .env.example .env.local   # değerleri doldur
pnpm dev                     # http://localhost:3000
```

### Ortam değişkenleri

| Değişken                        | Açıklama                                                        |
| ------------------------------- | --------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase proje adresi                                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon anahtarı (herkese açık)                           |
| `SUPABASE_SERVICE_ROLE_KEY`     | Yalnızca sunucu. `NEXT_PUBLIC_` öneki **asla** alamaz           |
| `ALLOWED_EMAIL_DOMAIN`          | Girişe izin verilen alan adı, `@` olmadan (`gradeup.solutions`) |
| `ANTHROPIC_API_KEY`             | Kurumsal API anahtarı. P1'e kadar boş kalabilir                 |

Değerler `src/lib/env.ts` içinde zod ile doğrulanır; eksik veya hatalı değişkende uygulama hangisinin sorunlu olduğunu söyler.

### Supabase hazırlığı (bir kez)

1. SQL Editor'de `supabase/migrations/` altındaki dosyaları numara sırasıyla çalıştır.
2. Authentication → Sign In / Providers: **"Allow new users to sign up" kapalı** olmalı.
3. Authentication → Users → "Add user" ile `@gradeup.solutions` adresli hesapları aç.
4. Parola politikasını (minimum uzunluk, sızmış parola kontrolü) panelden sıkılaştır.

Giriş kısıtı üç katmandadır: giriş formu, `src/proxy.ts` ve veritabanı trigger'ı ([ADR 0003](docs/adr/0003-kimlik-dogrulama.md)).

## Komutlar

| Komut               | Ne yapar                                   |
| ------------------- | ------------------------------------------ |
| `pnpm dev`          | Geliştirme sunucusu                        |
| `pnpm build`        | Üretim derlemesi                           |
| `pnpm format:check` | Prettier denetimi (`pnpm format` düzeltir) |
| `pnpm lint`         | ESLint                                     |
| `pnpm typecheck`    | `next typegen` + `tsc --noEmit`            |
| `pnpm test`         | Vitest birim testleri                      |

Her milestone sonunda `format:check`, `lint`, `typecheck` ve `test` yeşil olmalıdır. CI aynı zinciri her PR'da çalıştırır. Birim testlerde Anthropic API'sine gidilmez.

## Yapı

```
src/app/            Sayfalar (giriş, panel)
src/lib/            env doğrulaması, auth ve Supabase yardımcıları
src/messages/       Arayüz metinleri (şimdilik yalnızca Türkçe)
src/proxy.ts        Oturum yenileme ve erişim kısıtı (Next 16)
supabase/migrations Sıralı SQL migration'ları
tests/unit/         Vitest testleri
docs/adr/           Mimari karar kayıtları
docs/tasarim/       Tasarım prototipi (karar öncesi referans)
```

## Barındırma

Netlify (ücretsiz katman). Derleme ayarları `netlify.toml` dosyasındadır; gizli değerler Netlify arayüzünden girilir, repoya yazılmaz.

## Çalışma düzeni

Milestone'lar ve ADR'lar `docs/` altındadır. Her adım öncesinde onay alınır; commit, push ve PR işlemleri kullanıcı onayıyla yapılır. Ücretli yeni bir servis gerekirse önce onaya sunulur. Tek ücretli kalem Anthropic API kullanımıdır.
