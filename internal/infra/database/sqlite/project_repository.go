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
        (id, category_id, name, description, color, icon, sort_order, archived_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`, project.ID, project.CategoryID, project.Name, project.Description,
		nullableString(project.Color), nullableString(project.Icon), project.SortOrder,
		formatTime(project.CreatedAt), formatTime(project.UpdatedAt))
	if err != nil {
		return domain.Project{}, fmt.Errorf("%w: create project: %v", domain.ErrDatabase, err)
	}
	return project, nil
}

func (r *ProjectRepository) List(ctx context.Context) ([]domain.Project, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, category_id, name, description, color, icon, sort_order,
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
		if err := rows.Scan(&project.ID, &project.CategoryID, &project.Name, &project.Description, &color, &icon,
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

func (r *ProjectRepository) Delete(ctx context.Context, id string) error {
	result, err := r.db.ExecContext(ctx, "DELETE FROM projects WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("%w: delete project: %v", domain.ErrDatabase, err)
	}
	return requireAffected(result, id)
}

func (r *ProjectRepository) CreateCategory(ctx context.Context, category domain.Category) (domain.Category, error) {
	_, err := r.db.ExecContext(ctx, `INSERT INTO categories
        (id, parent_id, name, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`, category.ID, nullableString(category.ParentID), category.Name,
		category.SortOrder, formatTime(category.CreatedAt), formatTime(category.UpdatedAt))
	if err != nil {
		return domain.Category{}, fmt.Errorf("%w: create category: %v", domain.ErrDatabase, err)
	}
	return category, nil
}

func (r *ProjectRepository) ListCategories(ctx context.Context) ([]domain.Category, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, parent_id, name, sort_order, created_at, updated_at
        FROM categories ORDER BY sort_order, name`)
	if err != nil {
		return nil, fmt.Errorf("%w: list categories: %v", domain.ErrDatabase, err)
	}
	defer rows.Close()
	items := make([]domain.Category, 0)
	for rows.Next() {
		var item domain.Category
		var parentID sql.NullString
		var createdAt, updatedAt string
		if err := rows.Scan(&item.ID, &parentID, &item.Name, &item.SortOrder, &createdAt, &updatedAt); err != nil {
			return nil, fmt.Errorf("%w: scan category: %v", domain.ErrDatabase, err)
		}
		item.ParentID = stringPointer(parentID)
		if item.CreatedAt, err = time.Parse(time.RFC3339Nano, createdAt); err != nil {
			return nil, err
		}
		if item.UpdatedAt, err = time.Parse(time.RFC3339Nano, updatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *ProjectRepository) DeleteCategory(ctx context.Context, id string) error {
	var children, projects int
	if err := r.db.QueryRowContext(ctx, `SELECT
        (SELECT COUNT(*) FROM categories WHERE parent_id = ?),
        (SELECT COUNT(*) FROM projects WHERE category_id = ? AND archived_at IS NULL)`, id, id).Scan(&children, &projects); err != nil {
		return fmt.Errorf("%w: inspect category: %v", domain.ErrDatabase, err)
	}
	if children > 0 || projects > 0 {
		return fmt.Errorf("%w: category must be empty before deletion", domain.ErrConflict)
	}
	result, err := r.db.ExecContext(ctx, "DELETE FROM categories WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("%w: delete category: %v", domain.ErrDatabase, err)
	}
	return requireAffected(result, id)
}

var _ repository.ProjectRepository = (*ProjectRepository)(nil)
