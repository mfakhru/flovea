-- Tracks who clicked "tandai lunas" (mark as paid). Once set, per-user
-- totals attribute the expense to this user instead of the original owner,
-- since the reimburser is the one who actually ended up paying for it.
ALTER TABLE expenses ADD COLUMN reimbursed_by INTEGER REFERENCES users(id);
