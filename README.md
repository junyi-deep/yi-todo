# LocalTodo

LocalTodo is a local-first desktop task manager built with Wails 3, Go, React, TypeScript, and SQLite.

The implemented Phase 0–10 application keeps SQLite as the source of truth in the platform app-data directory. React calls Go only through generated Wails bindings; the app does not start a localhost API.

Included capabilities: task/project/tag management, Today and Upcoming queries, Tiptap and Markdown descriptions, local attachment import, FTS5 command search, subtasks, Eisenhower Matrix, FullCalendar views, virtualised Gantt rows and cycle-safe dependencies, persistent Pomodoro sessions, background reminder scheduling, system tray/close-to-tray, ECharts statistics, dark mode, automatic/manual SQLite backups, transactional restore, and JSON export/import.

## Development

Requirements:

- Go 1.25 or newer
- Node.js 20 or newer
- Wails 3 CLI `v3.0.0-alpha2.105` or a compatible newer alpha

Install and verify:

```sh
cd frontend && npm install
cd ..
wails3 generate bindings -ts -i -clean=true
go test ./...
cd frontend && npm run typecheck && npm run build
cd ..
wails3 build
```

Run in development mode:

```sh
wails3 dev
```

Set `LOCALTODO_DATA_DIR` to use an alternate data root during development. By default, LocalTodo uses the operating system's user configuration directory and creates `data`, `attachments`, `backups`, `logs`, and `cache` beneath `LocalTodo`.

## Keyboard

- `Cmd/Ctrl+N`: quick add
- `Cmd/Ctrl+K`: search (`project:`, `tag:`, `status:`, `after:`, and `before:` filters are supported)
- `Cmd/Ctrl+,`: settings and data
- arrows: task navigation
- space or `Cmd/Ctrl+Enter`: toggle/complete the selected task

## Packaging

`wails3 build` produces the native executable. `wails3 package` uses the platform tasks under `build/`. Distribution signing/notarisation credentials are intentionally not stored in the repository and must be supplied by the release environment.

Pushing a semantic-version tag such as `v0.0.1` starts the Release workflow. GitHub Actions builds Linux, Windows, and macOS packages, generates SHA-256 checksums, and publishes them to the matching GitHub Release. Regular pushes and pull requests run Go tests, TypeScript typechecking, and the frontend production build.
