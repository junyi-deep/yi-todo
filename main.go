package main

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"runtime"

	appcore "github.com/junyiwu/yi-todo/internal/app"
	"github.com/junyiwu/yi-todo/internal/domain"
	"github.com/junyiwu/yi-todo/internal/infra/database"
	dbsqlite "github.com/junyiwu/yi-todo/internal/infra/database/sqlite"
	"github.com/junyiwu/yi-todo/internal/service"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/icons"
)

//go:embed all:frontend/dist
var assets embed.FS

type appError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	paths, err := appcore.ResolvePaths()
	if err != nil {
		return err
	}
	logger, logFile, err := appcore.OpenLogger(paths)
	if err != nil {
		return err
	}

	db, err := database.Open(applicationContext(), paths.Database)
	if err != nil {
		_ = logFile.Close()
		return err
	}
	if err := database.Migrate(applicationContext(), db); err != nil {
		_ = db.Close()
		_ = logFile.Close()
		return err
	}

	taskService := service.NewTaskService(dbsqlite.NewTaskRepository(db))
	projectService := service.NewProjectService(dbsqlite.NewProjectRepository(db))
	tagService := service.NewTagService(dbsqlite.NewTagRepository(db))
	featureService := service.NewFeatureService(dbsqlite.NewFeatureRepository(db), paths.Attachments)
	backupService := service.NewBackupService(db, paths.Backups)
	app := application.New(application.Options{
		Name:        "LocalTodo",
		Description: "Local-first desktop task manager",
		Logger:      logger,
		LogLevel:    slog.LevelInfo,
		Services: []application.Service{
			application.NewService(taskService),
			application.NewService(projectService),
			application.NewService(tagService),
			application.NewService(featureService),
			application.NewService(backupService),
		},
		MarshalError: marshalError,
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
		OnShutdown: func() {
			if err := db.Close(); err != nil {
				logger.Error("close database", "error", err)
			}
			logger.Info("application stopped")
			_ = logFile.Close()
		},
		ErrorHandler: func(err error) {
			logger.Error("wails error", "error", err)
		},
	})

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "main",
		Title:            "LocalTodo",
		Width:            1280,
		Height:           800,
		MinWidth:         900,
		MinHeight:        600,
		InitialPosition:  application.WindowCentered,
		BackgroundColour: application.NewRGB(246, 247, 249),
		URL:              "/",
	})
	tray := app.SystemTray.New()
	if runtime.GOOS == "darwin" {
		tray.SetTemplateIcon(icons.SystrayMacTemplate)
	}
	trayMenu := app.NewMenu()
	trayMenu.Add("显示 LocalTodo").OnClick(func(_ *application.Context) { window.Show() })
	trayMenu.AddSeparator()
	trayMenu.Add("退出").OnClick(func(_ *application.Context) { app.Quit() })
	tray.SetMenu(trayMenu)
	tray.OnClick(func() { window.Show() })
	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		window.Hide()
		event.Cancel()
	})

	logger.Info("application started")
	if err := app.Run(); err != nil {
		return fmt.Errorf("run Wails application: %w", err)
	}
	return nil
}

func applicationContext() context.Context {
	return context.Background()
}

func marshalError(err error) []byte {
	code := service.ErrorCode(err)
	message := "An unexpected error occurred"
	if errors.Is(err, domain.ErrValidation) || errors.Is(err, domain.ErrNotFound) || errors.Is(err, domain.ErrConflict) {
		message = err.Error()
	}
	payload, marshalErr := json.Marshal(appError{Code: code, Message: message})
	if marshalErr != nil {
		return []byte(`{"code":"INTERNAL","message":"An unexpected error occurred"}`)
	}
	return payload
}
