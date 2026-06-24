import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import fieldInventory from "../../assets/irs/2025/f1040-fields.json" with { type: "json" };
import { PDFCheckBox, PDFDocument, PDFTextField, rgb } from "pdf-lib";
import type { FilingDetails } from "../domain/filing.js";
import type { TaxComputation } from "../domain/return.js";
import type { CanonicalW2 } from "../domain/w2.js";
import { assertTaxComputationInvariants } from "../tax/invariants.js";
import { safeArtifactName } from "./artifact-name.js";
import {
  FORM_1040_2025_FIELD_MAP,
  type Form1040SemanticField
} from "./field-map-1040-2025.js";
import { verify1040Postconditions } from "./verify-1040.js";

export type Fill1040Input = {
  w2: CanonicalW2;
  filing: FilingDetails;
  mainHomeInUS: boolean;
  computation: TaxComputation;
};

export type Filled1040Artifact = {
  bytes: Uint8Array;
  filename: string;
  sha256: string;
  pageCount: 2;
  createdAt: string;
  filledFields: Partial<Record<Form1040SemanticField, string | boolean>>;
};

type InventoryField = {
  name: string;
  rect: { x: number; y: number; width: number; height: number };
};

type TextDraw = {
  semantic: Form1040SemanticField;
  text: string;
};

const fieldRects = new Map(
  (fieldInventory as { fields: InventoryField[] }).fields.map((field) => [field.name, field.rect])
);

function ensurePdfText(text: string): string {
  if (!/^[\x20-\x7E]*$/.test(text)) {
    throw new Error(`Unsupported character for IRS PDF font in value: ${text}`);
  }
  return text;
}

function whole(value: number | null): string {
  return value === null ? "" : String(value);
}

function firstMiddle(firstName: string, middleInitial?: string): string {
  return ensurePdfText(middleInitial ? `${firstName} ${middleInitial}` : firstName);
}

function ssnDigits(ssn: string): string {
  return ssn.replaceAll("-", "");
}

function spouseFullName(filing: FilingDetails): string {
  if (filing.status === "single") return "";
  return ensurePdfText(`${filing.spouse.firstName}${filing.spouse.middleInitial ? ` ${filing.spouse.middleInitial}` : ""} ${filing.spouse.lastName}`);
}

function pageIndexFor(entry: { rawName: string }): number {
  return entry.rawName.includes("Page2") ? 1 : 0;
}

function drawY(rect: InventoryField["rect"], fontSize: number): number {
  return rect.y + (rect.height - fontSize) / 2 + fontSize * 0.22;
}

function isAmountField(field: Form1040SemanticField): boolean {
  return field.startsWith("line");
}

function isCombField(field: Form1040SemanticField): boolean {
  return field === "taxpayer.ssn" || field === "spouse.ssn";
}

function isCenteredField(field: Form1040SemanticField): boolean {
  return field === "address.state" || field === "address.zip";
}

