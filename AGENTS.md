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

采用 **多租户（Multi-Tenant）** 架构设计，适合企业内部多团队或 SaaS 场景下同时为多个客户提供独立的内容管理和发布服务。数据完全存储在自有服务器上，满足企业对数据主权与安全合规的要求。

## 开源 / 商业边界

采用 **按模块包** 拆分（对齐 ABP 思路，用 NestJS 表达）：

| 包名 | 许可意向 | 说明 |
|------|----------|------|
| `@pugying/core` | 开源 | 框架层：多租户上下文、权限、审计基类、商业包注册钩子（**不含 ORM**） |
| `@pugying/identity` | 开源 | 用户、JWT 登录；含同包 `IdentityTypeOrmModule`（与 TypeORM 捆绑开发） |
| `@pugying/tenant-management` | 开源 | 租户 CRUD；含同包 `TenantManagementTypeOrmModule` |
| `@pugying/typeorm` | 开源 | TypeORM 框架层：连接提供方（如 Sqlite），对应 ABP `EntityFrameworkCore.*` |
| `@pugying/*-pro`（规划） | 商业 | 高阶能力（如高级发布、多平台适配等），宿主通过 `imports` 装配 |

商业包不得改开源源码；通过依赖 `@pugying/core` 的 `CommercialModuleRegistry` 自注册，并在宿主 `AppModule` 中与开源模块同级 `imports`。

## 技术栈

| 层级 | 语言 | 框架 | 构建工具 |
|------|------|------|----------|
| Backend | TypeScript | NestJS 11 | Nest CLI |
| Frontend | TypeScript | React 19 | Vite 8 |

- **包管理器**: npm（**依赖版本必须固定精确号**，禁止 `^` / `~` / `>=` 等模糊范围）
- **测试框架**: Jest (backend), 暂无 (frontend)
- **代码格式化**: Prettier
- **代码检查**: ESLint
- **CSS**: Tailwind CSS v4 + shadcn/ui（底层组件库为 Base UI，非 Radix UI）

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
  - 所有文件使用 kebab-case：`identity.controller.ts`、`create-user.dto.ts`、`tenant-management.service.ts`
  - 目录同样使用 kebab-case：`tenant-management/`、`application/dtos/`、`http/controllers/`
  - **实体主键必须使用 UUID**，禁止自增 int / bigint 等有序 ID。继承 `@pugying/core` 的 `Entity`（仅 id）或 `AuditedEntity`（id + 审计时间），不要自行声明主键字段

  **Frontend（React）—— 组件 PascalCase，其他 kebab-case：**
  - **组件文件**（导出 React 组件的 `.tsx` 文件）使用 PascalCase：`AppLayout.tsx`、`Dashboard.tsx`、`ThemeProvider.tsx`
  - **非组件文件**（hooks, utils, 配置, 样式, 入口等）使用 kebab-case：`use-mobile.ts`、`utils.ts`、`router.tsx`、`main.tsx`
  - **`components/ui/` 目录例外**：shadcn/ui 生成的组件保持其原始 kebab-case 命名，不得修改。

  | 文件类型 | 命名风格 | 示例 |
  |---------|---------|------|
  | NestJS 所有文件 | kebab-case | `identity.controller.ts`, `create-user.dto.ts` |
  | React 组件文件 | PascalCase | `AppLayout.tsx`, `Dashboard.tsx` |
  | React 非组件文件 | kebab-case | `use-mobile.ts`, `router.tsx` |
  | shadcn/ui 组件 | kebab-case（不可改） | `button.tsx`, `dropdown-menu.tsx` |

- **禁止修改 shadcn/ui 组件**：`frontend/src/components/ui/` 目录下的所有文件均为 shadcn/ui 生成的组件代码，**严禁直接修改**。此规则旨在确保组件行为与官方实现保持一致，便于后续通过 CLI 进行升级和维护。

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
- **权限命名**：`<Module>.<Group>.<Action>`，例如 `Identity.Users.Create`、`TenantManagement.Tenants.View`
- **权限注册**：模块 `onModuleInit` 中调用 `PermissionRegistry.register(...)`
- **授权**：接口使用 `@RequirePermission(...)`；全局 `JwtAuthGuard` + `PermissionGuard`
- **公开接口**：使用 `@Public()` 跳过 JWT（如登录）
- **多租户**：请求头 `X-Tenant-Id`；由 `TenantMiddleware` 写入 `CurrentTenant`（AsyncLocalStorage）
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
│   │   ├── identity/         # 业务 + infrastructure/typeorm
│   │   ├── tenant-management/# 业务 + infrastructure/typeorm
│   │   └── typeorm/          # @pugying/typeorm 连接提供方
│   ├── test/                 # E2E 测试
│   ├── nest-cli.json
│   └── package.json
├── frontend/                 # React 前端
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── router.tsx        # 含 /login 与 RequireAuth
│   │   ├── pages/            # Login, Home, Dashboard
│   │   ├── components/
│   │   │   ├── ui/           # shadcn/ui 组件
│   │   │   └── layouts/
│   │   ├── hooks/
│   │   └── lib/              # api.ts 等
│   ├── vite.config.ts        # @ 路径别名
│   └── package.json
├── agent/                    # Agent 相关 (预留)
└── AGENTS.md                 # 本文件
```

## 架构说明

- **多租户架构**: Tenant → User（一对多；表名仍为 `account`，实体类为 `User`），每个用户属于一个 Tenant。
- **实体主键**: 全部使用 **UUID**（禁止自增 int 等有序 ID）；外键如 `tenantId` 同为 UUID。
- **数据库**: SQLite（better-sqlite3），文件 `pugying.db` 自动生成在 backend 目录。
- **表命名**: 单数形式，如 `account`、`tenant`。
- **鉴权**: JWT Bearer；开发环境种子账号 `admin@pugying.local` / `Admin123!`
- **API 文档**: Swagger UI 挂载在 `/api` 路径（支持 Bearer Auth）。
- **路径别名**: Backend 使用 `@pugying/core`、`@pugying/identity`、`@pugying/tenant-management`、`@pugying/typeorm`（及对应 `@pugying/<pkg>/*` 深路径）；Frontend 使用 `@/` 映射到 `src/`。
- **Import 约定**: 跨目录引用优先用别名（如 `@pugying/identity/domain/entities/user.entity`、`@/components/ui/button`）；同目录 `./` 相对路径可保留。`index.ts` 桶文件对外导出可用相对路径。
- **ORM 边界**: `@pugying/core` 与 Application 层不依赖 TypeORM；映射/仓储与业务模块同包的 `infrastructure/typeorm` 捆绑开发；`@pugying/typeorm` 只提供连接（Sqlite 等）。

## 支撑服务

- **主数据库**: SQLite (better-sqlite3)，无外部数据库依赖。

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
| 类型检查 | `cd frontend && npm run typecheck` |
| 代码检查 | `cd frontend && npm run lint` |
| 代码格式化 | `cd frontend && npm run format` |

## 端口

- **3000**: Backend API 服务及 Swagger 文档（`http://localhost:3000/api`）
- **5173**: Frontend Vite 开发服务器（默认）

## 环境变量

使用 `.env` 文件配置：

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `3000` | Backend 监听端口 |
| `JWT_SECRET` | `pugying-dev-secret-change-me` | JWT 签名密钥（生产必须覆盖） |
| `VITE_API_BASE_URL` | `http://localhost:3000` | Frontend 直连 Backend API 基址 |
