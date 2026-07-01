// In-memory camera→room assignment, shared by the public /rooms routes (dashboard
// sets it) and the /internal routes (the decision engine reads it).
//
// A "camera" is one edge unit, identified by the room id it publishes under (its
// MQTT topic identity, e.g. "ficus-301"). The dashboard can re-point that camera at
// a different room; the engine then attributes the camera's events to the chosen
// room from that moment on. Assignments live for the API process lifetime (a demo
// control — not persisted); an unset camera defaults to its own identity.

// The single demo edge unit. Matches start.sh: --building ficus --room 301.
export const DEFAULT_CAMERA_ID = process.env.EDGE_CAMERA_ID || "ficus-301";

const assignments = new Map(); // cameraId -> roomId

export const getAssignment = (cameraId) => assignments.get(cameraId) || cameraId;
export const setAssignment = (cameraId, roomId) => assignments.set(cameraId, roomId);
export const allAssignments = () => {
  // Always include the default camera so the dashboard has something to show.
  const out = { [DEFAULT_CAMERA_ID]: getAssignment(DEFAULT_CAMERA_ID) };
  for (const [cam, room] of assignments) out[cam] = room;
  return out;
};
