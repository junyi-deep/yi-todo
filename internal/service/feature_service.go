package service

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/junyiwu/yi-todo/internal/domain"
	"github.com/junyiwu/yi-todo/internal/repository"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type FeatureService struct {
	repository          repository.FeatureRepository
	attachmentsDir      string
	ctx                 context.Context
	now                 func() time.Time
	wakeReminders       chan struct{}
	notifyFocusComplete func()
}

//wails:ignore
func (s *FeatureService) SetFocusCompletionNotifier(notify func()) {
	s.notifyFocusComplete = notify
}

func NewFeatureService(repository repository.FeatureRepository, attachmentsDir string) *FeatureService {
	return &FeatureService{repository: repository, attachmentsDir: attachmentsDir, ctx: context.Background(), now: time.Now, wakeReminders: make(chan struct{}, 1)}
}
func (s *FeatureService) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	s.ctx = ctx
	go s.runReminderScheduler(ctx)
	return nil
}

type UpdateDescriptionInput struct {
	ID     string `json:"id"`
	Format string `json:"format"`
	Source string `json:"source"`
	Plain  string `json:"plain"`
}

func (s *FeatureService) UpdateDescription(input UpdateDescriptionInput) (TaskDetail, error) {
	if input.ID == "" {
		return TaskDetail{}, fmt.Errorf("%w: task id is required", domain.ErrValidation)
	}
	if input.Format != "markdown" {
		return TaskDetail{}, fmt.Errorf("%w: unsupported description format", domain.ErrValidation)
	}
	if len(input.Source) > 2_000_000 {
		return TaskDetail{}, fmt.Errorf("%w: description is too large", domain.ErrValidation)
	}
	task, err := s.repository.UpdateDescription(s.ctx, input.ID, input.Format, input.Source, input.Plain, s.now().UTC())
	if err != nil {
		return TaskDetail{}, err
	}
	return TaskDetail{Task: task}, nil
}

func (s *FeatureService) ListSubtasks(parentID string) ([]TaskListItem, error) {
	if parentID == "" {
		return nil, fmt.Errorf("%w: parent id is required", domain.ErrValidation)
	}
	tasks, err := s.repository.ListChildren(s.ctx, parentID)
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

func (s *FeatureService) SearchTasks(keyword string) ([]domain.SearchResult, error) {
	raw := strings.TrimSpace(keyword)
	if raw == "" {
		return []domain.SearchResult{}, nil
	}
	query := repository.SearchQuery{Limit: 30}
	terms := make([]string, 0)
	for _, token := range strings.Fields(raw) {
		key, value, found := strings.Cut(token, ":")
		if !found || value == "" {
			terms = append(terms, token)
			continue
		}
		switch key {
		case "project":
			query.Project = value
		case "status":
			query.Status = value
		case "after":
			if parsed, err := time.Parse("2006-01-02", value); err == nil {
				query.DueFrom = &parsed
			}
		case "before":
			if parsed, err := time.Parse("2006-01-02", value); err == nil {
				query.DueTo = &parsed
			}
		default:
			terms = append(terms, token)
		}
	}
	keyword = strings.Join(terms, " ")
	if strings.ContainsAny(keyword, `"'*(){}`) {
		keyword = `"` + strings.ReplaceAll(keyword, `"`, ` `) + `"`
	}
	if keyword != "" {
		query.Keyword = keyword + "*"
	}
	if query.Status != "" && query.Status != "todo" && query.Status != "in_progress" && query.Status != "completed" && query.Status != "cancelled" {
		return nil, fmt.Errorf("%w: invalid search status", domain.ErrValidation)
	}
	return s.repository.Search(s.ctx, query)
}

type CreateDependencyInput struct {
	PredecessorID string `json:"predecessorId"`
	SuccessorID   string `json:"successorId"`
}

func (s *FeatureService) CreateDependency(input CreateDependencyInput) error {
	if input.PredecessorID == "" || input.SuccessorID == "" {
		return fmt.Errorf("%w: both task ids are required", domain.ErrValidation)
	}
	if input.PredecessorID == input.SuccessorID {
		return fmt.Errorf("%w: a task cannot depend on itself", domain.ErrValidation)
	}
	cycle, err := s.repository.DependencyPathExists(s.ctx, input.SuccessorID, input.PredecessorID)
	if err != nil {
		return err
	}
	if cycle {
		return fmt.Errorf("%w: dependency would create a cycle", domain.ErrConflict)
	}
	return s.repository.CreateDependency(s.ctx, domain.Dependency{PredecessorID: input.PredecessorID, SuccessorID: input.SuccessorID, Type: "finish_to_start", CreatedAt: s.now().UTC()})
}
func (s *FeatureService) ListDependencies() ([]domain.Dependency, error) {
	return s.repository.ListDependencies(s.ctx)
}

type ImportAttachmentInput struct {
	TaskID       string `json:"taskId"`
	OriginalName string `json:"originalName"`
	MIMEType     string `json:"mimeType"`
	DataBase64   string `json:"dataBase64"`
}

func (s *FeatureService) ImportAttachment(input ImportAttachmentInput) (domain.Attachment, error) {
	if input.TaskID == "" || strings.TrimSpace(input.OriginalName) == "" {
		return domain.Attachment{}, fmt.Errorf("%w: task and file name are required", domain.ErrValidation)
	}
	data, err := base64.StdEncoding.DecodeString(input.DataBase64)
	if err != nil {
		return domain.Attachment{}, fmt.Errorf("%w: invalid attachment data", domain.ErrValidation)
	}
	if len(data) > 25*1024*1024 {
		return domain.Attachment{}, fmt.Errorf("%w: attachment exceeds 25 MB", domain.ErrValidation)
	}
	id, _ := uuid.NewV7()
	ext := strings.ToLower(filepath.Ext(filepath.Base(input.OriginalName)))
	stored := id.String() + ext
	prefix := id.String()[:2]
	dir := filepath.Join(s.attachmentsDir, prefix)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return domain.Attachment{}, err
	}
	relative := filepath.Join(prefix, stored)
	if err := os.WriteFile(filepath.Join(s.attachmentsDir, relative), data, 0o600); err != nil {
		return domain.Attachment{}, err
	}
	item := domain.Attachment{ID: id.String(), TaskID: input.TaskID, OriginalName: filepath.Base(input.OriginalName), StoredName: stored, RelativePath: relative, MIMEType: input.MIMEType, ByteSize: int64(len(data)), CreatedAt: s.now().UTC()}
	if err := s.repository.CreateAttachment(s.ctx, item); err != nil {
		_ = os.Remove(filepath.Join(s.attachmentsDir, relative))
		return domain.Attachment{}, err
	}
	return item, nil
}
func (s *FeatureService) ListAttachments(taskID string) ([]domain.Attachment, error) {
	return s.repository.ListAttachments(s.ctx, taskID)
}

