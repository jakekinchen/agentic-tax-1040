import { describe, expect, it } from "vitest";
import { sampleCanonicalW2 } from "../../src/domain/w2.js";
import { cents, parseMoneyToCents, roundCentsToWholeDollars, wholeDollar } from "../../src/domain/money.js";
import { standardDeduction2025 } from "../../src/tax/standard-deduction-2025.js";
import { lookupTax2025, taxTableRowsForTests } from "../../src/tax/tax-table-2025.js";
import { compute2025Return } from "../../src/tax/compute-2025.js";
import { assertTaxComputationInvariants } from "../../src/tax/invariants.js";
import { supportedScopeGuard } from "../../src/tax/scope.js";

const scope = {
  noDependentsAndNotClaimable: true,
  under65AndNotBlind: true,
  onlyOneW2: true,
  standardDeduction: true,
  noMarketplaceSelfEmploymentForeignIncomeAdditionalTaxOrCredit: true,
  noSchedule1ADeductions: true
};

describe("money", () => {
  it("parses cents and rounds IRS whole dollars", () => {
    expect(parseMoneyToCents("$40,000.50")).toBe(4_000_050);
    expect(roundCentsToWholeDollars(cents(24_250_49))).toBe(24250);
    expect(roundCentsToWholeDollars(cents(24_250_50))).toBe(24251);
  });
});

describe("2025 tax table", () => {
  it("includes required sentinel rows", () => {
    expect(lookupTax2025(wholeDollar(8_500), "single")).toBe(853);
    expect(lookupTax2025(wholeDollar(8_500), "married_filing_jointly")).toBe(853);
    expect(lookupTax2025(wholeDollar(8_500), "married_filing_separately")).toBe(853);
    expect(lookupTax2025(wholeDollar(24_250), "single")).toBe(2675);
    expect(lookupTax2025(wholeDollar(24_250), "married_filing_jointly")).toBe(2436);
    expect(lookupTax2025(wholeDollar(24_250), "married_filing_separately")).toBe(2675);
  });

  it("has boundary rows for the supported wage range", () => {
    const rows = taxTableRowsForTests();
    expect(rows.find((row) => row.atLeast === 0)).toBeTruthy();
    expect(rows.find((row) => row.atLeast <= 50_000 && row.lessThan > 50_000)).toBeTruthy();
  });
});

describe("2025 calculations", () => {
  it("calculates the sample Single refund", () => {
    const result = compute2025Return({
      w2: sampleCanonicalW2(),
      filing: { status: "single" },
      scope,
      formFlags: { mainHomeInUS: true, digitalAssets: false }
    });
    expect(result.standardDeduction).toBe(15_750);
    expect(result.taxableIncome).toBe(24_250);
    expect(result.totalTax).toBe(2_675);
    expect(result.outcome).toBe("refund");
    expect(result.outcomeAmount).toBe(525);
  });

  it("calculates the sample MFJ refund", () => {
    const result = compute2025Return({
      w2: sampleCanonicalW2(),
      filing: {
        status: "married_filing_jointly",
        spouse: { firstName: "Jordan", lastName: "Sample", ssn: "900-12-3457" },
        spouseHadNoIncome: true,
        spouseHadNoOtherTaxDocuments: true
      },
      scope,
      formFlags: { mainHomeInUS: true, digitalAssets: false }
    });
    expect(result.standardDeduction).toBe(31_500);
    expect(result.taxableIncome).toBe(8_500);
    expect(result.totalTax).toBe(853);
    expect(result.outcomeAmount).toBe(2_347);
  });

  it("calculates the sample MFS refund", () => {
    const result = compute2025Return({
      w2: sampleCanonicalW2(),
      filing: {
        status: "married_filing_separately",
        spouse: { firstName: "Jordan", lastName: "Sample", ssn: "900-12-3457" },
        livedApartOrLegallySeparated: false,
        spouseWillNotItemize: true,
        noNonresidentAlienRule: true
      },
      scope,
      formFlags: { mainHomeInUS: false, digitalAssets: false }
    });
    expect(result.standardDeduction).toBe(15_750);
    expect(result.totalTax).toBe(2_675);
    expect(result.outcomeAmount).toBe(525);
  });

  it("handles amount owed and zero balance", () => {
    const owedW2 = sampleCanonicalW2();
    owedW2.boxes.box2FederalWithholdingCents = cents(100_000);
    const owed = compute2025Return({
      w2: owedW2,
      filing: { status: "single" },
      scope,
      formFlags: { mainHomeInUS: true, digitalAssets: false }
    });
    expect(owed.outcome).toBe("amount_owed");
    expect(owed.lines.line37).toBe(1_675);

    const zeroW2 = sampleCanonicalW2();
    zeroW2.boxes.box2FederalWithholdingCents = cents(267_500);
    const zero = compute2025Return({
      w2: zeroW2,
      filing: { status: "single" },
      scope,
      formFlags: { mainHomeInUS: true, digitalAssets: false }
    });
    expect(zero.outcome).toBe("zero_balance");
    expect(zero.outcomeAmount).toBe(0);
  });

  it("rejects invariant failures", () => {
    const result = compute2025Return({
      w2: sampleCanonicalW2(),
      filing: { status: "single" },
      scope,
      formFlags: { mainHomeInUS: true, digitalAssets: false }
    });
    expect(() => assertTaxComputationInvariants({ ...result, lines: { ...result.lines, line9: wholeDollar(1) } })).toThrow(/line9/);
  });

  it("selects standard deductions only for supported statuses", () => {
    expect(standardDeduction2025("single")).toBe(15_750);
    expect(standardDeduction2025("married_filing_jointly")).toBe(31_500);
    expect(standardDeduction2025("married_filing_separately")).toBe(15_750);
  });

  it("returns scoped unsupported reason codes", () => {
    expect(supportedScopeGuard({ w2: sampleCanonicalW2(), scope: { ...scope, noSchedule1ADeductions: false } })).toEqual({
      supported: false,
      reasons: [{ code: "schedule_1a", userMessage: "Schedule 1-A deductions are outside this prototype." }]
    });
  });
});
