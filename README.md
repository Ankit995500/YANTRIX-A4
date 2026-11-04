# YANTRIX A4 — Organized Dashboard Code

## Folder structure

```text
YANTRIX_A4_Organized_Code/
├── app.py
├── requirements.txt
├── README.md
├── .gitignore
├── data/
│   └── products.csv
├── templates/
│   └── dashboard.html
└── static/
    ├── css/
    │   └── style.css
    └── js/
        └── dashboard.js
```

## Run on Windows / VS Code

1. Extract this folder and open it in VS Code.
2. Open Terminal in this folder.
3. Install dependency:
   ```bash
   py -m pip install -r requirements.txt
   ```
4. Start the dashboard:
   ```bash
   py app.py
   ```
5. On the laptop open `http://127.0.0.1:5000`.
6. To open from a phone on the same Wi-Fi, use the laptop's LAN IP, for example `http://192.168.1.44:5000`.

## Included features

- Responsive YANTRIX A4 dashboard
- Flask status API and activity log
- Sensor cards and charts (chart data comes from ESP32 telemetry)
- Laptop webcam preview
- Manual object-detection event logging
- SKU/barcode lookup from `data/products.csv`
- Product search
- Camera barcode scanning when browser `BarcodeDetector` is supported
- Robot command request buttons (logging only)

## Important integration notes

- Webcam preview does **not** itself run YOLO. To enable automatic detection, integrate the existing `ai_detection.py` and the correct `.pt` model with this Flask project.
- If you already have `ai_detection.py`, `barcode_test.py`, `camera_test.py`, `product_lookup.py`, and `.pt` model files, keep them. Copy them into this project only after making a backup; they are not overwritten by this starter package.
- For live sensor charts, the ESP32 must POST JSON to `http://LAPTOP_IP:5000/api/telemetry`. Example payload:
  ```json
  {
    "front_distance": 42,
    "rear_distance": 86,
    "temperature": 24.6,
    "humidity": 58,
    "front_ir": false,
    "rear_ir": false,
    "motor_status": "STOP",
    "robot_mode": "AUTO",
    "speed": 0,
    "battery_voltage": 11.8,
    "wifi_dbm": -52
  }
  ```
  Use the laptop's LAN IP in ESP32 code, not `127.0.0.1`.
- Product barcode matching uses `sku`, `barcode`, or `product_id` columns. Replace sample rows with your real products.
- The robot control buttons do not move the robot until a tested ESP32 command bridge is implemented. Add a physical emergency stop before enabling motor control.
- Camera permissions usually require `localhost` or HTTPS.
