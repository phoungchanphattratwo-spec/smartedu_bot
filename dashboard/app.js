/**
 * School Bot Dashboard — Frontend Logic
 * Communicates with the FastAPI backend at API_BASE.
 */

// When served via the backend, use relative URLs (works on any domain).
// When opening index.html directly as a file, fall back to localhost.
const API_BASE = window.location.protocol === "file:"
  ? "http://localhost:8000"
  : window.location.origin;

// ── State ──────────────────────────────────────────────────────────────────
let authToken = localStorage.getItem("token") || null;
let userRole = localStorage.getItem("role") || null;
let classes = [];

// ── Helpers ────────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  const resp = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (resp.status === 401) {
    logout();
    throw new Error("Session expired. Please log in again.");
  }
  return resp;
}

function showMsg(elementId, text, type = "success") {
  const el = document.getElementById(elementId);
  el.textContent = text;
  el.className = `msg ${type}`;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 4000);
}

function formatDate(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ── Auth ───────────────────────────────────────────────────────────────────

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("login-btn");
  const errEl = document.getElementById("login-error");
  btn.disabled = true;
  btn.textContent = "Signing in…";
  errEl.classList.add("hidden");

  const body = new URLSearchParams({
    username: document.getElementById("username").value.trim(),
    password: document.getElementById("password").value.trim(),
  });

  try {
    const resp = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!resp.ok) {
      const data = await resp.json();
      errEl.textContent = data.detail || "Invalid credentials";
      errEl.classList.remove("hidden");
      return;
    }
    const data = await resp.json();
    authToken = data.access_token;
    userRole = data.role;
    localStorage.setItem("token", authToken);
    localStorage.setItem("role", userRole);
    enterDashboard();
  } catch {
    errEl.textContent = "Could not connect to server. Is the backend running?";
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign In";
  }
});

function logout() {
  authToken = null;
  userRole = null;
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  document.getElementById("dashboard-screen").classList.remove("active");
  document.getElementById("login-screen").classList.add("active");
}

document.getElementById("logout-btn").addEventListener("click", logout);

// ── Dashboard init ─────────────────────────────────────────────────────────

function enterDashboard() {
  document.getElementById("login-screen").classList.remove("active");
  document.getElementById("dashboard-screen").classList.add("active");

  const username = userRole === "admin" ? "Admin" : "Teacher";
  document.getElementById("user-label").textContent = username;
  document.getElementById("user-avatar").textContent = username[0].toUpperCase();

  // Hide admin-only nav items for teachers
  if (userRole !== "admin") {
    document.querySelectorAll('[data-tab="broadcast"], [data-tab="classes"]').forEach(el => {
      el.style.display = "none";
    });
  }

  loadStats();
  loadClasses();
  loadHomework();
  loadHolidays();
  if (userRole === "admin") {
    loadBroadcastHistory();
  }
}

// Auto-login if token exists
if (authToken) enterDashboard();

// ── Tab navigation ─────────────────────────────────────────────────────────

const TAB_TITLES = {
  homework: "Homework",
  holidays: "Holidays",
  broadcast: "Broadcast",
  classes: "Classes",
};

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    document.getElementById("topbar-title").textContent = TAB_TITLES[btn.dataset.tab] || "";
  });
});

// ── Stats ──────────────────────────────────────────────────────────────────

async function loadStats() {
  try {
    const [subResp, clsResp] = await Promise.all([
      apiFetch("/api/subscribers/count"),
      apiFetch("/api/classes"),
    ]);
    if (subResp.ok) {
      const d = await subResp.json();
      document.getElementById("stat-subscribers").textContent = d.count;
    }
    if (clsResp.ok) {
      const d = await clsResp.json();
      document.getElementById("stat-classes").textContent = d.length;
    }
  } catch { /* silent */ }
}

// ── Classes ────────────────────────────────────────────────────────────────

async function loadClasses() {
  try {
    const resp = await apiFetch("/api/classes");
    if (!resp.ok) return;
    classes = await resp.json();
    renderClasses();
    populateClassSelects();
  } catch { /* silent */ }
}

function renderClasses() {
  const container = document.getElementById("classes-list");
  if (!classes.length) {
    container.innerHTML = '<p class="empty-state">No classes yet. Add one above.</p>';
    return;
  }
  container.innerHTML = classes.map(c => `
    <div class="item-card">
      <div class="item-body">
        <div class="item-title">
          <span class="badge badge-violet">${c.code}</span>
          ${c.name}
        </div>
        <div class="item-meta">Added ${formatDate(c.created_at)}</div>
      </div>
      ${userRole === "admin" ? `<button class="btn btn-ghost-red" onclick="deleteClass(${c.id})">Delete</button>` : ""}
    </div>
  `).join("");
}

