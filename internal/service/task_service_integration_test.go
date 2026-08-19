package service

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/junyiwu/yi-todo/internal/domain"
	"github.com/junyiwu/yi-todo/internal/infra/database"
	dbsqlite "github.com/junyiwu/yi-todo/internal/infra/database/sqlite"
)

func TestTaskVerticalSlicePersistsAcrossReopen(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "localtodo.db")
	fixedNow := time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC)

	db, err := database.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	service := NewTaskService(dbsqlite.NewTaskRepository(db))
	service.now = func() time.Time { return fixedNow }

	created, err := service.CreateTask(CreateTaskInput{Title: "First title"})
	if err != nil {
		t.Fatal(err)
	}
	updated, err := service.UpdateTask(UpdateTaskInput{ID: created.ID, Title: "Edited title"})
	if err != nil || updated.Title != "Edited title" {
		t.Fatalf("UpdateTask() = %#v, %v", updated, err)
	}
	completed, err := service.CompleteTask(created.ID)
	if err != nil || completed.Status != domain.TaskStatusCompleted || completed.CompletedAt == nil {
		t.Fatalf("CompleteTask() = %#v, %v", completed, err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	db, err = database.Open(ctx, path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	service = NewTaskService(dbsqlite.NewTaskRepository(db))

	tasks, err := service.ListTasks(TaskQuery{View: "completed"})
	if err != nil {
		t.Fatal(err)
	}
	if len(tasks) != 1 || tasks[0].Title != "Edited title" || tasks[0].Status != domain.TaskStatusCompleted {
		t.Fatalf("persisted tasks = %#v", tasks)
	}

	if err := service.DeleteTask(created.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.GetTask(created.ID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("GetTask() after delete error = %v, want not found", err)
	}
}
