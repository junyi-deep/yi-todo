package repository

import (
	"context"
	"time"

	"github.com/junyiwu/yi-todo/internal/domain"
)

type ProjectRepository interface {
	Create(ctx context.Context, project domain.Project) (domain.Project, error)
	List(ctx context.Context) ([]domain.Project, error)
	Update(ctx context.Context, id, name, categoryID string, sortOrder float64, at time.Time) (domain.Project, error)
	Archive(ctx context.Context, id string, at time.Time) error
	Delete(ctx context.Context, id string) error
	CreateCategory(ctx context.Context, category domain.Category) (domain.Category, error)
	ListCategories(ctx context.Context) ([]domain.Category, error)
	UpdateCategory(ctx context.Context, id, name string, parentID *string, sortOrder float64, at time.Time) (domain.Category, error)
	DeleteCategory(ctx context.Context, id string) error
}
