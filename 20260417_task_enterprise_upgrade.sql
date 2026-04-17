-- Migration to upgrade tasks table for enterprise productivity
ALTER TABLE tasks ADD COLUMN estimated_hours DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE tasks ADD COLUMN logged_hours DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE tasks ADD COLUMN blocked_by_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL;

-- Log the first audit trail of the migration
INSERT INTO task_activities (task_id, actor_id, action, to_value)
SELECT id, 1, 'system_update', 'Enterprise fields added' FROM tasks;
