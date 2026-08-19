package database

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	dbsqlite "github.com/junyiwu/yi-todo/internal/infra/database/sqlite"
	"github.com/junyiwu/yi-todo/internal/repository"
)

// BenchmarkTaskDataset creates the Phase 10 reference dataset on a temporary
// database. Run explicitly with: go test -run '^$' -bench BenchmarkTaskDataset ./internal/infra/database
func BenchmarkTaskDataset(b *testing.B) {
	db, err := Open(context.Background(), filepath.Join(b.TempDir(), "performance.db"))
	if err != nil {
		b.Fatal(err)
	}
	defer db.Close()
	if err := Migrate(context.Background(), db); err != nil {
		b.Fatal(err)
	}
	tx, err := db.Begin()
	if err != nil {
		b.Fatal(err)
	}
	statement, err := tx.Prepare(`INSERT INTO tasks(id,title,description_format,description_plain,status,due_at,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`)
	if err != nil {
		b.Fatal(err)
	}
	now := time.Now().UTC()
	for index := 0; index < 50_000; index++ {
		stamp := now.Add(time.Duration(index) * time.Minute).Format(time.RFC3339Nano)
		if _, err := statement.Exec(fmt.Sprintf("perf-%05d", index), fmt.Sprintf("Performance task %05d", index), "markdown", "searchable benchmark description", "todo", stamp, index, stamp, stamp); err != nil {
			b.Fatal(err)
		}
	}
	statement.Close()
	if err := tx.Commit(); err != nil {
		b.Fatal(err)
	}
	repo := dbsqlite.NewTaskRepository(db)
	b.ResetTimer()
	for index := 0; index < b.N; index++ {
		if _, err := repo.List(context.Background(), repository.TaskListQuery{View: "all", Limit: 200}); err != nil {
			b.Fatal(err)
		}
	}
}
