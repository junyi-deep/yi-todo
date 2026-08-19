package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/junyiwu/yi-todo/internal/domain"
	"github.com/junyiwu/yi-todo/internal/repository"
)

type FeatureRepository struct{ db *sql.DB }

func NewFeatureRepository(db *sql.DB) *FeatureRepository { return &FeatureRepository{db: db} }

func (r *FeatureRepository) UpdateDescription(ctx context.Context, id, format, source, plain string, at time.Time) (domain.Task, error) {
	result, err := r.db.ExecContext(ctx, `UPDATE tasks SET description_format=?, description_source=?, description_plain=?, updated_at=? WHERE id=? AND deleted_at IS NULL`, format, source, plain, formatTime(at), id)
	if err != nil {
		return domain.Task{}, fmt.Errorf("%w: update description: %v", domain.ErrDatabase, err)
	}
	if err := requireAffected(result, id); err != nil {
		return domain.Task{}, err
	}
	return NewTaskRepository(r.db).Get(ctx, id)
}

func (r *FeatureRepository) CreateChild(ctx context.Context, task domain.Task) (domain.Task, error) {
	return NewTaskRepository(r.db).Create(ctx, task)
}

func (r *FeatureRepository) ListChildren(ctx context.Context, parentID string) ([]domain.Task, error) {
	rows, err := r.db.QueryContext(ctx, taskSelect+` WHERE parent_id=? AND deleted_at IS NULL ORDER BY sort_order, created_at`, parentID)
	if err != nil {
		return nil, fmt.Errorf("%w: list subtasks: %v", domain.ErrDatabase, err)
	}
	defer rows.Close()
	var result []domain.Task
	for rows.Next() {
		task, scanErr := scanTask(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		result = append(result, task)
	}
	return result, rows.Err()
}

func (r *FeatureRepository) Search(ctx context.Context, query repository.SearchQuery) ([]domain.SearchResult, error) {
	statement := `SELECT DISTINCT t.id,t.title,t.description_plain,p.name,t.due_at FROM tasks t LEFT JOIN projects p ON p.id=t.project_id WHERE t.deleted_at IS NULL`
	args := make([]any, 0, 12)
	if query.Keyword != "" {
		like := "%" + strings.Trim(query.Keyword, `"*`) + "%"
		statement += ` AND (t.id IN (SELECT task_id FROM task_fts WHERE task_fts MATCH ?) OR p.name LIKE ? OR EXISTS(SELECT 1 FROM task_tags tt JOIN tags tag ON tag.id=tt.tag_id WHERE tt.task_id=t.id AND tag.name LIKE ?))`
		args = append(args, query.Keyword, like, like)
	}
	if query.Project != "" {
		statement += ` AND (p.id=? OR p.name LIKE ?)`
		args = append(args, query.Project, "%"+query.Project+"%")
	}
	for _, tag := range query.Tags {
		statement += ` AND EXISTS(SELECT 1 FROM task_tags tt JOIN tags ttag ON ttag.id=tt.tag_id WHERE tt.task_id=t.id AND (ttag.id=? OR ttag.name LIKE ?))`
		args = append(args, tag, "%"+tag+"%")
	}
	if query.Status != "" {
		statement += ` AND t.status=?`
		args = append(args, query.Status)
	}
	if query.DueFrom != nil {
		statement += ` AND t.due_at>=?`
		args = append(args, formatTime(*query.DueFrom))
	}
	if query.DueTo != nil {
		statement += ` AND t.due_at<?`
		args = append(args, formatTime(*query.DueTo))
	}
	statement += ` ORDER BY t.updated_at DESC LIMIT ? OFFSET ?`
	args = append(args, query.Limit, query.Offset)
	rows, err := r.db.QueryContext(ctx, statement, args...)
	if err != nil {
		return nil, fmt.Errorf("%w: search tasks: %v", domain.ErrDatabase, err)
	}
	defer rows.Close()
	results := make([]domain.SearchResult, 0)
	for rows.Next() {
		var item domain.SearchResult
		var project, due sql.NullString
		if err := rows.Scan(&item.ID, &item.Title, &item.DescriptionPlain, &project, &due); err != nil {
			return nil, err
		}
		item.ProjectName = stringPointer(project)
		parsed, err := parseNullableTime(due)
		if err != nil {
			return nil, err
		}
		item.DueAt = parsed
		results = append(results, item)
	}
	return results, rows.Err()
}

func (r *FeatureRepository) CreateDependency(ctx context.Context, dependency domain.Dependency) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO task_dependencies(predecessor_id,successor_id,dependency_type,created_at) VALUES(?,?,?,?)`, dependency.PredecessorID, dependency.SuccessorID, dependency.Type, formatTime(dependency.CreatedAt))
	if err != nil {
		return fmt.Errorf("%w: create dependency: %v", domain.ErrDatabase, err)
	}
	return nil
}

func (r *FeatureRepository) ListDependencies(ctx context.Context) ([]domain.Dependency, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT predecessor_id,successor_id,dependency_type,created_at FROM task_dependencies ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []domain.Dependency
	for rows.Next() {
		var item domain.Dependency
		var created string
		if err := rows.Scan(&item.PredecessorID, &item.SuccessorID, &item.Type, &created); err != nil {
			return nil, err
		}
		item.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *FeatureRepository) DependencyPathExists(ctx context.Context, from, to string) (bool, error) {
	var found int
	err := r.db.QueryRowContext(ctx, `WITH RECURSIVE path(id) AS (SELECT successor_id FROM task_dependencies WHERE predecessor_id=? UNION SELECT d.successor_id FROM task_dependencies d JOIN path p ON d.predecessor_id=p.id) SELECT EXISTS(SELECT 1 FROM path WHERE id=?)`, from, to).Scan(&found)
	return found != 0, err
}

func (r *FeatureRepository) CreateAttachment(ctx context.Context, item domain.Attachment) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO attachments(id,task_id,original_name,stored_name,relative_path,mime_type,byte_size,created_at) VALUES(?,?,?,?,?,?,?,?)`, item.ID, item.TaskID, item.OriginalName, item.StoredName, item.RelativePath, item.MIMEType, item.ByteSize, formatTime(item.CreatedAt))
	return err
}

