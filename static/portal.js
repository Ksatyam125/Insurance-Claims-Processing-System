const state = {
  page: 1,
  size: 5,
  decision: "",
  policyType: "",
  riskCategory: "",
  editClaimId: "",
};

const screens = document.querySelectorAll(".screen");
const navButtons = document.querySelectorAll(".nav-btn[data-target]");
const incomingMessage = document.getElementById("incoming-message");
const processedMessage = document.getElementById("processed-message");
const incomingTableBody = document.getElementById("incoming-table-body");
const processedTableBody = document.getElementById("processed-table-body");
const kpiCards = document.getElementById("kpi-cards");
const riskyCustomersPanel = document.getElementById("risky-customers-panel");
const modal = document.getElementById("edit-modal");
const editForm = document.getElementById("edit-form");
const searchModal = document.getElementById("search-modal");
const searchModalBody = document.getElementById("search-modal-body");
const decisionLegend = document.getElementById("decision-legend");
const policyLegend = document.getElementById("policy-legend");
const riskLegend = document.getElementById("risk-legend");

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

function renderLegend(element, items) {
  element.innerHTML = items
    .map(
      (item) => `
        <div class="legend-item">
          <span class="legend-swatch" style="background-color:${item.color}; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12)"></span>
          <span>${item.label}</span>
        </div>
      `
    )
    .join("");
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
  document.getElementById("edit-health-fields").classList.toggle("hidden", policyType !== "Health");
  document.getElementById("edit-motor-fields").classList.toggle("hidden", policyType !== "Motor");
  document.getElementById("edit-life-fields").classList.toggle("hidden", policyType !== "Life");
  const docs = {
    Health: "Expected document names: invoice.pdf, health_card.pdf",
    Motor: "Expected document names: invoice.pdf, rc.pdf",
    Life: "Expected document names: invoice.pdf, id_proof.pdf",
  };
  document.getElementById("edit-doc-hint").textContent = docs[policyType] || "";
}

