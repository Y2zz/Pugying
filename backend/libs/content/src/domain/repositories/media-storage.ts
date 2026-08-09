import type { Readable } from 'stream';
import type { MediaAssetKind } from '@pugying/content/domain/content-types';

/**
 * 分片上传会话元数据（开源本地盘与商业存储后端共用）。
 * 与 `_uploads/<id>/meta.json` 字段对齐。
 */
export interface MediaUploadSessionMeta {
  id: string;
  teamId: string;
  kind: MediaAssetKind;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  chunkSize: number;
  chunkCount: number;
  received: number[];
  createdAt: string;
}

/**
 * 媒体二进制存储后端。
 *
 * - 开源默认：本机目录（`MEDIA_STORAGE_DIR`），仅保证单实例。
 * - 商业版（规划 `@pugying/media-storage-pro`）：共享卷 / S3 兼容对象存储，支持多副本。
 *
 * Application（`MediaService`）只依赖本接口；签名、资产元数据仍由开源层负责。
 * 商业包通过覆盖 DI Token `MEDIA_STORAGE` 注入，不得改开源源码。
 *
 * @see docs/media-storage.md
 */
export interface IMediaStorage {
  /** 创建上传会话目录/对象前缀，并持久化 meta */
  initSession(meta: MediaUploadSessionMeta): Promise<void>;

  readSessionMeta(
    uploadId: string,
    teamId: string,
  ): Promise<MediaUploadSessionMeta>;

  writeSessionMeta(meta: MediaUploadSessionMeta): Promise<void>;

  putChunk(uploadId: string, index: number, data: Buffer): Promise<void>;

  readChunk(uploadId: string, index: number): Promise<Buffer>;

  removeSession(uploadId: string): Promise<void>;

  /**
   * 将分片合并（或等价地）写入成品对象。
   * `storageKey` 形如 `video/<uuid>`，由调用方生成；实现方不得改写语义。
   */
  writeAssetFromSession(input: {
    uploadId: string;
    teamId: string;
    storageKey: string;
    chunkCount: number;
    onChunk?: (chunk: Buffer) => void;
  }): Promise<void>;

  openAsset(
    teamId: string,
    storageKey: string,
  ): Promise<{ stream: Readable }>;

  /** 清理超过 maxAgeMs 的未完成会话；返回删除数量 */
  scrubStaleSessions(maxAgeMs: number): Promise<number>;
}

export const MEDIA_STORAGE = 'IMediaStorage';
