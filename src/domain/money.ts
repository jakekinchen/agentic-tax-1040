export type Cents = number & { readonly __brand: "Cents" };
export type WholeDollar = number & { readonly __brand: "WholeDollar" };

export function cents(value: number): Cents {
  if (!Number.isInteger(value)) throw new Error(`Cents must be an integer: ${value}`);
  return value as Cents;
}

export function wholeDollar(value: number): WholeDollar {
  if (!Number.isInteger(value)) throw new Error(`Whole dollars must be an integer: ${value}`);
  return value as WholeDollar;
}

export function parseMoneyToCents(input: string): Cents {
  const normalized = input.trim().replaceAll(",", "").replace(/^\$/, "");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error(`Invalid money value: ${input}`);
  const [dollarsPartRaw, centsPart = ""] = normalized.split(".");
  const dollarsPart = dollarsPartRaw ?? "0";
  const sign = dollarsPart.startsWith("-") ? -1 : 1;
  const whole = Math.abs(Number(dollarsPart));
  const fraction = Number((centsPart + "00").slice(0, 2));
  return cents(sign * (whole * 100 + fraction));
}

export function dollarsToCents(value: number): Cents {
  return cents(Math.round(value * 100));
}

export function roundCentsToWholeDollars(value: Cents): WholeDollar {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const dollars = Math.trunc(abs / 100);
  const remainder = abs % 100;
  return wholeDollar(sign * (dollars + (remainder >= 50 ? 1 : 0)));
}

export function addCents(values: Cents[]): Cents {
  return cents(values.reduce((sum, value) => sum + value, 0));
}

export function formatDollars(value: WholeDollar | number): string {
  return `$${Number(value).toLocaleString("en-US")}`;
}

export function formatCents(value: Cents | number): string {
  return (Number(value) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}
