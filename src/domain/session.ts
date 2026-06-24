import type { MemorySession } from "@openai/agents";
import type { QuestionId } from "../conversation/questions.js";
import type { ReturnStage } from "../conversation/state-machine.js";
import type { AuditEvent } from "../observability/events.js";
import type { FilingDetails } from "./filing.js";
import type { FormFlags, ScopeAnswers, TaxComputation } from "./return.js";
import type { CanonicalW2 } from "./w2.js";

export type PendingUpload = {
  bytes: Uint8Array;
  detectedMime: "application/pdf" | "image/png" | "image/jpeg";
  originalSize: number;
  pageCount?: number;
};

export type ReturnArtifact = {
  bytes: Uint8Array;
  filename: string;
  sha256: string;
  pageCount: 2;
  createdAt: string;
  computationVersion: string;
};

export type ReturnSession = {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
  stage: ReturnStage;
  questionBudget: {
    max: 5;
    allocated: QuestionId[];
    answered: QuestionId[];
  };
  pendingUpload?: PendingUpload;
  w2?: CanonicalW2;
  filing?: FilingDetails;
  scope?: ScopeAnswers;
  formFlags?: FormFlags;
  computation?: TaxComputation;
  artifact?: ReturnArtifact;
  modelCalls: number;
  toolCalls: number;
  events: AuditEvent[];
  agentSession: MemorySession;
  syntheticAcknowledged: boolean;
  lastQuestionId?: QuestionId;
};

export function clearDerivedReturnState(session: ReturnSession): void {
  delete session.computation;
  delete session.artifact;
}

export function clearSensitiveSessionState(session: ReturnSession): void {
  delete session.pendingUpload;
  delete session.artifact;
}
