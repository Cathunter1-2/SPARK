# KrishiSense — Open Soil Health Monitoring Network

> Real-time soil health monitoring for Indian agriculture 🇮🇳
> Built for Open Innovation Ideathon 2026

---

## 📁 Project Structure

```
sparkathon/
├── arduino/
│   └── soil_health_monitor/
│       └── soil_health_monitor.ino    ← Upload this to Arduino R4 Minima
├── dashboard/
│   ├── index.html                     ← Main dashboard page
│   ├── style.css                      ← Design system & styles
│   └── app.js                         ← Application logic
└── README.md                          ← You are here
```

---

## 🔧 Circuit Diagram

```
                    Arduino R4 Minima
                   ┌─────────────────┐
                   │                 │
  Soil Moisture    │  A0 ←─── AOUT  │──── Capacitive Soil Moisture Sensor v1.2
  Sensor           │  5V ───→ VCC   │     (3-pin: VCC, GND, AOUT)
                   │  GND ──→ GND   │
                   │                 │
  DHT11 Sensor     │  D2 ←─── DATA  │──── DHT11 (3 or 4-pin)
                   │  5V ───→ VCC   │     ⚠️ Add 10KΩ pull-up resistor
                   │  GND ──→ GND   │        between DATA and VCC
                   │                 │
                   │  USB ──→ 💻    │──── Laptop (Serial + Dashboard)
                   └─────────────────┘

  Pull-up Resistor Detail:
  ┌─────┐
  │ 10K │
  └──┬──┘
     │
  5V ┤
     │
  D2 ┼──── DHT11 DATA pin
```

### Components Needed

| Component | Qty | Approx Cost (₹) | Where to Buy |
|-----------|:---:|:---:|---|
| Capacitive Soil Moisture Sensor v1.2 | 1 | ₹40 | Robu.in / Amazon.in |
| DHT11 Temperature & Humidity Sensor | 1 | ₹40 | Robu.in / Amazon.in |
| 10KΩ Resistor (pull-up for DHT11) | 1 | Have | Already available |
| Breadboard + Jumper Wires | — | Have | Already available |
| **Total Additional** | | **~₹80** | |

---

## 🚀 Setup Instructions

### Step 1: Arduino Setup

1. Open Arduino IDE
2. Install the **DHT sensor library** by Adafruit:
   - Go to `Sketch` → `Include Library` → `Manage Libraries`
   - Search for **"DHT sensor library"** by Adafruit
   - Click Install (it will also install the Adafruit Unified Sensor dependency)
3. Open `arduino/soil_health_monitor/soil_health_monitor.ino`
4. Select Board: **Arduino UNO R4 Minima**
5. Select the correct COM port
6. Upload!

### Step 2: Calibrate the Moisture Sensor

After uploading, open **Serial Monitor** (115200 baud) and:

1. Hold the sensor **in dry air** → note the `moistureRaw` value → update `DRY_VALUE` in the code
2. Dip the sensor **in a glass of water** → note the `moistureRaw` value → update `WET_VALUE` in the code
3. Re-upload after calibration

### Step 3: Run the Dashboard

The dashboard uses the **Web Serial API** (requires Chrome or Edge) and must be served from localhost:

```bash
# Option A: Using npx (recommended)
cd dashboard
npx -y serve .

# Option B: Using Python
cd dashboard
python -m http.server 8080
```

Then open **http://localhost:3000** (or :8080 for Python) in Chrome.

### Step 4: Connect or Demo

- Click **"Connect Arduino"** to connect to the live Arduino sensor
- Click **"Demo Mode"** to see simulated sensor data (works without Arduino!)

---

## 🎮 Demo Mode

If you don't have the sensors connected (or for presentation purposes), **Demo Mode** generates realistic simulated data including:

- Gradual moisture decrease (simulating evaporation)
- Random "watering events" (sharp moisture spikes)
- Temperature/humidity sine-wave patterns (simulating day/night cycles)
- Real-time health score calculation
- Alert triggers when values go out of range

**This is perfect for presenting at the ideathon!**

---

## 🧠 How Health Score Works

The health score (0-100) is a weighted composite:

| Parameter | Weight | Ideal Range |
|-----------|:---:|---|
| Soil Moisture | 50% | 30-60% |
| Temperature | 25% | 20-35°C |
| Humidity | 25% | 40-70% |

Each parameter gets a sub-score:
- **Inside ideal range** → 1.0 (full score)
- **Outside but within 30 units** → Linear decrease from 1.0 to 0.0
- **More than 30 units away** → 0.0

**Status Labels:**
- 🟢 **Good** (75-100): Optimal growing conditions
- 🟡 **Moderate** (50-74): Needs monitoring
- 🟠 **Poor** (25-49): Needs intervention
- 🔴 **Critical** (0-24): Urgent action required

---

## 💡 Pitch Talking Points

### Problem
- India has 15 agro-climatic zones but farmers get soil tested maybe once in 5 years
- Government Soil Health Cards take months to process
- Farmers over-use urea and DAP — India uses 2x the global average per hectare
- No real-time, always-on monitoring exists

### Solution
- Ultra-cheap (₹80) sensor nodes deployed at farm level
- Open-source hardware design — anyone can build and deploy
- Open-access data API — researchers, agri-companies, and government can build on top
- Real-time dashboard with actionable health scores and alerts

### Market
- India's precision agriculture market: projected $3.5B+ by 2028
- 14 crore+ farming households
- Pradhan Mantri Fasal Bima Yojana (crop insurance) needs real data

### Revenue Model
- **B2B:** Sell precision agriculture insights to fertilizer/seed companies
- **B2G:** Partner with state agriculture departments for deployment
- **API:** Freemium data API for researchers and agri-startups
- **Insurance:** Real-time data for crop insurance underwriting

---

## 📝 License

Open source — built for India's agricultural future.
