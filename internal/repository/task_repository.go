package repository

import (
	"context"
	"time"

	"github.com/junyiwu/yi-todo/internal/domain"
)

type TaskListQuery struct {
	View      string
	ProjectID *string
	DueFrom   *time.Time
	DueTo     *time.Time
	Limit     int
	Offset    int
}

type TaskMetadataUpdate struct {
	ProjectID        *string
	Priority         int
	Important        bool
	Urgent           bool
	StartAt          *time.Time
	DueAt            *time.Time
	Progress         int
	EstimatedMinutes *int
}

type TaskRepository interface {
	Create(ctx context.Context, task domain.Task) (domain.Task, error)
	Get(ctx context.Context, id string) (domain.Task, error)
	List(ctx context.Context, query TaskListQuery) ([]domain.Task, error)
	UpdateTitle(ctx context.Context, id, title string, updatedAt time.Time) (domain.Task, error)
	UpdateMetadata(ctx context.Context, id string, update TaskMetadataUpdate, updatedAt time.Time) (domain.Task, error)
	SetCompletion(ctx context.Context, id string, completed bool, at time.Time) (domain.Task, error)
	SetTags(ctx context.Context, id string, tagIDs []string) error
	GetTags(ctx context.Context, id string) ([]domain.Tag, error)
	SoftDelete(ctx context.Context, id string, at time.Time) error
}
