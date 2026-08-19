package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/junyiwu/yi-todo/internal/domain"
	"github.com/junyiwu/yi-todo/internal/repository"
)

type TagRepository struct{ db *sql.DB }

func NewTagRepository(db *sql.DB) *TagRepository { return &TagRepository{db: db} }

func (r *TagRepository) Create(ctx context.Context, tag domain.Tag) (domain.Tag, error) {
	_, err := r.db.ExecContext(ctx, "INSERT INTO tags(id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		tag.ID, tag.Name, nullableString(tag.Color), formatTime(tag.CreatedAt), formatTime(tag.UpdatedAt))
	if err != nil {
		return domain.Tag{}, fmt.Errorf("%w: create tag: %v", domain.ErrDatabase, err)
	}
	return tag, nil
}

func (r *TagRepository) List(ctx context.Context) ([]domain.Tag, error) {
	rows, err := r.db.QueryContext(ctx, "SELECT id, name, color, created_at, updated_at FROM tags ORDER BY name")
	if err != nil {
		return nil, fmt.Errorf("%w: list tags: %v", domain.ErrDatabase, err)
	}
	defer rows.Close()
	tags := make([]domain.Tag, 0)
	for rows.Next() {
		var tag domain.Tag
		var color sql.NullString
		var createdAt, updatedAt string
		if err := rows.Scan(&tag.ID, &tag.Name, &color, &createdAt, &updatedAt); err != nil {
			return nil, fmt.Errorf("%w: scan tag: %v", domain.ErrDatabase, err)
		}
		tag.Color = stringPointer(color)
		var parseErr error
		if tag.CreatedAt, parseErr = time.Parse(time.RFC3339Nano, createdAt); parseErr != nil {
			return nil, parseErr
		}
		if tag.UpdatedAt, parseErr = time.Parse(time.RFC3339Nano, updatedAt); parseErr != nil {
			return nil, parseErr
		}
		tags = append(tags, tag)
	}
	return tags, rows.Err()
}

var _ repository.TagRepository = (*TagRepository)(nil)
