# Campus-Sense — Submission Checklist

**Target submission date: 8 July 2026.** Status snapshot: late June 2026.

Legend:
- ✅ **Done & verified** — built and confirmed working with a real run/test.
- 🟡 **Partial / unverified** — built but not finished, or not formally measured yet.
- ⬜ **Not started.**

---

## 1. Functional Requirements (from Project Book §3.5)

| Req | Description | Status | Notes |
|-----|-------------|:------:|-------|
| FR1 | Occupancy detection (count people, ≤30s) | ✅ | Edge YOLOv5n → MQTT → engine → DB/WebSocket. Verified live on webcam. |
| FR2 | Schedule integration in energy decision | ✅ | Engine checks class schedule; scheduled room stays on. Verified. |
| FR3 | Automatic appliance control (relay) | ✅ | Relay-off on empty room. **Simulated relay** (no physical Sonoff). Verified. |
| FR4 | Hazard / spill detection + alert | 🟡 | Full pipeline + training script ready, but **disabled until the model is trained** (needs campus data). Anomaly→ticket routing verified via manual event. |
| FR5 | QR manual reporting | ✅ | QR form + per-room QR generation. Ticket-create verified. |
| FR6 | Management dashboard | ✅ | Live map, ticket Kanban (drag-drop), analytics, cleaner view. Builds clean; live updates verified. |
| FR7 | Authentication + roles | ✅ | JWT + bcrypt; analytics manager-only. Verified 200/403/401. |

## 2. Non-Functional Requirements (§3.6)

| Req | Description | Status | Notes |
|-----|-------------|:------:|-------|
| NFR1 | Person counting ≥95% accuracy | 🟡 | Counting works; **not yet formally measured** on Afeka test footage. → measure during demo prep. |
| NFR2 | End-to-end latency ≤30s | ✅ | Occupancy→relay well under; live map <1s. |
| NFR3 | Raw frames never leave the edge | ✅ | By design: edge publishes only counts/flags; no frame stored or sent. |
| NFR4 | Hazard false positives ≤1/cam/day | 🟡 | Naive detector removed; engine dedups tickets. **Real rate measurable only after the model is trained.** |
| NFR5 | Reporting ≤30s, ≤3 taps | 🟡 | QR form is 3 taps; **not formally timed** yet. → time it during demo prep. |
| NFR6 | Browser compatibility (Chrome/Safari/Firefox/Samsung) | ⬜ | Not tested across browsers yet. |
| NFR7 | Server 99% availability (working hours) | 🟡 | Aspirational; not measured. Single-VM prototype. |

## 3. Engineering deliverables

- ✅ Three-tier architecture: edge (Python) / server (Node API + Python engine) / client (React)
- ✅ MQTT (Mosquitto) + PostgreSQL via Docker
- ✅ Sprint 1 — occupancy → auto power-off (verified end-to-end)
- ✅ Sprint 2 — tickets, QR codes, cleaner notifications, ticket dedup
- ✅ Sprint 3 (part 1) — schedule integration (FR2), role-based access (FR7)
- ✅ Sprint 3 (part 2) — API integration tests (9), engine unit tests (9), GitHub Actions CI
- ✅ One-click dev launcher (`start.ps1` / `stop.ps1`)
- ✅ Forgotten-item detection (Use Case D) + weekly class-schedule editor (manager)
- ✅ Spill-detector training pipeline (`scripts/coco_to_yolo.py`, `edge/train_spill.py`)
- ⬜ **Final packaging** — full `docker compose up` (API + engine + dashboard containerized), edge `.exe` (PyInstaller), demo script
- ⬜ **Spill model trained** and detection switched on (`anomaly=yolo-spill`)

## 4. Remaining work before 8 July (ordered)

1. ⬜ **Build the spill dataset** — label spills (e.g. Roboflow), export YOLO/COCO →
   `scripts/coco_to_yolo.py` → `edge/data/spill_yolo`. Target ~500 images; ~100 minimum.
2. ⬜ **Train the spill detector** — `python edge/train_spill.py`, confirm edge logs
   `anomaly=yolo-spill`, test with a safe water spill. *(Completes FR4, enables NFR4.)*
3. ⬜ **Measure NFR1 accuracy** — run person counting on a few test videos, record error.
4. ⬜ **Time NFR5** — confirm QR report is ≤30s / ≤3 taps.
5. ⬜ **NFR6 browser check** — open the QR form + dashboard on Chrome/Firefox/Safari/Samsung.
6. ⬜ **Final packaging** — containerize all services; build edge `.exe`; write demo script.
7. ⬜ **Demo dry-run** — full 10-minute flow (empty room → power-off; spill → cleaner alert;
   QR → ticket on dashboard), per Project Book §5.8.

## 5. Academic / submission artifacts

- ✅ Project Book (`docs/Campus-Sense_Project_Book.pdf`) — exists
- 🟡 Project Book updated to match final implementation (note deviations: simulated relay,
  `@hello-pangea/dnd`, in-app notifications vs Web Push, model trained late) — review before submit
- ✅ Source code repository (committed through Sprint 3 part 2)
- ⬜ Final demo / presentation prepared
- ⬜ Tag a submission release/commit once everything above is green

---

### Quick status summary
**Working & verified today:** the whole energy half (FR1–FR3, FR7) end-to-end, tickets/QR
(FR5/FR6), tests + CI. **Blocking the finish:** the spill model (FR4) needs the campus data
you're collecting this week; then final packaging and demo prep. Everything else is
measurement/polish.
