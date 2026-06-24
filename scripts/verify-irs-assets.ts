import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { IRS_ASSET_DIR, readJson, sha256 } from "./shared.js";

const SourceSchema = z.array(z.object({
  document: z.string(),
  taxYear: z.literal(2025),
  sourceUrl: z.string().url(),
  retrievedAt: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  pageCount: z.number().int().positive()
}));

const filenamesByDocument = new Map([
  ["Form 1040", "f1040.pdf"],
  ["Form 1040 Instructions", "i1040gi.pdf"],
  ["Form W-2", "fw2.pdf"]
]);

async function verifyPdf(record: z.infer<typeof SourceSchema>[number]): Promise<void> {
  const filename = filenamesByDocument.get(record.document);
  if (!filename) throw new Error(`No filename configured for ${record.document}`);
  const bytes = await readFile(join(IRS_ASSET_DIR, filename));
  const digest = sha256(bytes);
  if (digest !== record.sha256) {
    throw new Error(`${filename} hash mismatch: expected ${record.sha256}, got ${digest}`);
  }
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
  if (doc.getPageCount() !== record.pageCount) {
    throw new Error(`${filename} page count mismatch`);
  }
}

const sources = SourceSchema.parse(await readJson(join(IRS_ASSET_DIR, "sources.json")));
for (const source of sources) {
  await verifyPdf(source);
}

const taxTable = z.object({
  taxYear: z.literal(2025),
  source: z.string(),
  rows: z.array(z.object({
    atLeast: z.number().int().nonnegative(),
    lessThan: z.number().int().positive(),
    single: z.number().int().nonnegative(),
    marriedFilingJointly: z.number().int().nonnegative(),
    marriedFilingSeparately: z.number().int().nonnegative(),
    headOfHousehold: z.number().int().nonnegative()
  })).min(1)
}).parse(await readJson(join(IRS_ASSET_DIR, "tax-table-2025.json")));

const fields = z.object({
  taxYear: z.literal(2025),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  xfaPresent: z.boolean(),
  fields: z.array(z.object({
    name: z.string(),
    type: z.string(),
    page: z.number().int().nullable(),
    rect: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).nullable(),
    options: z.array(z.string())
  }))
}).parse(await readJson(join(IRS_ASSET_DIR, "f1040-fields.json")));

if (taxTable.rows.length < 1_000) throw new Error("tax-table-2025.json is too small");
if (fields.fields.length < 20) throw new Error("f1040-fields.json has too few fields");

console.log("IRS assets verified");
