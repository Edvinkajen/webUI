/* app.js
   - Håller all UI/state + chart/logg
   - Tar emot "events" från transport: WS, BLE, Simulator
*/

const ADMIN_PASSWORD = "limpan69";

// ======= App state =======
const users = [];
const measurements = []; // {timestamp: Date, userId, value}
let activeUserId = "";
let selectedUserId = "";

let transport = null; // { name, send(obj), connect(), disconnect(), isConnected() }

// ======= Elements =======
const statusLine = document.getElementById("statusLine");
const envHint = document.getElementById("envHint");

const connectWsBtn = document.getElementById("connectWsBtn");
const connectBleBtn = document.getElementById("connectBleBtn");
const startSimBtn = document.getElementById("startSimBtn");
const stopSimBtn  = document.getElementById("stopSimBtn");

const espHostInput = document.getElementById("espHost");
const bleServiceInput = document.getElementById("bleService");
const bleCharInput = document.getElementById("bleChar");
const bleNamePrefixInput = document.getElementById("bleNamePrefix");
const bleSupportHint = document.getElementById("bleSupportHint");

const userSelect = document.getElementById("user-select");
const activeUserSelect = document.getElementById("active-user-select");
const currentUserChip = document.getElementById("current-user-chip");
const activeUserLabel = document.getElementById("active-user-label");

const newUserNameInput = document.getElementById("new-user-name");
const newUserColorInput = document.getElementById("new-user-color");
const addUserBtn = document.getElementById("add-user-btn");

const liveValueEl = document.getElementById("live-value");
const liveMetaEl = document.getElementById("live-meta");
const sessionStatsEl = document.getElementById("session-stats");
const measurementTableBody = document.getElementById("measurement-table-body");
const datasetLegendEl = document.getElementById("dataset-legend");

const toggleAdminBtn = document.getElementById("toggle-admin-btn");
const adminPanelEl = document.getElementById("admin-panel");
const adminPasswordInput = document.getElementById("admin-password");
const adminConfirmBtn = document.getElementById("admin-confirm-btn");
const adminActionsEl = document.getElementById("admin-actions");
const adminStatusEl = document.getElementById("admin-status");

const adminUserFiltersEl = document.getElementById("admin-user-filters");
const downloadEspAllBtn = document.getElementById("download-esp-all-btn");
const downloadEspFilteredBtn = document.getElementById("download-esp-filtered-btn");
const clearDataBtn = document.getElementById("clear-data-btn");
const testMeasureBtn = document.getElementById("test-measure-btn");
const setActiveUserBtn = document.getElementById("set-active-user-btn");

const userStatsUserLabelEl = document.getElementById("user-stats-user-label");
const userStatsEmptyEl = document.getElementById("user-stats-empty");
const userStatsGridEl = document.getElementById("user-stats-grid");
const userStatsCountEl = document.getElementById("user-stats-count");
const userStatsMaxEl = document.getElementById("user-stats-max");
const userStatsAvgEl = document.getElementById("user-stats-avg");
const userStatsLastEl = document.getElementById("user-stats-last");
const userStatsLastTimeEl = document.getElementById("user-stats-last-time");
const userStatsTrendEl = document.getElementById("user-stats-trend");
const userStatsPeriodEl = document.getElementById("user-stats-period");
const userStatsRankEl = document.getElementById("user-stats-rank");
const userStatsRankDetailEl = document.getElementById("user-stats-rank-detail");

