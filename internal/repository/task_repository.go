package repository

import (
	"context"
	"time"

	"github.com/junyiwu/yi-todo/internal/domain"
)

type TaskListQuery struct {
	View       string
	TitleQuery string
	ProjectID  *string
	CategoryID *string
	DueFrom    *time.Time
	DueTo      *time.Time
	Status     *domain.TaskStatus
	Important  *bool
	Urgent     *bool
	StartFrom  *time.Time
	EndTo      *time.Time
	Sort       string
	Limit      int
	Offset     int
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
	Count(ctx context.Context, query TaskListQuery) (int, error)
	ChildCounts(ctx context.Context, ids []string) (map[string]int, error)
	UpdateTitle(ctx context.Context, id, title string, updatedAt time.Time) (domain.Task, error)
	UpdateMetadata(ctx context.Context, id string, update TaskMetadataUpdate, updatedAt time.Time) (domain.Task, error)
	SetCompletion(ctx context.Context, id string, completed bool, at time.Time) (domain.Task, error)
	SetStatus(ctx context.Context, id string, status domain.TaskStatus, at time.Time) (domain.Task, error)
	Depth(ctx context.Context, id string) (int, error)
	ReconcileAncestors(ctx context.Context, id string, at time.Time) error
	SoftDelete(ctx context.Context, id string, at time.Time) error
}
