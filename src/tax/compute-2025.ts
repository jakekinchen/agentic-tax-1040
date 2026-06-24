import { createHash } from "node:crypto";
import type { FilingDetails } from "../domain/filing.js";
import { roundCentsToWholeDollars, wholeDollar } from "../domain/money.js";
import type { FormFlags, ScopeAnswers, TaxComputation } from "../domain/return.js";
import type { CanonicalW2 } from "../domain/w2.js";
import { assertTaxComputationInvariants } from "./invariants.js";
import { lookupTax2025 } from "./tax-table-2025.js";
import { standardDeduction2025 } from "./standard-deduction-2025.js";
import { supportedScopeGuard } from "./scope.js";

function versionFor(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16);
}

export function compute2025Return(args: {
  w2: CanonicalW2;
  filing: FilingDetails;
  scope: ScopeAnswers;
  formFlags: FormFlags;
}): TaxComputation {
  const guard = supportedScopeGuard(args);
  if (!guard.supported) {
    throw new Error(`Unsupported scope: ${guard.reasons.map((reason) => reason.code).join(", ")}`);
  }

  const line1a = roundCentsToWholeDollars(args.w2.boxes.box1WagesCents);
  const line12e = standardDeduction2025(args.filing.status);
  const line15 = wholeDollar(Math.max(0, line1a - line12e));
  const line16 = lookupTax2025(line15, args.filing.status);
  const line25a = roundCentsToWholeDollars(args.w2.boxes.box2FederalWithholdingCents);

  const refund = line25a > line16 ? wholeDollar(line25a - line16) : null;
  const owed = line16 > line25a ? wholeDollar(line16 - line25a) : null;
  const outcome = refund ? "refund" : owed ? "amount_owed" : "zero_balance";
  const outcomeAmount = refund ?? owed ?? wholeDollar(0);
  const version = versionFor(args);

  const computation: TaxComputation = {
    taxYear: 2025,
    filingStatus: args.filing.status,
    totalIncome: line1a,
    standardDeduction: line12e,
    taxableIncome: line15,
    totalTax: line16,
    withholding: line25a,
    outcome,
    outcomeAmount,
    lines: {
      line1a,
      line1z: line1a,
      line9: line1a,
      line11a: line1a,
      line11b: line1a,
      line12e,
      line14: line12e,
      line15,
      line16,
      line18: line16,
      line22: line16,
      line24: line16,
      line25a,
      line25d: line25a,
      line33: line25a,
      line34: refund,
      line35a: refund,
      line37: owed
    },
    computationVersion: version,
    version
  };

  assertTaxComputationInvariants(computation);
  return computation;
}
