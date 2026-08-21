package service

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/junyiwu/yi-todo/internal/domain"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/xuri/excelize/v2"
)

type BackupService struct {
	db        *sql.DB
	backupDir string
	ctx       context.Context
	now       func() time.Time
}

func NewBackupService(db *sql.DB, backupDir string) *BackupService {
	return &BackupService{db: db, backupDir: backupDir, ctx: context.Background(), now: time.Now}
}
func (s *BackupService) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	s.ctx = ctx
	go s.runDailyBackup(ctx)
	return nil
}

type BackupInfo struct {
	Name      string    `json:"name"`
	Path      string    `json:"path"`
	Size      int64     `json:"size"`
	CreatedAt time.Time `json:"createdAt"`
}

type ExportTasksInput struct {
	All  bool       `json:"all"`
	From *time.Time `json:"from"`
	To   *time.Time `json:"to"`
}

func (s *BackupService) ExportTasksToExcel(input ExportTasksInput) (string, error) {
	if !input.All && (input.From == nil || input.To == nil || !input.To.After(*input.From)) {
		return "", fmt.Errorf("%w: export requires a valid time range", domain.ErrValidation)
	}
	app := application.Get()
	if app == nil {
		return "", fmt.Errorf("native save dialog is unavailable")
	}
	filename := "yi-todo-tasks-" + s.now().Format("20060102-150405") + ".xlsx"
	path, err := app.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:                "导出任务到 Excel",
		Filename:             filename,
		CanCreateDirectories: true,
		Filters:              []application.FileFilter{{DisplayName: "Excel 工作簿 (*.xlsx)", Pattern: "*.xlsx"}},
	}).PromptForSingleSelection()
	if err != nil || path == "" {
		return path, err
	}
	if !strings.HasSuffix(strings.ToLower(path), ".xlsx") {
		path += ".xlsx"
	}
	if err := s.writeTaskExport(path, input); err != nil {
		return "", err
	}
	return path, nil
}

func (s *BackupService) writeTaskExport(path string, input ExportTasksInput) error {
	file := excelize.NewFile()
	defer file.Close()
	if err := file.SetSheetName("Sheet1", "任务"); err != nil {
		return err
	}
	where, args := " WHERE t.deleted_at IS NULL", []any{}
	if !input.All {
		where += " AND t.created_at >= ? AND t.created_at < ?"
		args = append(args, input.From.UTC().Format(time.RFC3339Nano), input.To.UTC().Format(time.RFC3339Nano))
	}
	taskSQL := `SELECT t.id,t.parent_id,t.project_id,p.name AS project_name,c.name AS category_name,
        t.title,t.description_format,t.description_source,t.description_plain,t.status,t.priority,
        t.important,t.urgent,t.start_at,t.due_at,t.completed_at,t.estimated_minutes,t.actual_minutes,
        t.progress,t.sort_order,t.created_at,t.updated_at,t.deleted_at
        FROM tasks t LEFT JOIN projects p ON p.id=t.project_id LEFT JOIN categories c ON c.id=p.category_id` + where + ` ORDER BY t.created_at`
	if err := s.exportQuerySheet(file, "任务", taskSQL, args...); err != nil {
		return err
	}
	filterSubquery := "SELECT id FROM tasks t" + where
	if err := s.exportQuerySheet(file, "提醒", `SELECT id,task_id,remind_at,status,fired_at,repeat_type,repeat_value,created_at
        FROM reminders WHERE task_id IN (`+filterSubquery+`) ORDER BY created_at`, args...); err != nil {
		return err
	}
	if err := s.exportQuerySheet(file, "依赖", `SELECT predecessor_id,successor_id,dependency_type,created_at
        FROM task_dependencies WHERE predecessor_id IN (`+filterSubquery+`) OR successor_id IN (`+filterSubquery+`)
        ORDER BY created_at`, append(append([]any{}, args...), args...)...); err != nil {
		return err
	}
	if err := s.exportQuerySheet(file, "番茄钟", `SELECT id,task_id,state,planned_seconds,elapsed_seconds,started_at,expected_end_at,ended_at,created_at,updated_at
        FROM pomodoro_sessions WHERE task_id IN (`+filterSubquery+`) ORDER BY created_at`, args...); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	if err := file.SaveAs(path); err != nil {
		return fmt.Errorf("write Excel export: %w", err)
	}
	return nil
}

