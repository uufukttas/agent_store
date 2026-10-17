# GradeUp Agent Platformu — Başlangıç Planı

> **P0 notu (2026-10-15):** Bu belge repoya `plan.md` olarak taşındı, içerik özgün planla aynıdır. Alınan kararlar `docs/adr/` altındadır (0001–0003). Tasarım prototipi `docs/tasarim/prototip/index.html`. Yapılacak kararlar için "Açık sorular" bölümüne bakın.
>
> **Kapsam notu (2026-10-17):** Ürün tanımı "müşteri bulma aracı"ndan "otomasyon agent paneli"ne genişletildi; müşteri bulma birinci pakettir. Ayrıntı Context bölümünde, ADR 0005 ile kayda geçecek (0004 tasarım sistemine ayrılmış).

## Context

Web sitesi lansmana hazır. Sıradaki iş GradeUp'ın kendi agent platformu: ekibin **doğal dille tarif ederek agent oluşturduğu, çalıştırdığı ve izlediği bir panel**. Ürün, otomatize edilmesi gereken süreçlerin geneli için bir **otomasyon agent paneli**dir; yalnızca müşteri bulmaya özel değildir. İlk kullanıcı GradeUp ekibinin kendisi, ilk iş alanı (**birinci paket**) **müşteri bulma**. Bu aşama hem ekibin tecrübe kazanacağı bir alan hem de sistemin sahadaki ilk denemesi. Sonraki aşamalarda başka iş alanları paket olarak eklenecek, ileride müşterilere açılacak.

### Ürün çerçevesi: iki katman

1. **Platform çekirdeği (iş alanından bağımsız):** agent ve versiyonlar, çalıştırmalar, araç kataloğu, onay kuyruğu, bütçe ve zamanlama, maliyet kaydı (`usage_ledger`), `org_id`.
2. **Alan paketleri:** her paket kendi araçlarını, kayıt türlerini ve ekranlarını getirir. **Birinci paket müşteri bulma:** `save_lead`, `draft_outreach`, `log_reply_classification`, Lead'ler ekranı. Yeni bir otomasyon için yeni uygulama yazılmaz; mevcut araçlarla agent tarif edilir ya da kataloğa araç eklenir.

İlkeler:
- **Araç risk seviyeleri:** salt okuma (serbest), iç yazma (serbest, loglanır), dış etkili (e-posta gönderme, ödeme, dış sistem güncelleme: her zaman insan onayı). "Hiçbir şey kendiliğinden gönderilmez" kuralı tüm paketler için geçerlidir.
- **Başarı ölçütü agent'a aittir:** "maliyet / başarılı çıktı"; neyin başarı sayıldığını AgentSpec tanımlar. Müşteri bulmada bu "maliyet / lead" ve "maliyet / onaylanan taslak"tır.
- **Soyutlama ikinci kullanım alanı görülene kadar çekirdekte tutulur:** ortak model yalnızca çekirdeğin ihtiyacı kadar genel olur, alan verisi paket içinde kalır.
- **Kabul hâlâ somut bir işle yapılır** (P1: 20 şirketlik çalıştırma); genel hedef P1'i geciktirmez.
- Dış sistemlere bağlanma (CRM, e-posta, ERP) kimlik bilgisi saklama ve bağlayıcı konularını açar; bu ayrı bir ADR ve onay gerektirir.

Bilinenler:
- **Repo:** Kullanıcı kendisi kuracak (private). Bu plan, repo hazır olunca oraya `plan.md` ve ADR'lar olarak taşınır. Web sitesi reposuna dokunulmaz.
- **LLM:** Claude.
- **Ücretlendirme modeli belli değil:** agent başına, aylık abonelik ya da kullandığın kadar öde. İlk aşama iç kullanım olduğu için bu kararın şimdi verilmesi gerekmiyor. Ama her çalıştırmanın maliyeti baştan kaydedilir, böylece üç model de sonradan gerçek verilerle hesaplanabilir (Q1).
- **Çalışma düzeni web sitesiyle aynı:** milestone'lar, ADR'lar, her adım öncesinde onay, git işlemlerinde kullanıcı onayı, `.env.example`, CI.

## Önerilen mimari

```
Panel (Next.js, TypeScript)           Anthropic Managed Agents
 ├─ Agent Oluşturucu ──spec──▶ agents.update (versiyonlu agent)
 ├─ Çalıştır / Zamanla ──────▶ sessions.create (+ budget) / scheduled deployments
 ├─ Webhook alıcı ◀──────────  session olayları (custom tool çağrıları, idle, usage)
 ├─ Onay kuyruğu  ──────────▶ user.custom_tool_result (onaylandı / reddedildi)
 └─ Postgres: agents, agent_versions, runs, leads, drafts, approvals, usage_ledger
```

