package database

import (
	"context"
	"path/filepath"
	"testing"
)

func TestMigrateEmptyDatabase(t *testing.T) {
	t.Parallel()

	db, err := Open(context.Background(), filepath.Join(t.TempDir(), "localtodo.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })

	if err := Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	// Running migrations again must be safe.
	if err := Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}

	var migrationCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM schema_migrations").Scan(&migrationCount); err != nil {
		t.Fatal(err)
	}
	migrations, err := readMigrations()
	if err != nil {
		t.Fatal(err)
	}
	if migrationCount != len(migrations) {
		t.Fatalf("migration count = %d, want %d", migrationCount, len(migrations))
	}

	for _, table := range []string{"categories", "projects", "tasks", "task_dependencies", "attachments", "reminders", "pomodoro_sessions", "app_settings", "task_fts"} {
		var count int
		if err := db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 1 {
			t.Fatalf("table %s was not created", table)
		}
	}
	for _, removed := range []string{"tags", "task_tags"} {
		var count int
		if err := db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", removed).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("removed table %s still exists", removed)
		}
	}
}
