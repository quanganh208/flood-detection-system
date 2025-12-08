/*
 * ===== ESP32 FLOOD DETECTION SYSTEM =====
 * Hệ thống cảnh báo lũ lụt với WiFi + MQTT + OTA Update
 *
 * TÍNH NĂNG:
 * - Đọc cảm biến mưa (analog + digital)
 * - Đọc cảm biến mực nước (analog)
 * - Gửi data qua MQTT (lightweight, realtime)
 * - OTA Update qua HTTP
 * - NON-BLOCKING: Luôn hoạt động dù có/không WiFi
 *
 * MQTT TOPICS:
 * - flood/{deviceId}/sensor  - Publish sensor data
 * - flood/{deviceId}/status  - Publish online/offline status
 * - flood/{deviceId}/config  - Subscribe to config updates
 * - flood/{deviceId}/ota     - Subscribe to OTA notifications
 * - flood/broadcast/ota      - Subscribe to broadcast OTA
 *
 * DEVICE IDENTITY:
 * - Device ID: MAC Address (hardware-level, unique, OTA-safe)
 * - Display Name: User configurable (stored in NVS, survives OTA)
 *
 * CHÂN CẢM BIẾN:
 * - GPIO 34: Cảm biến mưa AO (analog)
 * - GPIO 25: Cảm biến mưa DO (digital)
 * - GPIO 35: Cảm biến mực nước (analog)
 * - GPIO 2:  LED status
 *
 * THƯ VIỆN CẦN THIẾT:
 * - WiFiManager by tzapu (v2.0.17+)
 * - ArduinoJson (v7.0.0+)
 * - PubSubClient (v2.8+)
 */

#include <WiFi.h>
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <Update.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <PubSubClient.h>

// ===== PIN DEFINITIONS =====
const int LED_PIN = 2;
const int RESET_BUTTON = 0;
const int RAIN_AO_PIN = 34;
const int RAIN_DO_PIN = 25;
const int WATER_AO_PIN = 35;

// ===== THRESHOLDS =====
// Ngưỡng dựa trên giá trị thực tế của cảm biến (max ~2000)
const int WATER_WARNING_LEVEL = 800;   // 40% - bắt đầu cảnh báo
const int WATER_DANGER_LEVEL = 1200;   // 60% - nguy hiểm
const int RAIN_DRY_THRESHOLD = 3000;
const int RAIN_WARNING_THRESHOLD = 2000;

// ===== TIMING =====
const int CONFIG_PORTAL_TIMEOUT = 180;
const unsigned long WIFI_RECONNECT_INTERVAL = 30000;
const unsigned long MQTT_RECONNECT_INTERVAL = 5000;
const unsigned long OTA_CHECK_INTERVAL = 60000;
const unsigned long SENSOR_READ_INTERVAL = 10000;
const unsigned long STATUS_PRINT_INTERVAL = 30000;

// ===== INSTANCES =====
WiFiManager wm;
Preferences preferences;
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// ===== DEVICE IDENTITY =====
String DEVICE_MAC = "";
String DEVICE_ID = "";
String DISPLAY_NAME = "";
String SERVER_URL = "";
String MQTT_SERVER = "";
int MQTT_PORT = 1883;

// Firmware version - injected from platformio.ini via build flag
#ifndef FIRMWARE_VERSION
  #define FIRMWARE_VERSION "1.0.0"  // Fallback for Arduino IDE
#endif
String CURRENT_FIRMWARE_VERSION = FIRMWARE_VERSION;

// Default values
const char* DEFAULT_SERVER_URL = "https://iot.quanganh.me";
const char* DEFAULT_MQTT_SERVER = "mqtt.quanganh.me";
const char* DEFAULT_DISPLAY_NAME = "Unnamed Device";

// WiFiManager parameters
WiFiManagerParameter custom_display_name("display_name", "Ten thiet bi", "", 40);
WiFiManagerParameter custom_server_url("server", "Server URL", "", 100);
WiFiManagerParameter custom_mqtt_server("mqtt", "MQTT Server IP", "", 40);

// ===== STATE VARIABLES =====
bool wasConnected = false;
bool mqttWasConnected = false;
unsigned long lastReconnectAttempt = 0;
unsigned long lastMqttReconnect = 0;
unsigned long wifiDisconnectedTime = 0;
unsigned long lastOTACheck = 0;
unsigned long lastSensorRead = 0;
unsigned long lastStatusPrint = 0;

