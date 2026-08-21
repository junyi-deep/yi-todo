package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
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
	ParentID  *string `json:"parentId"`
}

type UpdateTaskInput struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type TaskQuery struct {
	View       string             `json:"view"`
	TitleQuery string             `json:"titleQuery"`
	ProjectID  *string            `json:"projectId"`
	CategoryID *string            `json:"categoryId"`
	DueFrom    *time.Time         `json:"dueFrom"`
	DueTo      *time.Time         `json:"dueTo"`
	Status     *domain.TaskStatus `json:"status"`
	Important  *bool              `json:"important"`
	Urgent     *bool              `json:"urgent"`
	StartFrom  *time.Time         `json:"startFrom"`
	EndTo      *time.Time         `json:"endTo"`
	Sort       string             `json:"sort"`
	Limit      int                `json:"limit"`
	Offset     int                `json:"offset"`
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

type TaskDetail struct {
	Task domain.Task `json:"task"`
}

type TaskListItem struct {
	ID               string            `json:"id"`
	ParentID         *string           `json:"parentId"`
	ProjectID        *string           `json:"projectId"`
	Title            string            `json:"title"`
	Status           domain.TaskStatus `json:"status"`
	Priority         int               `json:"priority"`
	Important        bool              `json:"important"`
	Urgent           bool              `json:"urgent"`
	StartAt          *time.Time        `json:"startAt"`
	DueAt            *time.Time        `json:"dueAt"`
	CompletedAt      *time.Time        `json:"completedAt"`
	Progress         int               `json:"progress"`
	SortOrder        float64           `json:"sortOrder"`
	CreatedAt        time.Time         `json:"createdAt"`
	UpdatedAt        time.Time         `json:"updatedAt"`
	EstimatedMinutes *int              `json:"estimatedMinutes"`
	ChildCount       int               `json:"childCount"`
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
	localNow := s.now()
	now := localNow.UTC()
	start := time.Date(localNow.Year(), localNow.Month(), localNow.Day(), 9, 0, 0, 0, localNow.Location()).UTC()
	due := start.Add(time.Hour)
	estimated := 25
	priority := 0
	important := false
	urgent := false
	if input.ParentID != nil {
		depth, depthErr := s.repository.Depth(s.ctx, *input.ParentID)
		if depthErr != nil {
			return TaskListItem{}, depthErr
		}
		if depth >= 6 {
			return TaskListItem{}, fmt.Errorf("%w: tasks support at most 6 levels", domain.ErrValidation)
		}
		parent, parentErr := s.repository.Get(s.ctx, *input.ParentID)
		if parentErr != nil {
			return TaskListItem{}, parentErr
		}
		if input.ProjectID == nil {
			input.ProjectID = parent.ProjectID
		}
		if parent.StartAt != nil {
			start = *parent.StartAt
		}
		if parent.DueAt != nil {
			due = *parent.DueAt
		}
		if parent.EstimatedMinutes != nil {
			estimated = *parent.EstimatedMinutes
		}
		priority, important, urgent = parent.Priority, parent.Important, parent.Urgent
	}
	task, err := s.repository.Create(s.ctx, domain.Task{
		ID:                id,
		ParentID:          input.ParentID,
		ProjectID:         input.ProjectID,
		Title:             title,
		DescriptionFormat: "markdown",
		Status:            domain.TaskStatusTodo,
		Priority:          priority,
		Important:         important,
		Urgent:            urgent,
		StartAt:           &start,
		DueAt:             &due,
		EstimatedMinutes:  &estimated,
		SortOrder:         float64(now.UnixMilli()),
		CreatedAt:         now,
		UpdatedAt:         now,
	})
	if err != nil {
		return TaskListItem{}, err
	}
	if input.ParentID != nil {
		_ = s.repository.ReconcileAncestors(s.ctx, id, now)
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
	return TaskDetail{Task: task}, nil
}

type UpdateTaskStatusInput struct {
	ID     string            `json:"id"`
	Status domain.TaskStatus `json:"status"`
}

func (s *TaskService) UpdateTaskStatus(input UpdateTaskStatusInput) (TaskListItem, error) {
	if input.ID == "" {
		return TaskListItem{}, fmt.Errorf("%w: task id is required", domain.ErrValidation)
	}
	if input.Status != domain.TaskStatusTodo && input.Status != domain.TaskStatusInProgress && input.Status != domain.TaskStatusCompleted {
		return TaskListItem{}, fmt.Errorf("%w: invalid task status", domain.ErrValidation)
	}
	task, err := s.repository.SetStatus(s.ctx, input.ID, input.Status, s.now().UTC())
	if err != nil {
		return TaskListItem{}, err
	}
	_ = s.repository.ReconcileAncestors(s.ctx, input.ID, s.now().UTC())
	return toListItem(task), nil
}

func (s *TaskService) ListTasks(query TaskQuery) ([]TaskListItem, error) {
	query, err := normalizeTaskQuery(query)
	if err != nil {
		return nil, err
	}
	tasks, err := s.repository.List(s.ctx, toRepositoryTaskQuery(query))
	if err != nil {
		return nil, err
	}
	ids := make([]string, len(tasks))
	for index := range tasks {
		ids[index] = tasks[index].ID
	}
	childCounts, err := s.repository.ChildCounts(s.ctx, ids)
	if err != nil {
		return nil, err
	}
	items := make([]TaskListItem, 0, len(tasks))
	for _, task := range tasks {
		item := toListItem(task)
		item.ChildCount = childCounts[task.ID]
		items = append(items, item)
	}
	return items, nil
}

func (s *TaskService) CountTasks(query TaskQuery) (int, error) {
	query, err := normalizeTaskQuery(query)
	if err != nil {
		return 0, err
	}
	return s.repository.Count(s.ctx, toRepositoryTaskQuery(query))
}

func normalizeTaskQuery(query TaskQuery) (TaskQuery, error) {
	query.TitleQuery = strings.TrimSpace(query.TitleQuery)
	if query.View == "" {
		query.View = "inbox"
	}
	validView := query.View == "inbox" || query.View == "all" || query.View == "today" ||
		query.View == "upcoming" || query.View == "completed" || query.View == "project" || query.View == "category" || query.View == "range"
	if !validView {
		return TaskQuery{}, fmt.Errorf("%w: unsupported task view %q", domain.ErrValidation, query.View)
	}
	if query.View == "today" && (query.DueFrom == nil || query.DueTo == nil || !query.DueTo.After(*query.DueFrom)) {
		return TaskQuery{}, fmt.Errorf("%w: today view requires a valid date range", domain.ErrValidation)
	}
	if query.View == "upcoming" && query.DueFrom == nil {
		return TaskQuery{}, fmt.Errorf("%w: upcoming view requires dueFrom", domain.ErrValidation)
	}
	if query.View == "project" && (query.ProjectID == nil || *query.ProjectID == "") {
		return TaskQuery{}, fmt.Errorf("%w: project view requires projectId", domain.ErrValidation)
	}
	if query.View == "category" && (query.CategoryID == nil || *query.CategoryID == "") {
		return TaskQuery{}, fmt.Errorf("%w: category view requires categoryId", domain.ErrValidation)
	}
	validSort := query.Sort == "" || query.Sort == "default" || query.Sort == "start" || query.Sort == "due" || query.Sort == "title" || query.Sort == "created"
	if !validSort {
		return TaskQuery{}, fmt.Errorf("%w: unsupported task sort %q", domain.ErrValidation, query.Sort)
	}
	if query.View == "range" && (query.DueFrom == nil || query.DueTo == nil || !query.DueTo.After(*query.DueFrom)) {
		return TaskQuery{}, fmt.Errorf("%w: range view requires valid bounds", domain.ErrValidation)
	}
	if query.Limit <= 0 {
		query.Limit = 200
	}
	if query.Limit > 10000 {
		query.Limit = 10000
	}
	if query.Offset < 0 {
		return TaskQuery{}, fmt.Errorf("%w: offset cannot be negative", domain.ErrValidation)
	}
	return query, nil
}

func toRepositoryTaskQuery(query TaskQuery) repository.TaskListQuery {
	return repository.TaskListQuery{
		View: query.View, TitleQuery: query.TitleQuery, ProjectID: query.ProjectID, CategoryID: query.CategoryID,
		DueFrom: utcPointer(query.DueFrom), DueTo: utcPointer(query.DueTo),
		Status: query.Status, Important: query.Important, Urgent: query.Urgent,
		StartFrom: utcPointer(query.StartFrom), EndTo: utcPointer(query.EndTo), Sort: query.Sort,
		Limit: query.Limit, Offset: query.Offset,
	}
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
	_ = s.repository.ReconcileAncestors(s.ctx, id, s.now().UTC())
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
		EstimatedMinutes: task.EstimatedMinutes,
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