func (s *FeatureService) ReadAttachment(id string) (domain.AttachmentContent, error) {
	item, err := s.repository.GetAttachment(s.ctx, id)
	if err != nil {
		return domain.AttachmentContent{}, err
	}
	clean := filepath.Clean(item.RelativePath)
	if clean == "." || filepath.IsAbs(clean) || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
		return domain.AttachmentContent{}, fmt.Errorf("%w: unsafe attachment path", domain.ErrValidation)
	}
	data, err := os.ReadFile(filepath.Join(s.attachmentsDir, clean))
	if err != nil {
		return domain.AttachmentContent{}, err
	}
	return domain.AttachmentContent{Attachment: item, DataBase64: base64.StdEncoding.EncodeToString(data)}, nil
}

func (s *FeatureService) DeleteAttachment(id string) error {
	item, err := s.repository.GetAttachment(s.ctx, id)
	if err != nil {
		return err
	}
	if err := s.repository.DeleteAttachment(s.ctx, id); err != nil {
		return err
	}
	return os.Remove(filepath.Join(s.attachmentsDir, filepath.Clean(item.RelativePath)))
}

func (s *FeatureService) OpenAttachment(id string) error {
	item, err := s.repository.GetAttachment(s.ctx, id)
	if err != nil {
		return err
	}
	return application.Get().Browser.OpenFile(filepath.Join(s.attachmentsDir, filepath.Clean(item.RelativePath)))
}

type CreateReminderInput struct {
	TaskID      string    `json:"taskId"`
	RemindAt    time.Time `json:"remindAt"`
	RepeatType  string    `json:"repeatType"`
	RepeatValue *int      `json:"repeatValue"`
}