func (s *BackupService) exportQuerySheet(file *excelize.File, sheet, query string, args ...any) error {
	if sheet != "任务" {
		if _, err := file.NewSheet(sheet); err != nil {
			return err
		}
	}
	rows, err := s.db.QueryContext(s.ctx, query, args...)
	if err != nil {
		return fmt.Errorf("query export sheet %s: %w", sheet, err)
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		return err
	}
	stream, err := file.NewStreamWriter(sheet)
	if err != nil {
		return err
	}
	header := make([]any, len(columns))
	for index, name := range columns {
		header[index] = name
	}
	if err := stream.SetRow("A1", header); err != nil {
		return err
	}
	rowIndex := 2
	for rows.Next() {
		values := make([]any, len(columns))
		targets := make([]any, len(columns))
		for index := range values {
			targets[index] = &values[index]
		}
		if err := rows.Scan(targets...); err != nil {
			return err
		}
		for index, value := range values {
			if bytes, ok := value.([]byte); ok {
				values[index] = string(bytes)
			}
		}
		cell, _ := excelize.CoordinatesToCellName(1, rowIndex)
		if err := stream.SetRow(cell, values); err != nil {
			return err
		}
		rowIndex++
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if err := stream.Flush(); err != nil {
		return err
	}
	_ = file.SetColWidth(sheet, "A", "W", 16)
	return nil
}

func (s *BackupService) CreateBackup() (BackupInfo, error) {
	name := "yi-todo-" + s.now().UTC().Format("20060102-150405.000000000") + ".sqlite"
	path := filepath.Join(s.backupDir, name)
	escaped := strings.ReplaceAll(path, "'", "''")
	if _, err := s.db.ExecContext(s.ctx, "VACUUM INTO '"+escaped+"'"); err != nil {
		return BackupInfo{}, fmt.Errorf("create consistent backup: %w", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		return BackupInfo{}, err
	}
	result := BackupInfo{Name: name, Path: path, Size: info.Size(), CreatedAt: info.ModTime()}
	if err := s.pruneBackups(10); err != nil {
		return BackupInfo{}, fmt.Errorf("prune old backups: %w", err)
	}
	return result, nil
}

func (s *BackupService) runDailyBackup(ctx context.Context) {
	for {
		items, err := s.ListBackups()
		today := s.now().UTC().Format("20060102")
		if err == nil && (len(items) == 0 || !strings.Contains(items[0].Name, today)) {
			_, _ = s.CreateBackup()
			items, _ = s.ListBackups()
		}
		_ = s.pruneBackups(10)
		timer := time.NewTimer(6 * time.Hour)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}

func (s *BackupService) pruneBackups(retain int) error {
	items, err := s.ListBackups()
	if err != nil {
		return err
	}
	for index := retain; index < len(items); index++ {
		if err := os.Remove(items[index].Path); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

func (s *BackupService) DeleteBackup(name string) error {
	if filepath.Base(name) != name || !strings.HasSuffix(name, ".sqlite") {
		return fmt.Errorf("%w: invalid backup name", domain.ErrValidation)
	}
	if err := os.Remove(filepath.Join(s.backupDir, name)); err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("%w: backup not found", domain.ErrNotFound)
		}
		return err
	}
	return nil
}
func (s *BackupService) ListBackups() ([]BackupInfo, error) {
	entries, err := os.ReadDir(s.backupDir)
	if err != nil {
		return nil, err
	}
	items := make([]BackupInfo, 0)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sqlite") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		items = append(items, BackupInfo{Name: entry.Name(), Path: filepath.Join(s.backupDir, entry.Name()), Size: info.Size(), CreatedAt: info.ModTime()})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt.After(items[j].CreatedAt) })
	return items, nil
}

func (s *BackupService) RestoreBackup(name string) error {
	if filepath.Base(name) != name || !strings.HasSuffix(name, ".sqlite") {
		return fmt.Errorf("%w: invalid backup name", domain.ErrValidation)
	}
	path := filepath.Join(s.backupDir, name)
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("%w: backup not found", domain.ErrNotFound)
	}
	if _, err := s.CreateBackup(); err != nil {
		return fmt.Errorf("safety backup: %w", err)
	}
	backupDB, err := sql.Open("sqlite", path)
	if err != nil {
		return err
	}
	defer backupDB.Close()
	exported, err := exportDatabase(s.ctx, backupDB, s.now().UTC())
	if err != nil {
		return err
	}
	return s.importExport(exported, true)
}

type dataExport struct {
	FormatVersion int                         `json:"formatVersion"`
	ExportedAt    time.Time                   `json:"exportedAt"`
	Tables        map[string][]map[string]any `json:"tables"`
}

var exportTables = []string{"categories", "projects", "tasks", "task_dependencies", "attachments", "reminders", "pomodoro_sessions", "app_settings"}

func exportDatabase(ctx context.Context, db *sql.DB, at time.Time) (dataExport, error) {
	out := dataExport{FormatVersion: 1, ExportedAt: at, Tables: map[string][]map[string]any{}}
	for _, table := range exportTables {
		rows, err := db.QueryContext(ctx, "SELECT * FROM "+table)
		if err != nil {
			if table == "categories" && strings.Contains(strings.ToLower(err.Error()), "no such table") {
				out.Tables[table] = []map[string]any{{
					"id": "00000000-0000-7000-8000-000000000001", "parent_id": nil,
					"name": "默认分类", "sort_order": 1000, "created_at": formatExportTime(at), "updated_at": formatExportTime(at),
				}}
				continue
			}
			return dataExport{}, err
		}
		columns, _ := rows.Columns()
		var values = []map[string]any{}
		for rows.Next() {
			raw := make([]any, len(columns))
			ptr := make([]any, len(columns))
			for i := range raw {
				ptr[i] = &raw[i]
			}
			if err := rows.Scan(ptr...); err != nil {
				rows.Close()
				return dataExport{}, err
			}
			item := map[string]any{}
			for i, name := range columns {
				if bytes, ok := raw[i].([]byte); ok {
					item[name] = string(bytes)
				} else {
					item[name] = raw[i]
				}
			}
			if table == "projects" {
				if _, exists := item["category_id"]; !exists {
					item["category_id"] = "00000000-0000-7000-8000-000000000001"
				}
			}
			values = append(values, item)
		}
		rows.Close()
		out.Tables[table] = values
	}
	return out, nil
}

func formatExportTime(value time.Time) string { return value.UTC().Format(time.RFC3339Nano) }
func (s *BackupService) importExport(input dataExport, replace bool) error {
	tx, err := s.db.BeginTx(s.ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if replace {
		for index := len(exportTables) - 1; index >= 0; index-- {
			if _, err := tx.ExecContext(s.ctx, "DELETE FROM "+exportTables[index]); err != nil {
				return err
			}
		}
	}
	for _, table := range exportTables {
		for _, row := range input.Tables[table] {
			columns := make([]string, 0, len(row))
			for column := range row {
				columns = append(columns, column)
			}
			sort.Strings(columns)
			marks := make([]string, len(columns))
			args := make([]any, len(columns))
			for i, column := range columns {
				if !safeIdentifier(column) {
					return fmt.Errorf("%w: invalid column", domain.ErrValidation)
				}
				marks[i] = "?"
				args[i] = row[column]
			}
			query := `INSERT OR IGNORE INTO ` + table + ` (` + strings.Join(columns, ",") + `) VALUES (` + strings.Join(marks, ",") + ")"
			if _, err := tx.ExecContext(s.ctx, query, args...); err != nil {
				return fmt.Errorf("import %s: %w", table, err)
			}
		}
	}
	return tx.Commit()
}
func safeIdentifier(value string) bool {
	if value == "" {
		return false
	}
	for _, r := range value {
		if !(r == '_' || r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9') {
			return false
		}
	}
	return true
}
