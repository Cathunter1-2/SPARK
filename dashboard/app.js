/* ============================================================
 *   — Dashboard Application Logic
 *  Open Soil Health Network
 * ============================================================ */

// ─── State ──────────────────────────────────────────────────
let serialPort = null;
let serialReader = null;
let isDemo = false;
let demoInterval = null;
let startTime = Date.now();
let totalReadings = 0;

// Data buffers (store last N readings)
const MAX_DATA_POINTS = 900; // 15 min at 1/sec
let chartRangeSeconds = 60;
const dataBuffer = {
  timestamps: [],
  moisture: [],
  temperature: [],
  humidity: [],
  health: [],
};

// Previous values for trend calculation
let prevValues = { moisture: null, temperature: null, humidity: null };

// ─── Chart Setup ────────────────────────────────────────────
const chartColors = {
  moisture: { line: '#60a5fa', fill: 'rgba(96, 165, 250, 0.08)' },
  temperature: { line: '#fbbf24', fill: 'rgba(251, 191, 36, 0.08)' },
  humidity: { line: '#22d3ee', fill: 'rgba(34, 211, 238, 0.08)' },
  health: { line: '#4ade80', fill: 'rgba(74, 222, 128, 0.1)' },
};

// Live chart
const liveCtx = document.getElementById('liveChart').getContext('2d');
const liveChart = new Chart(liveCtx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'Moisture %',
        data: [],
        borderColor: chartColors.moisture.line,
        backgroundColor: chartColors.moisture.fill,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3,
        fill: true,
      },
      {
        label: 'Temperature °C',
        data: [],
        borderColor: chartColors.temperature.line,
        backgroundColor: chartColors.temperature.fill,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3,
        fill: true,
      },
      {
        label: 'Humidity %',
        data: [],
        borderColor: chartColors.humidity.line,
        backgroundColor: chartColors.humidity.fill,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3,
        fill: true,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          color: '#94a3b8',
          font: { family: 'Inter', size: 11, weight: '500' },
          padding: 16,
          usePointStyle: true,
          pointStyleWidth: 8,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        titleFont: { family: 'Inter', size: 12, weight: '600' },
        bodyFont: { family: 'JetBrains Mono', size: 11 },
        padding: 12,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        display: true,
        grid: { color: 'rgba(255, 255, 255, 0.03)' },
        ticks: { color: '#64748b', font: { family: 'Inter', size: 10 }, maxTicksLimit: 8 },
      },
      y: {
        display: true,
        grid: { color: 'rgba(255, 255, 255, 0.03)' },
        ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } },
        min: 0,
        max: 100,
      },
    },
    animation: { duration: 300 },
  },
});

// Health history chart
const healthCtx = document.getElementById('healthChart').getContext('2d');
const healthChart = new Chart(healthCtx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'Health Score',
        data: [],
        borderColor: chartColors.health.line,
        backgroundColor: chartColors.health.fill,
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: 0.4,
        fill: true,
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        bodyFont: { family: 'JetBrains Mono', size: 11 },
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        display: false,
      },
      y: {
        display: true,
        grid: { color: 'rgba(255, 255, 255, 0.03)' },
        ticks: { color: '#64748b', font: { family: 'JetBrains Mono', size: 10 } },
        min: 0,
        max: 100,
      },
    },
    animation: { duration: 300 },
  },
});

// ─── Farm Map ───────────────────────────────────────────────
let map;
let liveMarker;

function initMap() {
  const mapContainer = document.getElementById('farmMap');
  mapContainer.innerHTML = ''; // Clear SVG map

  // Initialize Leaflet map (default center on India if GPS fails)
  map = L.map('farmMap', { zoomControl: false }).setView([20.5937, 78.9629], 5);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // CartoDB Dark Matter base map
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // Get live GPS location
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        map.setView([lat, lng], 14);
        
        liveMarker = L.circleMarker([lat, lng], {
          radius: 12,
          fillColor: "#4ade80",
          color: "#4ade80",
          weight: 2,
          opacity: 0.5,
          fillOpacity: 0.8
        }).addTo(map);
        
        liveMarker.bindPopup("<b style='color:black;'>Live Sensor Node</b><br><span style='color:#333;'>Your GPS Location</span>").openPopup();
      },
      (error) => {
        console.warn("Geolocation denied or failed", error);
      }
    );
  }
}