// ===== MQTT TOPICS =====
String topicSensor;
String topicStatus;
String topicConfig;
String topicOta;
String topicBroadcastOta;

// ===== HELPER FUNCTIONS =====

void blinkLED(int times, int delayMs = 200) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(delayMs);
    digitalWrite(LED_PIN, LOW);
    delay(delayMs);
  }
}

String getMacAddressClean() {
  String mac = WiFi.macAddress();
  mac.replace(":", "");
  return mac;
}

String getMacSuffix() {
  String mac = getMacAddressClean();
  return mac.substring(mac.length() - 6);
}

void setupTopics() {
  topicSensor = "flood/" + DEVICE_ID + "/sensor";
  topicStatus = "flood/" + DEVICE_ID + "/status";
  topicConfig = "flood/" + DEVICE_ID + "/config";
  topicOta = "flood/" + DEVICE_ID + "/ota";
  topicBroadcastOta = "flood/broadcast/ota";
}

// ===== NVS FUNCTIONS =====

void loadDeviceConfig() {
  preferences.begin("device", true);
  DISPLAY_NAME = preferences.getString("display_name", DEFAULT_DISPLAY_NAME);
  SERVER_URL = preferences.getString("server_url", DEFAULT_SERVER_URL);
  MQTT_SERVER = preferences.getString("mqtt_server", DEFAULT_MQTT_SERVER);
  MQTT_PORT = preferences.getInt("mqtt_port", 1883);
  // Note: CURRENT_FIRMWARE_VERSION is from build flag, NOT from NVS
  // NVS version is only used to track what was last installed for OTA comparison
  preferences.end();

  Serial.println("\n----- Config from NVS -----");
  Serial.print("Display Name: ");
  Serial.println(DISPLAY_NAME);
  Serial.print("Server URL: ");
  Serial.println(SERVER_URL);
  Serial.print("MQTT Server: ");
  Serial.print(MQTT_SERVER);
  Serial.print(":");
  Serial.println(MQTT_PORT);
  Serial.print("Firmware (build): ");
  Serial.println(CURRENT_FIRMWARE_VERSION);
  Serial.println("---------------------------\n");
}

void saveDeviceConfig() {
  preferences.begin("device", false);
  preferences.putString("display_name", DISPLAY_NAME);
  preferences.putString("server_url", SERVER_URL);
  preferences.putString("mqtt_server", MQTT_SERVER);
  preferences.putInt("mqtt_port", MQTT_PORT);
  preferences.end();
  Serial.println("Config saved to NVS");
}

void saveFirmwareVersion(String version) {
  preferences.begin("device", false);
  preferences.putString("fw_version", version);
  preferences.end();
  CURRENT_FIRMWARE_VERSION = version;
}

// ===== MQTT FUNCTIONS =====

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.print("\n[MQTT] Received on ");
  Serial.print(topic);
  Serial.print(": ");
  Serial.println(message);

  // Handle OTA notification
  if (String(topic) == topicOta || String(topic) == topicBroadcastOta) {
    handleOtaNotification(message);
  }
  // Handle config update
  else if (String(topic) == topicConfig) {
    handleConfigUpdate(message);
  }
}

void handleOtaNotification(String message) {
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, message);

  if (error) {
    Serial.print("JSON parse error: ");
    Serial.println(error.c_str());
    return;
  }

  bool available = doc["available"];
  if (available) {
    String version = doc["version"].as<String>();
    String url = doc["url"].as<String>();
    int size = doc["size"];
    String md5 = doc["md5"].as<String>();

    Serial.println("\n[MQTT] OTA Update available!");
    Serial.print("Version: ");
    Serial.println(version);

    // Trigger OTA update
    performOTAUpdate(url, size, md5, version);
  }
}

void handleConfigUpdate(String message) {
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, message);

  if (error) return;

  bool configChanged = false;

  // Update display name if provided
  if (doc.containsKey("displayName")) {
    String newName = doc["displayName"].as<String>();
    if (newName.length() > 0 && newName != DISPLAY_NAME) {
      DISPLAY_NAME = newName;
      configChanged = true;
      Serial.print("[Config] Display name updated: ");
      Serial.println(DISPLAY_NAME);
    }
  }

  // Update sensor interval if provided
  if (doc.containsKey("sensorInterval")) {
    Serial.print("[Config] sensorInterval: ");
    Serial.println(doc["sensorInterval"].as<int>());
  }

  // Save to NVS if config changed
  if (configChanged) {
    saveDeviceConfig();
    // Publish updated status
    publishStatus("online");
  }
}

