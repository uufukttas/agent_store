// Managed Agents (MA) ile uygulamamız arasındaki alan tipleri. SDK tiplerinden bilerek ayrıdır:
// gerçek gateway (adım 4) SDK yanıtlarını bu tiplere çevirir, çekirdek SDK'ya bağımlı olmaz.

export type RunStatus =
  "running" | "awaiting_tool" | "budget_reached" | "completed" | "failed" | "cancelled";

/** Bütçeye ulaşan oturum bütçe artırılınca devam edebilir, bu yüzden açık sayılır. */
export const OPEN_RUN_STATUSES: readonly RunStatus[] = [
  "running",
  "awaiting_tool",
  "budget_reached",
];

export type SessionStatus = "rescheduling" | "running" | "idle" | "terminated";

export type MaEvent = {
  id: string;
  type: string;
  processedAt: string | null;
  /** MA'nın gönderdiği ham olay. Bilinmeyen türler de olduğu gibi saklanır. */
  payload: Record<string, unknown>;
};

export type StoredEvent = MaEvent & { handledAt: string | null };

export type UsageSnapshot = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  webSearchRequests: number;
  /** Liste fiyatıyla maliyet, sent. Faturalanan tutar değildir (ADR 0001). */
  listCostCents: number;
  activeSeconds: number;
};

export type SessionSnapshot = {
  id: string;
  status: SessionStatus;
  usage: UsageSnapshot;
};

export type ToolResult = { toolUseId: string; text: string; isError: boolean };

export type RunRecord = {
  id: string;
  orgId: string;
  agentId: string;
  agentVersion: number;
  maSessionId: string;
  status: RunStatus;
  budgetCents: number;
  stopReason: string | null;
  endedAt: string | null;
};

/** `usage_ledger` satırı: kullanım ve agent'ın başarı ölçütü (ad + sayı). */
export type LedgerEntry = UsageSnapshot & { outcomeLabel: string; outcomeCount: number };
