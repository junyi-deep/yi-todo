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

func (r *ProjectRepository) Update(ctx context.Context, id, name, categoryID string, sortOrder float64, at time.Time) (domain.Project, error) {
	result, err := r.db.ExecContext(ctx, `UPDATE projects SET name = ?,
        sort_order = CASE WHEN category_id = ? THEN sort_order ELSE ? END,
        category_id = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL`,
		name, categoryID, sortOrder, categoryID, formatTime(at), id)
	if err != nil {
		return domain.Project{}, fmt.Errorf("%w: update project: %v", domain.ErrDatabase, err)
	}
	if err := requireAffected(result, id); err != nil {
		return domain.Project{}, err
	}
	return r.getProject(ctx, id)
}

func (r *ProjectRepository) Reorder(ctx context.Context, id, categoryID string, orderedIDs []string, at time.Time) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("%w: begin project reorder: %v", domain.ErrDatabase, err)
	}
	defer func() { _ = tx.Rollback() }()
	var exists int
	if err := tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ? AND archived_at IS NULL)", id).Scan(&exists); err != nil {
		return fmt.Errorf("%w: inspect project: %v", domain.ErrDatabase, err)
	}
	if exists == 0 {
		return fmt.Errorf("%w: project %s", domain.ErrNotFound, id)
	}
	existing, err := stringColumn(tx.QueryContext(ctx, "SELECT id FROM projects WHERE category_id = ? AND id <> ? AND archived_at IS NULL", categoryID, id))
	if err != nil {
		return fmt.Errorf("%w: inspect project order: %v", domain.ErrDatabase, err)
	}
	if !sameIDsWithMoved(existing, orderedIDs, id) {
		return fmt.Errorf("%w: project order is stale", domain.ErrConflict)
	}
	for index, projectID := range orderedIDs {
		result, updateErr := tx.ExecContext(ctx, "UPDATE projects SET category_id = ?, sort_order = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL", categoryID, float64((index+1)*1024), formatTime(at), projectID)
		if updateErr != nil {
			return fmt.Errorf("%w: reorder project: %v", domain.ErrDatabase, updateErr)
		}
		if updateErr = requireAffected(result, projectID); updateErr != nil {
			return updateErr
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("%w: commit project reorder: %v", domain.ErrDatabase, err)
	}
	return nil
}

func (r *ProjectRepository) getProject(ctx context.Context, id string) (domain.Project, error) {
	var project domain.Project
	var color, icon, archivedAt sql.NullString
	var createdAt, updatedAt string
	err := r.db.QueryRowContext(ctx, `SELECT id, category_id, name, description, color, icon, sort_order,
        archived_at, created_at, updated_at FROM projects WHERE id = ?`, id).Scan(
		&project.ID, &project.CategoryID, &project.Name, &project.Description, &color, &icon,
		&project.SortOrder, &archivedAt, &createdAt, &updatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return domain.Project{}, fmt.Errorf("%w: project %s", domain.ErrNotFound, id)
		}
		return domain.Project{}, fmt.Errorf("%w: get project: %v", domain.ErrDatabase, err)
	}
	project.Color, project.Icon = stringPointer(color), stringPointer(icon)
	if project.ArchivedAt, err = parseNullableTime(archivedAt); err != nil {
		return domain.Project{}, err
	}
	if project.CreatedAt, err = time.Parse(time.RFC3339Nano, createdAt); err != nil {
		return domain.Project{}, err
	}
	if project.UpdatedAt, err = time.Parse(time.RFC3339Nano, updatedAt); err != nil {
		return domain.Project{}, err
	}
	return project, nil
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

func (r *ProjectRepository) UpdateCategory(ctx context.Context, id, name string, parentID *string, sortOrder float64, at time.Time) (domain.Category, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.Category{}, fmt.Errorf("%w: begin category update: %v", domain.ErrDatabase, err)
	}
	defer func() { _ = tx.Rollback() }()

	if parentID != nil {
		var createsCycle int
		err = tx.QueryRowContext(ctx, `WITH RECURSIVE descendants(id) AS (
            SELECT id FROM categories WHERE parent_id = ?
            UNION ALL
            SELECT c.id FROM categories c JOIN descendants d ON c.parent_id = d.id
        ) SELECT EXISTS(SELECT 1 FROM descendants WHERE id = ?)`, id, *parentID).Scan(&createsCycle)
		if err != nil {
			return domain.Category{}, fmt.Errorf("%w: inspect category tree: %v", domain.ErrDatabase, err)
		}
		if createsCycle != 0 {
			return domain.Category{}, fmt.Errorf("%w: category cannot be moved into its descendant", domain.ErrConflict)
		}
	}
	result, err := tx.ExecContext(ctx, `UPDATE categories SET name = ?,
        sort_order = CASE WHEN parent_id IS ? THEN sort_order ELSE ? END,
        parent_id = ?, updated_at = ? WHERE id = ?`,
		name, nullableString(parentID), sortOrder, nullableString(parentID), formatTime(at), id)
	if err != nil {
		return domain.Category{}, fmt.Errorf("%w: update category: %v", domain.ErrDatabase, err)
	}
	if err := requireAffected(result, id); err != nil {
		return domain.Category{}, err
	}
	var item domain.Category
	var nullableParent sql.NullString
	var createdAt, updatedAt string
	if err := tx.QueryRowContext(ctx, `SELECT id, parent_id, name, sort_order, created_at, updated_at FROM categories WHERE id = ?`, id).
		Scan(&item.ID, &nullableParent, &item.Name, &item.SortOrder, &createdAt, &updatedAt); err != nil {
		return domain.Category{}, fmt.Errorf("%w: read updated category: %v", domain.ErrDatabase, err)
	}
	item.ParentID = stringPointer(nullableParent)
	if item.CreatedAt, err = time.Parse(time.RFC3339Nano, createdAt); err != nil {
		return domain.Category{}, err
	}
	if item.UpdatedAt, err = time.Parse(time.RFC3339Nano, updatedAt); err != nil {
		return domain.Category{}, err
	}
	if err := tx.Commit(); err != nil {
		return domain.Category{}, fmt.Errorf("%w: commit category update: %v", domain.ErrDatabase, err)
	}
	return item, nil
}