// ======= Helpers =======
function formatTime(date) {
  const d = new Date(date);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
function getUserById(id) { return users.find(u => u.id === id) || null; }

function setStatus(text) { statusLine.textContent = text; }

function inferEnvHint() {
  const isHttps = location.protocol === "https:";
  const isGitHubPages = location.hostname.endsWith("github.io");
  envHint.textContent = isGitHubPages
    ? `Du kör på GitHub Pages (${isHttps ? "https" : "http"}). WebSocket till ws:// kan blockas.`
    : `Du kör lokalt (${location.origin}).`;
}
inferEnvHint();

// Persist settings
function loadSettings() {
  espHostInput.value = localStorage.getItem("espHost") || "192.168.4.1";
  bleServiceInput.value = localStorage.getItem("bleService") || "";
  bleCharInput.value = localStorage.getItem("bleChar") || "";
  bleNamePrefixInput.value = localStorage.getItem("bleNamePrefix") || "ALKO";
}
function saveSettings() {
  localStorage.setItem("espHost", espHostInput.value.trim());
  localStorage.setItem("bleService", bleServiceInput.value.trim());
  localStorage.setItem("bleChar", bleCharInput.value.trim());
  localStorage.setItem("bleNamePrefix", bleNamePrefixInput.value.trim());
}
["change","blur","keyup"].forEach(ev => {
  espHostInput.addEventListener(ev, saveSettings);
  bleServiceInput.addEventListener(ev, saveSettings);
  bleCharInput.addEventListener(ev, saveSettings);
  bleNamePrefixInput.addEventListener(ev, saveSettings);
});
loadSettings();

// ======= Chart =======
const chartCtx = document.getElementById("measurementChart").getContext("2d");
const measurementChart = new Chart(chartCtx, {
  type: "line",
  data: { datasets: [] },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: "time",
        time: { displayFormats: { second: "HH:mm:ss" } },
        ticks: { color: "#9ca3af" },
        grid: { color: "rgba(55,65,81,0.6)" }
      },
      y: {
        ticks: { color: "#9ca3af" },
        grid: { color: "rgba(55,65,81,0.6)" }
      }
    },
    plugins: { legend: { display: false } },
    elements: { line: { tension: 0.25 }, point: { radius: 2, hoverRadius: 4 } }
  }
});

function ensureDataset(u) {
  let ds = measurementChart.data.datasets.find(d => d.userId === u.id);
  if (!ds) {
    ds = {
      label: u.name,
      userId: u.id,
      data: [],
      borderColor: u.color,
      backgroundColor: u.color + "44",
      borderWidth: 2,
      pointRadius: 2
    };
    measurementChart.data.datasets.push(ds);
  }
  return ds;
}
function updateLegend() {
  if (measurementChart.data.datasets.length === 0) {
    datasetLegendEl.textContent = "Inga mätningar än";
    return;
  }
  datasetLegendEl.innerHTML = measurementChart.data.datasets
    .map(ds => `<span class="tag"><span class="tag-color" style="background:${ds.borderColor};"></span>${ds.label}</span>`)
    .join(" ");
}
function rebuildChartFromState() {
  measurementChart.data.datasets = [];
  users.forEach(u => {
    const ds = ensureDataset(u);
    measurements.filter(m => m.userId === u.id).forEach(m => {
      ds.data.push({ x: m.timestamp, y: m.value });
    });
  });
  measurementChart.update();
  updateLegend();
}

// ======= UI rebuild =======
function rebuildUserSelects() {
  const prevSelected = selectedUserId || userSelect.value;

  userSelect.innerHTML = "";
  activeUserSelect.innerHTML = "";

  if (users.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Inga användare";
    userSelect.appendChild(opt);

    const opt2 = document.createElement("option");
    opt2.value = "";
    opt2.textContent = "Inga användare";
    activeUserSelect.appendChild(opt2);
  } else {
    users.forEach(u => {
      const a = document.createElement("option");
      a.value = u.id;
      a.textContent = u.name;
      userSelect.appendChild(a);

      const b = document.createElement("option");
      b.value = u.id;
      b.textContent = u.name;
      activeUserSelect.appendChild(b);
    });
  }

  if (prevSelected && users.some(u => u.id === prevSelected)) selectedUserId = prevSelected;
  else if (users.length > 0) selectedUserId = users[0].id;
  else selectedUserId = "";

  userSelect.value = selectedUserId || "";
  activeUserSelect.value = activeUserId || "";
  updateActiveUserUI();
  rebuildAdminUserFilters();
  updateUserStats();
}

function updateActiveUserUI() {
  const u = getUserById(activeUserId);
  if (!u) {
    currentUserChip.textContent = "Ingen aktiv användare";
    activeUserLabel.textContent = "Ingen";
  } else {
    currentUserChip.innerHTML = `<span class="legend-dot" style="background:${u.color};"></span>${u.name}`;
    activeUserLabel.textContent = u.name;
  }
}

function rebuildAdminUserFilters() {
  adminUserFiltersEl.innerHTML = "";
  users.forEach(u => {
    const id = `admin-filter-${u.id}`;
    const label = document.createElement("label");
    label.htmlFor = id;
    label.innerHTML = `
      <input type="checkbox" id="${id}" value="${u.id}">
      <span class="tag-color" style="background:${u.color};"></span>
      ${u.name}
    `;
    adminUserFiltersEl.appendChild(label);
  });
}