function updateMapNodes(currentHealth) {
  if (!liveMarker) return;
  
  let color = '#4ade80';
  if (currentHealth < 25) color = '#f87171';
  else if (currentHealth < 50) color = '#fb923c';
  else if (currentHealth < 75) color = '#fbbf24';

  liveMarker.setStyle({
    fillColor: color,
    color: color
  });
}

// ─── Serial Connection ─────────────────────────────────────
async function connectArduino() {
  if (serialPort) {
    // Disconnect
    try {
      if (serialReader) {
        await serialReader.cancel();
        serialReader = null;
      }
      await serialPort.close();
    } catch (e) { /* ignore */ }
    serialPort = null;
    updateConnectionStatus('disconnected');
    document.getElementById('btnConnect').innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
      Connect Arduino`;
    return;
  }

  try {
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: 115200 });
    updateConnectionStatus('connected');

    // Stop demo if running
    if (isDemo) toggleDemo();

    document.getElementById('btnConnect').innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      Disconnect`;

    addAlert('success', '🔌 Arduino connected successfully!');

    // Read serial data
    const decoder = new TextDecoderStream();
    serialPort.readable.pipeTo(decoder.writable);
    serialReader = decoder.readable.getReader();

    let lineBuffer = '';
    while (true) {
      const { value, done } = await serialReader.read();
      if (done) break;
      lineBuffer += value;

      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('{')) {
          try {
            const data = JSON.parse(trimmed);
            if (data.moisture !== undefined) {
              processData(data);
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }
    }
  } catch (error) {
    console.error('Serial connection failed:', error);
    addAlert('critical', '❌ Failed to connect. Make sure Arduino is plugged in and no other app is using the port.');
    serialPort = null;
    updateConnectionStatus('disconnected');
  }
}

// ─── Demo Mode ──────────────────────────────────────────────
function toggleDemo() {
  if (isDemo) {
    clearInterval(demoInterval);
    demoInterval = null;
    isDemo = false;
    document.getElementById('btnDemo').classList.remove('active');
    document.getElementById('btnDemo').innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      Demo Mode`;
    updateConnectionStatus(serialPort ? 'connected' : 'disconnected');
    return;
  }

  // Start demo
  isDemo = true;
  startTime = Date.now();
  document.getElementById('btnDemo').classList.add('active');
  document.getElementById('btnDemo').innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
    Stop Demo`;
  updateConnectionStatus('demo');
  addAlert('info', '🎮 Demo mode started. Simulating sensor data from a soybean field in Solapur district.');

  // Generate realistic sensor data
  let baseMoisture = 45 + Math.random() * 10;
  let baseTemp = 28 + Math.random() * 4;
  let baseHumidity = 55 + Math.random() * 10;
  let demoTime = 0;

  demoInterval = setInterval(() => {
    demoTime += 2;

    // Simulate realistic fluctuations
    // Occasional "watering event" — sharp moisture spike
    const wateringEvent = Math.random() < 0.02;
    if (wateringEvent) {
      baseMoisture = Math.min(85, baseMoisture + 20 + Math.random() * 10);
      addAlert('info', '💧 Watering event detected! Moisture rising sharply.');
    }

    // Gradual moisture decrease (evaporation)
    baseMoisture = Math.max(10, baseMoisture - 0.1 + Math.random() * 0.15);

    // Temperature: slight sine wave (day cycle compressed)
    baseTemp = 28 + 4 * Math.sin(demoTime / 60) + (Math.random() - 0.5) * 0.5;

    // Humidity: inversely correlated with temperature
    baseHumidity = 65 - 3 * Math.sin(demoTime / 60) + (Math.random() - 0.5) * 2;

    const moisture = Math.max(0, Math.min(100, baseMoisture + (Math.random() - 0.5) * 2));
    const temperature = Math.max(5, Math.min(50, baseTemp));
    const humidity = Math.max(10, Math.min(95, baseHumidity));

    // Calculate health
    const health = calculateHealth(moisture, temperature, humidity);
    const status = getStatus(health);

    processData({
      moisture: parseFloat(moisture.toFixed(1)),
      temperature: parseFloat(temperature.toFixed(1)),
      humidity: parseFloat(humidity.toFixed(1)),
      health: health,
      status: status,
    });
  }, 2000);
}

// ─── Health Calculation (mirrors Arduino) ───────────────────
function calculateHealth(moisture, temp, hum) {
  const moistureScore = rangeScore(moisture, 30, 60);
  const tempScore = rangeScore(temp, 20, 35);
  const humScore = rangeScore(hum, 40, 70);
  return Math.round((moistureScore * 0.5 + tempScore * 0.25 + humScore * 0.25) * 100);
}

function rangeScore(value, low, high) {
  if (value >= low && value <= high) return 1.0;
  const distance = value < low ? low - value : value - high;
  return Math.max(0, 1.0 - distance / 30.0);
}

function getStatus(score) {
  if (score >= 75) return 'good';
  if (score >= 50) return 'moderate';
  if (score >= 25) return 'poor';
  return 'critical';
}

// ─── Process Incoming Data ──────────────────────────────────
function processData(data) {
  totalReadings++;
  const now = new Date();
  const timeLabel = now.toLocaleTimeString('en-IN', { hour12: false });

  // Push to buffer
  dataBuffer.timestamps.push(timeLabel);
  dataBuffer.moisture.push(data.moisture);
  dataBuffer.temperature.push(data.temperature);
  dataBuffer.humidity.push(data.humidity);
  dataBuffer.health.push(data.health);

  // Trim buffer
  if (dataBuffer.timestamps.length > MAX_DATA_POINTS) {
    dataBuffer.timestamps.shift();
    dataBuffer.moisture.shift();
    dataBuffer.temperature.shift();
    dataBuffer.humidity.shift();
    dataBuffer.health.shift();
  }

  // Update UI
  updateSensorCards(data);
  updateHealthScore(data.health, data.status);
  updateCharts();
  updateStats();
  updateMapNodes(data.health);
  updateUptime();
  checkAlerts(data);

  // Update API readings counter
  document.getElementById('apiReadings').textContent = totalReadings.toLocaleString();

  // Store prev values for trend
  prevValues = {
    moisture: data.moisture,
    temperature: data.temperature,
    humidity: data.humidity,
  };
}

// ─── UI Updates ─────────────────────────────────────────────
function updateSensorCards(data) {
  // Moisture
  const moistureEl = document.getElementById('moistureValue');
  const moistureFill = document.getElementById('moistureFill');
  moistureEl.textContent = data.moisture.toFixed(1);
  moistureFill.style.width = `${data.moisture}%`;
  updateTrend('moistureTrend', data.moisture, prevValues.moisture, '%');

  // Temperature (map 0-50°C to 0-100% for gauge)
  const tempEl = document.getElementById('tempValue');
  const tempFill = document.getElementById('tempFill');
  tempEl.textContent = data.temperature.toFixed(1);
  tempFill.style.width = `${(data.temperature / 50) * 100}%`;
  updateTrend('tempTrend', data.temperature, prevValues.temperature, '°C');

  // Humidity
  const humEl = document.getElementById('humidityValue');
  const humFill = document.getElementById('humidityFill');
  humEl.textContent = data.humidity.toFixed(1);
  humFill.style.width = `${data.humidity}%`;
  updateTrend('humidityTrend', data.humidity, prevValues.humidity, '%');
}

function updateTrend(elementId, current, previous, unit) {
  const el = document.getElementById(elementId);
  if (previous === null) {
    el.innerHTML = '<span class="trend-label">First reading</span>';
    return;
  }

  const diff = current - previous;
  const absDiff = Math.abs(diff).toFixed(1);

  if (Math.abs(diff) < 0.2) {
    el.innerHTML = `<span class="trend-stable">→ Stable</span>`;
  } else if (diff > 0) {
    el.innerHTML = `<span class="trend-up">↑ +${absDiff}${unit}</span>`;
  } else {
    el.innerHTML = `<span class="trend-down">↓ -${absDiff}${unit}</span>`;
  }
}

function updateHealthScore(health, status) {
  const scoreNumber = document.getElementById('healthValue');
  const scoreLabel = document.getElementById('healthStatus');
  const scoreRing = document.getElementById('scoreRing');
  const recommendation = document.getElementById('healthRecommendation');

  scoreNumber.textContent = health;
  scoreLabel.textContent = status.toUpperCase();

  // Ring animation (circumference = 2 * π * 50 ≈ 314.16)
  const circumference = 314.16;
  const offset = circumference - (health / 100) * circumference;
  scoreRing.style.strokeDashoffset = offset;

  // Color based on status
  let color;
  if (status === 'good') {
    color = '#4ade80';
    recommendation.textContent = '✅ Soil conditions are excellent. Ideal for current crop growth. Continue current irrigation schedule.';
  } else if (status === 'moderate') {
    color = '#fbbf24';
    recommendation.textContent = '⚠️ Soil conditions are fair. Consider adjusting irrigation or checking nutrient levels.';
  } else if (status === 'poor') {
    color = '#fb923c';
    recommendation.textContent = '🔶 Soil needs attention. Check moisture levels and consider adding organic matter.';
  } else {
    color = '#f87171';
    recommendation.textContent = '🚨 Critical soil conditions! Immediate irrigation and soil amendment recommended.';
  }

  scoreRing.style.stroke = color;
  scoreNumber.style.color = color;
}

function updateCharts() {
  // Determine how many points to show based on range
  const pointsToShow = Math.min(dataBuffer.timestamps.length, Math.floor(chartRangeSeconds / 2));
  const startIdx = Math.max(0, dataBuffer.timestamps.length - pointsToShow);

  // Live chart
  liveChart.data.labels = dataBuffer.timestamps.slice(startIdx);
  liveChart.data.datasets[0].data = dataBuffer.moisture.slice(startIdx);
  liveChart.data.datasets[1].data = dataBuffer.temperature.slice(startIdx);
  liveChart.data.datasets[2].data = dataBuffer.humidity.slice(startIdx);
  liveChart.update('none');

  // Health chart
  healthChart.data.labels = dataBuffer.timestamps.slice(startIdx);
  healthChart.data.datasets[0].data = dataBuffer.health.slice(startIdx);
  healthChart.update('none');
}

function updateStats() {
  const healthData = dataBuffer.health;
  if (healthData.length === 0) return;

  const avg = healthData.reduce((a, b) => a + b, 0) / healthData.length;
  const min = Math.min(...healthData);
  const max = Math.max(...healthData);

  document.getElementById('statAvg').textContent = Math.round(avg);
  document.getElementById('statMin').textContent = min;
  document.getElementById('statMax').textContent = max;
  document.getElementById('statSamples').textContent = healthData.length;
}

function updateUptime() {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const seconds = (elapsed % 60).toString().padStart(2, '0');
  document.getElementById('apiUptime').textContent = `${minutes}:${seconds}`;
}

function updateConnectionStatus(status) {
  const statusEl = document.getElementById('connectionStatus');
  const dot = statusEl.querySelector('.status-dot');
  const text = statusEl.querySelector('.status-text');

  dot.className = 'status-dot ' + status;

  if (status === 'connected') {
    text.textContent = 'Arduino Connected';
  } else if (status === 'demo') {
    text.textContent = 'Demo Mode';
  } else {
    text.textContent = 'Disconnected';
  }
}

// ─── Chart Range ────────────────────────────────────────────
function setChartRange(seconds, btnEl) {
  chartRangeSeconds = seconds;
  document.querySelectorAll('.chart-controls .chip').forEach((c) => c.classList.remove('chip-active'));
  btnEl.classList.add('chip-active');
  updateCharts();
}

// ─── Alerts ─────────────────────────────────────────────────
let lastAlertTime = {};

function checkAlerts(data) {
  const now = Date.now();

  // Moisture alerts (throttle: 30 seconds between same alert type)
  if (data.moisture < 20 && (!lastAlertTime.lowMoisture || now - lastAlertTime.lowMoisture > 30000)) {
    addAlert('critical', `🚨 Soil moisture critically low (${data.moisture.toFixed(1)}%). Immediate irrigation needed!`);
    lastAlertTime.lowMoisture = now;
  } else if (data.moisture < 30 && (!lastAlertTime.warnMoisture || now - lastAlertTime.warnMoisture > 30000)) {
    addAlert('warning', `⚠️ Soil moisture below ideal range (${data.moisture.toFixed(1)}%). Consider irrigation.`);
    lastAlertTime.warnMoisture = now;
  } else if (data.moisture > 80 && (!lastAlertTime.highMoisture || now - lastAlertTime.highMoisture > 30000)) {
    addAlert('warning', `⚠️ Soil moisture very high (${data.moisture.toFixed(1)}%). Risk of waterlogging.`);
    lastAlertTime.highMoisture = now;
  }

  // Temperature alerts
  if (data.temperature > 40 && (!lastAlertTime.highTemp || now - lastAlertTime.highTemp > 30000)) {
    addAlert('critical', `🌡️ Temperature critically high (${data.temperature.toFixed(1)}°C). Crop heat stress likely!`);
    lastAlertTime.highTemp = now;
  } else if (data.temperature < 15 && (!lastAlertTime.lowTemp || now - lastAlertTime.lowTemp > 30000)) {
    addAlert('warning', `❄️ Temperature below optimal (${data.temperature.toFixed(1)}°C). Cold stress possible.`);
    lastAlertTime.lowTemp = now;
  }

  // Health alerts
  if (data.health < 25 && (!lastAlertTime.criticalHealth || now - lastAlertTime.criticalHealth > 30000)) {
    addAlert('critical', `💀 Soil health CRITICAL (${data.health}/100). Urgent intervention required!`);
    lastAlertTime.criticalHealth = now;
  }
}

function addAlert(type, message) {
  const feed = document.getElementById('alertFeed');

  // Remove empty state
  const empty = feed.querySelector('.alert-empty');
  if (empty) empty.remove();

  const time = new Date().toLocaleTimeString('en-IN', { hour12: true });

  const icons = {
    warning: '⚠️',
    critical: '🚨',
    info: 'ℹ️',
    success: '✅',
  };

  const alertEl = document.createElement('div');
  alertEl.className = `alert-item ${type}`;
  alertEl.innerHTML = `
    <span class="alert-icon">${icons[type] || 'ℹ️'}</span>
    <div class="alert-content">
      <div class="alert-message">${message}</div>
      <div class="alert-time">${time}</div>
    </div>
  `;

  // Insert at top
  feed.insertBefore(alertEl, feed.firstChild);

  // Limit to 50 alerts
  while (feed.children.length > 50) {
    feed.removeChild(feed.lastChild);
  }
}

function clearAlerts() {
  const feed = document.getElementById('alertFeed');
  feed.innerHTML = `
    <div class="alert-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      <p>Alerts cleared. Monitoring continues...</p>
    </div>
  `;
  lastAlertTime = {};
}

// ─── Initialize ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMap();

  // Check if Web Serial API is available
  if (!('serial' in navigator)) {
    document.getElementById('btnConnect').disabled = true;
    document.getElementById('btnConnect').title = 'Web Serial API not supported. Use Chrome/Edge.';
    document.getElementById('btnConnect').style.opacity = '0.5';
    addAlert('warning', '⚠️ Web Serial API not supported in this browser. Use Chrome or Edge. Demo mode still works!');
  }
});
