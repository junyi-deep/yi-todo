# yi-todo 桌面任务管理软件设计文档

> 用途：作为 Codex / AI 编码代理的项目级实现规范。  
> 目标平台：macOS、Windows  
> 架构：Local-first，默认完全离线运行  
> 技术栈：Wails 3 + Go + React + TypeScript + SQLite  
> 文档版本：0.1  
> 日期：2026-08-19

---

## 0. 给 Codex 的最高优先级指令

你正在实现一个真正可运行、可长期维护的跨平台桌面任务管理软件，而不是 Demo。

请严格遵守以下原则：

1. 使用 **Wails 3**，不要降级为 Wails 2，也不要替换成 Electron/Tauri。
2. Backend 使用 **Go**；Frontend 使用 **React + TypeScript + Vite**。
3. 数据使用 **SQLite**，应用采用 **local-first** 架构。
4. **禁止启动 localhost REST API** 作为 React 与 Go 的通信方式。React 与 Go 通过 Wails 3 bindings/services 通信。
5. 持久化状态、业务规则、数据库操作、文件管理、提醒、番茄钟状态由 Go 负责。
6. UI 状态、交互、拖拽、动画、视图布局由 React 负责。
7. 不要在 React 中直接执行 SQL。
8. 不要把图片以 Base64/BLOB 形式存入 SQLite；图片和附件保存在应用数据目录，数据库只保存元数据和相对路径。
9. 不要一次性在 DOM 中渲染成千上万条任务；长列表和甘特图行必须虚拟化。
10. 所有日期时间在数据库中统一保存为 UTC；展示时转换到用户本地时区。
11. 所有数据库 Schema 变更必须通过 migration，禁止启动时临时拼 ALTER TABLE。
12. 第一阶段不实现云端账号和服务器同步，但代码结构必须允许以后增加 Sync Engine。
13. 不要为了“未来可能使用”提前引入微服务、消息队列、依赖注入框架、CQRS 等重型架构。
14. 每完成一个阶段，必须保证：
    - Go 编译通过；
    - TypeScript typecheck 通过；
    - 前端 build 通过；
    - migration 可从空数据库执行；
    - 核心测试通过。
15. 除非本设计文档明确要求，否则优先选择简单、可测试、可替换的实现。
16. 不要生成大量 placeholder 页面来假装功能完成。核心流程必须端到端可用。
17. 使用代码生成的 Wails TypeScript bindings；不要手写一套重复 API client。
18. 对 Wails、SQLite driver、第三方前端库的具体 API，如当前版本与本文示例不同，以当前安装版本官方 API 为准，但不得改变本文定义的架构边界。

---

# 1. 产品定位

yi-todo 是一个面向个人使用的高性能、本地优先桌面任务管理软件。

产品定位接近：

- Todo / GTD 工具；
- 日历任务规划；
- 四象限优先级管理；
- 轻量项目计划；
- 甘特图任务排期；
- 番茄钟专注；
- 个人生产力统计。

核心要求：

- macOS + Windows；
- 启动快；
- 常驻时内存占用尽可能低；
- 大量任务下仍然流畅；
- UI 现代、简洁、适合长期使用；
- 所有核心功能在无网络情况下可用；
- 数据默认只保存在用户本机；
- 未来允许增加 WebDAV / 自建服务 / 云同步，但 V1 不实现。

---

# 2. V1 功能范围

必须实现：

- Inbox；
- Today；
- Upcoming；
- All Tasks；
- Completed；
- Projects；
- Tags；
- 任务创建、修改、删除、完成；
- 子任务 / 任务拆分；
- 任务优先级；
- 截止时间；
- 开始时间；
- 任务进度；
- 任务依赖；
- List View；
- Calendar View；
- Eisenhower Matrix 四象限；
- Gantt View；
- Statistics View；
- Task Detail；
- Markdown / Rich Text 描述；
- 描述中显示图片；
- 附件；
- 全文搜索；
- 番茄钟；
- 系统通知；
- System Tray；
- Dark / Light Mode；
- Keyboard Shortcuts；
- 本地数据备份；
- 数据导入 / 导出基础能力。

V1 不实现：

- 用户账号；
- 多人协作；
- 在线评论；
- 服务端数据库；
- 实时协作；
- 手机 App；
- AI 功能；
- 团队权限；
- 云端同步。

这些功能只能预留接口，不允许影响 V1 架构复杂度。

---

# 3. 技术栈

## 3.1 Desktop

- Wails 3
- Go 1.25+
- 使用系统 WebView
- Wails services / generated TypeScript bindings
- Wails native window
- Wails system tray
- Wails notifications
- Wails native dialogs
- Wails file-drop capability

开发时使用当前最新可兼容的 Wails 3 release；不要使用 Wails 2。

## 3.2 Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui 作为基础组件参考与实现来源
- Zustand：纯 UI 状态
- TanStack Query：持久化数据查询 / mutation / cache
- TanStack Virtual：长列表和甘特图虚拟化
- Tiptap：Rich Text Editor
- FullCalendar：Calendar View
- Apache ECharts：Statistics
- date-fns：前端日期格式化
- dnd-kit：应用内部拖拽

不要使用 Redux，除非实际实现过程中出现 Zustand 无法合理解决的问题。

## 3.3 Backend

Go 标准库优先。

建议模块：

- `database/sql`
- SQLite driver：初版优先选不增加复杂跨平台构建负担且支持 WAL / FTS5 的 driver
- migration package 可使用轻量成熟库，或实现简单版本化 migration runner
- `log/slog`
- 标准 `context`
- 标准 `time`

数据库 driver 必须封装在 `internal/infra/database` 内部，业务层不得依赖 driver-specific API，以便未来通过 benchmark 替换实现。

## 3.4 Database

SQLite：

- WAL；
- foreign_keys = ON；
- busy_timeout；
- FTS5；
- migration；
- 合理 index。

不要使用 PostgreSQL、MongoDB、Redis 或嵌入式 HTTP Server。

---

# 4. 总体架构

