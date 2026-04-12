# Tool Forge 开发文档

本文档面向项目的开发者与 AI 协作者，描述项目定位、技术栈、目录结构、模块规范与迭代流程。README 面向最终用户，不含本文件的内部信息。

---

## 1. 项目定位

**Tool Forge** 是一款跨平台桌面程序员工具箱，目标是：

- **覆盖广**：不侧重单一领域，长期沉淀为"一站式"开发者日常工具集合
- **轻量快**：单文件分发、启动秒开、常驻内存 < 150MB
- **一致的交互**：每一个工具都遵循相同的布局与操作习惯，降低心智负担
- **可扩展**：新增一个工具 = 新增一个独立前端路由 + 可选的后端处理器，互不干扰

区别于"功能堆砌"型工具箱，Tool Forge 更强调**工具之间交互一致、视觉统一、添加新工具成本低**。

---

## 2. 技术栈

| 层次       | 选型                                         |
| ---------- | -------------------------------------------- |
| 桌面框架   | Wails v2                                     |
| 后端语言   | Go 1.21+                                     |
| 前端框架   | React 18 + TypeScript 5                      |
| 构建工具   | Vite                                         |
| UI 组件    | shadcn/ui（基于 Radix UI）+ Tailwind CSS     |
| 状态管理   | Zustand                                      |
| 路由       | React Router v6                              |
| 代码编辑器 | Monaco Editor（按需引入）                    |
| 图标       | lucide-react                                 |

**为什么是这套：**

- **Wails** 对 Go 原生绑定，打包体积 10-20MB，比 Electron 省一个数量级
- **React + TS** 生态最成熟，shadcn/ui 直接把组件源码 copy 到项目里，可完全定制
- **Tailwind** 保证多工具视觉统一，避免每个工具独写 CSS
- **Zustand** 替代 Redux/Pinia，零样板，工具箱场景足够

---

## 3. 目录结构

```
tool_forge/
├── main.go                      # Wails 入口
├── app.go                       # App 结构体，暴露给前端的统一入口
├── wails.json                   # Wails 配置
├── go.mod / go.sum
├── Makefile                     # 构建脚本
├── README.md                    # 面向用户
├── CLAUDE.md                    # 面向 AI 协作者的速查
├── docs/
│   ├── DEVELOPMENT.md           # 本文件
│   └── images/                  # 截图与素材
├── backend/
│   ├── tools/                   # 每个工具一个子包（见 §5）
│   │   ├── jsontool/
│   │   ├── base64tool/
│   │   └── ...
│   ├── system/                  # 系统能力（文件保存、更新检查、窗口等）
│   └── common/                  # 通用工具函数
└── frontend/
    ├── index.html
    ├── package.json
    ├── tailwind.config.ts
    ├── vite.config.ts
    ├── tsconfig.json
    └── src/
        ├── main.tsx             # React 入口
        ├── App.tsx              # 根组件 + 路由
        ├── layouts/
        │   └── MainLayout.tsx   # 左侧菜单 + 右侧工具区
        ├── components/
        │   ├── ui/              # shadcn/ui 生成的基础组件
        │   └── tool/            # 工具页通用壳：ToolHeader、ToolPanel ...
        ├── tools/               # 每个工具一个目录（见 §5）
        │   ├── json-format/
        │   │   ├── index.tsx
        │   │   ├── logic.ts
        │   │   └── meta.ts
        │   └── ...
        ├── profile/             # 个人主页（见 §13，一级页面，不走 tools 注册表）
        │   ├── index.tsx
        │   └── sections/        # 基础信息、AI 配置、偏好、关于 ...
        ├── stores/              # Zustand store
        │   ├── layout.ts        # 侧栏折叠、主题等
        │   ├── tools.ts         # 工具注册表、顺序、可见性
        │   └── profile.ts       # 个人信息 + AI 配置（加密持久化）
        ├── hooks/
        ├── lib/                 # 工具函数（cn、文件保存封装等）
        └── styles/
            └── globals.css
```

---

## 4. 架构与数据流

```
┌─────────────────────────────────────────────┐
│  React 前端（Vite dev server / 嵌入产物）   │
│  ├─ 左侧菜单（工具注册表 stores/tools.ts）  │
│  └─ 右侧工具页（tools/*/index.tsx）         │
└──────────────────┬──────────────────────────┘
                   │  Wails Binding（自动生成 TS 类型）
┌──────────────────┴──────────────────────────┐
│  Go 后端                                     │
│  app.go                                      │
│  └─ backend/tools/<name>  （纯函数处理器）  │
│  └─ backend/system        （文件、窗口、更新）│
└─────────────────────────────────────────────┘
```

**前后端职责划分：**

