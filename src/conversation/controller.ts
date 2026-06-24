import { readFile } from "node:fs/promises";
import type { AppConfig } from "../config.js";
import { answerQuestion, allocateQuestion, type QuestionId } from "./questions.js";
import { nextQuestionForStage, assertTransition } from "./state-machine.js";
import type { ReturnSession } from "../domain/session.js";
import { dollarsToCents } from "../domain/money.js";
import { runTaxAgent } from "../agent/tax-agent.js";
import { event } from "../observability/events.js";
import { supportedScopeGuard } from "../tax/scope.js";
import { validateUpload } from "../http/upload-guard.js";
import { PublicError } from "../http/errors.js";
import { ConfirmW2PayloadSchema, FilingPayloadSchema, FormFlagsPayloadSchema, ScopePayloadSchema } from "../http/schemas.js";
import { QuestionCopy } from "./copy.js";
import type { FilingDetails, PersonName } from "../domain/filing.js";
import type { ScopeAnswers } from "../domain/return.js";
import type { CanonicalW2 } from "../domain/w2.js";

type UiCard = {
  questionId: QuestionId;
  text: string;
  data?: unknown;
};

type RequiredToolName = "extract_w2_from_pending_upload" | "calculate_2025_return" | "generate_2025_form_1040";

const requiredToolSuccessEvent: Record<RequiredToolName, string> = {
  extract_w2_from_pending_upload: "tool.extract_w2.succeeded",
  calculate_2025_return: "tool.calculate.succeeded",
  generate_2025_form_1040: "tool.generate_pdf.succeeded"
};

export type UiState = {
  stage: ReturnSession["stage"];
  questionsUsed: number;
  questionMax: number;
  nextCard: UiCard | null;
  result: null | {
    outcome: "refund" | "amount_owed" | "zero_balance";
    amount: number;
    filingStatus: string;
    totalIncome: number;
    taxableIncome: number;
    tax: number;
    withholding: number;
    filename?: string | undefined;
  };
  guardrails: { passed: number; blocked: number };
  harness: { chatLoop: string; toolsInvoked: number; events: number };
  events: ReturnSession["events"];
};

function personName(input: PersonName): PersonName {
  return {
    firstName: input.firstName,
    ...(input.middleInitial ? { middleInitial: input.middleInitial } : {}),
    lastName: input.lastName,
    ssn: input.ssn
  };
}

function filingDetails(input: ReturnType<typeof FilingPayloadSchema.parse>): FilingDetails {
  if (input.status === "single") return input;
  if (input.status === "married_filing_jointly") {
    return {
      status: input.status,
      spouse: personName(input.spouse),
      spouseHadNoIncome: input.spouseHadNoIncome,
      spouseHadNoOtherTaxDocuments: input.spouseHadNoOtherTaxDocuments
    };
  }
  return {
    status: input.status,
    spouse: personName(input.spouse),
    livedApartOrLegallySeparated: input.livedApartOrLegallySeparated,
    spouseWillNotItemize: input.spouseWillNotItemize,
    noNonresidentAlienRule: input.noNonresidentAlienRule
  };
}

function scopeAnswers(input: ReturnType<typeof ScopePayloadSchema.parse>): ScopeAnswers {
  return {
    noDependentsAndNotClaimable: input.noDependentsAndNotClaimable,
    under65AndNotBlind: input.under65AndNotBlind,
    onlyOneW2: input.onlyOneW2,
    standardDeduction: input.standardDeduction,
    noMarketplaceSelfEmploymentForeignIncomeAdditionalTaxOrCredit: input.noMarketplaceSelfEmploymentForeignIncomeAdditionalTaxOrCredit,
    noSchedule1ADeductions: input.noSchedule1ADeductions,
    ...(input.failedCondition ? { failedCondition: input.failedCondition } : {})
  };
}

function w2ConfirmationSnapshot(w2: CanonicalW2): Record<string, string | number> {
  return {
    firstName: w2.employee.firstName,
    middleInitial: w2.employee.middleInitial ?? "",
    lastName: w2.employee.lastName,
    ssn: w2.employee.ssn,
    street: w2.employee.address.street,
    apartment: w2.employee.address.apartment ?? "",
    city: w2.employee.address.city,
    state: w2.employee.address.state,
    zip: w2.employee.address.zip,
    employerName: w2.employer.name,
    box1Wages: w2.boxes.box1WagesCents / 100,
    box2FederalWithholding: w2.boxes.box2FederalWithholdingCents / 100,
    taxYear: w2.taxYear
  };
}