function appendMeasurementRow(m) {
  const u = getUserById(m.userId);
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>${formatTime(m.timestamp)}</td>
    <td>${u ? u.name : "Okänd"}</td>
    <td>${m.value.toFixed(3)}‰</td>
  `;
  measurementTableBody.appendChild(tr);
}
function rebuildMeasurementTable() {
  measurementTableBody.innerHTML = "";
  measurements.forEach(appendMeasurementRow);
}

function updateStats() {
  if (measurements.length === 0) {
    sessionStatsEl.textContent = "0 mätningar • max – • medel –";
    return;
  }
  let sum = 0;
  let maxVal = -Infinity;
  measurements.forEach(m => { sum += m.value; maxVal = Math.max(maxVal, m.value); });
  const avg = sum / measurements.length;
  sessionStatsEl.textContent = `${measurements.length} mätningar • max ${maxVal.toFixed(3)}‰ • medel ${avg.toFixed(3)}‰`;
}

function updateUserStats() {
  const id = selectedUserId;
  const user = getUserById(id);

  if (!user) {
    userStatsUserLabelEl.textContent = "Ingen användare vald.";
    userStatsEmptyEl.style.display = "block";
    userStatsGridEl.style.display = "none";
    return;
  }

  userStatsUserLabelEl.textContent = `Statistik för ${user.name}`;
  const list = measurements.filter(m => m.userId === user.id);

  if (list.length === 0) {
    userStatsEmptyEl.style.display = "block";
    userStatsGridEl.style.display = "none";
    return;
  }

  userStatsEmptyEl.style.display = "none";
  userStatsGridEl.style.display = "grid";

  const count = list.length;
  const maxVal = Math.max(...list.map(m => m.value));
  const avg = list.reduce((a, b) => a + b.value, 0) / count;
  const last = list[list.length - 1];
  const first = list[0];

  userStatsCountEl.textContent = count;
  userStatsMaxEl.textContent = maxVal.toFixed(3) + "‰";
  userStatsAvgEl.textContent = avg.toFixed(3) + "‰";
  userStatsLastEl.textContent = last.value.toFixed(3) + "‰";
  userStatsLastTimeEl.textContent = "Tid " + formatTime(last.timestamp);

  if (count < 2) {
    userStatsTrendEl.textContent = "För få mätningar";
    userStatsTrendEl.className = "user-stat-value trend-neutral";
  } else {
    const diff = last.value - list[list.length - 2].value;
    if (diff > 0.02) {
      userStatsTrendEl.textContent = `Stigande ↑ (+${diff.toFixed(3)}‰)`;
      userStatsTrendEl.className = "user-stat-value trend-positive";
    } else if (diff < -0.02) {
      userStatsTrendEl.textContent = `Sjunkande ↓ (${diff.toFixed(3)}‰)`;
      userStatsTrendEl.className = "user-stat-value trend-negative";
    } else {
      userStatsTrendEl.textContent = "Stabil ↔";
      userStatsTrendEl.className = "user-stat-value trend-neutral";
    }
  }

  userStatsPeriodEl.textContent =
    (first.timestamp.getTime() === last.timestamp.getTime())
      ? formatTime(first.timestamp)
      : `${formatTime(first.timestamp)} – ${formatTime(last.timestamp)}`;

  const ranking = users.map(u => {
    const listU = measurements.filter(m => m.userId === u.id);
    if (listU.length === 0) return null;
    const avgU = listU.reduce((a, b) => a + b.value, 0) / listU.length;
    return { id: u.id, avg: avgU };
  }).filter(Boolean).sort((a, b) => b.avg - a.avg);

  const idx = ranking.findIndex(r => r.id === user.id);
  if (idx === -1) {
    userStatsRankEl.textContent = "–";
    userStatsRankDetailEl.textContent = "";
  } else {
    userStatsRankEl.textContent = `Plats ${idx + 1} av ${ranking.length}`;
    userStatsRankDetailEl.textContent = `Medel: ${avg.toFixed(3)}‰`;
  }
}

// ======= CSV =======
function buildCsv(filteredUserIds = null) {
  let csv = "timestamp;time;user;value_promille\n";
  measurements.forEach(m => {
    if (filteredUserIds && !filteredUserIds.includes(m.userId)) return;
    const u = getUserById(m.userId);
    const d = m.timestamp;
    csv += `${d.toISOString()};${formatTime(d)};${u ? u.name : "Okänd"};${m.value.toFixed(3)}\n`;
  });
  return csv;
}
function downloadCsv(filteredUserIds = null, namePrefix = "logg") {
  if (measurements.length === 0) { alert("Inga mätningar att spara."); return; }
  const csv = buildCsv(filteredUserIds);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const now = new Date();
  a.href = url;
  a.download = `${namePrefix}_${now.toISOString().replace(/[:T]/g, "-").slice(0, 19)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ======= Unified inbound events =======
function applyState(state) {
  // state: { users:[], measurements:[], activeUserId }
  users.length = 0;
  (state.users || []).forEach(u => users.push(u));

  measurements.length = 0;
  (state.measurements || []).forEach(m => {
    measurements.push({
      timestamp: new Date(m.timestamp),
      userId: m.userId,
      value: Number(m.value) || 0
    });
  });

  activeUserId = state.activeUserId || "";

  rebuildUserSelects();
  rebuildMeasurementTable();
  rebuildChartFromState();
  updateStats();

  if (measurements.length > 0) {
    const last = measurements[measurements.length - 1];
    const u = getUserById(last.userId);
    liveValueEl.textContent = last.value.toFixed(3) + "‰";
    liveMetaEl.textContent = `Senaste: ${formatTime(last.timestamp)} • ${u ? u.name : "Okänd"}`;
  } else {
    liveValueEl.textContent = "–";
    liveMetaEl.textContent = "Ingen mätning ännu";
  }
}

function addMeasurement({ userId, value, timestamp = new Date() }) {
  const ts = new Date(timestamp);
  measurements.push({ timestamp: ts, userId, value: Number(value) || 0 });

  appendMeasurementRow(measurements[measurements.length - 1]);

  const u = getUserById(userId);
  if (u) {
    const ds = ensureDataset(u);
    ds.data.push({ x: ts, y: Number(value) || 0 });
    measurementChart.update();
    updateLegend();
  } else {
    rebuildChartFromState();
  }

  updateStats();
  updateUserStats();

  if (measurements.length > 0) {
    const last = measurements[measurements.length - 1];
    const u2 = getUserById(last.userId);
    liveValueEl.textContent = last.value.toFixed(3) + "‰";
    liveMetaEl.textContent = `Senaste: ${formatTime(last.timestamp)} • ${u2 ? u2.name : "Okänd"}`;
  }
}

function clearAll() {
  users.length = 0;
  measurements.length = 0;
  activeUserId = "";
  selectedUserId = "";
  measurementChart.data.datasets = [];
  measurementChart.update();
  rebuildUserSelects();
  rebuildMeasurementTable();
  updateLegend();
  updateStats();
  updateUserStats();
  liveValueEl.textContent = "–";
  liveMetaEl.textContent = "Ingen mätning ännu";
}

// ======= Outbound commands -> transport (WS) or local (Sim/BLE) =======
function sendCommand(obj) {
  if (!transport || !transport.send) {
    alert("Ingen aktiv transport (WS/BLE/Sim).");
    return false;
  }
  return transport.send(obj);
}

// ======= Transport adapters =======
// WebSocket transport: endast om du kör från ESP (http://192.168.4.1) eller om du har wss på ESP
function createWebSocketTransport(host) {
  let ws = null;
  let connected = false;

  function protoForPage() {
    // Om sidan är https, ws:// kan blockas -> försök wss:// först.
    // Men din ESP har troligen inte TLS. Därför: om https, varna.
    return location.protocol === "https:" ? "wss" : "ws";
  }

  function connect() {
    return new Promise((resolve, reject) => {
      const proto = protoForPage();
      const url = `${proto}://${host}/ws`;

      if (location.protocol === "https:" && proto === "wss") {
        setStatus("WS: försöker wss:// (https-sida)");
      } else {
        setStatus(`WS: ansluter till ${url}`);
      }

      try {
        ws = new WebSocket(url);
      } catch (e) {
        setStatus("WS: kunde inte skapa WebSocket");
        reject(e);
        return;
      }

      ws.onopen = () => {
        connected = true;
        setStatus(`WS: ansluten (${host})`);
        resolve();
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);

          // Förväntar sig din ESP-struktur:
          // { type:"state", users:[...], measurements:[...], activeUserId:"..." }
          // { type:"battery", percent: 87 }
          if (data.type === "state") {
            // normalisera timestamps om ESP skickar nummer/iso:
            const state = {
              users: data.users || [],
              activeUserId: data.activeUserId || "",
              measurements: (data.measurements || []).map(m => ({
                userId: m.userId,
                value: Number(m.value) || 0,
                timestamp: m.timestamp ? m.timestamp : new Date().toISOString()
              }))
            };
            applyState(state);
          }
          if (data.type === "battery") {
            const pct = Math.round(data.percent);
            // lägg i statusLine subtilt
            setStatus(`WS: ansluten • Batteri ${pct}%`);
          }
        } catch (e) {
          console.warn("WS parse error:", e);
        }
      };

      ws.onclose = () => {
        connected = false;
        setStatus("WS: frånkopplad");
      };

      ws.onerror = () => {
        connected = false;
        setStatus("WS: fel (blockad eller ej nåbar?)");
      };
    });
  }

  function disconnect() {
    try { ws?.close(); } catch {}
    ws = null;
    connected = false;
  }

  function send(obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      alert("WS ej ansluten.");
      return false;
    }
    ws.send(JSON.stringify(obj));
    return true;
  }

  return {
    name: "WS",
    connect,
    disconnect,
    send,
    isConnected: () => connected
  };
}

