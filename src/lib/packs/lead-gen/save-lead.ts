import { z } from "zod";
import type { ToolOutcome } from "@/lib/ma/tools/catalog";
import type { RunRecord } from "@/lib/ma/types";
import type { LeadsRepo } from "./repo";
import type { LeadInput } from "./types";

const BLOCKED_HOSTS = ["linkedin.com"];

const hostOf = (value: string): string | null => {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

const isBlocked = (host: string) => BLOCKED_HOSTS.some((b) => host === b || host.endsWith(`.${b}`));

const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const saveLeadInput = z.object({
  company_name: trimmed(200),
  website: trimmed(300),
  city: trimmed(100).optional(),
  employee_estimate: z.number().int().min(0).max(1_000_000).optional(),
  contact_name: trimmed(200).optional(),
  contact_role: trimmed(200).optional(),
  score: z.number().int().min(0).max(100),
  rationale: z
    .array(
      z.object({
        signal: trimmed(300),
        points: z.number().int().min(-100).max(100),
        source_index: z.number().int().min(0).optional(),
      }),
    )
    .min(1, "puan gerekçesi en az bir işaret içermeli")
    .max(15),
  // Her sonuç kaynağına bağlanır: kaynaksız lead kaydedilmez.
  sources: z
    .array(
      z.object({
        url: z.string().trim().max(2000),
        title: trimmed(300).optional(),
        quote: z.string().trim().min(10, "alıntı en az 10 karakter olmalı").max(600),
      }),
    )
    .min(1, "en az bir kaynak (url ve alıntı) gerekli")
    .max(10),
});

/** Doğrulanmış girdiyi veritabanı biçimine çevirir; kural ihlalinde Türkçe hata listesi döner. */
export function toLeadInput(
  raw: unknown,
): { ok: true; lead: LeadInput } | { ok: false; errors: string[] } {
  const parsed = saveLeadInput.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "girdi"}: ${i.message}`),
    };
  }
  const d = parsed.data;
  const errors: string[] = [];

  const domain = hostOf(d.website);
  if (!domain || !domain.includes(".") || /^\d+(\.\d+){3}$/.test(domain)) {
    errors.push("website: geçerli bir alan adı olmalı (IP adresi olamaz)");
  } else if (isBlocked(domain)) {
    errors.push("website: LinkedIn kullanılamaz, şirketin kendi sitesini ver");
  }

  d.sources.forEach((s, i) => {
    const host = /^https?:\/\//i.test(s.url) ? hostOf(s.url) : null;
    if (!host)
      errors.push(`sources.${i}.url: http veya https ile başlayan geçerli bir adres olmalı`);
    else if (isBlocked(host)) errors.push(`sources.${i}.url: LinkedIn kaynak olarak kullanılamaz`);
  });
  d.rationale.forEach((r, i) => {
    if (r.source_index !== undefined && r.source_index >= d.sources.length) {
      errors.push(`rationale.${i}.source_index: sources içinde böyle bir sıra yok`);
    }
  });
  if (errors.length > 0 || !domain) return { ok: false, errors };

  return {
    ok: true,
    lead: {
      companyName: d.company_name,
      domain,
      city: d.city,
      employeeEstimate: d.employee_estimate,
      contactName: d.contact_name,
      contactRole: d.contact_role,
      score: d.score,
      scoreRationale: d.rationale.map((r) => ({
        signal: r.signal,
        points: r.points,
        sourceIndex: r.source_index,
      })),
      sources: d.sources.map((s) => ({ url: s.url, title: s.title, quote: s.quote })),
    },
  };
}

/** `save_lead` aracının çalıştırıcısı. Geçersiz girişte agent'a düzeltebileceği bir hata döner. */
export async function runSaveLead(
  input: unknown,
  ctx: { repo: LeadsRepo; run: RunRecord },
): Promise<ToolOutcome> {
  const result = toLeadInput(input);
  if (!result.ok) {
    return {
      isError: true,
      text: `Lead kaydedilmedi. Girişi düzeltip tekrar dene:\n${result.errors.map((e) => `- ${e}`).join("\n")}`,
    };
  }
  const { created } = await ctx.repo.upsertLead(ctx.run, result.lead);
  return {
    isError: false,
    text: `${created ? "Kaydedildi" : "Mevcut kayıt güncellendi"}: ${result.lead.companyName} (${result.lead.domain}), puan ${result.lead.score}.`,
  };
}
