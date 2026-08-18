// EmailPro dashboard front-end logic

let uploadedCatalogFile = null;

function initDashboard() {
  loadStats();
  loadCatalogStatus();
  loadLeads();

  const uploadBtn = document.getElementById("uploadPdfBtn");
  const fileInput = document.getElementById("catalogFileInput");
  const searchBtn = document.getElementById("searchLeadsBtn");
  const bulkBtn = document.getElementById("sendBulkBtn");
  const exportBtn = document.getElementById("exportCsvBtn");
  const resetBtn = document.getElementById("resetDbBtn");

  if (uploadBtn) uploadBtn.addEventListener("click", () => fileInput.click());
  if (fileInput) fileInput.addEventListener("change", handleCatalogUpload);
  if (searchBtn) searchBtn.addEventListener("click", handleSearchLeads);
  if (bulkBtn) bulkBtn.addEventListener("click", handleSendBulk);
  if (exportBtn) exportBtn.addEventListener("click", () => {
    window.location.href = "/api/export-csv";
  });
  if (resetBtn) resetBtn.addEventListener("click", handleResetDatabase);
}

function setStatusLine(message, isError) {
  const el = document.getElementById("statusLine");
  if (!el) return;
  el.style.display = "block";
  el.textContent = message;
  el.classList.toggle("error", !!isError);
}

async function loadStats() {
  try {
    const res = await fetch("/api/stats");
    const data = await res.json();
    document.getElementById("statTotal").textContent = data.total_leads;
    document.getElementById("statContacted").textContent = data.contacted;
    document.getElementById("statSent").textContent = data.emails_sent;
    document.getElementById("statFailed").textContent = data.failed;

    const mailStatus = document.getElementById("mailStatus");
    const mailFrom = document.getElementById("mailFrom");
    if (data.smtp_configured) {
      mailStatus.textContent = "Connected";
      mailStatus.classList.add("connected");
    } else {
      mailStatus.textContent = "Demo Mode";
      mailStatus.classList.remove("connected");
      mailStatus.classList.add("not-connected");
    }
    mailFrom.textContent = data.smtp_configured
      ? "SMTP configured"
      : "Demo mode: SMTP is not configured.";
  } catch (err) {
    console.error("Failed to load stats", err);
  }
}

async function loadCatalogStatus() {
  try {
    const res = await fetch("/api/catalog-status");
    const data = await res.json();
    const statusEl = document.getElementById("catalogStatus");
    const linkEl = document.getElementById("catalogLink");
    if (data.uploaded) {
      statusEl.textContent = "Uploaded";
      linkEl.href = data.url;
      linkEl.textContent = data.url;
      linkEl.style.display = "block";
    } else {
      statusEl.textContent = "Not uploaded";
      linkEl.style.display = "none";
    }
  } catch (err) {
    console.error("Failed to load catalog status", err);
  }
}

async function handleCatalogUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    setStatusLine("Only PDF files are allowed.", true);
    return;
  }
  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/api/upload-catalog", { method: "POST", body: formData });
    const data = await res.json();
    if (res.ok) {
      setStatusLine(`Catalog uploaded: ${data.filename}`, false);
      loadCatalogStatus();
    } else {
      setStatusLine(data.error || "Upload failed", true);
    }
  } catch (err) {
    setStatusLine("Upload failed: " + err.message, true);
  }
}

async function handleSearchLeads() {
  const keywords = document.getElementById("searchKeywords").value;
  setStatusLine(`Search complete for "${keywords}". Showing current leads below.`, false);
  loadLeads();
}

async function loadLeads() {
  try {
    const res = await fetch("/api/leads");
    const leads = await res.json();
    renderLeadsTable(leads);
  } catch (err) {
    console.error("Failed to load leads", err);
  }
}

