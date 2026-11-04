const $ = (id) => document.getElementById(id);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

const chartData = { labels: [], front: [], rear: [], temperature: [], humidity: [], speed: [] };

function makeChart(canvasId, label, color, key) {
  return new Chart($(canvasId), {
    type: "line",
    data: { labels: chartData.labels, datasets: [{
      label, data: chartData[key], borderColor: color, backgroundColor: color + "20",
      fill: true, tension: 0.35, pointRadius: 1, borderWidth: 2
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#94aac2", maxTicksLimit: 5 }, grid: { color: "#263c5733" } },
        y: { ticks: { color: "#94aac2" }, grid: { color: "#263c5733" } }
      }
    }
  });
}

const charts = [
  makeChart("frontChart", "Front distance", "#ffc05b", "front"),
  makeChart("rearChart", "Rear distance", "#58aaff", "rear"),
  makeChart("temperatureChart", "Temperature", "#ff637a", "temperature"),
  makeChart("humidityChart", "Humidity", "#38d9c5", "humidity"),
  makeChart("speedChart", "Speed", "#39d59b", "speed")
];

function valueWithUnit(value, unit) {
  return value === null || value === undefined || value === "" ? "—" + unit : value + unit;
}
function irLabel(value) {
  if (value === null || value === undefined) return "—";
  return [true, 1, "1", "true"].includes(typeof value === "string" ? value.toLowerCase() : value)
    ? "OBSTACLE" : "CLEAR";
}

function renderEvents(events) {
  $("eventList").innerHTML = events?.length
    ? events.slice(0, 40).map((event) =>
      `<div class="event ${escapeHTML(event.level)}"><i></i><time>${escapeHTML(event.time)}</time><span>${escapeHTML(event.message)}</span></div>`
    ).join("")
    : "<p class='hint'>No events yet.</p>";
}

function renderCharts(history) {
  Object.values(chartData).forEach((values) => { values.length = 0; });
  (history || []).slice(-25).forEach((item) => {
    chartData.labels.push(item.time || "");
    chartData.front.push(Number(item.front_distance) || 0);
    chartData.rear.push(Number(item.rear_distance) || 0);
    chartData.temperature.push(Number(item.temperature) || 0);
    chartData.humidity.push(Number(item.humidity) || 0);
    chartData.speed.push(Number(item.speed) || 0);
  });
  charts.forEach((chart) => chart.update("none"));
}

async function refreshStatus() {
  try {
    const response = await fetch("/api/status");
    const data = await response.json();
    $("clock").textContent = new Date().toLocaleTimeString();
    $("connectionDot").className = data.connected ? "online" : "";
    $("connectionText").textContent = data.connected ? "ESP32 Connected" : "ESP32 Offline / Demo";
    $("esp32Integration").textContent = data.connected ? "CONNECTED" : "OFFLINE";
    $("esp32Integration").className = data.connected ? "good" : "warning-text";
    $("frontDistance").textContent = valueWithUnit(data.front_distance, " cm");
    $("rearDistance").textContent = valueWithUnit(data.rear_distance, " cm");
    $("temperature").textContent = valueWithUnit(data.temperature, " °C");
    $("humidity").textContent = valueWithUnit(data.humidity, " %");
    $("frontIR").textContent = irLabel(data.front_ir);
    $("rearIR").textContent = irLabel(data.rear_ir);
    $("motorStatus").textContent = data.motor_status || "STOP";
    $("robotMode").textContent = data.robot_mode || "IDLE";
    $("batteryVoltage").textContent = valueWithUnit(data.battery_voltage, " V");
    $("wifiSignal").textContent = valueWithUnit(data.wifi_dbm, " dBm");
    $("productCount").textContent = data.product_count ?? 0;
    renderCharts(data.history);
    renderEvents(data.events);
  } catch (error) {
    $("connectionText").textContent = "Flask API unavailable";
  }
}

async function loadProducts(query = "") {
  try {
    const response = await fetch("/api/products?q=" + encodeURIComponent(query));
    const products = await response.json();
    $("productList").innerHTML = products.length
      ? products.map((product) => `<div class="product"><div><b>${escapeHTML(product.name || product.product_name || product.sku || "Product")}</b><br><span>${escapeHTML(product.sku || product.barcode || "")}</span></div><span>${escapeHTML(product.quantity || product.stock || "")}</span></div>`).join("")
      : "<p class='hint'>No products found. Add products to data/products.csv.</p>";
  } catch (error) {
    $("productList").textContent = "Could not load product catalog.";
  }
}

async function lookupBarcode(code) {
  if (!code) return;
  $("barcodeResult").textContent = "Looking up…";
  const response = await fetch("/api/scan", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });
  const data = await response.json();
  $("barcodeResult").innerHTML = data.product
    ? "<b>Product found</b><br>" + Object.entries(data.product).map(([key, value]) =>
      `<span>${escapeHTML(key)}:</span> ${escapeHTML(value)}`).join("<br>")
    : "Code recorded, but no catalog match. Check data/products.csv.";
  loadProducts($("productSearch").value);
}

