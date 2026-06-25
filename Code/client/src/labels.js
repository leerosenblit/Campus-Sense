// Human-friendly labels for the codes the backend/engine use internally.
// Keeping the mapping in one place means no technical strings (EMPTY_POWER_OFF,
// fallen_object, …) ever leak into the UI.

export const BUILDING_LABEL = {
  ficus: "Ficus",
  kirya: "Kirya",
  mapat: "Mapat Amal",
};

export const buildingLabel = (b) => BUILDING_LABEL[b] || b;

// Room status (from the decision engine state machine).
export const STATUS = {
  OCCUPIED:        { label: "In use",          tone: "green" },
  RECENTLY_EMPTY:  { label: "Just vacated",    tone: "amber" },
  EMPTY_POWER_OFF: { label: "Empty · saving",  tone: "blue" },
  ALERT_ACTIVE:    { label: "Needs attention", tone: "red" },
  unknown:         { label: "No data",         tone: "slate" },
};

export const statusInfo = (s) => STATUS[s] || STATUS.unknown;

// Ticket categories.
export const TICKET_TYPE = {
  projector:     "Projector",
  ac:            "Air conditioning",
  lights:        "Lighting",
  spill:         "Liquid spill",
  fallen_object: "Fallen object",
  other:         "Other",
};

export const ticketTypeLabel = (t) => TICKET_TYPE[t] || t;

export const TICKET_STATUS = {
  open:        "Open",
  in_progress: "In progress",
  resolved:    "Done",
};

export const ticketStatusLabel = (s) => TICKET_STATUS[s] || s;

export const TICKET_SOURCE = {
  qr:      "Student report",
  anomaly: "Auto-detected",
};

export const ticketSourceLabel = (s) => TICKET_SOURCE[s] || s;

// "3 min ago" style relative time for timestamps.
export function timeAgo(iso) {
  if (!iso) return "";
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const units = [
    ["day", 86400],
    ["hr", 3600],
    ["min", 60],
  ];
  for (const [name, size] of units) {
    const n = Math.floor(secs / size);
    if (n >= 1) return `${n} ${name}${n > 1 ? "s" : ""} ago`;
  }
  return "just now";
}
