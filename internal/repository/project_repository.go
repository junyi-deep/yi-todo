package repository

import (
	"context"
	"time"

	"github.com/junyiwu/yi-todo/internal/domain"
)

type ProjectRepository interface {
	Create(ctx context.Context, project domain.Project) (domain.Project, error)
	List(ctx context.Context) ([]domain.Project, error)
	Archive(ctx context.Context, id string, at time.Time) error
}
