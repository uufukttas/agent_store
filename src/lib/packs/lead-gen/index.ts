import type { Pack } from "@/lib/ma/tools/catalog";
import type { LeadsRepo } from "./repo";
import { runSaveLead } from "./save-lead";

const PACK = "lead-gen";

/** Müşteri bulma paketi: araçları ve başarı ölçütü (lead sayısı). */
export function createLeadGenPack(leads: LeadsRepo): Pack {
  return {
    name: PACK,
    tools: [
      {
        name: "save_lead",
        pack: PACK,
        risk: "write_internal",
        run: (input, ctx) => runSaveLead(input, { repo: leads, run: ctx.run }),
      },
    ],
    outcome: { label: "lead", count: (runId) => leads.countLeads(runId) },
  };
}
