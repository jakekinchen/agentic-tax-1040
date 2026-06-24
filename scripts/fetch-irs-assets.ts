import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { IRS_ASSET_DIR, type SourceRecord, sha256, writeJson } from "./shared.js";

const SOURCES = [
  {
    document: "Form 1040",
    filename: "f1040.pdf",
    sourceUrl: "https://www.irs.gov/pub/irs-prior/f1040--2025.pdf"
  },
  {
    document: "Form 1040 Instructions",
    filename: "i1040gi.pdf",
    sourceUrl: "https://www.irs.gov/pub/irs-prior/i1040gi--2025.pdf"
  },
  {
    document: "Form W-2",
    filename: "fw2.pdf",
    sourceUrl: "https://www.irs.gov/pub/irs-prior/fw2--2025.pdf"
  }
] as const;

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: { "user-agent": "agentic-tax-1040 asset fetcher" }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
  return doc.getPageCount();
}

const retrievedAt = new Date().toISOString();
const records: SourceRecord[] = [];

for (const source of SOURCES) {
  const bytes = await download(source.sourceUrl);
  const pageCount = await pdfPageCount(bytes);
  const path = join(IRS_ASSET_DIR, source.filename);
  await writeFile(path, bytes);
  records.push({
    document: source.document,
    taxYear: 2025,
    sourceUrl: source.sourceUrl,
    retrievedAt,
    sha256: sha256(bytes),
    pageCount
  });
  console.log(`${source.filename}: ${bytes.byteLength} bytes, ${pageCount} pages`);
}

await writeJson(join(IRS_ASSET_DIR, "sources.json"), records);
