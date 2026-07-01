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
                 preview: bool = False, debug_spill: bool = False):
        self.building = building
        self.room = room
        self.simulate = simulate
        self.preview = preview           # draw a local window of what the camera sees
        self.debug_spill = debug_spill   # save flagged spill regions to debug/anomaly/
        self.relay = SimulatedRelay()
        self.last_count = -1             # last count actually published
        self.last_boxes = []             # most recent person boxes, for --preview only
        self.last_item_boxes = []        # [(name, (x,y,w,h))] personal items, for --preview
        self.last_spill_box = None       # (x,y,w,h) strongest spill, for --preview
        self._pending_count = -1         # candidate count awaiting confirmation
        self._pending_streak = 0         # consecutive frames the candidate has held
        # Anomaly (spill) detection — same wall-clock hysteresis as forgotten items,
        # so a flickering detector raises ONE alert per episode (not one per frame).
        self._anomaly_cls = None
        self._anomaly_active = False         # have we announced this spill episode?
        self._anomaly_first_seen = None      # appear timer
        self._anomaly_last_seen = None       # clear timer
        # Forgotten-item detection (Use Case D), only active while the room is empty.
        # Wall-clock hysteresis (robust to frame rate & flaky detections):
        self._forgotten_item = None          # item type currently tracked
        self._forgotten_present = False      # have we announced present=True?
        self._forgotten_first_seen = None    # when this item was first seen (appear timer)
        self._forgotten_last_seen = None     # when it was most recently seen (clear timer)
        self._last_person_ts = time.time()   # last time a person was seen (empty-room settle timer)

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
            self.anomaly = AnomalyDetector(debug_dir="debug/anomaly" if debug_spill else None)
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
        if count > 0:
            self._last_person_ts = time.time()  # for the "person seen recently" gate

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

        self._detect_forgotten_item(frame)
        self._detect_anomaly(frame)

    def _detect_anomaly(self, frame):
        """Spill detection with wall-clock hysteresis (mirrors _detect_forgotten_item).

        Publish ONE anomaly when a spill has been visible for ANOMALY_APPEAR_SECONDS,
        and don't publish again until it's been UNSEEN for ANOMALY_CLEAR_SECONDS. This
        stops a flaky detector from spamming dozens of identical alerts per second.
        Confidence gating (ignore < ANOMALY_CONF_THRESHOLD) happens inside detect().
        """
        now = time.time()
        result = self.anomaly.detect(frame)
        self.last_spill_box = result[2] if result is not None else None  # for --preview

        if result is not None:
            cls, conf, _box = result
            if cls != self._anomaly_cls:            # different anomaly -> restart appear timer
                self._anomaly_cls = cls
                self._anomaly_first_seen = now
            self._anomaly_last_seen = now
            if (not self._anomaly_active
                    and now - self._anomaly_first_seen >= config.ANOMALY_APPEAR_SECONDS):
                self._publish("anomaly", {"class": cls, "conf": round(conf, 3)})
                self._anomaly_active = True
                log.info("ANOMALY %s (%.2f)", cls, conf)
            return

        # Nothing detected this frame.
        if self._anomaly_last_seen is None:
            return
        if now - self._anomaly_last_seen < config.ANOMALY_CLEAR_SECONDS:
            return  # brief gap — treat as still present, don't reset
        if self._anomaly_active:
            log.info("anomaly cleared (unseen %.0fs)", now - self._anomaly_last_seen)
        self._anomaly_cls = None                    # reset so a genuinely new spill can alert
        self._anomaly_active = False
        self._anomaly_first_seen = None
        self._anomaly_last_seen = None

    def _detect_forgotten_item(self, frame):
        """Use Case D: a personal item left behind in an EMPTY room.

        Wall-clock hysteresis, so it's stable regardless of frame rate or a flaky
        detector: announce an item only after it has been visible for
        FORGOTTEN_APPEAR_SECONDS, and announce it gone only after it has been UNSEEN
        for FORGOTTEN_CLEAR_SECONDS. Brief detection dips inside those windows are
        ignored (a still-present bag is never cleared; a one-frame blip never alerts).
        While the room is occupied we can't see the floor, so we FREEZE the timers —
        a person passing through never clears a still-present item. Privacy (NFR3):
        we publish the item TYPE only.
        """
        now = time.time()

        # Runs EVERY frame (not gated on occupancy): we always track whether the item
        # is still visible so the clear timer is independent of people being present.
        items = self.counter.detect_items(frame, conf=config.FORGOTTEN_CONF_THRESHOLD)
        self.last_item_boxes = [(n, box) for (n, _c, box) in items]  # for --preview
        top = max(items, key=lambda it: it[1]) if items else None

        if top is not None:
            name, conf, _box = top
            if name != self._forgotten_item:      # a different item -> restart the appear timer
                self._forgotten_item = name
                self._forgotten_first_seen = now
            self._forgotten_last_seen = now
            # CREATE only once the item has been visible for APPEAR seconds AND the room
            # has been empty (no person spotted) for FORGOTTEN_EMPTY_SECONDS — a settle
            # timer, so a new item is never raised while people are around.
            room_empty_long_enough = now - self._last_person_ts >= config.FORGOTTEN_EMPTY_SECONDS
            if (not self._forgotten_present
                    and now - self._forgotten_first_seen >= config.FORGOTTEN_APPEAR_SECONDS
                    and room_empty_long_enough):
                self._publish("forgotten", {"item": name, "conf": round(conf, 3), "present": True})
                self._forgotten_present = True
                log.info("FORGOTTEN ITEM %s (%.2f)", name, conf)
            return

        # Item not seen this frame. CLEAR after FORGOTTEN_CLEAR_SECONDS unseen — checked
        # regardless of occupancy (does not depend on the room being empty).
        if self._forgotten_last_seen is None:
            return  # nothing being tracked
        if now - self._forgotten_last_seen < config.FORGOTTEN_CLEAR_SECONDS:
            return  # still inside the grace window -> treat as still present
        if self._forgotten_present:
            self._publish("forgotten", {"present": False})
            log.info("forgotten item cleared (unseen %.0fs)", now - self._forgotten_last_seen)
        self._forgotten_item = None          # reset the episode
        self._forgotten_present = False
        self._forgotten_first_seen = None
        self._forgotten_last_seen = None

    WINDOW = "Campus-Sense camera (press q to close)"

    # Preview box colours (OpenCV uses BGR). Distinct per detection type.
    _C_PERSON = (0, 255, 0)     # green
    _C_ITEM = (0, 165, 255)     # amber/orange — forgotten-item candidates
    _C_SPILL = (0, 0, 255)      # red — spills

    def _draw_preview(self, cv2, frame):
        """Render what the camera sees: colour-coded boxes for people, personal items
        and spills, plus a live overlay. Local debug view only (NFR3).
        """
        for (x, y, w, h) in self.last_boxes:                       # people -> green
            cv2.rectangle(frame, (x, y), (x + w, y + h), self._C_PERSON, 2)
        for name, (x, y, w, h) in self.last_item_boxes:            # items -> amber
            cv2.rectangle(frame, (x, y), (x + w, y + h), self._C_ITEM, 2)
            cv2.putText(frame, name, (x, max(14, y - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, self._C_ITEM, 2)
        if self.last_spill_box is not None:                        # spill -> red
            x, y, w, h = self.last_spill_box
            cv2.rectangle(frame, (x, y), (x + w, y + h), self._C_SPILL, 2)
            cv2.putText(frame, "spill", (x, max(14, y - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, self._C_SPILL, 2)
        label = f"{self.building}/{self.room}   people={len(self.last_boxes)}   [{self.counter.backend}]"
        cv2.putText(frame, label, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, self._C_PERSON, 2)
        cv2.putText(frame, "green=people  amber=item  red=spill   |  press q to close", (10, 54),
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
    ap.add_argument("--debug-spill", action="store_true",
                    help="Save each region flagged as a spill to debug/anomaly/ for inspection")
    args = ap.parse_args()
    EdgeUnit(args.building, args.room, simulate=args.simulate,
             preview=args.preview, debug_spill=args.debug_spill).start()


if __name__ == "__main__":
    main()
