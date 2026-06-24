import type { FilingDetails } from "../domain/filing.js";
import type { FormFlags, ScopeAnswers } from "../domain/return.js";
import type { CanonicalW2 } from "../domain/w2.js";

export type UnsupportedReason =
  | "second_w2"
  | "unsupported_tax_year"
  | "wages_outside_range"
  | "box2_exceeds_wages"
  | "critical_w2_fields_missing"
  | "unsupported_w2_code"
  | "unsupported_w2_box13"
  | "dependent_or_claimable"
  | "age_or_blind"
  | "other_income_or_document"
  | "itemized_deductions"
  | "marketplace_or_credit_or_other_tax"
  | "schedule_1a"
  | "spouse_income_mfj"
  | "spouse_itemizes_mfs"
  | "spouse_nonresident_mfs"
  | "digital_assets_yes"
  | "unsupported_filing_status";

export type ScopeResult =
  | { supported: true }
  | { supported: false; reasons: Array<{ code: UnsupportedReason; userMessage: string }> };

function blocked(code: UnsupportedReason, userMessage: string): { code: UnsupportedReason; userMessage: string } {
  return { code, userMessage };
}

const CRITICAL_W2_FIELDS = new Set([
  "taxYear",
  "employee.firstName",
  "employee.lastName",
  "employee.ssn",
  "employee.address",
  "employee.address.street",
  "employee.address.city",
  "employee.address.state",
  "employee.address.zip",
  "boxes.box1Wages",
  "boxes.box2FederalWithholding"
]);

export function supportedScopeGuard(args: {
  w2?: CanonicalW2 | undefined;
  filing?: FilingDetails | undefined;
  scope?: ScopeAnswers | undefined;
  formFlags?: FormFlags | undefined;
}): ScopeResult {
  const reasons: Array<{ code: UnsupportedReason; userMessage: string }> = [];
  const { w2, filing, scope, formFlags } = args;

  if (w2) {
    if (w2.taxYear !== 2025) reasons.push(blocked("unsupported_tax_year", "This prototype only supports tax year 2025."));
    if (w2.extraction.multipleDistinctW2sDetected) reasons.push(blocked("second_w2", "This prototype supports exactly one W-2."));
    if (w2.extraction.unreadableFields.some((field) => CRITICAL_W2_FIELDS.has(field))) reasons.push(blocked("critical_w2_fields_missing", "A required W-2 field was unreadable."));
    if (w2.boxes.box1WagesCents < 3_000_000 || w2.boxes.box1WagesCents > 5_000_000) {
      reasons.push(blocked("wages_outside_range", "This demo supports W-2 wages from $30,000 through $50,000."));
    }
    if (w2.boxes.box2FederalWithholdingCents < 0 || w2.boxes.box2FederalWithholdingCents > w2.boxes.box1WagesCents) {
      reasons.push(blocked("box2_exceeds_wages", "Federal withholding must be zero or positive and cannot exceed wages."));
    }
    if (w2.boxes.box12.some((box) => box.code.toUpperCase() !== "DD")) {
      reasons.push(blocked("unsupported_w2_code", "This W-2 has a Box 12 code outside the supported demo scope."));
    }
    if (w2.boxes.box13.statutoryEmployee || w2.boxes.box13.thirdPartySickPay) {
      reasons.push(blocked("unsupported_w2_box13", "Statutory employee and third-party sick pay W-2 flags are not supported."));
    }
  }

  if (filing?.status === "married_filing_jointly") {
    if (!filing.spouseHadNoIncome || !filing.spouseHadNoOtherTaxDocuments) {
      reasons.push(blocked("spouse_income_mfj", "A joint return is only supported when the spouse has no income and no other tax documents."));
    }
  }
  if (filing?.status === "married_filing_separately") {
    if (!filing.spouseWillNotItemize) reasons.push(blocked("spouse_itemizes_mfs", "Married filing separately is only supported when the spouse will not itemize."));
    if (!filing.noNonresidentAlienRule) reasons.push(blocked("spouse_nonresident_mfs", "Nonresident or dual-status spouse rules are outside this prototype."));
  }

  if (scope) {
    if (!scope.noDependentsAndNotClaimable) reasons.push(blocked("dependent_or_claimable", "Dependents or claimable taxpayer/spouse cases are outside this prototype."));
    if (!scope.under65AndNotBlind) reasons.push(blocked("age_or_blind", "Age 65-or-older and blindness rules are outside this prototype."));
    if (!scope.onlyOneW2) reasons.push(blocked("other_income_or_document", "This prototype only supports one W-2 and no other tax documents."));
    if (!scope.standardDeduction) reasons.push(blocked("itemized_deductions", "Itemized deductions are outside this prototype."));
    if (!scope.noMarketplaceSelfEmploymentForeignIncomeAdditionalTaxOrCredit) {
      reasons.push(blocked("marketplace_or_credit_or_other_tax", "Marketplace, self-employment, foreign income, credits, and other taxes are outside this prototype."));
    }
    if (!scope.noSchedule1ADeductions) reasons.push(blocked("schedule_1a", "Schedule 1-A deductions are outside this prototype."));
  }

  if (formFlags?.digitalAssets === false) {
    return reasons.length === 0 ? { supported: true } : { supported: false, reasons };
  }
  if (formFlags?.digitalAssets === true) {
    reasons.push(blocked("digital_assets_yes", "A digital-asset Yes answer is outside this prototype."));
  }

  return reasons.length === 0 ? { supported: true } : { supported: false, reasons };
}
