import { z } from "zod";
import { QuestionIdSchema } from "../conversation/questions.js";

export const UnsupportedReasonSchema = z.enum([
  "second_w2",
  "unsupported_tax_year",
  "wages_outside_range",
  "box2_exceeds_wages",
  "critical_w2_fields_missing",
  "unsupported_w2_code",
  "unsupported_w2_box13",
  "dependent_or_claimable",
  "age_or_blind",
  "other_income_or_document",
  "itemized_deductions",
  "marketplace_or_credit_or_other_tax",
  "schedule_1a",
  "spouse_income_mfj",
  "spouse_itemizes_mfs",
  "spouse_nonresident_mfs",
  "digital_assets_yes",
  "unsupported_filing_status"
]);

export const AgentTurnSchema = z.object({
  kind: z.enum(["acknowledgement", "status", "result", "unsupported", "error"]),
  assistantText: z.string().min(1).max(500),
  acknowledgedQuestionId: QuestionIdSchema.nullable(),
  unsupportedReasonCode: UnsupportedReasonSchema.nullable()
}).strict();

export type AgentTurn = z.infer<typeof AgentTurnSchema>;
