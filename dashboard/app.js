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
const farmNodes = [
  { id: 'N01', name: 'Nashik — Grape Farm', x: 25, y: 22, district: 'Nashik' },
  { id: 'N02', name: 'Pune — Sugarcane Field', x: 35, y: 52, district: 'Pune' },
  { id: 'N03', name: 'Nagpur — Orange Orchard', x: 78, y: 18, district: 'Nagpur' },
  { id: 'N04', name: 'Kolhapur — Rice Paddy', x: 22, y: 72, district: 'Kolhapur' },
  { id: 'N05', name: 'Aurangabad — Cotton Field', x: 52, y: 30, district: 'Aurangabad' },
  { id: 'N06', name: 'Solapur — Soybean Farm', x: 55, y: 58, district: 'Solapur' },
];

function initMap() {
  const mapContainer = document.getElementById('farmMap');
  mapContainer.innerHTML = '';

  // Create the SVG map
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 600 400');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';

  // Maharashtra outline (simplified polygon)
  const statePath = document.createElementNS(svgNS, 'path');
  statePath.setAttribute('d',
    'M 80,120 L 100,90 L 130,70 L 160,55 L 200,50 L 240,45 ' +
    'L 280,50 L 310,45 L 340,40 L 380,50 L 410,55 L 440,50 ' +
    'L 470,60 L 500,70 L 520,90 L 530,120 L 525,150 L 520,180 ' +
    'L 510,200 L 490,220 L 470,240 L 450,260 L 430,280 ' +
    'L 400,300 L 370,310 L 340,315 L 310,320 L 280,310 ' +
    'L 250,300 L 220,290 L 190,280 L 160,290 L 130,300 ' +
    'L 110,290 L 90,270 L 75,250 L 65,220 L 60,190 ' +
    'L 65,160 L 70,140 Z'
  );
  statePath.setAttribute('fill', 'rgba(34, 197, 94, 0.04)');
  statePath.setAttribute('stroke', 'rgba(34, 197, 94, 0.2)');
  statePath.setAttribute('stroke-width', '1.5');
  svg.appendChild(statePath);

  // Inner glow path
  const innerGlow = document.createElementNS(svgNS, 'path');
  innerGlow.setAttribute('d', statePath.getAttribute('d'));
  innerGlow.setAttribute('fill', 'none');
  innerGlow.setAttribute('stroke', 'rgba(34, 197, 94, 0.07)');
  innerGlow.setAttribute('stroke-width', '6');
  innerGlow.setAttribute('filter', 'blur(4px)');
  svg.insertBefore(innerGlow, statePath);

  // Grid lines
  for (let i = 1; i <= 5; i++) {
    const hLine = document.createElementNS(svgNS, 'line');
    hLine.setAttribute('x1', '0'); hLine.setAttribute('y1', i * 66);
    hLine.setAttribute('x2', '600'); hLine.setAttribute('y2', i * 66);
    hLine.setAttribute('stroke', 'rgba(255,255,255,0.03)');
    hLine.setAttribute('stroke-width', '0.5');
    svg.insertBefore(hLine, innerGlow);

    const vLine = document.createElementNS(svgNS, 'line');
    vLine.setAttribute('x1', i * 100); vLine.setAttribute('y1', '0');
    vLine.setAttribute('x2', i * 100); vLine.setAttribute('y2', '400');
    vLine.setAttribute('stroke', 'rgba(255,255,255,0.03)');
    vLine.setAttribute('stroke-width', '0.5');
    svg.insertBefore(vLine, innerGlow);
  }

  // Coordinate labels along edges
  const coords = [
    { text: '72°E', x: 80, y: 390 },
    { text: '74°E', x: 200, y: 390 },
    { text: '76°E', x: 340, y: 390 },
    { text: '78°E', x: 470, y: 390 },
    { text: '80°E', x: 540, y: 390 },
    { text: '21°N', x: 8, y: 130 },
    { text: '19°N', x: 8, y: 230 },
    { text: '17°N', x: 8, y: 330 },
  ];
  coords.forEach(c => {
    const t = document.createElementNS(svgNS, 'text');
    t.setAttribute('x', c.x);
    t.setAttribute('y', c.y);
    t.setAttribute('fill', 'rgba(255,255,255,0.08)');
    t.setAttribute('font-size', '9');
    t.setAttribute('font-family', 'JetBrains Mono, monospace');
    t.textContent = c.text;
    svg.appendChild(t);
  });

  // Region label
  const regionText = document.createElementNS(svgNS, 'text');
  regionText.setAttribute('x', '300');
  regionText.setAttribute('y', '195');
  regionText.setAttribute('fill', 'rgba(255,255,255,0.05)');
  regionText.setAttribute('font-size', '28');
  regionText.setAttribute('font-family', 'Inter, sans-serif');
  regionText.setAttribute('font-weight', '800');
  regionText.setAttribute('text-anchor', 'middle');
  regionText.setAttribute('letter-spacing', '8');
  regionText.textContent = 'MAHARASHTRA';
  svg.appendChild(regionText);

  // Node positions mapped to SVG viewBox (geographically approximate)
  const nodePositions = {
    'N01': { x: 190, y: 110 },   // Nashik
    'N02': { x: 195, y: 210 },   // Pune
    'N03': { x: 480, y: 100 },   // Nagpur
    'N04': { x: 155, y: 295 },   // Kolhapur
    'N05': { x: 290, y: 130 },   // Aurangabad
    'N06': { x: 310, y: 230 },   // Solapur
  };

  // Connection lines between nodes (network visualization)
  const connections = [
    ['N01', 'N02'], ['N01', 'N05'],
    ['N02', 'N06'], ['N02', 'N04'],
    ['N05', 'N03'], ['N05', 'N06'],
  ];
  connections.forEach(([from, to]) => {
    const p1 = nodePositions[from];
    const p2 = nodePositions[to];
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', p1.x); line.setAttribute('y1', p1.y);
    line.setAttribute('x2', p2.x); line.setAttribute('y2', p2.y);
    line.setAttribute('stroke', 'rgba(34, 197, 94, 0.1)');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', '4 4');
    svg.appendChild(line);
  });

  // Create sensor nodes
  farmNodes.forEach((node) => {
    const pos = nodePositions[node.id];
    if (!pos) return;

    // Outer pulse ring
    const pulseCircle = document.createElementNS(svgNS, 'circle');
    pulseCircle.setAttribute('cx', pos.x);
    pulseCircle.setAttribute('cy', pos.y);
    pulseCircle.setAttribute('r', '12');
    pulseCircle.setAttribute('fill', 'none');
    pulseCircle.setAttribute('stroke', '#4ade80');
    pulseCircle.setAttribute('stroke-width', '1');
    pulseCircle.setAttribute('opacity', '0.3');
    pulseCircle.id = `map-pulse-${node.id}`;

    // Animate the pulse
    const animR = document.createElementNS(svgNS, 'animate');
    animR.setAttribute('attributeName', 'r');
    animR.setAttribute('values', '8;20;8');
    animR.setAttribute('dur', `${3 + Math.random() * 2}s`);
    animR.setAttribute('repeatCount', 'indefinite');
    pulseCircle.appendChild(animR);

    const animOp = document.createElementNS(svgNS, 'animate');
    animOp.setAttribute('attributeName', 'opacity');
    animOp.setAttribute('values', '0.4;0;0.4');
    animOp.setAttribute('dur', `${3 + Math.random() * 2}s`);
    animOp.setAttribute('repeatCount', 'indefinite');
    pulseCircle.appendChild(animOp);

    svg.appendChild(pulseCircle);

    // Main node circle
    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);
    circle.setAttribute('r', '6');
    circle.setAttribute('fill', '#4ade80');
    circle.setAttribute('stroke', 'rgba(0,0,0,0.3)');
    circle.setAttribute('stroke-width', '2');
    circle.setAttribute('cursor', 'pointer');
    circle.id = `map-node-${node.id}`;
    svg.appendChild(circle);

    // District label
    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', pos.x);
    label.setAttribute('y', pos.y + 20);
    label.setAttribute('fill', 'rgba(255,255,255,0.5)');
    label.setAttribute('font-size', '10');
    label.setAttribute('font-family', 'Inter, sans-serif');
    label.setAttribute('font-weight', '600');
    label.setAttribute('text-anchor', 'middle');
    label.textContent = node.district;
    svg.appendChild(label);

    // Health value label (below district name)
    const healthLabel = document.createElementNS(svgNS, 'text');
    healthLabel.setAttribute('x', pos.x);
    healthLabel.setAttribute('y', pos.y + 32);
    healthLabel.setAttribute('fill', 'rgba(255,255,255,0.3)');
    healthLabel.setAttribute('font-size', '9');
    healthLabel.setAttribute('font-family', 'JetBrains Mono, monospace');
    healthLabel.setAttribute('text-anchor', 'middle');
    healthLabel.id = `map-label-health-${node.id}`;
    healthLabel.textContent = 'Score: --';
    svg.appendChild(healthLabel);

    // Hover tooltip using SVG title
    const title = document.createElementNS(svgNS, 'title');
    title.textContent = `${node.id} — ${node.name}`;
    circle.appendChild(title);
  });

  mapContainer.appendChild(svg);
}

function updateMapNodes(currentHealth) {
  farmNodes.forEach((node, index) => {
    const nodeEl = document.getElementById(`map-node-${node.id}`);
    const pulseEl = document.getElementById(`map-pulse-${node.id}`);
    const healthLabel = document.getElementById(`map-label-health-${node.id}`);
    if (!nodeEl) return;

    // First node uses real data, others simulate variation
    let health;
    if (index === 0) {
      health = currentHealth;
    } else {
      // Simulated variation around the real health value
      const offset = Math.sin(Date.now() / (3000 + index * 1000)) * 15 + (index * 5 - 15);
      health = Math.max(0, Math.min(100, currentHealth + offset));
    }

    // Color based on health
    let color;
    if (health >= 75) color = '#4ade80';
    else if (health >= 50) color = '#fbbf24';
    else if (health >= 25) color = '#fb923c';
    else color = '#f87171';

    nodeEl.setAttribute('fill', color);
    if (pulseEl) pulseEl.setAttribute('stroke', color);
    if (healthLabel) healthLabel.textContent = `Score: ${Math.round(health)}`;
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