- **前端能独立完成就不走后端**。例如 JSON 格式化、进制转换、URL 编解码，直接用 JS 库或手写，避免一次不必要的 RPC 调用
- **需要系统能力或 Go 生态更强才走后端**。例如：原生保存对话框、二进制处理、JWT 签名验证、protobuf 解析、证书解析、调用本地命令
- 后端函数**必须是纯函数**（输入→输出），不持有状态，方便单测

---

## 5. 工具模块规范

### 5.1 新增一个工具的完整步骤

假设新增一个「JSON 格式化」工具：

**前端**

```
frontend/src/tools/json-format/
├── index.tsx      # 工具主组件（默认导出）
├── logic.ts       # 纯函数：format / minify / escape
├── meta.ts        # 工具元信息
└── examples.ts    # 示例数据
```

**meta.ts** 示例：

```ts
import { Braces } from 'lucide-react'
import type { ToolMeta } from '@/stores/tools'

export const meta: ToolMeta = {
  id: 'json-format',
  path: '/tools/json-format',
  title: 'JSON 格式化',
  description: '格式化、压缩、转义 JSON，支持对比模式',
  icon: Braces,
  category: 'data',         // 见 §5.2
  order: 10,
  defaultVisible: true,
}
```

**后端（可选）**：仅当需要 Go 处理时

```
backend/tools/jsontool/
└── jsontool.go    // func Format(input string) (string, error) 等纯函数
```

然后在 `app.go` 里导出：

```go
func (a *App) JSONFormat(input string) (string, error) {
    return jsontool.Format(input)
}
```

最后在 `frontend/src/stores/tools.ts` 的注册表里引入 `meta`，菜单和路由自动生效。

### 5.2 工具分类（category）

| category  | 含义              | 示例                                   |
| --------- | ----------------- | -------------------------------------- |
| `data`    | 数据结构化处理    | JSON/XML/YAML 编辑器、格式转换         |
| `codec`   | 编解码            | Base64、URL、Unicode、进制转换         |
| `crypto`  | 加解密与哈希      | MD5/SHA、AES、RSA、JWT                 |
| `time`    | 时间相关          | 时间戳、Cron 解析                      |
| `text`    | 文本处理          | 正则测试、文本对比、大小写转换         |
| `network` | 网络与 HTTP       | cURL 转换、IP 查询、UA 解析            |
| `gen`     | 生成类            | UUID、雪花 ID、二维码、Mock 数据       |
| `dev`     | 其他开发辅助      | 颜色转换、图片 Base64、代码片段        |

### 5.3 工具页统一壳

所有工具页**必须**使用通用壳组件，不要自己写 header：

```tsx
import { ToolShell } from '@/components/tool/ToolShell'

export default function JSONFormatTool() {
  return (
    <ToolShell
      title="JSON 格式化"
      actions={<>...顶部按钮...</>}
      onClear={() => ...}
      onLoadExample={() => ...}
    >
      {/* 内容区 */}
    </ToolShell>
  )
}
```

`ToolShell` 统一处理：标题栏、清空按钮、示例按钮、快捷键、错误提示。

---

## 6. UI / UX 规范

Tool Forge 走**现代留白**风格，和市面上紧凑型工具箱做区分。核心原则：

- **呼吸感 > 密度**：默认 16-20px 间距，不堆元素
- **单一主色**：整体中性灰调 + 一个品牌主色（待定，初期用 `zinc` + `indigo-500`）
- **无多余视觉装饰**：不用渐变、不用阴影特效，边框统一 `border-border`
- **深浅色主题必须同时支持**：通过 Tailwind `dark:` 前缀

### 6.1 颜色与间距

直接用 Tailwind 与 shadcn/ui 暴露的 CSS 变量，**不要硬编码颜色**：

```tsx
<div className="border border-border bg-background text-foreground">
```

### 6.2 工具页布局规范

```
┌────────────────────────────────────────────────┐
│ ToolShell Header (h-12)                        │
│ ├─ 标题                                         │
│ └─ 右侧操作区（示例/清空/复制/...）            │
├────────────────────────────────────────────────┤
│ 内容区（padding: 16px）                         │
│                                                 │
│   通常是左右两栏（输入/输出）                   │
│   或上下两栏（移动端 / 需求更宽时）             │
│                                                 │
└────────────────────────────────────────────────┘
```

- **自动处理**：输入变化即触发转换，不设置独立「转换」按钮
- **一致的快捷键**：`Ctrl/Cmd+K` 打开命令面板、`Ctrl/Cmd+,` 打开设置、`Esc` 清空焦点区
- **错误展示**：输入错误时在输出区标红提示，不弹窗

### 6.3 侧边栏

- 默认展开宽度 220px，可折叠到 56px（只剩图标）
- 工具按 category 分组，每组有标题
- 支持拖拽排序、隐藏

---

## 7. 状态管理约定

