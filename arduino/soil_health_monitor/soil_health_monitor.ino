/*
 * ============================================================
 *  KrishiSense — Open Soil Health Monitor
 *  Arduino R4 Minima Firmware
 * ============================================================
 *
 *  CIRCUIT CONNECTIONS:
 *  
 *  Capacitive Soil Moisture Sensor v1.2:
 *    VCC  → 3.3V (or 5V)
 *    GND  → GND
 *    AOUT → A0
 *
 *  DHT11 Temperature & Humidity Sensor:
 *    VCC  → 5V
 *    GND  → GND
 *    DATA → D2  (with 10K pull-up resistor to VCC)
 *
 *  LIBRARY REQUIRED:
 *    Install "DHT sensor library" by Adafruit via Arduino IDE
 *    Library Manager (Sketch → Include Library → Manage Libraries)
 *
 *  OUTPUT:
 *    Sends JSON over Serial (115200 baud) every 2 seconds:
 *    {"moisture":52.3,"temperature":28.5,"humidity":65.0,"health":78,"status":"good","ts":12345}
 *
 * ============================================================
 */

#include <DHT.h>

// ── Pin Definitions ──────────────────────────────────────────
#define SOIL_MOISTURE_PIN   A0    // Analog pin for soil moisture sensor
#define DHT_PIN             2     // Digital pin for DHT11 data
#define DHT_TYPE            DHT11 // Sensor type

// ── Calibration Values ───────────────────────────────────────
// Adjust these based on YOUR sensor readings:
//   - DRY_VALUE:  sensor reading when probe is in dry air
//   - WET_VALUE:  sensor reading when probe is submerged in water
#define DRY_VALUE           620   // Raw analog reading in dry air
#define WET_VALUE           270   // Raw analog reading in water

// ── Ideal Ranges for Health Scoring ──────────────────────────
#define MOISTURE_IDEAL_LOW  30.0
#define MOISTURE_IDEAL_HIGH 60.0

#define TEMP_IDEAL_LOW      20.0
#define TEMP_IDEAL_HIGH     35.0

#define HUMIDITY_IDEAL_LOW  40.0
#define HUMIDITY_IDEAL_HIGH 70.0

// ── Timing ───────────────────────────────────────────────────
#define READ_INTERVAL_MS    2000  // Read sensors every 2 seconds

// ── Objects ──────────────────────────────────────────────────
DHT dht(DHT_PIN, DHT_TYPE);

// ── Variables ────────────────────────────────────────────────
unsigned long lastReadTime = 0;
unsigned long sampleCount  = 0;

void setup() {
  Serial.begin(115200);
  while (!Serial) {
    ; // Wait for serial connection (needed for R4 Minima)
  }

  dht.begin();

  // Startup message
  Serial.println("{\"event\":\"boot\",\"device\":\"KrishiSense-Node\",\"version\":\"1.0.0\"}");

  delay(2000); // Let DHT11 stabilize
}

void loop() {
  unsigned long now = millis();

  if (now - lastReadTime >= READ_INTERVAL_MS) {
    lastReadTime = now;
    sampleCount++;

    // ── Read Soil Moisture ─────────────────────────────────
    int rawMoisture = analogRead(SOIL_MOISTURE_PIN);
    
    // Map raw value to percentage (inverted: lower raw = wetter)
    float moisturePercent = mapFloat(rawMoisture, DRY_VALUE, WET_VALUE, 0.0, 100.0);
    moisturePercent = constrain(moisturePercent, 0.0, 100.0);

    // ── Read DHT11 ────────────────────────────────────────
    float temperature = dht.readTemperature();     // Celsius
    float humidity    = dht.readHumidity();         // Percentage

    // Check for DHT read errors
    bool dhtError = isnan(temperature) || isnan(humidity);
    if (dhtError) {
      temperature = -1;
      humidity    = -1;
    }

    // ── Calculate Health Score (0-100) ─────────────────────
    int healthScore = 0;
    String status   = "unknown";

    if (!dhtError) {
      healthScore = calculateHealthScore(moisturePercent, temperature, humidity);
      status = getStatus(healthScore);
    }

    // ── Build and Send JSON ───────────────────────────────
    Serial.print("{");
    Serial.print("\"moisture\":");     Serial.print(moisturePercent, 1);
    Serial.print(",\"moistureRaw\":"); Serial.print(rawMoisture);
    Serial.print(",\"temperature\":"); Serial.print(dhtError ? -1 : temperature, 1);
    Serial.print(",\"humidity\":");    Serial.print(dhtError ? -1 : humidity, 1);
    Serial.print(",\"health\":");      Serial.print(healthScore);
    Serial.print(",\"status\":\"");    Serial.print(status);
    Serial.print("\",\"dhtError\":");  Serial.print(dhtError ? "true" : "false");
    Serial.print(",\"sample\":");      Serial.print(sampleCount);
    Serial.print(",\"ts\":");          Serial.print(now);
    Serial.println("}");
  }
}

/*
 * Calculate a health score (0-100) based on how close
 * each reading is to its ideal range.
 * 
 * Weights: Moisture 50%, Temperature 25%, Humidity 25%
 */
int calculateHealthScore(float moisture, float temp, float hum) {
  float moistureScore = rangeScore(moisture, MOISTURE_IDEAL_LOW, MOISTURE_IDEAL_HIGH);
  float tempScore     = rangeScore(temp, TEMP_IDEAL_LOW, TEMP_IDEAL_HIGH);
  float humScore      = rangeScore(hum, HUMIDITY_IDEAL_LOW, HUMIDITY_IDEAL_HIGH);

  // Weighted average
  float totalScore = (moistureScore * 0.50) + (tempScore * 0.25) + (humScore * 0.25);

  return (int)(totalScore * 100.0);
}

/*
 * Returns a score from 0.0 to 1.0 based on how close
 * a value is to the ideal range [low, high].
 * 
 * - Inside the range        → 1.0
 * - Outside but close       → 0.5 - 0.99
 * - Far outside (>30 units) → 0.0
 */
float rangeScore(float value, float low, float high) {
  if (value >= low && value <= high) {
    return 1.0;
  }

  float distance = 0;
  if (value < low) {
    distance = low - value;
  } else {
    distance = value - high;
  }

  // Linearly decrease score over a 30-unit distance
  float score = 1.0 - (distance / 30.0);
  return max(score, 0.0f);
}

/*
 * Convert health score to human-readable status
 */
String getStatus(int score) {
  if (score >= 75) return "good";
  if (score >= 50) return "moderate";
  if (score >= 25) return "poor";
  return "critical";
}

/*
 * Float version of Arduino's map() function
 */
float mapFloat(float x, float inMin, float inMax, float outMin, float outMax) {
  return (x - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
}