function changedConfirmationFields(before: Record<string, string | number>, after: Record<string, string | number>): string[] {
  return Object.keys(before).filter((key) => before[key] !== after[key]);
}

function rawStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const status = (payload as { status?: unknown }).status;
  return typeof status === "string" ? status : null;
}

function transition(session: ReturnSession, to: ReturnSession["stage"]): void {
  assertTransition(session.stage, to);
  const from = session.stage;
  session.stage = to;
  session.events.push(event({ category: "state", name: "state.transition", status: "succeeded", summary: `${from} -> ${to}`, metadata: { from, to } }));
}

function unsupported(session: ReturnSession, code: string, message: string): void {
  transition(session, "UNSUPPORTED");
  session.events.push(event({ category: "guardrail", name: `guardrail.${code}.blocked`, status: "blocked", summary: message, metadata: { reason: code } }));
}

async function runRequiredToolTurn(args: {
  session: ReturnSession;
  config: AppConfig;
  tool: RequiredToolName;
  expectedStage: ReturnSession["stage"];
  input: string;
}): Promise<void> {
  const successEvent = requiredToolSuccessEvent[args.tool];
  const before = args.session.events.filter((auditEvent) => auditEvent.name === successEvent).length;
  await runTaxAgent({
    session: args.session,
    config: args.config,
    input: args.input,
    requiredTool: args.tool,
    maxTurns: 4
  });
  if (args.session.stage === args.expectedStage && args.session.events.filter((auditEvent) => auditEvent.name === successEvent).length > before) return;

  args.session.events.push(event({
    category: "model",
    name: "model.required_tool_missing",
    status: "failed",
    summary: `${args.tool} was not invoked; retrying once`,
    metadata: { tool: args.tool, stage: args.session.stage }
  }));
  await runTaxAgent({
    session: args.session,
    config: args.config,
    input: `${args.input} This tool call is mandatory. Do not answer until the tool has been called.`,
    requiredTool: args.tool,
    maxTurns: 4
  });
  if (args.session.stage === args.expectedStage && args.session.events.filter((auditEvent) => auditEvent.name === successEvent).length > before) return;

  args.session.events.push(event({
    category: "model",
    name: "model.required_tool_failed",
    status: "failed",
    summary: `${args.tool} was not invoked after retry`,
    metadata: { tool: args.tool, stage: args.session.stage }
  }));
  throw new PublicError("The assistant could not invoke the required tool. Please reset and try again.", 502, "required_tool_omitted");
}

function allocateCurrentQuestion(session: ReturnSession): UiCard | null {
  const q = nextQuestionForStage(session.stage);
  if (!q) return null;
  session.questionBudget = allocateQuestion(session.questionBudget, q);
  session.events.push(event({ category: "chat", name: "question.allocated", status: "succeeded", summary: q, metadata: { questionId: q, used: session.questionBudget.allocated.length } }));
  const data = q === "confirm_w2" && session.w2
    ? {
        firstName: session.w2.employee.firstName,
        middleInitial: session.w2.employee.middleInitial ?? "",
        lastName: session.w2.employee.lastName,
        ssn: session.w2.employee.ssn,
        street: session.w2.employee.address.street,
        apartment: session.w2.employee.address.apartment ?? "",
        city: session.w2.employee.address.city,
        state: session.w2.employee.address.state,
        zip: session.w2.employee.address.zip,
        employerName: session.w2.employer.name,
        box1Wages: session.w2.boxes.box1WagesCents / 100,
        box2FederalWithholding: session.w2.boxes.box2FederalWithholdingCents / 100,
        taxYear: session.w2.taxYear
      }
    : undefined;
  return { questionId: q, text: QuestionCopy[q], data };
}

