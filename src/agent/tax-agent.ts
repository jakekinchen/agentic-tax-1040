import { Agent, RunContext, Runner } from "@openai/agents";
import type { AppConfig } from "../config.js";
import type { ReturnSession } from "../domain/session.js";
import { addEvent } from "../observability/event-store.js";
import { enforceOutputLanguage } from "./guardrails.js";
import { TAX_AGENT_INSTRUCTIONS } from "./instructions.js";
import { AgentTurnSchema, type AgentTurn } from "./output-schema.js";
import { createTaxTools, type TaxAgentContext } from "./tools.js";

type RequiredToolName = "extract_w2_from_pending_upload" | "calculate_2025_return" | "generate_2025_form_1040";

export function createTaxReturnAgent(model: string, requiredTool?: RequiredToolName): Agent<TaxAgentContext, typeof AgentTurnSchema> {
  const tools = createTaxTools().filter((agentTool) => !requiredTool || agentTool.name === requiredTool);
  return new Agent<TaxAgentContext, typeof AgentTurnSchema>({
    name: "TaxReturnAgent",
    instructions: TAX_AGENT_INSTRUCTIONS,
    model,
    outputType: AgentTurnSchema,
    tools,
    modelSettings: {
      reasoning: { effort: "low" },
      maxTokens: 600,
      parallelToolCalls: false,
      text: { verbosity: "low" }
    }
  });
}

export async function runTaxAgent(input: {
  session: ReturnSession;
  config: AppConfig;
  input: string;
  maxTurns?: number;
  requiredTool?: RequiredToolName;
}): Promise<AgentTurn> {
  if (input.session.modelCalls >= 8) {
    throw new Error("Model call budget exceeded.");
  }
  input.session.modelCalls += 1;
  const started = Date.now();
  addEvent(input.session, {
    category: "model",
    name: "model.run.started",
    status: "started",
    summary: "Agent run started",
    metadata: { stage: input.session.stage }
  });
  if (input.config.fakeModel) {
    try {
      if (input.requiredTool) {
        const selected = createTaxTools().find((tool) => tool.name === input.requiredTool);
        if (!selected) throw new Error(`Unknown required tool: ${input.requiredTool}`);
        await selected.invoke(new RunContext<TaxAgentContext>({ session: input.session, config: input.config }), "{}");
      }
      const parsed = AgentTurnSchema.parse({
        kind: "status",
        assistantText: "Done.",
        acknowledgedQuestionId: null,
        unsupportedReasonCode: null
      });
      addEvent(input.session, {
        category: "model",
        name: "model.run.succeeded",
        status: "succeeded",
        durationMs: Date.now() - started,
        summary: parsed.kind,
        metadata: { kind: parsed.kind, fake: true }
      });
      return parsed;
    } catch (error) {
      addEvent(input.session, {
        category: "model",
        name: "model.run.failed",
        status: "failed",
        durationMs: Date.now() - started,
        summary: "Agent run failed",
        metadata: { reason: error instanceof Error ? error.message : "unknown" }
      });
      throw error;
    }
  }

  const agent = createTaxReturnAgent(input.config.OPENAI_MODEL, input.requiredTool);
  const runner = new Runner({
    tracingDisabled: false,
    traceIncludeSensitiveData: false,
    workflowName: "agentic-tax-1040",
    modelSettings: {
      toolChoice: input.requiredTool ? "required" : "auto",
      parallelToolCalls: false,
      retry: { maxRetries: 1 }
    }
  });
  try {
    const result = await runner.run(agent, input.input, {
      context: { session: input.session, config: input.config },
      session: input.session.agentSession,
      maxTurns: input.maxTurns ?? 4
    });
    const parsed = AgentTurnSchema.parse(result.finalOutput);
    const guarded = enforceOutputLanguage(parsed);
    addEvent(input.session, {
      category: "model",
      name: "model.run.succeeded",
      status: "succeeded",
      durationMs: Date.now() - started,
      summary: guarded.kind,
      metadata: { kind: guarded.kind }
    });
    return guarded;
  } catch (error) {
    addEvent(input.session, {
      category: "model",
      name: "model.run.failed",
      status: "failed",
      durationMs: Date.now() - started,
      summary: "Agent run failed",
      metadata: { reason: error instanceof Error ? error.message : "unknown" }
    });
    throw error;
  }
}
