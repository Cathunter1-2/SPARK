#  — Open Soil Health Monitoring Network

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

## 🔧 Circuit Diagram (v2.0 — with LCD & LEDs)

```
                          Arduino R4 Minima
                         ┌───────────────────────┐
                         │                       │
  Soil Moisture Sensor   │  A0 ←──── AOUT        │  Capacitive Soil Moisture
  (Analog)               │  3.3V ──→ VCC         │  Sensor v1.2
                         │  GND ───→ GND         │
                         │                       │
  DHT11 Sensor           │  D2 ←──── DATA ─┐     │  DHT11 (3 or 4-pin)
  (Digital)              │  5V ────→ VCC    │10KΩ │  ⚠️ Pull-up resistor
                         │  GND ───→ GND    └─5V  │     between DATA & VCC
                         │                       │
  I2C LCD 16x2           │  A4 ←──── SDA         │  I2C Backpack Module
  (I2C Bus)              │  A5 ←──── SCL         │  (usually pre-soldered)
                         │  5V ────→ VCC         │
                         │  GND ───→ GND         │
                         │                       │
  RAG Status LEDs        │  D4 ──→ 220Ω ──→ 🟢   │  Green  (Good)
  (Digital)              │  D5 ──→ 220Ω ──→ 🟡   │  Yellow (Moderate)
                         │  D6 ──→ 220Ω ──→ 🔴   │  Red    (Poor/Critical)
                         │        All LED GND → GND
                         │                       │
                         │  USB ────→ 💻 Laptop  │
                         └───────────────────────┘
```

### LED Wiring Detail

```
  Arduino Pin (D4/D5/D6)
        │
        │         ┌─────┐
        ├────────→│220Ω │──→ LED Anode (+) ──→ LED Cathode (-) ──→ GND
                  └─────┘    (long leg)        (short leg / flat side)
```

### Components List

| Component | Qty | Pin(s) | Approx Cost (₹) |
|-----------|:---:|:---:|:---:|
| Capacitive Soil Moisture Sensor v1.2 | 1 | A0 | ₹40 |
| DHT11 Temperature & Humidity Sensor | 1 | D2 | ₹40 |
| I2C 16×2 LCD Display (with backpack) | 1 | A4, A5 | Have |
| 5mm LED — Green | 1 | D4 | Have |
| 5mm LED — Yellow | 1 | D5 | Have |
| 5mm LED — Red | 1 | D6 | Have |
| 10KΩ Resistor (pull-up for DHT11) | 1 | — | Have |
| 220Ω Resistors (for LEDs) | 3 | — | Have |
| Breadboard + Jumper Wires | — | — | Have |
| **Total Additional** | | | **~₹80** |

---

## 🚀 Setup Instructions

### Step 1: Arduino Libraries

Open Arduino IDE and install **two** libraries:

1. **DHT sensor library** by Adafruit
   - `Sketch` → `Include Library` → `Manage Libraries`
   - Search: "DHT sensor library" → Install
   - (Also installs Adafruit Unified Sensor dependency)

2. **LiquidCrystal I2C** by Frank de Brabander
   - `Sketch` → `Include Library` → `Manage Libraries`
   - Search: "LiquidCrystal I2C" → Install

### Step 2: Wire the Circuit

Follow the circuit diagram above. Key notes:

- **Soil Moisture Sensor** → Use **3.3V** (not 5V) for VCC if possible — gives more stable readings
- **DHT11** → Don't forget the **10KΩ pull-up resistor** between DATA and 5V
- **LCD** → The I2C backpack should already be soldered onto the LCD module. Only 4 wires needed
- **LEDs** → Each LED needs its own **220Ω resistor** in series. Long leg = anode (+) = connects to resistor

### Step 3: Upload Firmware

1. Open `arduino/soil_health_monitor/soil_health_monitor.ino`
2. Select Board: **Arduino UNO R4 Minima**
3. Select the correct COM port
4. Upload!

On boot, you should see:
- LCD shows **""** with a typing animation
- LEDs do a green → yellow → red → all-on sweep
- LCD shows a loading bar, then "Sensors ready..."

### Step 4: Calibrate the Moisture Sensor

After uploading, open **Serial Monitor** (115200 baud) and:

1. Hold the sensor **in dry air** → note the `moistureRaw` value → update `DRY_VALUE` in the code
2. Dip the sensor **in a glass of water** → note the `moistureRaw` value → update `WET_VALUE` in the code
3. Re-upload after calibration

### Step 5: LCD Address (if LCD is blank)

If the LCD backlight turns on but no text appears, the I2C address might be `0x3F` instead of `0x27`. Change this line in the code:

