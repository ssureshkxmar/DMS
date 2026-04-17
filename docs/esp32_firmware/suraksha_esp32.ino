/*
 * Suraksha ESP32 Firmware
 * ========================
 * Receives alert data from the Suraksha mobile app via WiFi HTTP.
 * Displays messages on SSD1306 OLED and triggers a buzzer.
 *
 * Hardware:
 *   - ESP32 (any variant)
 *   - SSD1306 OLED 128x64 (I2C — SDA=21, SCL=22)
 *   - Active/passive buzzer on GPIO 25
 *
 * Libraries required (install via Arduino Library Manager):
 *   - Adafruit SSD1306
 *   - Adafruit GFX Library
 *   - ArduinoJson
 *   - WiFi (built-in ESP32)
 *   - WebServer (built-in ESP32)
 *
 * Endpoint:
 *   POST /alert
 *   JSON body: { "message": "...", "type": "CRITICAL|HIGH|MEDIUM|LOW|INFO", "buzzer": true|false }
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ── WiFi credentials ──────────────────────────────────────────────────────────
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// ── Hardware pins ─────────────────────────────────────────────────────────────
#define BUZZER_PIN  25
#define OLED_WIDTH  128
#define OLED_HEIGHT 64
#define OLED_RESET  -1   // Share Arduino reset

// ── Objects ───────────────────────────────────────────────────────────────────
Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, OLED_RESET);
WebServer server(80);

// ── OLED helpers ──────────────────────────────────────────────────────────────
void showOLED(const String& line1, const String& line2 = "", const String& line3 = "") {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println(line1);
  if (line2.length()) { display.setCursor(0, 20); display.println(line2); }
  if (line3.length()) { display.setCursor(0, 40); display.println(line3); }
  display.display();
}

// ── Buzzer ────────────────────────────────────────────────────────────────────
void triggerBuzzer(const String& type) {
  if (type == "CRITICAL") {
    // Three short high-pitch beeps
    for (int i = 0; i < 3; i++) {
      tone(BUZZER_PIN, 2000, 200);
      delay(300);
    }
  } else if (type == "HIGH") {
    // Two medium beeps
    for (int i = 0; i < 2; i++) {
      tone(BUZZER_PIN, 1500, 300);
      delay(400);
    }
  } else {
    // Single low beep
    tone(BUZZER_PIN, 1000, 500);
  }
}

// ── /alert endpoint ───────────────────────────────────────────────────────────
void handleAlert() {
  if (server.method() != HTTP_POST) {
    server.send(405, "text/plain", "Method Not Allowed");
    return;
  }

  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, server.arg("plain"));
  if (err) {
    server.send(400, "text/plain", "Bad JSON");
    return;
  }

  const char* message = doc["message"] | "Alert";
  const char* type    = doc["type"]    | "INFO";
  bool        buzzer  = doc["buzzer"]  | false;

  Serial.printf("[SURAKSHA] %s: %s\n", type, message);

  // Split message into two lines if longer than 21 chars (OLED width ~21 chars)
  String msgStr = String(message);
  String line1  = "⚠ " + String(type);
  String line2  = msgStr.substring(0, 21);
  String line3  = msgStr.length() > 21 ? msgStr.substring(21, 42) : "";

  showOLED(line1, line2, line3);

  if (buzzer) {
    triggerBuzzer(String(type));
  }

  server.send(200, "application/json", "{\"ok\":true}");

  // Auto-clear OLED after 5 seconds
  delay(5000);
  showOLED("Suraksha", "Monitoring...", WiFi.localIP().toString());
}

// ── /health endpoint (optional) ───────────────────────────────────────────────
void handleHealth() {
  server.send(200, "application/json", "{\"status\":\"ok\",\"device\":\"suraksha-esp32\"}");
}

// ── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);

  // OLED init
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("SSD1306 init failed!");
    for (;;);
  }

  showOLED("Suraksha", "Connecting...");

  // WiFi connect
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected. IP: " + WiFi.localIP().toString());
  showOLED("Suraksha Ready", WiFi.localIP().toString(), "Port: 80");

  // HTTP routes
  server.on("/alert",  HTTP_POST, handleAlert);
  server.on("/health", HTTP_GET,  handleHealth);
  server.begin();
  Serial.println("HTTP server started");
}

// ── Loop ──────────────────────────────────────────────────────────────────────
void loop() {
  server.handleClient();
}
