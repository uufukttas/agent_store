# 0002 — Veri modeli ve çok kiracılığa hazırlık

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-15
- **Milestone:** P0

## Bağlam

İlk aşamada tek org var (GradeUp). Ancak platform ileride müşterilere açılacak. Şemayı o zaman değiştirmek, canlı veriyle yapılan en riskli göç türüdür. Veritabanı olarak Supabase (Postgres) kullanılıyor; `public` şemasındaki tablolar anon anahtarıyla API üzerinden erişilebilir olduğundan, RLS'siz tablo herkese açık demektir.

## Karar

1. **Her tabloda `org_id`:** `orgs` dışındaki her tablo `org_id uuid not null references public.orgs` alanı taşır. İlk aşamada tek satır var: `gradeup` (`0002_orgs.sql`).
2. **RLS varsayılan kapalı erişim:** `public` şemasındaki her tablo `enable row level security` ile oluşturulur. Politika yoksa `anon` ve `authenticated` roller erişemez; yalnızca sunucudaki service role (RLS'i atlar) erişir. Politikalar tabloyla birlikte, ihtiyaç doğdukça eklenir.
3. **Kuralı test zorlar:** `tests/unit/migrations.test.ts`, migration'lardaki her tablonun RLS'ini ve `org_id` alanını denetler. Kuralı unutan migration CI'da kırılır.
4. **Service role yalnızca sunucuda:** `SUPABASE_SERVICE_ROLE_KEY` hiçbir zaman `NEXT_PUBLIC_` öneki almaz. `getServerEnv` istemcide çağrılırsa hata verir (`src/lib/env.ts`).
5. **Migration'lar `supabase/migrations/`:** sıralı numaralı SQL dosyaları, geri alınmaz; düzeltme yeni migration ile yapılır.
6. **Planlanan tablolar** (P1 ve sonrası): `agents`, `agent_versions`, `runs`, `leads`, `drafts`, `approvals`, `usage_ledger`. Her biri yukarıdaki kurallara uyar.

Müşterilere açılırken şema değişmez; yalnızca satır düzeyinde politikalar (`org_id` üyeliğine göre) ve faturalama eklenir.

## Ertelenenler

- Kullanıcının hangi org'a ait olduğunu tutan üyelik tablosu ve RLS okuma politikaları. İlk gerçek tabloyla birlikte P1'de tasarlanır; P0'da uygulama `orgs` tablosunu hiç okumaz.
- Lead verilerinin saklama süresi ve silme akışı, KVKK netliğine (Q3) bağlıdır.

## Alternatifler

- **`org_id`'yi sonradan eklemek:** İlk aşamada daha basit görünür, ama canlı veriyle şema göçü gerektirir. Reddedildi.
- **Her org için ayrı şema veya veritabanı:** İzolasyon güçlüdür, fakat bu ölçekte işletme yükü ve maliyet gereksizdir.
- **RLS'i sonra açmak:** Tablolar anon anahtarıyla açık kalma riski taşır. Reddedildi.
- **Neon (saf Postgres):** Auth ve RLS entegrasyonunu biz kurardık. Supabase tek serviste ikisini de sunduğu için seçilmedi (bkz. 0003).

## Sonuçlar

- Her yeni tablo biraz daha çok SQL yazmayı gerektirir (RLS, `org_id`); karşılığında müşteriye açılış sırasında şema göçü gerekmez.
- Sunucu kodu veriye service role ile eriştiği için, org sınırı bu aşamada uygulama kodunda gözetilir. Müşteri erişimi açılmadan önce politikalar yazılır ve ayrı testle doğrulanır.
