# Agentic 2025 Form 1040 Assistant

Public URL: not deployed yet. Render deployment needs repository hosting and deploy credentials.

This is a synthetic-data-only web app that turns one fake 2025 W-2 into an unsigned draft 2025 U.S. Form 1040 PDF.

Do not use real personal information. Nothing is e-filed, signed, mailed, submitted, accepted, or approved.

## Local Run

```bash
OPENAI_API_KEY=... ./scripts/dev.sh
```

For installed dependencies:

```bash
pnpm assets:verify
pnpm dev
```

The free Render instance may take about a minute to wake after being idle, and in-memory sessions can reset on restart.

## Test Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:pdf
pnpm test:e2e
pnpm eval
pnpm build
pnpm check
pnpm smoke:live
```

`pnpm smoke:live` requires `OPENAI_API_KEY`; normal tests use deterministic stubs.

## Verified Sample Results

The supplied W-2 produces these deterministic 2025 Form 1040 outcomes:

| Filing status | Income | Standard deduction | Taxable income | Tax | Withholding | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Single | $40,000 | $15,750 | $24,250 | $2,675 | $3,200 | $525 refund |
| Married Filing Jointly | $40,000 | $31,500 | $8,500 | $853 | $3,200 | $2,347 refund |
| Married Filing Separately | $40,000 | $15,750 | $24,250 | $2,675 | $3,200 | $525 refund |

`pnpm smoke:live` runs the sample through real OpenAI extraction, required agent tool calls, deterministic calculation, and PDF generation.

## Supported Cases

Tax year 2025, exactly one W-2, wages from $30,000 to $50,000, Single/MFJ/MFS only, no dependents, no credits, no other income, no adjustments, standard deduction only, no direct deposit, no digital-asset Yes answer, and no Schedule 1-A deductions.

## Unsupported Cases

Additional tax documents, Head of Household, dependents, claimable taxpayer/spouse, age 65 or older, blindness, self-employment, other income, Marketplace 1095-A, itemizing, credits, Schedule 1-A conditions, spouse income on MFJ, spouse itemizing on MFS, unsupported W-2 flags/codes, wages outside range, filing advice, e-filing, signing, amending, or submission requests.

## Four Pillars

Chat loop: Fastify keeps explicit domain state and one Agents SDK `MemorySession` per application session.

Tools: the single `TaxReturnAgent` has three typed tools: extraction, calculation, and PDF generation.

Guardrails: deterministic guards own synthetic acknowledgement, upload checks, supported scope, state transitions, question budget, tax invariants, PDF postconditions, output wording, and privacy.

Observation: each session records redacted audit events so a judge can see state transitions, tool calls, guardrail outcomes, and artifact creation without seeing hidden reasoning or raw PII.

## Architecture

```text
Browser HTML/JS
  -> Fastify routes
  -> session store + state machine
  -> one TaxReturnAgent with MemorySession
  -> typed tools
       extraction: OpenAI Responses API + strict schema
       calculation: deterministic 2025 table lookup
       PDF: pdf-lib fills official IRS 1040 and flattens it
  -> in-memory PDF download
```

## Question Budget

Only deterministic controller code allocates question IDs. The normal flow uses `confirm_w2`, `filing_status`, `simple_return_scope`, and `form_checkboxes`. The guard rejects a sixth unique question before it can be rendered or persisted.

## Tax Calculation

Uploaded monetary values are stored as integer cents. Form lines are rounded to whole dollars using the IRS whole-dollar rule. Production line 16 is a lookup into committed `assets/irs/2025/tax-table-2025.json`, not LLM math.

## IRS PDF

The app vendors official 2025 IRS PDFs under `assets/irs/2025`. Startup verifies hashes from `sources.json`. The 1040 field map isolates raw IRS field names from application code. The generated return is flattened and checked for two pages, nonblank rendering, no editable fields, and blank signature/bank areas.

## Privacy

Sessions are process-local, bounded, and temporary. Raw uploads are discarded after extraction. Logs and observation events redact SSNs, EINs, addresses, upload bytes, PDF bytes, request bodies, and cookies.

## Environment Variables

See `.env.example`.

## Troubleshooting

Absent API key: normal app startup in production refuses to run; local fake-model test mode is only available under `NODE_ENV=test`.

Model errors: the UI reports a sanitized failure event and preserves the current card when possible.

PDF mapping failure: run `pnpm assets:inspect-fields`, then `pnpm test:pdf`.

Missing Poppler: install `pdftoppm` and `pdftotext`; PDF rendering tests need them.
