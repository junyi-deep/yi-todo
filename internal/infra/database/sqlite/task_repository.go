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

type TaskRepository struct {
	db *sql.DB
}

func NewTaskRepository(db *sql.DB) *TaskRepository {
	return &TaskRepository{db: db}
}

func (r *TaskRepository) Create(ctx context.Context, task domain.Task) (domain.Task, error) {
	_, err := r.db.ExecContext(ctx, `INSERT INTO tasks (
        id, parent_id, project_id, title,
        description_format, description_source, description_plain,
        status, priority, important, urgent,
        start_at, due_at, completed_at,
        estimated_minutes, actual_minutes, progress, sort_order,
        created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		task.ID, nullableString(task.ParentID), nullableString(task.ProjectID), task.Title,
		task.DescriptionFormat, task.DescriptionSource, task.DescriptionPlain,
		task.Status, task.Priority, boolInt(task.Important), boolInt(task.Urgent),
		nullableTime(task.StartAt), nullableTime(task.DueAt), nullableTime(task.CompletedAt),
		nullableInt(task.EstimatedMinutes), task.ActualMinutes, task.Progress, task.SortOrder,
		formatTime(task.CreatedAt), formatTime(task.UpdatedAt), nullableTime(task.DeletedAt),
	)
	if err != nil {
		return domain.Task{}, fmt.Errorf("%w: create task: %v", domain.ErrDatabase, err)
	}
	return task, nil
}

func (r *TaskRepository) Get(ctx context.Context, id string) (domain.Task, error) {
	row := r.db.QueryRowContext(ctx, taskSelect+" WHERE id = ? AND deleted_at IS NULL", id)
	task, err := scanTask(row)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Task{}, fmt.Errorf("%w: task %s", domain.ErrNotFound, id)
	}
	if err != nil {
		return domain.Task{}, fmt.Errorf("%w: get task: %v", domain.ErrDatabase, err)
	}
	return task, nil
}

func (r *TaskRepository) List(ctx context.Context, query repository.TaskListQuery) ([]domain.Task, error) {
	where, args := taskListWhere(query)
	orderBy := "sort_order ASC, created_at DESC"
	switch query.Sort {
	case "start":
		orderBy = "start_at IS NULL, start_at ASC, sort_order ASC"
	case "due":
		orderBy = "due_at IS NULL, due_at ASC, sort_order ASC"
	case "title":
		orderBy = "title COLLATE NOCASE ASC, sort_order ASC"
	case "created":
		orderBy = "created_at DESC"
	}
	args = append(args, query.Limit, query.Offset)
	rows, err := r.db.QueryContext(ctx, taskSelect+where+`
        ORDER BY CASE status WHEN 'completed' THEN 1 ELSE 0 END, `+orderBy+`
        LIMIT ? OFFSET ?`, args...)
	if err != nil {
		return nil, fmt.Errorf("%w: list tasks: %v", domain.ErrDatabase, err)
	}
	defer rows.Close()

	tasks := make([]domain.Task, 0)
	for rows.Next() {
		task, err := scanTask(rows)
		if err != nil {
			return nil, fmt.Errorf("%w: scan task: %v", domain.ErrDatabase, err)
		}
		tasks = append(tasks, task)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("%w: iterate tasks: %v", domain.ErrDatabase, err)
	}
	return tasks, nil
}

func (r *TaskRepository) Count(ctx context.Context, query repository.TaskListQuery) (int, error) {
	where, args := taskListWhere(query)
	var count int
	if err := r.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks"+where, args...).Scan(&count); err != nil {
		return 0, fmt.Errorf("%w: count tasks: %v", domain.ErrDatabase, err)
	}
	return count, nil
}

func (r *TaskRepository) ChildCounts(ctx context.Context, ids []string) (map[string]int, error) {
	return childCounts(ctx, r.db, ids)
}

func taskListWhere(query repository.TaskListQuery) (string, []any) {
	where := " WHERE deleted_at IS NULL"
	args := make([]any, 0, 12)
	switch query.View {
	case "inbox":
		where += " AND project_id IS NULL AND status IN ('todo', 'in_progress')"
	case "all":
		where += " AND status IN ('todo', 'in_progress')"
	case "completed":
		where += " AND status = 'completed'"
	case "today":
		where += " AND status IN ('todo', 'in_progress') AND ((due_at >= ? AND due_at < ?) OR (start_at >= ? AND start_at < ?))"
		args = append(args, formatTime(*query.DueFrom), formatTime(*query.DueTo), formatTime(*query.DueFrom), formatTime(*query.DueTo))
	case "upcoming":
		where += " AND status IN ('todo', 'in_progress') AND due_at >= ?"
		args = append(args, formatTime(*query.DueFrom))
	case "project":
		where += " AND status IN ('todo', 'in_progress') AND project_id = ?"
		args = append(args, *query.ProjectID)
	case "category":
		where += ` AND status IN ('todo', 'in_progress') AND project_id IN (
            WITH RECURSIVE descendants(id) AS (
                SELECT id FROM categories WHERE id = ?
                UNION ALL SELECT c.id FROM categories c JOIN descendants d ON c.parent_id = d.id
            )
            SELECT p.id FROM projects p JOIN descendants d ON p.category_id = d.id
            WHERE p.archived_at IS NULL
        )`
		args = append(args, *query.CategoryID)
	case "range":
		where += " AND status IN ('todo', 'in_progress') AND COALESCE(due_at, start_at) >= ? AND COALESCE(start_at, due_at) < ?"
		args = append(args, formatTime(*query.DueFrom), formatTime(*query.DueTo))
	}
	if query.Status != nil {
		where += " AND status = ?"
		args = append(args, *query.Status)
	}
	if query.Important != nil {
		where += " AND important = ?"
		args = append(args, boolInt(*query.Important))
	}
	if query.Urgent != nil {
		where += " AND urgent = ?"
		args = append(args, boolInt(*query.Urgent))
	}
	if query.StartFrom != nil {
		where += " AND start_at >= ?"
		args = append(args, formatTime(*query.StartFrom))
	}
	if query.EndTo != nil {
		where += " AND due_at <= ?"
		args = append(args, formatTime(*query.EndTo))
	}
	if query.TitleQuery != "" {
		where += ` AND title LIKE ? ESCAPE '\'`
		args = append(args, "%"+escapeLike(query.TitleQuery)+"%")
	}
	return where, args
}

