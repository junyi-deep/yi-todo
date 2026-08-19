package domain

import "errors"

var (
	ErrNotFound   = errors.New("not found")
	ErrValidation = errors.New("validation failed")
	ErrConflict   = errors.New("conflict")
	ErrDatabase   = errors.New("database error")
)
