import { describe, expect, it } from "vitest";
import { TOOL_RISKS, createCatalog, type Pack, type ToolDefinition } from "@/lib/ma/tools/catalog";
import { createLeadGenPack } from "@/lib/packs/lead-gen";
import { MemoryLeadsRepo, makeRun } from "../helpers/memory-repo";

const outcome = { label: "test", count: async () => 0 };

function pack(
  tool: Partial<ToolDefinition> & Pick<ToolDefinition, "name">,
  calls = { n: 0 },
): Pack {
  return {
    name: "test",
    outcome,
    tools: [
      {
        pack: "test",
        risk: "write_internal",
        run: async () => {
          calls.n += 1;
          return { text: "çalıştı", isError: false };
        },
        ...tool,
      },
    ],
  };
}

describe("araç kataloğu (ADR 0005)", () => {
  it("lead-gen paketindeki her araç geçerli bir risk seviyesi taşır", () => {
    const p = createLeadGenPack(new MemoryLeadsRepo());
    for (const tool of p.tools) expect(TOOL_RISKS).toContain(tool.risk);
    expect(p.tools.map((t) => t.risk)).not.toContain("external_effect");
  });

  it("risk seviyesi geçersiz araç kataloğa giremez", () => {
    expect(() => createCatalog([pack({ name: "x", risk: "bilinmeyen" as never })])).toThrow(
      /risk seviyesi/,
    );
  });

  it("aynı adı iki kez tanımlamak reddedilir", () => {
    expect(() => createCatalog([pack({ name: "x" }), pack({ name: "x" })])).toThrow(/iki kez/);
  });

  it.each(["read", "write_internal"] as const)("%s araç onaysız çalışır", async (risk) => {
    const c = createCatalog([pack({ name: "x", risk })]);
    expect((await c.execute("x", {}, { run: makeRun() })).isError).toBe(false);
  });

  it("external_effect araç onay olmadan hiç çalıştırılmaz", async () => {
    const calls = { n: 0 };
    const c = createCatalog([pack({ name: "send_email", risk: "external_effect" }, calls)]);
    const out = await c.execute("send_email", {}, { run: makeRun() });
    expect(out.isError).toBe(true);
    expect(out.text).toMatch(/onay/);
    expect(calls.n).toBe(0);
    expect((await c.execute("send_email", {}, { run: makeRun(), approved: true })).isError).toBe(
      false,
    );
    expect(calls.n).toBe(1);
  });
});
