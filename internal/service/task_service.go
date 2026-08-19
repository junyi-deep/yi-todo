package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/junyiwu/yi-todo/internal/domain"
	"github.com/junyiwu/yi-todo/internal/repository"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type TaskService struct {
	repository repository.TaskRepository
	ctx        context.Context
	now        func() time.Time
	newID      func() (string, error)
}

type CreateTaskInput struct {
	Title     string  `json:"title"`
	ProjectID *string `json:"projectId"`
}

type UpdateTaskInput struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type TaskQuery struct {
	View      string     `json:"view"`
	ProjectID *string    `json:"projectId"`
	DueFrom   *time.Time `json:"dueFrom"`
	DueTo     *time.Time `json:"dueTo"`
	Limit     int        `json:"limit"`
	Offset    int        `json:"offset"`
}

type UpdateTaskMetadataInput struct {
	ID               string     `json:"id"`
	ProjectID        *string    `json:"projectId"`
	Priority         int        `json:"priority"`
	Important        bool       `json:"important"`
	Urgent           bool       `json:"urgent"`
	StartAt          *time.Time `json:"startAt"`
	DueAt            *time.Time `json:"dueAt"`
	Progress         int        `json:"progress"`
	EstimatedMinutes *int       `json:"estimatedMinutes"`
}

type SetTaskTagsInput struct {
	ID     string   `json:"id"`
	TagIDs []string `json:"tagIds"`
}

type TaskDetail struct {
	Task domain.Task  `json:"task"`
	Tags []domain.Tag `json:"tags"`
}

type TaskListItem struct {
	ID          string            `json:"id"`
	ParentID    *string           `json:"parentId"`
	ProjectID   *string           `json:"projectId"`
	Title       string            `json:"title"`
	Status      domain.TaskStatus `json:"status"`
	Priority    int               `json:"priority"`
	Important   bool              `json:"important"`
	Urgent      bool              `json:"urgent"`
	StartAt     *time.Time        `json:"startAt"`
	DueAt       *time.Time        `json:"dueAt"`
	CompletedAt *time.Time        `json:"completedAt"`
	Progress    int               `json:"progress"`
	SortOrder   float64           `json:"sortOrder"`
	CreatedAt   time.Time         `json:"createdAt"`
	UpdatedAt   time.Time         `json:"updatedAt"`
}

func NewTaskService(repository repository.TaskRepository) *TaskService {
	return &TaskService{
		repository: repository,
		ctx:        context.Background(),
		now:        time.Now,
		newID: func() (string, error) {
			id, err := uuid.NewV7()
			return id.String(), err
		},
	}
}

func (s *TaskService) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	s.ctx = ctx
	return nil
}

func (s *TaskService) Hello() string {
	return "Go core connected"
}

func (s *TaskService) CreateTask(input CreateTaskInput) (TaskListItem, error) {
	title, err := domain.ValidateTitle(input.Title)
	if err != nil {
		return TaskListItem{}, err
	}
	id, err := s.newID()
	if err != nil {
		return TaskListItem{}, fmt.Errorf("generate task id: %w", err)
	}
	now := s.now().UTC()
	task, err := s.repository.Create(s.ctx, domain.Task{
		ID:                id,
		ProjectID:         input.ProjectID,
		Title:             title,
		DescriptionFormat: "richtext",
		Status:            domain.TaskStatusTodo,
		SortOrder:         float64(now.UnixMilli()),
		CreatedAt:         now,
		UpdatedAt:         now,
	})
	if err != nil {
		return TaskListItem{}, err
	}
	return toListItem(task), nil
}

func (s *TaskService) UpdateTask(input UpdateTaskInput) (TaskListItem, error) {
	if input.ID == "" {
		return TaskListItem{}, fmt.Errorf("%w: task id is required", domain.ErrValidation)
	}
	title, err := domain.ValidateTitle(input.Title)
	if err != nil {
		return TaskListItem{}, err
	}
	task, err := s.repository.UpdateTitle(s.ctx, input.ID, title, s.now().UTC())
	if err != nil {
		return TaskListItem{}, err
	}
	return toListItem(task), nil
}

func (s *TaskService) UpdateTaskMetadata(input UpdateTaskMetadataInput) (TaskListItem, error) {
	if input.ID == "" {
		return TaskListItem{}, fmt.Errorf("%w: task id is required", domain.ErrValidation)
	}
	if input.Priority < 0 || input.Priority > 4 {
		return TaskListItem{}, fmt.Errorf("%w: priority must be between 0 and 4", domain.ErrValidation)
	}
	if input.Progress < 0 || input.Progress > 100 {
		return TaskListItem{}, fmt.Errorf("%w: progress must be between 0 and 100", domain.ErrValidation)
	}
	if input.EstimatedMinutes != nil && *input.EstimatedMinutes < 0 {
		return TaskListItem{}, fmt.Errorf("%w: estimated minutes cannot be negative", domain.ErrValidation)
	}
	if input.StartAt != nil && input.DueAt != nil && input.DueAt.Before(*input.StartAt) {
		return TaskListItem{}, fmt.Errorf("%w: due time cannot be before start time", domain.ErrValidation)
	}
	task, err := s.repository.UpdateMetadata(s.ctx, input.ID, repository.TaskMetadataUpdate{
		ProjectID: input.ProjectID, Priority: input.Priority, Important: input.Important,
		Urgent: input.Urgent, StartAt: utcPointer(input.StartAt), DueAt: utcPointer(input.DueAt),
		Progress: input.Progress, EstimatedMinutes: input.EstimatedMinutes,
	}, s.now().UTC())
	if err != nil {
		return TaskListItem{}, err
	}
	return toListItem(task), nil
}