```text
┌────────────────────────────────────────────────────────────┐
│                         React UI                           │
│                                                            │
│ List │ Calendar │ Matrix │ Gantt │ Stats │ Task Detail    │
│                                                            │
│ Zustand       TanStack Query        Virtualization         │
└───────────────────────────┬────────────────────────────────┘
                            │
                   Wails generated bindings
                            │
┌───────────────────────────▼────────────────────────────────┐
│                         Go Core                            │
│                                                            │
│ TaskService       ProjectService      SearchService        │
│ PomodoroService   ReminderService     AttachmentService    │
│ BackupService     SettingsService     StatsService         │
│                                                            │
├────────────────────────────────────────────────────────────┤
│ Domain                  Repository                         │
├────────────────────────────────────────────────────────────┤
│ SQLite / Filesystem / OS Integration                       │
└────────────────────────────────────────────────────────────┘
```

核心依赖方向：

```text
UI
 ↓
Wails Service
 ↓
Application / Domain
 ↓
Repository Interface
 ↓
SQLite Repository
```

禁止：

```text
React -> SQLite
React -> local HTTP API
Domain -> React
Repository -> UI
```

---

# 5. 推荐项目目录

```text
yi-todo/
├── main.go
├── go.mod
├── go.sum
│
├── internal/
│   ├── domain/
│   │   ├── task.go
│   │   ├── project.go
│   │   ├── tag.go
│   │   ├── reminder.go
│   │   ├── pomodoro.go
│   │   ├── attachment.go
│   │   └── errors.go
│   │
│   ├── service/
│   │   ├── task_service.go
│   │   ├── project_service.go
│   │   ├── tag_service.go
│   │   ├── search_service.go
│   │   ├── reminder_service.go
│   │   ├── pomodoro_service.go
│   │   ├── attachment_service.go
│   │   ├── stats_service.go
│   │   ├── settings_service.go
│   │   └── backup_service.go
│   │
│   ├── repository/
│   │   ├── task_repository.go
│   │   ├── project_repository.go
│   │   ├── tag_repository.go
│   │   ├── reminder_repository.go
│   │   └── pomodoro_repository.go
│   │
│   ├── infra/
│   │   ├── database/
│   │   │   ├── db.go
│   │   │   ├── pragmas.go
│   │   │   ├── migrate.go
│   │   │   ├── migrations/
│   │   │   │   ├── 001_init.sql
│   │   │   │   ├── 002_fts.sql
│   │   │   │   └── ...
│   │   │   └── sqlite/
│   │   │       ├── task_repository.go
│   │   │       ├── project_repository.go
│   │   │       └── ...
│   │   ├── filesystem/
│   │   │   └── attachments.go
│   │   ├── notification/
│   │   │   └── notification.go
│   │   └── backup/
│   │       └── backup.go
│   │
│   └── app/
│       ├── lifecycle.go
│       ├── tray.go
│       ├── window.go
│       └── events.go
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── App.tsx
│   │   │   ├── router.tsx
│   │   │   ├── queryClient.ts
│   │   │   └── shortcuts.ts
│   │   │
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   ├── layout/
│   │   │   ├── task/
│   │   │   ├── editor/
│   │   │   └── common/
│   │   │
│   │   ├── features/
│   │   │   ├── inbox/
│   │   │   ├── today/
│   │   │   ├── upcoming/
│   │   │   ├── tasks/
│   │   │   ├── projects/
│   │   │   ├── calendar/
│   │   │   ├── matrix/
│   │   │   ├── gantt/
│   │   │   ├── statistics/
│   │   │   ├── pomodoro/
│   │   │   ├── search/
│   │   │   └── settings/
│   │   │
│   │   ├── hooks/
│   │   ├── stores/
│   │   │   ├── uiStore.ts
│   │   │   └── pomodoroUIStore.ts
│   │   ├── lib/
│   │   ├── types/
│   │   └── styles/
│   │
│   ├── package.json
│   └── ...
│
├── build/
├── scripts/
├── DESIGN.md
└── README.md
```

原则：

- feature-first frontend；
- domain/service/repository backend；
- UI component 不直接调用 SQLite；
- 页面组件不要堆积业务逻辑；
- 一个文件超过约 400~500 行时，应评估拆分。

---

# 6. Domain Model

## 6.1 Task

Go Domain Model：

```go
type Task struct {
    ID              string
    ParentID        *string
    ProjectID       *string

    Title           string

    DescriptionFormat string
    DescriptionSource string
    DescriptionPlain  string

    Status          TaskStatus
    Priority        int

    Important       bool
    Urgent          bool

    StartAt         *time.Time
    DueAt           *time.Time
    CompletedAt     *time.Time

    EstimatedMinutes *int
    ActualMinutes    int

    Progress        int
    SortOrder       float64

    CreatedAt       time.Time
    UpdatedAt       time.Time
    DeletedAt       *time.Time
}
```

约束：

- `Progress`: 0~100；
- `Priority`: 0~4；
- `Status`: todo / in_progress / completed / cancelled；
- `DescriptionFormat`: markdown / richtext；
- soft delete 用于防止误删与未来同步；
- ParentID 构成任务树；
- 不允许 parent 指向自己；
- V1 最多建议支持 5 层嵌套，UI 默认只展示合理深度；
- 完成父任务时不要默认静默完成所有子任务，必须有明确业务策略。

---

# 7. SQLite Schema

下面是目标 Schema。Codex 可以根据 driver 语法做小幅调整，但语义不得改变。

```sql
CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color TEXT,
    icon TEXT,
    sort_order REAL NOT NULL DEFAULT 0,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE tasks (
    id TEXT PRIMARY KEY,

    parent_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,

    title TEXT NOT NULL,

    description_format TEXT NOT NULL DEFAULT 'richtext',
    description_source TEXT NOT NULL DEFAULT '',
    description_plain TEXT NOT NULL DEFAULT '',

    status TEXT NOT NULL DEFAULT 'todo',
    priority INTEGER NOT NULL DEFAULT 0,

    important INTEGER NOT NULL DEFAULT 0,
    urgent INTEGER NOT NULL DEFAULT 0,

    start_at TEXT,
    due_at TEXT,
    completed_at TEXT,

    estimated_minutes INTEGER,
    actual_minutes INTEGER NOT NULL DEFAULT 0,

    progress INTEGER NOT NULL DEFAULT 0,
    sort_order REAL NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,

    CHECK(priority >= 0 AND priority <= 4),
    CHECK(progress >= 0 AND progress <= 100),
    CHECK(important IN (0,1)),
    CHECK(urgent IN (0,1)),
    CHECK(description_format IN ('markdown','richtext')),
    CHECK(status IN ('todo','in_progress','completed','cancelled'))
);

CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE task_tags (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY(task_id, tag_id)
);

CREATE TABLE task_dependencies (
    predecessor_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    successor_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_type TEXT NOT NULL DEFAULT 'finish_to_start',
    created_at TEXT NOT NULL,
    PRIMARY KEY(predecessor_id, successor_id),
    CHECK(predecessor_id <> successor_id)
);

CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,

    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    relative_path TEXT NOT NULL,

    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,

    width INTEGER,
    height INTEGER,

    created_at TEXT NOT NULL
);

CREATE TABLE reminders (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,

    remind_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',

    fired_at TEXT,
    created_at TEXT NOT NULL,

    CHECK(status IN ('pending','fired','cancelled'))
);

CREATE TABLE pomodoro_sessions (
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,

    state TEXT NOT NULL,
    planned_seconds INTEGER NOT NULL,
    elapsed_seconds INTEGER NOT NULL DEFAULT 0,

    started_at TEXT,
    expected_end_at TEXT,
    ended_at TEXT,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    CHECK(state IN ('idle','running','paused','completed','cancelled'))
);

CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

---

# 8. Index

必须建立：

```sql
CREATE INDEX idx_tasks_status
ON tasks(status)
WHERE deleted_at IS NULL;

