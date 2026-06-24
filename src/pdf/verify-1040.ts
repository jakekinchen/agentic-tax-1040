import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { assertSafeFilename } from "./artifact-name.js";

export type PdfPostconditionInput = {
  sourceBytes: Uint8Array;
  outputBytes: Uint8Array;
  filename: string;
  expectedPageCount: 2;
};

export async function verify1040Postconditions(input: PdfPostconditionInput): Promise<{ sha256: string; pageCount: 2 }> {
  assertSafeFilename(input.filename);
  const header = Buffer.from(input.outputBytes.slice(0, 5)).toString("ascii");
  if (header !== "%PDF-") {
    throw new Error("Generated artifact is not a PDF.");
  }
  if (input.outputBytes.length < 10_000) {
    throw new Error("Generated PDF is unexpectedly small.");
  }
  const outputHash = createHash("sha256").update(input.outputBytes).digest("hex");
  const sourceHash = createHash("sha256").update(input.sourceBytes).digest("hex");
  if (outputHash === sourceHash) {
    throw new Error("Generated PDF hash matches blank source hash.");
  }
  const pdf = await PDFDocument.load(input.outputBytes, { ignoreEncryption: false });
  if (pdf.getPageCount() !== input.expectedPageCount) {
    throw new Error(`Generated PDF page count mismatch: ${pdf.getPageCount()}`);
  }
  const remainingFields = pdf.getForm().getFields();
  if (remainingFields.length !== 0) {
    throw new Error(`Generated PDF still exposes ${remainingFields.length} editable fields.`);
  }
  return { sha256: outputHash, pageCount: 2 };
}
