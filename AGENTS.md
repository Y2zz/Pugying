# Pugying —— 蒲公英 · 自媒体内容发布系统

## 项目背景

Pugying（蒲公英）是一套**私有化部署**的自媒体内容发布系统。其核心理念如同蒲公英的种子随风播撒——帮助运营团队将内容一次创作、多方分发，高效触达各大平台。

系统支持以下核心能力：

- **图文发布**：撰写富文本图文，一键推送至多个自媒体平台。
- **短视频发布**：上传视频素材并同步分发，覆盖主流短视频渠道。

目前已接入或规划接入的平台包括：

| 平台 | 内容形态 |
|------|----------|
| 抖音 | 图文、短视频 |
| 今日头条 | 图文 |
| 视频号 | 图文、短视频 |
| 哔哩哔哩 | 图文、短视频 |
| 小红书 | 图文、短视频 |

采用 **多团队（Multi-Team）** 架构设计，适合企业内部多团队或 SaaS 场景下同时为多个客户提供独立的内容管理和发布服务。数据完全存储在自有服务器上，满足企业对数据主权与安全合规的要求。

## 开源 / 商业边界

采用 **按模块包** 拆分（对齐 ABP 思路，用 NestJS 表达）：

| 包名 | 许可意向 | 说明 |
|------|----------|------|
| `@pugying/core` | 开源 | 框架层：多团队上下文、权限、审计/软删基类、UoW 接口、商业包注册钩子（**不含 ORM**） |
| `@pugying/identity` | 开源 | 用户、Role、JWT；含同包 `IdentityTypeOrmModule`（与 TypeORM 捆绑开发） |
| `@pugying/team-management` | 开源 | 团队 CRUD；含同包 `TeamManagementTypeOrmModule` |
| `@pugying/typeorm` | 开源 | TypeORM 框架层：Sqlite 连接、UoW 实现、团队查询过滤 |
| `@pugying/account-pro` | 商业 | 共享用户账户（一账号多团队、登录选团队、切换团队）；`CommercialModuleRegistry` 自注册 |
| `@pugying/platform-account` | 开源 | 平台账号绑定（抖音/头条/视频号/B 站/小红书）；Cookie 加密存储；含 `PlatformAccountTypeOrmModule` |
| `@pugying/content` | 开源 | 图文/短视频内容、分发 Target 状态机、团队媒体库（分片上传 + 签名下载）、发布编排 API；含 `ContentTypeOrmModule`；媒体二进制默认落**本机目录**（单实例） |
| `@pugying/media-storage-pro`（规划） | 商业 | 高阶媒体存储（共享卷 / S3 兼容对象存储），覆盖 `IMediaStorage`，支持 K8s 多 Pod |
| `@pugying/*-pro`（规划） | 商业 | 其它高阶能力（如高级发布、多平台适配等），宿主通过 `imports` 装配 |

商业包不得改开源源码；通过依赖 `@pugying/core` 的 `CommercialModuleRegistry` 自注册，并在宿主 `AppModule` 中与开源模块同级 `imports`。

媒体存储边界详见 [`docs/media-storage.md`](docs/media-storage.md)：开源版按单机本地盘设计；多副本与对象存储属商业版。

## 技术栈

| 层级 | 语言 | 框架 | 构建工具 |
|------|------|------|----------|
| Backend | TypeScript | NestJS 11 | Nest CLI |
| Frontend | TypeScript | React 19 | Vite 8 |
| Agent | TypeScript | Electron 36 + React 19（授权壳） | tsc + Vite 8 |

