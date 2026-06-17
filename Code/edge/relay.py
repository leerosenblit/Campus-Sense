"""Simulated smart relay (book §5.2.3).

On real hardware this would drive a Sonoff S31 running Tasmota over its local MQTT/HTTP
API. Since this build is laptop-only, we simulate: the relay just tracks state and the
caller echoes the new state back to the server, exactly like the real device confirms.
"""
import logging

log = logging.getLogger("relay")


class SimulatedRelay:
    def __init__(self, initial_on: bool = True):
        self.is_on = initial_on

    def set(self, on: bool) -> bool:
        self.is_on = on
        log.info("[RELAY] -> %s (simulated)", "ON" if on else "OFF")
        return self.is_on

    @property
    def state(self) -> str:
        return "on" if self.is_on else "off"
