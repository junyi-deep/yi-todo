package domain

import "time"

type Attachment struct {
	ID           string    `json:"id"`
	TaskID       string    `json:"taskId"`
	OriginalName string    `json:"originalName"`
	StoredName   string    `json:"storedName"`
	RelativePath string    `json:"relativePath"`
	MIMEType     string    `json:"mimeType"`
	ByteSize     int64     `json:"byteSize"`
	CreatedAt    time.Time `json:"createdAt"`
}

type AttachmentContent struct {
	Attachment Attachment `json:"attachment"`
	DataBase64 string     `json:"dataBase64"`
}

type Dependency struct {
	PredecessorID string    `json:"predecessorId"`
	SuccessorID   string    `json:"successorId"`
	Type          string    `json:"type"`
	CreatedAt     time.Time `json:"createdAt"`
}

type Reminder struct {
	ID          string     `json:"id"`
	TaskID      string     `json:"taskId"`
	RemindAt    time.Time  `json:"remindAt"`
	Status      string     `json:"status"`
	FiredAt     *time.Time `json:"firedAt"`
	RepeatType  string     `json:"repeatType"`
	RepeatValue *int       `json:"repeatValue"`
	CreatedAt   time.Time  `json:"createdAt"`
}

type FocusDay struct {
	Date    string `json:"date"`
	Minutes int    `json:"minutes"`
	Count   int    `json:"count"`
}
type TaskFocusStat struct {
	TaskID        *string `json:"taskId"`
	Title         string  `json:"title"`
	Minutes       int     `json:"minutes"`
	PomodoroCount int     `json:"pomodoroCount"`
}

type PomodoroSession struct {
	ID             string     `json:"id"`
	TaskID         *string    `json:"taskId"`
	State          string     `json:"state"`
	PlannedSeconds int        `json:"plannedSeconds"`
	ElapsedSeconds int        `json:"elapsedSeconds"`
	StartedAt      *time.Time `json:"startedAt"`
	ExpectedEndAt  *time.Time `json:"expectedEndAt"`
	EndedAt        *time.Time `json:"endedAt"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

type SearchResult struct {
	ID               string     `json:"id"`
	Title            string     `json:"title"`
	DescriptionPlain string     `json:"descriptionPlain"`
	ProjectName      *string    `json:"projectName"`
	DueAt            *time.Time `json:"dueAt"`
}

type StatsOverview struct {
	TodayCompleted int     `json:"todayCompleted"`
	WeekCompleted  int     `json:"weekCompleted"`
	CompletionRate float64 `json:"completionRate"`
	FocusMinutes   int     `json:"focusMinutes"`
	PomodoroCount  int     `json:"pomodoroCount"`
	OverdueCount   int     `json:"overdueCount"`
}

type TrendPoint struct {
	Date  string `json:"date"`
	Value int    `json:"value"`
}

type ProjectStat struct {
	Name  string `json:"name"`
	Value int    `json:"value"`
}
