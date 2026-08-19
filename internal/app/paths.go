package app

import (
	"fmt"
	"os"
	"path/filepath"
)

type Paths struct {
	Root        string
	Database    string
	Attachments string
	Backups     string
	Logs        string
	Cache       string
}

func ResolvePaths() (Paths, error) {
	root := os.Getenv("LOCALTODO_DATA_DIR")
	if root == "" {
		configDir, err := os.UserConfigDir()
		if err != nil {
			return Paths{}, fmt.Errorf("resolve user config directory: %w", err)
		}
		root = filepath.Join(configDir, "LocalTodo")
	}
	root, err := filepath.Abs(root)
	if err != nil {
		return Paths{}, fmt.Errorf("resolve application data path: %w", err)
	}

	paths := Paths{
		Root:        root,
		Database:    filepath.Join(root, "data", "localtodo.db"),
		Attachments: filepath.Join(root, "attachments"),
		Backups:     filepath.Join(root, "backups"),
		Logs:        filepath.Join(root, "logs"),
		Cache:       filepath.Join(root, "cache"),
	}
	for _, directory := range []string{
		filepath.Dir(paths.Database), paths.Attachments, paths.Backups, paths.Logs, paths.Cache,
	} {
		if err := os.MkdirAll(directory, 0o700); err != nil {
			return Paths{}, fmt.Errorf("create application directory: %w", err)
		}
	}
	return paths, nil
}