CREATE INDEX idx_tasks_due_at
ON tasks(due_at)
WHERE deleted_at IS NULL;

CREATE INDEX idx_tasks_start_at
ON tasks(start_at)
WHERE deleted_at IS NULL;

CREATE INDEX idx_tasks_project_id
ON tasks(project_id)
WHERE deleted_at IS NULL;

CREATE INDEX idx_tasks_parent_id
ON tasks(parent_id)
WHERE deleted_at IS NULL;

CREATE INDEX idx_tasks_completed_at
ON tasks(completed_at);

CREATE INDEX idx_tasks_updated_at
ON tasks(updated_at);

CREATE INDEX idx_reminders_due
ON reminders(status, remind_at);

CREATE INDEX idx_pomodoro_task
ON pomodoro_sessions(task_id, created_at);
```

在实际查询出现后使用 `EXPLAIN QUERY PLAN` 验证 index 是否命中，不允许盲目增加大量 index。

---

# 9. Full Text Search

使用 SQLite FTS5。

目标搜索字段：

- task title；
- description_plain；
- project name；
- tags。

建议：

```sql
CREATE VIRTUAL TABLE task_fts USING fts5(
    task_id UNINDEXED,
    title,
    description_plain,
    tokenize='unicode61'
);
```

FTS 更新可以：

- 通过 SQLite trigger；
- 或由 repository transaction 显式维护。

V1 建议使用 trigger，确保不会出现业务层漏更新。

搜索 API 支持：

```text
keyword
project_id
tag_ids
status
due_from
due_to
limit
offset
```

搜索返回轻量 DTO，不返回完整富文本 JSON 和附件列表。

---

# 10. SQLite 启动配置

数据库打开后执行并验证：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
```

`synchronous` 不要盲目设置为 OFF。

数据库访问规范：

- 所有 write 经过 repository；
- 需要多个写操作时必须 transaction；
- context 可取消；
- 不允许 UI 一个字段变化就无节制写数据库；
- 富文本采用 debounce 保存；
- drag / resize 期间只更新 React 临时状态，drop/end 后一次提交。

---

# 11. TaskService API

对前端公开的 Service API 使用明确 DTO。

不要直接暴露内部 Repository。

建议接口：

```text
TaskService.CreateTask(input)
TaskService.UpdateTask(input)
TaskService.DeleteTask(id)
TaskService.RestoreTask(id)

TaskService.GetTask(id)
TaskService.ListTasks(query)

TaskService.CompleteTask(id)
TaskService.ReopenTask(id)

TaskService.MoveTask(input)
TaskService.ReorderTasks(input)

TaskService.CreateSubtask(parentID, input)

TaskService.UpdateSchedule(input)
TaskService.UpdateProgress(id, progress)

TaskService.AddDependency(input)
TaskService.RemoveDependency(input)

TaskService.SetTags(input)

TaskService.GetTaskDetail(id)
```

其中：

`ListTasks` 返回：

```text
id
parentId
projectId
title
status
priority
important
urgent
startAt
dueAt
progress
sortOrder
tag summary
subtask counts
```

不要返回：

- 完整 description；
- 全部 attachments；
- 大型历史数据。

`GetTaskDetail` 再加载完整详情。

---

# 12. Query Model

```ts
type TaskQuery = {
  view?: 'inbox' | 'today' | 'upcoming' | 'all' | 'completed'
  projectId?: string
  parentId?: string | null
  tagIds?: string[]
  statuses?: TaskStatus[]
  dueFrom?: string
  dueTo?: string
  keyword?: string
  sort?: TaskSort
  limit?: number
  offset?: number
}
```

分页：

- 普通列表初始 100~200 条；
- 搜索 50 条一页；
- 不要默认把整个数据库传给 React。

Calendar / Gantt 使用明确的时间范围 query：

```text
GetTasksByRange(start, end, filters)
```

不要为了显示 2026 年 8 月去加载历史全部任务。

---

# 13. React 数据状态边界

## TanStack Query

用于：

- tasks；
- task detail；
- projects；
- tags；
- stats；
- calendar range；
- gantt range；
- search results。

Query key 示例：

```ts
['tasks', query]
['task', taskId]
['calendar', start, end, filter]
['gantt', start, end, projectId]
['stats', period]
['projects']
['tags']
```

Mutation 后精准 invalidate。

不要每次修改一个 Task 都粗暴清空整个 query cache。

## Zustand

仅保存 UI State：

```ts
type UIState = {
  sidebarCollapsed: boolean
  selectedTaskId: string | null
  detailPanelOpen: boolean
  detailPanelWidth: number

  activeView: string

  calendarMode: 'month' | 'week' | 'day'
  ganttScale: 'day' | 'week' | 'month'

  commandPaletteOpen: boolean
  quickAddOpen: boolean
}
```

不要在 Zustand 中复制整个数据库任务表。

---

# 14. 主界面

总体布局：

```text
┌─────────────────────────────────────────────────────────────────┐
│ Titlebar / Search / Quick Add / Pomodoro                       │
├──────────────┬─────────────────────────────────┬────────────────┤
│              │                                 │                │
│ Sidebar      │ Main View                       │ Task Detail    │
│              │                                 │ Panel          │
│ Inbox        │ List / Calendar / Matrix        │                │
│ Today        │ Gantt / Statistics             │ Title          │
│ Upcoming     │                                 │ Metadata       │
│              │                                 │ Editor         │
│ Projects     │                                 │ Subtasks       │
│ Tags         │                                 │ Attachments    │
│              │                                 │ Activity       │
│ Views        │                                 │                │
│              │                                 │                │
└──────────────┴─────────────────────────────────┴────────────────┘
```

