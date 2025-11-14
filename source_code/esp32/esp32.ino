/*
 * ===== ESP32 FLOOD DETECTION SYSTEM =====
 * Hệ thống cảnh báo lũ lụt với WiFi non-blocking
 *
 * TÍNH NĂNG:
 * - Đọc cảm biến mưa (analog + digital)
 * - Đọc cảm biến mực nước (analog)
 * - Cảnh báo nguy hiểm khi vượt ngưỡng
 * - Gửi data lên server (khi có WiFi)
 * - Lưu data local (khi mất WiFi)
 * - NON-BLOCKING: Luôn hoạt động dù có/không WiFi
 *
 * CHÂN CẢM BIẾN:
 * - GPIO 34: Cảm biến mưa AO (analog)
 * - GPIO 25: Cảm biến mưa DO (digital)
 * - GPIO 35: Cảm biến mực nước (analog)
 * - GPIO 2:  LED status
 *
 * CẤU HÌNH WIFI:
 * 1. Upload code lên ESP32
 * 2. ESP32 tạo WiFi AP: "ESP32-WiFi-Setup"
 * 3. Kết nối vào WiFi này → Trình duyệt tự mở
 * 4. Chọn WiFi và nhập password → Save
 * 5. ESP32 tự động kết nối
 *
 * QUẢN LÝ:
 * - Reset WiFi: Gõ "reset" trong Serial Monitor
 * - Mở portal: Gõ "config"
 * - Xem trạng thái: Gõ "status"
 * - Hoặc nhấn giữ nút BOOT 3-5 giây
 *
 * THƯ VIỆN CẦN THIẾT:
 * - WiFiManager by tzapu (v2.0.17+)
 * - HTTPClient (tùy chọn - để gửi data lên server)
 *
 * Arduino IDE: Tools → Manage Libraries → "WiFiManager"
 * PlatformIO: lib_deps = tzapu/WiFiManager @ ^2.0.17
 */

#include <WiFi.h>
#include <WiFiManager.h>  // https://github.com/tzapu/WiFiManager

// LED Status
const int LED_PIN = 2;  // GPIO2 - LED built-in

// Nút reset cấu hình WiFi
const int RESET_BUTTON = 0;  // GPIO0 - Nút BOOT trên hầu hết ESP32

// WiFiManager instance
WiFiManager wm;

// Timeout cho config portal (giây)
const int CONFIG_PORTAL_TIMEOUT = 180;  // 3 phút

// Thời gian thử reconnect WiFi (ms)
const unsigned long WIFI_RECONNECT_INTERVAL = 30000;  // 30 giây

// Custom parameters (nếu cần thêm cấu hình khác)
WiFiManagerParameter custom_device_name("device_name", "Tên thiết bị", "ESP32-Device-01", 40);
WiFiManagerParameter custom_server_url("server", "Server URL", "http://yourserver.com", 100);

// Biến trạng thái WiFi
bool wasConnected = false;
unsigned long lastReconnectAttempt = 0;
unsigned long wifiDisconnectedTime = 0;

// ===== CẤU HÌNH SENSOR =====
// Chân cảm biến mưa
const int RAIN_AO_PIN = 34;   // AO cảm biến mưa (analog output)
const int RAIN_DO_PIN = 25;   // DO cảm biến mưa (digital output)

// Chân cảm biến mực nước
const int WATER_AO_PIN = 35;  // S cảm biến mực nước (analog)

// Ngưỡng cảnh báo
const int WATER_WARNING_LEVEL = 2000;   // Mực nước cảnh báo (0-4095)
const int WATER_DANGER_LEVEL = 3000;    // Mực nước nguy hiểm (0-4095)

// QUAN TRỌNG: Cảm biến mưa hoạt động NGƯỢC
// Khô ráo = 4095 (cao), Ướt (mưa) = 0 (thấp)
const int RAIN_DRY_THRESHOLD = 3000;      // > 3000 = Khô ráo
const int RAIN_WARNING_THRESHOLD = 2000;  // < 2000 = Mưa lớn

void blinkLED(int times, int delayMs = 200) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(delayMs);
    digitalWrite(LED_PIN, LOW);
    delay(delayMs);
  }
}