- **包管理器**: npm（**依赖版本必须固定精确号**，禁止 `^` / `~` / `>=` 等模糊范围）
- **测试框架**: Jest (backend), Vitest (frontend / agent)
- **代码格式化**: Prettier
- **代码检查**: ESLint
- **CSS**: Tailwind CSS v4 + shadcn/ui（底层组件库为 Base UI，非 Radix UI）
- **字号**：对齐 **shadcn vega**——浏览器默认 **1rem = 16px**，不重映射 Tailwind 刻度；控件多为 `text-sm`（≈14px），正文继承 `text-base`。禁止业务层 `text-[Npx]`。详见 `.cursor/rules/frontend-typography.mdc`。

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

  **Backend（NestJS）—— 全部 kebab-case：**
  - 所有文件使用 kebab-case：`identity.controller.ts`、`create-user.dto.ts`、`team-management.service.ts`
  - 目录同样使用 kebab-case：`team-management/`、`application/dtos/`、`http/controllers/`
  - **实体主键必须使用 UUID**，禁止自增 int / bigint 等有序 ID。继承 `@pugying/core` 的 `Entity`（仅 id）、`AuditedEntity`（id + 审计时间）或 `SoftDeleteAuditedEntity`（含软删），不要自行声明主键字段

  **Frontend / Agent UI（React）—— 组件 PascalCase，其他 kebab-case：**
  - **组件文件**（导出 React 组件的 `.tsx` 文件）使用 PascalCase：`AppLayout.tsx`、`Dashboard.tsx`、`AuthToolbar.tsx`
  - **非组件文件**（hooks, utils, 配置, 样式, 入口等）使用 kebab-case：`use-mobile.ts`、`utils.ts`、`router.tsx`、`main.tsx`
  - **`components/ui/` 目录例外**：shadcn/ui 生成的组件保持其原始 kebab-case 命名，不得修改。
  - Agent 授权壳源码在 `agent/ui/`，构建产物在 `agent/ui-dist/`。

  | 文件类型 | 命名风格 | 示例 |
  |---------|---------|------|
  | NestJS 所有文件 | kebab-case | `identity.controller.ts`, `create-user.dto.ts` |
  | React 组件文件 | PascalCase | `AppLayout.tsx`, `Dashboard.tsx` |
  | React 非组件文件 | kebab-case | `use-mobile.ts`, `router.tsx` |
  | shadcn/ui 组件 | kebab-case（不可改） | `button.tsx`, `dropdown-menu.tsx` |

- **禁止修改 shadcn/ui 组件**：`frontend/src/components/ui/` 与 `agent/ui/src/components/ui/` 目录下的所有文件均为 shadcn/ui 生成的组件代码，**严禁直接修改**。此规则旨在确保组件行为与官方实现保持一致，便于后续通过 CLI 进行升级和维护。

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

每个可发布业务模块放在 `backend/libs/<module>/`，目录约定：

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
- **权限命名**：`<Module>.<Group>.<Action>`，例如 `Identity.Users.Create`、`TeamManagement.Teams.View`
- **权限注册**：模块 `onModuleInit` 中调用 `PermissionRegistry.register(...)`
- **授权**：接口使用 `@RequirePermission(...)`；全局 `JwtAuthGuard` + `PermissionGuard`
- **公开接口**：使用 `@Public()` 跳过 JWT（如 `/account/login`）
- **多团队**：请求头 `X-Team-Id`；由 `TeamMiddleware` 校验团队存在且启用后写入 `CurrentTeam`；JWT 与 header 一致性由 `TeamConsistencyGuard` 校验
- **新增模块**：新建 `libs/<name>`（domain + application + `infrastructure/typeorm`）→ 更新 `tsconfig` paths / `nest-cli.json` → 宿主同时 `imports` 业务模块与 `*TypeOrmModule`

## 项目结构

```
Pugying/
├── backend/                  # NestJS 后端
│   ├── src/
│   │   ├── main.ts           # 入口，ValidationPipe / CORS / Swagger Bearer
│   │   ├── app.module.ts     # 装配 Core + Sqlite + *TypeOrm + 业务模块
│   │   └── database/
│   │       └── migrations/   # TypeORM 迁移文件
│   ├── libs/                 # 可发布模块包 (monorepo)
│   │   ├── core/             # @pugying/core 框架层
│   │   ├── identity/         # 用户、Role + infrastructure/typeorm
│   │   ├── team-management/  # 团队 + infrastructure/typeorm
│   │   ├── account-pro/      # 商业：共享用户账户
│   │   ├── platform-account/ # 平台账号绑定 + 加密凭证
│   │   ├── content/          # 内容 CRUD + 媒体库 + 发布编排
│   │   ├── media-storage-pro/# 商业（规划）：多副本 / 对象存储媒体后端
│   │   └── typeorm/          # @pugying/typeorm 连接 + UoW + 团队过滤
│   ├── test/                 # E2E 测试
│   ├── nest-cli.json
│   └── package.json
├── docs/
│   └── media-storage.md      # 媒体存储开源/商业边界与 IMediaStorage 约定
├── frontend/                 # React 前端（业务区 + /admin 管理区，同 SPA）
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── router.tsx        # /login、业务路由、/admin/*
│   │   ├── pages/            # Login, Home, Dashboard, admin/*
│   │   ├── components/
│   │   │   ├── ui/           # shadcn/ui 组件
│   │   │   └── layouts/      # AppLayout / AdminLayout
│   │   ├── hooks/            # use-team, use-agent
│   │   └── lib/              # api.ts, agent-client.ts
│   ├── vite.config.ts
│   └── package.json
├── agent/                    # 独立 Electron 桌面 Agent（本机 WS 中介）
│   ├── electron/main/        # 主进程 TypeScript（托盘 / WS / 授权 / 发布）
│   │   ├── index.ts
│   │   ├── ws-server.ts      # ws://127.0.0.1:3927
│   │   ├── protocol.ts
│   │   ├── publish-job.ts    # platform.publish.* 单任务
│   │   ├── platforms/        # 抖音等适配（含 publish-douyin）
│   │   └── auth-browser.ts   # 授权窗：React chrome + WebContentsView
│   ├── ui/                   # 授权壳 React（Vite + Tailwind + shadcn）
│   ├── chrome/preload.js     # chromeShell IPC bridge
│   ├── ui-dist/              # UI 构建产物
│   └── package.json
└── AGENTS.md                 # 本文件
```

