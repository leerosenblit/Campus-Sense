-- Seed data for development (roles + rooms only).
--
-- For realistic demo data (logins, occupancy history, tickets, schedules) run the
-- seeder instead, which also creates working bcrypt logins:
--     cd server/api && node scripts/seed_demo.js
--
-- The pwd_hash values below are NON-FUNCTIONING PLACEHOLDERS. Use the seeder (or
-- scripts/create_user.js) to create real logins.

INSERT INTO roles (name, permissions) VALUES
    ('operations_manager', ARRAY['rooms:read','rooms:control','tickets:read','tickets:write','analytics:read']),
    ('it_admin',           ARRAY['rooms:read','tickets:read','tickets:write','users:write']),
    ('cleaner',            ARRAY['tickets:read','tickets:resolve'])
ON CONFLICT (name) DO NOTHING;

-- Placeholder logins (replace via the seeder / create_user.js).
INSERT INTO users (email, pwd_hash, role) VALUES
    ('manager@afeka.ac.il', '$2b$10$Q9Q8nq3o5wYkKx2j7Yk5O.0p3wW8m1d2f3g4h5i6j7k8l9m0n1o2', 'operations_manager'),
    ('it@afeka.ac.il',      '$2b$10$Q9Q8nq3o5wYkKx2j7Yk5O.0p3wW8m1d2f3g4h5i6j7k8l9m0n1o2', 'it_admin'),
    ('cleaner@afeka.ac.il', '$2b$10$Q9Q8nq3o5wYkKx2j7Yk5O.0p3wW8m1d2f3g4h5i6j7k8l9m0n1o2', 'cleaner')
ON CONFLICT (email) DO NOTHING;

-- Campus buildings: Ficus, Kirya, Mapat Amal. The `building` column holds a short
-- id (ficus|kirya|mapat); the UI maps it to the display name.
INSERT INTO rooms (id, building, floor, name) VALUES
    ('ficus-101', 'ficus', 1, 'Room 101'),
    ('ficus-102', 'ficus', 1, 'Room 102'),
    ('ficus-201', 'ficus', 2, 'Room 201'),
    ('ficus-301', 'ficus', 3, 'Room 301'),
    ('ficus-302', 'ficus', 3, 'Room 302'),
    ('kirya-H1',  'kirya', 1, 'Hall H1'),
    ('kirya-H2',  'kirya', 1, 'Hall H2'),
    ('kirya-Z1',  'kirya', 2, 'Room Z1'),
    ('kirya-Z2',  'kirya', 2, 'Room Z2'),
    ('mapat-Tamar', 'mapat', 1, 'Tamar'),
    ('mapat-Gefen', 'mapat', 1, 'Gefen'),
    ('mapat-Oren',  'mapat', 1, 'Oren')
ON CONFLICT (id) DO NOTHING;

-- Lecture hall H1 is whitelisted: it powers lights/AC on a fixed timetable and is
-- never auto powered-off by occupancy (book §5.6.3 whitelist example).
UPDATE rooms SET is_whitelisted = TRUE WHERE id = 'kirya-H1';
