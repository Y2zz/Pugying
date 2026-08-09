# `@pugying/media-storage-pro`（规划 / 商业）

高阶媒体存储：在多副本（如 K8s 多 Pod）下提供可靠的分片上传与成品读写。

开源 `@pugying/content` 仅内置**本机目录**后端（单实例）。本包实现同一 `IMediaStorage` 接口并覆盖 DI，**不修改**开源源码。

## 状态

骨架占位。接口与边界见：

- [`docs/media-storage.md`](../../../docs/media-storage.md)
- [`@pugying/content` → `IMediaStorage`](../content/src/domain/repositories/media-storage.ts)

## 计划装配

```typescript
// 宿主 AppModule（示意）
imports: [
  ContentModule.register({ mediaStorage: S3MediaStorage }),
  ContentTypeOrmModule,
  MediaStorageProModule,
],
```

`MediaStorageProModule` 在 `onModuleInit` 中：

1. `CommercialModuleRegistry.registerFromModule(MediaStorageProModule)`
2. 导出可供 `ContentModule.register` 使用的 `IMediaStorage` 实现类

开源宿主继续 `imports: [ContentModule]`，默认 `LocalMediaStorage`。

## 非目标

- 不改前端上传协议  
- 不强迫开源用户引入对象存储依赖  
