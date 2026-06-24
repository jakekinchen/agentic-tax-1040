const $ = (id) => document.getElementById(id);
const state = { busy: false, lastStage: null };

function money(value) {
  return `$${Number(value).toLocaleString("en-US")}`;
}

function text(el, value) {
  el.textContent = value == null ? "" : String(value);
}

function addMessage(kind, message) {
  const div = document.createElement("div");
  div.className = `msg ${kind}`;
  div.textContent = message;
  $("transcript").append(div);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...(options.headers || {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

function setBusy(busy) {
  state.busy = busy;
  for (const button of document.querySelectorAll("button")) button.disabled = busy;
}

function input(name, label, value = "", type = "text", readOnly = false) {
  const wrap = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = label;
  const el = document.createElement("input");
  el.name = name;
  el.value = value ?? "";
  el.type = type;
  el.readOnly = readOnly;
  wrap.append(span, el);
  return wrap;
}

function formValues(form) {
  const data = new FormData(form);
  return Object.fromEntries([...data.entries()].map(([key, value]) => [key, value]));
}

async function submitAnswer(questionId, payload) {
  setBusy(true);
  try {
    addMessage("user", "Answer saved.");
    const next = await requestJson("/api/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionId, payload })
    });
    render(next);
  } catch (error) {
    addMessage("assistant", error.message);
  } finally {
    setBusy(false);
  }
}

function renderConfirm(card) {
  const form = document.createElement("form");
  form.className = "card";
  const data = card.data || {};
  const grid = document.createElement("div");
  grid.className = "grid";
  grid.append(
    input("firstName", "Taxpayer first name", data.firstName),
    input("middleInitial", "Middle initial", data.middleInitial),
    input("lastName", "Last name", data.lastName),
    input("ssn", "Synthetic SSN", data.ssn),
    input("street", "Street", data.street),
    input("apartment", "Apartment", data.apartment),
    input("city", "City", data.city),
    input("state", "State", data.state),
    input("zip", "ZIP", data.zip),
    input("employerName", "Employer name", data.employerName),
    input("box1Wages", "W-2 box 1 wages", data.box1Wages, "number"),
    input("box2FederalWithholding", "W-2 box 2 withholding", data.box2FederalWithholding, "number"),
    input("taxYear", "Tax year", data.taxYear, "number", true)
  );
  const action = document.createElement("button");
  action.textContent = "These details are right";
  action.type = "submit";
  form.append(Object.assign(document.createElement("p"), { textContent: card.text }), grid, Object.assign(document.createElement("div"), { className: "actions" }));
  form.querySelector(".actions").append(action);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = formValues(form);
    submitAnswer("confirm_w2", {
      ...values,
      box1Wages: Number(values.box1Wages),
      box2FederalWithholding: Number(values.box2FederalWithholding),
      taxYear: Number(values.taxYear)
    });
  });
  return form;
}

