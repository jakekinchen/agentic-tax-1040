import type { CanonicalW2 } from "../domain/w2.js";

export function safeArtifactName(w2: CanonicalW2): string {
  const last = w2.employee.lastName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const slug = last.length > 0 ? last : "taxpayer";
  return `2025-form-1040-draft-${slug}.pdf`;
}

export function assertSafeFilename(filename: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(filename) || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    throw new Error(`Unsafe artifact filename: ${filename}`);
  }
}