func (s *FeatureService) CreateReminder(input CreateReminderInput) (domain.Reminder, error) {
	if input.TaskID == "" || input.RemindAt.IsZero() {
		return domain.Reminder{}, fmt.Errorf("%w: task and reminder time are required", domain.ErrValidation)
	}
	id, _ := uuid.NewV7()
	if input.RepeatType == "" {
		input.RepeatType = "none"
	}
	if input.RepeatType != "none" && input.RepeatType != "daily" && input.RepeatType != "weekly" && input.RepeatType != "monthly" {
		return domain.Reminder{}, fmt.Errorf("%w: invalid repeat type", domain.ErrValidation)
	}
	item := domain.Reminder{ID: id.String(), TaskID: input.TaskID, RemindAt: input.RemindAt.UTC(), Status: "pending", RepeatType: input.RepeatType, RepeatValue: input.RepeatValue, CreatedAt: s.now().UTC()}
	err := s.repository.CreateReminder(s.ctx, item)
	if err == nil {
		select {
		case s.wakeReminders <- struct{}{}:
		default:
		}
	}
	return item, err
}
func (s *FeatureService) DeleteReminder(id string) error {
	return s.repository.DeleteReminder(s.ctx, id)
}
func (s *FeatureService) ListReminders(taskID string) ([]domain.Reminder, error) {
	return s.repository.ListReminders(s.ctx, taskID)
}

func (s *FeatureService) runReminderScheduler(ctx context.Context) {
	for {
		next, err := s.repository.GetNextReminder(ctx)
		if err != nil {
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Minute):
				continue
			}
		}
		wait := 24 * time.Hour
		if next != nil {
			wait = next.RemindAt.Sub(s.now().UTC())
			if wait < 0 {
				wait = 0
			}
		}
		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-s.wakeReminders:
			timer.Stop()
			continue
		case <-timer.C:
			if next != nil {
				now := s.now().UTC()
				var markErr error
				if next.RepeatType == "none" {
					markErr = s.repository.MarkReminderFired(ctx, next.ID, now)
				} else {
					markErr = s.repository.RescheduleReminder(ctx, next.ID, nextReminderTime(*next))
				}
				if markErr == nil && application.Get() != nil {
					application.Get().Event.Emit("reminder:fired", *next)
				}
			}
		}
	}
}

func nextReminderTime(item domain.Reminder) time.Time {
	next := item.RemindAt
	switch item.RepeatType {
	case "daily":
		next = next.AddDate(0, 0, 1)
	case "weekly":
		next = next.AddDate(0, 0, 7)
	case "monthly":
		next = next.AddDate(0, 1, 0)
	}
	return next
}

type StartPomodoroInput struct {
	TaskID         *string `json:"taskId"`
	PlannedSeconds int     `json:"plannedSeconds"`
}

func (s *FeatureService) StartPomodoro(input StartPomodoroInput) (domain.PomodoroSession, error) {
	if input.PlannedSeconds <= 0 || input.PlannedSeconds > 24*3600 {
		return domain.PomodoroSession{}, fmt.Errorf("%w: invalid timer duration", domain.ErrValidation)
	}
	if active, err := s.repository.GetActivePomodoro(s.ctx); err != nil {
		return domain.PomodoroSession{}, err
	} else if active != nil {
		return domain.PomodoroSession{}, fmt.Errorf("%w: another timer is active", domain.ErrConflict)
	}
	id, _ := uuid.NewV7()
	now := s.now().UTC()
	end := now.Add(time.Duration(input.PlannedSeconds) * time.Second)
	x := domain.PomodoroSession{ID: id.String(), TaskID: input.TaskID, State: "running", PlannedSeconds: input.PlannedSeconds, StartedAt: &now, ExpectedEndAt: &end, CreatedAt: now, UpdatedAt: now}
	return x, s.repository.CreatePomodoro(s.ctx, x)
}
func (s *FeatureService) GetActivePomodoro() (*domain.PomodoroSession, error) {
	x, err := s.repository.GetActivePomodoro(s.ctx)
	if err != nil || x == nil {
		return x, err
	}
	if x.State == "running" && x.ExpectedEndAt != nil {
		remaining := x.ExpectedEndAt.Sub(s.now().UTC())
		x.ElapsedSeconds = x.PlannedSeconds - int(max(0, remaining.Seconds()))
		if remaining <= 0 {
			now := s.now().UTC()
			x.State = "completed"
			x.ElapsedSeconds = x.PlannedSeconds
			x.EndedAt = &now
			x.UpdatedAt = now
			_ = s.repository.UpdatePomodoro(s.ctx, *x)
			if application.Get() != nil {
				application.Get().Event.Emit("pomodoro:completed", *x)
			}
			if enabled, _ := s.repository.GetSetting(s.ctx, "pomodoro.notifyOnComplete"); enabled != "false" && s.notifyFocusComplete != nil {
				s.notifyFocusComplete()
			}
		}
	}
	return x, nil
}

