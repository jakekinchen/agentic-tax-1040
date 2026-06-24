import type { FilingStatus } from "../domain/filing.js";
import { wholeDollar, type WholeDollar } from "../domain/money.js";

export const STANDARD_DEDUCTION_2025 = {
  single: 15_750,
  married_filing_jointly: 31_500,
  married_filing_separately: 15_750
} as const satisfies Record<FilingStatus, number>;

export function standardDeduction2025(status: FilingStatus): WholeDollar {
  return wholeDollar(STANDARD_DEDUCTION_2025[status]);
}
