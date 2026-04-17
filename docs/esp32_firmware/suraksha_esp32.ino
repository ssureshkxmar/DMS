/*
 * ╔══════════════════════════════════════════════════════╗
 * ║          SURAKSHA — ESP32 Alert Receiver             ║
 * ║       Driver Safety Monitoring Hardware Node         ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * WHAT THIS DOES:
 *   - Connects to your WiFi network
 *   - Runs a local HTTP server on port 80
 *   - Receives real-time alerts from the Suraksha mobile app
 *   - Shows alerts on SSD1306 OLED display (128x64)
 *   - Triggers buzzer with patterns based on alert severity
 *   - Auto-returns to idle screen after 5 seconds
 *   - WiFi auto-reconnect if connection is lost
 *
 * HARDWARE WIRING:
 *   SSD1306 OLED (I2C):
 *     VCC  → 3.3V
 *     GND  → GND
 *     SDA  → GPIO 21
 *     SCL  → GPIO 22
 *
 *   Buzzer (Active or Passive):
 *     +    → GPIO 25  (via 100Ω resistor)
 *     -    → GND
 *
 * LIBRARIES (Install via Arduino Library Manager):
 *   - Adafruit SSD1306  (by Adafruit)
 *   - Adafruit GFX Library  (by Adafruit)
 *   - ArduinoJson  (by Benoit Blanchon) — version 6.x
 *
 * BOARD:
 *   - Select: ESP32 Dev Module (or your specific board)
 *   - Install ESP32 boards: https://dl.espressif.com/dl/package_esp32_index.json
 *
 * API ENDPOINT (called by Suraksha mobile app):
 *   POST http://<ESP32_IP>/alert
 *   Content-Type: application/json
 *   Body: {
 *     "message": "Your eyes are closing. Stay alert!",
 *     "type": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO",
 *     "buzzer": true | false
 *   }
 *
 * BUZZER PATTERNS:
 *   CRITICAL → 4 rapid beeps @ 2500Hz (danger!)
 *   HIGH     → 3 beeps @ 2000Hz
 *   MEDIUM   → 2 beeps @ 1500Hz
 *   LOW      → 1 long beep @ 1000Hz
 *   INFO     → 1 short soft beep @ 800Hz
 */

// ─────────────────────────────────────────────────────────────────────────────
//  CONFIGURATION — Edit these values before flashing
// ─────────────────────────────────────────────────────────────────────────────

#define WIFI_SSID     "YOUR_WIFI_SSID"       // <-- Replace with your WiFi name
#define WIFI_PASS     "YOUR_WIFI_PASSWORD"   // <-- Replace with your WiFi password
#define SERVER_PORT   80                     // HTTP port (must match app settings)

// ─────────────────────────────────────────────────────────────────────────────
//  HARDWARE PIN CONFIG
// ─────────────────────────────────────────────────────────────────────────────

#define BUZZER_PIN    25     // GPIO pin for buzzer
#define OLED_SDA      21     // I2C SDA
#define OLED_SCL      22     // I2C SCL
#define OLED_ADDRESS  0x3C   // I2C address (try 0x3D if OLED not detected)
#define OLED_WIDTH    128
#define OLED_HEIGHT   64
#define OLED_RESET    -1     // No reset pin (share with Arduino reset)

// ─────────────────────────────────────────────────────────────────────────────
//  INCLUDES
// ─────────────────────────────────────────────────────────────────────────────

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ─────────────────────────────────────────────────────────────────────────────
//  GLOBALS
// ─────────────────────────────────────────────────────────────────────────────

Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, OLED_RESET);
WebServer server(SERVER_PORT);

// State
bool  monitoringActive  = false;
unsigned long alertClearAt = 0;   // millis() when to return to idle screen
bool  showingAlert      = false;

// ─────────────────────────────────────────────────────────────────────────────
//  OLED DISPLAY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Word-wrap a string into lines of maxLen characters
void wordWrap(const String& text, String* lines, int maxLines, int maxLen, int& lineCount) {
  lineCount = 0;
  int start = 0;
  int len   = text.length();

  while (start < len && lineCount < maxLines) {
    int end = start + maxLen;
    if (end >= len) {
      lines[lineCount++] = text.substring(start);
      break;
    }
    // Try to break at a space
    int spacePos = -1;
    for (int i = end; i >= start; i--) {
      if (text[i] == ' ') { spacePos = i; break; }
    }
    if (spacePos == -1) spacePos = end; // No space — hard break
    lines[lineCount++] = text.substring(start, spacePos);
    start = spacePos + 1;
  }
}

