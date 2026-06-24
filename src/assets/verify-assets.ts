import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { FORM_1040_2025_FIELD_MAP } from "../pdf/field-map-1040-2025.js";

type SourceRecord = {
  document: string;
  taxYear: number;
  sha256: string;
  pageCount: number;
};

type FieldInventory = {
  taxYear: number;
  sourceSha256: string;
  fields: Array<{ name: string; type: string }>;
};

type TaxRow = {
  atLeast: number;
  lessThan: number;
  single: number;
  marriedFilingJointly: number;
  marriedFilingSeparately: number;
  headOfHousehold: number;
};

type TaxTableAsset = {
  taxYear: number;
  rows: TaxRow[];
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fileNameFor(documentName: string): string {
  switch (documentName) {
    case "Form 1040":
      return "f1040.pdf";
    case "Form 1040 Instructions":
      return "i1040gi.pdf";
    case "Form W-2":
      return "fw2.pdf";
    default:
      throw new Error(`Unknown IRS source document: ${documentName}`);
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

export async function verifyRuntimeAssets(): Promise<true> {
  const root = resolve(process.cwd(), "assets", "irs", "2025");
  const sources = await readJson<SourceRecord[]>(resolve(root, "sources.json"));
  if (sources.length !== 3) throw new Error("IRS sources.json must contain three source records.");

  for (const source of sources) {
    if (source.taxYear !== 2025) throw new Error(`${source.document} is not recorded as tax year 2025.`);
    const bytes = await readFile(resolve(root, fileNameFor(source.document)));
    if (sha256(bytes) !== source.sha256) throw new Error(`${source.document} hash does not match sources.json.`);
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
    if (pdf.getPageCount() !== source.pageCount) throw new Error(`${source.document} page count does not match sources.json.`);
  }

  const tableAsset = await readJson<TaxTableAsset>(resolve(root, "tax-table-2025.json"));
  if (tableAsset.taxYear !== 2025) throw new Error("2025 tax table asset has the wrong tax year.");
  const table = tableAsset.rows;
  if (table.length < 1_000) throw new Error("2025 tax table is absent or too short.");
  const low = table.find((row) => row.atLeast === 8_500 && row.lessThan === 8_550);
  if (!low || low.single !== 853 || low.marriedFilingJointly !== 853 || low.marriedFilingSeparately !== 853 || low.headOfHousehold !== 853) {
    throw new Error("2025 tax table sentinel 8500-8550 is invalid.");
  }
  const sample = table.find((row) => row.atLeast === 24_250 && row.lessThan === 24_300);
  if (!sample || sample.single !== 2_675 || sample.marriedFilingJointly !== 2_436 || sample.marriedFilingSeparately !== 2_675 || sample.headOfHousehold !== 2_573) {
    throw new Error("2025 tax table sentinel 24250-24300 is invalid.");
  }

  const fieldInventory = await readJson<FieldInventory>(resolve(root, "f1040-fields.json"));
  if (fieldInventory.taxYear !== 2025) throw new Error("Form 1040 field inventory is not for tax year 2025.");
  const form1040 = sources.find((source) => source.document === "Form 1040");
  if (!form1040 || fieldInventory.sourceSha256 !== form1040.sha256) throw new Error("Form 1040 field inventory hash does not match source PDF.");
  const fields = new Map(fieldInventory.fields.map((field) => [field.name, field.type]));
  for (const [semantic, mapping] of Object.entries(FORM_1040_2025_FIELD_MAP)) {
    const actual = fields.get(mapping.rawName);
    if (!actual) throw new Error(`Mapped IRS field is missing: ${semantic}`);
    if (actual !== mapping.kind) throw new Error(`Mapped IRS field type mismatch for ${semantic}: ${actual} !== ${mapping.kind}`);
  }

  return true;
}
