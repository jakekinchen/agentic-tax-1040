import type { AgentTurn } from "./output-schema.js";

const FORBIDDEN_CLAIMS = [
  /\bfiled\b/i,
  /\bsubmitted\b/i,
  /\baccepted\b/i,
  /\bapproved\b/i,
  /\bsent to the IRS\b/i,
  /\bguaranteed\b/i,
  /\btax advice\b/i
];

const NEGATED_SAFE = [
  /nothing was filed/i,
  /nothing was submitted/i,
  /not filed/i,
  /not submitted/i
];

export function enforceOutputLanguage(turn: AgentTurn): AgentTurn {
  const text = turn.assistantText;
  const safeNegation = NEGATED_SAFE.some((pattern) => pattern.test(text));
  const forbidden = FORBIDDEN_CLAIMS.some((pattern) => pattern.test(text));
  if (forbidden && !safeNegation) {
    return {
      ...turn,
      kind: "error",
      assistantText: "I can only produce an unsigned educational draft. Nothing is filed or submitted.",
      unsupportedReasonCode: null
    };
  }
  return turn;
}
