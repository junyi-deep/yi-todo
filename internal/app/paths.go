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
	executable, err := os.Executable()
	if err != nil {
		return Paths{}, fmt.Errorf("resolve executable path: %w", err)
	}
	return resolvePaths(filepath.Dir(executable))
}

func resolvePaths(executableDir string) (Paths, error) {
	// A Wails development executable lives inside a disposable .dev.app bundle.
	// Keep its database beside that bundle so rebuilding/codesigning never embeds
	// mutable SQLite files in the application bundle.
	if filepath.Base(executableDir) == "MacOS" && filepath.Base(filepath.Dir(executableDir)) == "Contents" {
		bundle := filepath.Dir(filepath.Dir(executableDir))
		if filepath.Ext(bundle) == ".app" && filepath.Base(bundle) != "yi-todo.app" {
			executableDir = filepath.Dir(bundle)
		}
	}
	root, err := filepath.Abs(filepath.Join(executableDir, ".yi-todo"))
	if err != nil {
		return Paths{}, fmt.Errorf("resolve application data path: %w", err)
	}

	paths := Paths{
		Root:        root,
		Database:    filepath.Join(root, "yi-todo.db"),
		Attachments: filepath.Join(root, "attachments"),
		Backups:     filepath.Join(root, "backups"),
		Logs:        filepath.Join(root, "logs"),
		Cache:       filepath.Join(root, "cache"),
	}
	for _, directory := range []string{
		paths.Root, paths.Attachments, paths.Backups, paths.Logs, paths.Cache,
	} {
		if err := os.MkdirAll(directory, 0o700); err != nil {
			return Paths{}, fmt.Errorf("create application directory: %w", err)
		}
	}
	return paths, nil
}