bool connectMqtt() {
  if (mqttClient.connected()) return true;
  if (WiFi.status() != WL_CONNECTED) return false;

  unsigned long now = millis();
  if (now - lastMqttReconnect < MQTT_RECONNECT_INTERVAL) return false;
  lastMqttReconnect = now;

  Serial.print("[MQTT] Connecting to ");
  Serial.print(MQTT_SERVER);
  Serial.print(":");
  Serial.print(MQTT_PORT);
  Serial.print("...");

  String clientId = "ESP32-" + DEVICE_ID;

  // LWT (Last Will and Testament) - publish offline when disconnected
  String willTopic = topicStatus;
  String willMessage = "{\"status\":\"offline\",\"deviceId\":\"" + DEVICE_ID + "\"}";

  if (mqttClient.connect(clientId.c_str(), NULL, NULL, willTopic.c_str(), 1, true, willMessage.c_str())) {
    Serial.println(" Connected!");

    // Subscribe to topics
    mqttClient.subscribe(topicConfig.c_str());
    mqttClient.subscribe(topicOta.c_str());
    mqttClient.subscribe(topicBroadcastOta.c_str());

    Serial.println("[MQTT] Subscribed to:");
    Serial.println("  - " + topicConfig);
    Serial.println("  - " + topicOta);
    Serial.println("  - " + topicBroadcastOta);

    // Publish online status
    publishStatus("online");

    mqttWasConnected = true;
    return true;
  } else {
    Serial.print(" Failed, rc=");
    Serial.println(mqttClient.state());
    return false;
  }
}

void publishStatus(const char* status) {
  if (!mqttClient.connected()) return;

  JsonDocument doc;
  doc["status"] = status;
  doc["deviceId"] = DEVICE_ID;
  doc["mac"] = DEVICE_MAC;
  doc["displayName"] = DISPLAY_NAME;
  doc["ip"] = WiFi.localIP().toString();
  doc["wifiSSID"] = WiFi.SSID();
  doc["rssi"] = WiFi.RSSI();
  doc["firmwareVersion"] = CURRENT_FIRMWARE_VERSION;
  doc["uptime"] = millis() / 1000;
  // Hardware info
  doc["chipModel"] = ESP.getChipModel();
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["flashSize"] = ESP.getFlashChipSize();

  String message;
  serializeJson(doc, message);

  mqttClient.publish(topicStatus.c_str(), message.c_str(), true);  // retained
  Serial.print("[MQTT] Published status: ");
  Serial.println(status);
}

void publishSensorData(int rainAnalog, bool rainDigital, int waterLevel) {
  if (!mqttClient.connected()) return;

  JsonDocument doc;
  doc["deviceId"] = DEVICE_ID;
  doc["mac"] = DEVICE_MAC;
  doc["displayName"] = DISPLAY_NAME;
  doc["rainAnalog"] = rainAnalog;
  doc["rainDigital"] = rainDigital;
  doc["waterLevel"] = waterLevel;
  doc["rssi"] = WiFi.RSSI();
  doc["ip"] = WiFi.localIP().toString();
  doc["firmwareVersion"] = CURRENT_FIRMWARE_VERSION;
  doc["uptime"] = millis() / 1000;

  String message;
  serializeJson(doc, message);

  if (mqttClient.publish(topicSensor.c_str(), message.c_str())) {
    Serial.println("[MQTT] Sensor data published");
  } else {
    Serial.println("[MQTT] Publish failed!");
  }
}

// ===== OTA FUNCTIONS =====

String urlEncode(const String& str) {
  String encoded = "";
  char c;
  for (int i = 0; i < str.length(); i++) {
    c = str.charAt(i);
    if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
      encoded += c;
    } else if (c == ' ') {
      encoded += "%20";
    } else {
      char buf[4];
      sprintf(buf, "%%%02X", (unsigned char)c);
      encoded += buf;
    }
  }
  return encoded;
}

