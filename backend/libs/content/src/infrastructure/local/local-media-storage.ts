import { createWriteStream, promises as fs } from 'fs';
import type { FileHandle } from 'fs/promises';
import { join } from 'path';
import type { Readable } from 'stream';
import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  IMediaStorage,
  MediaUploadSessionMeta,
} from '@pugying/content/domain/repositories/media-storage';

/**
 * 开源默认媒体存储：本机目录（`MEDIA_STORAGE_DIR`），仅保证单实例。
 * @see docs/media-storage.md
 */
@Injectable()
export class LocalMediaStorage implements IMediaStorage {
  private readonly rootDir: string;

  constructor() {
    this.rootDir =
      process.env.MEDIA_STORAGE_DIR?.trim() ||
      join(process.cwd(), 'data', 'media');
  }

  private uploadsDir(): string {
    return join(this.rootDir, '_uploads');
  }

  private sessionDir(uploadId: string): string {
    return join(this.uploadsDir(), uploadId);
  }

  private assetPath(teamId: string, storageKey: string): string {
    return join(this.rootDir, teamId, storageKey);
  }

  async initSession(meta: MediaUploadSessionMeta): Promise<void> {
    const dir = this.sessionDir(meta.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(join(dir, 'meta.json'), JSON.stringify(meta), 'utf8');
  }

  async readSessionMeta(
    uploadId: string,
    teamId: string,
  ): Promise<MediaUploadSessionMeta> {
    const metaPath = join(this.sessionDir(uploadId), 'meta.json');
    let raw: string;
    try {
      raw = await fs.readFile(metaPath, 'utf8');
    } catch {
      throw new NotFoundException('上传会话不存在');
    }
    const meta = JSON.parse(raw) as MediaUploadSessionMeta;
    if (meta.teamId !== teamId) {
      throw new NotFoundException('上传会话不存在');
    }
    return meta;
  }

  async writeSessionMeta(meta: MediaUploadSessionMeta): Promise<void> {
    await fs.writeFile(
      join(this.sessionDir(meta.id), 'meta.json'),
      JSON.stringify(meta),
      'utf8',
    );
  }

  async putChunk(
    uploadId: string,
    index: number,
    data: Buffer,
  ): Promise<void> {
    const chunkPath = join(this.sessionDir(uploadId), `chunk-${index}`);
    await fs.writeFile(chunkPath, data);
  }

  async readChunk(uploadId: string, index: number): Promise<Buffer> {
    return fs.readFile(join(this.sessionDir(uploadId), `chunk-${index}`));
  }

  async removeSession(uploadId: string): Promise<void> {
    await fs.rm(this.sessionDir(uploadId), { recursive: true, force: true });
  }

  async writeAssetFromSession(input: {
    uploadId: string;
    teamId: string;
    storageKey: string;
    chunkCount: number;
    onChunk?: (chunk: Buffer) => void;
  }): Promise<void> {
    const finalPath = this.assetPath(input.teamId, input.storageKey);
    await fs.mkdir(join(finalPath, '..'), { recursive: true });

    await new Promise<void>((resolve, reject) => {
      const write = createWriteStream(finalPath);
      write.on('error', reject);
      write.on('finish', () => {
        resolve();
      });

      void (async () => {
        try {
          for (let i = 0; i < input.chunkCount; i += 1) {
            const chunk = await this.readChunk(input.uploadId, i);
            if (input.onChunk) {
              input.onChunk(chunk);
            }
            const ok = write.write(chunk);
            if (!ok) {
              await new Promise<void>((res) => {
                write.once('drain', () => {
                  res();
                });
              });
            }
          }
          write.end();
        } catch (err) {
          write.destroy();
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      })();
    });
  }

  async openAsset(
    teamId: string,
    storageKey: string,
  ): Promise<{ stream: Readable }> {
    const path = this.assetPath(teamId, storageKey);
    let handle: FileHandle;
    try {
      handle = await fs.open(path, 'r');
    } catch {
      throw new NotFoundException('资源文件不存在');
    }
    const stream = handle.createReadStream();
    stream.on('close', () => {
      void handle.close();
    });
    return { stream };
  }

  async scrubStaleSessions(maxAgeMs: number): Promise<number> {
    const root = this.uploadsDir();
    let removed = 0;
    let entries: string[];
    try {
      entries = await fs.readdir(root);
    } catch {
      return 0;
    }
    const cutoff = Date.now() - maxAgeMs;
    for (const name of entries) {
      const dir = join(root, name);
      const metaPath = join(dir, 'meta.json');
      try {
        const raw = await fs.readFile(metaPath, 'utf8');
        const meta = JSON.parse(raw) as MediaUploadSessionMeta;
        const created = Date.parse(meta.createdAt);
        if (!Number.isFinite(created) || created > cutoff) {
          continue;
        }
        await fs.rm(dir, { recursive: true, force: true });
        removed += 1;
      } catch {
        // ignore unreadable sessions
      }
    }
    return removed;
  }
}
