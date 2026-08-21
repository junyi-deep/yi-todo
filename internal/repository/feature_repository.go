package repository

import (
	"context"
	"time"

	"github.com/junyiwu/yi-todo/internal/domain"
)

type FeatureRepository interface {
	UpdateDescription(context.Context, string, string, string, string, time.Time) (domain.Task, error)
	ListChildren(context.Context, string) ([]domain.Task, error)
	ChildCounts(context.Context, []string) (map[string]int, error)
	Search(context.Context, SearchQuery) ([]domain.SearchResult, error)
	CreateDependency(context.Context, domain.Dependency) error
	ListDependencies(context.Context) ([]domain.Dependency, error)
	DependencyPathExists(context.Context, string, string) (bool, error)
	CreateAttachment(context.Context, domain.Attachment) error
	ListAttachments(context.Context, string) ([]domain.Attachment, error)
	GetAttachment(context.Context, string) (domain.Attachment, error)
	DeleteAttachment(context.Context, string) error
	CreateReminder(context.Context, domain.Reminder) error
	ListReminders(context.Context, string) ([]domain.Reminder, error)
	GetNextReminder(context.Context) (*domain.Reminder, error)
	MarkReminderFired(context.Context, string, time.Time) error
	RescheduleReminder(context.Context, string, time.Time) error
	DeleteReminder(context.Context, string) error
	CreatePomodoro(context.Context, domain.PomodoroSession) error
	UpdatePomodoro(context.Context, domain.PomodoroSession) error
	GetActivePomodoro(context.Context) (*domain.PomodoroSession, error)
	GetStats(context.Context, time.Time, time.Time) (domain.StatsOverview, []domain.TrendPoint, []domain.ProjectStat, error)
	GetFocusStats(context.Context, time.Time, time.Time) ([]domain.FocusDay, []domain.TaskFocusStat, error)
	GetSetting(context.Context, string) (string, error)
	SetSetting(context.Context, string, string, time.Time) error
}

type SearchQuery struct {
	Keyword string
	Project string
	Status  string
	DueFrom *time.Time
	DueTo   *time.Time
	Limit   int
	Offset  int
}