// BLE transport: BLE skickar *mätningar* in, men “admin commands” är svårare.
// Vi gör BLE som “read/notify only” + lokala user-listor.
function createBleTransport(opts) {
  const ble = window.BLEBridge; // från ble.js
  let connected = false;

  function connect() {
    setStatus("BLE: ansluter...");
    return ble.connect(opts, onBleMeasurement, onBleStatus)
      .then(() => {
        connected = true;
        setStatus("BLE: ansluten");
      })
      .catch((e) => {
        connected = false;
        setStatus("BLE: kunde inte ansluta");
        throw e;
      });
  }

  function disconnect() {
    connected = false;
    ble.disconnect();
    setStatus("BLE: frånkopplad");
  }

  // BLE: vi stödjer bara lokalt “add_user” och “set_active_user” (utan att skicka till device)
  function send(obj) {
    // Om du vill skicka till ESP via BLE, behöver du en write-characteristic.
    // Här gör vi “lokal control” för demo.
    if (obj.type === "add_user") {
      users.push(obj.user);
      rebuildUserSelects();
      rebuildChartFromState();
      return true;
    }
    if (obj.type === "set_active_user") {
      activeUserId = obj.activeUserId || "";
      updateActiveUserUI();
      return true;
    }
    if (obj.type === "clear_all") {
      clearAll();
      return true;
    }
    alert("BLE-läge: kommandot stöds inte utan write-characteristic.");
    return false;
  }

  function onBleMeasurement(payload) {
    // payload: { userId?, value, timestamp? } eller { value }.
    // Vi mappar till activeUserId om userId saknas.
    if (!users.length) {
      // skapa default user om ingen finns
      const u = { id: "user-default", name: "Default", color: "#22c55e" };
      users.push(u);
      selectedUserId = u.id;
      activeUserId = u.id;
      rebuildUserSelects();
    }
    const uid = payload.userId || activeUserId || users[0].id;
    addMeasurement({ userId: uid, value: payload.value, timestamp: payload.timestamp || new Date() });
  }

  function onBleStatus(text) { setStatus(`BLE: ${text}`); }

  return {
    name: "BLE",
    connect,
    disconnect,
    send,
    isConnected: () => connected
  };
}

