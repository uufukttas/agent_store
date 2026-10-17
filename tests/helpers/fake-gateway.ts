import type { AgentsGateway } from "@/lib/ma/gateway";
import type {
  MaEvent,
  SessionSnapshot,
  SessionStatus,
  ToolResult,
  UsageSnapshot,
} from "@/lib/ma/types";

export const zeroUsage: UsageSnapshot = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
  webSearchRequests: 0,
  listCostCents: 0,
  activeSeconds: 0,
};

const t = (n: number) => new Date(Date.UTC(2026, 9, 15, 10, 0, n)).toISOString();

/** MA olay yükü üreticileri. Alan adları SDK tiplerindeki gerçek biçimle aynıdır. */
export const ev = {
  toolUse(id: string, name: string, input: Record<string, unknown>, sec: number): MaEvent {
    return {
      id,
      type: "agent.custom_tool_use",
      processedAt: t(sec),
      payload: { id, type: "agent.custom_tool_use", name, input },
    };
  },
  idle(id: string, stop: Record<string, unknown>, sec: number, details: unknown = null): MaEvent {
    return {
      id,
      type: "session.status_idle",
      processedAt: t(sec),
      payload: { id, type: "session.status_idle", stop_reason: stop, stop_details: details },
    };
  },
  running(id: string, sec: number): MaEvent {
    return {
      id,
      type: "session.status_running",
      processedAt: t(sec),
      payload: { id, type: "session.status_running" },
    };
  },
  terminated(id: string, sec: number): MaEvent {
    return {
      id,
      type: "session.status_terminated",
      processedAt: t(sec),
      payload: { id, type: "session.status_terminated" },
    };
  },
  error(id: string, sec: number): MaEvent {
    return {
      id,
      type: "session.error",
      processedAt: t(sec),
      payload: { id, type: "session.error", error: { type: "unknown_error" } },
    };
  },
};

export class FakeGateway implements AgentsGateway {
  events: MaEvent[] = [];
  status: SessionStatus = "running";
  usage: UsageSnapshot = { ...zeroUsage };
  sent: ToolResult[][] = [];
  listCalls: { sinceProcessedAt?: string }[] = [];
  created: Parameters<AgentsGateway["createSession"]>[0][] = [];
  /** Sonraki N gönderim bu hatayla başarısız olur. */
  failSends = 0;

  async createSession(input: Parameters<AgentsGateway["createSession"]>[0]) {
    this.created.push(input);
    return { sessionId: `sesn_${this.created.length}` };
  }

  async retrieveSession(sessionId: string): Promise<SessionSnapshot> {
    return { id: sessionId, status: this.status, usage: this.usage };
  }

  async listEvents(_sessionId: string, opts?: { sinceProcessedAt?: string }) {
    this.listCalls.push({ sinceProcessedAt: opts?.sinceProcessedAt });
    const since = opts?.sinceProcessedAt;
    return this.events.filter((e) => !since || (e.processedAt ?? "") >= since);
  }

  async sendCustomToolResults(_sessionId: string, results: ToolResult[]) {
    if (this.failSends > 0) {
      this.failSends -= 1;
      throw new Error("MA gönderimi başarısız");
    }
    this.sent.push(results);
  }
}