function renderFiling(card) {
  const form = document.createElement("form");
  form.className = "card";
  const select = document.createElement("select");
  select.name = "status";
  for (const [value, label] of [["single", "Single"], ["married_filing_jointly", "Married filing jointly"], ["married_filing_separately", "Married filing separately"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  const dynamic = document.createElement("div");
  dynamic.className = "grid";
  function redraw() {
    dynamic.replaceChildren();
    if (select.value !== "single") {
      dynamic.append(input("spouseFirstName", "Spouse first name"), input("spouseMiddleInitial", "Spouse middle initial"), input("spouseLastName", "Spouse last name"), input("spouseSsn", "Spouse synthetic SSN"));
      if (select.value === "married_filing_jointly") {
        dynamic.append(checkInput("spouseHadNoIncome", "Spouse had no income"), checkInput("spouseHadNoOtherTaxDocuments", "Spouse had no other tax documents"));
      } else {
        dynamic.append(checkInput("livedApartOrLegallySeparated", "Lived apart/legal separation condition"), checkInput("spouseWillNotItemize", "Spouse will not itemize"), checkInput("noNonresidentAlienRule", "No nonresident or dual-status spouse rule"));
      }
    }
  }
  select.addEventListener("change", redraw);
  redraw();
  const action = document.createElement("button");
  action.textContent = "Continue";
  action.type = "submit";
  form.append(Object.assign(document.createElement("p"), { textContent: card.text }), labelWrap("Filing status", select), dynamic, Object.assign(document.createElement("div"), { className: "actions" }));
  form.querySelector(".actions").append(action);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = formValues(form);
    let payload = { status: values.status };
    if (values.status !== "single") {
      payload.spouse = { firstName: values.spouseFirstName, middleInitial: values.spouseMiddleInitial || undefined, lastName: values.spouseLastName, ssn: values.spouseSsn };
    }
    if (values.status === "married_filing_jointly") {
      payload.spouseHadNoIncome = values.spouseHadNoIncome === "on";
      payload.spouseHadNoOtherTaxDocuments = values.spouseHadNoOtherTaxDocuments === "on";
    }
    if (values.status === "married_filing_separately") {
      payload.livedApartOrLegallySeparated = values.livedApartOrLegallySeparated === "on";
      payload.spouseWillNotItemize = values.spouseWillNotItemize === "on";
      payload.noNonresidentAlienRule = values.noNonresidentAlienRule === "on";
    }
    submitAnswer("filing_status", payload);
  });
  return form;
}

function labelWrap(label, control) {
  const wrap = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = label;
  wrap.append(span, control);
  return wrap;
}

function checkInput(name, label) {
  const wrap = document.createElement("label");
  const el = document.createElement("input");
  el.type = "checkbox";
  el.name = name;
  const span = document.createElement("span");
  span.textContent = label;
  wrap.append(el, span);
  return wrap;
}

function renderScope(card) {
  const form = document.createElement("form");
  form.className = "card";
  const keys = [
    ["noDependentsAndNotClaimable", "No dependents, and no one can claim the taxpayer or spouse."],
    ["under65AndNotBlind", "Taxpayer and spouse, if applicable, are under 65 for 2025 and not blind."],
    ["onlyOneW2", "This W-2 is the only income or tax document."],
    ["standardDeduction", "The standard deduction will be used."],
    ["noMarketplaceSelfEmploymentForeignIncomeAdditionalTaxOrCredit", "No Marketplace Form 1095-A, self-employment, foreign income, additional tax, or credit."],
    ["noSchedule1ADeductions", "No qualified tips, overtime, vehicle-loan-interest, or senior deductions."]
  ];
  const list = document.createElement("div");
  list.className = "grid";
  for (const [key, label] of keys) list.append(checkInput(key, label));
  const all = document.createElement("button");
  all.type = "button";
  all.textContent = "All apply";
  const something = document.createElement("button");
  something.type = "button";
  something.className = "secondary";
  something.textContent = "Something here applies";
  all.addEventListener("click", () => submitAnswer("simple_return_scope", Object.fromEntries(keys.map(([key]) => [key, true]))));
  something.addEventListener("click", () => {
    const values = formValues(form);
    const payload = Object.fromEntries(keys.map(([key]) => [key, values[key] === "on"]));
    submitAnswer("simple_return_scope", payload);
  });
  form.append(Object.assign(document.createElement("p"), { textContent: card.text }), list, Object.assign(document.createElement("div"), { className: "actions" }));
  form.querySelector(".actions").append(all, something);
  return form;
}

function renderFlags(card) {
  const form = document.createElement("form");
  form.className = "card";
  form.append(Object.assign(document.createElement("p"), { textContent: card.text }));
  const home = document.createElement("select");
  home.name = "mainHomeInUS";
  home.innerHTML = "<option value=\"true\">Yes</option><option value=\"false\">No</option>";
  const digital = document.createElement("select");
  digital.name = "digitalAssets";
  digital.innerHTML = "<option value=\"no\">No</option><option value=\"yes\">Yes</option>";
  form.append(labelWrap("Main home in the United States for more than half of 2025?", home), labelWrap("Digital asset activity?", digital));
  const action = document.createElement("button");
  action.type = "submit";
  action.textContent = "Build PDF";
  form.append(Object.assign(document.createElement("div"), { className: "actions" }));
  form.querySelector(".actions").append(action);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = formValues(form);
    submitAnswer("form_checkboxes", { mainHomeInUS: values.mainHomeInUS === "true", digitalAssets: values.digitalAssets });
  });
  return form;
}