// Simulator transport
function createSimulatorTransport() {
  const sim = window.ESPSim; // från simulator.js
  let running = false;

  function connect() {
    if (!users.length) {
      users.push({ id:"user-1", name:"Edvin", color:"#22c55e" });
      users.push({ id:"user-2", name:"Gäst",  color:"#60a5fa" });
      activeUserId = users[0].id;
      selectedUserId = users[0].id;
      rebuildUserSelects();
      rebuildChartFromState();
    }

    sim.start({
      getActiveUserId: () => activeUserId || (users[0]?.id || ""),
      onMeasurement: (m) => addMeasurement(m)
    });
    running = true;
    setStatus("SIM: kör");
    startSimBtn.style.display = "none";
    stopSimBtn.style.display = "inline-flex";
    return Promise.resolve();
  }

  function disconnect() {
    sim.stop();
    running = false;
    setStatus("SIM: stoppad");
    startSimBtn.style.display = "inline-flex";
    stopSimBtn.style.display = "none";
  }

  function send(obj) {
    if (obj.type === "add_user") {
      users.push(obj.user);
      rebuildUserSelects();
      rebuildChartFromState();
      return true;
    }
    if (obj.type === "set_active_user") {
      activeUserId = obj.activeUserId || "";
      updateActiveUserUI();
      return true;
    }
    if (obj.type === "add_measurement") {
      addMeasurement({ userId: activeUserId || users[0].id, value: obj.value, timestamp: new Date() });
      return true;
    }
    if (obj.type === "clear_all") {
      clearAll();
      return true;
    }
    return false;
  }

  return {
    name: "SIM",
    connect,
    disconnect,
    send,
    isConnected: () => running
  };
}

