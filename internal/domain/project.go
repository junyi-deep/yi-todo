package domain

import "time"

type Project struct {
	ID          string     `json:"id"`
	CategoryID  string     `json:"categoryId"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Color       *string    `json:"color"`
	Icon        *string    `json:"icon"`
	SortOrder   float64    `json:"sortOrder"`
	ArchivedAt  *time.Time `json:"archivedAt"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

type Category struct {
	ID        string    `json:"id"`
	ParentID  *string   `json:"parentId"`
	Name      string    `json:"name"`
	SortOrder float64   `json:"sortOrder"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
