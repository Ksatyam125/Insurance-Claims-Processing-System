const state = {
  page: 1,
  size: 5,
  decision: "",
  policyType: "",
  riskCategory: "",
  editClaimId: "",
  currentEditClaim: null,
};

const screens = document.querySelectorAll(".screen");
const navButtons = document.querySelectorAll(".nav-btn");
const userMessage = document.getElementById("user-message");
const incomingMessage = document.getElementById("incoming-message");
const processedMessage = document.getElementById("processed-message");
const incomingTableBody = document.getElementById("incoming-table-body");
const processedTableBody = document.getElementById("processed-table-body");
const kpiCards = document.getElementById("kpi-cards");
const highRiskList = document.getElementById("high-risk-list");
const modal = document.getElementById("edit-modal");
const editForm = document.getElementById("edit-form");
const searchModal = document.getElementById("search-modal");
const searchModalBody = document.getElementById("search-modal-body");
const claimForm = document.getElementById("claim-form");
const policyTypeSelect = document.getElementById("policy-type-select");
const docHint = document.getElementById("doc-hint");
const editDocHint = document.getElementById("edit-doc-hint");

function showScreen(id) {
  screens.forEach((screen) => screen.classList.toggle("active", screen.id === id));
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.target === id));
}

function showMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.classList.toggle("success", !isError);
}

function clearMessage(element) {
  element.textContent = "";
  element.classList.remove("error", "success");
}

function setPolicyFields(prefix, policyType) {
  const ids =
    prefix === "user"
      ? { health: "health-fields", motor: "motor-fields", life: "life-fields" }
      : { health: "edit-health-fields", motor: "edit-motor-fields", life: "edit-life-fields" };
  const health = document.getElementById(ids.health);
  const motor = document.getElementById(ids.motor);
  const life = document.getElementById(ids.life);
  const showSelected = Boolean(policyType);
  if (health) health.classList.toggle("hidden", !showSelected || policyType !== "Health");
  if (motor) motor.classList.toggle("hidden", !showSelected || policyType !== "Motor");
  if (life) life.classList.toggle("hidden", !showSelected || policyType !== "Life");
}

function updateDocumentHint(policyType) {
  const docs = {
    Health: "Expected document names: invoice.pdf, health_card.pdf",
    Motor: "Expected document names: invoice.pdf, rc.pdf",
    Life: "Expected document names: invoice.pdf, id_proof.pdf",
  };
  docHint.textContent = docs[policyType] || "Please select a policy type to see the required fields.";
}

function updateEditDocumentHint(policyType) {
  const docs = {
    Health: "Expected document names: invoice.pdf, health_card.pdf",
    Motor: "Expected document names: invoice.pdf, rc.pdf",
    Life: "Expected document names: invoice.pdf, id_proof.pdf",
  };
  editDocHint.textContent = docs[policyType] || "Please select a policy type to see the required fields.";
}

function getSelectedPolicyType(form) {
  return form.elements.policy_type ? form.elements.policy_type.value : "Health";
}

function applyPolicyUI(form) {
  const policyType = getSelectedPolicyType(form);
  setPolicyFields(form.id === "claim-form" ? "user" : "edit", policyType);
  if (form.id === "claim-form") {
    updateDocumentHint(policyType);
  } else {
    updateEditDocumentHint(policyType);
  }
}

function filesToNames(fileList) {
  return Array.from(fileList || []).map((file) => file.name).filter(Boolean);
}

