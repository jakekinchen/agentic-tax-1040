import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { sampleCanonicalW2 } from "../../src/domain/w2.js";
import { fill1040For2025 } from "../../src/pdf/fill-1040-2025.js";
import { compute2025Return } from "../../src/tax/compute-2025.js";

const run = promisify(execFile);

const scope = {
  noDependentsAndNotClaimable: true,
  under65AndNotBlind: true,
  onlyOneW2: true,
  standardDeduction: true,
  noMarketplaceSelfEmploymentForeignIncomeAdditionalTaxOrCredit: true,
  noSchedule1ADeductions: true
};

function ppmLooksNonblank(bytes: Uint8Array): boolean {
  const text = Buffer.from(bytes).toString("ascii", 0, Math.min(bytes.length, 128));
  const match = /^P6\s+(?:#[^\n]*\n\s*)*(\d+)\s+(\d+)\s+(\d+)\s/.exec(text);
  if (!match) return false;
  const headerLength = match[0].length;
  const pixels = bytes.slice(headerLength);
  let nonWhite = 0;
  for (let index = 0; index < pixels.length; index += 3) {
    const r = pixels[index] ?? 255;
    const g = pixels[index + 1] ?? 255;
    const b = pixels[index + 2] ?? 255;
    if (r < 245 || g < 245 || b < 245) nonWhite += 1;
    if (nonWhite > 1_000) return true;
  }
  return false;
}

describe("2025 Form 1040 PDF generation", () => {
  it("fills, flattens, and renders the sample Single return", async () => {
    const w2 = sampleCanonicalW2();
    const filing = { status: "single" as const };
    const computation = compute2025Return({
      w2,
      filing,
      scope,
      formFlags: { mainHomeInUS: true, digitalAssets: false }
    });
    const artifact = await fill1040For2025({ w2, filing, mainHomeInUS: true, computation });

    expect(artifact.pageCount).toBe(2);
    expect(artifact.filledFields.line35a).toBe("525");
    expect(artifact.filledFields.line37).toBeUndefined();

    const pdf = await PDFDocument.load(artifact.bytes, { ignoreEncryption: false });
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getForm().getFields()).toHaveLength(0);

    const artifactDir = resolve(process.cwd(), "tests", "artifacts");
    await mkdir(artifactDir, { recursive: true });
    const pdfPath = join(artifactDir, "sample-single-1040.pdf");
    const prefix = join(artifactDir, "sample-single-1040");
    await writeFile(pdfPath, artifact.bytes);
    await run("pdftoppm", ["-r", "72", pdfPath, prefix]);

    const page1 = await readFile(`${prefix}-1.ppm`);
    const page2 = await readFile(`${prefix}-2.ppm`);
    expect(ppmLooksNonblank(page1)).toBe(true);
    expect(ppmLooksNonblank(page2)).toBe(true);
  });
});