func (r *FeatureRepository) ListAttachments(ctx context.Context, taskID string) ([]domain.Attachment, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,task_id,original_name,stored_name,relative_path,mime_type,byte_size,created_at FROM attachments WHERE task_id=? ORDER BY created_at`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []domain.Attachment
	for rows.Next() {
		var item domain.Attachment
		var created string
		if err := rows.Scan(&item.ID, &item.TaskID, &item.OriginalName, &item.StoredName, &item.RelativePath, &item.MIMEType, &item.ByteSize, &created); err != nil {
			return nil, err
		}
		item.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *FeatureRepository) GetAttachment(ctx context.Context, id string) (domain.Attachment, error) {
	var item domain.Attachment
	var created string
	err := r.db.QueryRowContext(ctx, `SELECT id,task_id,original_name,stored_name,relative_path,mime_type,byte_size,created_at FROM attachments WHERE id=?`, id).Scan(&item.ID, &item.TaskID, &item.OriginalName, &item.StoredName, &item.RelativePath, &item.MIMEType, &item.ByteSize, &created)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Attachment{}, fmt.Errorf("%w: attachment %s", domain.ErrNotFound, id)
	}
	if err != nil {
		return domain.Attachment{}, err
	}
	item.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
	return item, nil
}

func (r *FeatureRepository) CreateReminder(ctx context.Context, item domain.Reminder) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO reminders(id,task_id,remind_at,status,created_at) VALUES(?,?,?,?,?)`, item.ID, item.TaskID, formatTime(item.RemindAt), item.Status, formatTime(item.CreatedAt))
	return err
}
func (r *FeatureRepository) ListReminders(ctx context.Context, taskID string) ([]domain.Reminder, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id,task_id,remind_at,status,fired_at,created_at FROM reminders WHERE task_id=? ORDER BY remind_at`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []domain.Reminder
	for rows.Next() {
		var x domain.Reminder
		var remind, created string
		var fired sql.NullString
		if err := rows.Scan(&x.ID, &x.TaskID, &remind, &x.Status, &fired, &created); err != nil {
			return nil, err
		}
		x.RemindAt, _ = time.Parse(time.RFC3339Nano, remind)
		x.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
		x.FiredAt, _ = parseNullableTime(fired)
		items = append(items, x)
	}
	return items, rows.Err()
}

func (r *FeatureRepository) GetNextReminder(ctx context.Context) (*domain.Reminder, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id,task_id,remind_at,status,fired_at,created_at FROM reminders WHERE status='pending' ORDER BY remind_at LIMIT 1`)
	var item domain.Reminder
	var remindAt, createdAt string
	var firedAt sql.NullString
	if err := row.Scan(&item.ID, &item.TaskID, &remindAt, &item.Status, &firedAt, &createdAt); errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	} else if err != nil {
		return nil, err
	}
	item.RemindAt, _ = time.Parse(time.RFC3339Nano, remindAt)
	item.CreatedAt, _ = time.Parse(time.RFC3339Nano, createdAt)
	item.FiredAt, _ = parseNullableTime(firedAt)
	return &item, nil
}

func (r *FeatureRepository) MarkReminderFired(ctx context.Context, id string, at time.Time) error {
	_, err := r.db.ExecContext(ctx, `UPDATE reminders SET status='fired',fired_at=? WHERE id=? AND status='pending'`, formatTime(at), id)
	return err
}

