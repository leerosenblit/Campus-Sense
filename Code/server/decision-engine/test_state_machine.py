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


def test_occupancy_turns_systems_back_on():
    st = sm.RoomState(room_id="ficus-301", systems_on=False)
    cmds = st.on_occupancy(3, empty_minutes=10)
    assert ("relay", True) in cmds
    assert st.status == sm.OCCUPIED
