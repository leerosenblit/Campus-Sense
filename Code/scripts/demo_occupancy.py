"""Tiny demo helper: pretend a room fills up, then empties.

Publishes occupancy over MQTT so you can watch a room go
OCCUPIED (green) -> EMPTY_POWER_OFF (blue) on the dashboard,
without needing a webcam.

Usage (from the repo root, with the broker running):
    python scripts/demo_occupancy.py                 # uses room ficus-302
    python scripts/demo_occupancy.py ficus-301 5     # room ficus-301, 5 people
"""
import json
import sys
import time

import paho.mqtt.client as mqtt

room = sys.argv[1] if len(sys.argv) > 1 else "ficus-302"
people = int(sys.argv[2]) if len(sys.argv) > 2 else 4
building, number = room.split("-", 1)
topic = f"campus/{building}/{number}/occupancy"

c = mqtt.Client(client_id="demo-occupancy")
c.connect("localhost", 1883, 60)
c.loop_start()

print(f"Room {room}: {people} people walk in...")
c.publish(topic, json.dumps({"count": people}))
time.sleep(3)

print(f"Room {room}: everybody leaves (count = 0)...")
c.publish(topic, json.dumps({"count": 0}))
time.sleep(2)

print("Done. Watch the dashboard: the room should turn blue (EMPTY_POWER_OFF)")
print("within ~10s (engine tick). If it stays green, the engine isn't running.")
c.loop_stop()
c.disconnect()
