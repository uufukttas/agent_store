import type { RunRecord } from "../types";

// ADR 0005: her katalog aracı bir risk seviyesi taşır. `external_effect` araçlar onaysız çalışmaz.
export const TOOL_RISKS = ["read", "write_internal", "external_effect"] as const;
export type ToolRisk = (typeof TOOL_RISKS)[number];

export type ToolOutcome = { text: string; isError: boolean };

/** `approved`, yalnızca onay kuyruğu (P2) bir insan onayını kaydettiğinde true olur. */
export type ToolContext = { run: RunRecord; approved?: boolean };

export type ToolDefinition = {
  name: string;
  pack: string;
  risk: ToolRisk;
  run: (input: unknown, ctx: ToolContext) => Promise<ToolOutcome>;
};

/** Çalıştırmanın başarı ölçütü: `usage_ledger`'a ad ve sayı olarak yazılır. */
export type OutcomeCounter = { label: string; count: (runId: string) => Promise<number> };

export type Pack = { name: string; tools: ToolDefinition[]; outcome: OutcomeCounter };

export interface ToolCatalog {
  names(): string[];
  execute(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome>;
}

/** Katalog dışı isim reddedilir; riski eksik veya geçersiz araç kataloğa giremez. */
export function createCatalog(packs: Pack[]): ToolCatalog {
  const tools = new Map<string, ToolDefinition>();
  for (const tool of packs.flatMap((p) => p.tools)) {
    if (!TOOL_RISKS.includes(tool.risk)) {
      throw new Error(`Araç "${tool.name}" geçerli bir risk seviyesi taşımıyor.`);
    }
    if (tools.has(tool.name)) throw new Error(`Araç adı iki kez tanımlı: ${tool.name}`);
    tools.set(tool.name, tool);
  }

  return {
    names: () => [...tools.keys()],
    async execute(name, input, ctx) {
      const tool = tools.get(name);
      if (!tool) {
        return {
          isError: true,
          text: `Bilinmeyen araç: ${name}. Yalnızca ${[...tools.keys()].join(", ")} kullanılabilir.`,
        };
      }
      if (tool.risk === "external_effect" && !ctx.approved) {
        return {
          isError: true,
          text: `${name} dış etkili bir araçtır ve insan onayı olmadan çalıştırılamaz.`,
        };
      }
      return tool.run(input, ctx);
    },
  };
}
