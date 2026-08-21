package service

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/junyiwu/yi-todo/internal/domain"
	"github.com/junyiwu/yi-todo/internal/infra/database"
	dbsqlite "github.com/junyiwu/yi-todo/internal/infra/database/sqlite"
)

func TestAdvancedFeaturesPersistAndValidate(t *testing.T) {
	root := t.TempDir()
	db, err := database.Open(context.Background(), filepath.Join(root, "localtodo.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := database.Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}

	tasks := NewTaskService(dbsqlite.NewTaskRepository(db))
	features := NewFeatureService(dbsqlite.NewFeatureRepository(db), filepath.Join(root, "attachments"))
	if err := features.SetSetting(SetSettingInput{Key: "appearance.theme", Value: "dark"}); err != nil {
		t.Fatal(err)
	}
	if theme, err := features.GetSetting("appearance.theme"); err != nil || theme != "dark" {
		t.Fatalf("theme=%q err=%v", theme, err)
	}
	parent, err := tasks.CreateTask(CreateTaskInput{Title: "Calendar launch"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = features.UpdateDescription(UpdateDescriptionInput{ID: parent.ID, Format: "markdown", Source: "# Release notes", Plain: "Release notes"}); err != nil {
		t.Fatal(err)
	}
	results, err := features.SearchTasks("Release")
	if err != nil || len(results) != 1 {
		t.Fatalf("search=%v err=%v", results, err)
	}
	filtered, err := features.SearchTasks("status:todo Release")
	if err != nil || len(filtered) != 1 {
		t.Fatalf("filtered search=%v err=%v", filtered, err)
	}
	child, err := tasks.CreateTask(CreateTaskInput{ParentID: &parent.ID, Title: "Ship UI"})
	if err != nil {
		t.Fatal(err)
	}
	children, _ := features.ListSubtasks(parent.ID)
	if len(children) != 1 || children[0].ParentID == nil {
		t.Fatalf("children=%v", children)
	}
	if _, err := tasks.CompleteTask(child.ID); err != nil {
		t.Fatal(err)
	}
	completedParent, err := tasks.GetTask(parent.ID)
	if err != nil || completedParent.Status != domain.TaskStatusCompleted {
		t.Fatalf("completed parent=%+v err=%v", completedParent, err)
	}
	newChild, err := tasks.CreateTask(CreateTaskInput{ParentID: &parent.ID, Title: "Follow-up"})
	if err != nil {
		t.Fatal(err)
	}
	reopenedParent, err := tasks.GetTask(parent.ID)
	if err != nil || reopenedParent.Status != domain.TaskStatusInProgress {
		t.Fatalf("reopened parent=%+v err=%v", reopenedParent, err)
	}
	deepest := newChild
	for level := 3; level <= 6; level++ {
		deepest, err = tasks.CreateTask(CreateTaskInput{ParentID: &deepest.ID, Title: fmt.Sprintf("Level %d", level)})
		if err != nil {
			t.Fatal(err)
		}
	}
	if _, err := tasks.CreateTask(CreateTaskInput{ParentID: &deepest.ID, Title: "Level 7"}); !errors.Is(err, domain.ErrValidation) {
		t.Fatalf("expected six-level validation, got %v", err)
	}
	if err := features.CreateDependency(CreateDependencyInput{PredecessorID: parent.ID, SuccessorID: child.ID}); err != nil {
		t.Fatal(err)
	}
	if err := features.CreateDependency(CreateDependencyInput{PredecessorID: child.ID, SuccessorID: parent.ID}); !errors.Is(err, domain.ErrConflict) {
		t.Fatalf("expected cycle conflict, got %v", err)
	}
	attachment, err := features.ImportAttachment(ImportAttachmentInput{TaskID: parent.ID, OriginalName: "note.txt", MIMEType: "text/plain", DataBase64: base64.StdEncoding.EncodeToString([]byte("local"))})
	if err != nil || attachment.ByteSize != 5 {
		t.Fatalf("attachment=%+v err=%v", attachment, err)
	}
	now := time.Now().UTC()
	features.now = func() time.Time { return now }
	if _, err := features.StartPomodoro(StartPomodoroInput{TaskID: &parent.ID, PlannedSeconds: 60}); err != nil {
		t.Fatal(err)
	}
	now = now.Add(20 * time.Second)
	paused, err := features.PausePomodoro()
	if err != nil || paused == nil || paused.ElapsedSeconds != 20 {
		t.Fatalf("paused=%+v err=%v", paused, err)
	}
	now = now.Add(100 * time.Second)
	stillPaused, _ := features.GetActivePomodoro()
	if stillPaused == nil || stillPaused.ElapsedSeconds != 20 {
		t.Fatalf("paused timer advanced: %+v", stillPaused)
	}
	if _, err := features.ResumePomodoro(); err != nil {
		t.Fatal(err)
	}
	now = now.Add(41 * time.Second)
	active, err := features.GetActivePomodoro()
	if err != nil || active == nil || active.State != "completed" {
		t.Fatalf("timer=%+v err=%v", active, err)
	}

	backup := NewBackupService(db, filepath.Join(root, "backups"))
	if err := osMkdirAll(backup.backupDir); err != nil {
		t.Fatal(err)
	}
	createdBackup, err := backup.CreateBackup()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tasks.UpdateTask(UpdateTaskInput{ID: parent.ID, Title: "Changed after backup"}); err != nil {
		t.Fatal(err)
	}
	if err := backup.RestoreBackup(createdBackup.Name); err != nil {
		t.Fatal(err)
	}
	restored, err := tasks.GetTask(parent.ID)
	if err != nil || restored.Title != "Calendar launch" {
		t.Fatalf("restored=%+v err=%v", restored, err)
	}
	if err := backup.DeleteBackup(createdBackup.Name); err != nil {
		t.Fatal(err)
	}
	for index := 0; index < 12; index++ {
		backup.now = func() time.Time { return now.Add(time.Duration(index) * time.Second) }
		if _, err := backup.CreateBackup(); err != nil {
			t.Fatal(err)
		}
	}
	backups, err := backup.ListBackups()
	if err != nil || len(backups) != 10 {
		t.Fatalf("backups=%d err=%v", len(backups), err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if _, err := features.CreateReminder(CreateReminderInput{TaskID: parent.ID, RemindAt: now.Add(-time.Second)}); err != nil {
		t.Fatal(err)
	}
	select {
	case <-features.wakeReminders:
	default:
	}
	go features.runReminderScheduler(ctx)
	deadline := time.Now().Add(time.Second)
	for {
		reminders, err := features.ListReminders(parent.ID)
		if err != nil {
			t.Fatal(err)
		}
		if len(reminders) == 1 && reminders[0].Status == "fired" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("reminder was not fired: %+v", reminders)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func osMkdirAll(path string) error { return os.MkdirAll(path, 0o700) }