func (r *ProjectRepository) ReorderCategory(ctx context.Context, id string, parentID *string, orderedIDs []string, at time.Time) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("%w: begin category reorder: %v", domain.ErrDatabase, err)
	}
	defer func() { _ = tx.Rollback() }()
	var exists int
	if err := tx.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM categories WHERE id = ?)", id).Scan(&exists); err != nil {
		return fmt.Errorf("%w: inspect category: %v", domain.ErrDatabase, err)
	}
	if exists == 0 {
		return fmt.Errorf("%w: category %s", domain.ErrNotFound, id)
	}
	if parentID != nil {
		var createsCycle int
		err = tx.QueryRowContext(ctx, `WITH RECURSIVE descendants(id) AS (
            SELECT id FROM categories WHERE parent_id = ?
            UNION ALL
            SELECT c.id FROM categories c JOIN descendants d ON c.parent_id = d.id
        ) SELECT EXISTS(SELECT 1 FROM descendants WHERE id = ?)`, id, *parentID).Scan(&createsCycle)
		if err != nil {
			return fmt.Errorf("%w: inspect category tree: %v", domain.ErrDatabase, err)
		}
		if createsCycle != 0 {
			return fmt.Errorf("%w: category cannot be moved into its descendant", domain.ErrConflict)
		}
	}
	existing, err := stringColumn(tx.QueryContext(ctx, "SELECT id FROM categories WHERE parent_id IS ? AND id <> ?", nullableString(parentID), id))
	if err != nil {
		return fmt.Errorf("%w: inspect category order: %v", domain.ErrDatabase, err)
	}
	if !sameIDsWithMoved(existing, orderedIDs, id) {
		return fmt.Errorf("%w: category order is stale", domain.ErrConflict)
	}
	for index, categoryID := range orderedIDs {
		result, updateErr := tx.ExecContext(ctx, "UPDATE categories SET parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?", nullableString(parentID), float64((index+1)*1024), formatTime(at), categoryID)
		if updateErr != nil {
			return fmt.Errorf("%w: reorder category: %v", domain.ErrDatabase, updateErr)
		}
		if updateErr = requireAffected(result, categoryID); updateErr != nil {
			return updateErr
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("%w: commit category reorder: %v", domain.ErrDatabase, err)
	}
	return nil
}

func stringColumn(rows *sql.Rows, err error) ([]string, error) {
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]string, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		items = append(items, id)
	}
	return items, rows.Err()
}

func sameIDsWithMoved(existing, ordered []string, movedID string) bool {
	if len(ordered) != len(existing)+1 {
		return false
	}
	expected := make(map[string]struct{}, len(ordered))
	for _, id := range existing {
		expected[id] = struct{}{}
	}
	expected[movedID] = struct{}{}
	for _, id := range ordered {
		if _, ok := expected[id]; !ok {
			return false
		}
		delete(expected, id)
	}
	return len(expected) == 0
}

func (r *ProjectRepository) DeleteCategory(ctx context.Context, id string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("%w: begin category deletion: %v", domain.ErrDatabase, err)
	}
	defer func() { _ = tx.Rollback() }()
	rows, err := tx.QueryContext(ctx, `WITH RECURSIVE tree(id, depth) AS (
        SELECT id, 0 FROM categories WHERE id = ?
        UNION ALL
        SELECT c.id, tree.depth + 1 FROM categories c JOIN tree ON c.parent_id = tree.id
    ) SELECT id FROM tree ORDER BY depth DESC`, id)
	if err != nil {
		return fmt.Errorf("%w: inspect category tree: %v", domain.ErrDatabase, err)
	}
	ids := make([]string, 0)
	for rows.Next() {
		var categoryID string
		if err := rows.Scan(&categoryID); err != nil {
			_ = rows.Close()
			return fmt.Errorf("%w: scan category tree: %v", domain.ErrDatabase, err)
		}
		ids = append(ids, categoryID)
	}
	if err := rows.Close(); err != nil {
		return fmt.Errorf("%w: close category tree: %v", domain.ErrDatabase, err)
	}
	if len(ids) == 0 {
		return fmt.Errorf("%w: category %s", domain.ErrNotFound, id)
	}
	for _, categoryID := range ids {
		if _, err := tx.ExecContext(ctx, "DELETE FROM projects WHERE category_id = ?", categoryID); err != nil {
			return fmt.Errorf("%w: delete category projects: %v", domain.ErrDatabase, err)
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM categories WHERE id = ?", categoryID); err != nil {
			return fmt.Errorf("%w: delete category: %v", domain.ErrDatabase, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("%w: commit category deletion: %v", domain.ErrDatabase, err)
	}
	return nil
}

var _ repository.ProjectRepository = (*ProjectRepository)(nil)
