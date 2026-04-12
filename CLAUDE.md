# CLAUDE.md

本文件面向 Claude Code 等 AI 协作者，给出在本项目内工作时需要立即掌握的关键信息。

## 项目概述

Tool Forge 是一款跨平台桌面程序员工具箱，基于 **Wails v2 + Go + React 18 + TypeScript + Tailwind + shadcn/ui**。不侧重单一领域，长期会持续新增工具。

详细的架构、规范、路线图见 `docs/DEVELOPMENT.md`（必读）。

## 关键约束

- **README 中严禁出现 `dev-tools` 字样或任何对该项目的引用**。本项目与 `D:\go_pro\new_tools\dev-tools` 无关联声明。
- 所有 UI 组件与配色使用 Tailwind + shadcn CSS 变量（`bg-background`、`text-foreground`、`border-border` 等），**禁止硬编码颜色**。
- 每个工具页必须使用 `@/components/tool/ToolShell` 作为外壳，不要自己写标题栏。
- 新工具要放到 `frontend/src/tools/<kebab-id>/`，包含 `index.tsx`、`logic.ts`、`meta.ts`，并在 `frontend/src/tools/registry.ts` 注册。

## 目录地图

```
tool_forge/
├── main.go / app.go              # Wails 入口与绑定
├── backend/                      # Go 后端（当前为空，按需新增）
├── frontend/src/
│   ├── main.tsx / App.tsx
│   ├── layouts/MainLayout.tsx    # 左侧菜单 + 右侧工具区
│   ├── layouts/Sidebar.tsx
│   ├── pages/Home.tsx            # 首页宫格
│   ├── tools/                    # 所有工具
│   │   ├── registry.ts           # 统一注册表
│   │   ├── ToolRouter.tsx        # 动态路由分发
│   │   └── base64-text/          # 示例工具
│   ├── profile/                  # 个人主页（一级页面）
│   ├── components/
│   │   ├── ui/                   # shadcn 风格基础组件
│   │   └── tool/ToolShell.tsx    # 工具页外壳
│   ├── stores/                   # Zustand: layout / tools / profile
│   ├── lib/utils.ts              # cn() 工具函数
│   └── styles/globals.css        # Tailwind + CSS 变量
└── docs/DEVELOPMENT.md
```

## 常用命令

```bash
wails dev                         # 开发模式（前端热重载）
wails build                       # 当前平台生产构建
cd frontend && npm run dev        # 仅前端开发服务器
cd frontend && npm run build      # 前端类型检查 + 构建
```

## 新增工具的 checklist

1. 新建 `frontend/src/tools/<id>/meta.ts`，导出 `ToolMeta`
2. 新建 `frontend/src/tools/<id>/logic.ts`，纯函数处理逻辑
3. 新建 `frontend/src/tools/<id>/index.tsx`，默认导出组件，用 `ToolShell` 包裹
4. 在 `frontend/src/tools/registry.ts` 的 `tools` 数组里追加一项
5. 必要时在 `app.go` 暴露 Go 方法并运行 `wails generate module`

## 前后端职责

- **能在前端独立完成的工具就在前端做**（90% 的场景），避免 RPC 延迟
- Go 后端承担：系统能力（文件对话框、窗口、更新）、Go 生态明显更强的处理（有序 JSON、protobuf、证书、大文件、密码学）

## 个人主页（Profile）

- 独立一级页面，路由 `/profile`，入口在侧栏底部
- **不**进入工具注册表
- AI 相关 section 当前仅占位；未来 AI Key 走系统凭据库（`go-keyring`），不明文存 localStorage
- AI 能力定位为"现有工具的增强"，而非独立工具
