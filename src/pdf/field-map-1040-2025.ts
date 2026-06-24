export type Form1040SemanticField =
  | "taxpayer.firstNameMiddleInitial"
  | "taxpayer.lastName"
  | "taxpayer.ssn"
  | "spouse.firstNameMiddleInitial"
  | "spouse.lastName"
  | "spouse.ssn"
  | "address.street"
  | "address.apartment"
  | "address.city"
  | "address.state"
  | "address.zip"
  | "mainHomeUS"
  | "filingStatus.single"
  | "filingStatus.mfj"
  | "filingStatus.mfs"
  | "mfs.spouseFullName"
  | "mfs.livedApart"
  | "digitalAssets.yes"
  | "digitalAssets.no"
  | "line1a"
  | "line1z"
  | "line9"
  | "line11a"
  | "line11b"
  | "line12e"
  | "line14"
  | "line15"
  | "line16"
  | "line18"
  | "line22"
  | "line24"
  | "line25a"
  | "line25d"
  | "line33"
  | "line34"
  | "line35a"
  | "line37"
  | "thirdPartyDesignee.no";

export type FieldKind = "text" | "checkbox";

export type FieldMapEntry = {
  rawName: string;
  kind: FieldKind;
};

export const FORM_1040_2025_FIELD_MAP: Record<Form1040SemanticField, FieldMapEntry> = {
  "taxpayer.firstNameMiddleInitial": { rawName: "topmostSubform[0].Page1[0].f1_14[0]", kind: "text" },
  "taxpayer.lastName": { rawName: "topmostSubform[0].Page1[0].f1_15[0]", kind: "text" },
  "taxpayer.ssn": { rawName: "topmostSubform[0].Page1[0].f1_16[0]", kind: "text" },
  "spouse.firstNameMiddleInitial": { rawName: "topmostSubform[0].Page1[0].f1_17[0]", kind: "text" },
  "spouse.lastName": { rawName: "topmostSubform[0].Page1[0].f1_18[0]", kind: "text" },
  "spouse.ssn": { rawName: "topmostSubform[0].Page1[0].f1_19[0]", kind: "text" },
  "address.street": { rawName: "topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_20[0]", kind: "text" },
  "address.apartment": { rawName: "topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_21[0]", kind: "text" },
  "address.city": { rawName: "topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_22[0]", kind: "text" },
  "address.state": { rawName: "topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_23[0]", kind: "text" },
  "address.zip": { rawName: "topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_24[0]", kind: "text" },
  mainHomeUS: { rawName: "topmostSubform[0].Page1[0].c1_5[0]", kind: "checkbox" },
  "filingStatus.single": { rawName: "topmostSubform[0].Page1[0].Checkbox_ReadOrder[0].c1_8[0]", kind: "checkbox" },
  "filingStatus.mfj": { rawName: "topmostSubform[0].Page1[0].Checkbox_ReadOrder[0].c1_8[1]", kind: "checkbox" },
  "filingStatus.mfs": { rawName: "topmostSubform[0].Page1[0].Checkbox_ReadOrder[0].c1_8[2]", kind: "checkbox" },
  "mfs.spouseFullName": { rawName: "topmostSubform[0].Page1[0].f1_29[0]", kind: "text" },
  "mfs.livedApart": { rawName: "topmostSubform[0].Page1[0].c1_32[0]", kind: "checkbox" },
  "digitalAssets.yes": { rawName: "topmostSubform[0].Page1[0].c1_10[0]", kind: "checkbox" },
  "digitalAssets.no": { rawName: "topmostSubform[0].Page1[0].c1_10[1]", kind: "checkbox" },
  line1a: { rawName: "topmostSubform[0].Page1[0].f1_47[0]", kind: "text" },
  line1z: { rawName: "topmostSubform[0].Page1[0].f1_57[0]", kind: "text" },
  line9: { rawName: "topmostSubform[0].Page1[0].f1_73[0]", kind: "text" },
  line11a: { rawName: "topmostSubform[0].Page1[0].f1_75[0]", kind: "text" },
  line11b: { rawName: "topmostSubform[0].Page2[0].f2_01[0]", kind: "text" },
  line12e: { rawName: "topmostSubform[0].Page2[0].f2_02[0]", kind: "text" },
  line14: { rawName: "topmostSubform[0].Page2[0].f2_05[0]", kind: "text" },
  line15: { rawName: "topmostSubform[0].Page2[0].f2_06[0]", kind: "text" },
  line16: { rawName: "topmostSubform[0].Page2[0].f2_08[0]", kind: "text" },
  line18: { rawName: "topmostSubform[0].Page2[0].f2_10[0]", kind: "text" },
  line22: { rawName: "topmostSubform[0].Page2[0].f2_14[0]", kind: "text" },
  line24: { rawName: "topmostSubform[0].Page2[0].f2_16[0]", kind: "text" },
  line25a: { rawName: "topmostSubform[0].Page2[0].f2_17[0]", kind: "text" },
  line25d: { rawName: "topmostSubform[0].Page2[0].f2_20[0]", kind: "text" },
  line33: { rawName: "topmostSubform[0].Page2[0].f2_29[0]", kind: "text" },
  line34: { rawName: "topmostSubform[0].Page2[0].f2_30[0]", kind: "text" },
  line35a: { rawName: "topmostSubform[0].Page2[0].f2_31[0]", kind: "text" },
  line37: { rawName: "topmostSubform[0].Page2[0].f2_35[0]", kind: "text" },
  "thirdPartyDesignee.no": { rawName: "topmostSubform[0].Page2[0].c2_17[1]", kind: "checkbox" }
};

export const FORBIDDEN_SEMANTIC_FIELDS: readonly Form1040SemanticField[] = [
  "digitalAssets.yes"
];
