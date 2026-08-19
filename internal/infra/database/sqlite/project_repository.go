package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/junyiwu/yi-todo/internal/domain"
	"github.com/junyiwu/yi-todo/internal/repository"
)

type ProjectRepository struct{ db *sql.DB }

func NewProjectRepository(db *sql.DB) *ProjectRepository { return &ProjectRepository{db: db} }

func (r *ProjectRepository) Create(ctx context.Context, project domain.Project) (domain.Project, error) {
	_, err := r.db.ExecContext(ctx, `INSERT INTO projects
        (id, name, description, color, icon, sort_order, archived_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`, project.ID, project.Name, project.Description,
		nullableString(project.Color), nullableString(project.Icon), project.SortOrder,
		formatTime(project.CreatedAt), formatTime(project.UpdatedAt))
	if err != nil {
		return domain.Project{}, fmt.Errorf("%w: create project: %v", domain.ErrDatabase, err)
	}
	return project, nil
}

func (r *ProjectRepository) List(ctx context.Context) ([]domain.Project, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, name, description, color, icon, sort_order,
        archived_at, created_at, updated_at FROM projects WHERE archived_at IS NULL
        ORDER BY sort_order, name`)
	if err != nil {
		return nil, fmt.Errorf("%w: list projects: %v", domain.ErrDatabase, err)
	}
	defer rows.Close()
	projects := make([]domain.Project, 0)
	for rows.Next() {
		var project domain.Project
		var color, icon, archivedAt sql.NullString
		var createdAt, updatedAt string
		if err := rows.Scan(&project.ID, &project.Name, &project.Description, &color, &icon,
			&project.SortOrder, &archivedAt, &createdAt, &updatedAt); err != nil {
			return nil, fmt.Errorf("%w: scan project: %v", domain.ErrDatabase, err)
		}
		project.Color, project.Icon = stringPointer(color), stringPointer(icon)
		var parseErr error
		if project.ArchivedAt, parseErr = parseNullableTime(archivedAt); parseErr != nil {
			return nil, parseErr
		}
		if project.CreatedAt, parseErr = time.Parse(time.RFC3339Nano, createdAt); parseErr != nil {
			return nil, parseErr
		}
		if project.UpdatedAt, parseErr = time.Parse(time.RFC3339Nano, updatedAt); parseErr != nil {
			return nil, parseErr
		}
		projects = append(projects, project)
	}
	return projects, rows.Err()
}

func (r *ProjectRepository) Archive(ctx context.Context, id string, at time.Time) error {
	result, err := r.db.ExecContext(ctx, "UPDATE projects SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL", formatTime(at), formatTime(at), id)
	if err != nil {
		return fmt.Errorf("%w: archive project: %v", domain.ErrDatabase, err)
	}
	return requireAffected(result, id)
}

var _ repository.ProjectRepository = (*ProjectRepository)(nil)