**Neden Managed Agents (MA):** Agent döngüsünü ve çalışma ortamını Anthropic yürütür. Bizim tarafta kuyruk, worker ya da uzun süre çalışan bir sunucu gerekmez, panel serverless kalabilir. MA'nın sağladıkları:
- **Versiyonlu agent yapılandırmaları:** "taslak → test → yayın" akışı ve geri alma.
- **Zamanlanmış çalıştırma (scheduled deployments):** "her sabah 50 şirket tara" gibi işler için.
- **Oturum bütçesi (session budget):** çalıştırma başına sert dolar limiti.
- **`usage.list_cost`:** çalıştırma başına gerçek maliyet.

Alternatif olarak Messages API ile kendi döngümüzü yazabilirdik (Tool Runner). Bu durumda kuyruk ve worker altyapısını biz kurup işletmek zorunda kalırdık. Bu yol yalnızca MA bir ihtiyacı karşılayamazsa değerlendirilir (ADR 0001).

**Model:** Varsayılan `claude-opus-5-5`. Agent Oluşturucu ve agent'lar bu modelle çalışır, `effort` ayarı açıkça belirtilir. Toplu okuma işleri için daha ucuz bir worker modeli (Haiku 5.5) ancak ölçümle kanıtlanırsa ve onayla devreye girer.

**Araçlar:**
- **Sunucu araçları:** `web_search` ve `web_fetch`. Şirket ve web sitesi araştırması için.
- **Custom tool'lar** (panel çalıştırır, bütün yan etkiler bizim kontrolümüzde):
  - `save_lead`: şirket ve kişi kaydı, puan, kaynak bağlantıları
  - `draft_outreach`: yalnızca taslak üretir, **hiçbir şey göndermez**
  - `request_approval`: taslağı veya riskli bir adımı onay kuyruğuna koyar
  - `log_reply_classification`: gelen yanıtları sınıflandırır
- Gönderim (e-posta) ilk sürümde **hep insan eliyle** yapılır. Otomatik gönderim, yasal netlik (Q3) sağlanmadan açılmaz.
- LinkedIn'den veri kazıma (scraping) ve otomasyon yapılmaz (platform kurallarına aykırı). LinkedIn için yalnızca elle gönderilecek mesaj taslakları hazırlanır.

**Doğal dille agent oluşturma (Agent Oluşturucu):**
1. Ekip süreci yazıyla anlatır. Örnek: "İstanbul'daki 50–250 kişilik lojistik firmalarını bul, sitelerinde otomasyon ihtiyacı işaretlerini puanla, ilk 10'a e-posta taslağı hazırla".
2. Claude, structured output ile bunu bir **AgentSpec**'e çevirir:
   - amaç
   - sistem prompt'u
   - araç izin listesi (yalnızca katalogdaki araçlar)
   - girdi şeması
   - zamanlama
   - onay noktaları
   - çalıştırma bütçesi
   - başarı kriterleri
3. Panel spec'i okunabilir biçimde ve bir önceki sürümle farkıyla gösterir. Ekip düzenler.
4. **Deneme çalıştırması (dry-run):** Agent küçük bir girdiyle ve düşük bütçeyle çalışır, custom tool'lar test tablolarına yazar.
5. Ekip sonucu onaylarsa "Yayınla" ile agent'ın yeni versiyonu kaydedilir. Çalışmakta olan oturumlar eski versiyonla devam eder, gerektiğinde geri alınabilir.

**Maliyet kaydı (ücretlendirme kararından bağımsız):** Her çalıştırma bittiğinde `usage_ledger`'a şunlar yazılır:
- agent ve versiyon
- token dağılımı
- web arama sayısı
- `list_cost`
- süre
- üretilen lead ve taslak sayısı

Panelde agent bazında "maliyet / lead" ve "maliyet / onaylanan taslak" görünür. Q1 (ücretlendirme) bu verilerle kararlaştırılır.

**Önerilen yığın:** Web sitesinden bilinen yığın: Next.js App Router, TypeScript strict, Tailwind, zod, Vitest, Playwright. Bunlara ek olarak:
- `@anthropic-ai/sdk`
- Postgres: Supabase ya da Neon, ücretsiz katmanda
- Kimlik doğrulama: Supabase Auth ya da Auth.js, e-posta ile giriş, yalnızca `@gradeup.solutions` adresleri
- Barındırma: Netlify ya da Vercel, ücretsiz katmanda

