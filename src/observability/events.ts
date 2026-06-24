import { nanoid } from "nanoid";
import { z } from "zod";

export const AuditEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  category: z.enum(["session", "chat", "model", "tool", "guardrail", "state", "artifact"]),
  name: z.string(),
  status: z.enum(["started", "succeeded", "blocked", "failed"]),
  durationMs: z.number().int().nonnegative().optional(),
  summary: z.string(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;

export function event(input: Omit<AuditEvent, "id" | "at">): AuditEvent {
  return {
    id: nanoid(12),
    at: new Date().toISOString(),
    ...input,
    metadata: redactEventMetadata(input.metadata)
  };
}

export const makeEvent = event;

export function redactEventMetadata(metadata: AuditEvent["metadata"]): AuditEvent["metadata"] {
  const safe: AuditEvent["metadata"] = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lowered = key.toLowerCase();
    if (
      lowered.includes("ssn") ||
      lowered.includes("ein") ||
      lowered.includes("address") ||
      lowered.includes("bytes") ||
      lowered.includes("pdf") ||
      lowered.includes("cookie") ||
      lowered.includes("prompt") ||
      lowered.includes("output")
    ) {
      safe[key] = "[redacted]";
    } else {
      safe[key] = value;
    }
  }
  return safe;
}
