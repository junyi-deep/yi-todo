package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
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
	where := " WHERE deleted_at IS NULL"
	args := make([]any, 0, 5)
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
	case "range":
		where += " AND status IN ('todo', 'in_progress') AND COALESCE(due_at, start_at) >= ? AND COALESCE(start_at, due_at) < ?"
		args = append(args, formatTime(*query.DueFrom), formatTime(*query.DueTo))
	}
	args = append(args, query.Limit, query.Offset)
	rows, err := r.db.QueryContext(ctx, taskSelect+where+`
        ORDER BY CASE status WHEN 'completed' THEN 1 ELSE 0 END,
                 sort_order ASC, created_at DESC
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

func (r *TaskRepository) SetTags(ctx context.Context, id string, tagIDs []string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("%w: begin set tags: %v", domain.ErrDatabase, err)
	}
	defer func() { _ = tx.Rollback() }()

	var exists int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks WHERE id = ? AND deleted_at IS NULL", id).Scan(&exists); err != nil {
		return fmt.Errorf("%w: check task for tags: %v", domain.ErrDatabase, err)
	}
	if exists == 0 {
		return fmt.Errorf("%w: task %s", domain.ErrNotFound, id)
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM task_tags WHERE task_id = ?", id); err != nil {
		return fmt.Errorf("%w: clear task tags: %v", domain.ErrDatabase, err)
	}
	for _, tagID := range tagIDs {
		if _, err := tx.ExecContext(ctx, "INSERT INTO task_tags(task_id, tag_id) VALUES (?, ?)", id, tagID); err != nil {
			return fmt.Errorf("%w: attach task tag: %v", domain.ErrDatabase, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("%w: commit task tags: %v", domain.ErrDatabase, err)
	}
	return nil
}

func (r *TaskRepository) GetTags(ctx context.Context, id string) ([]domain.Tag, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT t.id, t.name, t.color, t.created_at, t.updated_at
        FROM tags t JOIN task_tags tt ON tt.tag_id = t.id
        WHERE tt.task_id = ? ORDER BY t.name`, id)
	if err != nil {
		return nil, fmt.Errorf("%w: list task tags: %v", domain.ErrDatabase, err)
	}
	defer rows.Close()
	tags := make([]domain.Tag, 0)
	for rows.Next() {
		var tag domain.Tag
		var color sql.NullString
		var createdAt, updatedAt string
		if err := rows.Scan(&tag.ID, &tag.Name, &color, &createdAt, &updatedAt); err != nil {
			return nil, fmt.Errorf("%w: scan task tag: %v", domain.ErrDatabase, err)
		}
		tag.Color = stringPointer(color)
		if tag.CreatedAt, err = time.Parse(time.RFC3339Nano, createdAt); err != nil {
			return nil, fmt.Errorf("%w: parse tag created_at: %v", domain.ErrDatabase, err)
		}
		if tag.UpdatedAt, err = time.Parse(time.RFC3339Nano, updatedAt); err != nil {
			return nil, fmt.Errorf("%w: parse tag updated_at: %v", domain.ErrDatabase, err)
		}
		tags = append(tags, tag)
	}
	return tags, rows.Err()
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