function renderLeadsTable(leads) {
  const tbody = document.getElementById("leadsTableBody");
  tbody.innerHTML = "";

  if (!leads.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="10">No leads yet.</td></tr>`;
    return;
  }

  leads.forEach((lead) => {
    const tr = document.createElement("tr");
    tr.dataset.id = lead.id;

    tr.innerHTML = `
      <td>
        <span class="business-name">${escapeHtml(lead.business)}</span>
        ${lead.website ? `<a class="business-website" href="${escapeAttr(lead.website)}" target="_blank">Website</a>` : ""}
      </td>
      <td>${lead.owner ? escapeHtml(lead.owner) : "-"}</td>
      <td>${escapeHtml(lead.email)}</td>
      <td>${escapeHtml(lead.phone || "")}</td>
      <td>${escapeHtml(lead.country || "")}</td>
      <td>${escapeHtml(lead.source || "")}</td>
      <td>${lead.score}</td>
      <td class="${lead.contacted === 'Yes' ? 'contacted-yes' : 'contacted-no'}">${lead.contacted}</td>
      <td><button class="btn-send-row" data-action="send" data-id="${lead.id}">Send</button></td>
      <td><button class="btn-delete-row" data-action="delete" data-id="${lead.id}">Delete</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-action="send"]').forEach((btn) => {
    btn.addEventListener("click", () => handleSendSingle(btn));
  });
  tbody.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", () => handleDeleteLead(btn));
  });
}

function currentSubjectAndTemplate() {
  return {
    subject: document.getElementById("emailSubject").value,
    template: document.getElementById("emailTemplate").value,
  };
}

async function handleSendSingle(btn) {
  const id = btn.dataset.id;
  const { subject, template } = currentSubjectAndTemplate();
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "Sending...";

  try {
    const res = await fetch(`/api/send/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, template }),
    });
    const data = await res.json();
    if (res.ok) {
      setStatusLine(
        data.demo_mode
          ? `Demo mode: SMTP is not configured. Marked ${data.email} as contacted.`
          : `Email sent to ${data.email}.`,
        false
      );
      loadLeads();
      loadStats();
    } else {
      setStatusLine(data.message || "Failed to send email.", true);
    }
  } catch (err) {
    setStatusLine("Failed to send email: " + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function handleSendBulk() {
  const bulkBtn = document.getElementById("sendBulkBtn");
  const { subject, template } = currentSubjectAndTemplate();
  bulkBtn.disabled = true;
  bulkBtn.textContent = "Sending...";
  setStatusLine("Sending bulk email...", false);

  try {
    const res = await fetch("/api/send-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, template }),
    });
    const data = await res.json();
    if (res.ok) {
      setStatusLine(
        data.demo_mode
          ? `Demo mode: SMTP is not configured. ${data.sent}/${data.total} leads marked as contacted.`
          : `Bulk send complete: ${data.sent} sent, ${data.failed} failed.`,
        data.failed > 0
      );
      loadLeads();
      loadStats();
    } else {
      setStatusLine(data.error || "Bulk send failed.", true);
    }
  } catch (err) {
    setStatusLine("Bulk send failed: " + err.message, true);
  } finally {
    bulkBtn.disabled = false;
    bulkBtn.textContent = "Send Bulk Email";
  }
}

async function handleDeleteLead(btn) {
  const id = btn.dataset.id;
  if (!confirm("Delete this lead? This cannot be undone.")) return;

  try {
    const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
    if (res.ok) {
      setStatusLine("Lead deleted.", false);
      loadLeads();
      loadStats();
    } else {
      const data = await res.json();
      setStatusLine(data.error || "Failed to delete lead.", true);
    }
  } catch (err) {
    setStatusLine("Failed to delete lead: " + err.message, true);
  }
}

async function handleResetDatabase() {
  if (!confirm("Reset the database? This will remove all leads and reload sample data.")) return;
  try {
    const res = await fetch("/api/reset-database", { method: "POST" });
    if (res.ok) {
      setStatusLine("Database reset.", false);
      loadLeads();
      loadStats();
    }
  } catch (err) {
    setStatusLine("Failed to reset database: " + err.message, true);
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(str) {
  return escapeHtml(str);
}