import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(process.cwd(), "supabase/migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const sql = files.map((f) => readFileSync(join(dir, f), "utf8")).join("\n");

// Yorum satırları kurallara yanlış eşleşme yaratmasın.
const code = sql.replace(/--.*$/gm, "");
const tables = [
  ...code.matchAll(/create table(?: if not exists)?\s+public\.(\w+)\s*\(([\s\S]*?)\n\);/gi),
].map((m) => ({ name: m[1]!, body: m[2]! }));

describe("migration kuralları", () => {
  it("dosyalar sıralı numaralı", () => {
    files.forEach((f, i) => expect(f.startsWith(String(i + 1).padStart(4, "0") + "_")).toBe(true));
  });

  it("en az orgs tablosu tanımlı", () => {
    expect(tables.map((t) => t.name)).toContain("orgs");
  });

  it.each(tables.map((t) => [t.name, t.body] as const))("%s: RLS açık", (name) => {
    const re = new RegExp(`alter table public\\.${name}\\s+enable row level security`, "i");
    expect(code).toMatch(re);
  });

  it.each(tables.filter((t) => t.name !== "orgs").map((t) => [t.name, t.body] as const))(
    "%s: org_id alanı var",
    (_name, body) => {
      expect(body).toMatch(/\borg_id\s+uuid\s+not null\s+references\s+public\.orgs/i);
    },
  );
});
