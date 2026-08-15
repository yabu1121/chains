DROP INDEX idx_reports_status;
ALTER TABLE reports DROP COLUMN status;
ALTER TABLE users DROP COLUMN is_admin;