bool checkForOTAUpdate() {
  if (WiFi.status() != WL_CONNECTED) return false;

  Serial.println("\n========== OTA CHECK ==========");

  HTTPClient http;
  String url = SERVER_URL + "/api/ota/check/" + DEVICE_ID;
  url += "?version=" + urlEncode(CURRENT_FIRMWARE_VERSION);
  url += "&mac=" + urlEncode(DEVICE_MAC);
  url += "&name=" + urlEncode(DISPLAY_NAME);
  url += "&rssi=" + String(WiFi.RSSI());
  url += "&ip=" + WiFi.localIP().toString();

  Serial.print("URL: ");
  Serial.println(url);

  http.begin(url);
  http.setTimeout(10000);
  
  int httpCode = http.GET();
  Serial.print("HTTP Code: ");
  Serial.println(httpCode);

  if (httpCode == 200) {
    String payload = http.getString();
    Serial.print("Response: ");
    Serial.println(payload.substring(0, 200));  // Print first 200 chars

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, payload);

    if (error) {
      Serial.print("JSON Error: ");
      Serial.println(error.c_str());
    } else {
      bool available = doc["data"]["available"];
      Serial.print("Available: ");
      Serial.println(available ? "YES" : "NO");

      if (available) {
        String version = doc["data"]["version"].as<String>();
        String downloadUrl = doc["data"]["url"].as<String>();
        int size = doc["data"]["size"];
        String md5 = doc["data"]["md5"].as<String>();

        Serial.println("Update available: " + version);
        http.end();
        return performOTAUpdate(downloadUrl, size, md5, version);
      }
    }
  } else {
    Serial.print("HTTP Error: ");
    Serial.println(http.errorToString(httpCode));
  }

  Serial.println("Already up to date");
  Serial.println("===============================\n");
  http.end();
  return false;
}

bool performOTAUpdate(String downloadUrl, int firmwareSize, String expectedMD5, String newVersion) {
  Serial.println("\n========== OTA UPDATE ==========");

  HTTPClient http;
  String fullUrl = SERVER_URL + downloadUrl;

  Serial.print("Downloading: ");
  Serial.println(fullUrl);

  http.begin(fullUrl);
  http.setTimeout(30000);

  int httpCode = http.GET();

  if (httpCode != 200) {
    Serial.print("Download failed: ");
    Serial.println(httpCode);
    http.end();
    return false;
  }

  int contentLength = http.getSize();

  if (!Update.begin(contentLength)) {
    Serial.println("Not enough space!");
    http.end();
    return false;
  }

  WiFiClient* stream = http.getStreamPtr();
  size_t written = 0;
  uint8_t buff[128] = { 0 };

  while (http.connected() && (written < contentLength)) {
    size_t available = stream->available();
    if (available) {
      int bytesRead = stream->readBytes(buff, min(available, sizeof(buff)));
      if (bytesRead > 0) {
        Update.write(buff, bytesRead);
        written += bytesRead;

        int progress = (written * 100) / contentLength;
        if (progress % 20 == 0) {
          Serial.print(progress);
          Serial.println("%");
          digitalWrite(LED_PIN, !digitalRead(LED_PIN));
        }
      }
    }
    delay(1);
  }

  http.end();

  if (Update.end() && Update.isFinished()) {
    Serial.println("OTA SUCCESS!");
    saveFirmwareVersion(newVersion);
    confirmOTASuccess(newVersion);
    Serial.println("Restarting in 3s...");
    delay(3000);
    ESP.restart();
    return true;
  }

  Serial.print("OTA Error: ");
  Serial.println(Update.getError());
  return false;
}

void confirmOTASuccess(String newVersion) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = SERVER_URL + "/api/ota/verify/" + DEVICE_ID;

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  JsonDocument doc;
  doc["version"] = newVersion;
  doc["status"] = "success";
  doc["mac"] = DEVICE_MAC;
  doc["displayName"] = DISPLAY_NAME;
  doc["ip"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();

  String jsonData;
  serializeJson(doc, jsonData);

  http.POST(jsonData);
  http.end();
}

// ===== WIFIMANAGER CALLBACKS =====

void configModeCallback(WiFiManager* myWiFiManager) {
  Serial.println("\n=== CONFIG MODE ===");
  Serial.print("AP: ");
  Serial.println(myWiFiManager->getConfigPortalSSID());
  Serial.println("IP: 192.168.4.1");
  blinkLED(3, 100);
}

void saveConfigCallback() {
  String newName = String(custom_display_name.getValue());
  String newServer = String(custom_server_url.getValue());
  String newMqtt = String(custom_mqtt_server.getValue());

  if (newName.length() > 0) DISPLAY_NAME = newName;
  if (newServer.length() > 0) SERVER_URL = newServer;
  if (newMqtt.length() > 0) MQTT_SERVER = newMqtt;

  saveDeviceConfig();
  blinkLED(5, 100);
}

