# Additional Use Cases (D–F)

The Project Book defines three core use cases: **A** (empty classroom → power off),
**B** (hallway spill → cleaner), **C** (broken projector → QR ticket). Below are three
more that fall naturally out of the same "super-sensor" data (occupancy + anomaly +
schedule) without new hardware. Each notes what it reuses and the rough effort.

---

## Use Case D — The Cleaner Arrives (automatic ticket lifecycle)

*Combines occupancy + anomaly. This is the "cleaner entering the room" idea.*

1. **Pre-condition.** Room `ficus-301` has an active spill alert (`ALERT_ACTIVE`); a
   ticket is open and the cleaner has been notified.
2. **Trigger.** Occupancy rises from 0 to ≥1 while the room is in `ALERT_ACTIVE` — i.e.
   someone (the cleaner) has entered to deal with it.
3. **Flow.** The decision engine interprets "person entered an alerting room" as the
   task being attended: it moves the ticket from **Open → In Progress** automatically and
   starts a response-time clock. When the anomaly is no longer detected for a short
   window (e.g. 60 s) — the spill is gone — the engine moves the ticket to **Resolved**
   and records the resolution time. (If no camera-confirmed clear, the cleaner still taps
   "Mark as done" as today.)
4. **Post-condition.** The ticket reflects reality without manual status changes, and the
   analytics screen gets an accurate, automatically-measured response time.
5. **Benefit.** Less manual bookkeeping for the cleaner, and **trustworthy response-time
   metrics** for the operations manager (feeds the §5.4.3 analytics) — measured, not
   self-reported.

*Reuses:* people-counting + the anomaly classifier (once trained) + the existing ticket
state machine. *New work:* a rule in the engine linking occupancy transitions to ticket
status; an "anomaly cleared" signal from the edge. *Effort:* small–medium.

---

## Use Case E — Over-Capacity / Crowding Alert (safety)

*Pure people-counting reuse — no anomaly model needed, works today.*

1. **Pre-condition.** Each room has a configured safe capacity (e.g. fire-code seating
   limit) stored alongside the room record.
2. **Trigger.** The live occupancy count exceeds that capacity for more than a short
   debounce period (to ignore people passing through a doorway).
3. **Flow.** The engine raises an "over-capacity" event for the room. The dashboard shows
   the room in a distinct warning state, and the operations manager is notified so they
   can act (open an overflow room, ask people to relocate).
4. **Post-condition.** The over-capacity condition is logged with a timestamp; the alert
   clears automatically when the count drops back under the limit.
5. **Benefit.** A genuine **safety** improvement (egress / fire compliance) and useful
   planning data on which rooms are routinely overfull — echoing the room-utilisation
   goal of Sutjarittham et al. (book §1.2.1) but in real time.

*Reuses:* people counting + WebSocket dashboard. *New work:* a `capacity` column on
`rooms`, a threshold check in the engine, a warning marker on the map. *Effort:* small.

---

## Use Case F — The No-Show Class (schedule-aware energy + utilisation)

*Ties occupancy to the class schedule (FR2).*

1. **Pre-condition.** The schedule says a class is booked in `ficus-201` from 14:00, and
   the system pre-warms the room (turns systems on a few minutes early, as today).
2. **Trigger.** By 14:15 the room has still counted **zero** people — the class did not
   take place (cancelled, moved, lecturer absent).
3. **Flow.** Instead of keeping the room powered for a class that isn't happening, the
   engine marks the scheduled slot as a **no-show**, powers the room back down under the
   normal empty-room rule, and records the no-show against that course/room.
4. **Post-condition.** Energy isn't wasted on an empty "booked" room, and the analytics
   screen can show a **no-show / under-utilisation report** per room and course.
5. **Benefit.** Captures the energy waste that schedule-only systems miss (the exact gap
   the book identifies in §1.2.1 — predicting from the timetable misses cancelled
   classes), and gives the college data to right-size room bookings next semester.

*Reuses:* people counting + the energy state machine + schedule integration (FR2).
*New work:* compare schedule vs. actual occupancy after class start; a no-show record +
report. *Effort:* medium (depends on schedule integration landing in Sprint 3).

---

## Summary

| UC | Name | Key inputs | Needs trained anomaly model? | Effort |
|----|------|-----------|:---:|:---:|
| D | Cleaner Arrives (auto lifecycle) | occupancy + anomaly | Yes (for auto-resolve) | small–medium |
| E | Over-Capacity Alert | occupancy + room capacity | No | small |
| F | No-Show Class | occupancy + schedule | No | medium |

All three extend the existing architecture with engine rules and small schema additions —
no new sensors, consistent with the one-camera super-sensor design.
