import { describe, expect, it } from "vitest";
import {
  deriveState,
  parseIdleStop,
  reconcileOpenRuns,
  syncRun,
  type SyncDeps,
} from "@/lib/ma/sync";
import type { StoredEvent } from "@/lib/ma/types";
import { FakeGateway, ev, zeroUsage } from "../helpers/fake-gateway";
import { createCatalog } from "@/lib/ma/tools/catalog";
import { createLeadGenPack } from "@/lib/packs/lead-gen";
import { MemoryLeadsRepo, MemoryRepo, makeRun } from "../helpers/memory-repo";

const lead = (domain: string, over: Record<string, unknown> = {}) => ({
  company_name: `Şirket ${domain}`,
  website: `https://${domain}`,
  score: 70,
  rationale: [{ signal: "Operasyon ilanı var", points: 20, source_index: 0 }],
  sources: [{ url: `https://${domain}/kariyer`, quote: "Operasyon Asistanı alımı yapıyoruz." }],
  ...over,
});

const NOW = new Date("2026-10-15T12:00:00.000Z");

function setup() {
  const gateway = new FakeGateway();
  const repo = new MemoryRepo();
  const leads = new MemoryLeadsRepo();
  const pack = createLeadGenPack(leads);
  const run = repo.addRun(makeRun());
  const logs: string[] = [];
  const deps: SyncDeps = {
    gateway,
    repo,
    tools: createCatalog([pack]),
    outcome: pack.outcome,
    now: () => NOW,
    log: (m) => logs.push(m),
  };
  return { gateway, repo, leads, run, deps, logs };
}

