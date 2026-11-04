"""YANTRIX A4 Flask dashboard entry point."""
from flask import request, jsonify
from collections import deque
from datetime import datetime
from pathlib import Path
import csv
import threading

from flask import Flask, jsonify, render_template, request

BASE_DIR = Path(__file__).resolve().parent
PRODUCTS_FILE = BASE_DIR / "data" / "products.csv"

app = Flask(__name__)
_lock = threading.Lock()
_events = deque(maxlen=100)
_history = deque(maxlen=60)

_state = {
    "connected": False,
    "front_distance": None,
    "rear_distance": None,
    "temperature": None,
    "humidity": None,
    "front_ir": None,
    "rear_ir": None,
    "motor_status": "STOP",
    "robot_mode": "IDLE",
    "speed": 0,
    "battery_voltage": None,
    "wifi_dbm": None,
}
_command_state = {
    "command": "STOP",
    "seq": 0
}


def add_event(message: str, level: str = "info") -> None:
    """Add a timestamped message to the activity log."""
    with _lock:
        _events.appendleft({
            "time": datetime.now().strftime("%H:%M:%S"),
            "message": message,
            "level": level,
        })


def read_products() -> list[dict]:
    """Read product inventory from CSV; return an empty list if unavailable."""
    try:
        with PRODUCTS_FILE.open("r", newline="", encoding="utf-8-sig") as file:
            return list(csv.DictReader(file))
    except (OSError, csv.Error):
        return []


@app.get("/")
def dashboard():
    return render_template("dashboard.html")


@app.get("/api/status")
def api_status():
    with _lock:
        result = dict(_state)
        result["history"] = list(_history)
        result["events"] = list(_events)
    result["product_count"] = len(read_products())
    return jsonify(result)


@app.post("/api/telemetry")
def api_telemetry():
    """Receive JSON sensor data posted by the ESP32."""
    payload = request.get_json(silent=True) or {}
    allowed_keys = set(_state) - {"connected"}

    with _lock:
        for key, value in payload.items():
            if key in allowed_keys:
                _state[key] = value
        _state["connected"] = True
        _history.append({
            "time": datetime.now().strftime("%H:%M:%S"),
            "front_distance": _state["front_distance"],
            "rear_distance": _state["rear_distance"],
            "temperature": _state["temperature"],
            "humidity": _state["humidity"],
            "speed": _state["speed"],
        })

    if payload.get("front_ir") in (True, 1, "1", "true"):
        add_event("Front IR obstacle detected", "warning")
    if payload.get("rear_ir") in (True, 1, "1", "true"):
        add_event("Rear IR obstacle detected", "warning")
    return jsonify({"ok": True})


@app.get("/api/products")
def api_products():
    query = request.args.get("q", "").strip().lower()
    rows = read_products()
    if query:
        rows = [
            product for product in rows
            if any(query in str(value).lower() for value in product.values())
        ]
    return jsonify(rows[:100])


@app.post("/api/scan")
def api_scan():
    """Match a typed/scanned SKU or barcode against products.csv."""
    payload = request.get_json(silent=True) or {}
    code = str(payload.get("code", "")).strip()
    if not code:
        return jsonify({"ok": False, "error": "Enter a barcode or SKU."}), 400

    match = next(
        (
            product for product in read_products()
            if code.lower() in {
                str(product.get("sku", "")).lower(),
                str(product.get("barcode", "")).lower(),
                str(product.get("product_id", "")).lower(),
            }
        ),
        None,
    )
    add_event(
        f"{'SKU matched: ' if match else 'Code not in catalog: '}{code}",
        "success" if match else "warning",
    )
    return jsonify({"ok": True, "code": code, "product": match})


@app.post("/api/detection")
def api_detection():
    """Log a detection event posted by the vision process or dashboard form."""
    payload = request.get_json(silent=True) or {}
    label = str(payload.get("label", "Unknown object"))
    confidence = payload.get("confidence")
    try:
        confidence_text = f" ({float(confidence):.0%})" if confidence is not None else ""
    except (TypeError, ValueError):
        confidence_text = ""
    add_event(f"Object detected: {label}{confidence_text}", "success")
    return jsonify({"ok": True})
@app.route("/api/command", methods=["GET", "POST"])
def api_command():
    if request.method == "GET":
        with _lock:
            return jsonify(_command_state.copy())

    payload = request.get_json(silent=True) or {}
    command = str(payload.get("command", "")).upper()

    valid_commands = {
        "FORWARD", "BACKWARD", "LEFT",
        "RIGHT", "STOP", "AUTO"
    }

    if command not in valid_commands:
        return jsonify({"ok": False, "error": "Invalid command"}), 400

    with _lock:
        _command_state["command"] = command
        _command_state["seq"] += 1

    add_event(f"Robot command sent: {command}")

    return jsonify({
        "ok": True,
        "command": command,
        "seq": _command_state["seq"]
    })



@app.post("/api/events/clear")
def api_clear_events():
    with _lock:
        _events.clear()
    return jsonify({"ok": True})


if __name__ == "__main__":
    add_event("YANTRIX A4 dashboard started", "success")
    app.run(host="0.0.0.0", port=5000, debug=False)