窗口建议：

- minimum width: 900；
- recommended initial: 1280 × 800；
- sidebar: 220~260px；
- detail panel: 360~520px，可 resize；
- main content 自动扩展。

---

# 15. UI 设计方向

视觉参考：

- Linear；
- Raycast；
- Things；
- Notion Calendar。

原则：

- 大量 whitespace；
- 清晰 typography hierarchy；
- 少量边框；
- 尽量使用 surface / spacing 区分层级；
- 圆角不要过度；
- 动画 100~200ms；
- 支持 prefers-reduced-motion；
- Light / Dark；
- macOS 和 Windows 保持统一产品语言，但允许少量平台适配。

避免：

- Bootstrap 风格；
- 大量 gradient；
- 夸张阴影；
- Dashboard 到处都是卡片；
- 每个按钮都有背景色；
- 过度动画。

---

# 16. Quick Add

快捷键：

```text
macOS: Cmd + N
Windows: Ctrl + N
```

打开快速创建：

```text
┌───────────────────────────────────┐
│ Add a task...                     │
│                                   │
│ Tomorrow  P1  #work  @Project     │
└───────────────────────────────────┘
```

V1 可以先实现 UI token 输入，不强制实现复杂 NLP。

最低支持：

- title；
- due date；
- priority；
- project；
- tags。

创建后立即进入列表，使用 optimistic update，但数据库失败必须 rollback 并提示。

---

# 17. List View

任务行：

```text
○  完成项目设计                    Today   P1
   #work  Product
```

支持：

- complete；
- select；
- keyboard navigation；
- drag reorder；
- context menu；
- inline title edit；
- multi-select 后期可加入，V1 非必须。

性能：

- 超过约 200 行使用 TanStack Virtual；
- row 高度尽量固定或可预测；
- TaskRow 使用 memo；
- 不要把 Task Detail 放进每个 TaskRow DOM。

---

# 18. Task Detail

单击任务打开右侧 Panel。

内容：

1. Title；
2. Status；
3. Project；
4. Priority；
5. Start Date；
6. Due Date；
7. Four Quadrant properties；
8. Progress；
9. Estimated Time；
10. Tags；
11. Rich Text / Markdown；
12. Subtasks；
13. Dependencies；
14. Attachments；
15. Pomodoro；
16. Delete。

复杂 description 延迟加载。

编辑策略：

- title：短 debounce 或 blur save；
- metadata：立即 mutation；
- rich text：500~1000ms debounce；
- 关闭 detail 前确保最后一次 save flush。

---

# 19. Rich Text / Markdown

支持两个模式：

```text
description_format = richtext
description_format = markdown
```

数据库：

```text
description_source
description_plain
```

## Rich Text

使用 Tiptap。

Canonical source：

```json
{
  "type": "doc",
  "content": []
}
```

以 JSON string 存 `description_source`。

## Markdown

直接将原 Markdown string 存 `description_source`。

## Plain Text

每次保存时生成 `description_plain`：

- 用于 FTS；
- 列表摘要；
- 搜索 preview。

不要把生成的 HTML 作为唯一数据源。

---

# 20. 图片与附件

附件目录：

```text
<ExecutableDirectory>/.yi-todo/
├── yi-todo.db
├── attachments/
│   ├── 2f/
│   │   └── <uuid>.png
│   └── ...
├── backups/
└── logs/
```

数据库只保存 metadata。

上传流程：

```text
User paste / select / drop image
        ↓
React
        ↓
AttachmentService.Import()
        ↓
Go validates file
        ↓
Copy into attachment directory
        ↓
Create DB attachment row
        ↓
Return attachment DTO + safe display URL/reference
        ↓
Insert image node into editor
```

要求：

- 不允许任意 `file://` 路径直接散落到编辑器数据；
- description 内使用稳定 attachment id/reference；
- 删除 task 时附件进入可清理状态；
- V1 可以随 task soft delete 保留附件；
- 真正 purge 时才删除磁盘文件；
- 文件名使用 UUID，不信任原文件名；
- 原文件名只作为 metadata。

支持 V1 图片：

- PNG；
- JPEG；
- WebP；
- GIF 可选。

限制单附件大小，例如默认 20MB，可配置。

---

# 21. OS File Drop

Wails window 启用 file drop。

用户可：

- 将图片拖进 Rich Text Editor；
- 将文件拖到 Attachment 区域。

必须校验：

- 路径；
- 文件是否存在；
- MIME/type；
- size；
- 是否允许。

不要让拖入文件导致 WebView 导航离开 App。

---

# 22. 子任务 / Task Decomposition

使用：

```text
tasks.parent_id
```

不要创建另一张 `subtasks` 表。

示例：

```text
完成新版本
├── UI
│   ├── Calendar
│   └── Gantt
└── Backend
    ├── Migration
    └── Search
```

父任务详情显示：

```text
3 / 5 completed
60%
```

默认自动计算：

```text
subtaskCompletion =
completed direct children / direct children
```

但父任务 `progress` 是否完全自动同步应做成明确规则。

V1：

- 如果存在子任务，UI 可以显示计算进度；
- 不强制覆盖用户手动 progress 字段。

---

# 23. 四象限

使用两个字段：

```text
important
urgent
```

映射：

```text
Q1 = important && urgent
Q2 = important && !urgent
Q3 = !important && urgent
Q4 = !important && !urgent
```

UI：

```text
┌──────────────────────┬──────────────────────┐
│ Q1                    │ Q2                   │
│ Important + Urgent    │ Important            │
│                      │ Not Urgent           │
├──────────────────────┼──────────────────────┤
│ Q3                    │ Q4                   │
│ Urgent                │ Neither              │
│ Not Important         │                      │
└──────────────────────┴──────────────────────┘
```

支持：

- drag task between quadrants；
- drop 后更新 important / urgent；
- 每象限独立滚动；
- 大量任务时每个 quadrant 可虚拟化；
- filter project / tag。

不要额外保存 `quadrant` 字段，避免数据不一致。

---

# 24. Calendar View

使用 FullCalendar。

模式：

- Month；
- Week；
- Day。

任务映射原则：

