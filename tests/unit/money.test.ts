import { describe, expect, it } from "vitest";
import { centsToAmount, dollarsToCents, formatUsd, parseAmountCents } from "@/lib/ma/money";

describe("money", () => {
  it("dolar -> sent", () => {
    expect(dollarsToCents(4)).toBe(400);
    expect(dollarsToCents(0.5)).toBe(50);
    expect(dollarsToCents(0.1 + 0.2)).toBe(30); // kayan nokta hatası yuvarlanır
  });

  it.each([0, -1, NaN, Infinity])("geçersiz dolar tutarını reddeder: %s", (v) => {
    expect(() => dollarsToCents(v)).toThrow();
  });

  it('sent -> MA tutar metni (4 dolar için "400")', () => {
    expect(centsToAmount(400)).toBe("400");
    expect(centsToAmount(50)).toBe("50");
  });

  it.each([0, -5, 1.5])("geçersiz sent'i reddeder: %s", (v) => {
    expect(() => centsToAmount(v)).toThrow();
  });

  it("MA tutar metnini sent'e çevirir", () => {
    expect(parseAmountCents("231")).toBe(231);
    expect(parseAmountCents("0")).toBe(0);
    expect(parseAmountCents(null)).toBe(0);
    expect(parseAmountCents(undefined)).toBe(0);
  });

  it.each(["2.31", "-5", "abc", "", "1e3"])("beklenmeyen tutar biçimini reddeder: %s", (v) => {
    expect(() => parseAmountCents(v)).toThrow();
  });

  it("Türkçe biçim", () => {
    expect(formatUsd(231)).toBe("$2,31");
    expect(formatUsd(5)).toBe("$0,05");
    expect(formatUsd(400)).toBe("$4,00");
    expect(formatUsd(123450)).toBe("$1.234,50");
    expect(formatUsd(-250)).toBe("-$2,50");
  });
});
