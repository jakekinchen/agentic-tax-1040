import { tool, type FunctionTool } from "@openai/agents";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { ReturnSession } from "../domain/session.js";
import { addEvent } from "../observability/event-store.js";
import { assertTransition } from "../conversation/state-machine.js";
import { compute2025Return } from "../tax/compute-2025.js";
import { supportedScopeGuard } from "../tax/scope.js";
import { fill1040For2025 } from "../pdf/fill-1040-2025.js";
import { extractW2 } from "../extraction/extract-w2.js";
import { maskSsn } from "../observability/redact.js";

export type TaxAgentContext = {
  session: ReturnSession;
  config: AppConfig;
};

function transition(session: ReturnSession, to: ReturnSession["stage"]): void {
  const from = session.stage;
  assertTransition(from, to);
  session.stage = to;
  addEvent(session, {
    category: "state",
    name: "state.transition",
    status: "succeeded",
    summary: `${from} -> ${to}`,
    metadata: { from, to }
  });
}

function requireContext(context: { context: TaxAgentContext } | undefined): TaxAgentContext {
  if (!context) throw new Error("Missing tool context.");
  return context.context;
}

const EmptyArgs = z.object({}).strict();

export function createTaxTools(): FunctionTool<TaxAgentContext, typeof EmptyArgs>[] {
  return [
    tool<typeof EmptyArgs, TaxAgentContext>({
      name: "extract_w2_from_pending_upload",
      description: "Extract Form W-2 facts from the pending upload in trusted session context.",
      parameters: EmptyArgs,
      timeoutMs: 45_000,
      timeoutBehavior: "raise_exception",
      async execute(_args, context) {
        const { session, config } = requireContext(context);
        const started = Date.now();
        session.toolCalls += 1;
        addEvent(session, { category: "tool", name: "tool.extract_w2.started", status: "started", summary: "W-2 extraction started", metadata: {} });
        try {
          if (session.stage !== "W2_UPLOADED") throw new Error("Extraction tool requires W2_UPLOADED stage.");
          if (!session.pendingUpload) throw new Error("No pending upload is available.");
          const result = await extractW2({
            bytes: session.pendingUpload.bytes,
            mime: session.pendingUpload.detectedMime,
            model: config.OPENAI_MODEL,
            fakeModel: config.fakeModel
          });
          session.w2 = result.w2;
          delete session.pendingUpload;
          transition(session, "W2_EXTRACTED");
          addEvent(session, {
            category: "tool",
            name: "tool.extract_w2.succeeded",
            status: "succeeded",
            durationMs: Date.now() - started,
            summary: "Box 1 and box 2 found",
            metadata: {
              taxYear: result.w2.taxYear,
              wages: result.w2.boxes.box1WagesCents / 100,
              withholding: result.w2.boxes.box2FederalWithholdingCents / 100,
              taxpayer: `${result.w2.employee.firstName.slice(0, 1)}... ${result.w2.employee.lastName.slice(0, 1)}...`,
              ssn: maskSsn(result.w2.employee.ssn)
            }
          });
          return {
            success: true,
            taxYear: result.w2.taxYear,
            wages: result.w2.boxes.box1WagesCents / 100,
            federalWithholding: result.w2.boxes.box2FederalWithholdingCents / 100,
            hasMissingCriticalFields: false,
            warningCount: result.warnings.length
          };
        } catch (error) {
          addEvent(session, {
            category: "tool",
            name: "tool.extract_w2.failed",
            status: "failed",
            durationMs: Date.now() - started,
            summary: "W-2 extraction failed",
            metadata: { reason: error instanceof Error ? error.message : "unknown" }
          });
          throw error;
        }
      }
    }),
    tool<typeof EmptyArgs, TaxAgentContext>({
      name: "calculate_2025_return",
      description: "Calculate the supported 2025 Form 1040 return from confirmed trusted state.",
      parameters: EmptyArgs,
      timeoutMs: 10_000,
      timeoutBehavior: "raise_exception",
      execute(_args, context) {
        const { session } = requireContext(context);
        const started = Date.now();
        session.toolCalls += 1;
        addEvent(session, { category: "tool", name: "tool.calculate.started", status: "started", summary: "Calculation started", metadata: {} });
        try {
          if (session.stage !== "FORM_FLAGS_CAPTURED") throw new Error("Calculation tool requires FORM_FLAGS_CAPTURED stage.");
          if (!session.w2 || !session.filing || !session.scope || !session.formFlags) throw new Error("Missing confirmed return state.");
          const scope = supportedScopeGuard({
            w2: session.w2,
            filing: session.filing,
            scope: session.scope,
            formFlags: session.formFlags
          });
          if (!scope.supported) throw new Error(scope.reasons[0]?.code ?? "unsupported_scope");
          session.computation = compute2025Return({
            w2: session.w2,
            filing: session.filing,
            scope: session.scope,
            formFlags: session.formFlags
          });
          transition(session, "COMPUTED");
          addEvent(session, {
            category: "tool",
            name: "tool.calculate.succeeded",
            status: "succeeded",
            durationMs: Date.now() - started,
            summary: `${session.computation.outcome} result`,
            metadata: { outcome: session.computation.outcome, amount: session.computation.outcomeAmount }
          });
          return {
            success: true,
            filingStatus: session.computation.filingStatus,
            totalIncome: session.computation.lines.line9,
            taxableIncome: session.computation.lines.line15,
            totalTax: session.computation.lines.line24,
            withholding: session.computation.lines.line33,
            outcome: session.computation.outcome === "amount_owed" ? "amount_owed" : session.computation.outcome === "refund" ? "refund" : "zero_balance",
            outcomeAmount: session.computation.outcomeAmount
          };
        } catch (error) {
          addEvent(session, {
            category: "tool",
            name: "tool.calculate.failed",
            status: "failed",
            durationMs: Date.now() - started,
            summary: "Calculation failed",
            metadata: { reason: error instanceof Error ? error.message : "unknown" }
          });
          throw error;
        }
      }
    }),
    tool<typeof EmptyArgs, TaxAgentContext>({
      name: "generate_2025_form_1040",
      description: "Generate and verify the official filled 2025 Form 1040 PDF from trusted state.",
      parameters: EmptyArgs,
      timeoutMs: 20_000,
      timeoutBehavior: "raise_exception",
      async execute(_args, context) {
        const { session } = requireContext(context);
        const started = Date.now();
        session.toolCalls += 1;
        addEvent(session, { category: "tool", name: "tool.generate_pdf.started", status: "started", summary: "PDF generation started", metadata: {} });
        try {
          if (session.stage !== "COMPUTED") throw new Error("PDF tool requires COMPUTED stage.");
          if (!session.w2 || !session.filing || !session.formFlags || !session.computation) throw new Error("Missing computed return state.");
          const artifact = await fill1040For2025({
            w2: session.w2,
            filing: session.filing,
            mainHomeInUS: session.formFlags.mainHomeInUS,
            computation: session.computation
          });
          session.artifact = {
            bytes: artifact.bytes,
            filename: artifact.filename,
            sha256: artifact.sha256,
            pageCount: artifact.pageCount,
            createdAt: artifact.createdAt,
            computationVersion: session.computation.version
          };
          transition(session, "PDF_READY");
          addEvent(session, {
            category: "tool",
            name: "tool.generate_pdf.succeeded",
            status: "succeeded",
            durationMs: Date.now() - started,
            summary: "2-page PDF ready",
            metadata: { pageCount: artifact.pageCount, filename: artifact.filename }
          });
          addEvent(session, {
            category: "artifact",
            name: "artifact.ready",
            status: "succeeded",
            summary: artifact.filename,
            metadata: { pageCount: artifact.pageCount }
          });
          return {
            success: true,
            filename: artifact.filename,
            pageCount: artifact.pageCount,
            sha256: artifact.sha256,
            downloadReady: true
          };
        } catch (error) {
          addEvent(session, {
            category: "tool",
            name: "tool.generate_pdf.failed",
            status: "failed",
            durationMs: Date.now() - started,
            summary: "PDF generation failed",
            metadata: { reason: error instanceof Error ? error.message : "unknown" }
          });
          throw error;
        }
      }
    })
  ];
}
