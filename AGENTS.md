# Pugying —— 蒲公英 · 自媒体内容发布系统

## 项目背景

Pugying（蒲公英）是一套**个人单机桌面**自媒体内容发布系统。其核心理念如同蒲公英的种子随风播撒——帮助创作者将内容一次创作、多方分发，高效触达各大平台。

系统支持以下核心能力：

- **文章发布**：富文本正文（图片嵌在文中），分发至头条 / B 站专栏 / 抖音发文章等。
- **图文发布**：多图轮播 + 文案分离，分发至抖音图文 / 小红书 / 视频号图文等。
- **短视频发布**：上传视频素材并同步分发，覆盖主流短视频渠道。

目前已接入或规划接入的平台包括：

| 平台 | 内容形态 |
|------|----------|
| 抖音 | 文章、图文、短视频 |
| 今日头条 | 文章 |
| 视频号 | 图文、短视频 |
| 哔哩哔哩 | 文章（专栏）、短视频 |
| 小红书 | 图文、短视频 |

产品形态为 **单机一体桌面应用**（Desktop 托管本机 Server）：一套数据仅属于当前操作系统用户，不提供账号登录、团队、成员、角色或多机共享能力。

## 开源 / 商业边界

采用 **按模块包** 拆分（对齐 ABP 思路，用 NestJS 表达）：

| 包名 | 许可意向 | 说明 |
|------|----------|------|
| `@pugying/core` | 开源 | 框架层：审计/软删基类、UoW 接口、商业包注册钩子（**不含 ORM**） |
| `@pugying/typeorm` | 开源 | TypeORM 框架层：Sqlite 连接、UoW 实现 |
| `@pugying/platform-account` | 开源 | 平台账号绑定（抖音/头条/视频号/B 站/小红书）；Cookie 加密存储；含 `PlatformAccountTypeOrmModule` |
| `@pugying/content` | 开源 | 文章 / 图文 / 短视频内容、分发 Target 状态机、本机路径素材 + 封面 BLOB、发布编排 API；含 `ContentTypeOrmModule` |
| `@pugying/media-storage-pro`（已取消） | — | 原商业媒体存储规划已取消；见 `docs/media-storage.md` |
| `@pugying/*-pro`（规划） | 商业 | 其它高阶能力（如高级发布、多平台适配等），宿主通过 `imports` 装配 |

商业包不得改开源源码；通过依赖 `@pugying/core` 的 `CommercialModuleRegistry` 自注册，并在宿主 `AppModule` 中与开源模块同级 `imports`。

媒体与封面边界详见 [`docs/media-storage.md`](docs/media-storage.md)：视频/图片为本机绝对路径；封面 BLOB 落库；无独立媒体库。文章见 [`docs/publish-article.md`](docs/publish-article.md)；图文见 [`docs/publish-graphic.md`](docs/publish-graphic.md)。

## 技术栈

| 层级 | 语言 | 框架 | 构建工具 |
|------|------|------|----------|
| Server（本机 Nest） | TypeScript | NestJS 12 | Nest CLI |
| Desktop（桌面） | TypeScript | Electron 44 + React 19 | electron-vite 5 |

- **包管理器**: npm（**依赖版本必须固定精确号**，禁止 `^` / `~` / `>=` 等模糊范围）
- **测试框架**: Jest (server), Vitest (desktop)
- **代码格式化**: Prettier
- **代码检查**: ESLint
- **CSS**: Tailwind CSS v4 + shadcn/ui（底层组件库为 Base UI，非 Radix UI）
- **字号**：对齐 **shadcn vega**——浏览器默认 **1rem = 16px**，不重映射 Tailwind 刻度；控件多为 `text-sm`（≈14px），正文继承 `text-base`。禁止业务层 `text-[Npx]`。详见 `.cursor/rules/frontend-typography.mdc`。
- **用户可见文案**：界面 / Toast / 引导 / 错误提示须**克制**，不暴露实现细节（错误码、HTTP/DOM、抓包等），通俗易懂、能一句则一句。详见 `.cursor/rules/user-facing-copy.mdc`。