// ===== SETUP =====

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(LED_PIN, OUTPUT);
  pinMode(RESET_BUTTON, INPUT_PULLUP);
  pinMode(RAIN_AO_PIN, INPUT);
  pinMode(RAIN_DO_PIN, INPUT);
  pinMode(WATER_AO_PIN, INPUT);

  Serial.println("\n========================================");
  Serial.println("   ESP32 Flood Detection System");
  Serial.println("   MQTT + OTA Update");
  Serial.println("========================================\n");

  // IMPORTANT: Init WiFi first to get valid MAC address
  WiFi.mode(WIFI_STA);
  delay(100);  // Give WiFi time to initialize

  // Device identity
  DEVICE_MAC = WiFi.macAddress();
  DEVICE_ID = getMacAddressClean();

  Serial.print("MAC: ");
  Serial.println(DEVICE_MAC);
  Serial.print("Device ID: ");
  Serial.println(DEVICE_ID);

  // Load config
  loadDeviceConfig();

  // Setup MQTT topics
  setupTopics();

  // Check reset button
  Serial.println("Hold BOOT 3s to reset WiFi...");
  unsigned long start = millis();
  bool resetReq = false;

  while (millis() - start < 3000) {
    if (digitalRead(RESET_BUTTON) == LOW) {
      resetReq = true;
      Serial.print(".");
      delay(100);
    } else {
      resetReq = false;
      break;
    }
  }

  if (resetReq && digitalRead(RESET_BUTTON) == LOW) {
    Serial.println("\nResetting WiFi...");
    wm.resetSettings();
    blinkLED(5, 100);
    delay(2000);
  }

  // WiFiManager setup
  wm.setDebugOutput(true);
  wm.setConfigPortalTimeout(CONFIG_PORTAL_TIMEOUT);
  wm.setConnectTimeout(20);
  wm.setConnectRetries(3);

  String hostname = "ESP32-" + getMacSuffix();
  WiFi.setHostname(hostname.c_str());

  wm.setAPCallback(configModeCallback);
  wm.setSaveConfigCallback(saveConfigCallback);

  custom_display_name.setValue(DISPLAY_NAME.c_str(), 40);
  custom_server_url.setValue(SERVER_URL.c_str(), 100);
  custom_mqtt_server.setValue(MQTT_SERVER.c_str(), 40);

  wm.addParameter(&custom_display_name);
  wm.addParameter(&custom_server_url);
  wm.addParameter(&custom_mqtt_server);

  String apName = "ESP32-Setup-" + getMacSuffix();

  if (wm.autoConnect(apName.c_str())) {
    Serial.println("\nWiFi Connected!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    digitalWrite(LED_PIN, HIGH);
    wasConnected = true;

    // Setup MQTT
    mqttClient.setServer(MQTT_SERVER.c_str(), MQTT_PORT);
    mqttClient.setCallback(mqttCallback);
    mqttClient.setBufferSize(512);

    // Connect to MQTT
    connectMqtt();
  } else {
    Serial.println("\nWiFi Failed - Running offline");
    wasConnected = false;
    wifiDisconnectedTime = millis();
  }

  Serial.println("\n----- Ready -----");
  Serial.print("Device: ");
  Serial.println(DEVICE_ID);
  Serial.print("Name: ");
  Serial.println(DISPLAY_NAME);
  Serial.println("-----------------\n");
}

// ===== MAIN LOOP =====