function collectFormData(form, includeFiles = true) {
  const formData = new FormData();
  const documentFiles = includeFiles ? form.elements.documents.files : [];

  formData.append("claim_id", (form.elements.claim_id?.value || "").trim());
  formData.append("customer_name", (form.elements.customer_name?.value || "").trim());
  formData.append("customer_age", String(form.elements.customer_age?.value || ""));
  formData.append("policy_type", form.elements.policy_type.value);
  formData.append("claim_amount", String(form.elements.claim_amount?.value || ""));
  formData.append("previous_claims", String(form.elements.previous_claims?.value || 0));

  const optionalFields = ["hospital", "vehicle_number", "garage_name", "nominee_name", "nominee_relationship"];
  optionalFields.forEach((field) => {
    if (form.elements[field]) {
      formData.append(field, form.elements[field].value || "");
    }
  });

  filesToNames(documentFiles).forEach((name, index) => {
    formData.append("documents", documentFiles[index], name);
  });

  return formData;
}

async function fetchJson(url, options = {}) {
  const headers = {};
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(data.detail)
      ? data.detail.map((item) => item.msg || item).join(", ")
      : data.detail || "Request failed";
    throw new Error(detail);
  }
  return data;
}

function claimExtraInfo(claim) {
  if (claim.policy_type === "Health") return claim.hospital || "-";
  if (claim.policy_type === "Motor") return [claim.vehicle_number, claim.garage_name].filter(Boolean).join(" | ") || "-";
  if (claim.policy_type === "Life") return [claim.nominee_name, claim.nominee_relationship].filter(Boolean).join(" | ") || "-";
  return "-";
}

async function submitClaim(event) {
  event.preventDefault();
  clearMessage(userMessage);

  try {
    await fetchJson("/claims/submit", {
      method: "POST",
      body: collectFormData(event.target),
    });
    showMessage(userMessage, "Claim saved in the unprocessed database.");
    event.target.reset();
    applyPolicyUI(event.target);
    await loadIncomingClaims();
  } catch (error) {
    showMessage(userMessage, error.message, true);
  }
}

async function loadIncomingClaims() {
  try {
    const claims = await fetchJson("/unprocessed-claims");
    incomingTableBody.innerHTML = claims
      .map(
        (claim) => `
        <tr>
          <td>${claim.claim_id}</td>
          <td>${claim.policy_type}</td>
          <td>${claim.customer_name}</td>
          <td>${claim.customer_age}</td>
          <td>${claim.claim_amount}</td>
          <td>${claim.documents.join(", ")}</td>
          <td>${claimExtraInfo(claim)}</td>
        </tr>
      `
      )
      .join("");
  } catch (error) {
    showMessage(incomingMessage, error.message, true);
  }
}

async function processAllClaims() {
  clearMessage(incomingMessage);
  try {
    const result = await fetchJson("/claims/process", { method: "POST" });
    showMessage(incomingMessage, `Processed ${result.processed_count} claim(s).`);
    await loadIncomingClaims();
    await loadProcessedClaims();
    await loadDashboard();
  } catch (error) {
    showMessage(incomingMessage, error.message, true);
  }
}

function statusPill(value) {
  if (!value) return "<span class='pill warning'>Pending</span>";
  if (value === "Passed" || value === "Approved") return `<span class="pill">${value}</span>`;
  if (value === "Failed" || value === "Rejected") return `<span class="pill danger">${value}</span>`;
  return `<span class="pill warning">${value}</span>`;
}

function renderProcessedRows(items) {
  processedTableBody.innerHTML = items
    .map(
      (claim) => `
      <tr>
        <td>${claim.claim_id}</td>
        <td>${claim.policy_type}</td>
        <td>${claim.customer_name}</td>
        <td>${claim.decision || "-"}</td>
        <td>${claim.risk_category || "-"}</td>
        <td>${statusPill(claim.validation_status)}</td>
        <td>${claim.claim_amount}</td>
        <td>
          <div class="action-group">
            <button class="secondary" data-action="edit" data-id="${claim.claim_id}">Update</button>
            <button class="secondary" data-action="delete" data-id="${claim.claim_id}">Delete</button>
          </div>
        </td>
      </tr>
    `
    )
    .join("");
}