// Show the idle/ready screen
void showIdleScreen() {
  display.clearDisplay();

  // Title bar
  display.fillRect(0, 0, 128, 14, SSD1306_WHITE);
  display.setTextColor(SSD1306_BLACK);
  display.setTextSize(1);
  display.setCursor(20, 3);
  display.print("SURAKSHA READY");

  // Status
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 18);
  display.print("WiFi: ");
  display.println(WiFi.SSID());

  display.setCursor(0, 30);
  display.print("IP: ");
  display.println(WiFi.localIP().toString());

  display.setCursor(0, 42);
  display.print("Port: ");
  display.print(SERVER_PORT);

  // Bottom status
  display.setCursor(0, 55);
  if (monitoringActive) {
    display.print("* Monitoring Active *");
  } else {
    display.print("Waiting for app...");
  }

  display.display();
}

// Show an alert on the OLED with type banner + message
void showAlertScreen(const String& type, const String& message) {
  display.clearDisplay();

  // ── Top banner with alert type ──────────────────────────────
  display.fillRect(0, 0, 128, 14, SSD1306_WHITE);
  display.setTextColor(SSD1306_BLACK);
  display.setTextSize(1);

  String banner = "";
  if      (type == "CRITICAL") banner = "!! CRITICAL ALERT !!";
  else if (type == "HIGH")     banner = "!  HIGH ALERT     !";
  else if (type == "MEDIUM")   banner = "   MEDIUM ALERT    ";
  else if (type == "LOW")      banner = "   LOW ALERT       ";
  else                          banner = "   INFO            ";

  display.setCursor(0, 3);
  display.print(banner);

  // ── Alert icon ───────────────────────────────────────────────
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  if (type == "CRITICAL" || type == "HIGH") {
    display.setCursor(0, 17);
    display.print("!");
  } else {
    display.setCursor(0, 17);
    display.print("i");
  }

  // ── Word-wrapped message ─────────────────────────────────────
  display.setTextSize(1);
  String lines[3];
  int lineCount = 0;
  wordWrap(message, lines, 3, 18, lineCount);  // 18 chars per line (leaving space for icon)

  int yPositions[] = {17, 30, 42};
  for (int i = 0; i < lineCount; i++) {
    display.setCursor(18, yPositions[i]);
    display.print(lines[i]);
  }

  // ── Bottom countdown hint ────────────────────────────────────
  display.setCursor(0, 56);
  display.print("Clears in 5s...");

  display.display();
}

// Show the "Connecting to WiFi" boot screen
void showConnectingScreen(int dots) {
  display.clearDisplay();

  display.fillRect(0, 0, 128, 14, SSD1306_WHITE);
  display.setTextColor(SSD1306_BLACK);
  display.setTextSize(1);
  display.setCursor(28, 3);
  display.print("SURAKSHA v1.0");

  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 22);
  display.print("Connecting to WiFi");
  String dotStr = "";
  for (int i = 0; i < dots % 4; i++) dotStr += ".";
  display.println(dotStr);

  display.setCursor(0, 35);
  display.print(WIFI_SSID);

  display.setCursor(0, 50);
  display.print("Please wait...");

  display.display();
}

// ─────────────────────────────────────────────────────────────────────────────
//  BUZZER PATTERNS
// ─────────────────────────────────────────────────────────────────────────────

void beep(int freq, int durationMs) {
  tone(BUZZER_PIN, freq, durationMs);
  delay(durationMs + 50);  // Small gap between beeps
  noTone(BUZZER_PIN);
}

