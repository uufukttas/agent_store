# 0001 — Agent çalıştırma altyapısı olarak Managed Agents

- **Durum:** Kabul edildi (2026-10-15'te Managed Agents belgesiyle doğrulandı, ilk gerçek çalıştırmada tekrar sınanacak)
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

## Doğrulama sonuçları (2026-10-15)

Karar, Managed Agents belgesine karşı (beta, `managed-agents-2026-04-01`) tek tek denetlendi. Belge canlı API'den değil, paketlenmiş referanstan okundu. Aşağıdaki tablo, ilk düşük bütçeli gerçek çalıştırmada (P1) bir kez daha sınanır.

**Doğrulananlar:** versiyonlu agent (`POST /v1/agents/{id}`, her güncelleme yeni değişmez versiyon, çalışan oturumlar eski versiyonda sürer), `sessions.create` içinde bütçe, zamanlanmış çalıştırma (`client.beta.deployments`), oturum `usage` alanı, custom tool akışı (`agent.custom_tool_use` ve `user.custom_tool_result`), agent `model` nesnesinde `effort`.

**Plandan ayrılan noktalar ve tasarıma etkisi:**

1. **Environment gerekli.** Her oturum bir `environment_id` ister. Ağ `unrestricted` kurulur: `limited` ağda `allowed_hosts` boşsa `web_search` ve `web_fetch` hiçbir sonuç döndürmez, hedef siteleri önceden listeleyemeyiz. Sandbox'ın kullanılmaması (`bash` ve dosya araçları kapalı) bu tercihin riskini azaltır. LinkedIn araç düzeyinde `blocked_domains` ile engellenir. Plan mimarisi buna göre güncellenir.
2. **Webhook yükü ince ve dayanıklı değil.** Yalnızca olay türü ve kaynak kimliği gelir; custom tool çağrısı veya maliyet gelmez. Akış: webhook gelir, oturum olayları çekilir, bekleyen çağrı çalıştırılır, `user.custom_tool_result` gönderilir. Olay en fazla üç kez denenir, sonra sessizce düşer ve sıra garantisi yoktur; bu yüzden periyodik bir **uzlaştırma işi** gerekir. Zamanlanmış çalıştırmalarda bağlı istemci yoktur, webhook cevap vermezse oturum sonsuza kadar bekler. Webhook yalnızca Console'dan kaydedilir, herkese açık HTTPS adresi ister ve imza anahtarı `ANTHROPIC_WEBHOOK_SIGNING_KEY` ortam değişkenidir.
3. **Bütçe aşılınca oturum sonlanmaz, duraklar.** `idle` durumuna geçer ve `stop_reason: budget_reached` verir; geçmiş korunur, bütçe değiştirilince devam eder. Tutar sent cinsinden metindir (4 dolar için `"400"`), yalnızca USD. Bütçe oturum oluşturulurken verilir, sonradan eklenemez, yalnızca değiştirilip kaldırılabilir. Kontrol her model isteğinden önce yapılır, bu yüzden son istek bütçeyi bir model isteği kadar aşabilir. Test ve arayüz bu davranışa göre yazılır.
4. **`list_cost` liste fiyatıyla maliyettir, faturalanan tutar değildir.** İndirimli faturanın üstünde ya da altında kalabilir. Web aramasının 1000'de 10 dolar, oturum çalışma süresinin saatte 0,08 dolar maliyeti hesaba girer; `web_fetch` ölçülmez. `usage_ledger` ve panel bu alanı "liste fiyatıyla maliyet" olarak adlandırır. Plandaki "gerçek maliyet" ifadesi bu anlamda okunur.
5. **"Yayınla" bizim tarafımızdaki bir işarettir.** Agent güncellenince "son versiyon" anında değişir; kısayolla (`agent: "agent_id"`) başlayan oturumlar ve zamanlanmış çalıştırmalar taslağı canlıya alır. Bu yüzden veritabanında `published_version` tutulur ve her oturum ile zamanlanmış çalıştırma `{type: "agent", id, version}` ile o versiyona sabitlenir. Deneme çalıştırması taslak versiyonu sabitler. Geri alma, işareti eski versiyona çekmektir.

**Araç kataloğu:** Dahili araç seti `bash`, dosya araçları ve web araçları dahil sekiz araçtır. Planın "yalnızca katalogdaki araçlar" kuralı için `bash`, `read`, `write`, `edit`, `glob` ve `grep` kapatılır, yalnızca `web_search` ve `web_fetch` alan adı filtresiyle açık bırakılır. Messages API'deki `max_uses` ve `citations` bu araçlarda yoktur.

**Effort:** Agent `model` nesnesinde `{id, effort}` olarak verilir. Oturum başına `model` geçersiz kılması nesneyi tamamen değiştirir, agent'ın `effort` değeri taşınmaz; geçersiz kılma yapılırsa `effort` onun içine yazılır. Claude Opus 5.5'te düşünme kapatılamaz ve varsayılan `effort` `medium`'dur, bu yüzden her agent'ta açıkça belirtilir.

## Alternatifler

- **Messages API + kendi döngümüz (Tool Runner):** Tam kontrol sağlar, ancak kuyruk, worker, yeniden deneme, zamanlama ve bütçe sınırlamasını biz kurup işletmemiz gerekir. Yalnızca MA bir ihtiyacı karşılayamazsa değerlendirilir.
- **Üçüncü taraf agent çerçeveleri:** Ek bağımlılık ve ek faturalama getirir, Claude'a özgü yeteneklerin gerisinde kalabilir. Gerekçe oluşmadığı için reddedildi.

## Sonuçlar

- Panelde kuyruk veya uzun süre çalışan worker yok. Webhook alıcı, onay kuyruğu ve periyodik bir uzlaştırma işi panelin parçası.
- Her çalıştırmanın liste fiyatıyla maliyeti `usage_ledger`'a yazılır (agent ve versiyon, token dağılımı, arama sayısı, `list_cost`, süre, lead ve taslak sayısı). Ücretlendirme kararı (Q1) bu verilerle verilir.
- Anthropic'e bağımlılık artar. Agent tanımları AgentSpec olarak kendi veritabanımızda da saklanır, böylece MA'dan çıkış mümkün kalır.
- Kurumsal Anthropic API hesabı ve anahtarı gerekir (Q2). `ANTHROPIC_API_KEY` P1'de zorunlu hale gelir.
- Birim testlerde Anthropic API'sine gidilmez (mock). Gerçek çalıştırmalar yalnızca bütçeli oturumlarla ve onayla yapılır.
