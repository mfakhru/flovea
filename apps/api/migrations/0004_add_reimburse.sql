ALTER TABLE expenses ADD COLUMN needs_reimburse INTEGER NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN reimbursed_at TEXT;

CREATE INDEX idx_expenses_reimburse ON expenses(needs_reimburse);