export async function fill1040For2025(input: Fill1040Input): Promise<Filled1040Artifact> {
  assertTaxComputationInvariants(input.computation);
  const sourcePath = resolve(process.cwd(), "assets", "irs", "2025", "f1040.pdf");
  const sourceBytes = await readFile(sourcePath);
  const fontBytes = await readFile(resolve(process.cwd(), "assets", "fonts", "NotoSans-Regular.ttf"));
  const pdf = await PDFDocument.load(sourceBytes, { ignoreEncryption: false });
  pdf.registerFontkit(fontkit);
  const form = pdf.getForm();
  if (form.hasXFA()) {
    form.deleteXFA();
  }
  const font = await pdf.embedFont(fontBytes);

  const filledFields: Partial<Record<Form1040SemanticField, string | boolean>> = {};
  const visibleCheckFields: Form1040SemanticField[] = [];
  const visibleTextFields: TextDraw[] = [];

  const setText = (field: Form1040SemanticField, value: string | number | null) => {
    const entry = FORM_1040_2025_FIELD_MAP[field];
    const text = ensurePdfText(value === null ? "" : String(value));
    const pdfField = form.getField(entry.rawName);
    if (!(pdfField instanceof PDFTextField)) {
      throw new Error(`${field} is not a PDF text field.`);
    }
    if (text) {
      filledFields[field] = text;
      visibleTextFields.push({ semantic: field, text });
    }
  };

  const setCheck = (field: Form1040SemanticField, checked: boolean) => {
    const entry = FORM_1040_2025_FIELD_MAP[field];
    const pdfField = form.getField(entry.rawName);
    if (!(pdfField instanceof PDFCheckBox)) {
      throw new Error(`${field} is not a PDF checkbox.`);
    }
    filledFields[field] = checked;
    if (checked) visibleCheckFields.push(field);
  };

  setText("taxpayer.firstNameMiddleInitial", firstMiddle(input.w2.employee.firstName, input.w2.employee.middleInitial));
  setText("taxpayer.lastName", input.w2.employee.lastName);
  setText("taxpayer.ssn", ssnDigits(input.w2.employee.ssn));
  setText("address.street", input.w2.employee.address.street);
  setText("address.apartment", input.w2.employee.address.apartment ?? "");
  setText("address.city", input.w2.employee.address.city);
  setText("address.state", input.w2.employee.address.state);
  setText("address.zip", input.w2.employee.address.zip);

  setCheck("mainHomeUS", input.mainHomeInUS);
  setCheck("filingStatus.single", input.filing.status === "single");
  setCheck("filingStatus.mfj", input.filing.status === "married_filing_jointly");
  setCheck("filingStatus.mfs", input.filing.status === "married_filing_separately");

  if (input.filing.status !== "single") {
    setText("spouse.firstNameMiddleInitial", firstMiddle(input.filing.spouse.firstName, input.filing.spouse.middleInitial));
    setText("spouse.lastName", input.filing.spouse.lastName);
    setText("spouse.ssn", ssnDigits(input.filing.spouse.ssn));
  }
  if (input.filing.status === "married_filing_separately") {
    setText("mfs.spouseFullName", spouseFullName(input.filing));
    setCheck("mfs.livedApart", input.filing.livedApartOrLegallySeparated);
  }

  setCheck("digitalAssets.yes", false);
  setCheck("digitalAssets.no", true);

  const lines = input.computation.lines;
  setText("line1a", lines.line1a);
  setText("line1z", lines.line1z);
  setText("line9", lines.line9);
  setText("line11a", lines.line11a);
  setText("line11b", lines.line11b);
  setText("line12e", lines.line12e);
  setText("line14", lines.line14);
  setText("line15", lines.line15);
  setText("line16", lines.line16);
  setText("line18", lines.line18);
  setText("line22", lines.line22);
  setText("line24", lines.line24);
  setText("line25a", lines.line25a);
  setText("line25d", lines.line25d);
  setText("line33", lines.line33);
  setText("line34", whole(lines.line34));
  setText("line35a", whole(lines.line35a));
  setText("line37", whole(lines.line37));
  setCheck("thirdPartyDesignee.no", true);

  form.updateFieldAppearances(font);
  form.flatten({ updateFieldAppearances: false });
  const pages = pdf.getPages();
  for (const { semantic, text } of visibleTextFields) {
    const entry = FORM_1040_2025_FIELD_MAP[semantic];
    const rect = fieldRects.get(entry.rawName);
    if (!rect) throw new Error(`Missing visual rectangle for ${semantic}`);
    const page = pages[pageIndexFor(entry)];
    if (!page) throw new Error(`Missing page for ${semantic}`);

    if (isCombField(semantic)) {
      const digits = text.replace(/\D/g, "");
      const fontSize = 7.2;
      const slotWidth = rect.width / Math.max(digits.length, 1);
      for (const [index, digit] of [...digits].entries()) {
        const width = font.widthOfTextAtSize(digit, fontSize);
        page.drawText(digit, {
          x: rect.x + slotWidth * index + (slotWidth - width) / 2,
          y: drawY(rect, fontSize),
          size: fontSize,
          font,
          color: rgb(0.04, 0.08, 0.55)
        });
      }
      continue;
    }

    const fontSize = isAmountField(semantic) ? 7.4 : 7.6;
    const width = font.widthOfTextAtSize(text, fontSize);
    const x = isAmountField(semantic)
      ? rect.x + rect.width - width - 2
      : isCenteredField(semantic)
        ? rect.x + (rect.width - width) / 2
        : rect.x + 2;
    page.drawText(text, {
      x,
      y: drawY(rect, fontSize),
      size: fontSize,
      font,
      color: rgb(0.04, 0.08, 0.55)
    });
  }
  for (const semantic of visibleCheckFields) {
    const entry = FORM_1040_2025_FIELD_MAP[semantic];
    const rect = fieldRects.get(entry.rawName);
    if (!rect) throw new Error(`Missing visual rectangle for ${semantic}`);
    const page = pages[pageIndexFor(entry)];
    if (!page) throw new Error(`Missing page for ${semantic}`);
    page.drawLine({
      start: { x: rect.x + 1, y: rect.y + 1 },
      end: { x: rect.x + rect.width - 1, y: rect.y + rect.height - 1 },
      thickness: 1,
      color: rgb(0, 0, 0)
    });
    page.drawLine({
      start: { x: rect.x + 1, y: rect.y + rect.height - 1 },
      end: { x: rect.x + rect.width - 1, y: rect.y + 1 },
      thickness: 1,
      color: rgb(0, 0, 0)
    });
  }
  const bytes = await pdf.save({ updateFieldAppearances: false, useObjectStreams: false });
  const filename = safeArtifactName(input.w2);
  const verified = await verify1040Postconditions({
    sourceBytes,
    outputBytes: bytes,
    filename,
    expectedPageCount: 2
  });

  return {
    bytes,
    filename,
    sha256: verified.sha256,
    pageCount: verified.pageCount,
    createdAt: new Date().toISOString(),
    filledFields
  };
}
