import { join } from "node:path";
import { IRS_ASSET_DIR, writeJson } from "./shared.js";

type FilingColumn = "single" | "marriedFilingJointly" | "marriedFilingSeparately" | "headOfHousehold";

type TaxBracket = {
  upTo: number;
  rate: number;
  base: number;
  floor: number;
};

type TaxRow = {
  atLeast: number;
  lessThan: number;
  single: number;
  marriedFilingJointly: number;
  marriedFilingSeparately: number;
  headOfHousehold: number;
};

const brackets: Record<FilingColumn, TaxBracket[]> = {
  single: [
    { floor: 0, upTo: 11_925, base: 0, rate: 0.10 },
    { floor: 11_925, upTo: 48_475, base: 1_192.50, rate: 0.12 },
    { floor: 48_475, upTo: 103_350, base: 5_578.50, rate: 0.22 }
  ],
  marriedFilingJointly: [
    { floor: 0, upTo: 23_850, base: 0, rate: 0.10 },
    { floor: 23_850, upTo: 96_950, base: 2_385, rate: 0.12 },
    { floor: 96_950, upTo: 206_700, base: 11_157, rate: 0.22 }
  ],
  marriedFilingSeparately: [
    { floor: 0, upTo: 11_925, base: 0, rate: 0.10 },
    { floor: 11_925, upTo: 48_475, base: 1_192.50, rate: 0.12 },
    { floor: 48_475, upTo: 103_350, base: 5_578.50, rate: 0.22 }
  ],
  headOfHousehold: [
    { floor: 0, upTo: 17_000, base: 0, rate: 0.10 },
    { floor: 17_000, upTo: 64_850, base: 1_700, rate: 0.12 },
    { floor: 64_850, upTo: 103_350, base: 7_442, rate: 0.22 }
  ]
};

function roundWholeDollar(value: number): number {
  return Math.floor(value + 0.5);
}

function taxFor(column: FilingColumn, midpoint: number): number {
  const bracket = brackets[column].find((candidate) => midpoint <= candidate.upTo);
  if (!bracket) throw new Error(`No generated bracket for ${column} ${midpoint}`);
  return roundWholeDollar(bracket.base + (midpoint - bracket.floor) * bracket.rate);
}

const rows: TaxRow[] = [];
for (let atLeast = 0; atLeast < 100_000; atLeast += 50) {
  const lessThan = atLeast + 50;
  const midpoint = atLeast + 25;
  rows.push({
    atLeast,
    lessThan,
    single: taxFor("single", midpoint),
    marriedFilingJointly: taxFor("marriedFilingJointly", midpoint),
    marriedFilingSeparately: taxFor("marriedFilingSeparately", midpoint),
    headOfHousehold: taxFor("headOfHousehold", midpoint)
  });
}

const requiredSentinels = [
  { atLeast: 8_500, lessThan: 8_550, single: 853, marriedFilingJointly: 853, marriedFilingSeparately: 853, headOfHousehold: 853 },
  { atLeast: 24_250, lessThan: 24_300, single: 2_675, marriedFilingJointly: 2_436, marriedFilingSeparately: 2_675, headOfHousehold: 2_573 }
];

for (const sentinel of requiredSentinels) {
  const row = rows.find((candidate) => candidate.atLeast === sentinel.atLeast && candidate.lessThan === sentinel.lessThan);
  if (!row) throw new Error(`Missing sentinel ${sentinel.atLeast}`);
  for (const key of ["single", "marriedFilingJointly", "marriedFilingSeparately", "headOfHousehold"] as const) {
    if (row[key] !== sentinel[key]) {
      throw new Error(`Sentinel ${sentinel.atLeast} ${key}: expected ${sentinel[key]}, got ${row[key]}`);
    }
  }
}

await writeJson(join(IRS_ASSET_DIR, "tax-table-2025.json"), {
  taxYear: 2025,
  source: "Generated into IRS Tax Table row shape from official 2025 Form 1040 instruction tax brackets and verified against required IRS tax-table sentinels.",
  rowIntervalDollars: 50,
  rows
});

console.log(`Wrote ${rows.length} tax-table rows`);
