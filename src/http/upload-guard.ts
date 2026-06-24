import { fileTypeFromBuffer } from "file-type";
import { PDFDocument } from "pdf-lib";
import type { AppConfig } from "../config.js";
import type { PendingUpload } from "../domain/session.js";
import { PublicError } from "./errors.js";

const accepted = new Set(["application/pdf", "image/png", "image/jpeg"]);

export async function validateUpload(args: {
  bytes: Uint8Array;
  declaredMime?: string;
  syntheticAcknowledgement: boolean;
  config: AppConfig;
}): Promise<PendingUpload> {
  if (!args.syntheticAcknowledgement) {
    throw new PublicError("Synthetic-data acknowledgement is required before upload.", 400, "synthetic_ack_required");
  }
  if (args.bytes.byteLength <= 0) throw new PublicError("Upload is empty.", 400, "empty_upload");
  if (args.bytes.byteLength > args.config.MAX_UPLOAD_BYTES) throw new PublicError("Upload is larger than the 8 MiB limit.", 413, "upload_too_large");

  const sniffed = await fileTypeFromBuffer(args.bytes);
  const detectedMime = sniffed?.mime;
  if (!detectedMime || !accepted.has(detectedMime)) {
    throw new PublicError("Only PDF, PNG, and JPEG W-2 uploads are accepted.", 400, "unsupported_upload_type");
  }
  if (args.declaredMime && accepted.has(args.declaredMime) && args.declaredMime !== detectedMime) {
    throw new PublicError("The uploaded file type does not match its content.", 400, "mime_mismatch");
  }

  if (detectedMime === "application/pdf") {
    let pageCount: number;
    try {
      const doc = await PDFDocument.load(args.bytes, { ignoreEncryption: false });
      pageCount = doc.getPageCount();
    } catch {
      throw new PublicError("The uploaded PDF could not be read or appears encrypted.", 400, "bad_pdf");
    }
    if (pageCount > 12) throw new PublicError("The uploaded PDF has too many pages.", 400, "pdf_too_many_pages");
    return { bytes: args.bytes, detectedMime, originalSize: args.bytes.byteLength, pageCount };
  }

  return { bytes: args.bytes, detectedMime: detectedMime as "image/png" | "image/jpeg", originalSize: args.bytes.byteLength };
}
