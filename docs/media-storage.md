# 媒体存储：开源版与商业版边界

## 结论

| 版本 | 存储形态 | 部署假设 |
|------|----------|----------|
| **开源 / 免费版**（`@pugying/content` 内置） | 本机目录 `MEDIA_STORAGE_DIR` | **单实例**（单进程 / 单 Pod） |
| **商业版**（规划 `@pugying/media-storage-pro`） | 共享卷或 S3 兼容对象存储 | **多副本**（K8s 多 Pod 等） |

开源版不保证多 Pod 下分片上传与下载的正确性；商业版通过替换 `IMediaStorage` 实现提供高阶支持，**不修改**开源包源码。

---

## 开源版行为（现状）

路径约定（相对 `MEDIA_STORAGE_DIR`）：

```
_uploads/<uploadId>/     # 分片上传会话（临时）
  meta.json
  chunk-0 …
{teamId}/{kind}/{uuid}   # 成品资产
```

- `uploadId` / 成品文件名均为 UUID，仅会话或存储键，非对外分享语义。
- API 仍为 `/media/assets/{id}`；磁盘路径不对前端展示。
- 下载经服务端签名 URL 再读本地文件流。

**多 Pod 风险（开源版明确不支持）**：

1. init / chunk / complete 打到不同 Pod → 会话目录缺失  
2. 成品在 A、下载在 B → 文件找不到  
3. Pod 重建 → 本地文件丢失  

同理：开源版 **SQLite 本地文件** 亦不适合多副本写；高可用数据库属商业/运维范畴，不在本文件展开。

---

## 扩展点（开源钩子）

`@pugying/content` 定义存储后端接口（对齐 `ITeamMembershipLookup` 模式）：

- Token：`MEDIA_STORAGE`（`IMediaStorage`）
- 默认实现：`LocalMediaStorage`（本机目录，已由 `ContentModule` 注入）
- 商业包：宿主使用 `ContentModule.register({ mediaStorage: S3MediaStorage })`，**不得改**开源源码

`MediaService` 只依赖接口：会话 CRUD、分片读写、成品读写、孤儿会话清理。签名校验与资产元数据（TypeORM）仍留在开源 `MediaService`。

接口源码：`backend/libs/content/src/domain/repositories/media-storage.ts`  
本机实现：`backend/libs/content/src/infrastructure/local/local-media-storage.ts`

---

## 商业版规划（`@pugying/media-storage-pro`）

### 能力意向

| 阶段 | 能力 | 说明 |
|------|------|------|
| P1 | 共享卷后端 | 实现 `IMediaStorage`，根目录指向 RWX PVC；API 不变 |
| P1 | 对象存储后端 | S3 / MinIO / OSS；分片与成品进 bucket |
| P2 | 直出预签名 URL（可选） | Agent 直拉对象存储，减轻 API 带宽；需扩展签名/下载策略且保持开源 API 兼容或并行 |

### 装配约定

```text
商业包不得改 @pugying/content 源码
→ 依赖 @pugying/content 导出的 IMediaStorage / MEDIA_STORAGE / LocalMediaStorage
→ onModuleInit 中 CommercialModuleRegistry.registerFromModule(...)
→ 宿主：ContentModule.register({ mediaStorage: YourStorage }) 替代 ContentModule
```

开源宿主保持：

```typescript
imports: [ContentModule, ContentTypeOrmModule]
```

商业宿主示例：

```typescript
imports: [
  ContentModule.register({ mediaStorage: S3MediaStorage }),
  ContentTypeOrmModule,
  MediaStorageProModule,
]
```

### 环境变量（商业意向，实现时再固化）

| 变量 | 说明 |
|------|------|
| `MEDIA_STORAGE_DRIVER` | `local`（开源默认）/ `s3` / `shared-fs` 等 |
| `MEDIA_S3_ENDPOINT` / `MEDIA_S3_BUCKET` / `MEDIA_S3_*` | 对象存储连接 |
| （沿用）`MEDIA_STORAGE_DIR` | local / shared-fs 根路径 |

开源版可忽略 `MEDIA_STORAGE_DRIVER`；未装配 pro 包时行为等同 `local`。

---

## 非目标（开源版）

- K8s 多副本无共享存储的「尽力粘滞」方案（session affinity）不作为正式支持  
- 开源包内嵌 MinIO / 云厂商 SDK  
- 改变前端上传协议（仍为 `POST /media/uploads` 分片流）

---

## 迁移说明

`MediaService` 已改为只依赖 `IMediaStorage`；开源默认注入 `LocalMediaStorage`。  
行为与「单机本地盘」一致。商业包实现同一接口后通过 `ContentModule.register({ mediaStorage })` 替换。
