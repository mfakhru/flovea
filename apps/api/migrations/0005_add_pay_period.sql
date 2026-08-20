ALTER TABLE expenses ADD COLUMN pay_period TEXT;
CREATE INDEX idx_expenses_pay_period ON expenses(pay_period);
