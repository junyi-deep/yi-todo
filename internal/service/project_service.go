package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/junyiwu/yi-todo/internal/domain"
	"github.com/junyiwu/yi-todo/internal/repository"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type ProjectService struct {
	repository repository.ProjectRepository
	ctx        context.Context
	now        func() time.Time
}

type CreateProjectInput struct {
	Name       string  `json:"name"`
	Color      *string `json:"color"`
	CategoryID string  `json:"categoryId"`
}

type CreateCategoryInput struct {
	Name     string  `json:"name"`
	ParentID *string `json:"parentId"`
}

func NewProjectService(repository repository.ProjectRepository) *ProjectService {
	return &ProjectService{repository: repository, ctx: context.Background(), now: time.Now}
}

func (s *ProjectService) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	s.ctx = ctx
	return nil
}

func (s *ProjectService) CreateProject(input CreateProjectInput) (domain.Project, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" || len([]rune(name)) > 100 {
		return domain.Project{}, fmt.Errorf("%w: project name must be 1-100 characters", domain.ErrValidation)
	}
	if strings.TrimSpace(input.CategoryID) == "" {
		return domain.Project{}, fmt.Errorf("%w: category is required", domain.ErrValidation)
	}
	id, err := uuid.NewV7()
	if err != nil {
		return domain.Project{}, err
	}
	now := s.now().UTC()
	return s.repository.Create(s.ctx, domain.Project{ID: id.String(), CategoryID: input.CategoryID, Name: name, Color: input.Color, SortOrder: float64(now.UnixMilli()), CreatedAt: now, UpdatedAt: now})
}

func (s *ProjectService) ListProjects() ([]domain.Project, error) {
	return s.repository.List(s.ctx)
}

func (s *ProjectService) ArchiveProject(id string) error {
	if id == "" {
		return fmt.Errorf("%w: project id is required", domain.ErrValidation)
	}
	return s.repository.Archive(s.ctx, id, s.now().UTC())
}

// DeleteProject permanently removes a custom list. SQLite's foreign key keeps
// its tasks by moving them back to the collection box (project_id = NULL).
func (s *ProjectService) DeleteProject(id string) error {
	if id == "" {
		return fmt.Errorf("%w: project id is required", domain.ErrValidation)
	}
	return s.repository.Delete(s.ctx, id)
}

func (s *ProjectService) CreateCategory(input CreateCategoryInput) (domain.Category, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" || len([]rune(name)) > 100 {
		return domain.Category{}, fmt.Errorf("%w: category name must be 1-100 characters", domain.ErrValidation)
	}
	id, err := uuid.NewV7()
	if err != nil {
		return domain.Category{}, err
	}
	now := s.now().UTC()
	return s.repository.CreateCategory(s.ctx, domain.Category{ID: id.String(), ParentID: input.ParentID, Name: name, SortOrder: float64(now.UnixMilli()), CreatedAt: now, UpdatedAt: now})
}

func (s *ProjectService) ListCategories() ([]domain.Category, error) {
	return s.repository.ListCategories(s.ctx)
}

func (s *ProjectService) DeleteCategory(id string) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("%w: category id is required", domain.ErrValidation)
	}
	return s.repository.DeleteCategory(s.ctx, id)
}