export function getUiState(session: ReturnSession): UiState {
  const blocked = session.events.filter((e) => e.category === "guardrail" && e.status === "blocked").length;
  const passed = session.events.filter((e) => e.category === "guardrail" && e.status === "succeeded").length;
  return {
    stage: session.stage,
    questionsUsed: session.questionBudget.allocated.length,
    questionMax: session.questionBudget.max,
    nextCard: allocateCurrentQuestion(session),
    result: session.computation ? {
      outcome: session.computation.outcome,
      amount: session.computation.outcomeAmount,
      filingStatus: session.computation.filingStatus,
      totalIncome: session.computation.totalIncome,
      taxableIncome: session.computation.taxableIncome,
      tax: session.computation.totalTax,
      withholding: session.computation.withholding,
      ...(session.artifact ? { filename: session.artifact.filename } : {})
    } : null,
    guardrails: { passed, blocked },
    harness: { chatLoop: `Active - ${session.stage}`, toolsInvoked: session.toolCalls, events: session.events.length },
    events: session.events
  };
}

export async function uploadW2(args: {
  session: ReturnSession;
  config: AppConfig;
  bytes?: Uint8Array;
  declaredMime?: string;
  sample?: boolean;
  syntheticAcknowledgement: boolean;
}): Promise<UiState> {
  if (args.session.stage !== "NEW") throw new PublicError("Reset before uploading another W-2.", 409, "active_return");
  const bytes = args.sample ? await readFile("fixtures/sample-w2-2025.pdf") : args.bytes;
  if (!bytes) throw new PublicError("No upload was provided.", 400, "missing_upload");
  args.session.events.push(event({ category: "guardrail", name: args.syntheticAcknowledgement ? "guardrail.synthetic_data.passed" : "guardrail.synthetic_data.blocked", status: args.syntheticAcknowledgement ? "succeeded" : "blocked", summary: args.syntheticAcknowledgement ? "Synthetic-data acknowledgement checked" : "Synthetic-data acknowledgement missing", metadata: {} }));
  args.session.pendingUpload = await validateUpload({
    bytes,
    ...(args.declaredMime ? { declaredMime: args.declaredMime } : {}),
    syntheticAcknowledgement: args.syntheticAcknowledgement,
    config: args.config
  });
  args.session.events.push(event({ category: "session", name: "upload.accepted", status: "succeeded", summary: `${args.session.pendingUpload.detectedMime}, ${args.session.pendingUpload.originalSize} bytes`, metadata: { bytes: args.session.pendingUpload.originalSize, mime: args.session.pendingUpload.detectedMime } }));
  transition(args.session, "W2_UPLOADED");
  await runRequiredToolTurn({
    session: args.session,
    config: args.config,
    tool: "extract_w2_from_pending_upload",
    expectedStage: "W2_EXTRACTED",
    input: "A synthetic W-2 was uploaded. Call extract_w2_from_pending_upload exactly once.",
  });
  const guard = supportedScopeGuard({ w2: args.session.w2 });
  if (!guard.supported) unsupported(args.session, guard.reasons[0]?.code ?? "unsupported", guard.reasons[0]?.userMessage ?? "Unsupported W-2");
  return getUiState(args.session);
}

