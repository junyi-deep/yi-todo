package app

import (
	"path/filepath"
	"testing"
)

func TestResolvePathsBesideExecutable(t *testing.T) {
	root := t.TempDir()

	paths, err := resolvePaths(root)
	if err != nil {
		t.Fatal(err)
	}
	if paths.Root != filepath.Join(root, ".yi-todo") {
		t.Fatalf("root path = %q", paths.Root)
	}
	if paths.Database != filepath.Join(root, ".yi-todo", "yi-todo.db") {
		t.Fatalf("database path = %q", paths.Database)
	}
}

func TestResolvePathsOutsideDevelopmentAppBundle(t *testing.T) {
	root := t.TempDir()
	executableDir := filepath.Join(root, "yi-todo.dev.app", "Contents", "MacOS")
	paths, err := resolvePaths(executableDir)
	if err != nil {
		t.Fatal(err)
	}
	if paths.Root != filepath.Join(root, ".yi-todo") {
		t.Fatalf("root path = %q", paths.Root)
	}
}
