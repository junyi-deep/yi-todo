package domain

import "time"

type Project struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Color       *string    `json:"color"`
	Icon        *string    `json:"icon"`
	SortOrder   float64    `json:"sortOrder"`
	ArchivedAt  *time.Time `json:"archivedAt"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}