## 架构说明

- **多团队架构**: 共享用户账户策略——User 全局唯一，通过 `team_user` membership 加入多个团队；登录可选/切换团队。请求头 `X-Team-Id` 须与 JWT `teamId` 一致。
- **实体主键**: 全部使用 **UUID**（禁止自增 int 等有序 ID）；外键如 `teamId` 同为 UUID。
- **软删除**: 实体继承 `SoftDeleteAuditedEntity`（`deletedAt`）；仓储使用 softRemove。
- **权限**: 团队内 Role 权限 ∪ membership `extraPermissions` 并集写入 JWT。
- **数据库**: SQLite（better-sqlite3），文件 `pugying.db` 自动生成在 backend 目录。
- **表命名**: 单数形式，如 `account`、`team`、`role`、`user_role`、`team_user`。
- **鉴权**: JWT Bearer；登录入口 `POST /account/login`；开发种子：
  - `admin@pugying.local` / `Admin123!`（加入 **default** + **demo**，可测选团队/切换）
  - `editor@pugying.local` / `Editor123!`（仅 **demo**）
- **API 文档**: Swagger UI 挂载在 `/api` 路径（支持 Bearer Auth）。
- **路径别名**: Backend 使用 `@pugying/core`、`@pugying/identity`、`@pugying/team-management`、`@pugying/account-pro`、`@pugying/platform-account`、`@pugying/content`、`@pugying/typeorm`（及对应深路径）；Frontend / Agent UI 使用 `@/` 映射到各自 `src/`（Agent 为 `ui/src/`）。
- **Import 约定**: 跨目录引用优先用别名（如 `@pugying/identity/domain/entities/user.entity`、`@/components/ui/button`）；同目录 `./` 相对路径可保留。`index.ts` 桶文件对外导出可用相对路径。
- **ORM 边界**: `@pugying/core` 与 Application 层不依赖 TypeORM；映射/仓储与业务模块同包的 `infrastructure/typeorm` 捆绑开发；`@pugying/typeorm` 提供连接与 UoW。
- **管理 UI**: 与业务前端同 SPA；`/admin/*` 使用独立 `AdminLayout`（GitLab 式分区）。入口在用户菜单「管理」；持有任一 `TeamManagement.*` 权限可进入，否则回 `/dashboard`。
- **桌面 Agent**: 独立 Electron 应用（`agent/`），浏览器经 `ws://127.0.0.1:3927` 连接；**无状态**（不落盘 Cookie/凭证/业务数据）；平台授权使用 React + shadcn 浏览壳 + per-request ephemeral `session` partition（`temp:auth-{requestId}`），禁止 `defaultSession`，防多账号串号。权威状态在服务端。授权壳「更多」菜单与操作指引用同窗顶层 `WebContentsView` 叠在平台页之上（平台页 bounds/可见性不变）。首次打开有可跳过引导；分步气泡可「不再提示」（偏好写入 Electron `userData/agent-prefs.json`，不含平台凭证）。
- **媒体账号**: `@pugying/platform-account`；主菜单「媒体账号」（UI 文案用「媒体账号」，代码/路由/模块名保留 platform-account）；Agent 授权后 Cookie AES-GCM 加密入库（`PLATFORM_CREDENTIAL_SECRET`，缺省回退 `JWT_SECRET`）；列表接口不返回凭证明文。
- **内容与发布（P0 抖音短视频）**: `@pugying/content`；侧栏「发布 → 发布视频」为本机选 MP4 + 裁剪封面 → 分片入团队库 → `POST /contents/:id/publish` 下发签名 URL/Cookie → **浏览器**串行调本机 Agent `platform.publish.*`（后端不直连 Agent）。Target 运行态 `idle|queued|running|succeeded|failed|cancelled`；部分成功可重试；已有 queued/running 拒绝再发。发布会话用 `temp:publish-*` ephemeral（非 `persist:account-*`）。Contents 仅回看/重试，不做「改 status=published」假发布。
- **团队媒体库**: `POST /media/uploads` 分片；视频 MP4≤1GB（可配）；竖封面 3:4 必填、横 16:9 可选（用户侧裁剪）；`POST /media/assets/:id/signed-url` + 公开 `GET .../download?exp&sig` 供 Agent 拉取。签名 Host 取 `MEDIA_PUBLIC_BASE_URL`（部署时须对本机 Agent 可达，勿默认不可达的 localhost）。启动时清理过期未完成上传会话。
- **媒体存储部署**: 开源默认 `LocalMediaStorage`（`MEDIA_STORAGE_DIR` 本机盘），**仅单实例**；扩展点 `IMediaStorage`（`MEDIA_STORAGE`）。商业宿主用 `ContentModule.register({ mediaStorage })` 替换。详见 [`docs/media-storage.md`](docs/media-storage.md)。

