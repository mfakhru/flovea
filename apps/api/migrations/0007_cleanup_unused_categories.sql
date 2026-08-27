-- Drop leftover categories nobody ever spent on (Baju, Pakaian, Skincare,
-- Masak at the time of writing — "Baju"/"Pakaian" were accidental duplicates).
--
-- The two guards below make this safe to run anywhere: is_default = 0 keeps the
-- six seeded categories, and the NOT IN keeps anything an expense still points
-- at, so the statement can never orphan a row.
DELETE FROM categories
WHERE is_default = 0
  AND id NOT IN (SELECT DISTINCT category_id FROM expenses);
