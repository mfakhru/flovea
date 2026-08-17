INSERT INTO categories (name, is_default) VALUES
  ('Makan', 1),
  ('Transport', 1),
  ('Keperluan', 1),
  ('Kesehatan', 1),
  ('Hiburan', 1),
  ('Others', 1);

-- users are seeded separately, after security.py's password hashing lands
-- (see step 3) — password hashes must not be hand-written into this file.