void triggerBuzzer(const String& type) {
  if (type == "CRITICAL") {
    // 4 rapid high-pitch beeps — DANGER!
    for (int i = 0; i < 4; i++) beep(2500, 150);
  } else if (type == "HIGH") {
    // 3 medium-high beeps
    for (int i = 0; i < 3; i++) beep(2000, 200);
  } else if (type == "MEDIUM") {
    // 2 medium beeps
    for (int i = 0; i < 2; i++) beep(1500, 250);
  } else if (type == "LOW") {
    // 1 long low beep
    beep(1000, 600);
  } else {
    // INFO — 1 short soft beep
    beep(800, 100);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  HTTP ROUTE HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

// CORS headers — allow the mobile app to call from any origin
void addCORSHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

// OPTIONS preflight (required by some HTTP clients)
void handleOptions() {
  addCORSHeaders();
  server.send(204);
}

// POST /alert — receives alert from Suraksha mobile app
void handleAlert() {
  addCORSHeaders();

  if (server.method() == HTTP_OPTIONS) {
    server.send(204);
    return;
  }

  if (server.method() != HTTP_POST) {
    server.send(405, "application/json", "{\"error\":\"Method Not Allowed\"}");
    return;
  }

  // Parse JSON body
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, server.arg("plain"));

  if (err) {
    Serial.printf("[ESP32] JSON parse error: %s\n", err.c_str());
    server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
    return;
  }

  // Extract fields
  const char* message = doc["message"] | "Alert received";
  const char* type    = doc["type"]    | "INFO";
  bool        buzzer  = doc["buzzer"]  | false;

  Serial.printf("[SURAKSHA ALERT] type=%s buzzer=%d msg=%s\n", type, buzzer, message);

  // Show on OLED
  showAlertScreen(String(type), String(message));
  showingAlert = true;
  alertClearAt = millis() + 5000;  // Auto-clear after 5 seconds

  // Trigger buzzer if requested (non-blocking via separate task would be ideal,
  // but for simplicity we trigger synchronously — takes max ~1 second)
  if (buzzer) {
    triggerBuzzer(String(type));
  }

  // Send success response
  server.send(200, "application/json", "{\"ok\":true,\"device\":\"suraksha-esp32\"}");
}

// GET /health — used by app and deploy scripts to check if ESP32 is online
void handleHealth() {
  addCORSHeaders();
  String ip = WiFi.localIP().toString();
  String resp = "{\"status\":\"ok\",\"device\":\"suraksha-esp32\","
                "\"ip\":\"" + ip + "\","
                "\"monitoring\":" + (monitoringActive ? "true" : "false") + "}";
  server.send(200, "application/json", resp);
}

// POST /session — receives session start/stop notifications from the app
void handleSession() {
  addCORSHeaders();

  if (server.method() != HTTP_POST) {
    server.send(405, "application/json", "{\"error\":\"Method Not Allowed\"}");
    return;
  }

  StaticJsonDocument<128> doc;
  deserializeJson(doc, server.arg("plain"));

  const char* action = doc["action"] | "start";

  if (String(action) == "start") {
    monitoringActive = true;
    Serial.println("[SURAKSHA] Session STARTED");
    showAlertScreen("INFO", "Suraksha Active. Drive safely!");
    showingAlert = true;
    alertClearAt = millis() + 3000;
    beep(1000, 200);  // Single confirmation beep
  } else {
    monitoringActive = false;
    Serial.println("[SURAKSHA] Session STOPPED");
    showIdleScreen();
    showingAlert = false;
  }

  server.send(200, "application/json", "{\"ok\":true}");
}

// ─────────────────────────────────────────────────────────────────────────────
//  WIFI RECONNECT
// ─────────────────────────────────────────────────────────────────────────────

void checkWiFiReconnect() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Disconnected. Reconnecting...");
    WiFi.reconnect();
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
      delay(500);
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("[WiFi] Reconnected: " + WiFi.localIP().toString());
      if (!showingAlert) showIdleScreen();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SETUP
// ─────────────────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  Serial.println("\n\n=== SURAKSHA ESP32 STARTING ===");

  // ── Buzzer init ─────────────────────────────────────────────
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // ── OLED init ───────────────────────────────────────────────
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println("OLED init FAILED — check wiring!");
    // Don't halt — continue without OLED
  } else {
    Serial.println("OLED initialized.");
  }

  display.clearDisplay();
  display.display();
  showConnectingScreen(0);

  // ── WiFi connect ────────────────────────────────────────────
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int dots = 0;
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    showConnectingScreen(++dots);
  }

  Serial.println();
  Serial.println("WiFi connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  // Startup beep — 2 short beeps = ready
  beep(1000, 100);
  delay(100);
  beep(1200, 100);

  // Show ready screen
  showIdleScreen();

  // ── HTTP server routes ──────────────────────────────────────
  server.on("/alert",   HTTP_POST,    handleAlert);
  server.on("/alert",   HTTP_OPTIONS, handleOptions);
  server.on("/health",  HTTP_GET,     handleHealth);
  server.on("/session", HTTP_POST,    handleSession);
  server.on("/session", HTTP_OPTIONS, handleOptions);

  // Catch-all
  server.onNotFound([]() {
    addCORSHeaders();
    server.send(404, "application/json", "{\"error\":\"Not found\"}");
  });

  server.begin();
  Serial.printf("HTTP Server started on port %d\n", SERVER_PORT);
  Serial.println("=== SURAKSHA ESP32 READY ===\n");
}

// ─────────────────────────────────────────────────────────────────────────────
//  LOOP
// ─────────────────────────────────────────────────────────────────────────────

void loop() {
  // Handle HTTP requests
  server.handleClient();

  // Auto-clear alert screen after 5 seconds
  if (showingAlert && millis() > alertClearAt) {
    showingAlert = false;
    showIdleScreen();
  }

  // WiFi reconnect check every 30 seconds
  static unsigned long lastWiFiCheck = 0;
  if (millis() - lastWiFiCheck > 30000) {
    lastWiFiCheck = millis();
    checkWiFiReconnect();
  }

  delay(10);  // Small yield to prevent watchdog reset
}
