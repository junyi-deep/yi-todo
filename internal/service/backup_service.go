package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/junyiwu/yi-todo/internal/domain"
	"github.com/wailsapp/wails/v3/pkg/application"
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

func (s *BackupService) CreateBackup() (BackupInfo, error) {
	name := "localtodo-" + s.now().UTC().Format("20060102-150405.000000000") + ".sqlite"
	path := filepath.Join(s.backupDir, name)
	escaped := strings.ReplaceAll(path, "'", "''")
	if _, err := s.db.ExecContext(s.ctx, "VACUUM INTO '"+escaped+"'"); err != nil {
		return BackupInfo{}, fmt.Errorf("create consistent backup: %w", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		return BackupInfo{}, err
	}
	return BackupInfo{Name: name, Path: path, Size: info.Size(), CreatedAt: info.ModTime()}, nil
}

func (s *BackupService) runDailyBackup(ctx context.Context) {
	for {
		items, err := s.ListBackups()
		today := s.now().UTC().Format("20060102")
		if err == nil && (len(items) == 0 || !strings.Contains(items[0].Name, today)) {
			_, _ = s.CreateBackup()
			items, _ = s.ListBackups()
		}
		for index := 30; index < len(items); index++ {
			_ = os.Remove(items[index].Path)
		}
		timer := time.NewTimer(6 * time.Hour)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
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

var exportTables = []string{"projects", "tasks", "tags", "task_tags", "task_dependencies", "attachments", "reminders", "pomodoro_sessions", "app_settings"}

func (s *BackupService) ExportData() (string, error) {
	out, err := exportDatabase(s.ctx, s.db, s.now().UTC())
	if err != nil {
		return "", err
	}
	data, err := json.MarshalIndent(out, "", "  ")
	return string(data), err
}

func exportDatabase(ctx context.Context, db *sql.DB, at time.Time) (dataExport, error) {
	out := dataExport{FormatVersion: 1, ExportedAt: at, Tables: map[string][]map[string]any{}}
	for _, table := range exportTables {
		rows, err := db.QueryContext(ctx, "SELECT * FROM "+table)
		if err != nil {
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
			values = append(values, item)
		}
		rows.Close()
		out.Tables[table] = values
	}
	return out, nil
}
func (s *BackupService) ImportData(payload string) error {
	var input dataExport
	if err := json.Unmarshal([]byte(payload), &input); err != nil {
		return fmt.Errorf("%w: invalid JSON export", domain.ErrValidation)
	}
	if input.FormatVersion != 1 {
		return fmt.Errorf("%w: unsupported formatVersion", domain.ErrValidation)
	}
	return s.importExport(input, false)
}

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
