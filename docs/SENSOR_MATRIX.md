# Sensor / Component Support Matrix

Registry: `www/blocklyduino/components_registry.json`. Blocks: `www/blocklyduino/blocks/esp/esp_sensors.js`. Generators: `www/blocklyduino/arduino/esp/esp_sensors.js`.

| Component | Status | Blocks | Library | Boards |
|---|---|---|---|---|
| Standard LED | supported | robosiddhi_led_set | — | all ESP |
| RGB LED | supported | robosiddhi_rgb_set | — | ESP32 family (PWM) |
| Buzzer | supported | robosiddhi_buzzer | — | all ESP |
| DHT11 | supported | robosiddhi_dht_read | DHT sensor lib + Adafruit Unified Sensor | all ESP |
| DHT22 | supported | robosiddhi_dht_read | same | all ESP |
| HC-SR04 | supported | robosiddhi_hcsr04 | — (pulseIn) | all ESP. ECHO 5V → divider to 3.3V |
| PIR HC-SR501 | supported | robosiddhi_pir_read | — | all ESP |
| LDR analog | supported | robosiddhi_ldr_read | — | all ESP (A0 on 8266) |
| Soil analog/capacitive | supported | robosiddhi_soil_read | — | all ESP (A0 on 8266) |
| DS18B20 | supported | ds18b20_* (legacy) | OneWire + DallasTemperature | all ESP |
| Servo SG90 | supported | servo_* (legacy) | ESP32Servo / Servo | all ESP, separate 5V |
| Relay module | supported | RELAY_* (legacy) | — | all ESP. Mains only by qualified person |
| MPU6050 | planned | — | MPU6050 / Adafruit MPU6050 | pin-compatible, blocks TBD |
| OLED SSD1306 I2C | planned | — | Adafruit SSD1306 + GFX | TBD |
| LCD1602 I2C | planned | — | LiquidCrystal_I2C | TBD |
| DC motor L298N | planned | — | — | TBD |
| Wi-Fi/HTTP/MQTT | planned | — | WiFi / PubSubClient | TBD (ADC2 note) |

Planned = shown as Coming Soon, no fake blocks.
