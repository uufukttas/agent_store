import { describe, expect, it } from "vitest";
import { createCatalog } from "@/lib/ma/tools/catalog";
import { createLeadGenPack } from "@/lib/packs/lead-gen";
import { runSaveLead, toLeadInput } from "@/lib/packs/lead-gen/save-lead";
import { MemoryLeadsRepo, makeRun } from "../helpers/memory-repo";

const valid = {
  company_name: "Kuzey Antrepo Lojistik",
  website: "https://www.KuzeyAntrepo.example/hakkimizda",
  city: "İstanbul",
  employee_estimate: 118,
  contact_name: "Selin Karaca",
  contact_role: "Operasyon Direktörü",
  score: 82,
  rationale: [
    { signal: "Kariyer sayfasında 3 operasyon asistanı ilanı", points: 20, source_index: 0 },
    { signal: "Sevkiyat sorgusu form ile alınıyor", points: 25, source_index: 1 },
  ],
  sources: [
    {
      url: "https://kuzeyantrepo.example/kariyer",
      title: "Kariyer",
      quote: "Operasyon Asistanı (3 pozisyon), Tuzla.",
    },
    {
      url: "https://kuzeyantrepo.example/iletisim",
      quote: "Sevkiyat sorgunuzu aşağıdaki form ile iletin.",
    },
  ],
};

const ctx = () => ({ repo: new MemoryLeadsRepo(), run: makeRun() });

describe("toLeadInput", () => {
  it("geçerli girdiyi çevirir ve alan adını normalleştirir (küçük harf, www yok, yol yok)", () => {
    const r = toLeadInput(valid);
    expect(r.ok && r.lead.domain).toBe("kuzeyantrepo.example");
    expect(r.ok && r.lead.sources).toHaveLength(2);
    expect(r.ok && r.lead.scoreRationale[0]).toEqual({
      signal: valid.rationale[0]!.signal,
      points: 20,
      sourceIndex: 0,
    });
  });

  it("şemasız alan adını da kabul eder", () => {
    const r = toLeadInput({ ...valid, website: "kuzeyantrepo.example" });
    expect(r.ok && r.lead.domain).toBe("kuzeyantrepo.example");
  });

  it("kaynaksız lead'i reddeder", () => {
    const r = toLeadInput({ ...valid, sources: [] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.join()).toMatch(/kaynak/);
  });

  it("alıntısız veya çok kısa alıntılı kaynağı reddeder", () => {
    expect(toLeadInput({ ...valid, sources: [{ url: "https://a.example/x" }] }).ok).toBe(false);
    expect(
      toLeadInput({ ...valid, sources: [{ url: "https://a.example/x", quote: "kısa" }] }).ok,
    ).toBe(false);
  });

  it("gerekçesiz lead'i reddeder", () => {
    expect(toLeadInput({ ...valid, rationale: [] }).ok).toBe(false);
  });

  it("rationale.source_index sources dışındaysa reddeder", () => {
    const r = toLeadInput({
      ...valid,
      rationale: [{ signal: "x işareti", points: 5, source_index: 5 }],
    });
    expect(!r.ok && r.errors.join()).toMatch(/source_index/);
  });

  it.each(["https://www.linkedin.com/company/x", "linkedin.com/company/x", "tr.linkedin.com/x"])(
    "LinkedIn'i website olarak reddeder: %s",
    (website) => {
      const r = toLeadInput({ ...valid, website });
      expect(!r.ok && r.errors.join()).toMatch(/LinkedIn/);
    },
  );

  it("LinkedIn'i kaynak olarak reddeder", () => {
    const r = toLeadInput({
      ...valid,
      sources: [{ url: "https://linkedin.com/in/x", quote: "yeterince uzun bir alıntı" }],
    });
    expect(!r.ok && r.errors.join()).toMatch(/LinkedIn/);
  });

  it.each(["10.0.0.1", "localhost", "tek-kelime", "", "http://"])(
    "geçersiz alan adını reddeder: %s",
    (website) => {
      expect(toLeadInput({ ...valid, website }).ok).toBe(false);
    },
  );

  it("http(s) olmayan kaynak adresini reddeder", () => {
    const r = toLeadInput({
      ...valid,
      sources: [{ url: "ftp://a.example/x", quote: "yeterince uzun bir alıntı" }],
    });
    expect(r.ok).toBe(false);
  });

  it.each([-1, 101, 82.5])("geçersiz puanı reddeder: %s", (score) => {
    expect(toLeadInput({ ...valid, score }).ok).toBe(false);
  });
});

describe("runSaveLead", () => {
  it("geçerli lead'i kaydeder ve agent'a onay metni döner", async () => {
    const c = ctx();
    const out = await runSaveLead(valid, c);
    expect(out.isError).toBe(false);
    expect(out.text).toContain("Kaydedildi");
    expect(c.repo.leads.get("kuzeyantrepo.example")?.score).toBe(82);
  });

  it("aynı alan adını ikinci kez kaydedince çoğaltmaz, günceller ve kaynakları birleştirir", async () => {
    const c = ctx();
    await runSaveLead(valid, c);
    const out = await runSaveLead(
      {
        ...valid,
        score: 90,
        sources: [{ url: "https://kuzeyantrepo.example/yeni", quote: "yeni bir sayfadan alıntı" }],
        rationale: [{ signal: "yeni işaret", points: 10, source_index: 0 }],
      },
      c,
    );
    expect(out.text).toContain("güncellendi");
    expect(c.repo.leads.size).toBe(1);
    const lead = c.repo.leads.get("kuzeyantrepo.example")!;
    expect(lead.score).toBe(90);
    expect(lead.sources.map((s) => s.url)).toEqual([
      "https://kuzeyantrepo.example/kariyer",
      "https://kuzeyantrepo.example/iletisim",
      "https://kuzeyantrepo.example/yeni",
    ]);
  });

  it("geçersiz girdide kaydetmez, agent'a düzeltebileceği hata listesi döner", async () => {
    const c = ctx();
    const out = await runSaveLead({ ...valid, sources: [] }, c);
    expect(out.isError).toBe(true);
    expect(out.text).toMatch(/düzeltip tekrar dene/);
    expect(c.repo.leads.size).toBe(0);
  });
});

describe("lead-gen paketi", () => {
  it("katalog dışı aracı reddeder ve izinli araçları söyler", async () => {
    const catalog = createCatalog([createLeadGenPack(new MemoryLeadsRepo())]);
    const out = await catalog.execute("send_email", {}, { run: makeRun() });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("save_lead");
  });
});
