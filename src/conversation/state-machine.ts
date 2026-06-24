import type { QuestionId } from "./questions.js";
import { questionForStage } from "./questions.js";

export const Stages = [
  "NEW",
  "W2_UPLOADED",
  "W2_EXTRACTED",
  "W2_CONFIRMED",
  "FILING_STATUS_CAPTURED",
  "SCOPE_CONFIRMED",
  "FORM_FLAGS_CAPTURED",
  "COMPUTED",
  "PDF_READY",
  "UNSUPPORTED",
  "FAILED"
] as const;

export type ReturnStage = (typeof Stages)[number];

const transitions: Record<ReturnStage, ReturnStage[]> = {
  NEW: ["W2_UPLOADED", "FAILED"],
  W2_UPLOADED: ["W2_EXTRACTED", "FAILED"],
  W2_EXTRACTED: ["W2_CONFIRMED", "UNSUPPORTED", "FAILED"],
  W2_CONFIRMED: ["FILING_STATUS_CAPTURED", "UNSUPPORTED", "FAILED", "W2_EXTRACTED"],
  FILING_STATUS_CAPTURED: ["SCOPE_CONFIRMED", "UNSUPPORTED", "FAILED", "W2_CONFIRMED"],
  SCOPE_CONFIRMED: ["FORM_FLAGS_CAPTURED", "UNSUPPORTED", "FAILED", "FILING_STATUS_CAPTURED"],
  FORM_FLAGS_CAPTURED: ["COMPUTED", "UNSUPPORTED", "FAILED", "SCOPE_CONFIRMED"],
  COMPUTED: ["PDF_READY", "FAILED", "FORM_FLAGS_CAPTURED"],
  PDF_READY: ["W2_CONFIRMED", "FILING_STATUS_CAPTURED", "SCOPE_CONFIRMED", "FORM_FLAGS_CAPTURED", "NEW"],
  UNSUPPORTED: ["NEW"],
  FAILED: ["NEW"]
};

export function assertTransition(from: ReturnStage, to: ReturnStage): void {
  if (!transitions[from].includes(to)) {
    throw new Error(`Invalid state transition ${from} -> ${to}`);
  }
}

export function nextQuestionForStage(stage: ReturnStage): QuestionId | null {
  return questionForStage(stage);
}

export function nextStageAfterAnswer(questionId: QuestionId): ReturnStage {
  switch (questionId) {
    case "confirm_w2":
      return "W2_CONFIRMED";
    case "filing_status":
      return "FILING_STATUS_CAPTURED";
    case "simple_return_scope":
      return "SCOPE_CONFIRMED";
    case "form_checkboxes":
      return "FORM_FLAGS_CAPTURED";
  }
}

export function allowedTransitions(): Record<ReturnStage, readonly ReturnStage[]> {
  return transitions;
}
