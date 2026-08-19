package domain

import (
	"errors"
	"strings"
	"testing"
)

func TestValidateTitle(t *testing.T) {
	t.Parallel()

	title, err := ValidateTitle("  Ship Phase 1  ")
	if err != nil || title != "Ship Phase 1" {
		t.Fatalf("ValidateTitle() = %q, %v", title, err)
	}

	for _, input := range []string{"   ", strings.Repeat("任", 501)} {
		if _, err := ValidateTitle(input); !errors.Is(err, ErrValidation) {
			t.Fatalf("ValidateTitle(%q) error = %v, want validation error", input, err)
		}
	}
}
