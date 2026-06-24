import fieldInventory from "../../assets/irs/2025/f1040-fields.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { FORM_1040_2025_FIELD_MAP, type Form1040SemanticField } from "../../src/pdf/field-map-1040-2025.js";

const requiredSemanticFields: Form1040SemanticField[] = [
  "taxpayer.firstNameMiddleInitial",
  "taxpayer.lastName",
  "taxpayer.ssn",
  "spouse.firstNameMiddleInitial",
  "spouse.lastName",
  "spouse.ssn",
  "address.street",
  "address.apartment",
  "address.city",
  "address.state",
  "address.zip",
  "mainHomeUS",
  "filingStatus.single",
  "filingStatus.mfj",
  "filingStatus.mfs",
  "mfs.spouseFullName",
  "digitalAssets.yes",
  "digitalAssets.no",
  "line1a",
  "line1z",
  "line9",
  "line11a",
  "line11b",
  "line12e",
  "line14",
  "line15",
  "line16",
  "line18",
  "line22",
  "line24",
  "line25a",
  "line25d",
  "line33",
  "line34",
  "line35a",
  "line37",
  "thirdPartyDesignee.no"
];

describe("2025 Form 1040 field map", () => {
  it("is tied to tax year 2025", () => {
    expect((fieldInventory as { taxYear: number }).taxYear).toBe(2025);
  });

  it("maps every required semantic key to an existing raw field of the expected type", () => {
    const fields = new Map(
      (fieldInventory as { fields: Array<{ name: string; type: string }> }).fields.map((field) => [field.name, field])
    );

    for (const semantic of requiredSemanticFields) {
      const entry = FORM_1040_2025_FIELD_MAP[semantic];
      expect(entry, semantic).toBeTruthy();
      const raw = fields.get(entry.rawName);
      expect(raw, `${semantic} -> ${entry.rawName}`).toBeTruthy();
      expect(raw?.type, semantic).toBe(entry.kind);
    }
  });
});