$("lookupBarcode").addEventListener("click", () => lookupBarcode($("barcodeInput").value.trim()));
$("barcodeInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") lookupBarcode(event.target.value.trim());
});
$("productSearch").addEventListener("input", (event) => loadProducts(event.target.value));

$("logDetection").addEventListener("click", async () => {
  const label = $("objectLabel").value.trim();
  if (!label) { $("webcamMessage").textContent = "Enter an object label to log a detection."; return; }
  const rawConfidence = $("objectConfidence").value;
  await fetch("/api/detection", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, confidence: rawConfidence === "" ? null : Number(rawConfidence) })
  });
  $("objectLabel").value = "";
  await refreshStatus();
});

let activeControl = null;

async function sendRobotCommand(command) {
  try {
    const response = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command })
    });

    if (!response.ok) {
      throw new Error("Command failed");
    }

    $("lastCommand").textContent = command;
    await refreshStatus();
  } catch (error) {
    $("lastCommand").textContent = "Connection Error";
  }
}

document.querySelectorAll("[data-command]").forEach((button) => {
  const command = button.dataset.command;

  if (["FORWARD", "BACKWARD", "LEFT", "RIGHT"].includes(command)) {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      activeControl = button;
      sendRobotCommand(command);
    });
  } else {
    button.addEventListener("click", () => {
      sendRobotCommand(command);
    });
  }
});

function releaseRobotControl() {
  if (activeControl) {
    activeControl = null;
    sendRobotCommand("STOP");
  }
}

window.addEventListener("pointerup", releaseRobotControl);
window.addEventListener("pointercancel", releaseRobotControl);
window.addEventListener("blur", releaseRobotControl);

$("clearEvents").addEventListener("click", async () => {
  await fetch("/api/events/clear", { method: "POST" });
  
  await refreshStatus();
});

// Browser webcam preview. YOLO inference is a separate integration step.
let webcamStream = null;
$("startWebcam").addEventListener("click", async () => {
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    $("webcam").srcObject = webcamStream;
    $("webcamMessage").textContent = "Webcam running. Automatic YOLO detection still needs backend integration.";
  } catch (error) {
    $("webcamMessage").textContent = "Could not open camera. Allow camera access and use localhost or HTTPS.";
  }
});
$("stopWebcam").addEventListener("click", () => {
  if (webcamStream) webcamStream.getTracks().forEach((track) => track.stop());
  webcamStream = null;
  $("webcam").srcObject = null;
  $("webcamMessage").textContent = "Webcam stopped.";
});

// BarcodeDetector exists only in some browsers. USB barcode scanners work as keyboard input.
$("scanWithCamera").addEventListener("click", async () => {
  if (!("BarcodeDetector" in window)) {
    $("barcodeIntegration").textContent = "NOT SUPPORTED";
    $("barcodeResult").textContent = "This browser does not support camera barcode detection. Use a USB/Bluetooth scanner or type the code.";
    return;
  }
  if (!webcamStream) {
    $("barcodeResult").textContent = "Start the webcam first.";
    return;
  }
  try {
    const detector = new BarcodeDetector({
      formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"]
    });
    $("barcodeIntegration").textContent = "SUPPORTED";
    const detectLoop = async () => {
      if (!webcamStream) return;
      try {
        const codes = await detector.detect($("webcam"));
        if (codes.length) {
          $("barcodeInput").value = codes[0].rawValue;
          await lookupBarcode(codes[0].rawValue);
          return;
        }
      } catch (error) { /* keep scanning */ }
      window.setTimeout(detectLoop, 350);
    };
    detectLoop();
  } catch (error) {
    $("barcodeResult").textContent = "Could not initialize camera barcode scanning.";
  }
});

$("barcodeIntegration").textContent = "BarcodeDetector" in window ? "SUPPORTED" : "BROWSER DEPENDENT";
loadProducts();
refreshStatus();
window.setInterval(refreshStatus, 2000);
