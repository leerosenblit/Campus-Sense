"""Unit tests for the energy decision rule (book §5.7.1)."""
import time

import state_machine as sm


def test_powers_off_after_empty_timeout():
    st = sm.RoomState(room_id="ficus-301")
    st.on_occupancy(0, empty_minutes=10)
    # pretend the room has been empty for 11 minutes
    st.empty_since = time.time() - 11 * 60
    cmds = st.evaluate(empty_minutes=10, class_active=False, class_soon=False)
    assert ("relay", False) in cmds
    assert st.status == sm.EMPTY_POWER_OFF
    assert st.systems_on is False


def test_does_not_power_off_during_class():
    st = sm.RoomState(room_id="ficus-301")
    st.on_occupancy(0, empty_minutes=10)
    st.empty_since = time.time() - 11 * 60
    cmds = st.evaluate(empty_minutes=10, class_active=True, class_soon=False)
    assert cmds == []
    assert st.systems_on is True


def test_whitelisted_room_never_powers_off():
    st = sm.RoomState(room_id="ficus-hall2", is_whitelisted=True)
    st.on_occupancy(0, empty_minutes=10)
    st.empty_since = time.time() - 60 * 60
    assert st.evaluate(empty_minutes=10, class_active=False, class_soon=False) == []


def test_alert_blocks_power_off():
    st = sm.RoomState(room_id="ficus-301")
    st.on_occupancy(0, empty_minutes=10)
    st.empty_since = time.time() - 30 * 60
    st.on_anomaly()
    assert st.evaluate(empty_minutes=10, class_active=False, class_soon=False) == []


def test_anomaly_creates_one_ticket_per_episode():
    st = sm.RoomState(room_id="ficus-301")
    assert st.on_anomaly() is True   # first detection -> new alert -> make ticket
    assert st.on_anomaly() is False  # repeated detections -> no new ticket
    assert st.on_anomaly() is False
    # after the room is occupied again, the alert clears and a later spill is "new"
    st.on_occupancy(2, empty_minutes=10)
    assert st.on_anomaly() is True


def test_occupancy_turns_systems_back_on():
    st = sm.RoomState(room_id="ficus-301", systems_on=False)
    cmds = st.on_occupancy(3, empty_minutes=10)
    assert ("relay", True) in cmds
    assert st.status == sm.OCCUPIED


def test_forgotten_item_blocks_power_off():
    # Use Case D: an item left in an empty room holds power on past the empty timeout.
    st = sm.RoomState(room_id="ficus-301")
    st.on_occupancy(0, empty_minutes=10)
    st.empty_since = time.time() - 30 * 60          # long empty
    assert st.on_forgotten_item(True) is True       # first detection -> new -> ticket
    assert st.status == sm.FORGOTTEN_ITEM
    assert st.evaluate(empty_minutes=10, class_active=False, class_soon=False) == []
    assert st.systems_on is True


def test_forgotten_item_one_ticket_then_clear_releases_hold():
    st = sm.RoomState(room_id="ficus-301")
    st.on_occupancy(0, empty_minutes=10)
    st.empty_since = time.time() - 30 * 60
    assert st.on_forgotten_item(True) is True       # new episode
    assert st.on_forgotten_item(True) is False      # same episode -> no second ticket
    # item retrieved -> hold released -> room can now power off
    st.on_forgotten_item(False)
    cmds = st.evaluate(empty_minutes=10, class_active=False, class_soon=False)
    assert ("relay", False) in cmds
    assert st.status == sm.EMPTY_POWER_OFF


def test_occupancy_clears_forgotten_flag():
    st = sm.RoomState(room_id="ficus-301")
    st.on_occupancy(0, empty_minutes=10)
    st.on_forgotten_item(True)
    st.on_occupancy(2, empty_minutes=10)            # someone walked back in
    assert st.forgotten_active is False
    assert st.status == sm.OCCUPIED
