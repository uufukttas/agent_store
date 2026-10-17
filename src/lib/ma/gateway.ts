import type { MaEvent, SessionSnapshot, ToolResult } from "./types";

/** MA'ya tek giriş noktası. Gerçek uygulama SDK'yı sarar, testlerde sahte sürüm kullanılır. */
export interface AgentsGateway {
  createSession(input: {
    agentId: string;
    /** Her zaman sabit versiyon: "son versiyon" kısayolu kullanılmaz (ADR 0001). */
    agentVersion: number;
    environmentId: string;
    budgetCents: number;
    userMessage: string;
    metadata?: Record<string, string>;
  }): Promise<{ sessionId: string }>;

  retrieveSession(sessionId: string): Promise<SessionSnapshot>;

  /** Kronolojik sırayla. `sinceProcessedAt` dahildir; tekrarı çağıran eler. */
  listEvents(sessionId: string, opts?: { sinceProcessedAt?: string }): Promise<MaEvent[]>;

  /** Bekleyen custom tool çağrılarının hepsini tek istekte cevaplar. */
  sendCustomToolResults(sessionId: string, results: ToolResult[]): Promise<void>;
}
