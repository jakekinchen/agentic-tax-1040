import { cents, parseMoneyToCents } from "../domain/money.js";
import type { CanonicalW2 } from "../domain/w2.js";
import { CanonicalW2Schema } from "../domain/w2.js";
import type { ExtractedW2 } from "./extraction-schema.js";

const CRITICAL_FIELDS = [
  "taxYear",
  "employee.firstName",
  "employee.lastName",
  "employee.ssn",
  "employee.address",
  "boxes.box1Wages",
  "boxes.box2FederalWithholding"
] as const;

function required<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined || value === "") {
    throw new Error(`Missing critical W-2 field: ${field}`);
  }
  return value;
}

export function canonicalizeExtractedW2(extracted: ExtractedW2): CanonicalW2 {
  const unreadable = new Set(extracted.extraction.unreadableFields);
  for (const field of CRITICAL_FIELDS) {
    const top = field.split(".")[0];
    if (top && unreadable.has(field)) {
      throw new Error(`Critical W-2 field unreadable: ${field}`);
    }
  }
  const confidenceByField = Object.fromEntries(
    extracted.extraction.confidenceByField.map((entry) => [entry.field, entry.confidence])
  );

  const canonical: CanonicalW2 = {
    taxYear: required(extracted.taxYear, "taxYear") as 2025,
    employee: {
      firstName: required(extracted.employee.firstName, "employee.firstName"),
      ...(extracted.employee.middleInitial ? { middleInitial: extracted.employee.middleInitial.slice(0, 1) } : {}),
      lastName: required(extracted.employee.lastName, "employee.lastName"),
      ssn: required(extracted.employee.ssn, "employee.ssn"),
      address: {
        street: required(extracted.employee.address.street, "employee.address.street"),
        ...(extracted.employee.address.apartment ? { apartment: extracted.employee.address.apartment } : {}),
        city: required(extracted.employee.address.city, "employee.address.city"),
        state: required(extracted.employee.address.state, "employee.address.state").toUpperCase(),
        zip: required(extracted.employee.address.zip, "employee.address.zip")
      }
    },
    employer: {
      name: required(extracted.employer.name, "employer.name"),
      ...(extracted.employer.ein ? { ein: extracted.employer.ein } : {}),
      ...(extracted.employer.address
        ? {
            address: {
              street: required(extracted.employer.address.street, "employer.address.street"),
              city: required(extracted.employer.address.city, "employer.address.city"),
              state: required(extracted.employer.address.state, "employer.address.state").toUpperCase(),
              zip: required(extracted.employer.address.zip, "employer.address.zip")
            }
          }
        : {})
    },
    boxes: {
      box1WagesCents: parseMoneyToCents(required(extracted.boxes.box1Wages, "boxes.box1Wages")),
      box2FederalWithholdingCents: parseMoneyToCents(required(extracted.boxes.box2FederalWithholding, "boxes.box2FederalWithholding")),
      ...(extracted.boxes.box3SocialSecurityWages ? { box3SocialSecurityWagesCents: parseMoneyToCents(extracted.boxes.box3SocialSecurityWages) } : {}),
      ...(extracted.boxes.box4SocialSecurityTax ? { box4SocialSecurityTaxCents: parseMoneyToCents(extracted.boxes.box4SocialSecurityTax) } : {}),
      ...(extracted.boxes.box5MedicareWages ? { box5MedicareWagesCents: parseMoneyToCents(extracted.boxes.box5MedicareWages) } : {}),
      ...(extracted.boxes.box6MedicareTax ? { box6MedicareTaxCents: parseMoneyToCents(extracted.boxes.box6MedicareTax) } : {}),
      box12: extracted.boxes.box12.map((box) => ({ code: box.code.toUpperCase(), amountCents: parseMoneyToCents(box.amount) })),
      box13: extracted.boxes.box13,
      stateRows: extracted.boxes.stateRows.map((row) => ({
        state: row.state.toUpperCase(),
        ...(row.stateWages ? { stateWagesCents: parseMoneyToCents(row.stateWages) } : {}),
        ...(row.stateWithholding ? { stateWithholdingCents: parseMoneyToCents(row.stateWithholding) } : {})
      }))
    },
    extraction: {
      multipleDistinctW2sDetected: extracted.extraction.multipleDistinctW2sDetected,
      unreadableFields: extracted.extraction.unreadableFields,
      warnings: extracted.extraction.warnings,
      confidenceByField
    }
  };

  return CanonicalW2Schema.parse(canonical);
}

export function validateW2Sanity(w2: CanonicalW2): string[] {
  const warnings: string[] = [];
  if (w2.taxYear !== 2025) throw new Error("Tax year must be 2025.");
  if (w2.boxes.box1WagesCents < 3_000_000 || w2.boxes.box1WagesCents > 5_000_000) {
    throw new Error("W-2 wages are outside the supported $30,000-$50,000 range.");
  }
  if (w2.boxes.box2FederalWithholdingCents < 0) throw new Error("Box 2 withholding must be nonnegative.");
  if (w2.boxes.box2FederalWithholdingCents > w2.boxes.box1WagesCents) throw new Error("Box 2 withholding cannot exceed box 1 wages.");
  if (!/^\d{3}-\d{2}-\d{4}$/.test(w2.employee.ssn)) throw new Error("Employee SSN is not syntactically valid.");
  if (w2.extraction.multipleDistinctW2sDetected) throw new Error("Multiple distinct W-2s detected.");
  if (w2.boxes.box3SocialSecurityWagesCents && Math.abs(w2.boxes.box3SocialSecurityWagesCents - w2.boxes.box1WagesCents) > 500_000) {
    warnings.push("Social Security wages differ materially from box 1.");
  }
  if (w2.boxes.box4SocialSecurityTaxCents && w2.boxes.box4SocialSecurityTaxCents <= cents(0)) {
    warnings.push("Social Security tax is zero or missing.");
  }
  return warnings;
}