- **工具内部短暂状态**（如 textarea 当前内容）用 `useState`，不要塞 store
- **跨页面要保留的状态**（如用户上次输入的 JSON）放 Zustand store，按工具分 slice
- **全局偏好**（主题、侧栏折叠、工具顺序/可见性）放 `stores/layout.ts` + `stores/tools.ts`，持久化到 localStorage

---

## 8. 前后端通信约定

- 所有后端方法挂在 `App` 结构体上，命名：`<动词><名词>`，如 `JSONFormat`、`JWTDecode`
- 错误统一返回 `(result, error)`，前端用 `try/catch` 捕获
- 绑定生成：修改 Go 方法后运行 `wails generate module`
- **不要**在后端做 UI 提示，后端只返回数据或错误

---

## 9. 构建与发布

| 命令                      | 用途                         |
| ------------------------- | ---------------------------- |
| `wails dev`               | 开发模式，前端热重载         |
| `wails build`             | 当前平台生产构建             |
| `make build-win`          | Windows amd64                |
| `make build-mac`          | macOS universal              |
| `make build-win-dev`      | 带 devtools 的调试版         |

产物在 `build/bin/`。版本号维护在 `wails.json` 的 `info.productVersion`。

---

## 10. 初始工具路线图（Phase 0）

MVP 先实现以下 6 个，用来把框架、工具壳、菜单、主题、保存等基础设施跑通：

1. JSON 格式化 / 压缩 / 转义
2. Base64 文本编解码
3. URL 编解码
4. 时间戳转换
5. UUID / 雪花 ID 生成
6. 进制转换

第二批（Phase 1）：

- 正则表达式测试
- JWT 解析
- 哈希计算（MD5/SHA1/SHA256/SHA512）
- 二维码生成
- cURL 转多语言代码
- 颜色转换

第三批（Phase 2）：

- JSON ↔ Go Struct
- JSON ↔ YAML ↔ TOML
- Cron 表达式解析
- 文本对比（Monaco Diff）
- 图片 Base64
- Mock 数据生成

---

## 11. 提交与协作

- 提交信息格式：`<type>: <message>`，type 取自 `feat / fix / refactor / docs / chore / style`
- 新增一个工具一个独立 commit，便于回溯
- PR / commit 描述需要说明「动机」而非仅「做了什么」

---

## 13. 个人主页（Profile）

**Profile 是独立于工具集的一级页面**，入口放在左侧菜单底部（头像 / 齿轮图标），路由 `/profile`，不进入工具注册表。

### 13.1 定位

个人主页是后续 AI 能力落地的配置中心。**当前阶段只搭骨架与基础信息页，AI 相关 section 留占位。**

### 13.2 预留 section 规划

```
Profile
├── 基础信息        # 昵称、头像、主题偏好（已可实现）
├── AI 配置（预留）  # 模型提供方、API Key、自定义 endpoint、默认模型、温度等
├── AI 用量（预留）  # 本地记账、按工具统计调用次数 / token
├── 工具偏好        # 工具顺序、可见性、默认展开状态（与 stores/tools.ts 联动）
├── 数据            # 导入 / 导出配置、清空本地数据
└── 关于            # 版本、开源协议、检查更新
```

### 13.3 敏感数据存储

AI Key 这类敏感数据**不能明文存 localStorage**。方案：

- 通过 Wails 后端写入操作系统凭据库：Windows 用 `wincred`、macOS 用 Keychain、Linux 用 Secret Service（统一用 `github.com/zalando/go-keyring`）
- 前端只持有**脱敏展示值**（如 `sk-****abcd`）与"是否已配置"标志
- 实际调用 AI 时由后端从凭据库读取后转发请求，Key 永不暴露到前端

### 13.4 AI 能力后续落地方式（路线预设）

AI 不是独立工具，而是作为**现有工具的增强**存在。例如：

- 正则工具 → 「自然语言生成正则」按钮
- JSON 工具 → 「根据描述生成示例 JSON」
- cURL 转换 → 「解释这个请求在做什么」
- 文本对比 → 「总结两段差异」

每个工具页检测 `profile.ai.configured === true` 时才显示 AI 增强入口，未配置时按钮置灰并引导到 `/profile` 的 AI 配置 section。

### 13.5 当前阶段 TODO

- [ ] 左侧菜单底部入口 + 路由 `/profile`
- [ ] Profile 页壳 + 侧边 section 导航
- [ ] 基础信息 section（昵称、头像、主题）
- [ ] 其余 section **只放占位卡片 + 「即将推出」标签**，不写具体逻辑

---

## 14. 待决定事项

- [ ] 品牌主色最终定板
- [ ] 图标与 logo 设计
- [ ] 是否内置插件系统（允许用户通过脚本新增工具）
- [ ] 自动更新服务器地址
