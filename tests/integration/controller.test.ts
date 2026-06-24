import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { answer, uploadW2 } from "../../src/conversation/controller.js";
import type { FilingDetails } from "../../src/domain/filing.js";
import { SessionStore } from "../../src/sessions/store.js";

const testEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  TAX_FAKE_MODEL: "1",
  OPENAI_MODEL: "gpt-5.4-mini-2026-03-17"
};

const config = loadConfig(testEnv);

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

async function runFlow(filing: FilingDetails) {
  const store = new SessionStore(config);
  const session = store.create();
  let state = await uploadW2({
    session,
    config,
    sample: true,
    syntheticAcknowledgement: true
  });
  expect(state.stage).toBe("W2_EXTRACTED");
  expect(state.nextCard?.questionId).toBe("confirm_w2");

  state = await answer({ session, config, questionId: "confirm_w2", payload: confirmedW2Payload });
  expect(state.stage).toBe("W2_CONFIRMED");
  state = await answer({ session, config, questionId: "filing_status", payload: filing });
  expect(state.stage).toBe("FILING_STATUS_CAPTURED");
  state = await answer({ session, config, questionId: "simple_return_scope", payload: scopePayload });
  expect(state.stage).toBe("SCOPE_CONFIRMED");
  state = await answer({ session, config, questionId: "form_checkboxes", payload: { mainHomeInUS: true, digitalAssets: false } });
  return { session, state };
}

describe("application controller happy paths", () => {
  it("runs the Single sample to a $525 PDF-ready refund", async () => {
    const { session, state } = await runFlow({ status: "single" });
    expect(state.stage).toBe("PDF_READY");
    expect(state.result?.outcome).toBe("refund");
    expect(state.result?.amount).toBe(525);
    expect(session.artifact?.pageCount).toBe(2);
    expect(session.events.filter((event) => event.name === "tool.extract_w2.succeeded")).toHaveLength(1);
    expect(session.events.filter((event) => event.name === "tool.calculate.succeeded")).toHaveLength(1);
    expect(session.events.filter((event) => event.name === "tool.generate_pdf.succeeded")).toHaveLength(1);
  });

  it("runs the MFJ sample to a $2,347 refund", async () => {
    const { state } = await runFlow({
      status: "married_filing_jointly",
      spouse: { firstName: "Jordan", lastName: "Sample", ssn: "900-12-3457" },
      spouseHadNoIncome: true,
      spouseHadNoOtherTaxDocuments: true
    });
    expect(state.result?.amount).toBe(2_347);
  });

  it("runs the MFS sample to a $525 refund", async () => {
    const { state } = await runFlow({
      status: "married_filing_separately",
      spouse: { firstName: "Jordan", lastName: "Sample", ssn: "900-12-3457" },
      livedApartOrLegallySeparated: false,
      spouseWillNotItemize: true,
      noNonresidentAlienRule: true
    });
    expect(state.result?.amount).toBe(525);
  });

  it("blocks digital asset Yes before PDF generation", async () => {
    const store = new SessionStore(config);
    const session = store.create();
    await uploadW2({ session, config, sample: true, syntheticAcknowledgement: true });
    await answer({ session, config, questionId: "confirm_w2", payload: confirmedW2Payload });
    await answer({ session, config, questionId: "filing_status", payload: { status: "single" } });
    await answer({ session, config, questionId: "simple_return_scope", payload: scopePayload });
    const state = await answer({ session, config, questionId: "form_checkboxes", payload: { mainHomeInUS: true, digitalAssets: true } });
    expect(state.stage).toBe("UNSUPPORTED");
    expect(session.artifact).toBeUndefined();
    expect(session.events.some((event) => event.name === "tool.generate_pdf.started")).toBe(false);
  });
});