func (s *TaskService) DeleteTask(id string) error {
	if id == "" {
		return fmt.Errorf("%w: task id is required", domain.ErrValidation)
	}
	return s.repository.SoftDelete(s.ctx, id, s.now().UTC())
}

func (s *TaskService) CompleteTask(id string) (TaskListItem, error) {
	return s.setCompleted(id, true)
}

func (s *TaskService) ReopenTask(id string) (TaskListItem, error) {
	return s.setCompleted(id, false)
}

func (s *TaskService) GetTask(id string) (TaskListItem, error) {
	if id == "" {
		return TaskListItem{}, fmt.Errorf("%w: task id is required", domain.ErrValidation)
	}
	task, err := s.repository.Get(s.ctx, id)
	if err != nil {
		return TaskListItem{}, err
	}
	return toListItem(task), nil
}

func (s *TaskService) GetTaskDetail(id string) (TaskDetail, error) {
	if id == "" {
		return TaskDetail{}, fmt.Errorf("%w: task id is required", domain.ErrValidation)
	}
	task, err := s.repository.Get(s.ctx, id)
	if err != nil {
		return TaskDetail{}, err
	}
	tags, err := s.repository.GetTags(s.ctx, id)
	if err != nil {
		return TaskDetail{}, err
	}
	return TaskDetail{Task: task, Tags: tags}, nil
}

func (s *TaskService) SetTags(input SetTaskTagsInput) (TaskDetail, error) {
	if input.ID == "" {
		return TaskDetail{}, fmt.Errorf("%w: task id is required", domain.ErrValidation)
	}
	seen := make(map[string]struct{}, len(input.TagIDs))
	for _, id := range input.TagIDs {
		if id == "" {
			return TaskDetail{}, fmt.Errorf("%w: tag id is required", domain.ErrValidation)
		}
		if _, exists := seen[id]; exists {
			return TaskDetail{}, fmt.Errorf("%w: duplicate tag id", domain.ErrValidation)
		}
		seen[id] = struct{}{}
	}
	if err := s.repository.SetTags(s.ctx, input.ID, input.TagIDs); err != nil {
		return TaskDetail{}, err
	}
	return s.GetTaskDetail(input.ID)
}

func (s *TaskService) ListTasks(query TaskQuery) ([]TaskListItem, error) {
	if query.View == "" {
		query.View = "inbox"
	}
	validView := query.View == "inbox" || query.View == "all" || query.View == "today" ||
		query.View == "upcoming" || query.View == "completed" || query.View == "project" || query.View == "range"
	if !validView {
		return nil, fmt.Errorf("%w: unsupported task view %q", domain.ErrValidation, query.View)
	}
	if query.View == "today" && (query.DueFrom == nil || query.DueTo == nil || !query.DueTo.After(*query.DueFrom)) {
		return nil, fmt.Errorf("%w: today view requires a valid date range", domain.ErrValidation)
	}
	if query.View == "upcoming" && query.DueFrom == nil {
		return nil, fmt.Errorf("%w: upcoming view requires dueFrom", domain.ErrValidation)
	}
	if query.View == "project" && (query.ProjectID == nil || *query.ProjectID == "") {
		return nil, fmt.Errorf("%w: project view requires projectId", domain.ErrValidation)
	}
	if query.View == "range" && (query.DueFrom == nil || query.DueTo == nil || !query.DueTo.After(*query.DueFrom)) {
		return nil, fmt.Errorf("%w: range view requires valid bounds", domain.ErrValidation)
	}
	if query.Limit <= 0 {
		query.Limit = 200
	}
	if query.Limit > 10000 {
		query.Limit = 10000
	}
	if query.Offset < 0 {
		return nil, fmt.Errorf("%w: offset cannot be negative", domain.ErrValidation)
	}
	tasks, err := s.repository.List(s.ctx, repository.TaskListQuery{
		View: query.View, ProjectID: query.ProjectID, DueFrom: utcPointer(query.DueFrom),
		DueTo: utcPointer(query.DueTo), Limit: query.Limit, Offset: query.Offset,
	})
	if err != nil {
		return nil, err
	}
	items := make([]TaskListItem, 0, len(tasks))
	for _, task := range tasks {
		items = append(items, toListItem(task))
	}
	return items, nil
}

func utcPointer(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	utc := value.UTC()
	return &utc
}

func (s *TaskService) setCompleted(id string, completed bool) (TaskListItem, error) {
	if id == "" {
		return TaskListItem{}, fmt.Errorf("%w: task id is required", domain.ErrValidation)
	}
	task, err := s.repository.SetCompletion(s.ctx, id, completed, s.now().UTC())
	if err != nil {
		return TaskListItem{}, err
	}
	return toListItem(task), nil
}

func toListItem(task domain.Task) TaskListItem {
	return TaskListItem{
		ID: task.ID, ParentID: task.ParentID, ProjectID: task.ProjectID,
		Title: task.Title, Status: task.Status, Priority: task.Priority,
		Important: task.Important, Urgent: task.Urgent,
		StartAt: task.StartAt, DueAt: task.DueAt, CompletedAt: task.CompletedAt,
		Progress: task.Progress, SortOrder: task.SortOrder,
		CreatedAt: task.CreatedAt, UpdatedAt: task.UpdatedAt,
	}
}

func ErrorCode(err error) string {
	switch {
	case errors.Is(err, domain.ErrValidation):
		return "VALIDATION"
	case errors.Is(err, domain.ErrNotFound):
		return "NOT_FOUND"
	case errors.Is(err, domain.ErrConflict):
		return "CONFLICT"
	case errors.Is(err, domain.ErrDatabase):
		return "DATABASE"
	default:
		return "INTERNAL"
	}
}