## 编码规范

- **依赖版本固定**：所有 `package.json`（含 `dependencies` / `devDependencies` / `peerDependencies`）必须使用精确版本（如 `11.1.28`），禁止 `^11.0.0`、`~1.2.3`、`>=0.3.0` 等范围写法。
- **禁止省略大括号**：所有控制流语句（`if`、`for`、`while`、`else` 等）的 body 必须用 `{}` 包裹，即使只有一行代码也不得省略。

```typescript
// ❌ 禁止
if (condition) doSomething();

// ✅ 正确
if (condition) {
  doSomething();
}
```

- **文件命名规范**：按各框架惯例分别处理，保持项目内一致。

  **Server（NestJS）—— 全部 kebab-case：**
  - 所有文件使用 kebab-case：`identity.controller.ts`、`create-user.dto.ts`、`team-management.service.ts`
  - 目录同样使用 kebab-case：`team-management/`、`application/dtos/`、`http/controllers/`
  - **实体主键必须使用 UUID**，禁止自增 int / bigint 等有序 ID。继承 `@pugying/core` 的 `Entity`（仅 id）、`AuditedEntity`（id + 审计时间）或 `SoftDeleteAuditedEntity`（含软删），不要自行声明主键字段

  **Desktop UI（React）—— 组件 PascalCase，其他 kebab-case：**
  - **组件文件**（导出 React 组件的 `.tsx` 文件）使用 PascalCase：`AppLayout.tsx`、`Dashboard.tsx`、`AuthToolbar.tsx`
  - **非组件文件**（hooks, utils, 配置, 样式, 入口等）使用 kebab-case：`use-mobile.ts`、`utils.ts`、`router.tsx`、`main.tsx`
  - **`components/ui/` 目录例外**：shadcn/ui 生成的组件保持其原始 kebab-case 命名，不得修改。
  - 业务 UI 在 `desktop/frontend/`；授权窗 UI 在 `desktop/auth/`。

  | 文件类型 | 命名风格 | 示例 |
  |---------|---------|------|
  | NestJS 所有文件 | kebab-case | `identity.controller.ts`, `create-user.dto.ts` |
  | React 组件文件 | PascalCase | `AppLayout.tsx`, `Dashboard.tsx` |
  | React 非组件文件 | kebab-case | `use-mobile.ts`, `router.tsx` |
  | shadcn/ui 组件 | kebab-case（不可改） | `button.tsx`, `dropdown-menu.tsx` |

- **禁止修改 shadcn/ui 组件**：`desktop/frontend/components/ui/` 与 `desktop/auth/components/ui/` 目录下的所有文件均为 shadcn/ui 生成的组件代码，**严禁直接修改**。此规则旨在确保组件行为与官方实现保持一致，便于后续通过 CLI 进行升级和维护。

  **禁止的操作：**
  - 直接编辑 `components/ui/*.tsx` 文件中的任何代码。
  - 修改组件的内部逻辑、props 接口、默认样式或 DOM 结构。
  - 在 UI 组件文件中添加业务逻辑或自定义功能。

  **允许的自定义方式：**
  1. **通过 props 覆盖**：在使用组件时通过 `className`、`variant`、`size` 等 props 进行样式和行为调整。
  2. **封装业务组件**：基于 shadcn/ui 组件创建新的封装组件，放置在 `components/ui/` 以外的目录（如 `components/shared/` 或 `components/business/`）。
  3. **使用 CLI 重新生成**：如需重置组件到最新状态，使用 `npx shadcn@latest add <component> --overwrite`。
  4. **CSS 变量和 Tailwind 主题**：通过修改 `globals.css` 或 Tailwind 配置来全局调整组件外观。

  **示例：**
  ```tsx
  // ❌ 禁止：直接修改 components/ui/button.tsx
  const Button = ({ variant = 'custom', ... }) => { ... }

  // ✅ 正确：在使用时通过 className 覆盖
  import { Button } from '@/components/ui/button'
  <Button className="bg-primary-500 hover:bg-primary-600">Click me</Button>

  // ✅ 正确：封装业务组件（components/shared/PrimaryButton.tsx）
  import { Button } from '@/components/ui/button'
  export const PrimaryButton = ({ children, ...props }) => (
    <Button className="bg-primary-500" {...props}>{children}</Button>
  )
  ```