async function loadProcessedClaims(page = state.page) {
  clearMessage(processedMessage);
  const params = new URLSearchParams({
    page: String(page),
    size: String(state.size),
  });
  if (state.decision) params.set("decision", state.decision);
  if (state.policyType) params.set("policy_type", state.policyType);
  if (state.riskCategory) params.set("risk_category", state.riskCategory);

  try {
    const data = await fetchJson(`/claims?${params.toString()}`);
    state.page = data.page;
    renderProcessedRows(data.items);
    document.getElementById("page-info").textContent = `Page ${data.page} of ${Math.max(1, Math.ceil(data.total / data.size))}`;
    document.getElementById("prev-page-btn").disabled = data.page <= 1;
    document.getElementById("next-page-btn").disabled = data.page * data.size >= data.total;
  } catch (error) {
    showMessage(processedMessage, error.message, true);
  }
}

async function applyFilters() {
  state.decision = document.getElementById("decision-filter").value;
  state.policyType = document.getElementById("policy-filter").value;
  state.riskCategory = document.getElementById("risk-filter").value;
  state.page = 1;
  await loadProcessedClaims(1);
}

function setEditPolicy(policyType) {
  document.getElementById("edit-policy-type").value = policyType;
  setPolicyFields("edit", policyType);
  updateEditDocumentHint(policyType);
}

function openModal(claim) {
  if (!claim) return;
  state.editClaimId = claim.claim_id;
  state.currentEditClaim = claim;
  editForm.elements.claim_id.value = claim.claim_id;
  editForm.elements.customer_name.value = claim.customer_name || "";
  editForm.elements.customer_age.value = claim.customer_age || "";
  editForm.elements.policy_type.value = claim.policy_type || "Health";
  editForm.elements.claim_amount.value = claim.claim_amount || "";
  editForm.elements.previous_claims.value = claim.previous_claims || 0;
  editForm.elements.hospital.value = claim.hospital || "";
  editForm.elements.vehicle_number.value = claim.vehicle_number || "";
  editForm.elements.garage_name.value = claim.garage_name || "";
  editForm.elements.nominee_name.value = claim.nominee_name || "";
  editForm.elements.nominee_relationship.value = claim.nominee_relationship || "";
  editForm.elements.documents.value = "";
  setEditPolicy(claim.policy_type || "Health");
  editDocHint.textContent = `Current files: ${(claim.documents || []).join(", ") || "none"}`;
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  state.editClaimId = "";
  state.currentEditClaim = null;
}

function openSearchModal(claim) {
  searchModalBody.innerHTML = `
    <div class="risk-item">
      <strong>${claim.claim_id} - ${claim.customer_name}</strong>
      <div>Policy Type: ${claim.policy_type}</div>
      <div>Decision: ${claim.decision || "-"}</div>
      <div>Risk Category: ${claim.risk_category || "-"}</div>
      <div>Validation Status: ${claim.validation_status}</div>
      <div>Amount: ${claim.claim_amount}</div>
      <div>Documents: ${(claim.documents || []).join(", ") || "-"}</div>
      <div>Extra Info: ${claimExtraInfo(claim)}</div>
      <div>Remarks: ${claim.remarks || "-"}</div>
    </div>
  `;
  searchModal.classList.remove("hidden");
}

function closeSearchModal() {
  searchModal.classList.add("hidden");
  searchModalBody.innerHTML = "";
}

async function saveEdit(event) {
  event.preventDefault();
  if (!state.editClaimId) return;

  try {
    await fetchJson(`/claims/${state.editClaimId}`, {
      method: "PUT",
      body: collectFormData(event.target, true),
    });
    closeModal();
    showMessage(processedMessage, `Claim ${state.editClaimId} updated successfully.`);
    await loadProcessedClaims();
    await loadDashboard();
  } catch (error) {
    showMessage(processedMessage, error.message, true);
  }
}

