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
# Report a new occupancy count only after it holds for this many consecutive
# frames. Filters single-frame YOLO dropouts that otherwise flap the count (and
# thus the dashboard) between e.g. 0 and 1.
OCCUPANCY_CONFIRM_FRAMES = int(os.getenv("OCCUPANCY_CONFIRM_FRAMES", "3"))
ANOMALY_CONF_THRESHOLD = float(os.getenv("ANOMALY_CONF_THRESHOLD", "0.6"))

# Forgotten-item detection (Use Case D). Only runs when the room is empty: a personal
# item (bag/laptop/bottle/…) must be seen for this many consecutive frames before we
# raise a "forgotten item" alert, filtering momentary false detections.
FORGOTTEN_CONF_THRESHOLD = float(os.getenv("FORGOTTEN_CONF_THRESHOLD", "0.4"))
FORGOTTEN_CONFIRM_FRAMES = int(os.getenv("FORGOTTEN_CONFIRM_FRAMES", "3"))

# Heartbeat interval (seconds) so the server knows the unit is alive (book §4.5.1).
HEARTBEAT_SECONDS = int(os.getenv("HEARTBEAT_SECONDS", "15"))

# Model weight locations. Resolved ABSOLUTELY relative to this file (Code/edge/config.py)
# so they work no matter which directory you launch from. Models live in Code/models/.
_MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
YOLO_WEIGHTS = os.getenv("YOLO_WEIGHTS", os.path.join(_MODELS_DIR, "yolov8n.pt"))
# Spill detector (YOLOv8 fine-tuned on spills). Absent -> anomaly detection disabled.
SPILL_WEIGHTS = os.getenv("SPILL_WEIGHTS", os.path.join(_MODELS_DIR, "spill_yolo.pt"))

# Inference device: "auto" picks the Metal GPU (mps) on Apple Silicon, else CPU.
# Override with YOLO_DEVICE=cpu|mps|cuda:0. imgsz trades accuracy for speed.
YOLO_DEVICE = os.getenv("YOLO_DEVICE", "auto")
YOLO_IMGSZ = int(os.getenv("YOLO_IMGSZ", "480"))
SPILL_IMGSZ = int(os.getenv("SPILL_IMGSZ", "640"))  # higher res helps catch small spills


def topic(building: str, room: str, leaf: str) -> str:
    """Hierarchical topic structure from book §4.5.1: /campus/{building}/{room}/{leaf}."""
    return f"campus/{building}/{room}/{leaf}"
