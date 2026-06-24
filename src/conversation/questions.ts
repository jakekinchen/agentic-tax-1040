import { z } from "zod";

export const QuestionIds = [
  "confirm_w2",
  "filing_status",
  "simple_return_scope",
  "form_checkboxes"
] as const;

export const QuestionIdSchema = z.enum(QuestionIds);
export type QuestionId = z.infer<typeof QuestionIdSchema>;

export type QuestionBudget = {
  max: 5;
  allocated: QuestionId[];
  answered: QuestionId[];
};

export const QUESTION_PLAN: readonly QuestionId[] = QuestionIds;

export function allocateQuestion(budget: QuestionBudget, questionId: QuestionId): QuestionBudget {
  if (!budget.allocated.includes(questionId)) {
    if (budget.allocated.length >= budget.max) throw new Error("Question budget exceeded");
    return { ...budget, allocated: [...budget.allocated, questionId] };
  }
  return budget;
}

export function answerQuestion(budget: QuestionBudget, questionId: QuestionId): QuestionBudget {
  const next = allocateQuestion(budget, questionId);
  return next.answered.includes(questionId)
    ? next
    : { ...next, answered: [...next.answered, questionId] };
}

export function questionForStage(stage: string): QuestionId | null {
  switch (stage) {
    case "W2_EXTRACTED":
      return "confirm_w2";
    case "W2_CONFIRMED":
      return "filing_status";
    case "FILING_STATUS_CAPTURED":
      return "simple_return_scope";
    case "SCOPE_CONFIRMED":
      return "form_checkboxes";
    default:
      return null;
  }
}