- `start_at` + `due_at` → timed/range item；
- only `due_at` → deadline item；
- all-day task 根据具体 date semantics 映射。

支持：

- click → Task Detail；
- drag → reschedule；
- resize → change start/due；
- create via selecting range；
- filter project；
- filter tag。

拖动时：

```text
React optimistic state
   ↓
drop
   ↓
TaskService.UpdateSchedule()
   ↓
success keep
failure rollback
```

不要 drag 每个 pixel 都写 DB。

---

# 25. Gantt View

Gantt 是 Task 数据的投影视图，不是独立实体。

使用字段：

- start_at；
- due_at；
- progress；
- dependencies；
- parent_id。

界面：

```text
┌──────────────────────┬──────────────────────────────────────┐
│ Task                 │ Aug 19  20  21  22  23  24          │
├──────────────────────┼──────────────────────────────────────┤
│ Product              │                                      │
│   Design             │ █████████████                        │
│   Backend            │       ███████████████                │
│   Test               │                    ███████           │
└──────────────────────┴──────────────────────────────────────┘
```

实现建议：

- 左侧 Task Tree；
- 右侧 Timeline；
- 两侧共享 vertical scroll；
- row virtualization；
- timeline header 单独渲染；
- bars 使用 absolute positioned HTML/SVG；
- dependency connector 使用 SVG overlay；
- 只有可见 rows 绘制 dependency lines；
- 水平 timeline 可 virtualize / windowed。

支持：

- day / week / month zoom；
- drag bar；
- resize start/end；
- progress；
- dependency line；
- collapse hierarchy；
- project filter。

性能目标：

- 10,000 task 项目不生成 10,000 DOM rows；
- viewport 常规保持约 30~100 rows；
- 拖拽过程中不访问数据库。

V1 不实现关键路径 CPM。

---

# 26. Task Dependencies

V1 类型先只开放：

```text
finish_to_start
```

Schema 已允许 `dependency_type`，方便未来扩展：

- FS；
- SS；
- FF；
- SF。

创建 dependency 时必须校验：

- self dependency；
- duplicate；
- cycle。

实现 DAG cycle detection。

发现 cycle：

```text
A -> B
B -> C
C -> A
```

必须拒绝，并返回 domain error。

---

# 27. Statistics

统计由 Go / SQLite 聚合，不要把 50,000 条 Task 全传给 JS 再 reduce。

StatsService：

```text
GetOverview(period)
GetCompletionTrend(period)
GetPomodoroTrend(period)
GetProjectBreakdown(period)
GetProductivityHeatmap(period)
```

V1 指标：

- Today completed；
- Week completed；
- completion rate；
- planned vs completed；
- focus minutes；
- pomodoro count；
- project distribution；
- daily completion trend；
- overdue count。

Frontend 用 ECharts。

---

# 28. Pomodoro

默认：

```text
Focus: 25 min
Short break: 5 min
Long break: 15 min
```

设置允许修改。

关键原则：

**不要以 JS `setInterval` 递减值作为真实时间。**

Running session：

```text
started_at
expected_end_at
```

UI：

```text
remaining = expected_end_at - now
```

Pause：

```text
elapsed_seconds
state = paused
expected_end_at = null
```

Resume 时重新生成 expected_end_at。

因此：

- App 卡顿；
- Window minimize；
- WebView timer throttling；
- 系统 sleep；

都不会导致时间累计错误。

PomodoroService：

```text
Start(taskID?, duration)
Pause()
Resume()
Cancel()
Complete()
GetState()
```

同一时刻最多一个 active session。

---

# 29. System Tray

App 允许关闭主窗口但继续驻留。

Tray：

```text
yi-todo
────────────
🍅 Focus 18:42
Open
Quick Add
Start Pomodoro
Pause / Resume
────────────
Quit
```

策略：

- 点击关闭按钮默认 hide window；
- 明确 Quit 才退出；
- 用户设置中允许“关闭窗口时退出”。

Tray icon 菜单根据 Pomodoro state 动态刷新。

---

# 30. System Notifications

Reminder scheduler 在 Go 中实现。

用途：

- Task reminder；
- Pomodoro complete；
- Break complete。

不要依赖 React window 一直打开。

Scheduler 思路：

```text
load nearest pending reminder
        ↓
timer
        ↓
fire native notification
        ↓
mark fired
        ↓
load next
```

任务 reminder 修改后重排 timer。

系统 sleep/resume 后：

- 查询 `pending AND remind_at <= now`；
- 根据策略补发合理范围内通知；
- 避免一次性轰炸大量过期通知。

例如超过 24 小时的 reminder 可以只汇总提示，不逐条补发。

---

# 31. Wails Event 使用原则

直接调用并需要返回值：

```text
React -> generated service binding -> Go
```

例如：

- create task；
- list tasks；
- update task。

Event 用于广播：

- reminder fired；
- pomodoro state changed；
- DB/import finished；
- settings changed from native menu；
- application lifecycle。

不要用 Event 替代所有 Service 调用。

---

# 32. Search UI

快捷键：

```text
macOS: Cmd + K
Windows: Ctrl + K
```

Command Palette / Search：

```text
┌─────────────────────────────────────┐
│ 🔍 Search tasks...                  │
├─────────────────────────────────────┤
│ Finish Calendar View               │
│ Product / Design                   │
│ matched description preview...     │
└─────────────────────────────────────┘
```

输入 debounce：

约 150~250ms。

搜索结果：

- top 20~50；
- title highlight；
- description snippet；
- project；
- due date。

Enter 打开 detail。

---

# 33. Keyboard Shortcuts

最低实现：

```text
Cmd/Ctrl + N       Quick Add
Cmd/Ctrl + K       Search / Command Palette
Cmd/Ctrl + ,       Settings
Escape             Close panel/dialog
Enter              Edit selected task
Space              Toggle selected task
Cmd/Ctrl + Enter   Complete task
Arrow Up/Down      Navigate list
```

输入框 / Rich Text 中要避免 shortcut 冲突。

---

# 34. Settings

Settings：

```text
General
├── Start on login
├── Close to tray
├── Language
└── Week starts on

Appearance
├── System / Light / Dark
└── Compact mode

Tasks
├── Default priority
├── Completed task visibility
└── Default reminder

Pomodoro
├── Focus duration
├── Short break
├── Long break
└── Auto-start break

Data
├── Database location
├── Export
├── Import
├── Backup now
└── Backup retention
```