func escapeLike(value string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(value)
}

func childCounts(ctx context.Context, db *sql.DB, ids []string) (map[string]int, error) {
	result := make(map[string]int, len(ids))
	if len(ids) == 0 {
		return result, nil
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
	args := make([]any, len(ids))
	for index, id := range ids {
		args[index] = id
	}
	rows, err := db.QueryContext(ctx, `SELECT parent_id, COUNT(*) FROM tasks WHERE deleted_at IS NULL AND parent_id IN (`+placeholders+`) GROUP BY parent_id`, args...)
	if err != nil {
		return nil, fmt.Errorf("%w: count child tasks: %v", domain.ErrDatabase, err)
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var count int
		if err := rows.Scan(&id, &count); err != nil {
			return nil, err
		}
		result[id] = count
	}
	return result, rows.Err()
}

func (r *TaskRepository) UpdateMetadata(ctx context.Context, id string, update repository.TaskMetadataUpdate, updatedAt time.Time) (domain.Task, error) {
	result, err := r.db.ExecContext(ctx, `UPDATE tasks SET
        project_id = ?, priority = ?, important = ?, urgent = ?,
        start_at = ?, due_at = ?, progress = ?, estimated_minutes = ?, updated_at = ?
        WHERE id = ? AND deleted_at IS NULL`,
		nullableString(update.ProjectID), update.Priority, boolInt(update.Important), boolInt(update.Urgent),
		nullableTime(update.StartAt), nullableTime(update.DueAt), update.Progress,
		nullableInt(update.EstimatedMinutes), formatTime(updatedAt), id,
	)
	if err != nil {
		return domain.Task{}, fmt.Errorf("%w: update task metadata: %v", domain.ErrDatabase, err)
	}
	if err := requireAffected(result, id); err != nil {
		return domain.Task{}, err
	}
	return r.Get(ctx, id)
}

func (r *TaskRepository) UpdateTitle(ctx context.Context, id, title string, updatedAt time.Time) (domain.Task, error) {
	result, err := r.db.ExecContext(ctx,
		"UPDATE tasks SET title = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
		title, formatTime(updatedAt), id,
	)
	if err != nil {
		return domain.Task{}, fmt.Errorf("%w: update task title: %v", domain.ErrDatabase, err)
	}
	if err := requireAffected(result, id); err != nil {
		return domain.Task{}, err
	}
	return r.Get(ctx, id)
}

func (r *TaskRepository) SetCompletion(ctx context.Context, id string, completed bool, at time.Time) (domain.Task, error) {
	status := domain.TaskStatusTodo
	progress := 0
	var completedAt any
	if completed {
		status = domain.TaskStatusCompleted
		progress = 100
		completedAt = formatTime(at)
	}
	result, err := r.db.ExecContext(ctx, `UPDATE tasks
        SET status = ?, completed_at = ?, progress = ?, updated_at = ?
        WHERE id = ? AND deleted_at IS NULL`,
		status, completedAt, progress, formatTime(at), id,
	)
	if err != nil {
		return domain.Task{}, fmt.Errorf("%w: update task completion: %v", domain.ErrDatabase, err)
	}
	if err := requireAffected(result, id); err != nil {
		return domain.Task{}, err
	}
	return r.Get(ctx, id)
}

func (r *TaskRepository) SetStatus(ctx context.Context, id string, status domain.TaskStatus, at time.Time) (domain.Task, error) {
	completedAt := any(nil)
	if status == domain.TaskStatusCompleted {
		completedAt = formatTime(at)
	}
	result, err := r.db.ExecContext(ctx, `UPDATE tasks SET status=?,progress=CASE WHEN ?='completed' THEN 100 WHEN ?='in_progress' AND progress IN (0,100) THEN 50 WHEN ?='todo' AND progress=100 THEN 0 ELSE progress END,completed_at=?,updated_at=? WHERE id=? AND deleted_at IS NULL`, status, status, status, status, completedAt, formatTime(at), id)
	if err != nil {
		return domain.Task{}, fmt.Errorf("%w: update task status: %v", domain.ErrDatabase, err)
	}
	if err := requireAffected(result, id); err != nil {
		return domain.Task{}, err
	}
	return r.Get(ctx, id)
}

func (r *TaskRepository) Depth(ctx context.Context, id string) (int, error) {
	var depth int
	err := r.db.QueryRowContext(ctx, `WITH RECURSIVE ancestors(id,parent_id,depth) AS (SELECT id,parent_id,1 FROM tasks WHERE id=? AND deleted_at IS NULL UNION ALL SELECT t.id,t.parent_id,a.depth+1 FROM tasks t JOIN ancestors a ON t.id=a.parent_id WHERE t.deleted_at IS NULL) SELECT COALESCE(MAX(depth),0) FROM ancestors`, id).Scan(&depth)
	return depth, err
}

func (r *TaskRepository) ReconcileAncestors(ctx context.Context, id string, at time.Time) error {
	current := id
	for level := 0; level < 6; level++ {
		var parent sql.NullString
		if err := r.db.QueryRowContext(ctx, `SELECT parent_id FROM tasks WHERE id=?`, current).Scan(&parent); err != nil || !parent.Valid {
			return err
		}
		var total, completed, started int
		if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*),COALESCE(SUM(status='completed'),0),COALESCE(SUM(status IN ('completed','in_progress')),0) FROM tasks WHERE parent_id=? AND deleted_at IS NULL`, parent.String).Scan(&total, &completed, &started); err != nil {
			return err
		}
		status := domain.TaskStatusTodo
		progress := 0
		var completedAt any
		if total > 0 && completed == total {
			status = domain.TaskStatusCompleted
			progress = 100
			completedAt = formatTime(at)
		} else if started > 0 {
			status = domain.TaskStatusInProgress
			progress = completed * 100 / total
		}
		if _, err := r.db.ExecContext(ctx, `UPDATE tasks SET status=?,progress=?,completed_at=?,updated_at=? WHERE id=?`, status, progress, completedAt, formatTime(at), parent.String); err != nil {
			return err
		}
		current = parent.String
	}
	return nil
}

func (r *TaskRepository) SoftDelete(ctx context.Context, id string, at time.Time) error {
	result, err := r.db.ExecContext(ctx,
		"UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
		formatTime(at), formatTime(at), id,
	)
	if err != nil {
		return fmt.Errorf("%w: delete task: %v", domain.ErrDatabase, err)
	}
	return requireAffected(result, id)
}

const taskSelect = `SELECT
    id, parent_id, project_id, title,
    description_format, description_source, description_plain,
    status, priority, important, urgent,
    start_at, due_at, completed_at,
    estimated_minutes, actual_minutes, progress, sort_order,
    created_at, updated_at, deleted_at
FROM tasks`

type scanner interface {
	Scan(dest ...any) error
}

func scanTask(row scanner) (domain.Task, error) {
	var task domain.Task
	var parentID, projectID sql.NullString
	var startAt, dueAt, completedAt, deletedAt sql.NullString
	var estimatedMinutes sql.NullInt64
	var important, urgent int
	var createdAt, updatedAt string

	err := row.Scan(
		&task.ID, &parentID, &projectID, &task.Title,
		&task.DescriptionFormat, &task.DescriptionSource, &task.DescriptionPlain,
		&task.Status, &task.Priority, &important, &urgent,
		&startAt, &dueAt, &completedAt,
		&estimatedMinutes, &task.ActualMinutes, &task.Progress, &task.SortOrder,
		&createdAt, &updatedAt, &deletedAt,
	)
	if err != nil {
		return domain.Task{}, err
	}

	task.ParentID = stringPointer(parentID)
	task.ProjectID = stringPointer(projectID)
	task.Important = important != 0
	task.Urgent = urgent != 0
	if estimatedMinutes.Valid {
		value := int(estimatedMinutes.Int64)
		task.EstimatedMinutes = &value
	}
	if task.StartAt, err = parseNullableTime(startAt); err != nil {
		return domain.Task{}, err
	}
	if task.DueAt, err = parseNullableTime(dueAt); err != nil {
		return domain.Task{}, err
	}
	if task.CompletedAt, err = parseNullableTime(completedAt); err != nil {
		return domain.Task{}, err
	}
	if task.DeletedAt, err = parseNullableTime(deletedAt); err != nil {
		return domain.Task{}, err
	}
	if task.CreatedAt, err = time.Parse(time.RFC3339Nano, createdAt); err != nil {
		return domain.Task{}, fmt.Errorf("parse created_at: %w", err)
	}
	if task.UpdatedAt, err = time.Parse(time.RFC3339Nano, updatedAt); err != nil {
		return domain.Task{}, fmt.Errorf("parse updated_at: %w", err)
	}
	return task, nil
}

func requireAffected(result sql.Result, id string) error {
	count, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("%w: rows affected: %v", domain.ErrDatabase, err)
	}
	if count == 0 {
		return fmt.Errorf("%w: task %s", domain.ErrNotFound, id)
	}
	return nil
}

func formatTime(value time.Time) string {
	return value.UTC().Format(time.RFC3339Nano)
}

func nullableTime(value *time.Time) any {
	if value == nil {
		return nil
	}
	return formatTime(*value)
}

func parseNullableTime(value sql.NullString) (*time.Time, error) {
	if !value.Valid {
		return nil, nil
	}
	parsed, err := time.Parse(time.RFC3339Nano, value.String)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

func nullableString(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func stringPointer(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

func nullableInt(value *int) any {
	if value == nil {
		return nil
	}
	return *value
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

var _ repository.TaskRepository = (*TaskRepository)(nil)
