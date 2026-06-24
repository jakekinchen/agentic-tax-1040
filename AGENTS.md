# Repository Instructions

Tax values may only come from deterministic modules under `src/tax`.

Do not broaden supported scope without corresponding IRS rules, tests, guardrails, and PDF fields.

Do not modify IRS assets without updating hashes, `sources.json`, field-map tests, and PDF rendering checks.

Do not log PII, raw uploads, PDF bytes, request bodies, cookies, raw model prompts, raw model outputs, or hidden reasoning.

Do not add a database without an explicit product decision.

Do not add a sixth question.

Do not replace the official 1040 with an HTML facsimile.

Every new tool needs typed arguments, preconditions, timeout, events, and tests.

Every state transition must be represented in the transition table.

Run `pnpm check` before finishing.

Run PDF rendering checks after changing form mapping.