设置保存在 `app_settings`。

复杂 JSON setting 可以 value 使用 JSON string，但 key 必须稳定。

---

# 35. Backup

Local-first 必须优先保证数据安全。

BackupService：

```text
CreateBackup()
ListBackups()
RestoreBackup()
DeleteBackup()
```

备份时考虑 WAL 一致性。

不要直接在 DB 正在写入时粗暴复制单个 `.db` 文件。

应使用 SQLite 推荐的一致性备份方式或在受控 transaction/checkpoint 后生成安全快照。

默认：

- 每日自动备份一次；
- 保留最近 10 份，创建备份后自动清理更早的文件；
- 用户可关闭；
- backup 中包含 DB；
- attachments 可采用单独 export package，避免每天复制大量图片。

Restore 前自动做一次当前数据 backup。

---

# 36. Error Model

Go domain errors：

```text
ErrNotFound
ErrValidation
ErrConflict
ErrDependencyCycle
ErrDatabase
ErrFilesystem
ErrPermission
```

通过 Wails binding 返回前端时转换成稳定 error DTO：

```ts
type AppError = {
  code: string
  message: string
  details?: Record<string, unknown>
}
```

UI：

- validation → inline；
- recoverable mutation failure → toast；
- fatal DB → blocking error screen；
- 不显示 raw stack trace 给最终用户。

日志记录 stack/context，但避免敏感内容。

---

# 37. Logging

Go 使用 `slog`。

日志级别：

- Debug；
- Info；
- Warn；
- Error。

输出：

```text
<ApplicationData>/logs/app.log
```

生产环境：

- log rotation；
- 最大文件大小；
- 保留有限文件；
- 不记录任务 description 正文；
- 不记录附件内容；
- 不记录用户完整路径，除非 debug 模式。

---

# 38. Security

本软件默认不联网。

原则：

- 不运行开放端口；
- 不启动 localhost API；
- 不执行 description HTML 中任意 script；
- Rich Text renderer sanitize；
- Markdown HTML 默认禁用或 sanitize；
- attachment path 必须由 Go 控制；
- 防 path traversal；
- 外部 URL 打开前校验协议；
- 禁止 `javascript:`；
- 文件导入不信任 MIME 扩展名；
- 数据库参数全部使用 bind parameters，禁止 SQL string concat。

---

# 39. Performance Budget

目标不是 benchmark 漂亮，而是大型数据集真实可用。

基准测试数据：

```text
50,000 tasks
100 projects
500 tags
5,000 attachments metadata
10,000 pomodoro sessions
```

建议目标：

- cold start：尽可能 < 2s；
- main UI interactive：尽可能 < 1.5s；
- task create perceived response：< 100ms；
- task complete perceived response：< 100ms；
- standard list query：< 50ms；
- FTS search：常见 query < 100ms；
- list scroll：60fps 目标；
- Gantt scroll：接近 60fps；
- Quick Add 打开：立即；
- UI 不因统计查询阻塞。

这些是工程目标，不是自动化测试中的绝对硬失败阈值，应在真实 Windows/macOS release build profile。

---

# 40. 前端性能规则

必须：

- TanStack Virtual；
- memoized TaskRow；
- stable callbacks；
- 大 description lazy fetch；
- images lazy load；
- ECharts 页面退出时 dispose；
- Calendar 只请求 visible range；
- Gantt 只请求 visible/relevant range；
- search debounce；
- editor save debounce；
- 避免全局 Zustand selector 导致全 App rerender。

禁止：

```ts
const state = useUIStore()
```

然后一个巨大组件订阅整个 store。

应该选择：

```ts
const selectedTaskId = useUIStore(s => s.selectedTaskId)
```

---

# 41. Go 性能规则

- SQL 查询明确 columns，不要常规 `SELECT *`；
- List DTO 不读取 description_source；
- stats 使用 SQL aggregate；
- DB write 合理 transaction；
- reminder 不是每秒扫描整个 reminder 表；
- 不为每一个 task 启动 goroutine；
- goroutine 必须有生命周期和取消机制；
- App shutdown 正确 cancel service context；
- 不使用无界 channel；
- 关键操作添加 benchmark / profiling 后再优化。

---

# 42. Concurrency

Root：

```go
appCtx, cancel := context.WithCancel(context.Background())
```

Service 需要后台任务时使用该 context。

允许后台 goroutine：

- ReminderScheduler；
- Pomodoro watcher；
- Backup scheduler。

不允许：

```text
每个 Task 一个 goroutine
每个 Reminder 永久一个 goroutine
```

Reminder 使用 nearest timer / priority logic。

App shutdown：

```text
cancel()
wait for services
close DB
exit
```

---

# 43. ID

数据库 ID 使用不可推测、跨设备可生成的 string ID。

推荐：

- UUID v7；
- 或 ULID。

V1 只选一种，全项目保持一致。

不要使用 SQLite auto increment integer 作为 Domain ID，以方便未来同步和导入。

---

# 44. Date / Time

数据库：

```text
UTC ISO-8601
```

Go 内部：

```go
time.Time
```

Frontend：

```text
ISO string
```

展示时转 local timezone。

需要明确区分：

- date-only；
- timestamp。

如果任务表示 “2026-08-20 全天截止”，不能因为 UTC 转换变成 8 月 19 日。

实现时为 all-day/date-only 语义保留清晰 DTO，必要时增加：

```text
due_is_all_day
start_is_all_day
```

不要依赖 `00:00 UTC` 模拟 date-only。

---

# 45. Ordering

Task drag reorder 不要每次把整个列表重新编号。

使用 sparse order：

```text
1000
2000
3000
```

插入：

```text
1500
```

或使用 fractional indexing。

当 gap 太小时，再对单个 scope rebalance。

scope 可以是：

```text
project + parent
```

---

# 46. Deleted Data

Tasks 使用 soft delete：

```text
deleted_at
```

普通查询必须：

```sql
WHERE deleted_at IS NULL
```

Project 删除策略：

- V1 推荐 archive，不直接 delete；
- 删除 project 时任务默认移动 Inbox，而不是级联删除。

最终 purge 功能后期实现。

---

# 47. Optimistic Update

适用：

- complete task；
- reorder；
- change priority；
- matrix drag；
- calendar drag；
- gantt drag。

流程：

```text
snapshot previous UI
        ↓
optimistic update
        ↓
Go mutation
   ↙           ↘
success        error
keep           rollback + toast
```