function populateClassSelects() {
  const selects = ["hw-class", "hw-filter-class"];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    const current = sel.value;
    sel.innerHTML = id === "hw-filter-class"
      ? '<option value="">All classes</option>'
      : '<option value="">Select class…</option>';
    classes.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.code;
      opt.textContent = `${c.name} (${c.code})`;
      sel.appendChild(opt);
    });
    if (current) sel.value = current;
  });
}

document.getElementById("class-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    name: document.getElementById("cls-name").value.trim(),
    code: document.getElementById("cls-code").value.trim().toUpperCase(),
  };
  try {
    const resp = await apiFetch("/api/classes", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) { showMsg("cls-msg", data.detail || "Error", "error"); return; }
    showMsg("cls-msg", `Class "${data.name}" added successfully.`, "success");
    e.target.reset();
    loadClasses();
    loadStats();
  } catch {
    showMsg("cls-msg", "Connection error.", "error");
  }
});

async function deleteClass(id) {
  if (!confirm("Delete this class? All associated homework will also be deleted.")) return;
  try {
    await apiFetch(`/api/classes/${id}`, { method: "DELETE" });
    loadClasses();
    loadStats();
  } catch { alert("Error deleting class."); }
}

// ── Homework ───────────────────────────────────────────────────────────────

async function loadHomework(classCode = "") {
  const container = document.getElementById("homework-list");
  container.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const path = classCode ? `/api/homework/${classCode}` : "/api/homework/ALL";
    // If no filter, load for each class and merge
    let allHw = [];
    if (!classCode) {
      const results = await Promise.all(
        classes.map(c => apiFetch(`/api/homework/${c.code}`).then(r => r.ok ? r.json() : []))
      );
      allHw = results.flat().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else {
      const resp = await apiFetch(`/api/homework/${classCode}`);
      allHw = resp.ok ? await resp.json() : [];
    }

    if (!allHw.length) {
      container.innerHTML = '<p class="empty-state">No homework submissions found.</p>';
      return;
    }

    container.innerHTML = allHw.map(hw => `
      <div class="item-card">
        <div class="item-body">
          <div class="item-title">
            <span class="badge badge-indigo">${hw.subject}</span>
            ${hw.description}
          </div>
          <div class="item-meta">
            Due: <strong>${hw.due_date}</strong>
            <span class="dot">·</span>
            ${hw.submitted_by}
            <span class="dot">·</span>
            ${formatDate(hw.created_at)}
            ${hw.file_name ? `<span class="dot">·</span> <a href="${hw.file_url}" target="_blank" class="file-link">📎 ${hw.file_name}</a>` : ""}
          </div>
        </div>
        <button class="btn btn-ghost-red" onclick="deleteHomework(${hw.id})">Delete</button>
      </div>
    `).join("");
  } catch {
    container.innerHTML = '<p class="empty-state">Failed to load homework.</p>';
  }
}

document.getElementById("hw-filter-class").addEventListener("change", (e) => {
  loadHomework(e.target.value);
});

document.getElementById("homework-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById("hw-file");
  const formData = new FormData();
  formData.append("class_code", document.getElementById("hw-class").value);
  formData.append("subject", document.getElementById("hw-subject").value.trim());
  formData.append("description", document.getElementById("hw-description").value.trim());
  formData.append("due_date", document.getElementById("hw-due").value.trim());
  formData.append("submitted_by", document.getElementById("hw-teacher").value.trim());
  if (fileInput.files[0]) {
    formData.append("file", fileInput.files[0]);
  }
  try {
    const headers = {};
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
    const resp = await fetch(`${API_BASE}/api/homework`, {
      method: "POST",
      headers,
      body: formData,
    });
    const data = await resp.json();
    if (!resp.ok) { showMsg("hw-msg", data.detail || "Error", "error"); return; }
    showMsg("hw-msg", "Homework submitted successfully.", "success");
    e.target.reset();
    document.getElementById("file-preview").classList.add("hidden");
    loadHomework(document.getElementById("hw-filter-class").value);
  } catch {
    showMsg("hw-msg", "Connection error.", "error");
  }
});

async function deleteHomework(id) {
  if (!confirm("Delete this homework entry?")) return;
  try {
    await apiFetch(`/api/homework/${id}`, { method: "DELETE" });
    loadHomework(document.getElementById("hw-filter-class").value);
  } catch { alert("Error deleting homework."); }
}

// ── Holidays ───────────────────────────────────────────────────────────────