async function deleteClaim(claimId) {
  if (!confirm(`Delete claim ${claimId}?`)) return;
  try {
    await fetchJson(`/claims/${claimId}`, { method: "DELETE" });
    showMessage(processedMessage, `Claim ${claimId} deleted successfully.`);
    await loadProcessedClaims();
    await loadDashboard();
  } catch (error) {
    showMessage(processedMessage, error.message, true);
  }
}

async function searchClaim() {
  const claimId = document.getElementById("search-input").value.trim();
  if (!claimId) return;

  try {
    const claim = await fetchJson(`/claims/${encodeURIComponent(claimId)}`);
    openSearchModal(claim);
  } catch (error) {
    searchModalBody.innerHTML = `<div class="risk-item"><strong>Search failed</strong><div>${error.message}</div></div>`;
    searchModal.classList.remove("hidden");
  }
}

function drawBarChart(canvas, values, labels, colors) {
  const ctx = canvas.getContext("2d");
  const baseWidth = Number(canvas.dataset.baseWidth || canvas.width || 360);
  const baseHeight = Number(canvas.dataset.baseHeight || canvas.height || 220);
  canvas.dataset.baseWidth = String(baseWidth);
  canvas.dataset.baseHeight = String(baseHeight);
  const dpr = window.devicePixelRatio || 1;

  canvas.width = baseWidth * dpr;
  canvas.height = baseHeight * dpr;
  canvas.style.width = `${baseWidth}px`;
  canvas.style.height = `${baseHeight}px`;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, baseWidth, baseHeight);

  const max = Math.max(1, ...values);
  const barWidth = (baseWidth - 80) / values.length;

  values.forEach((value, index) => {
    const barHeight = (baseHeight - 60) * (value / max);
    const x = 40 + index * barWidth;
    const y = baseHeight - 30 - barHeight;
    ctx.fillStyle = colors[index % colors.length];
    ctx.fillRect(x, y, barWidth - 18, barHeight);
    ctx.fillStyle = "#132238";
    ctx.font = "12px Arial";
    ctx.fillText(String(value), x, y - 6);
    ctx.save();
    ctx.translate(x, baseHeight - 12);
    ctx.rotate(-0.35);
    ctx.fillText(labels[index], 0, 0);
    ctx.restore();
  });
}

function drawDoughnutChart(canvas, value, total) {
  const ctx = canvas.getContext("2d");
  const baseWidth = Number(canvas.dataset.baseWidth || canvas.width || 360);
  const baseHeight = Number(canvas.dataset.baseHeight || canvas.height || 220);
  canvas.dataset.baseWidth = String(baseWidth);
  canvas.dataset.baseHeight = String(baseHeight);
  const dpr = window.devicePixelRatio || 1;

  canvas.width = baseWidth * dpr;
  canvas.height = baseHeight * dpr;
  canvas.style.width = `${baseWidth}px`;
  canvas.style.height = `${baseHeight}px`;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, baseWidth, baseHeight);

  const centerX = baseWidth / 2;
  const centerY = baseHeight / 2;
  const radius = 70;
  const completed = Math.max(0, total - value);
  const angle = total ? (Math.PI * 2 * value) / total : 0;

  ctx.lineWidth = 24;
  ctx.strokeStyle = "#e5eef7";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "#0f766e";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + angle);
  ctx.stroke();

  ctx.fillStyle = "#132238";
  ctx.font = "700 16px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`High risk: ${value}`, centerX, centerY - 4);
  ctx.font = "12px Arial";
  ctx.fillText(`Processed: ${completed}`, centerX, centerY + 18);
}

