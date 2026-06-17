"""Edge unit configuration. Reads from environment / .env, with sensible defaults."""
import os
from dotenv import load_dotenv

load_dotenv()

MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))

EDGE_FPS = float(os.getenv("EDGE_FPS", "2"))
# Lower frame rate when the room is reported empty, to save CPU (book §4.2).
IDLE_FPS = float(os.getenv("EDGE_IDLE_FPS", "0.2"))

PERSON_CONF_THRESHOLD = float(os.getenv("PERSON_CONF_THRESHOLD", "0.5"))
ANOMALY_CONF_THRESHOLD = float(os.getenv("ANOMALY_CONF_THRESHOLD", "0.6"))

# Heartbeat interval (seconds) so the server knows the unit is alive (book §4.5.1).
HEARTBEAT_SECONDS = int(os.getenv("HEARTBEAT_SECONDS", "15"))

# Model weight locations (relative to repo root /models).
YOLO_WEIGHTS = os.getenv("YOLO_WEIGHTS", "../models/yolov5n.pt")
ANOMALY_WEIGHTS = os.getenv("ANOMALY_WEIGHTS", "../models/anomaly_mobilenet.pth")


def topic(building: str, room: str, leaf: str) -> str:
    """Hierarchical topic structure from book §4.5.1: /campus/{building}/{room}/{leaf}."""
    return f"campus/{building}/{room}/{leaf}"