export async function answer(args: {
  session: ReturnSession;
  config: AppConfig;
  questionId: QuestionId;
  payload: unknown;
}): Promise<UiState> {
  const expected = nextQuestionForStage(args.session.stage);
  if (expected !== args.questionId) throw new PublicError("That answer is stale for the current workflow stage.", 409, "stale_answer");

  if (args.questionId === "confirm_w2") {
    if (!args.session.w2) throw new PublicError("No W-2 is available to confirm.", 409, "missing_w2");
    const before = w2ConfirmationSnapshot(args.session.w2);
    const payload = ConfirmW2PayloadSchema.parse(args.payload);
    args.session.w2.employee = {
      firstName: payload.firstName,
      ...(payload.middleInitial ? { middleInitial: payload.middleInitial } : {}),
      lastName: payload.lastName,
      ssn: payload.ssn,
      address: {
        street: payload.street,
        ...(payload.apartment ? { apartment: payload.apartment } : {}),
        city: payload.city,
        state: payload.state,
        zip: payload.zip
      }
    };
    args.session.w2.employer.name = payload.employerName;
    args.session.w2.boxes.box1WagesCents = dollarsToCents(payload.box1Wages);
    args.session.w2.boxes.box2FederalWithholdingCents = dollarsToCents(payload.box2FederalWithholding);
    const corrected = changedConfirmationFields(before, w2ConfirmationSnapshot(args.session.w2));
    if (corrected.length > 0) {
      args.session.events.push(event({
        category: "chat",
        name: "w2.user_corrected",
        status: "succeeded",
        summary: "User corrected confirmed W-2 fields",
        metadata: { fieldCount: corrected.length }
      }));
    }
    args.session.events.push(event({ category: "chat", name: "question.answered", status: "succeeded", summary: "confirm_w2", metadata: { questionId: "confirm_w2" } }));
    args.session.questionBudget = answerQuestion(args.session.questionBudget, "confirm_w2");
    const guard = supportedScopeGuard({ w2: args.session.w2 });
    if (!guard.supported) unsupported(args.session, guard.reasons[0]?.code ?? "unsupported", guard.reasons[0]?.userMessage ?? "Unsupported W-2");
    else transition(args.session, "W2_CONFIRMED");
  } else if (args.questionId === "filing_status") {
    const status = rawStatus(args.payload);
    if (status && !["single", "married_filing_jointly", "married_filing_separately"].includes(status)) {
      args.session.events.push(event({ category: "chat", name: "question.answered", status: "succeeded", summary: "filing_status", metadata: { questionId: "filing_status" } }));
      args.session.questionBudget = answerQuestion(args.session.questionBudget, "filing_status");
      unsupported(args.session, "unsupported_filing_status", "Head of Household, Qualifying Surviving Spouse, and other filing statuses are outside this prototype.");
      return getUiState(args.session);
    }
    const filing = filingDetails(FilingPayloadSchema.parse(args.payload));
    args.session.filing = filing;
    args.session.events.push(event({ category: "chat", name: "question.answered", status: "succeeded", summary: "filing_status", metadata: { questionId: "filing_status" } }));
    args.session.questionBudget = answerQuestion(args.session.questionBudget, "filing_status");
    const guard = supportedScopeGuard({ w2: args.session.w2, filing });
    if (!guard.supported) unsupported(args.session, guard.reasons[0]?.code ?? "unsupported", guard.reasons[0]?.userMessage ?? "Unsupported filing status");
    else transition(args.session, "FILING_STATUS_CAPTURED");
  } else if (args.questionId === "simple_return_scope") {
    const scope = scopeAnswers(ScopePayloadSchema.parse(args.payload));
    args.session.scope = scope;
    args.session.events.push(event({ category: "chat", name: "question.answered", status: "succeeded", summary: "simple_return_scope", metadata: { questionId: "simple_return_scope" } }));
    args.session.questionBudget = answerQuestion(args.session.questionBudget, "simple_return_scope");
    const guard = supportedScopeGuard({ w2: args.session.w2, filing: args.session.filing, scope });
    if (!guard.supported) unsupported(args.session, guard.reasons[0]?.code ?? "unsupported", guard.reasons[0]?.userMessage ?? "Unsupported scope item");
    else transition(args.session, "SCOPE_CONFIRMED");
  } else {
    const formFlags = FormFlagsPayloadSchema.parse(args.payload);
    args.session.formFlags = formFlags;
    args.session.events.push(event({ category: "chat", name: "question.answered", status: "succeeded", summary: "form_checkboxes", metadata: { questionId: "form_checkboxes" } }));
    args.session.questionBudget = answerQuestion(args.session.questionBudget, "form_checkboxes");
    const guard = supportedScopeGuard({ w2: args.session.w2, filing: args.session.filing, scope: args.session.scope, formFlags });
    if (!guard.supported) {
      unsupported(args.session, guard.reasons[0]?.code ?? "unsupported", guard.reasons[0]?.userMessage ?? "Unsupported form flag");
    } else {
      transition(args.session, "FORM_FLAGS_CAPTURED");
      await runRequiredToolTurn({
        session: args.session,
        config: args.config,
        tool: "calculate_2025_return",
        expectedStage: "COMPUTED",
        input: "All four answer groups are complete. Call calculate_2025_return exactly once.",
      });
      if (args.session.stage === "COMPUTED") {
        await runRequiredToolTurn({
          session: args.session,
          config: args.config,
          tool: "generate_2025_form_1040",
          expectedStage: "PDF_READY",
          input: "Calculation succeeded. Call generate_2025_form_1040 exactly once.",
        });
      }
    }
  }

  return getUiState(args.session);
}
