import type { AgentsGateway } from "./gateway";
import type { Repo } from "./repo";
import type { RunRecord, RunStatus, SessionStatus, StoredEvent, ToolResult } from "./types";
import { OPEN_RUN_STATUSES } from "./types";
import type { OutcomeCounter, ToolCatalog } from "./tools/catalog";

export type SyncDeps = {
  gateway: AgentsGateway;
  repo: Repo;
  tools: ToolCatalog;
  /** Çalıştırmanın başarı ölçütü (paketten gelir), maliyet kaydına yazılır. */
  outcome: OutcomeCounter;
  now?: () => Date;
  log?: (message: string, context?: Record<string, unknown>) => void;
};

export type SyncResult =
  | { synced: false; reason: "unknown_session" }
  | { synced: true; status: RunStatus; toolCallsAnswered: number };

type IdleStop = {
  type: string;
  eventIds: string[];
  refusalCategory: string | null;
};

/** `session.status_idle` olayının ham yükünden durma nedenini çıkarır. Bilinmeyen biçimde null. */
export function parseIdleStop(payload: Record<string, unknown>): IdleStop | null {
  const stop = payload.stop_reason;
  if (!stop || typeof stop !== "object") return null;
  const s = stop as { type?: unknown; event_ids?: unknown };
  if (typeof s.type !== "string") return null;
  const details = payload.stop_details as { category?: unknown } | null | undefined;
  return {
    type: s.type,
    eventIds: Array.isArray(s.event_ids)
      ? s.event_ids.filter((x): x is string => typeof x === "string")
      : [],
    refusalCategory: typeof details?.category === "string" ? details.category : null,
  };
}

export type DerivedState = { status: RunStatus; stopReason: string | null; error: string | null };

/**
 * Oturum durumu ve son `session.status_idle` olayından run durumunu türetir.
 * Oturum nesnesinde `stop_reason` yoktur; yalnızca idle olayında gelir (ADR 0001).
 */
export function deriveState(input: {
  sessionStatus: SessionStatus;
  lastStatusEvent: StoredEvent | null;
  /** `requires_action` ile beklenen olayların hepsi bizim çözebileceğimiz custom tool çağrısı mı? */
  allBlockersAreCustomTools: boolean;
  /** Bu senkronda sonuç gönderildi mi (oturum devam ediyor demektir)? */
  sentResults: boolean;
  hasSessionError: boolean;
}): DerivedState {
  const { sessionStatus, lastStatusEvent: ev } = input;

  if (sessionStatus === "running" || sessionStatus === "rescheduling" || input.sentResults) {
    return { status: "running", stopReason: null, error: null };
  }
  if (sessionStatus === "terminated") {
    return input.hasSessionError
      ? { status: "failed", stopReason: "terminated", error: "Oturum hata ile sonlandı." }
      : { status: "completed", stopReason: "terminated", error: null };
  }

  // idle
  const stop = ev?.type === "session.status_idle" ? parseIdleStop(ev.payload) : null;
  if (!stop) return { status: "running", stopReason: null, error: null }; // idle olayı henüz gelmedi
  switch (stop.type) {
    case "end_turn":
      return { status: "completed", stopReason: "end_turn", error: null };
    case "budget_reached":
      return { status: "budget_reached", stopReason: "budget_reached", error: null };
    case "requires_action":
      return input.allBlockersAreCustomTools
        ? { status: "running", stopReason: "requires_action", error: null }
        : { status: "awaiting_tool", stopReason: "requires_action", error: null };
    case "retries_exhausted":
      return {
        status: "failed",
        stopReason: "retries_exhausted",
        error: "Yeniden denemeler tükendi.",
      };
    case "refusal":
      return {
        status: "failed",
        stopReason: "refusal",
        error: `Model isteği reddetti${stop.refusalCategory ? ` (${stop.refusalCategory})` : ""}.`,
      };
    default:
      return { status: "running", stopReason: stop.type, error: null };
  }
}

