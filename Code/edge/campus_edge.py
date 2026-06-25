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
    def __init__(self, building: str, room: str, simulate: bool = False,
                 preview: bool = False):
        self.building = building
        self.room = room
        self.simulate = simulate
        self.preview = preview           # draw a local window of what the camera sees
        self.relay = SimulatedRelay()
        self.last_count = -1             # last count actually published
        self.last_boxes = []             # most recent person boxes, for --preview only
        self._pending_count = -1         # candidate count awaiting confirmation
        self._pending_streak = 0         # consecutive frames the candidate has held
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
            dev = self.counter.device if self.counter.backend == "yolo" else "cpu"
            log.info("CV backends: people=%s (%s) anomaly=%s",
                     self.counter.backend, dev, self.anomaly.backend)

    # ---- MQTT plumbing ----
    def _on_connect(self, client, userdata, flags, rc):
        relay_topic = config.topic(self.building, self.room, "relay")
        client.subscribe(relay_topic)
        log.info("Connected to broker, subscribed to %s", relay_topic)

    def _on_message(self, client, userdata, msg):
        """Server publishes power on/off commands on the relay topic.

        We subscribe to the same relay topic we echo our confirmed state on, so we
        MUST ignore our own echoes — otherwise the echo (which has no "on" key) gets
        re-read as a command, re-echoed, and ping-pongs into a message storm.
        Commands carry {"on": bool}; state echoes carry {"state": bool}.
        """
        try:
            payload = json.loads(msg.payload.decode())
            if "on" not in payload:
                return  # state echo (or anything that isn't a command) — ignore
            self.relay.set(bool(payload["on"]))
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
        self.last_boxes = self.counter.detect_boxes(frame)
        count = len(self.last_boxes)

        # Debounce: a count must hold for OCCUPANCY_CONFIRM_FRAMES consecutive
        # frames before we publish it, so a one-frame detection dropout doesn't
        # flap the dashboard between 0 and 1.
        if count == self._pending_count:
            self._pending_streak += 1
        else:
            self._pending_count = count
            self._pending_streak = 1
        if (self._pending_streak >= config.OCCUPANCY_CONFIRM_FRAMES
                and count != self.last_count):
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

    WINDOW = "Campus-Sense camera (press q to close)"

    def _draw_preview(self, cv2, frame):
        """Render what the camera sees: person boxes + live count overlay.

        Local debug view only — these pixels never leave the machine (NFR3).
        """
        for (x, y, w, h) in self.last_boxes:
            cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
        label = f"{self.building}/{self.room}   people={len(self.last_boxes)}   [{self.counter.backend}]"
        cv2.putText(frame, label, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.putText(frame, "preview only - not published. press q to close.", (10, 54),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        cv2.imshow(self.WINDOW, frame)

    def _run_camera(self):
        import cv2
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            raise RuntimeError("Could not open webcam. Use --simulate to run without one.")
        if self.preview:
            log.info("Preview window enabled — focus it and press q to close.")
        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    log.error("Camera read failed")
                    break
                self._process_frame(frame)
                if self.preview:
                    self._draw_preview(cv2, frame)
                    if (cv2.waitKey(1) & 0xFF) == ord("q"):
                        log.info("Preview closed by user")
                        break
                    # Preview wants a smooth feed, so detect every frame at camera
                    # rate instead of throttling to the energy-saving 2 fps.
                    continue
                fps = config.EDGE_FPS if self.last_count > 0 else config.IDLE_FPS
                time.sleep(1.0 / fps)
        finally:
            cap.release()
            if self.preview:
                cv2.destroyAllWindows()

    def _run_simulated(self):
        """Publish a synthetic occupancy pattern so the whole pipeline can be demoed.

        Occupancy only — no synthetic anomalies (the anomaly model is not trained yet).
        """
        pattern = [3, 3, 3, 2, 1, 0, 0, 0, 0, 0, 0]  # room empties out then stays empty
        i = 0
        while True:
            count = pattern[min(i, len(pattern) - 1)]
            if count != self.last_count:
                self._publish("occupancy", {"count": count})
                self.last_count = count
                log.info("[SIM] occupancy=%d", count)
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
    ap.add_argument("--preview", action="store_true",
                    help="Open a local window showing the live camera + detection boxes")
    args = ap.parse_args()
    EdgeUnit(args.building, args.room, simulate=args.simulate,
             preview=args.preview).start()


if __name__ == "__main__":
    main()
