import { describe, expect, it } from "vitest";
import { allocateQuestion, answerQuestion, type QuestionBudget } from "../../src/conversation/questions.js";
import { assertTransition } from "../../src/conversation/state-machine.js";
import { safeArtifactName, assertSafeFilename } from "../../src/pdf/artifact-name.js";
import { sampleCanonicalW2 } from "../../src/domain/w2.js";
import { maskEin, maskName, maskSsn } from "../../src/observability/redact.js";
import { event } from "../../src/observability/events.js";
import { loadConfig } from "../../src/config.js";
import { SessionStore } from "../../src/sessions/store.js";

describe("question budget", () => {
  it("does not allocate duplicate question IDs", () => {
    const budget: QuestionBudget = { max: 5, allocated: [], answered: [] };
    const once = allocateQuestion(budget, "confirm_w2");
    const twice = allocateQuestion(once, "confirm_w2");
    expect(twice.allocated).toEqual(["confirm_w2"]);
  });

  it("blocks a sixth unique question-equivalent allocation", () => {
    const malformedFullBudget = {
      max: 5,
      allocated: ["a", "b", "c", "d", "e"],
      answered: []
    } as unknown as QuestionBudget;
    expect(() => allocateQuestion(malformedFullBudget, "confirm_w2")).toThrow(/Question budget exceeded/);
    expect(answerQuestion({ max: 5, allocated: [], answered: [] }, "confirm_w2").answered).toEqual(["confirm_w2"]);
  });
});

describe("state transitions", () => {
  it("rejects out-of-order transitions", () => {
    expect(() => assertTransition("NEW", "PDF_READY")).toThrow(/Invalid state transition/);
    expect(() => assertTransition("FORM_FLAGS_CAPTURED", "COMPUTED")).not.toThrow();
  });
});

describe("artifact names and redaction", () => {
  it("sanitizes artifact filenames", () => {
    const w2 = sampleCanonicalW2();
    w2.employee.lastName = "../Sample/Bad";
    const filename = safeArtifactName(w2);
    expect(filename).toBe("2025-form-1040-draft-sample-bad.pdf");
    expect(() => assertSafeFilename(filename)).not.toThrow();
    expect(() => assertSafeFilename("../bad.pdf")).toThrow(/Unsafe/);
  });

  it("masks sensitive examples", () => {
    expect(maskSsn("900-12-3456")).toBe("***-**-3456");
    expect(maskEin("00-1234567")).toBe("**-***4567");
    expect(maskName("Avery", "Sample")).toContain("A");
  });

  it("redacts sensitive event metadata keys", () => {
    const created = event({
      category: "guardrail",
      name: "guardrail.privacy.passed",
      status: "succeeded",
      summary: "privacy checked",
      metadata: { ssn: "900-12-3456", wages: 40000, pdfBytes: 123 }
    });
    expect(created.metadata.ssn).toBe("[redacted]");
    expect(created.metadata.pdfBytes).toBe("[redacted]");
    expect(created.metadata.wages).toBe(40000);
  });
});

describe("session store lifecycle", () => {
  it("expires sessions and clears sensitive state", () => {
    const config = loadConfig({ NODE_ENV: "test", TAX_FAKE_MODEL: "1", OPENAI_MODEL: "gpt-5.4-mini-2026-03-17" });
    const store = new SessionStore(config);
    const session = store.create();
    session.pendingUpload = {
      bytes: new Uint8Array([1, 2, 3]),
      detectedMime: "application/pdf",
      originalSize: 3,
      pageCount: 1
    };
    session.expiresAt = new Date(Date.now() - 1_000).toISOString();
    expect(store.get(session.id)).toBeNull();
    expect(session.pendingUpload).toBeUndefined();
  });

  it("evicts least-recently-used sessions when capacity is reached", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      TAX_FAKE_MODEL: "1",
      OPENAI_MODEL: "gpt-5.4-mini-2026-03-17",
      MAX_ACTIVE_SESSIONS: "1"
    });
    const store = new SessionStore(config);
    const first = store.create();
    const second = store.create();
    expect(store.get(first.id)).toBeNull();
    expect(store.get(second.id)?.id).toBe(second.id);
  });
});
