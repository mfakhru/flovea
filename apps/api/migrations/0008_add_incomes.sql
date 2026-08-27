-- Household income, one row per salary period.
--
-- Deliberately NOT stored as a negative-amount row in `expenses`: every
-- total in /expenses/summary, /by-category and /by-period is a plain
-- SUM(amount), and a negative row would silently corrupt all of them.
--
-- Income is a single household figure rather than per-user (unlike
-- expenses, which are owned by Suami/Istri) — it is entered once a month
-- from the Home page.
CREATE TABLE incomes (
  pay_period TEXT PRIMARY KEY,  -- YYYY-MM, matches expenses.pay_period
  amount INTEGER NOT NULL,      -- IDR, whole rupiah, no decimals
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