```cpp
LiquidCrystal_I2C lcd(0x27, 16, 2);  // Try 0x3F if this doesn't work
```

To find the correct address, upload this I2C scanner sketch:

```cpp
#include <Wire.h>
void setup() {
  Serial.begin(115200);
  Wire.begin();
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.print("Found device at 0x");
      Serial.println(addr, HEX);
    }
  }
}
void loop() {}
```

### Step 6: Run the Dashboard

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

### Step 7: Connect or Demo

- Click **"Connect Arduino"** to connect to the live Arduino sensor
- Click **"Demo Mode"** to see simulated sensor data (works without Arduino!)

---

## 🎨 Making the Prototype Look Clean

A tidy breadboard prototype signals "we know what we're doing." Here's how to make it look presentable:

### Wiring Best Practices

```
  ✅ DO                              ❌ DON'T
  ─────────────────────────          ──────────────────────────
  Use color-coded wires:             Use random wire colors
    Red    = 5V / 3.3V               Wires crossing over each other
    Black  = GND                     Long droopy wires
    Blue   = Analog signals           Bare wire ends showing
    Green  = Digital signals
    Yellow = I2C (SDA/SCL)
  
  Route wires flat along the board   Leave components at angles
  Cut jumper wires to exact length   Use male-to-male for everything
  Group related wires together       Spaghetti wiring
```

### Recommended Layout (Top View)

```
  ┌──────────────────────────────────────────────────────┐
  │  BREADBOARD                                          │
  │                                                      │
  │  ┌──────────────────┐    ┌──────────┐               │
  │  │  Arduino R4       │    │  LCD     │  ← Top right  │
  │  │  Minima           │    │  16x2   │    (visible)   │
  │  │                   │    └──────────┘               │
  │  └──────────────────┘                                │
  │                                                      │
  │  [🟢] [🟡] [🔴]  ← LEDs in a row (left side)       │
  │                                                      │
  │  ┌─────────────┐    ┌─────────────┐                 │
  │  │ Soil Moist. │    │   DHT11     │  ← Sensors      │
  │  │ Sensor      │    │             │    (bottom)      │
  │  └─────────────┘    └─────────────┘                 │
  │                                                      │
  │  ═══ Power Rail (Red = 5V, Blue = GND) ═══          │
  └──────────────────────────────────────────────────────┘
```

### Pro Tips for Demo Day

- **Use a half-size breadboard** if you have one — less empty space = looks more intentional
- **Mount the LCD at the edge** of the breadboard so it faces the judges
- **Place LEDs in a clean horizontal row** with equal spacing — this is the first thing people notice
- **Tape or rubber-band** the soil moisture sensor's cable so it doesn't droop
- **Label the LEDs** with a small strip of paper: "GOOD | ALERT | CRITICAL"
- **Keep the USB cable tidy** — route it behind the breadboard, not across it
- **Place the soil sensor in a small pot** of actual soil for the demo — much more impressive than dry air readings

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
- 🟢 **Good** (75-100): Optimal growing conditions — Green LED solid
- 🟡 **Moderate** (50-74): Needs monitoring — Yellow LED solid
- 🟠 **Poor** (25-49): Needs intervention — Red LED slow blink
- 🔴 **Critical** (0-24): Urgent action required — Red LED fast blink

**LCD Display** rotates through 3 screens every 3 seconds:
1. Health score + status (e.g., `♥ Health: 78 / Status: GOOD`)
2. Moisture + temperature with icons
3. Humidity + sample count

When health is critical, an alert screen overrides the rotation.

---

## 🔌 What Happens on Boot

When you power on the Arduino, the prototype runs a polished startup sequence:

1. **Typing animation** — "" appears letter by letter on the LCD
2. **LED sweep** — Green → Yellow → Red → All on → All off
3. **Loading bar** — 16-character progress bar fills across the LCD
4. **Ready message** — "v2.0 ♥ OpenSrc / Sensors ready..."
5. **Normal operation** — Sensor readings begin, LCD rotates, LEDs indicate status

This takes about 4 seconds and makes the prototype feel professional.

---

## 💡 Pitch Talking Points

### Problem
- India has 15 agro-climatic zones but farmers get soil tested maybe once in 5 years
- Government Soil Health Cards take months to process
- Farmers over-use urea and DAP — India uses 2x the global average per hectare
- No real-time, always-on monitoring exists

### Solution
- Ultra-cheap (₹80) sensor nodes deployed at farm level
- **On-device display** — LCD shows health score without any computer
- **Traffic-light LEDs** — Green/Yellow/Red visible from across a field
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
