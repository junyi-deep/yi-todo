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

func TestDeleteProjectMovesTasksToCollectionBox(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	db, err := database.Open(ctx, filepath.Join(t.TempDir(), "project-delete.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	projects := NewProjectService(dbsqlite.NewProjectRepository(db))
	tasks := NewTaskService(dbsqlite.NewTaskRepository(db))
	categories, err := projects.ListCategories()
	if err != nil || len(categories) == 0 {
		t.Fatalf("default category: %v %v", categories, err)
	}
	project, err := projects.CreateProject(CreateProjectInput{Name: "临时清单", CategoryID: categories[0].ID})
	if err != nil {
		t.Fatal(err)
	}
	task, err := tasks.CreateTask(CreateTaskInput{Title: "保留任务", ProjectID: &project.ID})
	if err != nil {
		t.Fatal(err)
	}
	if err := projects.DeleteProject(project.ID); err != nil {
		t.Fatal(err)
	}
	kept, err := tasks.GetTask(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if kept.ProjectID != nil {
		t.Fatalf("project id after list deletion = %v, want nil", *kept.ProjectID)
	}
}

func TestTaskDefaultsUseLocalDayAndChildInheritsScheduling(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	db, err := database.Open(ctx, filepath.Join(t.TempDir(), "task-defaults.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	tasks := NewTaskService(dbsqlite.NewTaskRepository(db))
	shanghai := time.FixedZone("Asia/Shanghai", 8*60*60)
	tasks.now = func() time.Time { return time.Date(2026, 8, 21, 0, 30, 0, 0, shanghai) }
	parent, err := tasks.CreateTask(CreateTaskInput{Title: "父任务"})
	if err != nil {
		t.Fatal(err)
	}
	if parent.StartAt == nil || parent.StartAt.In(shanghai).Day() != 21 || parent.StartAt.In(shanghai).Hour() != 9 {
		t.Fatalf("local default start = %v", parent.StartAt)
	}
	estimated := 90
	parent, err = tasks.UpdateTaskMetadata(UpdateTaskMetadataInput{ID: parent.ID, Priority: 1, Important: true, Urgent: true, StartAt: parent.StartAt, DueAt: parent.DueAt, EstimatedMinutes: &estimated})
	if err != nil {
		t.Fatal(err)
	}
	child, err := tasks.CreateTask(CreateTaskInput{Title: "子任务", ParentID: &parent.ID})
	if err != nil {
		t.Fatal(err)
	}
	if child.StartAt == nil || !child.StartAt.Equal(*parent.StartAt) || child.DueAt == nil || !child.DueAt.Equal(*parent.DueAt) || child.EstimatedMinutes == nil || *child.EstimatedMinutes != estimated || child.Priority != 1 || !child.Important || !child.Urgent {
		t.Fatalf("child did not inherit parent metadata: %+v", child)
	}
	if _, err := tasks.CreateTask(CreateTaskInput{Title: "孙任务", ParentID: &child.ID}); err != nil {
		t.Fatal(err)
	}
	parents, err := tasks.ListTasks(TaskQuery{View: "all", TitleQuery: "父任务", Limit: 10})
	if err != nil || len(parents) != 1 || parents[0].ChildCount != 1 {
		t.Fatalf("parent child count = %+v, err=%v", parents, err)
	}
	features := NewFeatureService(dbsqlite.NewFeatureRepository(db), t.TempDir())
	children, err := features.ListSubtasks(parent.ID)
	if err != nil || len(children) != 1 || children[0].ChildCount != 1 {
		t.Fatalf("lazy child count = %+v, err=%v", children, err)
	}
}

func TestListTasksFiltersByLiteralTitleText(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	db, err := database.Open(ctx, filepath.Join(t.TempDir(), "task-title-filter.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	tasks := NewTaskService(dbsqlite.NewTaskRepository(db))
	for _, title := range []string{"性能测试 Alpha", "性能测试 Beta", "完成 100% 覆盖"} {
		if _, err := tasks.CreateTask(CreateTaskInput{Title: title}); err != nil {
			t.Fatal(err)
		}
	}

	items, err := tasks.ListTasks(TaskQuery{View: "all", TitleQuery: " alpha ", Limit: 50})
	if err != nil || len(items) != 1 || items[0].Title != "性能测试 Alpha" {
		t.Fatalf("alpha title filter = %v, err=%v", items, err)
	}
	items, err = tasks.ListTasks(TaskQuery{View: "all", TitleQuery: "100%", Limit: 50})
	if err != nil || len(items) != 1 || items[0].Title != "完成 100% 覆盖" {
		t.Fatalf("literal wildcard title filter = %v, err=%v", items, err)
	}
	count, err := tasks.CountTasks(TaskQuery{View: "all", TitleQuery: "性能测试"})
	if err != nil || count != 2 {
		t.Fatalf("filtered task count = %d, err=%v", count, err)
	}
}
