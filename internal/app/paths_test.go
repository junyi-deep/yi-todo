package app

import (
	"path/filepath"
	"testing"
)

func TestResolvePathsWithOverride(t *testing.T) {
	root := t.TempDir()
	t.Setenv("LOCALTODO_DATA_DIR", root)

	paths, err := ResolvePaths()
	if err != nil {
		t.Fatal(err)
	}
	if paths.Database != filepath.Join(root, "data", "localtodo.db") {
		t.Fatalf("database path = %q", paths.Database)
	}
}
