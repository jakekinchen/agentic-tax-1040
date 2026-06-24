import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFCheckBox, PDFDropdown, PDFDocument, PDFOptionList, PDFRadioGroup, PDFTextField } from "pdf-lib";
import { IRS_ASSET_DIR, readJson, sha256, writeJson, type SourceRecord } from "./shared.js";

type FieldReport = {
  name: string;
  type: string;
  page: number | null;
  rect: { x: number; y: number; width: number; height: number } | null;
  options: string[];
};

function fieldType(field: unknown): string {
  if (field instanceof PDFTextField) return "text";
  if (field instanceof PDFCheckBox) return "checkbox";
  if (field instanceof PDFRadioGroup) return "radio";
  if (field instanceof PDFDropdown) return "dropdown";
  if (field instanceof PDFOptionList) return "optionList";
  return field?.constructor?.name ?? "unknown";
}

function optionsFor(field: unknown): string[] {
  if (field instanceof PDFRadioGroup) return field.getOptions();
  if (field instanceof PDFDropdown) return field.getOptions();
  if (field instanceof PDFOptionList) return field.getOptions();
  if (field instanceof PDFCheckBox) return ["checked", "unchecked"];
  return [];
}

const bytes = await readFile(join(IRS_ASSET_DIR, "f1040.pdf"));
const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
const form = doc.getForm();
const sourceRecords = await readJson<SourceRecord[]>(join(IRS_ASSET_DIR, "sources.json"));
const formSource = sourceRecords.find((record) => record.document === "Form 1040");
if (!formSource) throw new Error("Missing Form 1040 source record");

const fields: FieldReport[] = form.getFields().map((field) => {
  const widgets = field.acroField.getWidgets();
  const rect = widgets[0]?.getRectangle() ?? null;
  return {
    name: field.getName(),
    type: fieldType(field),
    page: null,
    rect,
    options: optionsFor(field)
  };
});

await writeJson(join(IRS_ASSET_DIR, "f1040-fields.json"), {
  taxYear: 2025,
  sourceSha256: sha256(bytes),
  sourceUrl: formSource.sourceUrl,
  xfaPresent: false,
  fieldCount: fields.length,
  fields
});

console.log(`Wrote ${fields.length} fields`);