async function loadDashboard() {
  try {
    const [summary, highRisk, processedClaims] = await Promise.all([
      fetchJson("/summary"),
      fetchJson("/claims/high-risk"),
      fetchJson("/claims?size=1000"),
    ]);
    const processedItems = processedClaims.items || [];
    const decisionCounts = {
      Approved: processedItems.filter((item) => item.decision === "Approved").length,
      Rejected: processedItems.filter((item) => item.decision === "Rejected").length,
      Manual: processedItems.filter((item) => item.decision === "Manual Verification").length,
      Review: processedItems.filter((item) => item.decision === "Need Review").length,
      Senior: processedItems.filter((item) => item.decision === "Senior Review").length,
    };

    kpiCards.innerHTML = `
      <div class="card"><span>Total</span><span class="value">${summary.total}</span></div>
      <div class="card"><span>Approved</span><span class="value">${summary.approved}</span></div>
      <div class="card"><span>High Risk</span><span class="value">${highRisk.length}</span></div>
    `;

    drawBarChart(
      document.getElementById("decisionChart"),
      [
        decisionCounts.Approved,
        decisionCounts.Rejected,
        decisionCounts.Manual,
        decisionCounts.Review,
        decisionCounts.Senior,
      ],
      ["Approved", "Rejected", "Manual", "Review", "Senior"],
      ["#0f766e", "#be123c", "#f97316", "#2563eb", "#7c3aed"]
    );
    drawDoughnutChart(document.getElementById("statusChart"), highRisk.length, summary.total || 1);

    highRiskList.innerHTML = highRisk.length
      ? highRisk
          .map(
            (claim) => `
              <div class="risk-item">
                <strong>${claim.claim_id} - ${claim.customer_name}</strong>
                <div>Policy Type: ${claim.policy_type}</div>
                <div>Decision: ${claim.decision || "-"}</div>
                <div>Risk category: ${claim.risk_category || "-"}</div>
                <div>Amount: ${claim.claim_amount}</div>
              </div>
            `
          )
          .join("")
      : "<div class='risk-item'><strong>No high risk claims yet</strong></div>";
  } catch (error) {
    highRiskList.innerHTML = `<div class="risk-item"><strong>Dashboard error</strong><div>${error.message}</div></div>`;
  }
}

navButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    showScreen(button.dataset.target);
    if (button.dataset.target === "executive-screen") {
      await loadIncomingClaims();
    }
    if (button.dataset.target === "processed-screen") {
      await loadProcessedClaims();
    }
    if (button.dataset.target === "dashboard-screen") {
      await loadDashboard();
    }
  });
});

claimForm.addEventListener("submit", submitClaim);
policyTypeSelect.addEventListener("change", (event) => {
  setPolicyFields("user", event.target.value);
  updateDocumentHint(event.target.value);
});

document.getElementById("process-all-btn").addEventListener("click", processAllClaims);
document.getElementById("search-btn").addEventListener("click", searchClaim);
document.getElementById("search-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchClaim();
  }
});
document.getElementById("apply-filter-btn").addEventListener("click", applyFilters);
document.getElementById("prev-page-btn").addEventListener("click", () => loadProcessedClaims(Math.max(1, state.page - 1)));
document.getElementById("next-page-btn").addEventListener("click", () => loadProcessedClaims(state.page + 1));
document.getElementById("refresh-dashboard-btn").addEventListener("click", loadDashboard);
document.getElementById("close-modal-btn").addEventListener("click", closeModal);
document.getElementById("close-search-modal-btn").addEventListener("click", closeSearchModal);

modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

searchModal.addEventListener("click", (event) => {
  if (event.target === searchModal) closeSearchModal();
});

editForm.addEventListener("submit", saveEdit);
document.getElementById("edit-policy-type").addEventListener("change", (event) => {
  setEditPolicy(event.target.value);
});

processedTableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const claimId = button.dataset.id;
  const action = button.dataset.action;

  if (action === "edit") {
    try {
      const claim = await fetchJson(`/claims/${encodeURIComponent(claimId)}`);
      openModal(claim);
    } catch (error) {
      showMessage(processedMessage, error.message, true);
    }
  }

  if (action === "delete") {
    await deleteClaim(claimId);
  }
});

showScreen("user-screen");
policyTypeSelect.value = "";
setPolicyFields("user", "");
updateDocumentHint("");
loadIncomingClaims();
loadProcessedClaims();
loadDashboard();
