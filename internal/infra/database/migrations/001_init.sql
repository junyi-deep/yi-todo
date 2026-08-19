CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color TEXT,
    icon TEXT,
    sort_order REAL NOT NULL DEFAULT 0,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description_format TEXT NOT NULL DEFAULT 'richtext',
    description_source TEXT NOT NULL DEFAULT '',
    description_plain TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo',
    priority INTEGER NOT NULL DEFAULT 0,
    important INTEGER NOT NULL DEFAULT 0,
    urgent INTEGER NOT NULL DEFAULT 0,
    start_at TEXT,
    due_at TEXT,
    completed_at TEXT,
    estimated_minutes INTEGER,
    actual_minutes INTEGER NOT NULL DEFAULT 0,
    progress INTEGER NOT NULL DEFAULT 0,
    sort_order REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    CHECK(priority >= 0 AND priority <= 4),
    CHECK(progress >= 0 AND progress <= 100),
    CHECK(important IN (0,1)),
    CHECK(urgent IN (0,1)),
    CHECK(description_format IN ('markdown','richtext')),
    CHECK(status IN ('todo','in_progress','completed','cancelled')),
    CHECK(parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_due_at ON tasks(due_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_start_at ON tasks(start_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_project_id ON tasks(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_parent_id ON tasks(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_completed_at ON tasks(completed_at);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);