describe("syncRun", () => {
  it("bilinmeyen oturumu yok sayar", async () => {
    const { deps } = setup();
    expect(await syncRun(deps, "sesn_baskasi")).toEqual({
      synced: false,
      reason: "unknown_session",
    });
  });

  it("bekleyen save_lead çağrısını çalıştırır, sonucu bir kez gönderir ve run'ı running tutar", async () => {
    const { gateway, repo, leads, deps } = setup();
    gateway.status = "idle";
    gateway.events = [
      ev.toolUse("sevt_1", "save_lead", lead("a.example"), 1),
      ev.idle("sevt_2", { type: "requires_action", event_ids: ["sevt_1"] }, 2),
    ];

    const r = await syncRun(deps, "sesn_1");

    expect(r).toEqual({ synced: true, status: "running", toolCallsAnswered: 1 });
    expect(gateway.sent).toHaveLength(1);
    expect(gateway.sent[0]).toEqual([
      { toolUseId: "sevt_1", text: expect.stringContaining("Kaydedildi"), isError: false },
    ]);
    expect(leads.leads.has("a.example")).toBe(true);
    expect((await repo.listUnhandledToolUses("run-1")).length).toBe(0);
  });

  it("aynı olayı ikinci kez işlemez (idempotent)", async () => {
    const { gateway, leads, deps } = setup();
    gateway.status = "idle";
    gateway.events = [
      ev.toolUse("sevt_1", "save_lead", lead("a.example"), 1),
      ev.idle("sevt_2", { type: "requires_action", event_ids: ["sevt_1"] }, 2),
    ];
    await syncRun(deps, "sesn_1");
    const second = await syncRun(deps, "sesn_1");

    expect(gateway.sent).toHaveLength(1);
    expect(leads.leads.size).toBe(1);
    expect(second.synced && second.toolCallsAnswered).toBe(0);
  });

  it("sonraki senkronda yalnızca yeni olayları ister (since)", async () => {
    const { gateway, deps } = setup();
    gateway.events = [ev.running("sevt_1", 1)];
    await syncRun(deps, "sesn_1");
    await syncRun(deps, "sesn_1");
    expect(gateway.listCalls[0]?.sinceProcessedAt).toBeUndefined();
    expect(gateway.listCalls[1]?.sinceProcessedAt).toBe("2026-10-15T10:00:01.000Z");
  });

  it("aynı yanıtta birden çok çağrıyı tek istekte cevaplar", async () => {
    const { gateway, leads, deps } = setup();
    gateway.status = "idle";
    gateway.events = [
      ev.toolUse("sevt_1", "save_lead", lead("a.example"), 1),
      ev.toolUse("sevt_2", "save_lead", lead("b.example"), 2),
      ev.toolUse("sevt_3", "save_lead", lead("c.example"), 3),
      ev.idle("sevt_4", { type: "requires_action", event_ids: ["sevt_1", "sevt_2", "sevt_3"] }, 4),
    ];
    const r = await syncRun(deps, "sesn_1");
    expect(gateway.sent).toHaveLength(1);
    expect(gateway.sent[0]).toHaveLength(3);
    expect(leads.leads.size).toBe(3);
    expect(r.synced && r.toolCallsAnswered).toBe(3);
  });

  it("gönderim başarısızsa handled işaretlemez, hata verir; sonraki tur yeniden dener ve çoğaltmaz", async () => {
    const { gateway, repo, leads, deps } = setup();
    gateway.status = "idle";
    gateway.events = [
      ev.toolUse("sevt_1", "save_lead", lead("a.example"), 1),
      ev.idle("sevt_2", { type: "requires_action", event_ids: ["sevt_1"] }, 2),
    ];
    gateway.failSends = 1;

    await expect(syncRun(deps, "sesn_1")).rejects.toThrow(/MA gönderimi/);
    expect((await repo.listUnhandledToolUses("run-1")).length).toBe(1);

    const r = await syncRun(deps, "sesn_1");
    expect(r.synced && r.toolCallsAnswered).toBe(1);
    expect(gateway.sent).toHaveLength(1);
    expect(leads.leads.size).toBe(1); // domain ile upsert: iki çalıştırma tek kayıt
  });

  it("geçersiz girdiyi is_error ile cevaplar, lead kaydetmez", async () => {
    const { gateway, leads, deps } = setup();
    gateway.status = "idle";
    gateway.events = [
      ev.toolUse("sevt_1", "save_lead", lead("a.example", { sources: [] }), 1),
      ev.idle("sevt_2", { type: "requires_action", event_ids: ["sevt_1"] }, 2),
    ];
    await syncRun(deps, "sesn_1");
    expect(gateway.sent[0]?.[0]?.isError).toBe(true);
    expect(leads.leads.size).toBe(0);
  });

  it("araç beklenmedik hata verirse agent'a genel mesaj gider, ayrıntı log'a yazılır", async () => {
    const { gateway, leads, deps, logs } = setup();
    leads.upsertLead = async () => {
      throw new Error("veritabanı bağlantısı: gizli-ayrıntı");
    };
    gateway.status = "idle";
    gateway.events = [
      ev.toolUse("sevt_1", "save_lead", lead("a.example"), 1),
      ev.idle("sevt_2", { type: "requires_action", event_ids: ["sevt_1"] }, 2),
    ];
    await syncRun(deps, "sesn_1");
    const sent = gateway.sent[0]?.[0];
    expect(sent?.isError).toBe(true);
    expect(sent?.text).not.toContain("gizli-ayrıntı");
    expect(logs).toContain("tool_failed");
  });

  it("katalog dışı aracı reddeder ama oturumu tıkamaz", async () => {
    const { gateway, deps } = setup();
    gateway.status = "idle";
    gateway.events = [
      ev.toolUse("sevt_1", "send_email", { to: "x@y.z" }, 1),
      ev.idle("sevt_2", { type: "requires_action", event_ids: ["sevt_1"] }, 2),
    ];
    await syncRun(deps, "sesn_1");
    expect(gateway.sent[0]?.[0]?.isError).toBe(true);
  });

  it("idle + end_turn: run tamamlanır, ended_at yazılır, ledger güncellenir", async () => {
    const { gateway, repo, leads, deps } = setup();
    gateway.status = "idle";
    gateway.usage = {
      ...zeroUsage,
      inputTokens: 1000,
      outputTokens: 200,
      webSearchRequests: 6,
      listCostCents: 231,
      activeSeconds: 271,
    };
    gateway.events = [ev.idle("sevt_9", { type: "end_turn" }, 9)];
    await leads.upsertLead(repo.runs.get("run-1")!, {
      companyName: "A",
      domain: "a.example",
      score: 50,
      scoreRationale: [{ signal: "x", points: 1 }],
      sources: [{ url: "https://a.example/x", quote: "yeterince uzun alıntı" }],
    });

    const r = await syncRun(deps, "sesn_1");

    expect(r.synced && r.status).toBe("completed");
    expect(repo.runs.get("run-1")?.endedAt).toBe(NOW.toISOString());
    expect(repo.ledger.get("run-1")).toMatchObject({
      listCostCents: 231,
      webSearchRequests: 6,
      outcomeLabel: "lead",
      outcomeCount: 1,
      activeSeconds: 271,
    });
  });

  it("idle + budget_reached: bütçe doldu, run açık kalır (devam edebilir), ended_at yok", async () => {
    const { gateway, repo, deps } = setup();
    gateway.status = "idle";
    gateway.usage = { ...zeroUsage, listCostCents: 401 };
    gateway.events = [ev.idle("sevt_9", { type: "budget_reached" }, 9)];
    const r = await syncRun(deps, "sesn_1");
    expect(r.synced && r.status).toBe("budget_reached");
    expect(repo.runs.get("run-1")?.endedAt).toBeNull();
    expect((await repo.listOpenRuns()).length).toBe(1);
    expect(repo.ledger.get("run-1")?.listCostCents).toBe(401);
  });

  it("refusal: run başarısız olur ve kategori hata metnine girer", async () => {
    const { gateway, deps } = setup();
    gateway.status = "idle";
    gateway.events = [
      ev.idle("sevt_9", { type: "refusal" }, 9, {
        type: "refusal",
        category: "cyber",
        explanation: null,
      }),
    ];
    const r = await syncRun(deps, "sesn_1");
    expect(r.synced && r.status).toBe("failed");
  });

  it("terminated: hata olayı yoksa tamamlandı, varsa başarısız", async () => {
    const a = setup();
    a.gateway.status = "terminated";
    a.gateway.events = [ev.terminated("sevt_1", 1)];
    expect((await syncRun(a.deps, "sesn_1")).synced && "ok").toBe("ok");
    expect(a.repo.runs.get("run-1")?.status).toBe("completed");

    const b = setup();
    b.gateway.status = "terminated";
    b.gateway.events = [ev.error("sevt_1", 1), ev.terminated("sevt_2", 2)];
    await syncRun(b.deps, "sesn_1");
    expect(b.repo.runs.get("run-1")?.status).toBe("failed");
  });

  it("çözemeyeceğimiz bir blokaj (araç onayı vb.) varsa awaiting_tool olur", async () => {
    const { gateway, repo, deps } = setup();
    gateway.status = "idle";
    gateway.events = [
      {
        id: "sevt_1",
        type: "agent.tool_use",
        processedAt: "2026-10-15T10:00:01.000Z",
        payload: { id: "sevt_1", type: "agent.tool_use" },
      },
      ev.idle("sevt_2", { type: "requires_action", event_ids: ["sevt_1"] }, 2),
    ];
    await syncRun(deps, "sesn_1");
    expect(repo.runs.get("run-1")?.status).toBe("awaiting_tool");
  });

  it("oturum çalışıyorsa run running", async () => {
    const { gateway, repo, deps } = setup();
    gateway.status = "running";
    gateway.events = [ev.running("sevt_1", 1)];
    await syncRun(deps, "sesn_1");
    expect(repo.runs.get("run-1")?.status).toBe("running");
  });
});

