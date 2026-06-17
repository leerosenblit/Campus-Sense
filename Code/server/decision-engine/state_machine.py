"""Per-room state machine (book §5.3.1, §5.6.3).

States: OCCUPIED, RECENTLY_EMPTY, EMPTY_POWER_OFF, ALERT_ACTIVE.

Energy power-off rule — ALL must hold (book §5.6.3):
  1. occupancy has been zero for >= EMPTY_MINUTES_BEFORE_OFF
  2. no class currently active
  3. no class starting within SCHEDULE_LOOKAHEAD_MINUTES
  4. room not in ALERT_ACTIVE
  5. room not whitelisted (e.g. evening-exit hallways)
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field

OCCUPIED = "OCCUPIED"
RECENTLY_EMPTY = "RECENTLY_EMPTY"
EMPTY_POWER_OFF = "EMPTY_POWER_OFF"
ALERT_ACTIVE = "ALERT_ACTIVE"


@dataclass
class RoomState:
    room_id: str
    is_whitelisted: bool = False
    status: str = "unknown"
    occupancy: int = 0
    systems_on: bool = True
    empty_since: float | None = None
    alert_active: bool = False
    _now = staticmethod(time.time)

    # ---- event handlers; each returns a list of side-effect commands ----

    def on_occupancy(self, count: int, empty_minutes: int):
        cmds = []
        self.occupancy = count
        if count > 0:
            self.empty_since = None
            self.alert_active = False
            if not self.systems_on:
                cmds.append(("relay", True))   # turn systems back on
                self.systems_on = True
            self.status = OCCUPIED
        else:
            if self.empty_since is None:
                self.empty_since = self._now()
            self.status = RECENTLY_EMPTY
        return cmds

    def on_anomaly(self) -> bool:
        """Mark the room as alerting. Returns True only on the transition into the
        alert state, so the caller creates exactly ONE ticket per hazard episode
        instead of one per detected frame."""
        is_new = not self.alert_active
        self.alert_active = True
        self.status = ALERT_ACTIVE
        return is_new

    def clear_alert(self):
        self.alert_active = False

    def evaluate(self, empty_minutes: int, class_active: bool,
                 class_soon: bool):
        """Periodic tick: decide whether to power off. Returns list of commands."""
        if self.is_whitelisted or self.alert_active:
            return []
        if self.occupancy > 0 or self.empty_since is None:
            return []
        elapsed_min = (self._now() - self.empty_since) / 60.0
        if elapsed_min >= empty_minutes and not class_active and not class_soon:
            if self.systems_on:
                self.systems_on = False
                self.status = EMPTY_POWER_OFF
                return [("relay", False)]
        return []
