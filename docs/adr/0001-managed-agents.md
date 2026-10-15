# 0001 — Agent çalıştırma altyapısı olarak Managed Agents

- **Durum:** Kabul edildi (P1 öncesi doğrulama koşuluyla)
- **Tarih:** 2026-10-15
- **Milestone:** P0

## Bağlam

Platformun ilk işi müşteri bulma: agent'lar web'de araştırma yapar, lead kaydeder, e-posta taslağı hazırlar. Bu işler dakikalar sürer, bütçe sınırı ve insan onayı gerektirir. Panel Next.js ile serverless çalışacak; uzun süre ayakta kalan bir sunucu veya iş kuyruğu işletmek istemiyoruz. İlk kullanıcı GradeUp ekibi, ileride müşterilere açılacak.

## Karar

Agent döngüsünü ve çalışma ortamını **Anthropic Managed Agents (MA)** yürütür. Panel yalnızca şunları yapar:

- agent yapılandırmasını (AgentSpec) MA'ya versiyonlu olarak yazar,
- oturum başlatır (çalıştırma başına dolar bütçesiyle),
- oturum olaylarını webhook ile alır,
- custom tool çağrılarını (`save_lead`, `draft_outreach`, `request_approval`, `log_reply_classification`) kendi tarafında çalıştırır. Bütün yan etkiler bizim kontrolümüzde kalır.

Sunucu araçları olarak `web_search` ve `web_fetch` kullanılır. Varsayılan model `claude-opus-5-5`, `effort` ayarı her agent'ta açıkça belirtilir. Daha ucuz bir worker modeli yalnızca ölçümle kanıtlanırsa ve onayla devreye girer.

Gönderim ilk sürümde hep insan eliyle yapılır; hiçbir custom tool dış dünyaya mesaj göndermez. LinkedIn verisi kazınmaz, yalnızca elle gönderilecek taslak hazırlanır.

**Doğrulama koşulu:** Bu kararın dayandığı MA yetenekleri (versiyonlu agent, zamanlanmış çalıştırma, oturum bütçesi, `usage.list_cost`, webhook olayları) plan aşamasında belirlendi. P1'e başlamadan önce güncel API belgesinden tek tek doğrulanır. Biri karşılanmıyorsa bu ADR güncellenir ve alternatif değerlendirilir.

## Alternatifler

- **Messages API + kendi döngümüz (Tool Runner):** Tam kontrol sağlar, ancak kuyruk, worker, yeniden deneme, zamanlama ve bütçe sınırlamasını biz kurup işletmemiz gerekir. Yalnızca MA bir ihtiyacı karşılayamazsa değerlendirilir.
- **Üçüncü taraf agent çerçeveleri:** Ek bağımlılık ve ek faturalama getirir, Claude'a özgü yeteneklerin gerisinde kalabilir. Gerekçe oluşmadığı için reddedildi.

## Sonuçlar

- Panelde kuyruk veya worker yok. Webhook alıcı ve onay kuyruğu panelin parçası.
- Her çalıştırmanın maliyeti `usage_ledger`'a yazılır (agent ve versiyon, token dağılımı, arama sayısı, `list_cost`, süre, lead ve taslak sayısı). Ücretlendirme kararı (Q1) bu verilerle verilir.
- Anthropic'e bağımlılık artar. Agent tanımları AgentSpec olarak kendi veritabanımızda da saklanır, böylece MA'dan çıkış mümkün kalır.
- Kurumsal Anthropic API hesabı ve anahtarı gerekir (Q2). `ANTHROPIC_API_KEY` P1'de zorunlu hale gelir.
- Birim testlerde Anthropic API'sine gidilmez (mock). Gerçek çalıştırmalar yalnızca bütçeli oturumlarla ve onayla yapılır.