function renderCard(card) {
  const root = $("card");
  root.replaceChildren();
  if (!card) return;
  if (card.questionId === "confirm_w2") root.append(renderConfirm(card));
  if (card.questionId === "filing_status") root.append(renderFiling(card));
  if (card.questionId === "simple_return_scope") root.append(renderScope(card));
  if (card.questionId === "form_checkboxes") root.append(renderFlags(card));
}

function renderEvents(events) {
  const list = $("events");
  list.replaceChildren();
  for (const event of events) {
    const li = document.createElement("li");
    li.className = "event";
    const time = new Date(event.at).toLocaleTimeString();
    li.textContent = `${time}  ${event.name}  ${event.summary}`;
    list.append(li);
  }
}

function render(statePayload) {
  text($("stage"), `Active - ${statePayload.stage}`);
  text($("tools"), `${statePayload.harness.toolsInvoked} of 3 invoked`);
  text($("guards"), `${statePayload.guardrails.passed} passed · ${statePayload.guardrails.blocked} blocked`);
  text($("event-count"), `${statePayload.events.length} events`);
  text($("budget"), `${statePayload.questionsUsed} / ${statePayload.questionMax}`);
  renderEvents(statePayload.events);
  const guards = $("guardrail-list");
  guards.replaceChildren();
  for (const name of ["Synthetic-data acknowledgement", "One W-2", "Tax year 2025", "Supported filing status", "Simple-return scope", "Question budget", "Tax invariants", "PDF postconditions"]) {
    const li = document.createElement("li");
    li.textContent = name;
    guards.append(li);
  }
  if (statePayload.stage !== state.lastStage) {
    addMessage("assistant", `Stage: ${statePayload.stage}`);
    state.lastStage = statePayload.stage;
  }
  renderCard(statePayload.nextCard);
  if (statePayload.result) {
    $("result").hidden = false;
    const label = statePayload.result.outcome === "refund" ? "Refund" : statePayload.result.outcome === "amount_owed" ? "Amount owed" : "Zero balance";
    text($("result-outcome"), `${label}: ${money(statePayload.result.amount)}`);
    text($("result-income"), money(statePayload.result.totalIncome));
    text($("result-taxable"), money(statePayload.result.taxableIncome));
    text($("result-tax"), money(statePayload.result.tax));
    text($("result-withholding"), money(statePayload.result.withholding));
    $("download").hidden = !statePayload.result.filename;
  }
}

async function upload(sample) {
  if (!$("ack").checked) {
    addMessage("assistant", "Please confirm that you are using synthetic data first.");
    return;
  }
  setBusy(true);
  try {
    addMessage("user", sample ? "Use the sample W-2." : "Upload selected W-2.");
    const form = new FormData();
    form.append("syntheticAcknowledgement", "true");
    if (sample) form.append("sample", "true");
    else {
      const file = $("file").files[0];
      if (!file) throw new Error("Choose a file first.");
      form.append("file", file);
    }
    const next = await requestJson("/api/w2", { method: "POST", body: form });
    render(next);
  } catch (error) {
    addMessage("assistant", error.message);
  } finally {
    setBusy(false);
  }
}

$("sample").addEventListener("click", () => upload(true));
$("upload").addEventListener("click", () => upload(false));
$("reset").addEventListener("click", async () => {
  setBusy(true);
  try {
    $("transcript").replaceChildren();
    $("result").hidden = true;
    $("download").hidden = true;
    state.lastStage = null;
    render(await requestJson("/api/reset", { method: "POST" }));
  } finally {
    setBusy(false);
  }
});

render(await requestJson("/api/session", { method: "POST" }));
