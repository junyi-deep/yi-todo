package domain

import (
	"fmt"
	"strings"
	"time"
)

type TaskStatus string

const (
	TaskStatusTodo       TaskStatus = "todo"
	TaskStatusInProgress TaskStatus = "in_progress"
	TaskStatusCompleted  TaskStatus = "completed"
	TaskStatusCancelled  TaskStatus = "cancelled"
)

type Task struct {
	ID                string     `json:"id"`
	ParentID          *string    `json:"parentId"`
	ProjectID         *string    `json:"projectId"`
	Title             string     `json:"title"`
	DescriptionFormat string     `json:"descriptionFormat"`
	DescriptionSource string     `json:"descriptionSource"`
	DescriptionPlain  string     `json:"descriptionPlain"`
	Status            TaskStatus `json:"status"`
	Priority          int        `json:"priority"`
	Important         bool       `json:"important"`
	Urgent            bool       `json:"urgent"`
	StartAt           *time.Time `json:"startAt"`
	DueAt             *time.Time `json:"dueAt"`
	CompletedAt       *time.Time `json:"completedAt"`
	EstimatedMinutes  *int       `json:"estimatedMinutes"`
	ActualMinutes     int        `json:"actualMinutes"`
	Progress          int        `json:"progress"`
	SortOrder         float64    `json:"sortOrder"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
	DeletedAt         *time.Time `json:"deletedAt"`
}

func ValidateTitle(title string) (string, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return "", fmt.Errorf("%w: title is required", ErrValidation)
	}
	if len([]rune(title)) > 500 {
		return "", fmt.Errorf("%w: title must be at most 500 characters", ErrValidation)
	}
	return title, nil
}