## 后端模块规范（ABP 风格）

每个可发布业务模块放在 `server/libs/<module>/`，目录约定：

```
libs/<module>/
  package.json                 # name: @pugying/<module>
  src/
    index.ts                   # 对外公共 API（含 *TypeOrmModule 导出）
    <module>.module.ts         # 业务模块（application / http；不直接碰 TypeORM API）
    <module>.permissions.ts
    domain/entities/           # 纯领域实体（无 ORM 装饰器）
    domain/repositories/       # 接口 + Token
    application/dtos/
    application/services/
    infrastructure/
      jwt.strategy.ts          # 等非 ORM 适配
      typeorm/                 # 与本模块捆绑开发的 TypeORM 映射与仓储（ABP *.EfCore）
        *-typeorm.module.ts
        *.entity-schema.ts
        *.repository.ts
    http/controllers/

libs/typeorm/                  # @pugying/typeorm（对应 ABP EntityFrameworkCore 框架层）
  src/
    sqlite/                    # DB 提供方（better-sqlite3）
```

- **持久化装配**：宿主依次导入 `PugyingTypeOrmSqliteModule.forRoot` → 各模块 `*TypeOrmModule` → 业务模块；Application 只依赖仓储接口
- **开发手感**：选定 TypeORM 后，业务功能与同模块 `infrastructure/typeorm` 一起演进（与 ABP 一致）；`@pugying/core` 仍保持零 ORM
- **本机访问边界**：Electron 为每次本机 Server 启动生成随机令牌，并仅经 preload 注入业务 frontend；Server 仅监听 loopback。
- **数据隔离**：个人单机版没有用户、角色、团队或 teamId；所有业务数据均属于当前本机数据目录。
- **新增模块**：新建 `libs/<name>`（domain + application + `infrastructure/typeorm`）→ 更新 `tsconfig` paths / `nest-cli.json` → 宿主同时 `imports` 业务模块与 `*TypeOrmModule`

## 项目结构

```
Pugying/
├── server/                   # 本机 Nest Server（由 Desktop 托管生命周期）
│   ├── src/
│   │   ├── main.ts           # 入口，ValidationPipe / 本机 CORS / Swagger
│   │   ├── app.module.ts     # 装配 Core + Sqlite + *TypeOrm + 业务模块
│   │   └── database/
│   │       └── migrations/
│   ├── libs/                 # @pugying/* 模块包
│   ├── test/
│   └── package.json          # pugying-server
├── desktop/                  # 桌面应用（electron-vite）
│   ├── electron/main/        # 托盘 / 托管 Server / 授权 / 发布 / IPC
│   ├── electron/preload/     # app.ts（pugyingDesktop）+ index.ts（chromeShell）
│   ├── frontend/             # 业务 UI（React renderer）
│   ├── auth/                # 授权窗 UI renderer
│   ├── shared/               # IPC 信道约定
│   ├── scripts/pack-server.mjs
│   └── package.json          # pugying-desktop
├── docs/
│   ├── media-storage.md
│   └── publish-article.md   # 图文发布核心业务
└── AGENTS.md
```

## 架构说明