// ======= UI events =======
userSelect.addEventListener("change", () => {
  selectedUserId = userSelect.value;
  updateUserStats();
});

addUserBtn.addEventListener("click", () => {
  const name = newUserNameInput.value.trim();
  const color = newUserColorInput.value;
  if (!name) { alert("Skriv ett namn."); return; }
  const newUser = { id: "user-" + Date.now() + "-" + Math.floor(Math.random() * 1000), name, color };
  sendCommand({ type: "add_user", user: newUser });
  newUserNameInput.value = "";
});

setActiveUserBtn.addEventListener("click", () => {
  const id = activeUserSelect.value;
  if (!id) { alert("Välj en aktiv användare."); return; }
  sendCommand({ type: "set_active_user", activeUserId: id });
});

testMeasureBtn.addEventListener("click", () => {
  if (!activeUserId) { alert("Ingen aktiv användare är vald."); return; }
  const val = Math.random() * 1.2;
  sendCommand({ type: "add_measurement", value: val });
});

toggleAdminBtn.addEventListener("click", () => adminPanelEl.classList.toggle("visible"));

adminConfirmBtn.addEventListener("click", () => {
  if (adminPasswordInput.value === ADMIN_PASSWORD) {
    adminActionsEl.style.display = "block";
    adminStatusEl.textContent = "Adminläge aktivt.";
  } else {
    adminActionsEl.style.display = "none";
    adminStatusEl.textContent = "Fel lösenord.";
  }
});

clearDataBtn.addEventListener("click", () => {
  if (!confirm("Rensa ALL logg?")) return;
  sendCommand({ type: "clear_all" });
});

downloadEspAllBtn.addEventListener("click", () => downloadCsv(null, "alkomatare_logg"));

downloadEspFilteredBtn.addEventListener("click", () => {
  const ids = Array.from(adminUserFiltersEl.querySelectorAll("input[type=checkbox]:checked")).map(cb => cb.value);
  if (ids.length === 0) { alert("Välj minst en användare."); return; }
  downloadCsv(ids, "alkomatare_logg_filtrerad");
});

// ======= Transport buttons =======
function stopCurrentTransport() {
  try { transport?.disconnect?.(); } catch {}
  transport = null;
}

connectWsBtn.addEventListener("click", async () => {
  stopCurrentTransport();
  const host = (espHostInput.value || "").trim();
  if (!host) { alert("Fyll i ESP host."); return; }

  transport = createWebSocketTransport(host);

  try {
    await transport.connect();
  } catch (e) {
    // Om WS blockas (https->wss kräver TLS), erbjud simulator direkt.
    alert("WebSocket kunde inte ansluta (vanligt på GitHub Pages/https). Starta simulator eller använd BLE (om stöds).");
    stopCurrentTransport();
  }
});

connectBleBtn.addEventListener("click", async () => {
  stopCurrentTransport();

  const opts = {
    serviceUuid: (bleServiceInput.value || "").trim(),
    characteristicUuid: (bleCharInput.value || "").trim(),
    namePrefix: (bleNamePrefixInput.value || "ALKO").trim()
  };

  transport = createBleTransport(opts);

  try {
    await transport.connect();
  } catch (e) {
    alert("BLE kunde inte ansluta. På iPhone Safari stöds ofta inte Web Bluetooth. Testa simulator.");
    stopCurrentTransport();
  }
});

startSimBtn.addEventListener("click", async () => {
  stopCurrentTransport();
  transport = createSimulatorTransport();
  await transport.connect();
});

stopSimBtn.addEventListener("click", () => {
  if (transport?.name === "SIM") transport.disconnect();
});

// ======= BLE support hint =======
(function updateBleHint(){
  const supported = !!navigator.bluetooth;
  bleSupportHint.textContent = supported
    ? "Web Bluetooth verkar stöds i denna webbläsare."
    : "Web Bluetooth stöds inte här (vanligt på iOS/Safari). Använd simulator eller ESP:s lokala sida.";
})();