## 支撑服务

- **主数据库**: SQLite (better-sqlite3)，无外部数据库依赖（开源版按单实例；多副本数据库不在免费版范围）。

## 常用命令

### Backend

| 任务 | 命令 |
|------|------|
| 启动开发服务器 | `cd backend && npm run start:dev` |
| 构建 | `cd backend && npm run build` |
| 生产启动 | `cd backend && npm run start:prod` |
| 单元测试 | `cd backend && npm test` |
| E2E 测试 | `cd backend && npm run test:e2e` |
| 代码检查 | `cd backend && npm run lint` |
| 代码格式化 | `cd backend && npm run format` |
| 生成迁移 | `cd backend && npm run migration:generate` |
| 执行迁移 | `cd backend && npm run migration:run` |
| 回滚迁移 | `cd backend && npm run migration:revert` |

### Frontend

| 任务 | 命令 |
|------|------|
| 启动开发服务器 | `cd frontend && npm run dev` |
| 构建 | `cd frontend && npm run build` |
| 预览构建产物 | `cd frontend && npm run preview` |
| 单元测试 | `cd frontend && npm test` |
| 类型检查 | `cd frontend && npm run typecheck` |
| 代码检查 | `cd frontend && npm run lint` |
| 代码格式化 | `cd frontend && npm run format` |

### Agent

| 任务 | 命令 |
|------|------|
| 启动桌面 Agent | `cd agent && npm run dev` |
| 单元测试 | `cd agent && npm test` |
| 构建（UI + 主进程） | `cd agent && npm run build` |
| 仅构建 UI | `cd agent && npm run build:ui` |
| 仅构建主进程 | `cd agent && npm run build:main` |
| 类型检查 | `cd agent && npm run typecheck` |

> 说明：`npm run dev` / `start` 会清除环境变量 `ELECTRON_RUN_AS_NODE`（Cursor 等 IDE 可能注入该变量，导致 Electron API 不可用）。Agent UI 使用 Vite + React 19 + Tailwind v4 + shadcn（`base-nova`），与主站视觉对齐但独立依赖。

## 端口

- **3000**: Backend API 服务及 Swagger 文档（`http://localhost:3000/api`）
- **5173**: Frontend Vite 开发服务器（默认）
- **3927**: 桌面 Agent 本机 WebSocket（仅 `127.0.0.1`，`ws://127.0.0.1:3927`）

## 环境变量

使用 `.env` 文件配置：

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` / `BACKEND_PORT` | `3000` | Backend 监听端口 |
| `JWT_SECRET` | `pugying-dev-secret-change-me` | JWT 签名密钥（生产必须覆盖） |
| `PLATFORM_CREDENTIAL_SECRET` | （回退 JWT_SECRET） | 平台账号 Cookie 加密密钥 |
| `MEDIA_PUBLIC_BASE_URL` | （回退 API_BASE_URL / 127.0.0.1） | Agent 拉媒体用的可达基址；生产/联调勿用不可达 localhost |
| `MEDIA_SIGNING_SECRET` | （回退 JWT_SECRET） | 媒体签名下载 HMAC 密钥 |
| `MEDIA_STORAGE_DIR` | `backend/data/media` | 团队库落盘目录（开源/单实例；多副本需商业存储或共享卷） |
| `MEDIA_MAX_VIDEO_BYTES` | `1073741824`（1GB） | 视频大小上限 |
| `VITE_API_BASE_URL` | `http://localhost:3000` | Frontend 直连 Backend API 基址 |
| `API_BASE_URL` | — | 部署时浏览器可达的 API 地址（构建/Compose 注入） |
| `CORS_ORIGINS` | — | 允许跨域的前端来源，逗号分隔 |