async function answerToolCalls(
  deps: SyncDeps,
  run: RunRecord,
  pending: StoredEvent[],
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  for (const ev of pending) {
    const name = typeof ev.payload.name === "string" ? ev.payload.name : "";
    try {
      const outcome = await deps.tools.execute(name, ev.payload.input, { run });
      results.push({ toolUseId: ev.id, text: outcome.text, isError: outcome.isError });
    } catch (error) {
      // Beklenmeyen hata: ayrıntı log'a, agent'a yalnızca genel mesaj gider.
      deps.log?.("tool_failed", { runId: run.id, tool: name, error: String(error) });
      results.push({
        toolUseId: ev.id,
        text: "Araç geçici bir hata verdi, tekrar dene.",
        isError: true,
      });
    }
  }
  return results;
}

/**
 * Bir MA oturumunu veritabanıyla eşitler: olayları saklar, bekleyen custom tool çağrılarını
 * çalıştırıp cevaplar, run durumunu ve maliyet kaydını günceller. Webhook ve uzlaştırma işi
 * aynı fonksiyonu çağırır; tekrar çağrılması güvenlidir (idempotent).
 */
export async function syncRun(deps: SyncDeps, maSessionId: string): Promise<SyncResult> {
  const { gateway, repo } = deps;
  const now = (deps.now ?? (() => new Date()))().toISOString();

  const run = await repo.getRunBySession(maSessionId);
  if (!run) return { synced: false, reason: "unknown_session" };

  const snapshot = await gateway.retrieveSession(maSessionId);
  const since = (await repo.latestEventTime(run.id)) ?? undefined;
  await repo.upsertEvents(run, await gateway.listEvents(maSessionId, { sinceProcessedAt: since }));

  // Çalıştırma sonuçları: hepsi tek istekte gider; gönderim başarısızsa handled işaretlenmez
  // ve hata yukarı çıkar (webhook 5xx döner, uzlaştırma bir sonraki turda yeniden dener).
  const pending = await repo.listUnhandledToolUses(run.id);
  let sentResults = false;
  if (pending.length > 0) {
    const results = await answerToolCalls(deps, run, pending);
    await gateway.sendCustomToolResults(maSessionId, results);
    await repo.markHandled(
      run.id,
      pending.map((p) => p.id),
      now,
    );
    sentResults = true;
  }

  const lastStatusEvent = await repo.latestStatusEvent(run.id);
  const stop =
    lastStatusEvent?.type === "session.status_idle" ? parseIdleStop(lastStatusEvent.payload) : null;
  let allBlockersAreCustomTools = true;
  if (stop?.type === "requires_action") {
    const blockers = await repo.getEventsByIds(run.id, stop.eventIds);
    allBlockersAreCustomTools =
      blockers.length === stop.eventIds.length &&
      blockers.every((b) => b.type === "agent.custom_tool_use");
  }

  const derived = deriveState({
    sessionStatus: snapshot.status,
    lastStatusEvent,
    allBlockersAreCustomTools,
    sentResults,
    hasSessionError: await repo.hasEventOfType(run.id, "session.error"),
  });

  const closed = !OPEN_RUN_STATUSES.includes(derived.status);
  await repo.updateRun(run.id, {
    status: derived.status,
    stopReason: derived.stopReason,
    error: derived.error,
    endedAt: closed ? (run.endedAt ?? now) : null,
    lastSyncedAt: now,
  });
  await repo.upsertLedger(run, {
    ...snapshot.usage,
    outcomeLabel: deps.outcome.label,
    outcomeCount: await deps.outcome.count(run.id),
  });

  return { synced: true, status: derived.status, toolCallsAnswered: pending.length };
}

/** Uzlaştırma: düşmüş webhook'lara karşı güvenlik ağı. Bir run'ın hatası diğerlerini durdurmaz. */
export async function reconcileOpenRuns(
  deps: SyncDeps,
): Promise<{ checked: number; failed: { maSessionId: string; error: string }[] }> {
  const runs = await deps.repo.listOpenRuns();
  const failed: { maSessionId: string; error: string }[] = [];
  for (const run of runs) {
    try {
      await syncRun(deps, run.maSessionId);
    } catch (error) {
      deps.log?.("reconcile_failed", { runId: run.id, error: String(error) });
      failed.push({ maSessionId: run.maSessionId, error: String(error) });
    }
  }
  return { checked: runs.length, failed };
}
