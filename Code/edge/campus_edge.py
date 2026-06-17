"""Campus-Sense edge unit (book §5.2).

Top-level loop: capture a frame, run the two CV pipelines (people counting + anomaly),
publish results over MQTT, then sleep until the next iteration. The MQTT client runs in
its own thread so incoming relay commands are not blocked by image processing.

Usage:
    python campus_edge.py --room 301 --building ficus
    python campus_edge.py --room 301 --building ficus --simulate   # no webcam needed

Privacy (NFR3): frames live in memory only; we publish counts and flags, never images.
"""
import argparse
import json
import logging
import threading
import time

import paho.mqtt.client as mqtt

import config
from relay import SimulatedRelay

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
log = logging.getLogger("edge")


class EdgeUnit:
    def __init__(self, building: str, room: str, simulate: bool = False):
        self.building = building
        self.room = room
        self.simulate = simulate
        self.relay = SimulatedRelay()
        self.last_count = -1
        self.anomaly_streak = 0          # consecutive-frame filter (book §5.2.2)
        self.last_anomaly_cls = None

        # MQTT
        self.client = mqtt.Client(client_id=f"edge-{building}-{room}")
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message

        # CV pipelines (lazy import so --simulate works without torch/opencv installed)
        self.counter = None
        self.anomaly = None
        if not simulate:
            from pipelines import PeopleCounter, AnomalyDetector
            self.counter = PeopleCounter()
            self.anomaly = AnomalyDetector()
            log.info("CV backends: people=%s anomaly=%s",
                     self.counter.backend, self.anomaly.backend)

    # ---- MQTT plumbing ----
    def _on_connect(self, client, userdata, flags, rc):
        relay_topic = config.topic(self.building, self.room, "relay")
        client.subscribe(relay_topic)
        log.info("Connected to broker, subscribed to %s", relay_topic)

    def _on_message(self, client, userdata, msg):
        """Server publishes power on/off commands on the relay topic."""
        try:
            payload = json.loads(msg.payload.decode())
            want_on = bool(payload.get("on", True))
            self.relay.set(want_on)
            # Confirm by echoing the new relay state (book §4.2).
            self._publish("relay", {"state": self.relay.state})
        except Exception as e:  # noqa: BLE001
            log.warning("Bad relay command: %s", e)

    def _publish(self, leaf: str, payload: dict):
        self.client.publish(config.topic(self.building, self.room, leaf), json.dumps(payload))

    # ---- background heartbeat ----
    def _heartbeat_loop(self):
        while True:
            self._publish("heartbeat", {"ts": time.time()})
            time.sleep(config.HEARTBEAT_SECONDS)

    # ---- main processing ----
    def _process_frame(self, frame):
        count = self.counter.count(frame)
        if count != self.last_count:
            self._publish("occupancy", {"count": count})
            self.last_count = count
            log.info("occupancy=%d", count)

        result = self.anomaly.detect(frame)
        if result is not None:
            cls, conf = result
            # Only alert after the SAME anomaly in two consecutive frames (book §5.2.2).
            if cls == self.last_anomaly_cls:
                self.anomaly_streak += 1
            else:
                self.anomaly_streak = 1
                self.last_anomaly_cls = cls
            if self.anomaly_streak == 2:
                self._publish("anomaly", {"class": cls, "conf": round(conf, 3)})
                log.info("ANOMALY %s (%.2f)", cls, conf)
        else:
            self.anomaly_streak = 0
            self.last_anomaly_cls = None

    def _run_camera(self):
        import cv2
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            raise RuntimeError("Could not open webcam. Use --simulate to run without one.")
        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    log.error("Camera read failed")
                    break
                self._process_frame(frame)
                fps = config.EDGE_FPS if self.last_count > 0 else config.IDLE_FPS
                time.sleep(1.0 / fps)
        finally:
            cap.release()

    def _run_simulated(self):
        """Publish a synthetic occupancy pattern so the whole pipeline can be demoed."""
        import random
        pattern = [3, 3, 3, 2, 1, 0, 0, 0, 0, 0, 0]  # room empties out then stays empty
        i = 0
        while True:
            count = pattern[min(i, len(pattern) - 1)]
            if count != self.last_count:
                self._publish("occupancy", {"count": count})
                self.last_count = count
                log.info("[SIM] occupancy=%d", count)
            # occasionally simulate a spill once the room is empty
            if count == 0 and random.random() < 0.15:
                self._publish("anomaly", {"class": "liquid_spill", "conf": 0.83})
                log.info("[SIM] ANOMALY liquid_spill")
            i += 1
            time.sleep(2.0)

    def start(self):
        self.client.connect(config.MQTT_HOST, config.MQTT_PORT, keepalive=60)
        self.client.loop_start()
        threading.Thread(target=self._heartbeat_loop, daemon=True).start()
        log.info("Edge unit %s/%s started (simulate=%s)", self.building, self.room, self.simulate)
        try:
            if self.simulate:
                self._run_simulated()
            else:
                self._run_camera()
        except KeyboardInterrupt:
            log.info("Shutting down")
        finally:
            self.client.loop_stop()
            self.client.disconnect()


def main():
    ap = argparse.ArgumentParser(description="Campus-Sense edge unit")
    ap.add_argument("--building", default="ficus")
    ap.add_argument("--room", default="301")
    ap.add_argument("--simulate", action="store_true",
                    help="Run without a webcam / CV models (publishes synthetic data)")
    args = ap.parse_args()
    EdgeUnit(args.building, args.room, simulate=args.simulate).start()


if __name__ == "__main__":
    main()
