import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadConfig } from "../src/config.js";
import { answer, uploadW2 } from "../src/conversation/controller.js";
import type { FilingDetails } from "../src/domain/filing.js";
import { SessionStore } from "../src/sessions/store.js";

type EvalCase = {
  id: string;
  filing: FilingDetails;
  formFlags: { mainHomeInUS: boolean; digitalAssets: "no" | "yes" };
  expect: {
    stage: string;
    outcome?: string;
    amount?: number;
    pdfToolCalled: boolean;
  };
};

const evalEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  TAX_FAKE_MODEL: "1",
  OPENAI_MODEL: "gpt-5.4-mini-2026-03-17"
};

const config = loadConfig(evalEnv);

const confirmedW2Payload = {
  firstName: "Avery",
  middleInitial: "",
  lastName: "Sample",
  ssn: "900-12-3456",
  street: "125 Example Avenue",
  apartment: "",
  city: "Columbus",
  state: "OH",
  zip: "43215",
  employerName: "Example Bicycle Works, Inc.",
  box1Wages: 40_000,
  box2FederalWithholding: 3_200,
  taxYear: 2025
};

const scopePayload = {
  noDependentsAndNotClaimable: true,
  under65AndNotBlind: true,
  onlyOneW2: true,
  standardDeduction: true,
  noMarketplaceSelfEmploymentForeignIncomeAdditionalTaxOrCredit: true,
  noSchedule1ADeductions: true
};

async function runCase(testCase: EvalCase) {
  const store = new SessionStore(config);
  const session = store.create();
  await uploadW2({ session, config, sample: true, syntheticAcknowledgement: true });
  await answer({ session, config, questionId: "confirm_w2", payload: confirmedW2Payload });
  await answer({ session, config, questionId: "filing_status", payload: testCase.filing });
  await answer({ session, config, questionId: "simple_return_scope", payload: scopePayload });
  const state = await answer({ session, config, questionId: "form_checkboxes", payload: testCase.formFlags });
  const pdfToolCalled = session.events.some((event) => event.name === "tool.generate_pdf.succeeded");
  const failures: string[] = [];
  if (state.stage !== testCase.expect.stage) failures.push(`stage ${state.stage} !== ${testCase.expect.stage}`);
  if (testCase.expect.outcome && state.result?.outcome !== testCase.expect.outcome) failures.push(`outcome ${state.result?.outcome} !== ${testCase.expect.outcome}`);
  if (testCase.expect.amount !== undefined && state.result?.amount !== testCase.expect.amount) failures.push(`amount ${state.result?.amount} !== ${testCase.expect.amount}`);
  if (pdfToolCalled !== testCase.expect.pdfToolCalled) failures.push(`pdfToolCalled ${pdfToolCalled} !== ${testCase.expect.pdfToolCalled}`);
  if (session.questionBudget.allocated.length > 5) failures.push("question budget exceeded");
  if (session.events.some((event) => /900-12-3456|125 Example Avenue/.test(JSON.stringify(event)))) failures.push("raw PII appeared in events");
  return { id: testCase.id, passed: failures.length === 0, failures, events: session.events.length };
}

const raw = await readFile(resolve(process.cwd(), "evals", "cases.jsonl"), "utf8");
const cases = raw.trim().split("\n").map((line) => JSON.parse(line) as EvalCase);
const results = [];
for (const testCase of cases) results.push(await runCase(testCase));

const outputPath = resolve(process.cwd(), "evals", "results", "latest.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({ at: new Date().toISOString(), results }, null, 2)}\n`);

const failures = results.filter((result) => !result.passed);
if (failures.length > 0) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log(`eval passed: ${results.length} cases`);
