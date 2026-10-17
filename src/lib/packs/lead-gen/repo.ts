import type { RunRecord } from "@/lib/ma/types";
import type { LeadInput } from "./types";

/** Müşteri bulma paketinin veri erişimi. Çekirdek `Repo`'dan ayrıdır (ADR 0005). */
export interface LeadsRepo {
  /** `(org_id, domain)` ile upsert; kaynaklar `(lead_id, url)` ile birleşir. */
  upsertLead(run: RunRecord, lead: LeadInput): Promise<{ leadId: string; created: boolean }>;
  countLeads(runId: string): Promise<number>;
}
