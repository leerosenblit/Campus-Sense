"""Campus-Sense decision engine (book §4.3.2, §5.3.1).

Subscribes to all room MQTT topics, persists every event via the API's internal
endpoint, runs the per-room state machine, and publishes relay commands. A periodic
scheduler tick evaluates the energy power-off rule for every room.

Anomaly routing (book §4.3.2): spills/objects -> cleaning ticket; broken equipment
would go to the IT queue (the QR form covers equipment in this prototype).
"""
import json
import logging
import os

import paho.mqtt.client as mqtt
import requests
from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv

import state_machine as sm

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s engine %(message)s")
log = logging.getLogger("engine")

MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
API_BASE = os.getenv("API_BASE", "http://localhost:4000")
EMPTY_MINUTES = int(os.getenv("EMPTY_MINUTES_BEFORE_OFF", "10"))
LOOKAHEAD_MIN = int(os.getenv("SCHEDULE_LOOKAHEAD_MINUTES", "15"))

ANOMALY_TO_TICKET = {
    "liquid_spill": "spill",
    "fallen_object": "fallen_object",
}


class Engine:
    def __init__(self):
        self.rooms: dict[str, sm.RoomState] = {}
        self.client = mqtt.Client(client_id="decision-engine")
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.scheduler = BackgroundScheduler()

    # ---- helpers ----
    def _room(self, room_id: str) -> sm.RoomState:
        if room_id not in self.rooms:
            self.rooms[room_id] = sm.RoomState(room_id=room_id)
        return self.rooms[room_id]

    @staticmethod
    def _parse_topic(topic: str):
        # campus/{building}/{room}/{leaf}
        parts = topic.split("/")
        if len(parts) != 4 or parts[0] != "campus":
            return None
        _, building, room, leaf = parts
        return f"{building}-{room}", building, room, leaf

    def _publish_relay(self, building: str, room: str, on: bool):
        topic = f"campus/{building}/{room}/relay"
        self.client.publish(topic, json.dumps({"on": on}))
        log.info("relay command %s -> %s", topic, "ON" if on else "OFF")

    def _post(self, path: str, payload: dict):
        try:
            requests.post(f"{API_BASE}{path}", json=payload, timeout=3)
        except requests.RequestException as e:
            log.warning("API post %s failed: %s", path, e)

    def _persist_event(self, room_id, etype, value):
        self._post("/internal/events", {"room_id": room_id, "type": etype, "value": value})

    def _report_state(self, st: sm.RoomState):
        self._post("/internal/room-state", {
            "room_id": st.room_id, "status": st.status,
            "occupancy": st.occupancy, "systems_on": st.systems_on,
        })

    def _create_ticket(self, room_id, anomaly_cls, conf):
        ttype = ANOMALY_TO_TICKET.get(anomaly_cls, "other")
        self._post("/tickets", {
            "room_id": room_id, "type": ttype, "source": "anomaly", "confidence": conf,
        })
        log.info("ticket created from anomaly %s in %s", anomaly_cls, room_id)

    # ---- MQTT ----
    def _on_connect(self, client, userdata, flags, rc):
        client.subscribe("campus/+/+/occupancy")
        client.subscribe("campus/+/+/anomaly")
        client.subscribe("campus/+/+/relay")
        client.subscribe("campus/+/+/heartbeat")
        log.info("connected to broker, subscribed to campus topics")

    def _on_message(self, client, userdata, msg):
        parsed = self._parse_topic(msg.topic)
        if not parsed:
            return
        room_id, building, room, leaf = parsed
        try:
            payload = json.loads(msg.payload.decode())
        except json.JSONDecodeError:
            return
        st = self._room(room_id)

        if leaf == "occupancy":
            self._persist_event(room_id, "occupancy", payload)
            cmds = st.on_occupancy(int(payload.get("count", 0)), EMPTY_MINUTES)
            for kind, val in cmds:
                if kind == "relay":
                    self._publish_relay(building, room, val)
            self._report_state(st)

        elif leaf == "anomaly":
            self._persist_event(room_id, "anomaly", payload)
            is_new_alert = st.on_anomaly()
            if is_new_alert:  # one ticket per hazard episode, not per frame
                self._create_ticket(room_id, payload.get("class"), payload.get("conf"))
            self._report_state(st)

        elif leaf == "relay":
            # device echoing its confirmed state
            self._persist_event(room_id, "relay", payload)

        elif leaf == "heartbeat":
            self._persist_event(room_id, "heartbeat", payload)

    # ---- periodic evaluation (energy rule) ----
    def _tick(self):
        for st in list(self.rooms.values()):
            # Schedule integration (FR2) is a Sprint-3 task; for now no class is assumed.
            class_active, class_soon = False, False
            building, room = st.room_id.split("-", 1)
            cmds = st.evaluate(EMPTY_MINUTES, class_active, class_soon)
            for kind, val in cmds:
                if kind == "relay":
                    self._publish_relay(building, room, val)
                    self._report_state(st)

    def start(self):
        self.client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
        self.scheduler.add_job(self._tick, "interval", seconds=10)
        self.scheduler.start()
        log.info("decision engine started (empty=%dmin, lookahead=%dmin)",
                 EMPTY_MINUTES, LOOKAHEAD_MIN)
        self.client.loop_forever()


if __name__ == "__main__":
    Engine().start()
