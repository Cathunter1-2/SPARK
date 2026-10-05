#include <DHT.h>

#define SOIL_MOISTURE_PIN   A0
#define DHT_PIN             2
#define DHT_TYPE            DHT11

#define LED_GREEN           4
#define LED_YELLOW          5
#define LED_RED             6

#define DRY_VALUE           1017
#define WET_VALUE           200

#define MOISTURE_IDEAL_LOW  30.0
#define MOISTURE_IDEAL_HIGH 60.0
#define TEMP_IDEAL_LOW      20.0
#define TEMP_IDEAL_HIGH     35.0
#define HUMIDITY_IDEAL_LOW  40.0
#define HUMIDITY_IDEAL_HIGH 70.0

#define READ_INTERVAL_MS    2000

DHT dht(DHT_PIN, DHT_TYPE);

unsigned long lastReadTime  = 0;
unsigned long sampleCount   = 0;
unsigned long ledBlinkTimer = 0;
bool          ledBlinkState = false;
String        lastStatus    = "unknown";

void setup() {
  Serial.begin(115200);
  unsigned long serialWait = millis();
  while (!Serial && millis() - serialWait < 2000) { ; }

  dht.begin();

  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_RED, OUTPUT);

  bootAnimation();

  Serial.println("{\"event\":\"boot\",\"device\":\"-Node\",\"version\":\"2.0.0\"}");
  delay(2000);
}

void loop() {
  unsigned long now = millis();

  if (now - lastReadTime >= READ_INTERVAL_MS) {
    lastReadTime = now;
    sampleCount++;

    int rawMoisture = analogRead(SOIL_MOISTURE_PIN);
    float moisturePercent = mapFloat(rawMoisture, DRY_VALUE, WET_VALUE, 0.0, 100.0);
    moisturePercent = constrain(moisturePercent, 0.0, 100.0);

    float temperature = dht.readTemperature();
    float humidity    = dht.readHumidity();

    bool dhtError = isnan(temperature) || isnan(humidity);
    if (dhtError) {
      temperature = -1;
      humidity    = -1;
    }

    int healthScore = 0;
    String status   = "unknown";

    if (!dhtError) {
      healthScore = calculateHealthScore(moisturePercent, temperature, humidity);
      status = getStatus(healthScore);
    }

    lastStatus = status;
    updateLEDs(status);

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

  handleLEDBlink(millis());
}

void bootAnimation() {
  digitalWrite(LED_GREEN, HIGH);
  delay(200);
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_YELLOW, HIGH);
  delay(200);
  digitalWrite(LED_YELLOW, LOW);
  digitalWrite(LED_RED, HIGH);
  delay(200);
  digitalWrite(LED_GREEN, HIGH);
  digitalWrite(LED_YELLOW, HIGH);
  delay(400);
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_YELLOW, LOW);
  digitalWrite(LED_RED, LOW);
}

void updateLEDs(String status) {
  if (status == "good") {
    digitalWrite(LED_GREEN, HIGH);
    digitalWrite(LED_YELLOW, LOW);
    digitalWrite(LED_RED, LOW);
  }
  else if (status == "moderate") {
    digitalWrite(LED_GREEN, LOW);
    digitalWrite(LED_YELLOW, HIGH);
    digitalWrite(LED_RED, LOW);
  }
  else if (status == "poor" || status == "critical") {
    digitalWrite(LED_GREEN, LOW);
    digitalWrite(LED_YELLOW, LOW);
  }
  else {
    digitalWrite(LED_GREEN, LOW);
    digitalWrite(LED_YELLOW, LOW);
    digitalWrite(LED_RED, LOW);
  }
}

void handleLEDBlink(unsigned long now) {
  if (lastStatus == "poor") {
    if (now - ledBlinkTimer >= 500) {
      ledBlinkTimer = now;
      ledBlinkState = !ledBlinkState;
      digitalWrite(LED_RED, ledBlinkState ? HIGH : LOW);
    }
  }
  else if (lastStatus == "critical") {
    if (now - ledBlinkTimer >= 125) {
      ledBlinkTimer = now;
      ledBlinkState = !ledBlinkState;
      digitalWrite(LED_RED, ledBlinkState ? HIGH : LOW);
    }
  }
}

int calculateHealthScore(float moisture, float temp, float hum) {
  float moistureScore = rangeScore(moisture, MOISTURE_IDEAL_LOW, MOISTURE_IDEAL_HIGH);
  float tempScore     = rangeScore(temp, TEMP_IDEAL_LOW, TEMP_IDEAL_HIGH);
  float humScore      = rangeScore(hum, HUMIDITY_IDEAL_LOW, HUMIDITY_IDEAL_HIGH);

  float totalScore = (moistureScore * 0.50) + (tempScore * 0.25) + (humScore * 0.25);
  return (int)(totalScore * 100.0);
}

float rangeScore(float value, float low, float high) {
  if (value >= low && value <= high) return 1.0;

  float distance = 0;
  if (value < low) {
    distance = low - value;
  } else {
    distance = value - high;
  }

  float score = 1.0 - (distance / 30.0);
  return max(score, 0.0f);
}

String getStatus(int score) {
  if (score >= 75) return "good";
  if (score >= 50) return "moderate";
  if (score >= 25) return "poor";
  return "critical";
}

float mapFloat(float x, float inMin, float inMax, float outMin, float outMax) {
  return (x - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
}