async function loadHolidays() {
  const container = document.getElementById("holidays-list");
  try {
    const resp = await apiFetch("/api/holidays");
    const holidays = resp.ok ? await resp.json() : [];
    if (!holidays.length) {
      container.innerHTML = '<p class="empty-state">No holidays scheduled.</p>';
      return;
    }
    container.innerHTML = holidays.map(h => `
      <div class="item-card">
        <div class="item-body">
          <div class="item-title">
            <span class="badge badge-emerald">Holiday</span>
            ${h.title}
          </div>
          <div class="item-meta">
            ${h.start_date === h.end_date ? h.start_date : `${h.start_date} → ${h.end_date}`}
            ${h.reason ? `<span class="dot">·</span> ${h.reason}` : ""}
          </div>
        </div>
        ${userRole === "admin" ? `<button class="btn btn-ghost-red" onclick="deleteHoliday(${h.id})">Delete</button>` : ""}
      </div>
    `).join("");
  } catch {
    container.innerHTML = '<p class="empty-state">Failed to load holidays.</p>';
  }
}

document.getElementById("holiday-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    title: document.getElementById("hol-title").value.trim(),
    start_date: document.getElementById("hol-start").value,
    end_date: document.getElementById("hol-end").value,
    reason: document.getElementById("hol-reason").value.trim() || null,
  };
  try {
    const resp = await apiFetch("/api/holidays", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) { showMsg("hol-msg", data.detail || "Error", "error"); return; }
    showMsg("hol-msg", "Holiday added successfully.", "success");
    e.target.reset();
    loadHolidays();
  } catch {
    showMsg("hol-msg", "Connection error.", "error");
  }
});

async function deleteHoliday(id) {
  if (!confirm("Delete this holiday?")) return;
  try {
    await apiFetch(`/api/holidays/${id}`, { method: "DELETE" });
    loadHolidays();
  } catch { alert("Error deleting holiday."); }
}

// ── Broadcast ──────────────────────────────────────────────────────────────

document.getElementById("bc-message").addEventListener("input", (e) => {
  document.getElementById("bc-char-count").textContent = e.target.value.length;
});

document.getElementById("broadcast-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = document.getElementById("bc-message").value.trim();
  if (!message) return;
  if (!confirm(`Send this message to ALL subscribers?\n\n"${message}"`)) return;

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Sending…";

  try {
    const resp = await apiFetch("/api/broadcast", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    const data = await resp.json();
    if (!resp.ok) { showMsg("bc-msg", data.detail || "Error", "error"); return; }
    showMsg("bc-msg", `✅ Sent to ${data.sent_to} subscriber(s).`, "success");
    e.target.reset();
    document.getElementById("bc-char-count").textContent = "0";
    loadBroadcastHistory();
  } catch {
    showMsg("bc-msg", "Connection error.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Send to All Subscribers";
  }
});

async function loadBroadcastHistory() {
  const container = document.getElementById("broadcast-history");
  try {
    const resp = await apiFetch("/api/broadcast/history");
    const logs = resp.ok ? await resp.json() : [];
    if (!logs.length) {
      container.innerHTML = '<p class="empty-state">No broadcasts sent yet.</p>';
      return;
    }
    container.innerHTML = logs.map(l => `
      <div class="item-card">
        <div class="item-body">
          <div class="item-title">
            <span class="badge badge-amber">${l.recipient_count} sent</span>
            ${l.message}
          </div>
          <div class="item-meta">
            By ${l.sent_by}
            <span class="dot">·</span>
            ${formatDate(l.sent_at)}
          </div>
        </div>
      </div>
    `).join("");
  } catch {
    container.innerHTML = '<p class="empty-state">Failed to load history.</p>';
  }
}

// ── File drop zone ────────────────────────────────────────────────────────

const fileDrop = document.getElementById("file-drop");
const fileInput = document.getElementById("hw-file");
const filePreview = document.getElementById("file-preview");
const fileNameDisplay = document.getElementById("file-name-display");
const fileClear = document.getElementById("file-clear");

if (fileDrop) {
  // Click to browse
  fileDrop.addEventListener("click", () => fileInput.click());
  document.querySelector(".file-drop-link")?.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  // Drag and drop
  fileDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    fileDrop.classList.add("drag-over");
  });
  fileDrop.addEventListener("dragleave", () => fileDrop.classList.remove("drag-over"));
  fileDrop.addEventListener("drop", (e) => {
    e.preventDefault();
    fileDrop.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) setFile(file);
  });

  // File input change
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) setFile(fileInput.files[0]);
  });

  // Clear button
  fileClear.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.value = "";
    filePreview.classList.add("hidden");
    fileDrop.style.display = "flex";
  });
}

function setFile(file) {
  fileNameDisplay.textContent = file.name;
  filePreview.classList.remove("hidden");
  fileDrop.style.display = "none";
}
