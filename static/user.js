const claimForm = document.getElementById("claim-form");
const policyTypeSelect = document.getElementById("policy-type-select");
const docHint = document.getElementById("doc-hint");
const userMessage = document.getElementById("user-message");

function showMessage(message, isError = false) {
  userMessage.textContent = message;
  userMessage.classList.toggle("error", isError);
  userMessage.classList.toggle("success", !isError);
}

function clearMessage() {
  userMessage.textContent = "";
  userMessage.classList.remove("error", "success");
}

function setPolicyFields(policyType) {
  document.getElementById("health-fields").classList.toggle("hidden", policyType !== "Health");
  document.getElementById("motor-fields").classList.toggle("hidden", policyType !== "Motor");
  document.getElementById("life-fields").classList.toggle("hidden", policyType !== "Life");
}

function updateHints(policyType) {
  const docs = {
    Health: "Expected document names: invoice.pdf, health_card.pdf",
    Motor: "Expected document names: invoice.pdf, rc.pdf",
    Life: "Expected document names: invoice.pdf, id_proof.pdf",
  };
  docHint.textContent = docs[policyType] || "Please select a policy type to see the required fields.";
}

function updateRequiredFields(policyType) {
  const healthHospital = claimForm.elements.hospital;
  const vehicleNumber = claimForm.elements.vehicle_number;
  const garageName = claimForm.elements.garage_name;
  const nomineeName = claimForm.elements.nominee_name;
  const nomineeRelationship = claimForm.elements.nominee_relationship;

  [healthHospital, vehicleNumber, garageName, nomineeName, nomineeRelationship].forEach((field) => {
    if (field) field.required = false;
  });

  if (policyType === "Health" && healthHospital) healthHospital.required = true;
  if (policyType === "Motor") {
    if (vehicleNumber) vehicleNumber.required = true;
    if (garageName) garageName.required = true;
  }
  if (policyType === "Life") {
    if (nomineeName) nomineeName.required = true;
    if (nomineeRelationship) nomineeRelationship.required = true;
  }
}

function applyPolicyUI(policyType) {
  if (!policyType) {
    setPolicyFields("");
    updateHints("");
    updateRequiredFields("");
    return;
  }
  setPolicyFields(policyType);
  updateHints(policyType);
  updateRequiredFields(policyType);
}

function collectFormData(form) {
  const formData = new FormData();
  formData.append("claim_id", form.elements.claim_id.value.trim());
  formData.append("customer_name", form.elements.customer_name.value.trim());
  formData.append("customer_age", form.elements.customer_age.value);
  formData.append("policy_type", form.elements.policy_type.value);
  formData.append("claim_amount", form.elements.claim_amount.value);
  formData.append("previous_claims", form.elements.previous_claims.value || "0");

  ["hospital", "vehicle_number", "garage_name", "nominee_name", "nominee_relationship"].forEach((field) => {
    if (form.elements[field]) {
      formData.append(field, form.elements[field].value || "");
    }
  });

  Array.from(form.elements.documents.files || []).forEach((file) => {
    formData.append("documents", file, file.name);
  });

  return formData;
}

async function submitClaim(event) {
  event.preventDefault();
  clearMessage();

  try {
    const response = await fetch("/claims/submit", {
      method: "POST",
      body: collectFormData(event.target),
    });
    const data = await response.json();
    if (!response.ok) {
      const detail = Array.isArray(data.detail) ? data.detail.map((item) => item.msg || item).join(", ") : data.detail;
      throw new Error(detail || "Request failed");
    }
    showMessage("Claim submitted successfully.");
    event.target.reset();
    policyTypeSelect.value = "";
    applyPolicyUI("");
  } catch (error) {
    showMessage(error.message, true);
  }
}

policyTypeSelect.addEventListener("change", (event) => {
  applyPolicyUI(event.target.value);
});

claimForm.addEventListener("submit", submitClaim);
policyTypeSelect.value = "";
applyPolicyUI("");