- **产品形态（单机一体）**: 用户只安装 **一个桌面应用**。Electron 发行版内附 Nest 产物；启动时由 main 嵌入本机 Server；数据落在 `app.getPath('userData')`。开发可用 `./start.sh`（外部 Server watch + Desktop）。
- **数据归属**: 本机数据库中的内容、媒体和平台账号均直接归属当前操作系统用户，没有用户、团队、成员或角色模型。
- **实体主键**: 全部使用 **UUID**。
- **软删除**: 实体继承 `SoftDeleteAuditedEntity`；仓储使用 softRemove。
- **数据库**: SQLite（better-sqlite3）；桌面端默认 `userData/server/pugying.db`（`PUGYING_DATABASE_PATH`）。
- **表命名**: 单数形式，如 `content`、`content_target`、`platform_account`。
- **访问**: 无登录页、密码、JWT 或业务权限体系；业务 frontend 仅经 Electron preload 获取本机临时令牌访问 Server。
- **API 文档**: Swagger UI 在 `/api`（默认 `http://127.0.0.1:3928/api`）。
- **路径别名**: Server 使用 `@pugying/*`；Desktop 业务 UI `@/` → `desktop/frontend`，授权窗 UI `@auth/` → `desktop/auth`。
- **桌面 Desktop**: 业务主窗经 **preload IPC（`pugyingDesktop`）** 调本机发布能力；授权窗 UI 经 `chromeShell` / `chrome:*` 隔离。平台授权使用 ephemeral session partition，禁止 `defaultSession`。权威状态在本机 Server。
- **媒体账号 / 内容发布**: 视频与图片存本机绝对路径（`mediaPaths`）；封面以 BLOB 落库；发布由桌面 UI 经 IPC 调 `platform.publish.*`，Agent 直读本机文件。

## 支撑服务

- **主数据库**: SQLite (better-sqlite3)，无外部数据库依赖（单机一体）。

## 常用命令

### 一键开发

| 任务 | 命令 |
|------|------|
| 启动 Server + Desktop | `./start.sh` |

### Server

| 任务 | 命令 |
|------|------|
| 启动开发服务器 | `cd server && npm run start:dev` |
| 构建 | `cd server && npm run build` |
| 单元 / E2E 测试 | `cd server && npm test` / `npm run test:e2e` |
| 迁移 | `cd server && npm run migration:run` |

### Desktop

| 任务 | 命令 |
|------|------|
| 启动桌面端 | `cd desktop && npm run dev`（需已起 Server，或设 `PUGYING_EXTERNAL_SERVER=1`） |
| 单元测试 | `cd desktop && npm test` |
| 构建 | `cd desktop && npm run build` |
| 打出本地安装包（macOS：DMG；含 Server） | `cd desktop && npm run package` |
| 仅打出目录包 | `cd desktop && npm run package:dir` |
| Docker 打 Linux x64 安装包（DEB / RPM） | `cd desktop && npm run docker:package:linux` |
| Docker（Wine）打 Windows x64（需 native prebuild） | `cd desktop && npm run docker:package:win` |
| 本机打 Linux / Windows 安装包（DEB / RPM、EXE） | `cd desktop && npm run package:linux` / `npm run package:win` |
| 类型检查 | `cd desktop && npm run typecheck` |

> `npm run dev` / `start` 会清除 `ELECTRON_RUN_AS_NODE`。发行版 **自带 Node**，终端用户无需安装 Node.js。

## 端口

- **3928**: 本机 Nest API / Swagger（`http://127.0.0.1:3928/api`）
- **5173**: electron-vite 开发 renderer（仅开发）

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `3928` | Server 监听端口 |
| `HOST` | `127.0.0.1` | Server 绑定地址 |
| `PUGYING_DATABASE_PATH` | （cwd `pugying.db` / 桌面 userData） | SQLite 路径 |
| `PLATFORM_CREDENTIAL_SECRET` | （桌面端自动生成；`./start.sh` 有开发缺省） | 平台 Cookie 加密密钥；开发态外部 Server 必须注入，否则无法解密已绑定账号 |
| `PUGYING_EXTERNAL_SERVER` | — | 开发时 Desktop 不嵌入 Server，只连接外部 Server |
| `PUGYING_API_BASE_URL` | — | 配合 EXTERNAL 指定 API 基址 |
| `PUGYING_FORCE_PLATFORM` | — | 开发态模拟窗口铬（`darwin` / `win32` / `linux`）；仅未打包生效 |
