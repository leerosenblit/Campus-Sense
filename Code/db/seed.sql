-- Seed data for development.
-- NOTE: the pwd_hash below is a NON-FUNCTIONING PLACEHOLDER. After the database is up,
-- create real staff logins with:  cd server/api && node scripts/create_user.js
-- (that script bcrypt-hashes the password and upserts the user).

INSERT INTO roles (name, permissions) VALUES
    ('operations_manager', ARRAY['rooms:read','rooms:control','tickets:read','tickets:write','analytics:read']),
    ('it_admin',           ARRAY['rooms:read','tickets:read','tickets:write','users:write']),
    ('cleaner',            ARRAY['tickets:read','tickets:resolve'])
ON CONFLICT (name) DO NOTHING;

-- bcrypt hash of "campus123" (cost 10)
INSERT INTO users (email, pwd_hash, role) VALUES
    ('manager@afeka.ac.il', '$2b$10$Q9Q8nq3o5wYkKx2j7Yk5O.0p3wW8m1d2f3g4h5i6j7k8l9m0n1o2', 'operations_manager'),
    ('it@afeka.ac.il',      '$2b$10$Q9Q8nq3o5wYkKx2j7Yk5O.0p3wW8m1d2f3g4h5i6j7k8l9m0n1o2', 'it_admin'),
    ('cleaner@afeka.ac.il', '$2b$10$Q9Q8nq3o5wYkKx2j7Yk5O.0p3wW8m1d2f3g4h5i6j7k8l9m0n1o2', 'cleaner')
ON CONFLICT (email) DO NOTHING;

INSERT INTO rooms (id, building, floor, name) VALUES
    ('ficus-301', 'ficus', 3, 'Room 301'),
    ('ficus-302', 'ficus', 3, 'Room 302'),
    ('oren-lab10', 'oren', 1, 'Lab 10')
ON CONFLICT (id) DO NOTHING;

-- Hallway that must never auto power-off (book §5.6.3 whitelist example)
INSERT INTO rooms (id, building, floor, name, is_whitelisted) VALUES
    ('ficus-hall2', 'ficus', 2, 'Floor 2 Corridor', TRUE)
ON CONFLICT (id) DO NOTHING;
