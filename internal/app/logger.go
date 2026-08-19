package app

import (
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
)

func OpenLogger(paths Paths) (*slog.Logger, io.Closer, error) {
	file, err := os.OpenFile(filepath.Join(paths.Logs, "app.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, nil, fmt.Errorf("open application log: %w", err)
	}
	logger := slog.New(slog.NewJSONHandler(file, &slog.HandlerOptions{Level: slog.LevelInfo}))
	return logger, file, nil
}
