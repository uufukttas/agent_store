# 0005 — Ürün çerçevesi: platform çekirdeği ve alan paketleri

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-17
- **Milestone:** P1 öncesi

## Bağlam

Plan başlangıçta müşteri bulmaya odaklıydı: araç kataloğu (`save_lead`, `draft_outreach`, `log_reply_classification`), `leads` ve `drafts` tabloları, Lead'ler ekranı ve sabit bir "Lead Araştırmacı" agent'ı. Ürün hedefi ise ekibin otomatize etmek istediği süreçlerin geneli için bir agent paneli olmaktır; müşteri bulma bunun ilk kullanım alanıdır.

İki risk var. Müşteri bulmaya özel kurulan bir sistem ikinci iş alanında yeniden yazılır. Baştan "her şeyi yapan" bir platform kurmaya çalışmak ise P1'i geciktirir ve henüz görülmemiş ihtiyaçlar için yanlış soyutlamalar üretir.

## Karar

1. **İki katman.**
   - **Platform çekirdeği** iş alanından bağımsızdır: agent ve versiyonlar, çalıştırmalar, araç kataloğu, onay kuyruğu, bütçe ve zamanlama, `usage_ledger`, `org_id`.
   - **Alan paketleri** kendi araçlarını, kayıt türlerini ve ekranlarını getirir. Birinci paket **müşteri bulma**dır. Yeni bir otomasyon için yeni uygulama yazılmaz; mevcut araçlarla agent tarif edilir ya da kataloğa araç eklenir.

2. **Araç risk seviyeleri.** Her katalog aracı tam olarak bir seviye taşır:

   | Seviye            | Anlam                               | Örnek                                   | Kural                     |
   | ----------------- | ----------------------------------- | --------------------------------------- | ------------------------- |
   | `read`            | Dış dünyayı değiştirmez             | `web_search`, `web_fetch`               | Serbest                   |
   | `write_internal`  | Yalnızca kendi veritabanımıza yazar | `save_lead`, `draft_outreach`           | Serbest, loglanır         |
   | `external_effect` | Dış sistemi veya kişiyi etkiler     | e-posta gönderme, ödeme, CRM güncelleme | **Her zaman insan onayı** |

   Seviyesi belirtilmemiş araç kataloğa giremez. `external_effect` araç onaysız çalıştırılamaz; bu kural AgentSpec'te kapatılamaz ve testle kanıtlanır (plandaki P2 kabul testinin genellemesi). İlk sürümde `external_effect` seviyesinde hiçbir araç yoktur: gönderim hâlâ elle yapılır.

3. **Başarı ölçütü agent'a aittir.** Çekirdek "maliyet / lead" değil "maliyet / başarılı çıktı" hesaplar; neyin başarı sayıldığını AgentSpec tanımlar. Müşteri bulmada bu lead ve onaylanan taslaktır. `usage_ledger` ortak alanları (agent, versiyon, token, arama sayısı, liste fiyatıyla maliyet, süre) tutar; çıktı sayısı agent'ın tanımladığı ölçüt adıyla yazılır.

4. **Kayıt modeli: çekirdek genel, alan verisi pakette.** Çekirdek yalnızca çalıştırma, onay ve maliyet için ortak tablolara sahiptir. Alan verisi (müşteri bulmada `leads`, `drafts`) o paketin tablosunda kalır. Genel bir "kayıt" tablosu (tür + JSON alanlar) ancak ikinci paket ortak bir ihtiyacı kanıtlarsa değerlendirilir. Her paket tablosu 0002'deki kurallara uyar (`org_id`, RLS).

5. **Kabul somut bir işle yapılır.** P1 kabulü değişmez: 20 şirketlik çalıştırma bütçe içinde tamamlanır. Genel hedef P1'i geciktirmez; çekirdeğin sınırı, ikinci bir paket planlanana kadar müşteri bulmanın ihtiyaçlarıyla belirlenir.

6. **Dış sistem bağlantıları kapsam dışı.** CRM, e-posta veya ERP'ye bağlanmak kimlik bilgisi saklama, yetki sınırları ve bağlayıcı (MCP veya custom tool) konularını açar. Bu karar ayrı bir ADR ve onay gerektirir; bu ADR yalnızca `external_effect` seviyesinin kuralını sabitler.

## Ertelenenler

- Rol ve izin modeli: farklı ekipler farklı agent'ları görecekse üyelik tablosu ve roller gerekir (bkz. 0002, Ertelenenler). Bu, ikinci ekip veya paket gündeme geldiğinde tasarlanır.
- Paketlerin arayüzdeki sunumu (kenar menüsü gruplaması, paket bazlı ana sayfa) tasarım milestone'una (D) bırakılır.
- Paket ekleme/kaldırma mekanizması (kod içinde klasör mü, kayıtlı yapılandırma mı) ilk paketin içine bakılarak, ikinci paket planlanırken kararlaştırılır.

## Alternatifler

- **Yalnızca müşteri bulma aracı:** En hızlı yol, ama ikinci iş alanında araç katalogu, onay ve maliyet katmanları yeniden yazılır. Reddedildi.
- **Baştan tam genel platform (genel kayıt tablosu, eklenti sistemi, rol modeli):** Henüz görülmemiş ihtiyaçlar için soyutlama yapmak P1'i geciktirir ve büyük olasılıkla yanlış çıkar. Reddedildi; çekirdek yalnızca ihtiyaç duyulan kadar genel tutulur.
- **Her iş alanı için ayrı uygulama:** Onay, maliyet ve güvenlik kuralları kopyalanır ve birbirinden sapar. Reddedildi.

## Sonuçlar

- `plan.md` ürünü "otomasyon agent paneli" olarak tanımlar, müşteri bulma birinci pakettir.
- Araç kataloğunun her kaydında `risk` alanı zorunludur; testler eksik veya `external_effect` olup onaysız çalışan aracı yakalar.
- Müşteri bulmaya özel kod (`save_lead`, `leads`/`drafts` tabloları, Lead'ler ekranı) paket sınırında tutulur; çekirdek bunlara bağımlı olmaz. Mevcut P1 çalışması (`0003_agent_core.sql`, `src/lib/ma/`) bu sınıra göre gözden geçirilir.
- Ürün söylemi genişlediği için hukuk (Q3) ve harcama limiti (Q2) soruları her yeni paketle yeniden ele alınır.