func (r *FeatureRepository) CreatePomodoro(ctx context.Context, x domain.PomodoroSession) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO pomodoro_sessions(id,task_id,state,planned_seconds,elapsed_seconds,started_at,expected_end_at,ended_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`, x.ID, nullableString(x.TaskID), x.State, x.PlannedSeconds, x.ElapsedSeconds, nullableTime(x.StartedAt), nullableTime(x.ExpectedEndAt), nullableTime(x.EndedAt), formatTime(x.CreatedAt), formatTime(x.UpdatedAt))
	return err
}
func (r *FeatureRepository) UpdatePomodoro(ctx context.Context, x domain.PomodoroSession) error {
	_, err := r.db.ExecContext(ctx, `UPDATE pomodoro_sessions SET state=?,elapsed_seconds=?,started_at=?,expected_end_at=?,ended_at=?,updated_at=? WHERE id=?`, x.State, x.ElapsedSeconds, nullableTime(x.StartedAt), nullableTime(x.ExpectedEndAt), nullableTime(x.EndedAt), formatTime(x.UpdatedAt), x.ID)
	return err
}
func (r *FeatureRepository) GetActivePomodoro(ctx context.Context) (*domain.PomodoroSession, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id,task_id,state,planned_seconds,elapsed_seconds,started_at,expected_end_at,ended_at,created_at,updated_at FROM pomodoro_sessions WHERE state IN ('running','paused') ORDER BY created_at DESC LIMIT 1`)
	x, err := scanPomodoro(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return x, err
}

func scanPomodoro(row scanner) (*domain.PomodoroSession, error) {
	var x domain.PomodoroSession
	var task, started, expected, ended sql.NullString
	var created, updated string
	if err := row.Scan(&x.ID, &task, &x.State, &x.PlannedSeconds, &x.ElapsedSeconds, &started, &expected, &ended, &created, &updated); err != nil {
		return nil, err
	}
	x.TaskID = stringPointer(task)
	x.StartedAt, _ = parseNullableTime(started)
	x.ExpectedEndAt, _ = parseNullableTime(expected)
	x.EndedAt, _ = parseNullableTime(ended)
	x.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
	x.UpdatedAt, _ = time.Parse(time.RFC3339Nano, updated)
	return &x, nil
}

func (r *FeatureRepository) GetStats(ctx context.Context, from, to time.Time) (domain.StatsOverview, []domain.TrendPoint, []domain.ProjectStat, error) {
	var o domain.StatsOverview
	startToday := time.Now().UTC().Truncate(24 * time.Hour)
	_ = r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tasks WHERE completed_at>=? AND deleted_at IS NULL`, formatTime(startToday)).Scan(&o.TodayCompleted)
	_ = r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tasks WHERE completed_at>=? AND deleted_at IS NULL`, formatTime(from)).Scan(&o.WeekCompleted)
	var total, completed int
	_ = r.db.QueryRowContext(ctx, `SELECT COUNT(*),SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) FROM tasks WHERE created_at<? AND deleted_at IS NULL`, formatTime(to)).Scan(&total, &completed)
	if total > 0 {
		o.CompletionRate = float64(completed) * 100 / float64(total)
	}
	_ = r.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(elapsed_seconds)/60,0),COUNT(*) FROM pomodoro_sessions WHERE state='completed' AND created_at>=? AND created_at<?`, formatTime(from), formatTime(to)).Scan(&o.FocusMinutes, &o.PomodoroCount)
	_ = r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tasks WHERE status!='completed' AND due_at<? AND deleted_at IS NULL`, formatTime(time.Now().UTC())).Scan(&o.OverdueCount)
	rows, err := r.db.QueryContext(ctx, `SELECT substr(completed_at,1,10),COUNT(*) FROM tasks WHERE completed_at>=? AND completed_at<? AND deleted_at IS NULL GROUP BY 1 ORDER BY 1`, formatTime(from), formatTime(to))
	if err != nil {
		return o, nil, nil, err
	}
	var trend []domain.TrendPoint
	for rows.Next() {
		var p domain.TrendPoint
		_ = rows.Scan(&p.Date, &p.Value)
		trend = append(trend, p)
	}
	rows.Close()
	rows, err = r.db.QueryContext(ctx, `SELECT COALESCE(p.name,'收件箱'),COUNT(*) FROM tasks t LEFT JOIN projects p ON p.id=t.project_id WHERE t.deleted_at IS NULL GROUP BY p.id ORDER BY COUNT(*) DESC`)
	if err != nil {
		return o, trend, nil, err
	}
	defer rows.Close()
	var projects []domain.ProjectStat
	for rows.Next() {
		var p domain.ProjectStat
		_ = rows.Scan(&p.Name, &p.Value)
		projects = append(projects, p)
	}
	return o, trend, projects, rows.Err()
}

func (r *FeatureRepository) GetSetting(ctx context.Context, key string) (string, error) {
	var value string
	err := r.db.QueryRowContext(ctx, `SELECT value FROM app_settings WHERE key=?`, key).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return value, err
}
func (r *FeatureRepository) SetSetting(ctx context.Context, key, value string, at time.Time) error {
	_, err := r.db.ExecContext(ctx, `INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`, key, value, formatTime(at))
	return err
}

var _ repository.FeatureRepository = (*FeatureRepository)(nil)