describe("reconcileOpenRuns", () => {
  it("açık run'ları eşitler, biri hata verse de diğerlerine devam eder", async () => {
    const { gateway, repo, deps } = setup();
    repo.runs.clear();
    repo.addRun(makeRun({ id: "run-1", maSessionId: "sesn_1" }));
    repo.addRun(makeRun({ id: "run-2", maSessionId: "sesn_2" }));
    repo.addRun(makeRun({ id: "run-3", maSessionId: "sesn_3", status: "completed" }));
    const original = gateway.retrieveSession.bind(gateway);
    gateway.retrieveSession = async (id) => {
      if (id === "sesn_1") throw new Error("MA erişilemiyor");
      return original(id);
    };
    const out = await reconcileOpenRuns(deps);
    expect(out.checked).toBe(2);
    expect(out.failed).toEqual([{ maSessionId: "sesn_1", error: "Error: MA erişilemiyor" }]);
    expect(repo.runs.get("run-2")?.status).toBe("running");
  });
});

describe("parseIdleStop / deriveState", () => {
  it("bilinmeyen biçimde null döner", () => {
    expect(parseIdleStop({})).toBeNull();
    expect(parseIdleStop({ stop_reason: "end_turn" })).toBeNull();
    expect(parseIdleStop({ stop_reason: { type: 5 } })).toBeNull();
  });

  it("requires_action event_ids okunur", () => {
    expect(
      parseIdleStop({ stop_reason: { type: "requires_action", event_ids: ["a", 3, "b"] } }),
    ).toEqual({
      type: "requires_action",
      eventIds: ["a", "b"],
      refusalCategory: null,
    });
  });

  it("idle olayı henüz gelmediyse running sayar (olay gecikmesi)", () => {
    const d = deriveState({
      sessionStatus: "idle",
      lastStatusEvent: null,
      allBlockersAreCustomTools: true,
      sentResults: false,
      hasSessionError: false,
    });
    expect(d.status).toBe("running");
  });

  it("bilinmeyen durma nedeninde run'ı bitirmez", () => {
    const ev9: StoredEvent = { ...ev.idle("e", { type: "yeni_bir_neden" }, 1), handledAt: null };
    const d = deriveState({
      sessionStatus: "idle",
      lastStatusEvent: ev9,
      allBlockersAreCustomTools: true,
      sentResults: false,
      hasSessionError: false,
    });
    expect(d.status).toBe("running");
    expect(d.stopReason).toBe("yeni_bir_neden");
  });
});
