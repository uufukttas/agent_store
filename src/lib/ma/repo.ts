import type { LedgerEntry, MaEvent, RunRecord, StoredEvent } from "./types";

export type RunPatch = {
  status?: RunRecord["status"];
  stopReason?: string | null;
  endedAt?: string | null;
  error?: string | null;
  lastSyncedAt: string;
};

/** Veri erişimi arayüzü. Gerçek uygulama Supabase (service role), testlerde bellek içi. */
export interface Repo {
  getRunBySession(maSessionId: string): Promise<RunRecord | null>;
  listOpenRuns(): Promise<RunRecord[]>;

  /** Bu run için saklanan en yeni olayın `processedAt` değeri. */
  latestEventTime(runId: string): Promise<string | null>;
  /** `(run, ma_event_id)` zaten varsa atlar. */
  upsertEvents(run: RunRecord, events: MaEvent[]): Promise<void>;
  /** İşlenmemiş `agent.custom_tool_use` olayları, kronolojik. */
  listUnhandledToolUses(runId: string): Promise<StoredEvent[]>;
  getEventsByIds(runId: string, ids: string[]): Promise<StoredEvent[]>;
  markHandled(runId: string, eventIds: string[], at: string): Promise<void>;
  /** `session.status_*` olaylarının en yenisi. */
  latestStatusEvent(runId: string): Promise<StoredEvent | null>;
  hasEventOfType(runId: string, type: string): Promise<boolean>;

  updateRun(runId: string, patch: RunPatch): Promise<void>;

  /** Çalıştırma başına tek satır, her senkronda son değerlerle güncellenir. */
  upsertLedger(run: RunRecord, entry: LedgerEntry): Promise<void>;
}
