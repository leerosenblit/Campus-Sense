# Legacy proof-of-concept

These files are the **first** Campus-Sense prototype, kept for reference. They are
superseded by the `edge/` + `server/` + `client/` monorepo.

- `campus_vision.py` — OpenCV Haar-cascade face detector that wrote occupancy/hazard
  state to **Firebase Realtime Database**. Replaced by `edge/campus_edge.py`
  (YOLOv5n person counting + MobileNet anomaly classifier + MQTT).
- `index.html` — single-file vanilla HTML/JS dashboard reading from Firebase. Replaced
  by the React app in `client/`.
- `firebase_config.js`, `firebase_key.json` — Firebase credentials (gitignored).

The new build uses the architecture from the Project Book (MQTT + PostgreSQL + Node + React)
instead of Firebase.
