package service

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/junyiwu/yi-todo/internal/infra/database"
	dbsqlite "github.com/junyiwu/yi-todo/internal/infra/database/sqlite"
	"github.com/xuri/excelize/v2"
)

func TestExcelExportContainsTaskInformationWithoutAttachments(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	db, err := database.Open(ctx, filepath.Join(root, "export.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	tasks := NewTaskService(dbsqlite.NewTaskRepository(db))
	if _, err := tasks.CreateTask(CreateTaskInput{Title: "导出任务"}); err != nil {
		t.Fatal(err)
	}
	backup := NewBackupService(db, filepath.Join(root, "backups"))
	backup.ctx = ctx
	path := filepath.Join(root, "tasks.xlsx")
	if err := backup.writeTaskExport(path, ExportTasksInput{All: true}); err != nil {
		t.Fatal(err)
	}
	book, err := excelize.OpenFile(path)
	if err != nil {
		t.Fatal(err)
	}
	defer book.Close()
	wantSheets := []string{"任务", "提醒", "依赖", "番茄钟"}
	if got := book.GetSheetList(); len(got) != len(wantSheets) {
		t.Fatalf("sheets = %v", got)
	}
	for _, sheet := range wantSheets {
		if index, err := book.GetSheetIndex(sheet); err != nil || index < 0 {
			t.Fatalf("sheet %q missing: %v", sheet, err)
		}
	}
	if title, err := book.GetCellValue("任务", "F2"); err != nil || title != "导出任务" {
		t.Fatalf("exported title = %q, err=%v", title, err)
	}
	if index, _ := book.GetSheetIndex("附件"); index >= 0 {
		t.Fatal("attachments must not be exported")
	}
}

func TestCategoryViewIncludesNestedProjects(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, filepath.Join(t.TempDir(), "categories.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	projects := NewProjectService(dbsqlite.NewProjectRepository(db))
	tasks := NewTaskService(dbsqlite.NewTaskRepository(db))
	root, err := projects.CreateCategory(CreateCategoryInput{Name: "工作"})
	if err != nil {
		t.Fatal(err)
	}
	child, err := projects.CreateCategory(CreateCategoryInput{Name: "研发", ParentID: &root.ID})
	if err != nil {
		t.Fatal(err)
	}
	project, err := projects.CreateProject(CreateProjectInput{Name: "桌面端", CategoryID: child.ID})
	if err != nil {
		t.Fatal(err)
	}
	task, err := tasks.CreateTask(CreateTaskInput{Title: "分类任务", ProjectID: &project.ID})
	if err != nil {
		t.Fatal(err)
	}
	items, err := tasks.ListTasks(TaskQuery{View: "category", CategoryID: &root.ID, Limit: 50})
	if err != nil || len(items) != 1 {
		t.Fatalf("category tasks = %v, err=%v", items, err)
	}
	from := time.Now().Add(-24 * time.Hour)
	start := time.Now()
	due := start.Add(time.Hour)
	if _, err := tasks.UpdateTaskMetadata(UpdateTaskMetadataInput{ID: task.ID, ProjectID: task.ProjectID, StartAt: &start, DueAt: &due}); err != nil {
		t.Fatal(err)
	}
	items, err = tasks.ListTasks(TaskQuery{View: "category", CategoryID: &root.ID, StartFrom: &from, Limit: 50})
	if err != nil || len(items) != 1 {
		t.Fatalf("filtered category tasks = %v, err=%v", items, err)
	}
}
