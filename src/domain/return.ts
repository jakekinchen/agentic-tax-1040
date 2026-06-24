import type { FilingStatus } from "./filing.js";
import type { WholeDollar } from "./money.js";

export type ScopeAnswers = {
  noDependentsAndNotClaimable: boolean;
  under65AndNotBlind: boolean;
  onlyOneW2: boolean;
  standardDeduction: boolean;
  noMarketplaceSelfEmploymentForeignIncomeAdditionalTaxOrCredit: boolean;
  noSchedule1ADeductions: boolean;
  failedCondition?: string;
};

export type FormFlags = {
  mainHomeInUS: boolean;
  digitalAssets: boolean;
};

export type TaxComputation = {
  taxYear: 2025;
  filingStatus: FilingStatus;
  totalIncome: WholeDollar;
  standardDeduction: WholeDollar;
  taxableIncome: WholeDollar;
  totalTax: WholeDollar;
  withholding: WholeDollar;
  lines: {
    line1a: WholeDollar;
    line1z: WholeDollar;
    line9: WholeDollar;
    line11a: WholeDollar;
    line11b: WholeDollar;
    line12e: WholeDollar;
    line14: WholeDollar;
    line15: WholeDollar;
    line16: WholeDollar;
    line18: WholeDollar;
    line22: WholeDollar;
    line24: WholeDollar;
    line25a: WholeDollar;
    line25d: WholeDollar;
    line33: WholeDollar;
    line34: WholeDollar | null;
    line35a: WholeDollar | null;
    line37: WholeDollar | null;
  };
  outcome: "refund" | "amount_owed" | "zero_balance";
  outcomeAmount: WholeDollar;
  computationVersion: string;
  version: string;
};