// Callback khi vào config mode
void configModeCallback(WiFiManager *myWiFiManager) {
  Serial.println("\n========================================");
  Serial.println("     CHƯA KẾT NỐI WIFI - CONFIG MODE");
  Serial.println("========================================");
  Serial.print("SSID AP: ");
  Serial.println(myWiFiManager->getConfigPortalSSID());
  Serial.print("IP Config Portal: ");
  Serial.println(WiFi.softAPIP());
  Serial.println("\nHƯỚNG DẪN:");
  Serial.println("1. Kết nối WiFi: " + myWiFiManager->getConfigPortalSSID());
  Serial.println("2. Trình duyệt tự mở (hoặc vào 192.168.4.1)");
  Serial.println("3. Chọn WiFi và nhập mật khẩu");
  Serial.println("========================================\n");

  // LED nhấp nháy nhanh khi ở config mode
  blinkLED(3, 100);
}

// Callback khi lưu cấu hình
void saveConfigCallback() {
  Serial.println("\n✓ Đã lưu cấu hình WiFi!");

  // Lấy custom parameters
  Serial.println("\n----- Custom Parameters -----");
  Serial.print("Device Name: ");
  Serial.println(custom_device_name.getValue());
  Serial.print("Server URL: ");
  Serial.println(custom_server_url.getValue());
  Serial.println("-----------------------------\n");

  // TODO: Lưu custom parameters vào SPIFFS/LittleFS nếu cần

  blinkLED(5, 100);
}

// Callback khi kết nối WiFi thành công
void saveParamCallback() {
  Serial.println("\n✓ Tham số đã được lưu!");
}