func (s *FeatureService) PausePomodoro() (*domain.PomodoroSession, error) {
	x, err := s.GetActivePomodoro()
	if err != nil || x == nil {
		return x, err
	}
	if x.State != "running" {
		return x, nil
	}
	now := s.now().UTC()
	x.State = "paused"
	x.ExpectedEndAt = nil
	x.UpdatedAt = now
	return x, s.repository.UpdatePomodoro(s.ctx, *x)
}

func (s *FeatureService) ResumePomodoro() (*domain.PomodoroSession, error) {
	x, err := s.repository.GetActivePomodoro(s.ctx)
	if err != nil || x == nil {
		return x, err
	}
	if x.State != "paused" {
		return x, nil
	}
	now := s.now().UTC()
	expected := now.Add(time.Duration(x.PlannedSeconds-x.ElapsedSeconds) * time.Second)
	x.State = "running"
	x.ExpectedEndAt = &expected
	x.UpdatedAt = now
	return x, s.repository.UpdatePomodoro(s.ctx, *x)
}
func (s *FeatureService) StopPomodoro(complete bool) (*domain.PomodoroSession, error) {
	x, err := s.GetActivePomodoro()
	if err != nil || x == nil {
		return x, err
	}
	now := s.now().UTC()
	if complete {
		x.State = "completed"
		x.ElapsedSeconds = x.PlannedSeconds
	} else {
		x.State = "cancelled"
		if x.ExpectedEndAt != nil {
			x.ElapsedSeconds = x.PlannedSeconds - int(max(0, x.ExpectedEndAt.Sub(now).Seconds()))
		}
	}
	x.EndedAt = &now
	x.UpdatedAt = now
	return x, s.repository.UpdatePomodoro(s.ctx, *x)
}

type StatsResult struct {
	Overview        domain.StatsOverview `json:"overview"`
	CompletionTrend []domain.TrendPoint  `json:"completionTrend"`
	Projects        []domain.ProjectStat `json:"projects"`
}

func (s *FeatureService) GetStatistics(days int) (StatsResult, error) {
	if days <= 0 {
		days = 30
	}
	to := s.now().UTC()
	from := to.AddDate(0, 0, -days)
	o, t, p, err := s.repository.GetStats(s.ctx, from, to)
	return StatsResult{Overview: o, CompletionTrend: t, Projects: p}, err
}

type FocusStatisticsResult struct {
	Days  []domain.FocusDay      `json:"days"`
	Tasks []domain.TaskFocusStat `json:"tasks"`
}

func (s *FeatureService) GetFocusStatistics(days int) (FocusStatisticsResult, error) {
	if days <= 0 {
		days = 90
	}
	now := s.now().In(time.Local)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.Local)
	from := today.AddDate(0, 0, -days+1).UTC()
	to := today.AddDate(0, 0, 1).UTC()
	d, t, err := s.repository.GetFocusStats(s.ctx, from, to)
	return FocusStatisticsResult{Days: d, Tasks: t}, err
}

func (s *FeatureService) GetFocusStatisticsForDate(date string) (FocusStatisticsResult, error) {
	day, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(date), time.Local)
	if err != nil {
		return FocusStatisticsResult{}, fmt.Errorf("%w: date must use YYYY-MM-DD", domain.ErrValidation)
	}
	from := day.UTC()
	to := day.AddDate(0, 0, 1).UTC()
	d, t, err := s.repository.GetFocusStats(s.ctx, from, to)
	return FocusStatisticsResult{Days: d, Tasks: t}, err
}
func (s *FeatureService) GetSetting(key string) (string, error) {
	if strings.TrimSpace(key) == "" {
		return "", fmt.Errorf("%w: setting key required", domain.ErrValidation)
	}
	return s.repository.GetSetting(s.ctx, key)
}

type SetSettingInput struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

func (s *FeatureService) SetSetting(input SetSettingInput) error {
	if strings.TrimSpace(input.Key) == "" {
		return fmt.Errorf("%w: setting key required", domain.ErrValidation)
	}
	return s.repository.SetSetting(s.ctx, input.Key, input.Value, s.now().UTC())
}
