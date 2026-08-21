CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    sort_order REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK(parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX idx_categories_parent_id ON categories(parent_id, sort_order);

INSERT INTO categories(id, parent_id, name, sort_order, created_at, updated_at)
VALUES ('00000000-0000-7000-8000-000000000001', NULL, '默认分类', 1000,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

ALTER TABLE projects ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT;

UPDATE projects
SET category_id = '00000000-0000-7000-8000-000000000001'
WHERE category_id IS NULL;

CREATE INDEX idx_projects_category_id ON projects(category_id, sort_order)
WHERE archived_at IS NULL;