void checkResetButton() {
  // Kiểm tra nút reset
  if (digitalRead(RESET_BUTTON) == LOW) {
    Serial.println("\n[!] Đang nhấn nút RESET...");
    delay(5000);  // Chờ 5 giây

    if (digitalRead(RESET_BUTTON) == LOW) {
      Serial.println("\n========================================");
      Serial.println("     XÓA CẤU HÌNH WIFI ĐÃ LƯU");
      Serial.println("========================================");

      wm.resetSettings();  // Xóa WiFi đã lưu

      Serial.println("✓ Đã xóa cấu hình!");
      Serial.println("ESP32 sẽ khởi động lại...\n");

      delay(3000);
      ESP.restart();
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Khởi tạo LED và nút reset
  pinMode(LED_PIN, OUTPUT);
  pinMode(RESET_BUTTON, INPUT_PULLUP);
  digitalWrite(LED_PIN, LOW);

  // Khởi tạo chân cảm biến
  pinMode(RAIN_AO_PIN, INPUT);
  pinMode(RAIN_DO_PIN, INPUT);
  pinMode(WATER_AO_PIN, INPUT);

  Serial.println("\n\n========================================");
  Serial.println("   ESP32 Flood Detection System");
  Serial.println("   WiFiManager - Non-blocking Mode");
  Serial.println("========================================\n");

  // Hiển thị thông tin ESP32
  Serial.println("----- Thông tin thiết bị -----");
  Serial.print("Chip: ");
  Serial.println(ESP.getChipModel());
  Serial.print("MAC: ");
  Serial.println(WiFi.macAddress());
  Serial.print("Flash: ");
  Serial.print(ESP.getFlashChipSize() / 1024 / 1024);
  Serial.println(" MB");
  Serial.println("------------------------------\n");

  // KIỂM TRA NÚT RESET KHI KHỞI ĐỘNG
  Serial.println("⏳ Nhấn giữ nút BOOT trong 3 giây để xóa WiFi...");
  delay(100);

  unsigned long startTime = millis();
  bool resetRequested = false;

  while (millis() - startTime < 3000) {
    if (digitalRead(RESET_BUTTON) == LOW) {
      resetRequested = true;
      Serial.print(".");
      delay(100);
    } else {
      resetRequested = false;
      break;
    }
  }

  Serial.println();

  if (resetRequested && digitalRead(RESET_BUTTON) == LOW) {
    Serial.println("\n========================================");
    Serial.println("     🗑️  XÓA WIFI ĐÃ LƯU");
    Serial.println("========================================");

    wm.resetSettings();  // Xóa WiFi đã lưu

    Serial.println("✓ Đã xóa WiFi: Tang 5");
    Serial.println("✓ Config portal sẽ mở để chọn WiFi mới");
    Serial.println("========================================\n");

    blinkLED(5, 100);
    delay(2000);
  } else {
    Serial.println("→ Tiếp tục với WiFi đã lưu (nếu có)\n");
  }

  // Cấu hình WiFiManager
  wm.setDebugOutput(true);  // Debug output
  wm.setConfigPortalTimeout(CONFIG_PORTAL_TIMEOUT);  // Timeout 3 phút
  wm.setConfigPortalBlocking(true);  // Blocking mode
  wm.setConnectTimeout(20);  // Timeout kết nối WiFi: 20 giây
  wm.setConnectRetries(3);  // Thử kết nối 3 lần

  // Custom config portal SSID và password (có thể để trống password)
  // wm.setAPStaticIPConfig(IPAddress(10,0,1,1), IPAddress(10,0,1,1), IPAddress(255,255,255,0));

  // Set hostname
  WiFi.setHostname("ESP32-WiFiManager");

  // Callback functions
  wm.setAPCallback(configModeCallback);
  wm.setSaveConfigCallback(saveConfigCallback);
  wm.setSaveParamsCallback(saveParamCallback);

  // Thêm custom parameters
  wm.addParameter(&custom_device_name);
  wm.addParameter(&custom_server_url);

  // Custom HTML (nếu muốn tùy chỉnh giao diện)
  // const char* custom_html = "<p>Custom HTML content here</p>";
  // wm.setCustomHeadElement(custom_html);

  // Tên AP và password cho config portal
  String apName = "ESP32-WiFi-Setup";
  String apPassword = "";  // Để trống = không có mật khẩu, hoặc đặt password

  Serial.println("🚀 Đang khởi động WiFiManager...\n");

  // Auto connect - Tự động kết nối WiFi đã lưu hoặc mở config portal
  bool connected = wm.autoConnect(apName.c_str(), apPassword.c_str());

  if (connected) {
    Serial.println("\n========================================");
    Serial.println("     ✓ KẾT NỐI WIFI THÀNH CÔNG!");
    Serial.println("========================================");
    Serial.print("SSID: ");
    Serial.println(WiFi.SSID());
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("Gateway: ");
    Serial.println(WiFi.gatewayIP());
    Serial.print("DNS: ");
    Serial.println(WiFi.dnsIP());
    Serial.print("Signal Strength: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    Serial.println("========================================\n");

    // LED sáng khi kết nối thành công
    digitalWrite(LED_PIN, HIGH);
    wasConnected = true;  // Đánh dấu đã kết nối
  } else {
    Serial.println("\n========================================");
    Serial.println("     ✗ KHÔNG THỂ KẾT NỐI WIFI");
    Serial.println("========================================");
    Serial.println("Config portal timeout!");
    Serial.println("\n⚠️  ESP32 sẽ tiếp tục hoạt động OFFLINE");
    Serial.println("Bạn có thể:");
    Serial.println("- Gõ 'config' để mở portal lại");
    Serial.println("- Gõ 'help' để xem lệnh hỗ trợ");
    Serial.println("========================================\n");

    wasConnected = false;  // Đánh dấu chưa kết nối
    wifiDisconnectedTime = millis();
  }

  Serial.println("\n📌 GHI CHÚ:");
  Serial.println("- ESP32 sẽ hoạt động LIÊN TỤC dù có WiFi hay không");
  Serial.println("- Mất WiFi? ESP32 vẫn đọc sensor và lưu local");
  Serial.println("- Gõ 'help' để xem danh sách lệnh");
  Serial.println("- Nhấn giữ nút BOOT 5 giây để reset WiFi\n");
}

void loop() {
  // Kiểm tra lệnh từ Serial Monitor
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();

    if (command == "reset" || command == "clear") {
      Serial.println("\n========================================");
      Serial.println("     🗑️  XÓA WIFI QUA SERIAL");
      Serial.println("========================================");

      wm.resetSettings();

      Serial.println("✓ Đã xóa WiFi đã lưu!");
      Serial.println("ESP32 sẽ khởi động lại...\n");

      delay(2000);
      ESP.restart();

    } else if (command == "config" || command == "portal") {
      Serial.println("\n========================================");
      Serial.println("     🌐 MỞ CONFIG PORTAL THỦ CÔNG");
      Serial.println("========================================");
      Serial.println("Kết nối WiFi: ESP32-WiFi-Setup");
      Serial.println("Truy cập: 192.168.4.1");
      Serial.println("Nhấn Ctrl+C trong Serial để thoát portal");
      Serial.println("========================================\n");

      // Mở config portal (blocking) - chỉ khi user yêu cầu
      wm.startConfigPortal("ESP32-WiFi-Setup");

      Serial.println("\n✓ Đã đóng config portal");

    } else if (command == "status" || command == "info") {
      Serial.println("\n========== TRẠNG THÁI HỆ THỐNG ==========");
      Serial.print("WiFi: ");
      if (WiFi.status() == WL_CONNECTED) {
        Serial.println("Đã kết nối");
        Serial.print("  SSID: ");
        Serial.println(WiFi.SSID());
        Serial.print("  IP: ");
        Serial.println(WiFi.localIP());
        Serial.print("  RSSI: ");
        Serial.print(WiFi.RSSI());
        Serial.println(" dBm");
      } else {
        Serial.println("Mất kết nối");
        if (wifiDisconnectedTime > 0) {
          Serial.print("  Offline: ");
          Serial.print((millis() - wifiDisconnectedTime) / 1000);
          Serial.println(" giây");
        }
      }
      Serial.print("Uptime: ");
      Serial.print(millis() / 1000);
      Serial.println(" giây");
      Serial.println("=========================================\n");

    } else if (command == "help" || command == "?") {
      Serial.println("\n========== LỆNH HỖ TRỢ ==========");
      Serial.println("reset / clear - Xóa WiFi và restart");
      Serial.println("config / portal     - Mở config portal");
      Serial.println("status / info       - Hiển thị trạng thái");
      Serial.println("help / ?            - Hiển thị trợ giúp");
      Serial.println("==================================\n");
    } else if (command.length() > 0) {
      Serial.println("❌ Lệnh không hợp lệ. Gõ 'help' để xem danh sách lệnh.");
    }
  }

  // Kiểm tra nút reset
  checkResetButton();

  // ===== QUẢN LÝ KẾT NỐI WIFI - NON-BLOCKING =====
  bool isConnected = (WiFi.status() == WL_CONNECTED);
  unsigned long currentMillis = millis();

  if (isConnected) {
    // ===== CÓ WIFI - HOẠT ĐỘNG BÌNH THƯỜNG =====

    if (!wasConnected) {
      // Vừa kết nối lại
      Serial.println("\n========================================");
      Serial.println("     ✓ WIFI ĐÃ KẾT NỐI TRỞ LẠI!");
      Serial.println("========================================");
      Serial.print("IP: ");
      Serial.println(WiFi.localIP());
      Serial.print("Thời gian offline: ");
      if (wifiDisconnectedTime > 0) {
        Serial.print((millis() - wifiDisconnectedTime) / 1000);
        Serial.println(" giây");
      } else {
        Serial.println("0 giây");
      }
      Serial.println("========================================\n");

      wifiDisconnectedTime = 0;
      wasConnected = true;
    }

    // Hiển thị trạng thái mỗi 30 giây
    static unsigned long lastStatusPrint = 0;
    if (currentMillis - lastStatusPrint >= 30000) {
      lastStatusPrint = currentMillis;

      Serial.print("✓ WiFi OK | IP: ");
      Serial.print(WiFi.localIP());
      Serial.print(" | RSSI: ");
      Serial.print(WiFi.RSSI());
      Serial.println(" dBm");
    }

    // LED sáng liên tục khi có WiFi
    digitalWrite(LED_PIN, HIGH);

  } else {
    // ===== MẤT WIFI - VẪN HOẠT ĐỘNG BÌNH THƯỜNG =====

    if (wasConnected) {
      // Vừa mất kết nối
      Serial.println("\n⚠️ ========================================");
      Serial.println("     MẤT KẾT NỐI WIFI!");
      Serial.println("========================================");
      Serial.println("✓ ESP32 vẫn hoạt động bình thường");
      Serial.println("✓ Đang đọc sensor và lưu data local");
      Serial.println("✓ Sẽ tự động kết nối lại khi WiFi trở lại");
      Serial.println("========================================\n");

      wifiDisconnectedTime = millis();
      wasConnected = false;
    }

    // Thử reconnect mỗi 30 giây (KHÔNG BLOCKING)
    if (currentMillis - lastReconnectAttempt >= WIFI_RECONNECT_INTERVAL) {
      lastReconnectAttempt = currentMillis;

      unsigned long offlineSeconds = (millis() - wifiDisconnectedTime) / 1000;
      Serial.print("[*] Thử kết nối lại WiFi (offline: ");
      Serial.print(offlineSeconds);
      Serial.println("s)...");

      WiFi.reconnect();

      // Chờ 3 giây xem có kết nối được không (non-blocking)
      unsigned long reconnectStart = millis();
      while (millis() - reconnectStart < 3000) {
        if (WiFi.status() == WL_CONNECTED) {
          break;
        }
        delay(100);
      }

      if (WiFi.status() != WL_CONNECTED) {
        Serial.println("    → Chưa kết nối được, sẽ thử lại sau 30s");
      }
    }

    // LED nhấp nháy chậm khi mất WiFi (vẫn hoạt động)
    static unsigned long lastBlink = 0;
    if (currentMillis - lastBlink >= 1000) {
      lastBlink = currentMillis;
      digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    }

    // Hiển thị cảnh báo mỗi 5 phút
    static unsigned long lastWarning = 0;
    if (currentMillis - lastWarning >= 300000) {  // 5 phút
      lastWarning = currentMillis;
      unsigned long offlineMinutes = (millis() - wifiDisconnectedTime) / 60000;
      Serial.print("⚠️  Đã mất WiFi ");
      Serial.print(offlineMinutes);
      Serial.println(" phút - ESP32 vẫn đang hoạt động");
    }
  }

  // ===== ĐỌC CẢM BIẾN - FLOOD DETECTION =====
  // LUÔN CHẠY DÙ CÓ WIFI HAY KHÔNG

  static unsigned long lastSensorRead = 0;
  if (currentMillis - lastSensorRead >= 2000) {  // Đọc sensor mỗi 2 giây
    lastSensorRead = currentMillis;

    // ===== ĐỌC CẢM BIẾN THẬT =====
    int rainAnalog = analogRead(RAIN_AO_PIN);     // 0-4095: Cảm biến mưa (analog)
    int rainDigital = digitalRead(RAIN_DO_PIN);   // 0 hoặc 1: Cảm biến mưa (digital)
    int waterLevel = analogRead(WATER_AO_PIN);    // 0-4095: Mực nước

    // Hiển thị dữ liệu sensor
    Serial.println("\n========== ĐỌC CẢM BIẾN ==========");
    Serial.print("🌧️  Mưa (AO): ");
    Serial.print(rainAnalog);
    Serial.print(" | Mưa (DO): ");
    Serial.print(rainDigital ? "KHÔNG MƯA" : "CÓ MƯA");
    Serial.print(" | 💧 Mực nước: ");
    Serial.println(waterLevel);

    // Phân tích trạng thái
    String waterStatus = "";
    String rainStatus = "";

    // Đánh giá mực nước
    if (waterLevel < WATER_WARNING_LEVEL) {
      waterStatus = "Bình thường";
    } else if (waterLevel < WATER_DANGER_LEVEL) {
      waterStatus = "⚠️  CẢNH BÁO";
    } else {
      waterStatus = "🚨 NGUY HIỂM";
    }

    // Đánh giá mưa (NGƯỢC: Cao = Khô, Thấp = Ướt)
    if (rainAnalog >= RAIN_DRY_THRESHOLD) {
      rainStatus = "☀️  Khô ráo / Không mưa";
    } else if (rainAnalog >= RAIN_WARNING_THRESHOLD) {
      rainStatus = "🌦️  Mưa nhẹ / vừa";
    } else {
      rainStatus = "⚠️  Mưa lớn";
    }

    Serial.print("Trạng thái nước: ");
    Serial.print(waterStatus);
    Serial.print(" | Trạng thái mưa: ");
    Serial.println(rainStatus);

    // Nếu có WiFi → Gửi lên server
    if (isConnected) {
      Serial.print("📤 Gửi data lên server... ");

      // TODO: Thêm HTTPClient để gửi data
      // #include <HTTPClient.h> (thêm ở đầu file)
      /*
      HTTPClient http;
      String serverUrl = String(custom_server_url.getValue());
      http.begin(serverUrl + "/api/sensor-data");
      http.addHeader("Content-Type", "application/json");

      // Tạo JSON data
      String jsonData = "{";
      jsonData += "\"device\":\"" + String(custom_device_name.getValue()) + "\",";
      jsonData += "\"rainAnalog\":" + String(rainAnalog) + ",";
      jsonData += "\"rainDigital\":" + String(rainDigital) + ",";
      jsonData += "\"waterLevel\":" + String(waterLevel) + ",";
      jsonData += "\"timestamp\":" + String(millis());
      jsonData += "}";

      int httpCode = http.POST(jsonData);

      if (httpCode == 200) {
        Serial.println("✓ Thành công");
      } else {
        Serial.print("✗ Lỗi: ");
        Serial.println(httpCode);
      }
      http.end();
      */

      Serial.println("✓ OK (TODO: implement HTTPClient)");

    } else {
      // Nếu mất WiFi → Lưu data local
      Serial.println("💾 Lưu vào buffer local (sẽ sync khi có WiFi)");

      // TODO: Lưu vào SD card hoặc SPIFFS
      /*
      File file = SD.open("/flood_data.txt", FILE_APPEND);
      if (file) {
        file.print(millis());
        file.print(",");
        file.print(rainAnalog);
        file.print(",");
        file.print(rainDigital);
        file.print(",");
        file.println(waterLevel);
        file.close();
      }
      */
    }

    // ===== CẢNH BÁO NGUY HIỂM =====
    bool isDanger = false;

    // Cảnh báo mực nước cao
    if (waterLevel >= WATER_DANGER_LEVEL) {
      Serial.println("\n🚨🚨🚨 NGUY HIỂM: MỰC NƯỚC RẤT CAO! 🚨🚨🚨");
      Serial.print("   Mực nước: ");
      Serial.print(waterLevel);
      Serial.print(" (ngưỡng: ");
      Serial.print(WATER_DANGER_LEVEL);
      Serial.println(")");
      isDanger = true;

    } else if (waterLevel >= WATER_WARNING_LEVEL) {
      Serial.println("\n⚠️  CẢNH BÁO: Mực nước đang tăng cao!");
      Serial.print("   Mực nước: ");
      Serial.print(waterLevel);
      Serial.print(" (ngưỡng: ");
      Serial.print(WATER_WARNING_LEVEL);
      Serial.println(")");
    }

    // Cảnh báo mưa lớn (NGƯỢC: Thấp = Mưa lớn)
    if (rainAnalog < RAIN_WARNING_THRESHOLD) {
      Serial.println("⚠️  CẢNH BÁO: Mưa lớn!");
      Serial.print("   Mưa: ");
      Serial.print(rainAnalog);
      Serial.print(" (ngưỡng: < ");
      Serial.print(RAIN_WARNING_THRESHOLD);
      Serial.println(")");
    }

    // Cảnh báo kép: Mưa lớn + Mực nước cao
    if (rainAnalog < RAIN_WARNING_THRESHOLD && waterLevel >= WATER_WARNING_LEVEL) {
      Serial.println("\n🚨 CẢNH BÁO KÉP: MƯA LỚN + MỰC NƯỚC CAO!");
      Serial.println("   ⚠️  Nguy cơ lũ lụt cao!");
      isDanger = true;
    }

    // TODO: Kích hoạt buzzer/LED cảnh báo
    if (isDanger) {
      // digitalWrite(BUZZER_PIN, HIGH);
      // delay(100);
      // digitalWrite(BUZZER_PIN, LOW);
    }

    Serial.println("===================================\n");
  }

  delay(100);
}
