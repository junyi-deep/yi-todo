CREATE TABLE task_dependencies (
    predecessor_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    successor_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_type TEXT NOT NULL DEFAULT 'finish_to_start',
    created_at TEXT NOT NULL,
    PRIMARY KEY(predecessor_id, successor_id),
    CHECK(predecessor_id <> successor_id)
);

CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    created_at TEXT NOT NULL
);

CREATE TABLE reminders (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    remind_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    fired_at TEXT,
    repeat_type TEXT NOT NULL DEFAULT 'none',
    repeat_value INTEGER,
    created_at TEXT NOT NULL,
    CHECK(status IN ('pending','fired','cancelled')),
    CHECK(repeat_type IN ('none','daily','weekly','monthly'))
);

CREATE TABLE pomodoro_sessions (
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    state TEXT NOT NULL,
    planned_seconds INTEGER NOT NULL,
    elapsed_seconds INTEGER NOT NULL DEFAULT 0,
    started_at TEXT,
    expected_end_at TEXT,
    ended_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK(state IN ('idle','running','paused','completed','cancelled'))
);

CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE task_fts USING fts5(
    task_id UNINDEXED,
    title,
    description_plain,
    tokenize='unicode61'
);

CREATE TRIGGER task_fts_insert AFTER INSERT ON tasks BEGIN
    INSERT INTO task_fts(task_id, title, description_plain)
    VALUES (new.id, new.title, new.description_plain);
END;

CREATE TRIGGER task_fts_update AFTER UPDATE OF title, description_plain ON tasks BEGIN
    DELETE FROM task_fts WHERE task_id = old.id;
    INSERT INTO task_fts(task_id, title, description_plain)
    VALUES (new.id, new.title, new.description_plain);
END;

CREATE TRIGGER task_fts_delete AFTER DELETE ON tasks BEGIN
    DELETE FROM task_fts WHERE task_id = old.id;
END;

INSERT INTO task_fts(task_id, title, description_plain)
SELECT id, title, description_plain FROM tasks;

CREATE INDEX idx_reminders_due ON reminders(status, remind_at);
CREATE INDEX idx_pomodoro_task ON pomodoro_sessions(task_id, created_at);
