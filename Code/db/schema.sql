-- Campus-Sense database schema (PostgreSQL 15)
-- Entities from Project Book §4.6: room, event, ticket, user, schedule, role.

CREATE TABLE IF NOT EXISTS roles (
    name         TEXT PRIMARY KEY,            -- operations_manager | it_admin | cleaner
    permissions  TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS users (
    id         SERIAL PRIMARY KEY,
    email      TEXT UNIQUE NOT NULL,
    pwd_hash   TEXT NOT NULL,                 -- bcrypt hash
    role       TEXT NOT NULL REFERENCES roles(name),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
    id        TEXT PRIMARY KEY,               -- e.g. 'ficus-301', 'kirya-H1', 'mapat-Tamar'
    building  TEXT NOT NULL,                  -- short id: ficus | kirya | mapat (UI maps to display name)
    floor     INT,
    name      TEXT NOT NULL,
    -- live state mirrored from the decision engine for fast dashboard reads.
    -- These are INTERNAL codes; the dashboard maps them to friendly labels (client/src/labels.js).
    status    TEXT NOT NULL DEFAULT 'unknown',-- OCCUPIED | RECENTLY_EMPTY | EMPTY_POWER_OFF | ALERT_ACTIVE
    occupancy INT  NOT NULL DEFAULT 0,
    systems_on BOOLEAN NOT NULL DEFAULT TRUE,
    is_whitelisted BOOLEAN NOT NULL DEFAULT FALSE,  -- never auto power-off (book §5.6.3)
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
    id      BIGSERIAL PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id),
    type    TEXT NOT NULL,                    -- occupancy | anomaly | relay | heartbeat
    value   JSONB NOT NULL,                   -- {"count":3} | {"class":"liquid_spill","conf":0.82} | {"state":"off"}
    ts      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Index for fast daily occupancy graphs (book §4.6).
CREATE INDEX IF NOT EXISTS idx_events_room_ts ON events (room_id, ts);

CREATE TABLE IF NOT EXISTS tickets (
    id          SERIAL PRIMARY KEY,
    room_id     TEXT NOT NULL REFERENCES rooms(id),
    type        TEXT NOT NULL,                -- projector | ac | lights | spill | lost_item | other
    source      TEXT NOT NULL DEFAULT 'qr',   -- qr | anomaly
    status      TEXT NOT NULL DEFAULT 'open', -- open | in_progress | resolved
    note        TEXT,
    thumbnail   TEXT,                         -- optional data URL / path (anomaly model)
    assignee    INT REFERENCES users(id),
    confidence  REAL,                         -- for anomaly-sourced tickets
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);

-- A class timetable is a PERMANENT weekly recurrence: the same course runs in the
-- same room on the same weekday at the same time every week. We therefore store a
-- day-of-week + wall-clock time range (not concrete dates). The energy rule reads
-- these to avoid powering a room off during/just before a class (FR2).
CREATE TABLE IF NOT EXISTS schedules (
    id          SERIAL PRIMARY KEY,
    room_id     TEXT NOT NULL REFERENCES rooms(id),
    course_id   TEXT,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday (matches Postgres EXTRACT(DOW) and JS getDay())
    start_time  TIME NOT NULL,
    end_time    TIME NOT NULL,
    CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_schedules_room_dow ON schedules (room_id, day_of_week);
