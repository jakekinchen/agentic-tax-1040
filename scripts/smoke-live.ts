import { readFile } from "node:fs/promises";
import { verifyRuntimeAssets } from "../src/assets/verify-assets.js";
import { answer, uploadW2 } from "../src/conversation/controller.js";
import { loadConfig } from "../src/config.js";
import { SessionStore } from "../src/sessions/store.js";

async function loadEnvLocal(): Promise<void> {
  try {
    const text = await readFile(".env.local", "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      const key = match?.[1];
      const value = match?.[2];
      if (key && value !== undefined && !process.env[key]) process.env[key] = value;
    }
  } catch {
    // Optional local file.
  }
}

await loadEnvLocal();
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required for live smoke.");
}

await verifyRuntimeAssets();
const config = loadConfig({
  ...process.env,
  NODE_ENV: "development",
  TAX_FAKE_MODEL: undefined
});
const store = new SessionStore(config);
const session = store.create();

try {
  let state = await uploadW2({
    session,
    config,
    sample: true,
    syntheticAcknowledgement: true
  });
  if (state.stage !== "W2_EXTRACTED" || !state.nextCard?.data) throw new Error(`Expected W2_EXTRACTED, got ${state.stage}`);

  await answer({ session, config, questionId: "confirm_w2", payload: state.nextCard.data });
  await answer({ session, config, questionId: "filing_status", payload: { status: "single" } });
  await answer({
    session,
    config,
    questionId: "simple_return_scope",
    payload: {
      noDependentsAndNotClaimable: true,
      under65AndNotBlind: true,
      onlyOneW2: true,
      standardDeduction: true,
      noMarketplaceSelfEmploymentForeignIncomeAdditionalTaxOrCredit: true,
      noSchedule1ADeductions: true
    }
  });
  state = await answer({
    session,
    config,
    questionId: "form_checkboxes",
    payload: { mainHomeInUS: true, digitalAssets: false }
  });

  if (state.stage !== "PDF_READY") throw new Error(`Expected PDF_READY, got ${state.stage}`);
  if (state.result?.outcome !== "refund" || state.result.amount !== 525) {
    throw new Error(`Expected $525 refund, got ${state.result?.outcome} ${state.result?.amount}.`);
  }
  if (!session.artifact || session.artifact.pageCount !== 2 || session.artifact.bytes.byteLength < 100_000) {
    throw new Error("Expected a generated two-page Form 1040 PDF artifact.");
  }
  for (const eventName of ["tool.extract_w2.succeeded", "tool.calculate.succeeded", "tool.generate_pdf.succeeded"]) {
    if (!session.events.some((event) => event.name === eventName)) throw new Error(`Missing event ${eventName}.`);
  }

  console.log("live smoke passed: sample Single produced a $525 refund and two-page PDF");
} catch (error) {
  console.error("live smoke failed");
  console.error(JSON.stringify(session.events.map(({ at, name, status, summary, metadata }) => ({ at, name, status, summary, metadata })), null, 2));
  throw error;
}
