# 0003 — Kimlik doğrulama

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-15
- **Milestone:** P0

## Bağlam

İlk kullanıcılar yalnızca GradeUp ekibi. Panel agent'ları çalıştırır, lead ve kişi verisi gösterir, bütçe harcatır; yetkisiz erişim hem maliyet hem KVKK riski taşır. Müşterilere açılma ileride, o zaman ekstra gereksinimler (davet, org üyeliği) doğacak.

## Karar

- **Supabase Auth, e-posta ve parola** (`@supabase/ssr`). Giriş sunucu tarafında bir server action ile yapılır. Parolayı biz saklamayız, Supabase yönetir.
- **Kayıt ekranı yok.** Hesaplar Supabase panelinden elle açılır ("Allow new users to sign up" kapalı).
- **Alan adı kısıtı, üç katmanda** (izinli alan adı `ALLOWED_EMAIL_DOMAIN`, varsayılan `gradeup.solutions`):
  1. **Giriş formu:** `src/app/login/actions.ts`, parola denemesinden önce ve Supabase'in döndürdüğü e-postayla tekrar kontrol eder.
  2. **`src/proxy.ts`:** Her istekte oturumu `getUser()` ile doğrular (çerezdeki değere güvenmez). Girişsiz veya izinsiz alan adlı kullanıcıyı oturumu kapatıp `/login`'e yollar.
  3. **Veritabanı:** `0001_auth_domain_guard.sql`, `auth.users` üzerinde trigger ile izinsiz alan adının eklenmesini veya güncellenmesini reddeder. Uygulama atlansa bile geçerli kalır.
- **Alan adı kontrolü tam eşleşmedir** (`src/lib/auth/email.ts`): alt alan adı, benzer ad ve çift `@` reddedilir. Birim testle doğrulanır.
- **Hata mesajı hesap varlığını sızdırmaz:** yanlış e-posta ve yanlış parola aynı mesajı verir.

## Alternatifler

- **Auth.js + Neon:** Daha az satıcı kilidi, ama oturum yönetimi, parola akışı ve RLS bağlantısını biz kurardık. Müşteriye açılırken org üyeliği ve RLS ile doğal uyum için Supabase Auth seçildi.
- **Sihirli bağlantı (magic link):** Parola saklamayı gerektirmez, ancak ekip e-posta ve parolayı tercih etti. İleride eklenebilir.
- **Google ile giriş (OAuth):** Alan adı kısıtı kolaylaşırdı, fakat ek bir sağlayıcı yapılandırması gerektirir. Gerekçe oluşursa ayrı ADR ile değerlendirilir.
- **Yalnızca uygulama katmanında kısıt:** Doğrudan Supabase API'sine yapılan kayıt isteklerini durdurmaz. Veritabanı trigger'ı bu yüzden eklendi.

## Sonuçlar

- Her yeni ekip üyesi için hesabı biri elle açar. Bu ilk aşamada kabul edilebilir; müşterilere açılırken davet akışı gerekecek.
- İki ek bağımlılık: `@supabase/supabase-js`, `@supabase/ssr`. Ücretsiz katmanda.
- Trigger'daki alan adı SQL'de sabittir. Alan adı değişirse yeni bir migration ile fonksiyon güncellenir ve `ALLOWED_EMAIL_DOMAIN` ile birlikte değişmelidir.
- Parola politikası (uzunluk, sızmış parola kontrolü) Supabase panelindeki ayara bağlıdır; panel ayarı koddan doğrulanmaz.
