import type { Repo, RunPatch } from "@/lib/ma/repo";
import type { LedgerEntry, MaEvent, RunRecord, StoredEvent } from "@/lib/ma/types";
import { OPEN_RUN_STATUSES } from "@/lib/ma/types";
import type { LeadsRepo } from "@/lib/packs/lead-gen/repo";
import type { LeadInput } from "@/lib/packs/lead-gen/types";

export const ORG_ID = "org-gradeup";

export function makeRun(over: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "run-1",
    orgId: ORG_ID,
    agentId: "agent-1",
    agentVersion: 1,
    maSessionId: "sesn_1",
    status: "running",
    budgetCents: 400,
    stopReason: null,
    endedAt: null,
    ...over,
  };
}

export class MemoryRepo implements Repo {
  runs = new Map<string, RunRecord>();
  events = new Map<string, StoredEvent[]>();
  ledger = new Map<string, LedgerEntry>();
  patches: RunPatch[] = [];

  addRun(run: RunRecord) {
    this.runs.set(run.id, run);
    return run;
  }

  async getRunBySession(maSessionId: string) {
    return [...this.runs.values()].find((r) => r.maSessionId === maSessionId) ?? null;
  }
  async listOpenRuns() {
    return [...this.runs.values()].filter((r) => OPEN_RUN_STATUSES.includes(r.status));
  }
  async latestEventTime(runId: string) {
    const times = (this.events.get(runId) ?? []).map((e) => e.processedAt ?? "").filter(Boolean);
    return times.length ? times.sort().at(-1)! : null;
  }
  async upsertEvents(run: RunRecord, events: MaEvent[]) {
    const list = this.events.get(run.id) ?? [];
    for (const e of events)
      if (!list.some((x) => x.id === e.id)) list.push({ ...e, handledAt: null });
    this.events.set(run.id, list);
  }
  async listUnhandledToolUses(runId: string) {
    return (this.events.get(runId) ?? []).filter(
      (e) => e.type === "agent.custom_tool_use" && !e.handledAt,
    );
  }
  async getEventsByIds(runId: string, ids: string[]) {
    return (this.events.get(runId) ?? []).filter((e) => ids.includes(e.id));
  }
  async markHandled(runId: string, eventIds: string[], at: string) {
    for (const e of this.events.get(runId) ?? []) if (eventIds.includes(e.id)) e.handledAt = at;
  }
  async latestStatusEvent(runId: string) {
    const list = (this.events.get(runId) ?? []).filter((e) => e.type.startsWith("session.status_"));
    return (
      [...list].sort((a, b) => (a.processedAt ?? "").localeCompare(b.processedAt ?? "")).at(-1) ??
      null
    );
  }
  async hasEventOfType(runId: string, type: string) {
    return (this.events.get(runId) ?? []).some((e) => e.type === type);
  }
  async updateRun(runId: string, patch: RunPatch) {
    this.patches.push(patch);
    const run = this.runs.get(runId)!;
    this.runs.set(runId, {
      ...run,
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.stopReason !== undefined && { stopReason: patch.stopReason }),
      ...(patch.endedAt !== undefined && { endedAt: patch.endedAt }),
    });
  }
  async upsertLedger(run: RunRecord, entry: LedgerEntry) {
    this.ledger.set(run.id, entry);
  }
}

type StoredLead = LeadInput & { id: string; runId: string; orgId: string };

export class MemoryLeadsRepo implements LeadsRepo {
  leads = new Map<string, StoredLead>(); // anahtar: domain

  async upsertLead(run: RunRecord, lead: LeadInput) {
    const existing = this.leads.get(lead.domain);
    const id = existing?.id ?? `lead-${this.leads.size + 1}`;
    const sources = [...(existing?.sources ?? [])];
    for (const s of lead.sources) {
      const i = sources.findIndex((x) => x.url === s.url);
      if (i >= 0) sources[i] = s;
      else sources.push(s);
    }
    this.leads.set(lead.domain, {
      ...lead,
      sources,
      id,
      runId: existing?.runId ?? run.id,
      orgId: run.orgId,
    });
    return { leadId: id, created: !existing };
  }
  async countLeads(runId: string) {
    return [...this.leads.values()].filter((l) => l.runId === runId).length;
  }
}