Create task 可 optimistic，但临时 ID 与最终 ID 策略要简单。

如果 Go 负责生成 ID，也可以等待通常 <100ms 的 create call，避免复杂 temp-id reconciliation。

---

# 48. Testing

## Go

至少：

- domain validation；
- repository；
- migration；
- task CRUD；
- task tree；
- dependencies cycle detection；
- FTS；
- reminder scheduling logic；
- pomodoro time calculation；
- stats SQL。

SQLite repository test 使用临时真实 SQLite DB，不要 mock SQL。

## React

至少：

- TaskRow；
- TaskDetail metadata；
- Matrix drag state mapping；
- Pomodoro display calculation；
- search；
- critical state store。

## Integration

关键流程：

```text
create task
→ persisted
→ reopen app
→ task exists
```

```text
create task
→ set due
→ appears Calendar
→ drag date
→ persisted
```

```text
task A → dependency B
→ Gantt renders
→ cycle attempt rejected
```

```text
start Pomodoro
→ wait/simulate clock
→ resume app
→ remaining correct
```

时间相关逻辑必须允许注入 Clock，避免测试真的 sleep 25 分钟。

---

# 49. Accessibility

最低要求：

- keyboard navigable；
- focus visible；
- icon button 有 aria-label；
- dialog focus trap；
- color 不是唯一状态表达；
- text contrast 合理；
- prefers-reduced-motion。

---

# 50. Localization

V1 UI 可以先中文或英文之一，但字符串不要彻底硬编码散落。

建立：

```text
frontend/src/i18n/
```

Key：

```text
task.create
task.complete
view.today
view.calendar
pomodoro.start
```

第一阶段至少准备 `zh-CN`。

如果为了 MVP 时间，可先实现极轻量字典，不要求引入大型 i18n 框架。

---

# 51. Window / Native Behaviour

主窗口：

- remembers size；
- remembers position（合理范围）；
- remembers maximized；
- macOS / Windows 都应可正常 resize；
- close-to-tray 可配置。

应用启动：

```text
init paths
→ init logger
→ open SQLite
→ pragmas
→ migration
→ init repositories
→ init services
→ create Wails app/window
→ start background schedulers
→ render UI
```

如果 migration 失败：

- 不进入正常 UI；
- 保留 DB；
- 显示恢复/日志提示；
- 不破坏原数据。

---

# 52. App Data Directory

固定使用可执行文件同级的 `.yi-todo` 目录；开发态不迁移旧路径数据。

逻辑目录：

```text
<ExecutableDirectory>/.yi-todo/
├── yi-todo.db
├── attachments/
├── backups/
├── logs/
└── cache/
```

实现一个：

```go
type Paths struct {
    Root        string
    Database    string
    Attachments string
    Backups     string
    Logs        string
    Cache       string
}
```

只有 `Paths` 负责路径生成。

不要在 service 中自行拼接数据路径。

---

# 53. Import / Export

当前阶段不提供 JSON 导入与导出。数据安全通过 SQLite 一致性备份、恢复和备份保留策略实现。

---

# 54. Future Sync Boundary

V1 不实现同步。

但 Domain 实体必须已有：

```text
id
created_at
updated_at
deleted_at
```

未来可加入：

```text
device_id
revision
sync_state
```

Repository interface 不要假设“网络一定存在”。

业务流程始终：

```text
UI → Local DB
```

未来同步：

```text
Local DB ↔ Sync Engine ↔ Remote
```

禁止未来变成：

```text
UI → Remote API → Local cache
```

这会破坏 local-first。

---

# 55. MVP 实现阶段

## Phase 0 — Bootstrap

完成：

- Wails 3；
- Go；
- React/Vite/TS；
- Tailwind；
- basic window；
- build macOS / Windows 配置；
- frontend → Go binding hello test；
- logging；
- Paths。

验收：

- `wails3 dev` 可启动；
- React 调 Go 成功；
- production build 成功。

## Phase 1 — SQLite + Task CRUD

完成：

- database；
- migrations；
- repositories；
- TaskService；
- Inbox；
- All Tasks；
- create；
- update；
- complete；
- delete；
- reopen persistence。

验收：

> 创建任务 → 退出 → 重启 → 数据仍然存在。

## Phase 2 — Layout + Task Detail

完成：

- Sidebar；
- Today；
- Upcoming；
- Project；
- Detail Panel；
- tags；
- priority；
- dates；
- progress；
- keyboard navigation。

## Phase 3 — Rich Text + Attachments

完成：

- Tiptap；
- Markdown mode；
- rich text JSON；
- image paste；
- OS file drop；
- attachment storage；
- FTS description extraction。

## Phase 4 — Search

完成：

- FTS5；
- Cmd/Ctrl+K；
- query filters；
- search result navigation。

## Phase 5 — Subtasks + Matrix

完成：

- parent tasks；
- subtask UI；
- calculated completion；
- Matrix；
- drag quadrants。

## Phase 6 — Calendar

完成：

- month/week/day；
- visible range query；
- drag；
- resize；
- quick create。

## Phase 7 — Gantt

完成：

- task tree；
- timeline；
- virtual rows；
- drag schedule；
- resize；
- progress；
- dependency；
- cycle detection。

## Phase 8 — Pomodoro + Notifications + Tray

完成：

- robust timer model；
- notification；
- tray；
- close-to-tray；
- reminder scheduler。

## Phase 9 — Statistics

完成：

- completion；
- focus；
- projects；
- trends；
- ECharts。

## Phase 10 — Hardening

完成：

- backup；
- export/import；
- perf dataset；
- profiling；
- accessibility；
- polish；
- installer；
- code signing preparation。

---

# 56. Definition of Done

一个 feature 只有同时满足以下条件才算完成：

- UI 可操作；
- Go service 已实现；
- SQLite 已持久化；
- restart 后状态正确；
- error path 有处理；
- loading / empty / failure state 完整；
- TypeScript 无错误；
- Go test 通过；
- 无明显 console error；
- 不存在只写死 mock data 的核心路径；
- keyboard 基础操作可用；
- Dark Mode 正常；
- Windows/macOS 设计无明显平台崩坏。

---

# 57. 第一轮 Codex 应生成的内容

第一次执行不要试图一次完成所有 feature。

请第一轮只生成：

