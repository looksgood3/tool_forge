# Tool Forge

给程序员的一站式桌面工具箱。轻量、一致、可扩展。

## 定位

Tool Forge 不侧重单一领域，目标是把开发者日常会用到的零散工具集中到一个应用里，并让它们拥有**一致的交互与视觉**。相比浏览器里散落在各处的在线工具，Tool Forge：

- **离线可用**：所有处理都在本机完成，敏感内容不出本机
- **启动秒开**：单文件可执行，常驻占用低
- **添加新工具成本低**：每个工具相互独立，长期会持续新增

## 功能概览

当前版本为 0.1 起步版本，已内置：

- Base64 文本编解码（示例工具，作为后续工具模板）
- 个人主页骨架（基础信息、主题切换；AI 配置等 section 预留占位）

更多工具与 AI 能力会在后续迭代中加入，见 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) 的路线图。

## 技术栈

- 桌面框架：Wails v2
- 后端：Go 1.22+
- 前端：React 18 + TypeScript + Vite
- UI：Tailwind CSS + shadcn/ui 风格组件
- 状态管理：Zustand
- 路由：React Router v6

## 开发环境要求

- Go 1.22+
- Node.js 18+
- Wails CLI v2.11+

## 快速开始

```bash
# 安装前端依赖
cd frontend
npm install
cd ..

# 安装 Go 依赖
go mod tidy

# 启动开发模式（热重载）
wails dev
```

## 构建

```bash
# 当前平台
wails build

# Windows
wails build -platform windows/amd64

# macOS universal
wails build -platform darwin/universal
```

产物位于 `build/bin/`。

## 开发文档

新增工具、UI 规范、架构决策等请看 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)。

## License

MIT
