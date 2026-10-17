// MA tutarları sent cinsinden, tam sayı metni olarak taşır ("400" = 4 dolar). Ondalıklı sayı
// hiçbir yerde saklanmaz; yuvarlama hatası olmasın diye iç temsil hep tam sayı sent'tir.

export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars) || dollars <= 0) throw new Error("Tutar sıfırdan büyük olmalı.");
  return Math.round(dollars * 100);
}

/** MA'nın `max_list_cost.amount` alanı için: başında sıfır olmayan tam sayı metni. */
export function centsToAmount(cents: number): string {
  if (!Number.isInteger(cents) || cents <= 0)
    throw new Error("Sent tutarı pozitif tam sayı olmalı.");
  return String(cents);
}

/** MA'dan gelen `list_cost.amount` metnini sent'e çevirir. Alan yoksa 0. */
export function parseAmountCents(amount: string | null | undefined): number {
  if (amount == null) return 0;
  if (!/^\d+$/.test(amount)) throw new Error(`Beklenmeyen tutar biçimi: ${amount}`);
  const cents = Number(amount);
  if (!Number.isSafeInteger(cents)) throw new Error(`Tutar çok büyük: ${amount}`);
  return cents;
}

/** Arayüz için Türkçe biçim: 231 -> "$2,31", 123450 -> "$1.234,50". */
export function formatUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}$${whole},${frac}`;
}
