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
	"sync/atomic"
	"time"

	appcore "github.com/junyiwu/yi-todo/internal/app"
	"github.com/junyiwu/yi-todo/internal/domain"
	"github.com/junyiwu/yi-todo/internal/infra/database"
	dbsqlite "github.com/junyiwu/yi-todo/internal/infra/database/sqlite"
	"github.com/junyiwu/yi-todo/internal/service"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/icons"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

//go:embed all:frontend/dist
var assets embed.FS

const (
	closeRequestedEvent = "app:close-requested"
	closeConfirmedEvent = "app:close-confirmed"
)

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
	featureService := service.NewFeatureService(dbsqlite.NewFeatureRepository(db), paths.Attachments)
	backupService := service.NewBackupService(db, paths.Backups)
	notificationService := notifications.New()
	featureService.SetFocusCompletionNotifier(func() {
		go func() {
			authorized, authErr := notificationService.CheckNotificationAuthorization()
			if authErr == nil && !authorized {
				authorized, authErr = notificationService.RequestNotificationAuthorization()
			}
			if authErr != nil || !authorized {
				return
			}
			_ = notificationService.SendNotification(notifications.NotificationOptions{ID: fmt.Sprintf("focus-%d", time.Now().UnixNano()), Title: "专注完成", Body: "本次专注已经完成。"})
		}()
	})
	app := application.New(application.Options{
		Name:        "yi-todo",
		Description: "Local-first desktop task manager",
		Logger:      logger,
		LogLevel:    slog.LevelInfo,
		Services: []application.Service{
			application.NewService(taskService),
			application.NewService(projectService),
			application.NewService(featureService),
			application.NewService(backupService),
			application.NewService(notificationService),
		},
		MarshalError: marshalError,
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
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
		Title:            "yi-todo",
		Width:            1280,
		Height:           800,
		MinWidth:         900,
		MinHeight:        600,
		Frameless:        true,
		BackgroundType:   application.BackgroundTypeTransparent,
		InitialPosition:  application.WindowCentered,
		BackgroundColour: application.NewRGBA(0, 0, 0, 0),
		URL:              "/",
	})
	tray := app.SystemTray.New()
	if runtime.GOOS == "darwin" {
		tray.SetTemplateIcon(icons.SystrayMacTemplate)
	}
	trayMenu := app.NewMenu()
	trayMenu.Add("显示 yi-todo").OnClick(func(_ *application.Context) { window.Show() })
	trayMenu.AddSeparator()
	focusStatus := trayMenu.Add("🍅 未开始").SetEnabled(false)
	startFocus := trayMenu.Add("开始番茄钟")
	pauseFocus := trayMenu.Add("暂停番茄钟")
	resumeFocus := trayMenu.Add("继续番茄钟")
	cancelFocus := trayMenu.Add("取消番茄钟")
	completeFocus := trayMenu.Add("完成番茄钟")
	refreshTray := func() {
		session, _ := featureService.GetActivePomodoro()
		active := session != nil && (session.State == "running" || session.State == "paused")
		paused := active && session.State == "paused"
		if !active {
			focusStatus.SetLabel("🍅 未开始")
		} else {
			remaining := max(0, session.PlannedSeconds-session.ElapsedSeconds)
			focusStatus.SetLabel(fmt.Sprintf("🍅 %02d:%02d · %s", remaining/60, remaining%60, map[bool]string{true: "已暂停", false: "专注中"}[paused]))
		}
		startFocus.SetHidden(active)
		pauseFocus.SetHidden(!active || paused)
		resumeFocus.SetHidden(!paused)
		cancelFocus.SetHidden(!active)
		completeFocus.SetHidden(!active)
		trayMenu.Update()
	}
	startFocus.OnClick(func(_ *application.Context) {
		minutes := 25
		if setting, getErr := featureService.GetSetting("pomodoro.focusMinutes"); getErr == nil && setting != "" {
			_, _ = fmt.Sscanf(setting, "%d", &minutes)
		}
		_, _ = featureService.StartPomodoro(service.StartPomodoroInput{PlannedSeconds: max(1, minutes) * 60})
		refreshTray()
	})
	pauseFocus.OnClick(func(_ *application.Context) { _, _ = featureService.PausePomodoro(); refreshTray() })
	resumeFocus.OnClick(func(_ *application.Context) { _, _ = featureService.ResumePomodoro(); refreshTray() })
	cancelFocus.OnClick(func(_ *application.Context) { _, _ = featureService.StopPomodoro(false); refreshTray() })
	completeFocus.OnClick(func(_ *application.Context) { _, _ = featureService.StopPomodoro(true); refreshTray() })
	trayMenu.AddSeparator()
	trayMenu.Add("退出").OnClick(func(_ *application.Context) { app.Quit() })
	tray.SetMenu(trayMenu)
	tray.SetTooltip("yi-todo")
	openTrayMenu := func() {
		refreshTray()
		tray.OpenMenu()
	}
	tray.OnClick(openTrayMenu)
	tray.OnRightClick(openTrayMenu)
	tray.OnMouseEnter(refreshTray)
	refreshTray()
	var closing atomic.Bool
	app.Event.On(closeConfirmedEvent, func(_ *application.CustomEvent) {
		if closing.CompareAndSwap(false, true) {
			app.Quit()
		}
	})
	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		if closing.Load() {
			return
		}
		event.Cancel()
		window.EmitEvent(closeRequestedEvent)
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
