-- Saldo Istri: a running balance of the money Istri holds, carried across
-- pay periods indefinitely.
--
-- The balance itself is deliberately NOT stored. It is recomputed from
-- scratch on every read (see routers/balance.py) as
--   saldo_awal + Σ over periods (diterima − pengeluaran Istri + koreksi)
-- so correcting a months-old expense fixes every later period on its own,
-- instead of leaving stored per-period snapshots that silently go stale.
-- Only the three inputs below are persisted.

-- 1. What Istri actually received that period. Household income
--    (incomes.amount) stays untouched — it is the larger figure that feeds
--    the Home trend chart; this column is the slice handed over to Istri,
--    and 0 means "belum diisi" the same way incomes.amount does.
ALTER TABLE incomes ADD COLUMN istri_amount INTEGER NOT NULL DEFAULT 0;

-- 2. Manual corrections, signed: negative moves money out of the balance
--    (pindah ke tabungan), positive brings it back in (uang dikembalikan,
--    selisih hitung). Exists so the ledger can be reconciled against real
--    cash without inventing fake expenses — a fake expense would corrupt
--    every per-category, per-user and per-period total in the app.
CREATE TABLE balance_adjustments (
  id INTEGER PRIMARY KEY,
  pay_period TEXT NOT NULL,   -- YYYY-MM, matches expenses.pay_period
  amount INTEGER NOT NULL,    -- IDR, whole rupiah, signed
  note TEXT NOT NULL,         -- required: an unexplained correction is unauditable
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_balance_adjustments_period ON balance_adjustments(pay_period);

-- 3. The balance as it stood before the first recorded period. Without it
--    a "forever" balance would silently start from 0 in whichever month
--    tracking happened to begin, ignoring everything saved before that.
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO app_settings (key, value) VALUES ('istri_opening_balance', '0');
