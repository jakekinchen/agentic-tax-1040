import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fieldInventory from "../assets/irs/2025/f1040-fields.json" with { type: "json" };
import { FORM_1040_2025_FIELD_MAP, type Form1040SemanticField } from "../src/pdf/field-map-1040-2025.js";

const execFileAsync = promisify(execFile);

type InventoryField = {
  name: string;
  type: string;
  rect: { x: number; y: number; width: number; height: number } | null;
};

const outputPdf = resolve(process.cwd(), "tests", "artifacts", "f1040-field-rectangles.pdf");
const outputPrefix = resolve(process.cwd(), "tests", "artifacts", "f1040-field-rectangles");

function pageIndexFor(rawName: string): number {
  return rawName.includes("Page2") ? 1 : 0;
}

function shortLabel(semantic: string): string {
  const parts = semantic.split(".");
  return parts[parts.length - 1] ?? semantic;
}

const semanticByRaw = new Map<string, Form1040SemanticField>(
  Object.entries(FORM_1040_2025_FIELD_MAP).map(([semantic, entry]) => [entry.rawName, semantic as Form1040SemanticField])
);

await mkdir(dirname(outputPdf), { recursive: true });

const sourceBytes = await readFile(resolve(process.cwd(), "assets", "irs", "2025", "f1040.pdf"));
const pdf = await PDFDocument.load(sourceBytes, { ignoreEncryption: false });
if (pdf.getForm().hasXFA()) {
  pdf.getForm().deleteXFA();
}
const font = await pdf.embedFont(StandardFonts.Helvetica);
const pages = pdf.getPages();

for (const [pageNumber, page] of pages.entries()) {
  const { height } = page.getSize();
  page.drawRectangle({
    x: 36,
    y: height - 32,
    width: 334,
    height: 18,
    borderColor: rgb(0.05, 0.25, 0.95),
    borderWidth: 0.6,
    color: rgb(1, 1, 1),
    opacity: 0.85
  });
  page.drawText(`Field rectangle overlay - page ${pageNumber + 1}. Blue = mapped fields, pink = other AcroForm fields.`, {
    x: 40,
    y: height - 26,
    size: 7,
    font,
    color: rgb(0.05, 0.15, 0.45)
  });
}

for (const field of (fieldInventory as { fields: InventoryField[] }).fields) {
  if (!field.rect) continue;
  const page = pages[pageIndexFor(field.name)];
  if (!page) continue;
  const semantic = semanticByRaw.get(field.name);
  const isMapped = Boolean(semantic);
  const borderColor = isMapped ? rgb(0.05, 0.25, 0.95) : rgb(0.95, 0.15, 0.55);
  const labelColor = isMapped ? rgb(0.05, 0.15, 0.55) : rgb(0.7, 0.05, 0.35);
  page.drawRectangle({
    x: field.rect.x,
    y: field.rect.y,
    width: field.rect.width,
    height: field.rect.height,
    borderColor,
    borderWidth: isMapped ? 0.9 : 0.35,
    opacity: 0,
    borderOpacity: isMapped ? 0.95 : 0.55
  });
  if (semantic) {
    const label = shortLabel(semantic);
    const y = Math.max(field.rect.y + field.rect.height - 5, field.rect.y + 1);
    page.drawText(label, {
      x: field.rect.x + 1,
      y,
      size: 4.5,
      font,
      color: labelColor
    });
  }
}

const bytes = await pdf.save({ useObjectStreams: false });
await writeFile(outputPdf, bytes);

try {
  await execFileAsync("pdftoppm", ["-png", "-r", "150", outputPdf, outputPrefix]);
  console.log(`Wrote ${outputPdf}`);
  console.log(`Rendered ${outputPrefix}-1.png and ${outputPrefix}-2.png`);
} catch (error) {
  console.log(`Wrote ${outputPdf}`);
  console.log(`Could not render PNGs with pdftoppm: ${error instanceof Error ? error.message : String(error)}`);
}