1. Wails 3 项目；
2. 推荐目录；
3. React shell；
4. Sidebar；
5. Main view；
6. Empty task list；
7. Detail panel shell；
8. App paths；
9. slog logger；
10. SQLite bootstrap；
11. migration runner；
12. 初始 schema；
13. Task repository；
14. Task service；
15. Wails generated bindings；
16. React TanStack Query setup；
17. Inbox Task CRUD；
18. 基础测试。

完成后确保：

```text
wails3 dev
```

可以启动并完成：

```text
Create task
Edit title
Complete
Delete
Restart
Data persists
```

只有这个 vertical slice 稳定后，才能继续实现其他视图。

---

# 58. Codex 工作方式

每次开始一个阶段：

1. 阅读本 `DESIGN.md`；
2. 检查现有代码，不要重建已有模块；
3. 创建简短 TODO；
4. 先完成 domain/data/service；
5. 再完成 UI；
6. 写测试；
7. 执行 formatter；
8. 执行 Go tests；
9. 执行 TypeScript typecheck；
10. 执行 frontend build；
11. 执行 Wails build/dev 可验证项；
12. 修复错误；
13. 更新 README 中已经真实可用的能力。

不得：

- 因为一个库 API 不熟悉就替换整个技术栈；
- 留下明显 compile error；
- 把所有代码写进 `main.go`；
- 把整个 UI 写进 `App.tsx`；
- 创建假的 repository interface 后永远不用；
- 过度 mock；
- 用 `any` 绕过 TypeScript；
- 忽略 Go error；
- panic 处理正常用户输入错误；
- 在 SQL 中拼接用户输入；
- 每个功能都新增一套重复 DTO。

---

# 59. 代码质量规范

Go：

```text
gofmt
go vet
go test ./...
```

TypeScript：

- strict mode；
- 尽量禁止 `any`；
- DTO 类型来自 Wails generated bindings 时优先复用；
- ESLint；
- Prettier 可选，但项目必须统一。

命名：

```text
Go:
TaskService
TaskRepository
CreateTaskInput

TS:
TaskRow
TaskDetailPanel
useTaskQuery
useUIStore
```

禁止抽象：

```text
BaseGenericUniversalServiceFactory
```

保持名称表达业务含义。

---

# 60. 关键设计决策摘要

必须保持以下设计：

```text
Wails 3
+
Go
+
React
+
TypeScript
+
SQLite
```

数据：

```text
Local-first
SQLite = source of truth
```

通信：

```text
React
   ↓
Wails bindings
   ↓
Go
```

而不是：

```text
React
   ↓
localhost REST
   ↓
Go
```

业务：

```text
Task = core entity

List
Calendar
Matrix
Gantt
Stats

全部是 Task 的不同 Projection
```

描述：

```text
richtext -> Tiptap JSON
markdown -> Markdown source
search -> extracted description_plain
```

附件：

```text
Filesystem
+
SQLite metadata
```

计时：

```text
absolute timestamp
而不是依赖 JS interval 累计
```

性能：

```text
range query
+
pagination
+
virtualization
+
lazy details
+
SQL aggregation
```

未来：

```text
Local DB
   ↕
Sync Engine
   ↕
Cloud/WebDAV

而不是重写 Local-first 架构
```

---

# 61. 最终验收场景

最终 V1 必须能够完成以下真实流程。

### 场景 A — 日常 Todo

```text
Cmd/Ctrl+N
→ 创建任务
→ 设置 Today
→ 设置 P1
→ 放入 Project
→ 添加标签
→ 完成
→ Statistics 更新
```

### 场景 B — 任务拆分

```text
创建「发布 V1」
→ 建立 5 个子任务
→ 完成 3 个
→ 父任务显示 3/5
```

### 场景 C — 四象限

```text
打开 Matrix
→ 将任务从 Q4 拖到 Q1
→ important=true
→ urgent=true
→ 重启应用
→ 仍在 Q1
```

### 场景 D — Calendar

```text
任务 Due = Aug 20
→ Calendar 出现
→ 拖到 Aug 21
→ DB 更新
→ Today/Upcoming 同步更新
```

### 场景 E — Gantt

```text
Task A: Aug 20-22
Task B: Aug 23-25
A -> B dependency
→ Gantt 可见
→ 拖 Task A 到 Aug 21-23
→ 数据持久化
```

### 场景 F — Rich Text

```text
打开 Task Detail
→ 输入标题/段落/checklist
→ 粘贴图片
→ 退出应用
→ 重启
→ 内容和图片完整
```

### 场景 G — Search

```text
某任务 description 中包含 “websocket”
→ Cmd/Ctrl+K
→ 输入 websocket
→ FTS 找到
→ Enter 打开 Task Detail
```

### 场景 H — Pomodoro

```text
选择 Task
→ Start 25m
→ hide window
→ 系统 sleep/resume
→ remaining time 正确
→ 到时系统 notification
→ pomodoro session 写入统计
```

### 场景 I — Background

```text
关闭主窗口
→ App 驻留 Tray
→ Reminder 仍然触发
→ Tray 点击重新打开
```

### 场景 J — Performance

```text
导入 50,000 tasks
→ 打开 All Tasks
→ UI 不创建 50,000 DOM rows
→ 可以顺畅滚动
→ Search 可用
→ Calendar/Gantt 只加载需要的数据范围
```

---

# 62. 不允许发生的架构退化

Codex 后续修改代码时，如果出现以下情况，应视为 regression：

```text
❌ React 直接访问 SQLite
❌ localhost REST server
❌ SQLite 图片 Base64/BLOB
❌ ListTasks 返回完整 description
❌ 50k task 全部进入 DOM
❌ Calendar 加载整个 DB
❌ Gantt 每拖动 1px 写一次数据库
❌ JS setInterval 成为 Pomodoro 真正时钟
❌ reminder 依赖 React window 存活
❌ 每个 reminder 一个永久 goroutine
❌ project delete 级联删除所有任务
❌ task view 各自维护独立 Task 数据
❌ 没 migration 直接改 production DB schema
❌ 业务 error 用 panic
❌ UI 修改失败却不 rollback optimistic state
```

---

# 65. 最终原则

如果实现过程中遇到取舍，优先级按以下顺序：

```text
1. 数据正确性
2. 用户数据安全
3. 简单、可维护架构
4. 流畅交互
5. 低资源占用
6. UI 美观
7. 新奇技术
```

这个项目不是为了展示复杂架构。

它应该成为：

> 一个启动快、响应快、可靠、漂亮，并且用户愿意每天保持打开的本地桌面任务管理软件。