function openModal(claim) {
  if (!claim) return;
  state.editClaimId = claim.claim_id;
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
  document.getElementById("edit-doc-hint").textContent = `Current files: ${(claim.documents || []).join(", ") || "none"}`;
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  state.editClaimId = "";
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

function collectFormData(form, includeFiles = true) {
  const formData = new FormData();
  const fileInput = form.elements.documents;
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

  if (includeFiles) {
    Array.from(fileInput.files || []).forEach((file) => {
      formData.append("documents", file, file.name);
    });
  }

  return formData;
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
  const safeValues = values.map((value) => Number(value) || 0);
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

  const max = Math.max(1, ...safeValues);
  const barWidth = (baseWidth - 80) / Math.max(1, safeValues.length);
  safeValues.forEach((value, index) => {
    const barHeight = (baseHeight - 60) * (value / max);
    const x = 40 + index * barWidth;
    const y = baseHeight - 30 - barHeight;
    ctx.fillStyle = colors[index % colors.length];
    ctx.fillRect(x, y, barWidth - 18, barHeight);
    ctx.fillStyle = "#132238";
    ctx.font = "12px Arial";
    ctx.fillText(String(value), x, y - 6);
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
    const [summary, highRisk, incomingClaims, processedClaims] = await Promise.all([
      fetchJson("/summary"),
      fetchJson("/claims/high-risk"),
      fetchJson("/unprocessed-claims"),
      fetchJson("/claims?size=1000"),
    ]);

    const processedItems = processedClaims.items || [];
    const policyCounts = {
      Health: processedItems.filter((item) => item.policy_type === "Health").length,
      Motor: processedItems.filter((item) => item.policy_type === "Motor").length,
      Life: processedItems.filter((item) => item.policy_type === "Life").length,
    };
    const decisionCounts = {
      Approved: processedItems.filter((item) => item.decision === "Approved").length,
      Rejected: processedItems.filter((item) => item.decision === "Rejected").length,
      Manual: processedItems.filter((item) => item.decision === "Manual Verification").length,
      Review: processedItems.filter((item) => item.decision === "Need Review").length,
      Senior: processedItems.filter((item) => item.decision === "Senior Review").length,
    };
    const riskCounts = {
      Low: processedItems.filter((item) => item.risk_category === "Low").length,
      Medium: processedItems.filter((item) => item.risk_category === "Medium").length,
      High: processedItems.filter((item) => item.risk_category === "High").length,
    };
    const totalAmount = processedItems.reduce((sum, item) => sum + Number(item.claim_amount || 0), 0);
    const averageAmount = processedItems.length ? Math.round(totalAmount / processedItems.length) : 0;
    const pendingCount = incomingClaims.length + Number(summary.manual_verification || 0) + Number(summary.need_review || 0);

    kpiCards.innerHTML = `
      <div class="card"><span>Total Processed</span><span class="value">${summary.total}</span></div>
      <div class="card"><span>Pending</span><span class="value">${pendingCount}</span></div>
      <div class="card"><span>Approved</span><span class="value">${summary.approved}</span></div>
      <div class="card"><span>Rejected</span><span class="value">${summary.rejected}</span></div>
      <div class="card"><span>High Risk</span><span class="value">${highRisk.length}</span></div>
      <div class="card"><span>Avg. Claim Amount</span><span class="value">${averageAmount}</span></div>
    `;

    drawBarChart(
      document.getElementById("decisionChart"),
      [decisionCounts.Approved, decisionCounts.Rejected, decisionCounts.Manual, decisionCounts.Review, decisionCounts.Senior],
      ["Approved", "Rejected", "Manual", "Review", "Senior"],
      ["#0f766e", "#be123c", "#f97316", "#2563eb", "#7c3aed"]
    );
    drawBarChart(
      document.getElementById("statusChart"),
      [policyCounts.Health, policyCounts.Motor, policyCounts.Life],
      ["Health", "Motor", "Life"],
      ["#0f766e", "#be123c", "#f97316"]
    );
    drawBarChart(
      document.getElementById("riskChart"),
      [riskCounts.Low, riskCounts.Medium, riskCounts.High],
      ["Low", "Medium", "High"],
      ["#166534", "#d97706", "#be123c"]
    );

    renderLegend(decisionLegend, [
      { label: `Approved (${decisionCounts.Approved})`, color: "#0f766e" },
      { label: `Rejected (${decisionCounts.Rejected})`, color: "#be123c" },
      { label: `Manual Verification (${decisionCounts.Manual})`, color: "#f97316" },
      { label: `Need Review (${decisionCounts.Review})`, color: "#2563eb" },
      { label: `Senior Review (${decisionCounts.Senior})`, color: "#7c3aed" },
    ]);
    renderLegend(policyLegend, [
      { label: `Health (${policyCounts.Health})`, color: "#0f766e" },
      { label: `Motor (${policyCounts.Motor})`, color: "#be123c" },
      { label: `Life (${policyCounts.Life})`, color: "#f97316" },
    ]);
    renderLegend(riskLegend, [
      { label: `Low (${riskCounts.Low})`, color: "#166534" },
      { label: `Medium (${riskCounts.Medium})`, color: "#d97706" },
      { label: `High (${riskCounts.High})`, color: "#be123c" },
    ]);

    riskyCustomersPanel.innerHTML = highRisk.length
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
    riskyCustomersPanel.innerHTML = `<div class="risk-item"><strong>Dashboard error</strong><div>${error.message}</div></div>`;
  }
}

navButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    showScreen(button.dataset.target);
    if (button.dataset.target === "executive-screen") await loadIncomingClaims();
    if (button.dataset.target === "processed-screen") await loadProcessedClaims();
    if (button.dataset.target === "dashboard-screen") await loadDashboard();
  });
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
document.getElementById("edit-policy-type").addEventListener("change", (event) => setEditPolicy(event.target.value));

modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});
searchModal.addEventListener("click", (event) => {
  if (event.target === searchModal) closeSearchModal();
});
editForm.addEventListener("submit", saveEdit);
processedTableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const claimId = button.dataset.id;
  if (button.dataset.action === "edit") {
    try {
      const claim = await fetchJson(`/claims/${encodeURIComponent(claimId)}`);
      openModal(claim);
    } catch (error) {
      showMessage(processedMessage, error.message, true);
    }
  }
  if (button.dataset.action === "delete") {
    await deleteClaim(claimId);
  }
});

showScreen("executive-screen");
loadIncomingClaims();
loadProcessedClaims();
loadDashboard();
