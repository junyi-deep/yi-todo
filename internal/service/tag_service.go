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

type TagService struct {
	repository repository.TagRepository
	ctx        context.Context
	now        func() time.Time
}

type CreateTagInput struct {
	Name  string  `json:"name"`
	Color *string `json:"color"`
}

func NewTagService(repository repository.TagRepository) *TagService {
	return &TagService{repository: repository, ctx: context.Background(), now: time.Now}
}

func (s *TagService) ServiceStartup(ctx context.Context, _ application.ServiceOptions) error {
	s.ctx = ctx
	return nil
}

func (s *TagService) CreateTag(input CreateTagInput) (domain.Tag, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" || len([]rune(name)) > 50 {
		return domain.Tag{}, fmt.Errorf("%w: tag name must be 1-50 characters", domain.ErrValidation)
	}
	id, err := uuid.NewV7()
	if err != nil {
		return domain.Tag{}, err
	}
	now := s.now().UTC()
	return s.repository.Create(s.ctx, domain.Tag{ID: id.String(), Name: name, Color: input.Color, CreatedAt: now, UpdatedAt: now})
}

func (s *TagService) ListTags() ([]domain.Tag, error) { return s.repository.List(s.ctx) }
