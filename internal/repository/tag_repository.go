package repository

import (
	"context"

	"github.com/junyiwu/yi-todo/internal/domain"
)

type TagRepository interface {
	Create(ctx context.Context, tag domain.Tag) (domain.Tag, error)
	List(ctx context.Context) ([]domain.Tag, error)
}
