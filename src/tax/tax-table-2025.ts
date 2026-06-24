import taxTableJson from "../../assets/irs/2025/tax-table-2025.json" with { type: "json" };
import type { FilingStatus } from "../domain/filing.js";
import { wholeDollar, type WholeDollar } from "../domain/money.js";

type TaxTableRow = {
  atLeast: number;
  lessThan: number;
  single: number;
  marriedFilingJointly: number;
  marriedFilingSeparately: number;
  headOfHousehold: number;
};

const rows = (taxTableJson as { rows: TaxTableRow[] }).rows;

function columnFor(status: FilingStatus): keyof TaxTableRow {
  switch (status) {
    case "single": return "single";
    case "married_filing_jointly": return "marriedFilingJointly";
    case "married_filing_separately": return "marriedFilingSeparately";
  }
}

export function lookupTax2025(taxableIncome: WholeDollar, status: FilingStatus): WholeDollar {
  const row = rows.find((candidate) => candidate.atLeast <= taxableIncome && taxableIncome < candidate.lessThan);
  if (!row) throw new Error(`No 2025 tax table row for taxable income ${taxableIncome}`);
  const value = row[columnFor(status)];
  if (typeof value !== "number") throw new Error(`Bad tax table column for ${status}`);
  return wholeDollar(value);
}

export function taxTableRowsForTests(): TaxTableRow[] {
  return rows;
}