Ücretli olan tek kalem Anthropic API kullanımı. Ücretli bir servis gerekirse önce onaya sunulur.

**Veri modelinin ileriye hazırlığı:** Her tabloda baştan `org_id` alanı bulunur. İlk aşamada tek bir org (GradeUp) olur. Müşterilere açılırken şema değişmez, yalnızca satır düzeyinde güvenlik (RLS) ve faturalama eklenir.

## Tasarım

Panel bir pazarlama sitesi değil, ekibin her gün saatlerce kullanacağı bir iş aracı. Bu yüzden tasarımda öncelik görsel etki değil; yoğun bilgiyi okunur kılmak, hızlı aksiyon almak ve agent'ın ne yaptığını şeffaf göstermek.

**Marka temeli (web sitesinden devralınır, M8'de seçilen B yönü):**
- Renkler: indigo vurgu `#4338ca` / `#a5b4fc`, stone tonlarında nötrler (`#1c1917`, `#57534e`, `#e7e0d6`), sıcak kırık beyaz `#fffdf9`
- Font: başlıklarda Sora
- Açık ve koyu tema
- WCAG AA kontrast

Sitedeki token'lar (`src/app/globals.css`, `src/lib/brand.ts`) yeni repoda tek bir token dosyasına taşınır. Uygulama arayüzü için şu uyarlamalar yapılır:
- **Gövde metni ve tablolar:** Inter gibi, okunurluğu yüksek ve sayıları eşit genişlikte (tabular) gösteren bir font. Sora yoğun tablolarda yorucu olur.
- **Daha sıkı ölçüler:** 4px tabanlı boşluk sistemi, 13–14px gövde metni.
- **Anlam renkleri:** başarı, uyarı, hata ve "onay bekliyor" için ayrı renkler. Hepsi iki temada da AA kontrastında.

**Bileşen temeli:** shadcn/ui (Radix + Tailwind v4). Ücretsiz; bileşenlerin kodu doğrudan repoya kopyalandığı için tamamen bizim kontrolümüzde. Erişilebilir hazır parçalar sunuyor: tablo, dialog, komut paleti, form, toast. Yeni bağımlılık olduğu için gerekçesi ADR'a yazılır.

**Ana ekranlar ve tasarım ilkeleri:**

| Ekran | İçerik | İlke |
|---|---|---|
| Genel bakış | Bugünkü çalıştırmalar, onay bekleyenler, bu ayın maliyeti, lead başına maliyet | İlk bakışta "beni ne bekliyor" sorusunun cevabı |
| Agent'lar | Liste, durum, son çalıştırma, versiyon | Her agent'ın maliyeti ve başarısı yan yana |
| Agent Oluşturucu | Solda doğal dil tarifi, sağda oluşan AgentSpec (okunur kartlar), versiyon farkı, "Dene" / "Yayınla" | Kullanıcı neyi onayladığını açıkça görür, yapılandırma ham JSON olarak gösterilmez |
| Çalıştırma detayı | Canlı zaman çizelgesi: hangi aramayı yaptı, hangi sayfayı okudu, neyi kaydetti; kaynak bağlantıları; anlık maliyet ve bütçe çubuğu | Şeffaflık: her sonuç kaynağına bağlanır |
| Lead'ler | Filtrelenebilir tablo, puan, puanın gerekçesi, kaynaklar, durum | Yoğun ama taranabilir |
| Onay kuyruğu | Taslak, ilgili lead'in bağlamı, onayla / düzenle / reddet | Klavye kısayollarıyla hızlı inceleme (J/K/A/R) |
| Maliyet | Agent ve versiyon bazında maliyet, lead ve onaylanan taslak başına maliyet | Q1 (ücretlendirme) kararının veri kaynağı |

Boş, yükleniyor ve hata durumları her ekran için ayrıca tasarlanır. Mobilde yalnızca onay kuyruğu ve genel bakış tam çalışır, diğer ekranlar masaüstü önceliklidir.

**Dil:** Arayüz şimdilik yalnızca Türkçe. Metinler yine de baştan mesaj dosyalarında tutulur (sitedeki 11. kural), böylece müşterilere açılırken İngilizce eklemek kolay olur.

**Süreç (M8'de tema seçerken izlediğimiz yol):** Kod yazmadan önce 2–3 tasarım yönü hazırlanır. Her biri aynı üç ekranla gösterilir: Genel bakış, Çalıştırma detayı, Onay kuyruğu. Yönler, gerçekçi örnek verilerle doldurulmuş, tıklanabilir statik prototipler olarak sunulur. Sen birini seçersin, sonra token dosyası ve bileşen kütüphanesi kurulur.

## Milestone'lar

| # | Kapsam | Kabul |
|---|---|---|
| P0 | Repo iskeleti: lint, typecheck, test, CI, `.env.example`, `plan.md`. ADR 0001 (MA), 0002 (veri modeli), 0003 (kimlik doğrulama) | CI yeşil, boş panel giriş sonrası açılıyor |
| D | **Tasarım:** 2–3 yön, her biri 3 ekranlık tıklanabilir prototiple; seçim; token dosyası, shadcn/ui kurulumu, temel düzen (kenar menüsü, üst çubuk, komut paleti), açık/koyu tema. ADR 0004 (tasarım sistemi) | Seçilen yön onaylı; token'lar ve temel bileşenler repoda; axe AA testleri yeşil |
| P1 | **Tek agent, elle tanımlı:** "Lead Araştırmacı". web_search/fetch ile `save_lead`. Panelde çalıştır, oturum olaylarını webhook'la izle, lead listesi, `usage_ledger` | 20 şirketlik bir çalıştırma bütçe içinde tamamlanıyor, lead'ler kaynaklarıyla kayıtlı, maliyet görünüyor |
| P2 | **Taslak ve onay:** `draft_outreach` ve onay kuyruğu (onayla / düzenle / reddet). Onaylanan taslak elle gönderilmek üzere kopyalanır | Hiçbir dış gönderim otomatik değil, her taslağın onay kaydı var |
| P3 | **Agent Oluşturucu:** doğal dil → AgentSpec → farkı göster → deneme çalıştırması → yayınla (versiyonlu). Araç kataloğu ve izin listesi | P1 agent'ı Oluşturucu ile yeniden üretilebiliyor, versiyon geri alınabiliyor |
| P4 | **Zamanlama ve yanıtlar:** scheduled deployments, gelen yanıtların sınıflandırılması (önce elle yapıştırarak, sonra e-posta entegrasyonu), takip hatırlatmaları | Günlük çalıştırma kendiliğinden tetikleniyor, başarısız olursa uyarı geliyor |
| P5 | **Kalibrasyon:** her agent için küçük bir değerlendirme seti (evals), prompt ve `effort` ayarı, maliyet/kalite raporu. Q1 için veri özeti | Her agent'ın ölçülmüş bir kalite skoru ve lead başına maliyeti var |

## Açık sorular (repoda `plan.md` Bölüm 4'e taşınır)

- **Q1 — Ücretlendirme modeli:** agent başına, abonelik ya da kullandığın kadar öde. P5 sonunda maliyet verileriyle karar verilir, şimdi gerekmiyor.
- **Q2 — Anthropic hesabı:** Kurumsal bir API hesabı ve anahtarı gerekiyor (Claude aboneliği bu iş için kullanılamaz). Aylık harcama limiti ve çalıştırma başına varsayılan bütçe belirlenmeli.
- **Q3 — Hukuk (KVKK ve ticari ileti):** Lead verileri kişisel veri içeriyor (karar verici adı, iş e-postası). Saklama süresi ve aydınlatma metni netleşmeli. Soğuk e-postanın 6563 sayılı kanun ve İYS açısından durumu da netleşmeli. Bu yüzden ilk sürümde gönderim elle yapılır. Hukuk birimine sorulacak.
- **Q4 — Hedefleme:** P1 için ilk hedef sektör, şehir ve şirket büyüklüğü. Kullanıcı belirleyecek.

## Doğrulama

- Her milestone sonunda `format:check`, `lint`, `typecheck` ve `test` komutları çalıştırılır. P1'den itibaren Playwright e2e testleri de eklenir.
- Anthropic API'sine birim testlerde gidilmez (mock'lanır). Gerçek çalıştırmalar yalnızca bütçeli oturumlarla ve onayla yapılır, çünkü her biri gerçek maliyet doğurur.
- P1 ve sonrasında uçtan uca kontrol için önce panelden düşük bütçeli bir çalıştırma başlatılır, ardından şunlar kontrol edilir:
  1. Webhook olayları geliyor mu
  2. `leads` ve `usage_ledger` dolu mu
  3. Maliyet panelde görünüyor mu
  4. Bütçe aşılınca oturum `budget_reached` ile duruyor mu
- P2'de dış dünyaya hiçbir otomatik gönderim yapılmadığı testle kanıtlanır.

## İlk adım (onaydan sonra)

Repo hazır olunca bağlantısını paylaşırsın. P0'ı plan mode ile başlatırım: `plan.md`, ADR 0001–0003 ve iskelet. Hepsini onayına sunarım.