void loop() {
  unsigned long now = millis();

  // Serial commands
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd == "reset") {
      wm.resetSettings();
      delay(1000);
      ESP.restart();
    } else if (cmd == "status") {
      Serial.println("\n=== STATUS ===");
      Serial.print("Device: ");
      Serial.println(DEVICE_ID);
      Serial.print("WiFi: ");
      Serial.println(WiFi.status() == WL_CONNECTED ? "OK" : "DISCONNECTED");
      Serial.print("MQTT: ");
      Serial.println(mqttClient.connected() ? "OK" : "DISCONNECTED");
      Serial.print("Firmware: ");
      Serial.println(CURRENT_FIRMWARE_VERSION);
      Serial.println("==============\n");
    } else if (cmd == "ota") {
      checkForOTAUpdate();
    } else if (cmd == "clearnvs") {
      Serial.println("Clearing all NVS data...");
      preferences.begin("device", false);
      preferences.clear();
      preferences.end();
      Serial.println("NVS cleared. Restarting...");
      delay(1000);
      ESP.restart();
    } else if (cmd.startsWith("setmqtt ")) {
      String newMqtt = cmd.substring(8);
      newMqtt.trim();
      if (newMqtt.length() > 0) {
        MQTT_SERVER = newMqtt;
        saveDeviceConfig();
        Serial.print("MQTT server set to: ");
        Serial.println(MQTT_SERVER);
        Serial.println("Restarting...");
        delay(1000);
        ESP.restart();
      }
    } else if (cmd.startsWith("setserver ")) {
      String newServer = cmd.substring(10);
      newServer.trim();
      if (newServer.length() > 0) {
        SERVER_URL = newServer;
        saveDeviceConfig();
        Serial.print("Server URL set to: ");
        Serial.println(SERVER_URL);
        Serial.println("Restarting...");
        delay(1000);
        ESP.restart();
      }
    } else if (cmd == "help") {
      Serial.println("\n=== COMMANDS ===");
      Serial.println("reset     - Reset WiFi settings");
      Serial.println("status    - Show current status");
      Serial.println("ota       - Check for OTA update");
      Serial.println("clearnvs  - Clear all NVS data and restart");
      Serial.println("setmqtt <ip>    - Set MQTT server IP");
      Serial.println("setserver <url> - Set server URL");
      Serial.println("================\n");
    }
  }

  bool isConnected = (WiFi.status() == WL_CONNECTED);

  // WiFi management
  if (isConnected) {
    if (!wasConnected) {
      Serial.println("WiFi reconnected!");
      wifiDisconnectedTime = 0;
      wasConnected = true;
    }

    // MQTT management
    if (!mqttClient.connected()) {
      if (mqttWasConnected) {
        Serial.println("[MQTT] Disconnected!");
        mqttWasConnected = false;
      }
      connectMqtt();
    }
    mqttClient.loop();

    // Status print
    if (now - lastStatusPrint >= STATUS_PRINT_INTERVAL) {
      lastStatusPrint = now;
      Serial.print("WiFi OK | MQTT ");
      Serial.print(mqttClient.connected() ? "OK" : "FAIL");
      Serial.print(" | ");
      Serial.print(DEVICE_ID);
      Serial.print(" | RSSI: ");
      Serial.println(WiFi.RSSI());
    }

    // OTA check
    if (now - lastOTACheck >= OTA_CHECK_INTERVAL) {
      lastOTACheck = now;
      checkForOTAUpdate();
    }

    digitalWrite(LED_PIN, HIGH);

  } else {
    // WiFi disconnected
    if (wasConnected) {
      Serial.println("WiFi disconnected!");
      wifiDisconnectedTime = now;
      wasConnected = false;
    }

    // Reconnect attempt
    if (now - lastReconnectAttempt >= WIFI_RECONNECT_INTERVAL) {
      lastReconnectAttempt = now;
      WiFi.reconnect();
    }

    // LED blink when offline
    static unsigned long lastBlink = 0;
    if (now - lastBlink >= 1000) {
      lastBlink = now;
      digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    }
  }

  // Sensor reading
  if (now - lastSensorRead >= SENSOR_READ_INTERVAL) {
    lastSensorRead = now;

    int rainAnalog = analogRead(RAIN_AO_PIN);
    int rainDigital = digitalRead(RAIN_DO_PIN);
    int waterLevel = analogRead(WATER_AO_PIN);

    // Determine status
    String waterStatus = waterLevel < WATER_WARNING_LEVEL ? "SAFE" :
                         waterLevel < WATER_DANGER_LEVEL ? "WARNING" : "DANGER";
    String rainStatus = rainAnalog >= RAIN_DRY_THRESHOLD ? "DRY" :
                        rainAnalog >= RAIN_WARNING_THRESHOLD ? "LIGHT" : "HEAVY";

    Serial.print("Rain: ");
    Serial.print(rainAnalog);
    Serial.print(" (");
    Serial.print(rainStatus);
    Serial.print(") | Water: ");
    Serial.print(waterLevel);
    Serial.print(" (");
    Serial.print(waterStatus);
    Serial.println(")");

    // Publish via MQTT (much lighter than HTTP!)
    if (mqttClient.connected()) {
      publishSensorData(rainAnalog, rainDigital, waterLevel);
    }

    // Alerts
    if (waterLevel >= WATER_DANGER_LEVEL) {
      Serial.println("!!! DANGER: HIGH WATER LEVEL !!!");
    }
    if (rainAnalog < RAIN_WARNING_THRESHOLD) {
      Serial.println("!!! WARNING: HEAVY RAIN !!!");
    }
  }

  delay(10);
}
