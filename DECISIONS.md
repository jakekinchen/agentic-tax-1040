# Decisions

This project uses a bounded hybrid agent. The LLM handles W-2 reading, short-answer interpretation, warm copy, and selection of three typed tools. Deterministic TypeScript owns state transitions, supported scope, tax math, official tax-table lookup, PDF field mapping, postconditions, and privacy. The model is an orchestrator, not the tax engine.

It is one TypeScript/Fastify service to avoid extra integration boundaries. The OpenAI Agents SDK gives typed tools, run limits, sessions, and tracing controls; the app deliberately uses one `TaxReturnAgent`, not a swarm. The model default is pinned to `gpt-5.4-mini-2026-03-17`, configurable through `OPENAI_MODEL`, because the current OpenAI docs list that snapshot for Responses and image input.

The generated PDF uses the vendored official IRS 2025 Form 1040 with `pdf-lib`. The result is flattened so field appearances become page content and viewers do not expose editable return fields. Line 16 comes from a committed 2025 tax-table JSON generated from official instruction data, not model output or runtime marginal-bracket math.

The conversation is four structured questions with a hard five-question ceiling. The scope stays narrow so guardrails are visible and correctness is defensible. Sessions are in memory because this is a fake-data hackathon app and Render Free has an ephemeral filesystem. The app-owned redacted event trail lets judges inspect the harness without provider dashboard access or hidden chain-of-thought.

Implementation deviation: the canonical W-2 keeps `confidenceByField` as a record, but the model-facing Structured Outputs schema uses an array of `{ field, confidence }` entries because the current Responses API schema validator rejects the `propertyNames` keyword produced for Zod records.
